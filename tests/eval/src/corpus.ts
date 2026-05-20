import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { CorpusSample } from './types'

const CORPUS_DIR = resolve(import.meta.dir, '..', 'corpus')

/**
 * Load every `.jsonl` file under `tests/eval/corpus/`. Each line is one
 * {@link CorpusSample}. Lines starting with `//` or that are pure whitespace
 * are skipped (so corpus files can carry inline comments).
 *
 * Throws on the first parse error with a precise file + line pointer — a
 * malformed corpus should never silently shrink the eval.
 */
export function loadCorpus(dir: string = CORPUS_DIR): CorpusSample[] {
  const samples: CorpusSample[] = []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
  for (const file of files) {
    const path = join(dir, file)
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      if (!raw) continue
      const trimmed = raw.trim()
      if (trimmed.length === 0) continue
      if (trimmed.startsWith('//')) continue
      try {
        const sample = JSON.parse(trimmed) as CorpusSample
        validate(sample, `${file}:${i + 1}`)
        samples.push(sample)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`corpus parse error at ${file}:${i + 1}: ${message}`)
      }
    }
  }
  return samples
}

function validate(sample: CorpusSample, locator: string): void {
  if (typeof sample.id !== 'string' || sample.id.length === 0)
    throw new Error(`${locator}: missing/empty id`)
  if (typeof sample.category !== 'string' || sample.category.length === 0)
    throw new Error(`${locator}: missing/empty category`)
  if (typeof sample.input !== 'string' || sample.input.length === 0)
    throw new Error(`${locator}: missing/empty input`)
  if (!Array.isArray(sample.expected)) throw new Error(`${locator}: expected[] must be an array`)
  for (let i = 0; i < sample.expected.length; i++) {
    const e = sample.expected[i]
    if (!e) throw new Error(`${locator}: expected[${i}] is null`)
    if (typeof e.kind !== 'string') throw new Error(`${locator}: expected[${i}].kind missing`)
    if (typeof e.gist !== 'string') throw new Error(`${locator}: expected[${i}].gist missing`)
    if (!Array.isArray(e.mustInclude))
      throw new Error(`${locator}: expected[${i}].mustInclude must be an array`)
  }
}
