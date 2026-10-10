import { ChamadaCBEnvioSaida } from '@desbravadores/shared'
import type { ChamadaCBEnvio } from '@desbravadores/shared'
import { toast } from 'sonner'
import type { z } from 'zod'
import { registrarTipo } from '../index'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila } from '../tipos'

/** Item CLASSE_BIBLICA (chave `classe-biblica:<encontroId>:<grupoId>`): o corpo do contrato mais o que o rótulo mostra. */
export interface PayloadChamadaCB {
  encontroId: string
  grupoId: string
  grupoNome: string
  data: string
  corpo: z.infer<typeof ChamadaCBEnvio>
}

type Saida = z.infer<typeof ChamadaCBEnvioSaida>

const RAIZES_INVALIDADAS = ['classe-biblica', 'inicio', 'ranking', 'progresso']

export const chaveDaChamadaCB = (encontroId: string, grupoId: string): string => `classe-biblica:${encontroId}:${grupoId}`

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const rotulo = (payload: PayloadChamadaCB): string => `Chamada da Classe Bíblica · ${payload.grupoNome} · ${diaMes(payload.data)}`

function detalhe(payload: PayloadChamadaCB): string {
  const { linhas } = payload.corpo
  if (linhas.length === 0) return 'Sem ninguém no grupo'
  const presentes = linhas.filter((linha) => linha.presente).length
  const faltas = linhas.length - presentes
  return `${presentes} ${presentes === 1 ? 'presente' : 'presentes'} · ${faltas} ${faltas === 1 ? 'falta' : 'faltas'}`
}

/** Linhas por desbravador: a última ação vence. */
export function fundir(anterior: PayloadChamadaCB, novo: PayloadChamadaCB): PayloadChamadaCB {
  const linhas = new Map(anterior.corpo.linhas.map((linha) => [linha.dbvId, linha]))
  for (const linha of novo.corpo.linhas) linhas.set(linha.dbvId, linha)
  return { ...novo, corpo: { ...novo.corpo, linhas: [...linhas.values()] } }
}

const enviar = (item: ItemFila<PayloadChamadaCB>, ctx: ContextoEnvio): Promise<unknown> =>
  ctx.requisitar(`/api/sync/classe-biblica/encontros/${item.payload.encontroId}/grupos/${item.payload.grupoId}`, {
    metodo: 'PUT',
    corpo: item.payload.corpo,
  })

const nomes = (lista: { nome: string }[]): string => lista.map((item) => item.nome).join(', ')

function avisar(saida: Saida): void {
  if (saida.conflitos.length > 0) toast.warning(`Outra pessoa tinha mudado a chamada de ${nomes(saida.conflitos)}; a sua versão valeu.`)
  if (saida.ignorados.length > 0) toast.warning(`${nomes(saida.ignorados)} não estavam na lista desta chamada e ficaram fora.`)
}

/** Passa para os itens seguintes da chave as versões que este envio acabou de gravar. */
async function atualizarSeguintes(saida: Saida, ctx: ContextoAposEnvio<PayloadChamadaCB>): Promise<void> {
  const versoes = new Map(saida.linhas.map((linha) => [linha.dbvId, linha.versao]))
  for (const seguinte of await ctx.seguintesDaChave()) {
    const { corpo } = seguinte.payload
    await ctx.atualizarPayload(seguinte.id, {
      ...seguinte.payload,
      corpo: { ...corpo, linhas: corpo.linhas.map((linha) => ({ ...linha, versaoVista: versoes.get(linha.dbvId) ?? linha.versaoVista })) },
    })
  }
}

export async function aoEnviar(saida: Saida, ctx: ContextoAposEnvio<PayloadChamadaCB>): Promise<void> {
  await atualizarSeguintes(saida, ctx)
  await Promise.all(RAIZES_INVALIDADAS.map((raiz) => ctx.queryClient.invalidateQueries({ queryKey: [raiz] })))
  await ctx.baixarPacote()
  avisar(saida)
}

registrarTipo({ tipo: 'CLASSE_BIBLICA', rotulo, detalhe, fundir, enviar, saida: ChamadaCBEnvioSaida, aoEnviar })
