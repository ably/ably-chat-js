import { defineConfig } from 'vite';
import type { ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleTokenRequest } from './server/token-handler';

/**
 * Vite plugin that provides a local token server for Ably authentication.
 */
function ablyTokenServerPlugin() {
  return {
    name: 'ably-token-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/ably-token-request', handleTokenRequest);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ablyTokenServerPlugin()],
});
