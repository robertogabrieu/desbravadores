import { AulaEnvio, AulaEnvioSaida, ItemTarefa } from '@desbravadores/shared'
import { toast } from 'sonner'
import type { z } from 'zod'
import { registrarTipo } from '../index'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila } from '../tipos'

/** Payload do item AULA (chave `aula:<classeId>:<data>`). O pacote B1 escreve; o histórico lê. */
export interface PayloadAulaFila {
  /** O `:uuid` do PUT: id do registro existente, ou UUID novo gerado no aparelho. */
  registroAulaId: string
  /** `true` quando o registro já existia (rótulo de correção). */
  correcao: boolean
  classeNome: string
  /** Nome de cada desbravador e código de cada requisito do corpo, só para os avisos depois do envio. */
  nomes: Record<string, string>
  codigos: Record<string, string>
  /** Nome de cada especialidade da tarefa, para o aviso; ausente em item guardado antes de a tarefa existir. */
  especialidades?: Record<string, string>
  corpo: z.infer<typeof AulaEnvio>
}

type Saida = z.infer<typeof AulaEnvioSaida>
type Par = { dbvId: string; requisitoId: string }
type Item = z.infer<typeof ItemTarefa>
type ParEspecialidade = { dbvId: string; especialidadeId: string }

const RAIZES_INVALIDADAS = ['aulas', 'aula', 'progresso', 'inicio', 'cronograma', 'ranking']

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const rotulo = (payload: PayloadAulaFila): string =>
  `${payload.correcao ? 'Correção na classe' : 'Classe'} · ${payload.classeNome} · ${diaMes(payload.corpo.data)}`

const detalhe = (payload: PayloadAulaFila): string =>
  `${payload.corpo.presencas.filter((p) => p.presente).length} presentes · ${payload.corpo.requisitosMarcados.length} requisitos`

const chavePar = (par: Par): string => `${par.dbvId}|${par.requisitoId}`

/** Marcações por par: a última ação vence (marcar depois de desmarcar = marcado). */
function fundirMarcacoes(anterior: PayloadAulaFila['corpo'], novo: PayloadAulaFila['corpo']): Pick<PayloadAulaFila['corpo'], 'requisitosMarcados' | 'requisitosDesmarcados'> {
  const acoes = new Map<string, { par: Par; marcar: boolean }>()
  for (const corpo of [anterior, novo]) {
    for (const par of corpo.requisitosMarcados) acoes.set(chavePar(par), { par, marcar: true })
    for (const par of corpo.requisitosDesmarcados) acoes.set(chavePar(par), { par, marcar: false })
  }
  const todas = [...acoes.values()]
  return {
    requisitosMarcados: todas.filter((a) => a.marcar).map((a) => a.par),
    requisitosDesmarcados: todas.filter((a) => !a.marcar).map((a) => a.par),
  }
}

const chaveItem = (item: Item): string => ('requisitoId' in item ? `requisito:${item.requisitoId}` : `especialidade:${item.especialidadeId}`)

/** Itens da tarefa por item: a última ação vence. Item guardado antes da tarefa existir não traz as listas. */
function fundirItens(anterior: Partial<PayloadAulaFila['corpo']>, novo: Partial<PayloadAulaFila['corpo']>): Pick<PayloadAulaFila['corpo'], 'tarefaItensAcrescentados' | 'tarefaItensRetirados'> {
  const acoes = new Map<string, { item: Item; acrescentar: boolean }>()
  for (const corpo of [anterior, novo]) {
    for (const item of corpo.tarefaItensAcrescentados ?? []) acoes.set(chaveItem(item), { item, acrescentar: true })
    for (const item of corpo.tarefaItensRetirados ?? []) acoes.set(chaveItem(item), { item, acrescentar: false })
  }
  const todas = [...acoes.values()]
  return {
    tarefaItensAcrescentados: todas.filter((a) => a.acrescentar).map((a) => a.item),
    tarefaItensRetirados: todas.filter((a) => !a.acrescentar).map((a) => a.item),
  }
}

const chaveEspecialidade = (par: ParEspecialidade): string => `${par.dbvId}|${par.especialidadeId}`

