import type { RouteObject } from 'react-router-dom'
import { ImportarDesbravadores } from './ImportarDesbravadores'
import { ListaDesbravadores } from './ListaDesbravadores'

export const rotasAdmDesbravadores: RouteObject[] = [
  { path: '/adm/desbravadores', element: <ListaDesbravadores /> },
  { path: '/adm/desbravadores/importar', element: <ImportarDesbravadores /> },
]
