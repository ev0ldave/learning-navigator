import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('@fullcalendar')) {
            return 'calendar-vendor';
          }
          if (id.includes('@mui/icons-material')) {
            return 'mui-icons-vendor';
          }
          if (id.includes('@mui/x-date-pickers')) {
            return 'mui-date-vendor';
          }
          if (id.includes('@emotion')) {
            return 'emotion-vendor';
          }
          if (id.includes('@mui/material')) {
            return 'mui-core-vendor';
          }
          if (id.includes('date-fns')) {
            return 'date-vendor';
          }
          if (id.includes('axios')) {
            return 'network-vendor';
          }

          return undefined;
        },
      },
    },
  },
});