/** Entregas de especialidade por par: a última ação vence. Item guardado antes da cobrança não traz as listas. */
function fundirEntregas(anterior: Partial<PayloadAulaFila['corpo']>, novo: Partial<PayloadAulaFila['corpo']>): Pick<PayloadAulaFila['corpo'], 'especialidadesMarcadas' | 'especialidadesDesmarcadas'> {
  const acoes = new Map<string, { par: ParEspecialidade; marcar: boolean }>()
  for (const corpo of [anterior, novo]) {
    for (const par of corpo.especialidadesMarcadas ?? []) acoes.set(chaveEspecialidade(par), { par, marcar: true })
    for (const par of corpo.especialidadesDesmarcadas ?? []) acoes.set(chaveEspecialidade(par), { par, marcar: false })
  }
  const todas = [...acoes.values()]
  return {
    especialidadesMarcadas: todas.filter((a) => a.marcar).map((a) => a.par),
    especialidadesDesmarcadas: todas.filter((a) => !a.marcar).map((a) => a.par),
  }
}

/** Presenças por desbravador (a nova vence), marcações por par (a última vence) e a identidade da aula original. */
export function fundir(anterior: PayloadAulaFila, novo: PayloadAulaFila): PayloadAulaFila {
  const presencas = new Map(anterior.corpo.presencas.map((presenca) => [presenca.dbvId, presenca]))
  for (const presenca of novo.corpo.presencas) presencas.set(presenca.dbvId, presenca)
  return {
    ...novo,
    registroAulaId: anterior.registroAulaId,
    correcao: anterior.correcao,
    nomes: { ...anterior.nomes, ...novo.nomes },
    codigos: { ...anterior.codigos, ...novo.codigos },
    especialidades: { ...anterior.especialidades, ...novo.especialidades },
    corpo: {
      ...novo.corpo,
      aulaPlanejadaId: novo.corpo.aulaPlanejadaId ?? anterior.corpo.aulaPlanejadaId,
      presencas: [...presencas.values()],
      ...fundirMarcacoes(anterior.corpo, novo.corpo),
      ...fundirItens(anterior.corpo, novo.corpo),
      ...fundirEntregas(anterior.corpo, novo.corpo),
      tarefasEncerradas: [...new Set([...(anterior.corpo.tarefasEncerradas ?? []), ...(novo.corpo.tarefasEncerradas ?? [])])],
      tarefaId: anterior.corpo.tarefaId ?? novo.corpo.tarefaId ?? null,
    },
  }
}

const enviar = (item: ItemFila<PayloadAulaFila>, ctx: ContextoEnvio): Promise<unknown> =>
  ctx.requisitar(`/api/sync/aulas/${item.payload.registroAulaId}`, { metodo: 'PUT', corpo: item.payload.corpo })

type SemEfeitoDeEspecialidade = Saida['especialidadesSemEfeito'][number]

function avisarEspecialidades(saida: Saida, nome: (dbvId: string) => string, nomeDaEspecialidade: (especialidadeId: string) => string): void {
  const doMotivo = (motivo: SemEfeitoDeEspecialidade['motivo']) => saida.especialidadesSemEfeito.filter((item) => item.motivo === motivo)
  const quem = (item: SemEfeitoDeEspecialidade): string => `${nome(item.dbvId)} (${nomeDaEspecialidade(item.especialidadeId)})`
  const jaConcluidas = doMotivo('JA_CONCLUIDA')
  if (jaConcluidas.length > 0) {
    toast.warning(`Já estava concluída e ficou como estava: ${jaConcluidas.map((item) => `${quem(item)}${item.concluidaEm ? ` em ${diaMes(item.concluidaEm)}` : ''}`).join(', ')}.`)
  }
  const ausentes = doMotivo('AUSENTE')
  if (ausentes.length > 0) toast.warning(`Faltou ao encontro, então a entrega não valeu: ${ausentes.map(quem).join(', ')}.`)
  const invalidas = doMotivo('ESPECIALIDADE_INVALIDA')
  if (invalidas.length > 0) {
    const nomes = [...new Set(invalidas.map((item) => nomeDaEspecialidade(item.especialidadeId)))]
    toast.warning(`Especialidade que não está mais ativa ficou de fora: ${nomes.join(', ')}.`)
  }
  const semPermissao = doMotivo('SEM_PERMISSAO').length > 0 || saida.tarefaItensSemEfeito.some((sem) => sem.motivo === 'SEM_PERMISSAO')
  if (semPermissao) toast.warning('Sem permissão para marcar especialidades; elas ficaram de fora.')
}

