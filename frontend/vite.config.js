import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api and /uploads to the Express backend during dev.
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to 0.0.0.0 so phones on the same Wi-Fi can reach the dev server.
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
