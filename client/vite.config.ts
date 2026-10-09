import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No data: URIs for assets: the server's CSP is font-src/img-src 'self'.
  build: { sourcemap: false, assetsInlineLimit: 0 },
  server: {
    proxy: {
      '/api': 'http://localhost:3080',
    },
  },
});
