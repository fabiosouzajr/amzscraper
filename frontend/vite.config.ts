import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase', // allow kebab-case classes to be accessed as camelCase
    },
  },
  build: {
    chunkSizeWarningLimit: 600, // recharts is ~557 KB — isolated chunk, only loads on product detail
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory-vendor')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-is') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'vendor-i18n';
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_DEV_PORT || '5174', 10),
    allowedHosts: [
      'localhost',
      '.ts.net',
    ],
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  }
})

