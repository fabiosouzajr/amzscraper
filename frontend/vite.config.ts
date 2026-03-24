import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600, // recharts is ~557 KB — isolated chunk, only loads on product detail
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces for Tailscale access
    port: 5174,
    allowedHosts: [
      'gozap.kiko-karat.ts.net',
      'localhost',
      '.ts.net', // Allow all Tailscale hostnames
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})

