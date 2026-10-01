import type { RouteObject } from 'react-router-dom'
import { EditarDesbravador } from './EditarDesbravador'
import { FichaDesbravador } from './FichaDesbravador'
import { ImportarDesbravadores } from './ImportarDesbravadores'
import { ListaDesbravadores } from './ListaDesbravadores'

export const rotasAdmDesbravadores: RouteObject[] = [
  { path: '/adm/desbravadores', element: <ListaDesbravadores /> },
  { path: '/adm/desbravadores/importar', element: <ImportarDesbravadores /> },
  { path: '/adm/desbravadores/novo', element: <EditarDesbravador /> },
  { path: '/adm/desbravadores/:id', element: <FichaDesbravador /> },
  { path: '/adm/desbravadores/:id/editar', element: <EditarDesbravador /> },
]
