import type { RouteObject } from 'react-router-dom'
import { TelaChamadaCB } from './chamada/TelaChamadaCB'

/** Conselheiro e Instrutor chegam aqui pelo cartão do início; a permissão e o escopo são da API e do pacote. */
export const rotasClasseBiblica: RouteObject[] = [
  { path: '/classe-biblica/encontros/:id/grupos/:grupoId/chamada', element: <TelaChamadaCB /> },
]
