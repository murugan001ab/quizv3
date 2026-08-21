import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/user': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/admin': {
        target: 'http://localhost:8000',
        // Only bypass (serve index.html) for browser navigation requests.
        // fetch/XHR calls must reach FastAPI — return undefined to proxy them.
        bypass(req) {
          const accept = req.headers['accept'] || ''
          if (accept.includes('text/html') && !accept.includes('application/json')) {
            return '/index.html'
          }
          // returning undefined (nothing) → Vite proxies the request to FastAPI
        },
      },
    },
  },
})
