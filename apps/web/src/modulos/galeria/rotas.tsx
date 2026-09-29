import type { RouteObject } from 'react-router-dom'

// Provisório da onda 0 da 1b; o pacote B7 põe as telas.
export const rotasGaleria: RouteObject[] = [
  { path: '/galeria', element: null },
  { path: '/galeria/enviar', element: null },
  { path: '/galeria/:albumId', element: null },
]
