import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Enable asset hashing for cache busting
    rollupOptions: {
      output: {
        // Add content hash to chunk names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  },
  // PWA-friendly settings
  server: {
    // Allow importing shared config from repo root (e.g., scripts/config/coachConstants.js)
    // and its transitive imports (functions/config/*)
    fs: {
      allow: [
        // parent of this project (repo root)
        path.resolve(__dirname, '..'),
        // functions directory for shared constants
        path.resolve(__dirname, '..', 'functions')
      ]
    },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  }
})
