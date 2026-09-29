import { HttpResponse, http } from 'msw'
import type { ItemRanking, Ranking, RankingUnidades } from '../../api/ranking'
import { CLASSE_AMIGO, CLASSE_COMPANHEIRO } from './perfil'
import { UNIDADE_AGUIAS, UNIDADE_LEOES } from './inicio'
import { uuid } from './sessao'

export function criarItemRanking(posicao: number, parcial: Partial<ItemRanking> = {}): ItemRanking {
  return {
    posicao,
    dbvId: uuid(400 + posicao),
    nome: `Desbravador ${posicao}`,
    unidade: UNIDADE_AGUIAS,
    classe: CLASSE_AMIGO,
    pontos: 500 - posicao * 10,
    frequencia: 90,
    abrePerfil: true,
    ...parcial,
  }
}

export function criarRanking(parcial: Partial<Ranking> = {}): Ranking {
  return {
    mes: '2030-09',
    itens: [
      criarItemRanking(1, { nome: 'Ana Clara Souza', classe: CLASSE_COMPANHEIRO, pontos: 446 }),
      criarItemRanking(2, { nome: 'Pedro Henrique Lima', pontos: 428 }),
      criarItemRanking(3, { nome: 'Mateus V.', pontos: 415, abrePerfil: false, frequencia: null }),
      criarItemRanking(4, { nome: 'Júlia Ramos', unidade: UNIDADE_LEOES, pontos: 398 }),
      criarItemRanking(5, { nome: 'Lucas O.', pontos: 387, abrePerfil: false, frequencia: null }),
    ],
    ...parcial,
  }
}

export const criarRankingUnidades = (): RankingUnidades => [
  { posicao: 1, unidade: UNIDADE_LEOES, mediaPontos: 20, totalDbvs: 3 },
  { posicao: 2, unidade: UNIDADE_AGUIAS, mediaPontos: 15.5, totalDbvs: 5 },
]

/** GET /api/ranking; `aoReceber` recebe a consulta (`mes`, `unidadeId`). Devolve o `mes` pedido quando houver. */
export const handlerRanking = (ranking: Ranking = criarRanking(), aoReceber?: (consulta: URLSearchParams) => void) =>
  http.get('/api/ranking', ({ request }) => {
    const consulta = new URL(request.url).searchParams
    aoReceber?.(consulta)
    return HttpResponse.json({ ...ranking, mes: consulta.get('mes') ?? ranking.mes })
  })

export const handlerRankingUnidades = (unidades: RankingUnidades = criarRankingUnidades()) =>
  http.get('/api/ranking/unidades', () => HttpResponse.json(unidades))

export const handlerErroRanking = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/ranking', () => HttpResponse.json(erro, { status }))
