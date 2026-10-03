import type { Papel } from '@desbravadores/shared'
import { ErroDaApi } from '../../../api/cliente'
import type { CatalogoPermissao } from '../../../api/leitura'
import type { EdicaoVinculo, NovoVinculo, Usuario, VinculoUsuario } from '../../../api/usuarios'
import { juntarNomes } from '../formatos'

/** O que o Adm está montando num bloco de vínculo. `ajustes` guarda só o que difere do padrão do papel. */
export interface RascunhoVinculo {
  papel: Papel
  unidadeIds: string[]
  classeIds: string[]
  ajustes: Record<string, boolean>
}

export const rascunhoVazio = (papel: Papel = 'CONSELHEIRO'): RascunhoVinculo => ({ papel, unidadeIds: [], classeIds: [], ajustes: {} })

/** Chaves do catálogo que existem para o papel (Adm não tem caixas). */
export const permissoesDoPapel = (catalogo: CatalogoPermissao[], papel: Papel): CatalogoPermissao[] =>
  papel === 'ADM' ? [] : catalogo.filter((p) => p.padrao[papel] !== undefined)

export const permissaoLigada = (permissao: CatalogoPermissao, rascunho: RascunhoVinculo): boolean =>
  rascunho.ajustes[permissao.chave] ?? permissao.padrao[rascunho.papel] === true

/** Liga ou desliga a caixa; voltar ao padrão do papel apaga o ajuste em vez de gravá-lo. */
export function alternarPermissao(rascunho: RascunhoVinculo, permissao: CatalogoPermissao): RascunhoVinculo {
  const novoValor = !permissaoLigada(permissao, rascunho)
  const semEsta = Object.fromEntries(Object.entries(rascunho.ajustes).filter(([chave]) => chave !== permissao.chave))
  const padrao = permissao.padrao[rascunho.papel] === true
  return { ...rascunho, ajustes: novoValor === padrao ? semEsta : { ...semEsta, [permissao.chave]: novoValor } }
}

export const ajustesDoRascunho = (rascunho: RascunhoVinculo) =>
  rascunho.papel === 'ADM' ? [] : Object.entries(rascunho.ajustes).map(([permissao, concedida]) => ({ permissao, concedida }))

export const entradaDoVinculo = (rascunho: RascunhoVinculo): NovoVinculo => ({
  papel: rascunho.papel,
  unidadeIds: rascunho.papel === 'CONSELHEIRO' ? rascunho.unidadeIds : [],
  classeIds: rascunho.papel === 'INSTRUTOR' ? rascunho.classeIds : [],
  ajustes: ajustesDoRascunho(rascunho),
})

/** Mesmo papel, mesmos escopos (em qualquer ordem) e mesmos ajustes. */
export function mesmoRascunho(a: RascunhoVinculo, b: RascunhoVinculo): boolean {
  const mesmosIds = (x: string[], y: string[]) => x.length === y.length && x.every((id) => y.includes(id))
  const ajustesA = Object.entries(a.ajustes)
  return (
    a.papel === b.papel &&
    mesmosIds(a.unidadeIds, b.unidadeIds) &&
    mesmosIds(a.classeIds, b.classeIds) &&
    ajustesA.length === Object.keys(b.ajustes).length &&
    ajustesA.every(([permissao, concedida]) => b.ajustes[permissao] === concedida)
  )
}

/** O corpo do PUT do vínculo: o escopo do papel e os ajustes (o papel não muda). */
export const corpoDaEdicao = (rascunho: RascunhoVinculo): EdicaoVinculo => ({
  ...(rascunho.papel === 'CONSELHEIRO' && { unidadeIds: rascunho.unidadeIds }),
  ...(rascunho.papel === 'INSTRUTOR' && { classeIds: rascunho.classeIds }),
  ajustes: ajustesDoRascunho(rascunho),
})

/** "Unidade Águias" | "Classes Amigo e Companheiro" | "Todo o clube" */
export function escopoDoPapel(vinculo: VinculoUsuario): string {
  if (vinculo.papel === 'ADM') return 'Todo o clube'
  if (vinculo.papel === 'CONSELHEIRO') {
    const nomes = vinculo.unidades.map((u) => u.nome)
    if (nomes.length === 0) return 'Nenhuma unidade'
    return `${nomes.length === 1 ? 'Unidade' : 'Unidades'} ${juntarNomes(nomes)}`
  }
  const nomes = vinculo.classes.map((c) => c.nome)
  if (nomes.length === 0) return 'Nenhuma classe'
  return `${nomes.length === 1 ? 'Classe' : 'Classes'} ${juntarNomes(nomes)}`
}

