/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BANNER_REGISTRATION_URL?: string;
  readonly VITE_EXTENSION_INSTALL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
