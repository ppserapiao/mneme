import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: false,
  clean: true,
  target: 'es2022',
  treeshake: true,
  deps: {
    neverBundle: [/^bun:/, /^node:/, '@mnemehq/sdk', '@mnemehq/protocol'],
  },
  fixedExtension: false,
})
