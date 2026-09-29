import type { RouteObject } from 'react-router-dom'
import { PerfilDbv } from './PerfilDbv'

export const rotasPerfil: RouteObject[] = [{ path: '/dbv/:id', element: <PerfilDbv /> }]
