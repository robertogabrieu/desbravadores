import type { RouteObject } from 'react-router-dom'
import { EditarUnidade, NovaUnidade } from './EditarUnidade'
import { FichaUnidade } from './FichaUnidade'
import { ListaUnidades } from './ListaUnidades'
import { GerarLinkDaUnidade } from '../substituicao/GerarLinkDeSubstituicao'

export const rotasAdmUnidades: RouteObject[] = [
  { path: '/adm/unidades', element: <ListaUnidades /> },
  { path: '/adm/unidades/nova', element: <NovaUnidade /> },
  { path: '/adm/unidades/:id', element: <FichaUnidade /> },
  { path: '/adm/unidades/:id/editar', element: <EditarUnidade /> },
  { path: '/adm/unidades/:id/substituicao', element: <GerarLinkDaUnidade /> },
]
