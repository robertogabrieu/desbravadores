import type { MarcacaoChamadaEnvio, PacoteSaida, ReuniaoDetalhe, SituacaoChamada } from '@desbravadores/shared'
import { ReuniaoEnvio, SituacaoChamadaZ, pontosDaChamada } from '@desbravadores/shared'
import { z } from 'zod'
import type { EntradaSalvarChamada } from '../../../api/reunioes'
import type { ItemFila } from '../../../offline'

type Pacote = z.infer<typeof PacoteSaida>
type Detalhe = z.infer<typeof ReuniaoDetalhe>
type Linha = z.infer<typeof MarcacaoChamadaEnvio>

/** Situação `null` = ninguém tocou nesse desbravador ainda. */
export interface Marca {
  situacao: SituacaoChamada | null
  uniforme: boolean
  biblia: boolean
  licao: boolean
}

export interface Cabecalho {
  horario: string
  local: string
  observacoes: string
}

/** A reunião como o servidor a tem (online ou no pacote), com as versões que o aparelho viu. */
export interface BaseReuniao {
  reuniaoId: string
  cabecalho: Cabecalho
  cabecalhoVersao: string
  linhas: (Marca & { dbvId: string; versao: string })[]
}

export interface EstadoChamada {
  marcas: Record<string, Marca>
  cabecalho: Cabecalho
  /** Desbravadores que a pessoa marcou nesta sessão de edição (só eles vão na correção). */
  tocadas: string[]
  cabecalhoTocado: boolean
}

const SEM_MARCA: Marca = { situacao: null, uniforme: false, biblia: false, licao: false }

export const RascunhoChamada = z.object({
  marcas: z.record(
    z.string(),
    z.object({ situacao: SituacaoChamadaZ, uniforme: z.boolean(), biblia: z.boolean(), licao: z.boolean() }),
  ),
  cabecalho: z.object({ horario: z.string(), local: z.string(), observacoes: z.string() }).nullable(),
})
type Rascunho = z.infer<typeof RascunhoChamada>

const PayloadDaFila = z.object({ reuniaoId: z.string(), corpo: ReuniaoEnvio })

export const ehPresente = (marca: Marca): boolean => marca.situacao === 'PRESENTE' || marca.situacao === 'ATRASADO'

export function baseDoDetalhe(detalhe: Detalhe): BaseReuniao {
  return {
    reuniaoId: detalhe.id,
    cabecalho: { horario: detalhe.horario, local: detalhe.local ?? '', observacoes: detalhe.observacoes ?? '' },
    cabecalhoVersao: detalhe.cabecalhoVersao,
    linhas: detalhe.chamada,
  }
}

export function baseDoPacote(reuniao: Pacote['reunioesRecentes'][number]): BaseReuniao {
  return {
    reuniaoId: reuniao.id,
    cabecalho: { horario: reuniao.horario, local: reuniao.local ?? '', observacoes: reuniao.observacoes ?? '' },
    cabecalhoVersao: reuniao.cabecalhoVersao,
    linhas: reuniao.chamada,
  }
}

/** Fila da mesma chave: só o que ainda não foi enviado, na ordem em que foi guardado. */
export function itensPendentes(itens: ItemFila[]): { reuniaoId: string; corpo: z.infer<typeof ReuniaoEnvio> }[] {
  return itens
    .filter((item) => item.estado === 'NA_FILA' || item.estado === 'ENVIANDO' || item.estado === 'ERRO')
    .sort((a, b) => a.criadoEm - b.criadoEm)
    .flatMap((item) => {
      const lido = PayloadDaFila.safeParse(item.payload)
      return lido.success ? [lido.data] : []
    })
}

export function lerRascunhoValido(valor: unknown): Rascunho | null {
  const lido = RascunhoChamada.safeParse(valor)
  return lido.success ? lido.data : null
}

interface Origem {
  membros: { dbvId: string }[]
  cabecalhoPadrao: Cabecalho
  base: BaseReuniao | null
  fila: ReturnType<typeof itensPendentes>
  rascunho: Rascunho | null
}

/** Base do servidor, por cima a fila da mesma chave, por cima de tudo o rascunho. */
export function comporEstado({ membros, cabecalhoPadrao, base, fila, rascunho }: Origem): EstadoChamada {
  const marcas: Record<string, Marca> = Object.fromEntries(membros.map((m) => [m.dbvId, SEM_MARCA]))
  let cabecalho = base?.cabecalho ?? cabecalhoPadrao
  for (const linha of base?.linhas ?? []) if (linha.dbvId in marcas) marcas[linha.dbvId] = linha
  for (const { corpo } of fila) {
    for (const linha of corpo.linhas) if (linha.dbvId in marcas) marcas[linha.dbvId] = linha
    if (corpo.cabecalho) {
      cabecalho = { horario: corpo.cabecalho.horario, local: corpo.cabecalho.local ?? '', observacoes: corpo.cabecalho.observacoes ?? '' }
    }
  }
  for (const [dbvId, marca] of Object.entries(rascunho?.marcas ?? {})) if (dbvId in marcas) marcas[dbvId] = marca
  if (rascunho?.cabecalho) cabecalho = rascunho.cabecalho
  return {
    marcas,
    cabecalho,
    tocadas: Object.keys(rascunho?.marcas ?? {}).filter((dbvId) => dbvId in marcas),
    cabecalhoTocado: rascunho?.cabecalho != null,
  }
}

