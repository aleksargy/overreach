import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_PREVIEW=1 builds a single self-contained bundle (no code splitting,
// fonts inlined) that scripts/inline-preview.mjs folds into one HTML file.
const preview = process.env.VITE_PREVIEW === '1'

/** Names the service worker's cache after a hash of everything the build ships. */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    writeBundle({ dir }) {
      const sw = dir && join(dir, 'sw.js')
      if (!sw || !statSync(sw, { throwIfNoEntry: false })) return
      const hash = createHash('sha256')
      for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort()) {
        const path = join(dir, file)
        if (file !== 'sw.js' && statSync(path).isFile()) hash.update(file).update(readFileSync(path))
      }
      writeFileSync(sw, readFileSync(sw, 'utf8').replace(`'overreach-__BUILD__'`, `'overreach-${hash.digest('hex').slice(0, 12)}'`))
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
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
