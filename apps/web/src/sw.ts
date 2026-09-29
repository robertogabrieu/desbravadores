import { clientsClaim } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

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