function avisar(saida: Saida, payload: PayloadAulaFila): void {
  const nome = (dbvId: string): string => payload.nomes[dbvId] ?? 'um desbravador'
  const codigo = (requisitoId: string): string => payload.codigos[requisitoId] ?? 'requisito'
  const nomes = (lista: { nome: string }[]): string => lista.map((item) => item.nome).join(', ')
  if (saida.conflitos.length > 0) {
    toast.warning(`As presenças de ${nomes(saida.conflitos)} tinham sido alteradas por outra pessoa; a sua versão valeu e a anterior ficou registrada.`)
  }
  if (saida.ignorados.length > 0) toast.warning(`${nomes(saida.ignorados)} não eram da classe nessa data e ficaram fora.`)
  const semEfeito = (motivo: Saida['requisitosSemEfeito'][number]['motivo']) => saida.requisitosSemEfeito.filter((item) => item.motivo === motivo)
  const jaConcluidos = semEfeito('JA_CONCLUIDO')
  if (jaConcluidos.length > 0) {
    const itens = jaConcluidos.map((item) => `${nome(item.dbvId)} (${codigo(item.requisitoId)})${item.concluidoEm ? ` em ${diaMes(item.concluidoEm)}` : ''}`)
    toast.warning(`Já estavam concluídos e ficaram como estavam: ${itens.join(', ')}.`)
  }
  const ausentes = semEfeito('AUSENTE')
  if (ausentes.length > 0) {
    toast.warning(`Faltaram à classe, então o requisito não valeu: ${ausentes.map((item) => `${nome(item.dbvId)} (${codigo(item.requisitoId)})`).join(', ')}.`)
  }
  const invalidos = semEfeito('REQUISITO_INVALIDO')
  if (invalidos.length > 0) {
    toast.warning(`Requisito que não é mais da classe ficou de fora: ${invalidos.map((item) => `${nome(item.dbvId)} (${codigo(item.requisitoId)})`).join(', ')}.`)
  }
  const nomeDaEspecialidade = (especialidadeId: string): string => payload.especialidades?.[especialidadeId] ?? 'especialidade'
  const nomeDoItem = (item: Item): string => ('requisitoId' in item ? codigo(item.requisitoId) : nomeDaEspecialidade(item.especialidadeId))
  const naoEntraram = saida.tarefaItensSemEfeito.filter((sem) => sem.motivo !== 'SEM_PERMISSAO')
  if (naoEntraram.length > 0) {
    toast.warning(`Não entrou na tarefa porque não vale mais ou já está em outra tarefa: ${naoEntraram.map((sem) => nomeDoItem(sem.item)).join(', ')}.`)
  }
  avisarEspecialidades(saida, nome, nomeDaEspecialidade)
  for (const aviso of saida.avisos) toast.warning(aviso)
}

/** Passa para os itens seguintes da chave o id do registro e as versões que este envio acabou de gravar. */
async function atualizarSeguintes(saida: Saida, ctx: ContextoAposEnvio<PayloadAulaFila>): Promise<void> {
  const versoes = new Map(saida.presencas.map((presenca) => [presenca.dbvId, presenca.versao]))
  for (const seguinte of await ctx.seguintesDaChave()) {
    // Item guardado antes da tarefa existir não traz o campo; sem tarefa no item, não se inventa uma.
    const { tarefaId }: Partial<PayloadAulaFila['corpo']> = seguinte.payload.corpo
    await ctx.atualizarPayload(seguinte.id, {
      ...seguinte.payload,
      registroAulaId: saida.registroAulaId,
      correcao: true,
      corpo: {
        ...seguinte.payload.corpo,
        tarefaId: tarefaId ? (saida.tarefaId ?? tarefaId) : null,
        presencas: seguinte.payload.corpo.presencas.map((presenca) => ({ ...presenca, versaoVista: versoes.get(presenca.dbvId) ?? presenca.versaoVista })),
      },
    })
  }
}

export async function aoEnviar(saida: Saida, ctx: ContextoAposEnvio<PayloadAulaFila>): Promise<void> {
  await atualizarSeguintes(saida, ctx)
  await Promise.all(RAIZES_INVALIDADAS.map((raiz) => ctx.queryClient.invalidateQueries({ queryKey: [raiz] })))
  await ctx.baixarPacote()
  avisar(saida, ctx.item.payload)
}

registrarTipo({ tipo: 'AULA', rotulo, detalhe, fundir, enviar, saida: AulaEnvioSaida, aoEnviar })
