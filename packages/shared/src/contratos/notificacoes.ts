import { z } from 'zod'
import { TipoNotificacao } from '../enums'
import { InstanteIso, Uuid } from './comum'

export const NotificacaoSaida = z.object({
  id: Uuid, tipo: TipoNotificacao, titulo: z.string(), texto: z.string(), link: z.string(),
  criadaEm: InstanteIso, lida: z.boolean(),
})
export const NotificacoesSaida = z.object({ itens: z.array(NotificacaoSaida), naoLidas: z.number().int() })
// GET /notificacoes → NotificacoesSaida (últimas 50) · POST /notificacoes/:id/lida → 204 · POST /notificacoes/lidas → 204
