import type { RouteObject } from 'react-router-dom'
import { AdmCalendario } from './AdmCalendario'
import { EditarEvento } from './EditarEvento'
import { FichaEvento } from './FichaEvento'

export const rotasAdmCalendario: RouteObject[] = [
  { path: '/adm/calendario', element: <AdmCalendario /> },
  { path: '/adm/calendario/eventos/novo', element: <EditarEvento /> },
  { path: '/adm/calendario/eventos/:id', element: <FichaEvento /> },
  { path: '/adm/calendario/eventos/:id/editar', element: <EditarEvento /> },
]
