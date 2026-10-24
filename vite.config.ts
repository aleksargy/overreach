import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_PREVIEW=1 builds a single self-contained bundle (no code splitting,
// fonts inlined) that scripts/inline-preview.mjs folds into one HTML file.
const preview = process.env.VITE_PREVIEW === '1'

export default defineConfig({
  plugins: [react()],
  // `npm run dev:api` serves the functions locally against a fake Garmin
  server: { proxy: { '/api': 'http://127.0.0.1:8788' } },
  base: preview ? './' : '/',
  build: preview
    ? {
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
        modulePreload: false,
        chunkSizeWarningLimit: 2000,
      }
    : { chunkSizeWarningLimit: 900 },
})
