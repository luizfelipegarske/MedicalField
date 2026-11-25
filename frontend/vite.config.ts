
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '')
      },
      '/api/records': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/records/, '')
      },
      '/api/docs': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/docs/, '')
      }
    }
  },

  // Duas aplicações independentes no mesmo build
  build: {
    rollupOptions: {
      input: {
        index: 'web.html',
        mobile: 'mobile.html'
      }
    }
  }
});

