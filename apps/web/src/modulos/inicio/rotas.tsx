import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../comum/EmConstrucao'

export const rotasInicio: RouteObject[] = [
  { path: '/inicio', element: <EmConstrucao titulo="Início" /> },
]
