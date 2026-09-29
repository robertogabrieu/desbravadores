import type { EuSaida, Papel } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import type { Sessao } from '../../api/cliente'
import { handlerPacote } from './offline'

export type Eu = z.infer<typeof EuSaida>
export type Vinculo = Sessao['vinculos'][number]

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function criarVinculo(papel: Papel, n = 1, parcial: Partial<Vinculo> = {}): Vinculo {
  return {
    id: uuid(n),
    papel,
    clube: { id: uuid(900), nome: 'Clube Teste', slug: 'clube-teste' },
    unidades: [],
    classes: [],
    ...parcial,
  }
}

export function criarSessao(vinculos: Vinculo[], vinculoAtivoId: string | null = vinculos[0]?.id ?? null): Sessao {
  return {
    accessToken: 'token-de-teste',
    expiraEm: '2030-01-01T00:00:00.000Z',
    vinculoAtivoId,
    vinculos,
  }
}

export function criarEu(vinculos: Vinculo[], vinculoAtivoId: string | null = vinculos[0]?.id ?? null, permissoes: string[] = []): Eu {
  return {
    usuario: { id: uuid(500), nome: 'Ana Souza', email: 'ana@clube.test', genero: 'F' },
    vinculoAtivo: vinculos.find((v) => v.id === vinculoAtivoId) ?? null,
    vinculos,
    permissoes,
  }
}

/** Sessão válida: refresh devolve a sessão e /api/eu devolve o usuário. */
export function handlersSessao(vinculos: Vinculo[] = [criarVinculo('ADM')], vinculoAtivoId?: string | null, permissoes: string[] = []) {
  return [
    http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao(vinculos, vinculoAtivoId))),
    http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos, vinculoAtivoId, permissoes))),
    http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
    http.post('/api/auth/sair-de-todos', () => new HttpResponse(null, { status: 204 })),
    handlerPacote(),
  ]
}

/** Sem sessão: o refresh recusa. */
export const handlerSemSessao = () =>
  http.post('/api/auth/refresh', () =>
    HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada' }, { status: 401 }),
  )
