import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

// O DOM declara `self` como Window; aqui só existe o que o service worker usa.
declare const self: {
  __WB_MANIFEST: Array<PrecacheEntry | string>
  skipWaiting: () => Promise<void>
}

void self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Navegação cai no index.html (o roteador do front decide), menos /api: essa nunca é cacheada.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// As fontes vêm do Google sem `crossorigin` no CSS, então a resposta é opaca (status 0): sem aceitá-la não há cache.
const TRINTA_DIAS_EM_SEGUNDOS = 30 * 24 * 60 * 60
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'fontes-google',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: TRINTA_DIAS_EM_SEGUNDOS, maxEntries: 30 }),
    ],
  }),
)
