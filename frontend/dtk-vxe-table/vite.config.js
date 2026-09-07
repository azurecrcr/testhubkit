import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: path.resolve(rootDir, '../../static/dist/dtk-vxe-table'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'dtk-vxe-table.js',
        chunkFileNames: 'dtk-vxe-table-[name].js',
        assetFileNames: 'dtk-vxe-table[extname]',
      },
    },
  },
})
