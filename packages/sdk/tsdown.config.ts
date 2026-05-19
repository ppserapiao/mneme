import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  deps: {
    neverBundle: [/^bun:/, /^node:/],
  },
  fixedExtension: false,
})