export function rascunhoDe(estado: EstadoChamada): Rascunho {
  const marcas: Rascunho['marcas'] = {}
  for (const dbvId of estado.tocadas) {
    const { situacao, ...chips } = estado.marcas[dbvId] ?? SEM_MARCA
    if (situacao) marcas[dbvId] = { situacao, ...chips }
  }
  return { marcas, cabecalho: estado.cabecalhoTocado ? estado.cabecalho : null }
}

/** Primeiro toque no nome = presente; depois alterna presente e ausente. Ausentar limpa os chips. */
export function alternarPresenca(marca: Marca): Marca {
  return ehPresente(marca) ? { ...SEM_MARCA, situacao: 'FALTA' } : { ...marca, situacao: 'PRESENTE' }
}

export const alternarAtraso = (marca: Marca): Marca => ({ ...marca, situacao: marca.situacao === 'ATRASADO' ? 'PRESENTE' : 'ATRASADO' })

export const alternarJustificada = (marca: Marca): Marca => ({
  ...marca,
  situacao: marca.situacao === 'FALTA_JUSTIFICADA' ? 'FALTA' : 'FALTA_JUSTIFICADA',
})

export function tocar(estado: EstadoChamada, dbvId: string, marca: Marca): EstadoChamada {
  return {
    ...estado,
    marcas: { ...estado.marcas, [dbvId]: marca },
    tocadas: estado.tocadas.includes(dbvId) ? estado.tocadas : [...estado.tocadas, dbvId],
  }
}

export function editarCabecalho(estado: EstadoChamada, parcial: Partial<Cabecalho>): EstadoChamada {
  return { ...estado, cabecalho: { ...estado.cabecalho, ...parcial }, cabecalhoTocado: true }
}

export interface Resumo {
  presentes: number
  atrasos: number
  uniformes: number
  biblias: number
  semMarca: number
  pontos: number
}

export function resumir(estado: EstadoChamada, pacote: Pacote): Resumo {
  const marcas = Object.values(estado.marcas)
  const config = { descontarFalta: pacote.clube.descontarFalta, pontosDescontoFalta: pacote.clube.pontosDescontoFalta }
  let pontos = 0
  for (const marca of marcas) {
    if (marca.situacao) pontos += pontosDaChamada({ ...marca, situacao: marca.situacao }, pacote.criterios, config)
  }
  return {
    presentes: marcas.filter(ehPresente).length,
    atrasos: marcas.filter((m) => m.situacao === 'ATRASADO').length,
    uniformes: marcas.filter((m) => ehPresente(m) && m.uniforme).length,
    biblias: marcas.filter((m) => ehPresente(m) && m.biblia).length,
    semMarca: marcas.filter((m) => m.situacao === null).length,
    pontos,
  }
}

const paraLinha = (dbvId: string, marca: Marca, versaoVista: string | null): Linha[] =>
  marca.situacao
    ? [{ dbvId, situacao: marca.situacao, uniforme: marca.uniforme, biblia: marca.biblia, licao: marca.licao, versaoVista }]
    : []

interface Contexto {
  estado: EstadoChamada
  membros: { dbvId: string }[]
  base: BaseReuniao | null
  reuniaoId: string
  unidade: { id: string; nome: string }
  data: string
  pontos: number
}

/** O que enfileirar; `null` quando não há o que salvar. Nova envia todos; correção, só o que foi tocado. */
export function montarEntrada({ estado, membros, base, reuniaoId, unidade, data, pontos }: Contexto): EntradaSalvarChamada | null {
  const texto = (valor: string): string | null => valor.trim() || null
  const cabecalho = (versaoVista: string | null) => ({
    horario: estado.cabecalho.horario,
    local: texto(estado.cabecalho.local),
    observacoes: texto(estado.cabecalho.observacoes),
    versaoVista,
  })
  const comum = { unidadeId: unidade.id, unidadeNome: unidade.nome, data, reuniaoId, pontosProvisorios: pontos }
  if (!base) {
    const linhas = membros.flatMap((m) => paraLinha(m.dbvId, estado.marcas[m.dbvId] ?? SEM_MARCA, null))
    return { ...comum, correcao: false, cabecalho: cabecalho(null), linhas }
  }
  const versoes = new Map(base.linhas.map((linha) => [linha.dbvId, linha.versao]))
  let linhas = estado.tocadas.flatMap((dbvId) => paraLinha(dbvId, estado.marcas[dbvId] ?? SEM_MARCA, versoes.get(dbvId) ?? null))
  if (linhas.length === 0 && estado.cabecalhoTocado) {
    // O contrato exige ao menos uma linha: repete uma já gravada, que o servidor reconhece como idêntica.
    const primeira = membros.flatMap((m) => paraLinha(m.dbvId, estado.marcas[m.dbvId] ?? SEM_MARCA, versoes.get(m.dbvId) ?? null))[0]
    linhas = primeira ? [primeira] : []
  }
  if (linhas.length === 0) return null
  return { ...comum, correcao: true, cabecalho: estado.cabecalhoTocado ? cabecalho(base.cabecalhoVersao) : null, linhas }
}
