import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../../comum/EmConstrucao'

export const rotasAdmUsuarios: RouteObject[] = [
  { path: '/adm/usuarios', element: <EmConstrucao titulo="Usuários" /> },
]
