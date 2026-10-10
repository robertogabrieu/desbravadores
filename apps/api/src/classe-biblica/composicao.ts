/** Vínculo de um desbravador ativo com uma unidade (`inicio <= data < fim`, como a reunião). */
export interface Vinculo {
  dbvId: string
  nome: string
  unidadeId: string
  unidadeNome: string
  inicio: Date
  fim: Date | null
}

/** Linha já gravada num encontro, de qualquer grupo, com o grupo e a unidade do dia. */
export interface LinhaDoEncontro {
  dbvId: string
  nome: string
  ativo: boolean
  grupoId: string
  unidadeId: string
  unidadeNome: string
}

/** Um desbravador da chamada, na unidade em que conta naquele encontro. */
export interface MembroDaChamada {
  dbvId: string
  nome: string
  unidadeId: string
  unidadeNome: string
  /** Início do vínculo com a unidade que valia no dia; null se a linha gravada não tem mais vínculo que a cubra. */
  inicio: Date | null
}

export const SELECAO_VINCULO = {
  dbvId: true,
  unidadeId: true,
  inicio: true,
  fim: true,
  dbv: { select: { nome: true } },
  unidade: { select: { nome: true } },
} as const

export const SELECAO_LINHA = {
  dbvId: true,
  grupoId: true,
  unidadeId: true,
  dbv: { select: { nome: true, ativo: true } },
  unidade: { select: { nome: true } },
} as const

export function vinculo(linha: {
  dbvId: string
  unidadeId: string
  inicio: Date
  fim: Date | null
  dbv: { nome: string }
  unidade: { nome: string }
}): Vinculo {
  return { dbvId: linha.dbvId, nome: linha.dbv.nome, unidadeId: linha.unidadeId, unidadeNome: linha.unidade.nome, inicio: linha.inicio, fim: linha.fim }
}

export function linhaDoEncontro(linha: {
  dbvId: string
  grupoId: string
  unidadeId: string
  dbv: { nome: string; ativo: boolean }
  unidade: { nome: string }
}): LinhaDoEncontro {
  return {
    dbvId: linha.dbvId,
    nome: linha.dbv.nome,
    ativo: linha.dbv.ativo,
    grupoId: linha.grupoId,
    unidadeId: linha.unidadeId,
    unidadeNome: linha.unidade.nome,
  }
}

export function cobre(vinculo: { inicio: Date; fim: Date | null }, data: Date): boolean {
  return vinculo.inicio <= data && (vinculo.fim === null || vinculo.fim > data)
}

/** Período de uma unidade num grupo (D32): vale de `inicio` até a véspera de `fim`. */
export interface PeriodoNoGrupo {
  grupoId: string
  unidadeId: string
  inicio: Date
  fim: Date | null
}

/** Composição do grupo numa data: as unidades cujo período cobre o dia (D32). */
export function unidadesNaData(periodos: PeriodoNoGrupo[], grupoId: string, data: Date): Set<string> {
  return new Set(periodos.filter((p) => p.grupoId === grupoId && cobre(p, data)).map((p) => p.unidadeId))
}

/**
 * Quem entra na chamada de um grupo num encontro (regras 8 e 14): as linhas que o grupo já gravou nele, com a
 * unidade do dia, mais quem a composição do grupo na data do encontro traz e ainda não tem linha em grupo nenhum.
 * Mover a unidade de grupo muda só os encontros do dia da troca em diante, e nunca as linhas gravadas.
 */
export function membrosDaChamada(
  grupoId: string,
  unidadesDoGrupo: ReadonlySet<string>,
  data: Date,
  linhasDoEncontro: LinhaDoEncontro[],
  vinculos: Vinculo[],
): MembroDaChamada[] {
  const comLinha = new Set(linhasDoEncontro.map((linha) => linha.dbvId))
  const noDia = vinculos.filter((v) => cobre(v, data))
  const inicioNoDia = new Map(noDia.map((v) => [`${v.dbvId}:${v.unidadeId}`, v.inicio]))
  const gravados = linhasDoEncontro
    .filter((linha) => linha.grupoId === grupoId && linha.ativo)
    .map((linha) => ({
      dbvId: linha.dbvId,
      nome: linha.nome,
      unidadeId: linha.unidadeId,
      unidadeNome: linha.unidadeNome,
      inicio: inicioNoDia.get(`${linha.dbvId}:${linha.unidadeId}`) ?? null,
    }))
  const daComposicao = noDia
    .filter((v) => unidadesDoGrupo.has(v.unidadeId) && !comLinha.has(v.dbvId))
    .map((v) => ({ dbvId: v.dbvId, nome: v.nome, unidadeId: v.unidadeId, unidadeNome: v.unidadeNome, inicio: v.inicio }))
  return [...gravados, ...daComposicao]
}
