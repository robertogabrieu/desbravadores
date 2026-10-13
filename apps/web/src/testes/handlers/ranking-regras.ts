import { REGRAS_DE_PONTUACAO } from '@desbravadores/shared'
import type { GatilhoDeRegra } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { EventoDaTela, RegrasDaTela } from '../../api/ranking-regras'
import { uuid } from './sessao'

/** As 9 regras com os valores iniciais da tabela compartilhada (a semente de um clube novo), mais os eventos dados. */
export function criarRegras(eventos: EventoDaTela[] = []): RegrasDaTela {
  return {
    regras: REGRAS_DE_PONTUACAO.map((r) => ({ gatilho: r.gatilho, pontos: r.pontosIniciais, ativo: r.ligadaNoInicio })),
    eventos,
  }
}

export function criarEventoDeRegras(parcial: Partial<EventoDaTela> = {}): EventoDaTela {
  return {
    id: uuid(7001),
    nome: 'Culto de Sábado Santo',
    inicio: '2026-04-04',
    fim: '2026-04-04',
    uniforme: 'GALA',
    pontosParticipacao: 20,
    pontosUniforme: 5,
    listaConcluida: true,
    foram: 38,
    ...parcial,
  }
}

/** GET e PATCH com estado compartilhado: o PATCH grava e o GET seguinte devolve o valor novo. */
export function handlersRegras(dados: RegrasDaTela = criarRegras(), aoReceber?: (gatilho: string, corpo: unknown) => void) {
  return [
    http.get('/api/ranking/regras', () => HttpResponse.json(dados)),
    http.patch('/api/ranking/regras/:gatilho', async ({ params, request }) => {
      const corpo = (await request.json()) as { pontos: number; ativo: boolean }
      aoReceber?.(String(params.gatilho), corpo)
      const regra = { gatilho: params.gatilho as GatilhoDeRegra, ...corpo }
      dados.regras = dados.regras.map((r) => (r.gatilho === regra.gatilho ? regra : r))
      return HttpResponse.json(regra)
    }),
  ]
}

export const handlerErroRegras = (status = 500) =>
  http.get('/api/ranking/regras', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler as regras' }, { status }))

export const handlerErroSalvarRegra = (status = 500) =>
  http.patch('/api/ranking/regras/:gatilho', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao gravar a regra' }, { status }))

export const handlerRedeCaidaAoSalvarRegra = () => http.patch('/api/ranking/regras/:gatilho', () => HttpResponse.error())
