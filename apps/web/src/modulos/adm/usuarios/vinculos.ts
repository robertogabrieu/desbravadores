import type { Papel } from '@desbravadores/shared'
import { ErroDaApi } from '../../../api/cliente'
import type { CatalogoPermissao } from '../../../api/leitura'
import type { NovoVinculo, VinculoUsuario } from '../../../api/usuarios'

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

const MENSAGENS: Record<string, string> = {
  ULTIMO_ADM: 'O clube precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de mudar esta.',
  AJUSTE_INVALIDO: 'Alguma permissão não vale para este papel. Confira as caixas e salve de novo.',
}

export const mensagemDeErro = (erro: unknown): string =>
  erro instanceof ErroDaApi ? (MENSAGENS[erro.erro.codigo] ?? erro.erro.mensagem) : 'Não foi possível concluir agora. Tente de novo.'
