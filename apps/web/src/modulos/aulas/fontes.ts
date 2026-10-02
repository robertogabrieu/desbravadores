import type { AulaDetalhe, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { chaveItem, chavePar } from './estado'
import type { BaseAula } from './estado'

type Pacote = z.infer<typeof PacoteSaida>
type ClasseDoPacote = NonNullable<Pacote['instrutor']>['classes'][number]
type Registro = ClasseDoPacote['registrosRecentes'][number]

export function baseDoDetalhe(detalhe: z.infer<typeof AulaDetalhe>): BaseAula {
  return {
    registroAulaId: detalhe.id,
    aulaPlanejadaId: detalhe.aulaPlanejadaId,
    presencas: detalhe.presencas,
    requisitos: detalhe.requisitosDaAula,
    concluidosNaAula: detalhe.concluidosNaAula,
  }
}

/** O pacote guarda as presenças e as conclusões de cada membro: o que tem `registroAulaId` desta aula já foi concluído nela. */
export function baseDoPacote(registro: Registro, classe: ClasseDoPacote): BaseAula {
  const concluidosNaAula = classe.membros.flatMap((membro) =>
    (membro.conclusoes ?? []).filter((conclusao) => conclusao.registroAulaId === registro.id).map((conclusao) => ({ dbvId: membro.dbvId, requisitoId: conclusao.requisitoId })),
  )
  const idsDaAula = new Set(concluidosNaAula.map((par) => par.requisitoId))
  return {
    registroAulaId: registro.id,
    aulaPlanejadaId: registro.aulaPlanejadaId,
    presencas: registro.presencas,
    requisitos: classe.requisitos.filter((requisito) => idsDaAula.has(requisito.id)),
    concluidosNaAula,
  }
}

type Tarefa = ClasseDoPacote['tarefas'][number]
export type EspecialidadeDoCatalogo = NonNullable<NonNullable<Pacote['instrutor']>['especialidades']>[number]

/** Classe guardada antes das tarefas não traz o campo. */
export function tarefasDaClasse(classe: ClasseDoPacote): Tarefa[] {
  const { tarefas }: Partial<ClasseDoPacote> = classe
  return tarefas ?? []
}

/** `null` = pacote de antes do catálogo: a tela pede internet uma vez. */
export const catalogoDeEspecialidades = (pacote: Pacote): EspecialidadeDoCatalogo[] | null => pacote.instrutor?.especialidades ?? null

/** Itens das tarefas abertas da classe, fora a deste registro (os dela a tela mostra à parte). */
export const itensEmOutraTarefaAberta = (tarefas: Tarefa[], registroAulaId: string): Set<string> =>
  new Set(tarefas.filter((t) => !t.encerrada && t.registroAulaId !== registroAulaId).flatMap((t) => t.itens.map(chaveItem)))

/** Pares `dbvId|especialidadeId` concluídos NESTE registro, como o pacote os guarda em cada membro. */
export const especialidadesConcluidasNoRegistro = (classe: ClasseDoPacote, registroAulaId: string): Set<string> =>
  new Set(classe.membros.flatMap((membro) => (membro.especialidades ?? []).filter((conclusao) => conclusao.registroAulaId === registroAulaId).map((conclusao) => chavePar(membro.dbvId, conclusao.especialidadeId))))

interface ParaCobrar {
  tarefas: Tarefa[]
  registroAulaId: string
  data: string
  /** Chaves (`chaveItem`) dos itens que alguém entregou neste registro. */
  entregues: ReadonlySet<string>
}

/** Abertas de data anterior à do registro e as com entrega neste registro (mesmo encerradas); abertas primeiro, da mais recente para a mais antiga. */
export function tarefasParaCobrar({ tarefas, registroAulaId, data, entregues }: ParaCobrar): Tarefa[] {
  const entregueAqui = (tarefa: Tarefa): boolean => tarefa.itens.some((item) => entregues.has(chaveItem(item)))
  return tarefas
    .filter((tarefa) => tarefa.registroAulaId !== registroAulaId && ((!tarefa.encerrada && tarefa.data < data) || entregueAqui(tarefa)))
    .sort((a, b) => Number(a.encerrada) - Number(b.encerrada) || b.data.localeCompare(a.data))
}
