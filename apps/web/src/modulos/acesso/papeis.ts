import type { Papel } from '@desbravadores/shared'
import type { Vinculo } from '../../sessao/useSessao'

const ROTULOS: Record<Papel, string> = { ADM: 'Adm', CONSELHEIRO: 'Conselheiro', INSTRUTOR: 'Instrutor' }

export const rotuloDoPapel = (papel: Papel): string => ROTULOS[papel]

/** Unidades do conselheiro ou classes do instrutor, separadas por vírgula; vazio para o Adm. */
export function escopoDoVinculo(vinculo: Vinculo): string {
  const nomes = vinculo.papel === 'CONSELHEIRO' ? vinculo.unidades.map((u) => u.nome) : vinculo.classes.map((c) => c.nome)
  return nomes.join(', ')
}

/** Primeira tela de cada papel: o painel do Adm ou o início do celular. */
export const inicioDoPapel = (papel: Papel): string => (papel === 'ADM' ? '/adm/desbravadores' : '/inicio')

/** Vínculos do clube da sessão: os papéis entre os quais a troca rápida do cabeçalho alterna. */
export const vinculosDoClube = (vinculos: Vinculo[], ativo: Vinculo | null): Vinculo[] =>
  ativo ? vinculos.filter((vinculo) => vinculo.clube.id === ativo.clube.id) : []
