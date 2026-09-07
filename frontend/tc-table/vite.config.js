import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'tc-vxe-table.js',
        chunkFileNames: 'tc-vxe-table-[name].js',
        assetFileNames: 'tc-vxe-table[extname]'
      }
    }
  }
})