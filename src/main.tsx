import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './data/backup'
import { useStore } from './data/store'
import './styles/index.css'

void useStore.getState().hydrate()

// ask the browser to keep IndexedDB under storage pressure; Safari decides for itself and may say no
void Promise.resolve()
  .then(() => navigator.storage?.persist?.())
  .catch(() => false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The single-file preview runs inside a sandboxed frame where service workers can't register.
if (import.meta.env.PROD && import.meta.env.VITE_PREVIEW !== '1' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
