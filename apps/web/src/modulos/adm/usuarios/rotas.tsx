import type { RouteObject } from 'react-router-dom'
import { AdmUsuarios } from './AdmUsuarios'
import { EditarUsuario, NovoUsuario } from './EditarUsuario'
import { FichaUsuario } from './FichaUsuario'

export const rotasAdmUsuarios: RouteObject[] = [
  { path: '/adm/usuarios', element: <AdmUsuarios /> },
  { path: '/adm/usuarios/novo', element: <NovoUsuario /> },
  { path: '/adm/usuarios/:id', element: <FichaUsuario /> },
  { path: '/adm/usuarios/:id/editar', element: <EditarUsuario /> },
]
