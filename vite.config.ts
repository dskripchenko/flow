import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: resolve(import.meta.dirname, 'tsconfig.vue.json'),
      entryRoot: resolve(import.meta.dirname, 'src'),
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.spec.ts', 'src/standalone/**'],
      // One declaration file per entry: no relative imports, so `nodenext` consumers resolve them too.
      bundleTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        mermaid: resolve(import.meta.dirname, 'src/mermaid/index.ts'),
        vue: resolve(import.meta.dirname, 'src/vue/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryAlias) => `${entryAlias}.${format === 'es' ? 'mjs' : 'cjs'}`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue', /^@dskripchenko\/ui($|\/)/, '@dskripchenko/diagrams'],
      // The core shared by both entries.
      output: {
        manualChunks: (id) => (id.includes('/src/') && !id.includes('/src/vue/') && !id.includes('/src/mermaid/') ? 'core' : undefined),
      },
    },
    minify: false,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
  },
})
