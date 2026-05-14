import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase':['@supabase/supabase-js'],
          'vendor-query':   ['@tanstack/react-query', 'zustand'],
          'vendor-ui':      ['lucide-react', 'react-hot-toast', 'recharts'],
          'vendor-i18n':    ['i18next', 'react-i18next'],
          'vendor-forms':   ['react-hook-form', 'date-fns'],
          'vendor-ffmpeg':  ['@ffmpeg/ffmpeg'],
        },
      },
    },
  },
})
