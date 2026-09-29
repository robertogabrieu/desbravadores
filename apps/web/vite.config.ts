import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../..'), '')
  const portaApi = env['PORTA_API'] ?? '3001'
  const emTeste = mode === 'test'

  return {
    plugins: [
      react(),
      // No Vitest o CSS não é processado e o service worker não existe.
      ...(emTeste
        ? []
        : [
            tailwindcss(),
            VitePWA({
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.ts',
              injectRegister: false,
              manifest: {
                name: 'Desbravador',
                short_name: 'Desbravador',
                lang: 'pt-BR',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                theme_color: '#1F4D3A',
                background_color: '#F4F1EA',
                icons: [
                  { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                  { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                  { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              injectManifest: { globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'] },
            }),
          ]),
    ],
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
