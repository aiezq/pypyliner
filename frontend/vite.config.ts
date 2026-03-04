import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (id.includes('@tanstack/react-query') || id.includes('zustand')) {
            return 'vendor-state'
          }
          if (
            id.includes('react-hook-form') ||
            id.includes('@hookform/resolvers') ||
            id.includes('zod')
          ) {
            return 'vendor-forms'
          }
          if (
            id.includes('@hello-pangea/dnd') ||
            id.includes('react-resizable-panels')
          ) {
            return 'vendor-ui'
          }
          return 'vendor'
        },
      },
    },
  },
})
