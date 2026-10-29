import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // APA 2 is the default local and production app.
  // loadEnv is called with an empty prefix so non-VITE_ keys (DEV_API_TARGET,
  // DIST_DIR) are visible here as well. Only VITE_ keys reach the client bundle.
  const env = loadEnv(mode, process.cwd(), '');

  const apiTarget = env.DEV_API_TARGET || 'http://localhost:5005';
  const outDir = env.DIST_DIR || 'dist2';
  const devPort = Number(env.FRONTEND_PORT) || 4326;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Always bind the app's own port, whether or not --port was passed.
      port: devPort,
      strictPort: true,
      // Proxy API calls to this app's Node backend. In dev the browser uses the
      // relative path /api so the request never crosses the origin boundary.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: Number(env.PORT) || devPort,
      strictPort: true,
    },
  };
});
