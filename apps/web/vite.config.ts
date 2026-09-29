import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../..'), '')
  const portaApi = env['PORTA_API'] ?? '3001'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@desbravadores/shared': resolve(__dirname, '../../packages/shared/src/index.ts') },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://localhost:${portaApi}` },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/testes/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
