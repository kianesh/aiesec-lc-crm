import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/graphql': {
        target: 'https://api.aiesec.org',
        changeOrigin: true,
        secure: true,
        headers: {
          'Origin': 'https://expa.aiesec.org',
          'Referer': 'https://expa.aiesec.org/',
        },
      },
      '/v2': {
        target: 'https://api.aiesec.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
