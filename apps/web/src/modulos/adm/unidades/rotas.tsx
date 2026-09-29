import type { RouteObject } from 'react-router-dom'
import { ListaUnidades } from './ListaUnidades'

export const rotasAdmUnidades: RouteObject[] = [{ path: '/adm/unidades', element: <ListaUnidades /> }]
