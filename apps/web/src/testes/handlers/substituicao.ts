import { CABECALHO_DO_SEGREDO_DO_APARELHO } from '@desbravadores/shared'
import type { DatasElegiveis, Entrada, EstadoDoLink, LinkPublico, SubstituicaoDoAlvo, SubstituicaoGerada } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

type Datas = z.infer<typeof DatasElegiveis>
type DoAlvo = z.infer<typeof SubstituicaoDoAlvo>
type Gerada = z.infer<typeof SubstituicaoGerada>
type Link = z.infer<typeof LinkPublico>
type EntradaDoLink = z.infer<typeof Entrada>
type Identidade = EntradaDoLink['identidade']

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

/** Link de unidade "Águia" aberto no domingo 11/10, das 09:00 às 12:00 em São Paulo; servidor às 10:00. */
export function criarLinkPublico(parcial: Partial<Link> = {}): Link {
  return {
    estado: 'ABERTO',
    tipo: 'CHAMADA',
    alvo: { nome: 'Águia' },
    data: '2026-10-11',
    inicioEm: '2026-10-11T12:00:00.000Z',
    fimEm: '2026-10-11T15:00:00.000Z',
    fimEnvioEm: '2026-10-12T03:00:00.000Z',
    fuso: 'America/Sao_Paulo',
    agora: '2026-10-11T13:00:00.000Z',
    conta: null,
    identificado: false,
    ...parcial,
  }
}

export function criarEntradaDoLink(identidade: Partial<Identidade> = {}, parcial: Partial<Omit<EntradaDoLink, 'identidade'>> = {}): EntradaDoLink {
  return {
    credencial: 'credencial-do-link',
    segredo: 'segredo-do-aparelho',
    identidade: {
      substituicaoId: uuid(950),
      nome: 'Ana Souza',
      tipo: 'CHAMADA',
      alvoId: uuid(30),
      alvoNome: 'Águia',
      clubeId: uuid(900),
      data: '2026-10-11',
      fimEm: '2026-10-11T15:00:00.000Z',
      fimEnvioEm: '2026-10-12T03:00:00.000Z',
      fuso: 'America/Sao_Paulo',
      ...identidade,
    },
    agora: '2026-10-11T13:00:00.000Z',
    ...parcial,
  }
}

export interface RegistroDoLink {
  /** Segredo do aparelho que cada GET trouxe no cabeçalho (nulo quando não trouxe). */
  segredosLidos: (string | null)[]
  entradas: unknown[]
}

export const novoRegistroDoLink = (): RegistroDoLink => ({ segredosLidos: [], entradas: [] })

const STATUS_DA_RECUSA: Record<Exclude<z.infer<typeof EstadoDoLink>, 'ABERTO'>, number> = {
  INEXISTENTE: 410,
  CANCELADO: 410,
  ENCERRADO: 410,
  ANTES: 422,
  EM_OUTRO_APARELHO: 409,
}

/** Recusa do `entrar` como a API manda: o estado vai em `campos.estado`. */
export const recusaDoEntrar = (estado: Exclude<z.infer<typeof EstadoDoLink>, 'ABERTO'>) =>
  HttpResponse.json({ codigo: 'REGRA', mensagem: 'Recusado', campos: { estado } }, { status: STATUS_DA_RECUSA[estado] })

/**
 * Rotas públicas do link: cada GET devolve o próximo da lista (o último se repete), e o `entrar`
 * devolve a entrada dada ou a resposta que `entrar` montar.
 */
export function handlersDoLink({
  links = [criarLinkPublico()],
  entrada = criarEntradaDoLink(),
  entrar,
  registro = novoRegistroDoLink(),
}: { links?: Link[]; entrada?: EntradaDoLink; entrar?: (corpo: unknown) => Response; registro?: RegistroDoLink } = {}) {
  let lidos = 0
  return [
    http.get('/api/auth/substituicao/:token', ({ request }) => {
      registro.segredosLidos.push(request.headers.get(CABECALHO_DO_SEGREDO_DO_APARELHO))
      const link = links[Math.min(lidos, links.length - 1)]
      lidos += 1
      return HttpResponse.json(link)
    }),
    http.post('/api/auth/substituicao/:token/entrar', async ({ request }) => {
      const corpo: unknown = await request.json()
      registro.entradas.push(corpo)
      return entrar ? entrar(corpo) : HttpResponse.json(entrada)
    }),
  ]
}
