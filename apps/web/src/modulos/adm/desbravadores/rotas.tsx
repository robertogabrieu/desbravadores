import type { RouteObject } from 'react-router-dom'
import { ListaDesbravadores } from './ListaDesbravadores'

export const rotasAdmDesbravadores: RouteObject[] = [{ path: '/adm/desbravadores', element: <ListaDesbravadores /> }]
