import { AulaEnvio, AulaEnvioSaida } from '@desbravadores/shared'
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
  corpo: z.infer<typeof AulaEnvio>
}

type Saida = z.infer<typeof AulaEnvioSaida>
type Par = { dbvId: string; requisitoId: string }

const RAIZES_INVALIDADAS = ['aulas', 'aula', 'progresso', 'inicio-instrutor', 'ranking']

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const rotulo = (payload: PayloadAulaFila): string =>
  `${payload.correcao ? 'Correção na aula' : 'Aula'} · ${payload.classeNome} · ${diaMes(payload.corpo.data)}`

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
    corpo: {
      ...novo.corpo,
      aulaPlanejadaId: novo.corpo.aulaPlanejadaId ?? anterior.corpo.aulaPlanejadaId,
      presencas: [...presencas.values()],
      ...fundirMarcacoes(anterior.corpo, novo.corpo),
    },
  }
}

const enviar = (item: ItemFila<PayloadAulaFila>, ctx: ContextoEnvio): Promise<unknown> =>
  ctx.requisitar(`/api/sync/aulas/${item.payload.registroAulaId}`, { metodo: 'PUT', corpo: item.payload.corpo })

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
    toast.warning(`Faltaram à aula, então o requisito não valeu: ${ausentes.map((item) => `${nome(item.dbvId)} (${codigo(item.requisitoId)})`).join(', ')}.`)
  }
  const invalidos = semEfeito('REQUISITO_INVALIDO')
  if (invalidos.length > 0) {
    toast.warning(`Requisito que não é mais da classe ficou de fora: ${invalidos.map((item) => `${nome(item.dbvId)} (${codigo(item.requisitoId)})`).join(', ')}.`)
  }
  for (const aviso of saida.avisos) toast.warning(aviso)
}

/** Passa para os itens seguintes da chave o id do registro e as versões que este envio acabou de gravar. */
async function atualizarSeguintes(saida: Saida, ctx: ContextoAposEnvio<PayloadAulaFila>): Promise<void> {
  const versoes = new Map(saida.presencas.map((presenca) => [presenca.dbvId, presenca.versao]))
  for (const seguinte of await ctx.seguintesDaChave()) {
    await ctx.atualizarPayload(seguinte.id, {
      ...seguinte.payload,
      registroAulaId: saida.registroAulaId,
      correcao: true,
      corpo: {
        ...seguinte.payload.corpo,
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
