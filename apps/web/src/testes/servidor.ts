import { setupServer } from 'msw/node'
import { handlersSessao } from './handlers/sessao'
import { handlersLeitura } from './handlers/leitura'
import { handlerNotificacoesVazias } from './handlers/notificacoes'
import { handlersSubstituicao } from './handlers/substituicao'

/**
 * Servidor msw compartilhado. Começa com sessão e leituras comuns; cada teste de tela acrescenta os
 * handlers do seu módulo com `servidor.use(...)` (o setup limpa entre testes).
 */
export const servidor = setupServer(...handlersSessao(), ...handlersLeitura(), ...handlerNotificacoesVazias(), ...handlersSubstituicao())
