import { HttpResponse, http } from 'msw'
import type { HttpHandler } from 'msw'
import type { NotificacaoItem, Notificacoes } from '../../api/notificacoes'
import { uuid } from './sessao'

export function criarNotificacao(n: number, parcial: Partial<NotificacaoItem> = {}): NotificacaoItem {
  return {
    id: uuid(700 + n),
    tipo: 'CRONOGRAMA_PUBLICADO',
    titulo: `Notificação ${n}`,
    texto: `Texto da notificação ${n}`,
    link: `/cronograma?classe=${uuid(100 + n)}`,
    criadaEm: new Date().toISOString(),
    lida: false,
    ...parcial,
  }
}

const contar = (itens: NotificacaoItem[]): Notificacoes => ({ itens, naoLidas: itens.filter((item) => !item.lida).length })

interface Registro {
  /** Ids marcados por `POST /notificacoes/:id/lida`. */
  marcadas: string[]
  /** Quantas vezes `POST /notificacoes/lidas` foi chamada. */
  todasMarcadas: number
  /** Quantas vezes `GET /notificacoes` foi chamada. */
  leituras: number
}

/** As três rotas do sino com estado: as marcações refletem na leitura seguinte. */
export function handlersNotificacoes(inicial: NotificacaoItem[] = []): { handlers: HttpHandler[]; registro: Registro } {
  let itens = inicial
  const registro: Registro = { marcadas: [], todasMarcadas: 0, leituras: 0 }
  const handlers = [
    http.get('/api/notificacoes', () => {
      registro.leituras += 1
      return HttpResponse.json(contar(itens))
    }),
    http.post('/api/notificacoes/lidas', () => {
      registro.todasMarcadas += 1
      itens = itens.map((item) => ({ ...item, lida: true }))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('/api/notificacoes/:id/lida', ({ params }) => {
      const id = String(params['id'])
      registro.marcadas.push(id)
      itens = itens.map((item) => (item.id === id ? { ...item, lida: true } : item))
      return new HttpResponse(null, { status: 204 })
    }),
  ]
  return { handlers, registro }
}

export const handlerNotificacoesVazias = () => handlersNotificacoes().handlers

export const handlerErroNotificacoes = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/notificacoes', () => HttpResponse.json(erro, { status }))
