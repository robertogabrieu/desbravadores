import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../../comum/EmConstrucao'

export const rotasAdmDesbravadores: RouteObject[] = [
  { path: '/adm/desbravadores', element: <EmConstrucao titulo="Desbravadores" /> },
]
