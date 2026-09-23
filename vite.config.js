import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: {
        // Stable names, not hashed ones. A Webflow page hard-codes this URL in
        // an embed nobody will remember to update, so the filename has to
        // survive every deploy. vercel.json revalidates it instead of trusting
        // a hash to change, which is what pays for losing the hash.
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
