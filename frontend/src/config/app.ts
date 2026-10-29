// Per-app branding. The values come from the env file selected by the active
// Vite mode (.env.development / .env.production) keeps APA 2 branding consistent.
const readEnv = (key: string, fallback: string): string => {
  const value = (import.meta.env as unknown as Record<string, string | undefined>)[key];
  return value && value.trim() ? value.trim() : fallback;
};

/** Short product name shown in the navbar and headers. */
export const APP_BRAND = readEnv('VITE_APP_BRAND', 'DOSR');

/** Slightly longer name used where the full system name is needed. */
export const APP_NAME = readEnv('VITE_APP_NAME', 'DOSR');

/** Document title shown in the browser tab. */
export const APP_TITLE = readEnv('VITE_APP_TITLE', 'DOSR | APA');

/** Domain the app is served from, e.g. "apa2-eva.com". */
export const APP_DOMAIN = readEnv('VITE_APP_DOMAIN', '');

/** Base URL of the backend API for this app. */
export const API_BASE_URL = readEnv('VITE_API_BASE', '/api');
