import { useClasses, useUnidades } from '../../../api/leitura'
import type { Classe, Unidade } from '../../../api/leitura'
import type { VinculoUsuario } from '../../../api/usuarios'
import { semAcento } from '../../progresso/formatos'
import { juntarNomes } from '../formatos'

type RefUnidade = VinculoUsuario['unidades'][number]
type RefClasse = VinculoUsuario['classes'][number]

export interface OpcaoDeEscopo {
  id: string
  nome: string
  inativa: boolean
  /** A avançada que anda com esta regular: marcar a opção marca as duas. */
  avancada?: { id: string; nome: string }
}

export interface GrupoDeEscopo {
  titulo: 'Unidades' | 'Regulares' | 'Avançadas' | 'Agrupadas'
  opcoes: OpcaoDeEscopo[]
}

const comoOpcao = (inativa: boolean) => (item: { id: string; nome: string }): OpcaoDeEscopo => ({ id: item.id, nome: item.nome, inativa })

/** O que o papel já tem e a lista de ativas não traz (nome e tipo vêm do próprio papel). */
const doPapelForaDe = <T extends { id: string }>(ativas: { id: string }[], doPapel: T[]): T[] =>
  doPapel.filter((item) => !ativas.some((ativa) => ativa.id === item.id))

const semGruposVazios = (grupos: GrupoDeEscopo[]): GrupoDeEscopo[] => grupos.filter((grupo) => grupo.opcoes.length > 0)

export function gruposDeUnidades(ativas: Unidade[], doPapel: RefUnidade[]): GrupoDeEscopo[] {
  const opcoes = [...ativas.map(comoOpcao(false)), ...doPapelForaDe(ativas, doPapel).map(comoOpcao(true))]
  return semGruposVazios([{ titulo: 'Unidades', opcoes }])
}

type ClasseDoEscopo = Pick<Classe, 'id' | 'nome' | 'tipo' | 'trilha'> & { classeBaseId?: string | null }

/**
 * A regular leva a avançada dela embaixo (as duas andam juntas); as agrupadas são uma turma à parte.
 * Avançada sem regular na lista (ou inativa, só presente porque o papel a tem) continua visível em "Avançadas".
 */
export function gruposDeClasses(classes: Classe[], doPapel: RefClasse[]): GrupoDeEscopo[] {
  const ativas = classes.filter((classe) => classe.ativa)
  const todas: Array<ClasseDoEscopo & { inativa: boolean }> = [
    ...ativas.map((classe) => ({ ...classe, inativa: false })),
    ...doPapelForaDe(ativas, doPapel).map((classe) => ({ ...classe, inativa: true })),
  ]
  const individuais = todas.filter((classe) => classe.trilha !== 'AGRUPADAS')
  const avancadasLigadas = new Set<string>()
  const regulares = individuais
    .filter((classe) => classe.tipo === 'REGULAR')
    .map((regular): OpcaoDeEscopo => {
      // Regular inativa não leva a avançada: ela vale sozinha e aparece como item próprio.
      const avancada = regular.inativa ? undefined : individuais.find((classe) => classe.tipo !== 'REGULAR' && !classe.inativa && classe.classeBaseId === regular.id)
      if (!avancada) return comoOpcao(regular.inativa)(regular)
      avancadasLigadas.add(avancada.id)
      return { ...comoOpcao(regular.inativa)(regular), avancada: { id: avancada.id, nome: avancada.nome } }
    })
  const soltas = individuais.filter((classe) => classe.tipo !== 'REGULAR' && !avancadasLigadas.has(classe.id))
  return semGruposVazios([
    { titulo: 'Regulares', opcoes: regulares },
    { titulo: 'Avançadas', opcoes: soltas.map((classe) => comoOpcao(classe.inativa)(classe)) },
    { titulo: 'Agrupadas', opcoes: todas.filter((classe) => classe.trilha === 'AGRUPADAS').map((classe) => comoOpcao(classe.inativa)(classe)) },
  ])
}

/** Os ids que a opção grava: ela e, quando tem, a avançada que anda junto. */
export const idsDaOpcao = (opcao: OpcaoDeEscopo): string[] => (opcao.avancada ? [opcao.id, opcao.avancada.id] : [opcao.id])

export const opcaoMarcada = (opcao: OpcaoDeEscopo, escolhidos: string[]): boolean => idsDaOpcao(opcao).some((id) => escolhidos.includes(id))

/** Quantas opções (não ids) estão marcadas, mesmo as que a busca esconde. */
export const contarMarcadas = (grupos: GrupoDeEscopo[], escolhidos: string[]): number =>
  grupos.reduce((total, grupo) => total + grupo.opcoes.filter((opcao) => opcaoMarcada(opcao, escolhidos)).length, 0)

/** "Maria vai instruir Amigo e Amigo da Natureza." — o que o envio vai gravar; vazio enquanto nada está marcado. */
export function resumoDasClasses(nome: string, grupos: GrupoDeEscopo[], escolhidos: string[]): string | null {
  const nomes = grupos.flatMap((grupo) =>
    grupo.opcoes.filter((opcao) => opcaoMarcada(opcao, escolhidos)).flatMap((opcao) => (opcao.avancada ? [opcao.nome, opcao.avancada.nome] : [opcao.nome])),
  )
  return nomes.length === 0 ? null : `${nome} vai instruir ${juntarNomes(nomes)}.`
}

/** Filtra pelo nome, sem acento e sem caixa; grupo sem resultado some. */
export function filtrarGrupos(grupos: GrupoDeEscopo[], busca: string): GrupoDeEscopo[] {
  const termo = semAcento(busca.trim())
  if (termo === '') return grupos
  return semGruposVazios(grupos.map((grupo) => ({ ...grupo, opcoes: grupo.opcoes.filter((opcao) => semAcento(opcao.nome).includes(termo) || semAcento(opcao.avancada?.nome ?? '').includes(termo)) })))
}

interface OpcoesLidas {
  estado: 'carregando' | 'erro' | 'pronto'
  erro?: unknown
  refazer: () => void
  grupos: GrupoDeEscopo[]
}

const SEM_ESCOPO = { unidades: [], classes: [] }

/** Lê só a lista que o papel usa (unidades ou classes) e a devolve em grupos; `doPapel` traz o que o papel já tem. */
export function useOpcoesDoEscopo(
  papel: 'CONSELHEIRO' | 'INSTRUTOR',
  doPapel: { unidades: RefUnidade[]; classes: RefClasse[] } = SEM_ESCOPO,
): OpcoesLidas {
  const unidades = useUnidades()
  const classes = useClasses()
  const consulta = papel === 'CONSELHEIRO' ? unidades : classes
  const refazer = () => void consulta.refetch()
  if (consulta.isError) return { estado: 'erro', erro: consulta.error, refazer, grupos: [] }
  if (papel === 'CONSELHEIRO' && unidades.data) return { estado: 'pronto', refazer, grupos: gruposDeUnidades(unidades.data.filter((unidade) => unidade.ativa), doPapel.unidades) }
  if (papel === 'INSTRUTOR' && classes.data) return { estado: 'pronto', refazer, grupos: gruposDeClasses(classes.data, doPapel.classes) }
  return { estado: 'carregando', refazer, grupos: [] }
}
