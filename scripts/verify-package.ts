#!/usr/bin/env bun
/**
 * L3 of the publish pipeline (publint is L1). Catches the specific class of
 * bug that bit us on 2026-05-19:
 *   1. package.json fields pointing at paths not inside the published tarball
 *   2. workspace:* dep specifiers leaking into the published package.json
 *
 * Runs `npm pack --dry-run --json` (which performs the exact file-selection
 * npm would perform on `npm publish`), then asserts every path declared in
 * main / module / types / typings / exports / bin resolves to a file npm
 * intends to ship, and that no dependency block contains a workspace:* ref.
 * Exits non-zero on any mismatch.
 *
 * Usage: bun scripts/verify-package.ts <path-to-package-dir>
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

type PackedFile = { path: string; size?: number }
type PackResult = {
  name: string
  version: string
  filename?: string
  files?: PackedFile[]
}

function fail(pkgDir: string, errors: string[]): never {
  const banner = '━'.repeat(70)
  console.error(`\n${banner}\nverify-package FAILED: ${pkgDir}\n${banner}`)
  for (const err of errors) console.error(`  ✗ ${err}`)
  console.error('\nThe published tarball would reference files that are not inside it.')
  console.error('Fix the package.json so every main/types/exports/bin path lives under ./dist/.')
  process.exit(1)
}

function pass(pkgDir: string, name: string, version: string): void {
  process.stdout.write(
    `verify-package OK: ${name}@${version}  (${pkgDir})  — every declared path resolves inside the tarball\n`,
  )
}

function collectDeclaredPaths(pkg: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()
  const set = (origin: string, value: unknown): void => {
    if (typeof value !== 'string') return
    const normalised = value.startsWith('./') ? value.slice(2) : value
    out.set(origin, normalised)
  }
  set('main', pkg.main)
  set('module', pkg.module)
  set('types', pkg.types)
  set('typings', pkg.typings)
  if (pkg.bin && typeof pkg.bin === 'object') {
    for (const [k, v] of Object.entries(pkg.bin as Record<string, unknown>)) {
      set(`bin.${k}`, v)
    }
  } else if (typeof pkg.bin === 'string') {
    set('bin', pkg.bin)
  }
  const walk = (origin: string, node: unknown): void => {
    if (node == null) return
    if (typeof node === 'string') {
      set(origin, node)
      return
    }
    if (typeof node !== 'object') return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(`${origin}.${k}`, v)
    }
  }
  if (pkg.exports !== undefined) walk('exports', pkg.exports)
  return out
}

async function main(): Promise<void> {
  const pkgDirArg = process.argv[2] ?? '.'
  const pkgDir = resolvePath(pkgDirArg)
  const pkgJsonPath = resolvePath(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) {
    console.error(`verify-package: no package.json at ${pkgJsonPath}`)
    process.exit(2)
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>

  // Replicate npm's file-selection by invoking `npm pack --dry-run --json`.
  // Any other approach (reading `files`, walking the tree ourselves) will
  // miss npm's implicit-include behaviour (main, bin, exports paths get
  // auto-included even when not listed in `files`).
  const proc = Bun.spawn(['npm', 'pack', '--dry-run', '--json'], {
    cwd: pkgDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error(`verify-package: npm pack --dry-run failed:\n${stderr}`)
    process.exit(2)
  }

  const packResults = JSON.parse(stdout) as PackResult[]
  if (packResults.length === 0) {
    console.error('verify-package: npm pack returned no results')
    process.exit(2)
  }
  const [packResult] = packResults
  if (!packResult) {
    console.error('verify-package: npm pack returned no results')
    process.exit(2)
  }
  const packedFiles = new Set((packResult.files ?? []).map((f) => f.path.replace(/^\.\//, '')))
  if (packedFiles.size === 0) {
    fail(pkgDir, ['npm pack reported zero files in the tarball'])
  }

  const declared = collectDeclaredPaths(pkg)
  const errors: string[] = []
  for (const [origin, declaredPath] of declared) {
    if (!packedFiles.has(declaredPath)) {
      errors.push(
        `package.json field "${origin}" points to "./${declaredPath}" but that path is not inside the tarball npm would publish. Tarball contents:\n      ${[...packedFiles].sort().join('\n      ')}`,
      )
    }
  }

  // npm does not understand the `workspace:` protocol — if `workspace:*` (or
  // any `workspace:` ref) leaks into the published package.json, consumers
  // running `bun add @scope/pkg` will hit an invalid-version-specifier error.
  // pnpm and yarn rewrite these at pack time; npm does not. So we forbid
  // them outright in the tarball: replace with a real semver range.
  const checkDepBlock = (blockName: string): void => {
    const block = pkg[blockName]
    if (!block || typeof block !== 'object') return
    for (const [depName, spec] of Object.entries(block as Record<string, unknown>)) {
      if (typeof spec !== 'string') continue
      if (spec.startsWith('workspace:')) {
        errors.push(
          `${blockName}["${depName}"] = "${spec}". npm does not rewrite the workspace: protocol on publish, so this leaks into the registry. Replace with a real semver range (e.g. "^0.1.1") — Bun still resolves matching workspace members locally.`,
        )
      }
    }
  }
  for (const block of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    checkDepBlock(block)
  }

  if (errors.length > 0) fail(pkgDir, errors)
  pass(pkgDir, packResult.name, packResult.version)
}

void main()
