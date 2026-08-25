import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv con prefijo '' lee también las vars sin VITE_: quedan solo en el
  // server de desarrollo, no se inyectan en el bundle del cliente.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:8000',
        '/health': 'http://localhost:8000',
        // Reporte semanal: pasa a ATV MKT y agrega la API key acá, del lado
        // del server. En producción esto lo hace el backend de Clients.
        '/mkt': {
          target: env.MKT_BASE_URL || 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mkt/, ''),
          headers: env.MKT_AGENT_KEY ? { 'X-Agent-Key': env.MKT_AGENT_KEY } : {},
        },
      },
    },
  }
})
