/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PREVIEW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
