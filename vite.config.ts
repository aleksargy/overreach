import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_PREVIEW=1 builds a single self-contained bundle (no code splitting,
// fonts inlined) that scripts/inline-preview.mjs folds into one HTML file.
const preview = process.env.VITE_PREVIEW === '1'

export default defineConfig({
  plugins: [react()],
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
