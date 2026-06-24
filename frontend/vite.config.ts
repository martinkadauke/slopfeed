import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the backend on :3000. In prod the backend serves the
// built SPA from /public, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist' },
});
