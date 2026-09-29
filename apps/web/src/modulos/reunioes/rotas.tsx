import type { RouteObject } from 'react-router-dom'
import { TelaChamada } from './chamada/TelaChamada'
import { DetalheReuniao } from './detalhe/DetalheReuniao'
import { HistoricoReunioes } from './historico/HistoricoReunioes'

// B4 é dono de chamada/ e B5 de historico/ e detalhe/: nenhum dos dois edita este arquivo.
export const rotasReunioes: RouteObject[] = [
  { path: '/reunioes', element: <HistoricoReunioes /> },
  { path: '/reunioes/nova', element: <TelaChamada /> },
  { path: '/reunioes/:id', element: <DetalheReuniao /> },
  { path: '/reunioes/:id/editar', element: <TelaChamada /> },
]
