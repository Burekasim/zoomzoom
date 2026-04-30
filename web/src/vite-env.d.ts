/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_USER_POOL_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
