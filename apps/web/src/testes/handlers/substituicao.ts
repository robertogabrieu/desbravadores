import type { DatasElegiveis, SubstituicaoDoAlvo, SubstituicaoGerada } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

type Datas = z.infer<typeof DatasElegiveis>
type DoAlvo = z.infer<typeof SubstituicaoDoAlvo>
type Gerada = z.infer<typeof SubstituicaoGerada>

export const LINK_SUBSTITUICAO = 'https://app.exemplo.org/substituto/Xk3-token-opaco-de-teste'

/** Domingo 11/10 das 09:00 às 12:00, sábado 17/10 das 15:00 às 18:00 e domingo 18/10, no fuso de São Paulo. */
export const criarDatas = (): Datas => [
  { data: '2026-10-11', inicioEm: '2026-10-11T12:00:00.000Z', fimEm: '2026-10-11T15:00:00.000Z' },
  { data: '2026-10-17', inicioEm: '2026-10-17T18:00:00.000Z', fimEm: '2026-10-17T21:00:00.000Z' },
  { data: '2026-10-18', inicioEm: '2026-10-18T12:00:00.000Z', fimEm: '2026-10-18T15:00:00.000Z' },
]

export function criarSubstituicaoGerada(parcial: Partial<Gerada> = {}): Gerada {
  return { id: uuid(950), ...criarDatas()[0], identificadaEm: null, substituto: null, link: LINK_SUBSTITUICAO, ...parcial }
}

export interface RegistroSubstituicao {
  datasPedidas: string[]
  gerados: { alvo: string; id: string; corpo: unknown }[]
  cancelados: { alvo: string; id: string }[]
}

export const novoRegistroSubstituicao = (): RegistroSubstituicao => ({ datasPedidas: [], gerados: [], cancelados: [] })

/** Rotas do Adm: datas elegíveis e o ciclo do link de unidade e de classe; o GET acompanha o que a tela gera ou cancela. */
export function handlersSubstituicao({
  datas = criarDatas(),
  inicial = null,
  registro = novoRegistroSubstituicao(),
}: { datas?: Datas; inicial?: DoAlvo; registro?: RegistroSubstituicao } = {}) {
  let atual: DoAlvo = inicial
  const caminho = '/api/:alvo/:id/substituicao'
  return [
    http.get('/api/substituicoes/datas', ({ request }) => {
      registro.datasPedidas.push(new URL(request.url).searchParams.get('tipo') ?? '')
      return HttpResponse.json(datas)
    }),
    http.get(caminho, () => HttpResponse.json(atual)),
    http.post(caminho, async ({ params, request }) => {
      const corpo = (await request.json()) as { data: string }
      registro.gerados.push({ alvo: String(params['alvo']), id: String(params['id']), corpo })
      const janela = datas.find((d) => d.data === corpo.data) ?? criarDatas()[0]
      const semLink = { id: uuid(950), ...janela, identificadaEm: null, substituto: null }
      atual = semLink
      return HttpResponse.json({ ...semLink, link: LINK_SUBSTITUICAO }, { status: 201 })
    }),
    http.delete(caminho, ({ params }) => {
      registro.cancelados.push({ alvo: String(params['alvo']), id: String(params['id']) })
      atual = null
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}
