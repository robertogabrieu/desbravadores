import type { RouteObject } from 'react-router-dom'
import { CorrigirChamada } from './CorrigirChamada'
import { FichaReuniao } from './FichaReuniao'

/** Ficha da reunião e correção da chamada pelo Adm (pacote P7). */
export const rotasAdmReunioes: RouteObject[] = [
  { path: '/adm/reunioes/:id', element: <FichaReuniao /> },
  { path: '/adm/reunioes/:id/chamada', element: <CorrigirChamada /> },
]
