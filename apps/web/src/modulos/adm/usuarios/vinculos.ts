import type { Papel } from '@desbravadores/shared'
import { ErroDaApi } from '../../../api/cliente'
import type { CatalogoPermissao } from '../../../api/leitura'
import type { EdicaoVinculo, NovoVinculo, VinculoUsuario } from '../../../api/usuarios'
import { juntarNomes } from '../formatos'

/** O que o Adm está montando num bloco de vínculo. `ajustes` guarda só o que difere do padrão do papel. */
export interface RascunhoVinculo {
  papel: Papel
  unidadeIds: string[]
  classeIds: string[]
  ajustes: Record<string, boolean>
}

export const rascunhoVazio = (papel: Papel = 'CONSELHEIRO'): RascunhoVinculo => ({ papel, unidadeIds: [], classeIds: [], ajustes: {} })

export const rascunhoDoVinculo = (vinculo: VinculoUsuario): RascunhoVinculo => ({
  papel: vinculo.papel,
  unidadeIds: vinculo.unidades.map((u) => u.id),
  classeIds: vinculo.classes.map((c) => c.id),
  ajustes: Object.fromEntries(vinculo.ajustes.map((a) => [a.permissao, a.concedida])),
})

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

/** Rótulos do catálogo das permissões que o vínculo tem ligadas, já com os ajustes aplicados. */
export function oQuePodeFazer(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): string[] {
  const rascunho = rascunhoDoVinculo(vinculo)
  return permissoesDoPapel(catalogo, vinculo.papel)
    .filter((permissao) => permissaoLigada(permissao, rascunho))
    .map((permissao) => permissao.rotulo)
}

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
  ULTIMO_ADM: 'O clube precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de mudar esta.',
  AJUSTE_INVALIDO: 'Alguma permissão não vale para este papel. Confira as caixas e salve de novo.',
}

export const mensagemDeErro = (erro: unknown): string =>
  erro instanceof ErroDaApi ? (MENSAGENS[erro.erro.codigo] ?? erro.erro.mensagem) : 'Não foi possível concluir agora. Tente de novo.'
