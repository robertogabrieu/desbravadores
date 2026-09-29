import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../../comum/EmConstrucao'

export const rotasAdmUnidades: RouteObject[] = [
  { path: '/adm/unidades', element: <EmConstrucao titulo="Unidades" /> },
]
