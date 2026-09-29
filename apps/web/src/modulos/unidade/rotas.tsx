import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../comum/EmConstrucao'

export const rotasUnidade: RouteObject[] = [
  { path: '/unidade', element: <EmConstrucao titulo="Minha unidade" /> },
]
