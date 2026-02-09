import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})

