import { HttpResponse, http } from 'msw'
import type { AulaAfetada, Calendario, EventoCalendario } from '../../api/calendario'
import { uuid } from './sessao'

export function criarEvento(n: number, parcial: Partial<EventoCalendario> = {}): EventoCalendario {
  return {
    id: uuid(800 + n),
    nome: `Evento ${n}`,
    tipo: 'EVENTO',
    inicio: '2026-10-10',
    fim: '2026-10-10',
    horario: null,
    local: null,
    cancelaReuniao: false,
    bloqueiaAula: true,
    bomParaCampo: false,
    ...parcial,
  }
}

export function criarAulaAfetada(n: number, parcial: Partial<AulaAfetada> = {}): AulaAfetada {
  return {
    aulaId: uuid(850 + n),
    cronogramaId: uuid(870 + n),
    classe: { id: uuid(100 + n), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: 'amigo' },
    data: '2026-10-18',
    ...parcial,
  }
}

export const handlerCalendario = (calendario: Partial<Calendario> = {}, aoReceber?: (consulta: string) => void) =>
  http.get('/api/calendario', ({ request }) => {
    aoReceber?.(new URL(request.url).search)
    return HttpResponse.json({ eventos: [], diasDeReuniao: [], ...calendario })
  })

export const handlerErroCalendario = (status = 500) =>
  http.get('/api/calendario', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler o calendário' }, { status }))

export const handlerCriarEvento = (aulasAfetadas: AulaAfetada[] = [], aoReceber?: (corpo: unknown) => void) =>
  http.post('/api/calendario/eventos', async ({ request }) => {
    const corpo = await request.json()
    aoReceber?.(corpo)
    return HttpResponse.json({ evento: { id: uuid(899), ...(corpo as object) }, aulasAfetadas }, { status: 201 })
  })

export const handlerEditarEvento = (aulasAfetadas: AulaAfetada[] = [], aoReceber?: (id: string, corpo: unknown) => void) =>
  http.patch('/api/calendario/eventos/:id', async ({ request, params }) => {
    const corpo = await request.json()
    aoReceber?.(String(params['id']), corpo)
    return HttpResponse.json({ evento: { id: String(params['id']), ...(corpo as object) }, aulasAfetadas })
  })

export const handlerExcluirEvento = (aoReceber?: (id: string) => void) =>
  http.delete('/api/calendario/eventos/:id', ({ params }) => {
    aoReceber?.(String(params['id']))
    return new HttpResponse(null, { status: 204 })
  })

export const handlerErroGravarEvento = (status: number, erro: { codigo: string; mensagem: string }) => [
  http.post('/api/calendario/eventos', () => HttpResponse.json(erro, { status })),
  http.patch('/api/calendario/eventos/:id', () => HttpResponse.json(erro, { status })),
]