const MENSAGENS: Record<string, string> = {
  ULTIMO_ADM: 'O clube precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de remover este papel.',
  AJUSTE_INVALIDO: 'Alguma permissão não vale para este papel. Confira as caixas e salve de novo.',
}

export const mensagemDeErro = (erro: unknown): string =>
  erro instanceof ErroDaApi ? (MENSAGENS[erro.erro.codigo] ?? erro.erro.mensagem) : 'Não foi possível concluir agora. Tente de novo.'

const PAPEL_NO_FEMININO = { ADM: 'Adm', CONSELHEIRO: 'Conselheira', INSTRUTOR: 'Instrutora' } as const
const PAPEL_NO_MASCULINO = { ADM: 'Adm', CONSELHEIRO: 'Conselheiro', INSTRUTOR: 'Instrutor' } as const

/** "Conselheira" | "Instrutor" | "Adm"; sem gênero, o masculino. */
export const papelNoGenero = (papel: Papel, genero: Usuario['genero']): string =>
  (genero === 'F' ? PAPEL_NO_FEMININO : PAPEL_NO_MASCULINO)[papel]

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? ''

const PAPEL_POR_URL = { adm: 'ADM', conselheiro: 'CONSELHEIRO', instrutor: 'INSTRUTOR' } as const satisfies Record<string, Papel>
type PapelNaUrl = keyof typeof PAPEL_POR_URL

/** O `?papel=` do endereço; qualquer outro valor (inclusive em maiúscula) é inválido. */
export const papelDaUrl = (valor: string | null): Papel | null =>
  valor !== null && Object.hasOwn(PAPEL_POR_URL, valor) ? PAPEL_POR_URL[valor as PapelNaUrl] : null

export const urlDoPapel = (papel: Papel): PapelNaUrl => (papel === 'ADM' ? 'adm' : papel === 'CONSELHEIRO' ? 'conselheiro' : 'instrutor')

export const ESCOPO_VAZIO = {
  CONSELHEIRO: 'Escolha pelo menos uma unidade.',
  INSTRUTOR: 'Escolha pelo menos uma classe.',
} as const

/** O rascunho do papel sem ajuste que não muda nada: igual ao padrão, de chave que não vale para o
 *  papel, ou repetido (a API grava o último de cada chave). A API pode ter guardado qualquer um. */
export function rascunhoLimpo(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): RascunhoVinculo {
  const padraoDe = new Map(permissoesDoPapel(catalogo, vinculo.papel).map((p) => [p.chave, p.padrao[vinculo.papel] === true]))
  const ultimoPorChave = new Map(vinculo.ajustes.map((a) => [a.permissao, a.concedida]))
  const ajustes = Object.fromEntries([...ultimoPorChave].filter(([chave, concedida]) => padraoDe.has(chave) && padraoDe.get(chave) !== concedida))
  return { papel: vinculo.papel, unidadeIds: vinculo.unidades.map((u) => u.id), classeIds: vinculo.classes.map((c) => c.id), ajustes }
}

export const contarAjustes = (vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): number =>
  Object.keys(rascunhoLimpo(vinculo, catalogo).ajustes).length

/** "Ajuste: também pode …" / "Ajuste: não pode …", na ordem do catálogo. */
export function frasesDosAjustes(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): string[] {
  const { ajustes } = rascunhoLimpo(vinculo, catalogo)
  return permissoesDoPapel(catalogo, vinculo.papel)
    .filter((p) => p.chave in ajustes)
    .map((p) => `Ajuste: ${ajustes[p.chave] ? 'também pode' : 'não pode'} ${p.rotulo}`)
}

export const textoDoSelo = (n: number): string => (n === 0 ? 'sem ajustes' : `+ ${n} ${n === 1 ? 'ajuste' : 'ajustes'}`)

export const textoDasAlteracoes = (n: number): string => (n === 0 ? '' : `${n} ${n === 1 ? 'alteração' : 'alterações'}`)
