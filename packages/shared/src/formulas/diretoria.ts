import type { PAPEIS, TIPOS_PESSOA } from '../enums'
import { DIA_DE_CORTE_DO_ANO } from './classe'

/** Quem completa esta idade até 30/06 do ano civil é da Diretoria o ano inteiro, desde janeiro. */
export const IDADE_DA_DIRETORIA = 16

/** Último nascimento ("AAAA-MM-DD") que entra na Diretoria pela idade no ano civil de `hoje`. */
export function nascimentoLimiteDaDiretoria(hoje: string): string {
  return `${Number(hoje.slice(0, 4)) - IDADE_DA_DIRETORIA}-${DIA_DE_CORTE_DO_ANO}`
}

/** `hoje` é a data civil no fuso do clube: é ela que decide em que ano estamos. */
export function diretoriaPelaIdade(nascimento: string, hoje: string): boolean {
  return nascimento <= nascimentoLimiteDaDiretoria(hoje)
}

type Tipo = (typeof TIPOS_PESSOA)[number]
type PapelNoClube = (typeof PAPEIS)[number]

/** Papéis que fazem da conta ligada à ficha membro da Diretoria; ADM não conta. */
export const PAPEIS_DA_DIRETORIA = ['CONSELHEIRO', 'INSTRUTOR'] as const satisfies readonly PapelNoClube[]

/** Por que a pessoa é da Diretoria: a regra (idade, papéis) ou a escolha do Adm. */
export const MOTIVOS_DIRETORIA = ['IDADE', ...PAPEIS_DA_DIRETORIA, 'ADM'] as const
export type MotivoDaDiretoria = (typeof MOTIVOS_DIRETORIA)[number]

/** O que decide o Tipo de uma ficha. Datas civis "AAAA-MM-DD"; `papeis` são os vínculos ativos da conta no clube. */
export interface FichaDoTipo {
  tipo: Tipo
  diretoriaPeloAdm: boolean
  diretoriaDesde: string | null
  nascimento: string
  papeis: readonly PapelNoClube[]
}

export type TipoDecidido = Pick<FichaDoTipo, 'tipo' | 'diretoriaPeloAdm' | 'diretoriaDesde'>

function motivosDaRegra(nascimento: string, papeis: readonly PapelNoClube[], hoje: string): MotivoDaDiretoria[] {
  const motivos: MotivoDaDiretoria[] = diretoriaPelaIdade(nascimento, hoje) ? ['IDADE'] : []
  return [...motivos, ...PAPEIS_DA_DIRETORIA.filter((papel) => papeis.includes(papel))]
}

/** A regra da Diretoria: 16 anos até 30/06 do ano de `hoje`, ou conselheiro/instrutor ativo no clube. */
export function regraDaDiretoria(nascimento: string, papeis: readonly PapelNoClube[], hoje: string): boolean {
  return motivosDaRegra(nascimento, papeis, hoje).length > 0
}

/**
 * O Tipo que a ficha deve ter hoje. Só move entre DBV e DIRETORIA: Líder é escolha do Adm e nunca muda
 * sozinho, e a Diretoria marcada pelo Adm só sai pela mão dele.
 */
export function tipoDaFicha(ficha: FichaDoTipo, hoje: string): TipoDecidido {
  const { tipo, diretoriaPeloAdm, diretoriaDesde } = ficha
  if (tipo === 'LIDER') return { tipo, diretoriaPeloAdm, diretoriaDesde }
  const regra = regraDaDiretoria(ficha.nascimento, ficha.papeis, hoje)
  if (tipo === 'DBV') {
    return regra ? { tipo: 'DIRETORIA', diretoriaPeloAdm: false, diretoriaDesde: hoje } : { tipo, diretoriaPeloAdm, diretoriaDesde }
  }
  if (!regra && !diretoriaPeloAdm) return { tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null }
  return { tipo, diretoriaPeloAdm, diretoriaDesde: diretoriaDesde ?? hoje }
}

/** Motivos para a tela explicar o Tipo; vazios fora da Diretoria (o Líder conselheiro não tem motivo). */
export function motivosDiretoria(ficha: FichaDoTipo, hoje: string): MotivoDaDiretoria[] {
  if (ficha.tipo !== 'DIRETORIA') return []
  const motivos = motivosDaRegra(ficha.nascimento, ficha.papeis, hoje)
  return ficha.diretoriaPeloAdm ? [...motivos, 'ADM'] : motivos
}

/** Por que o Adm não pode voltar a ficha a Desbravador; `null` quando pode. */
export function recusaDeVoltarADesbravador(nascimento: string, papeis: readonly PapelNoClube[], hoje: string): string | null {
  const [motivo] = motivosDaRegra(nascimento, papeis, hoje)
  if (!motivo) return null
  return motivo === 'IDADE'
    ? 'Tem 16 anos até junho: é Diretoria automaticamente.'
    : 'É conselheiro ou instrutor: é Diretoria obrigatoriamente.'
}
