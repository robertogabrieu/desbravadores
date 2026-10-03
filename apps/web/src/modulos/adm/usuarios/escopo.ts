import { useClasses, useUnidades } from '../../../api/leitura'
import type { Classe, Unidade } from '../../../api/leitura'
import type { VinculoUsuario } from '../../../api/usuarios'
import { semAcento } from '../../progresso/formatos'

type RefUnidade = VinculoUsuario['unidades'][number]
type RefClasse = VinculoUsuario['classes'][number]

export interface OpcaoDeEscopo {
  id: string
  nome: string
  inativa: boolean
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

type ClasseDoEscopo = Pick<Classe, 'id' | 'nome' | 'tipo' | 'trilha'>

/** Os mesmos três grupos da tela de classes: as agrupadas são uma turma à parte. */
export function gruposDeClasses(classes: Classe[], doPapel: RefClasse[]): GrupoDeEscopo[] {
  const ativas = classes.filter((classe) => classe.ativa)
  const todas: Array<ClasseDoEscopo & { inativa: boolean }> = [
    ...ativas.map((classe) => ({ ...classe, inativa: false })),
    ...doPapelForaDe(ativas, doPapel).map((classe) => ({ ...classe, inativa: true })),
  ]
  const opcoesDe = (pertence: (classe: ClasseDoEscopo) => boolean) =>
    todas.filter(pertence).map((classe) => comoOpcao(classe.inativa)(classe))
  return semGruposVazios([
    { titulo: 'Regulares', opcoes: opcoesDe((c) => c.trilha !== 'AGRUPADAS' && c.tipo === 'REGULAR') },
    { titulo: 'Avançadas', opcoes: opcoesDe((c) => c.trilha !== 'AGRUPADAS' && c.tipo !== 'REGULAR') },
    { titulo: 'Agrupadas', opcoes: opcoesDe((c) => c.trilha === 'AGRUPADAS') },
  ])
}

/** Filtra pelo nome, sem acento e sem caixa; grupo sem resultado some. */
export function filtrarGrupos(grupos: GrupoDeEscopo[], busca: string): GrupoDeEscopo[] {
  const termo = semAcento(busca.trim())
  if (termo === '') return grupos
  return semGruposVazios(grupos.map((grupo) => ({ ...grupo, opcoes: grupo.opcoes.filter((opcao) => semAcento(opcao.nome).includes(termo)) })))
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
