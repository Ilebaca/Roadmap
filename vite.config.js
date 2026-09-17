import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain SPA build. Output in /dist -> deploy that folder to Vercel/Cloudflare
// and embed the resulting URL in Webflow with a full-page iframe/code embed.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true }
})
