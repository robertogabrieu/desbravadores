import type { RouteObject } from 'react-router-dom'
import { Album } from './Album'
import { EnviarFotos } from './EnviarFotos'
import { Galeria } from './Galeria'

export const rotasGaleria: RouteObject[] = [
  { path: '/galeria', element: <Galeria /> },
  { path: '/galeria/enviar', element: <EnviarFotos /> },
  { path: '/galeria/:albumId', element: <Album /> },
]
