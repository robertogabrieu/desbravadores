import type { PacoteSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'

type Pacote = z.infer<typeof PacoteSaida>

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function criarPacote(parcial: Partial<Pacote> = {}): Pacote {
  return {
    versao: 'versao-1',
    geradoEm: '2030-01-01T00:00:00.000Z',
    usuarioId: uuid(500),
    vinculoId: uuid(1),
    clube: {
      id: uuid(900),
      nome: 'Clube Teste',
      fuso: 'America/Sao_Paulo',
      diaReuniao: 0,
      horaReuniao: '09:00',
      localReuniaoPadrao: null,
      descontarFalta: false,
      pontosDescontoFalta: 0,
    },
    criterios: [],
    unidades: [],
    reunioesRecentes: [],
    albunsRecentes: [],
    instrutor: null,
    ...parcial,
  }
}

/** GET /api/sync/pacote devolve o pacote dado; `chamadas.total` conta os pedidos. */
export function handlerPacote(pacote: Pacote = criarPacote(), chamadas: { total: number } = { total: 0 }) {
  return http.get('/api/sync/pacote', () => {
    chamadas.total += 1
    return HttpResponse.json(pacote)
  })
}

export const handlerRefreshSemRede = () => http.post('/api/auth/refresh', () => HttpResponse.error())

/** Portal de Wi-Fi: 403 com HTML no lugar da API. */
export const handlerRefreshPortal = () =>
  http.post('/api/auth/refresh', () => new HttpResponse('<html>Entre no Wi-Fi</html>', { status: 403, headers: { 'Content-Type': 'text/html' } }))

export const handlerRefreshServidor = (status = 503) =>
  http.post('/api/auth/refresh', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Indisponível' }, { status }))

/** 200 com corpo que não segue o contrato. */
export const handlerRefreshForaDoContrato = () => http.post('/api/auth/refresh', () => HttpResponse.json({ lixo: true }))

export const handlerRefreshRecusado = (status = 401, codigo = 'NAO_AUTENTICADO') =>
  http.post('/api/auth/refresh', () => HttpResponse.json({ codigo, mensagem: 'Sessão encerrada' }, { status }))
