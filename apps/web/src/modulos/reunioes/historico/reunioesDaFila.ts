import { ReuniaoEnvio } from '@desbravadores/shared'
import { z } from 'zod'
import type { ItemFilaNaTela, PayloadReuniao } from '../../../offline'

const EsquemaPayloadReuniao = z.object({
  reuniaoId: z.string(),
  correcao: z.boolean(),
  unidadeNome: z.string(),
  corpo: ReuniaoEnvio,
})

/** Linha do histórico: reunião do servidor ou chamada ainda na fila deste aparelho. */
export interface LinhaHistorico {
  chave: string
  /** Id no servidor; sem ele a reunião só existe na fila. */
  id: string | null
  data: string
  presentes: number
  total: number
  atrasos: number
  uniformes: number
  percentual: number | null
  alterada: boolean
  naoEnviado: boolean
}

export const chaveDaReuniao = (unidadeId: string, data: string): string => `${unidadeId}:${data}`

function lerPayload(payload: unknown): PayloadReuniao | null {
  const lido = EsquemaPayloadReuniao.safeParse(payload)
  return lido.success ? lido.data : null
}

/** Chamadas ainda não enviadas da unidade no mês, com os números tirados das linhas do payload. */
export function reunioesDaFila(itens: ItemFilaNaTela[], unidadeId: string, mes: string): LinhaHistorico[] {
  const linhas: LinhaHistorico[] = []
  for (const item of itens) {
    if (item.tipo !== 'REUNIAO' || item.estado === 'ENVIADO') continue
    const payload = lerPayload(item.payload)
    if (!payload || payload.corpo.unidadeId !== unidadeId || !payload.corpo.data.startsWith(mes)) continue
    const marcacoes = payload.corpo.linhas
    const presentes = marcacoes.filter((m) => m.situacao === 'PRESENTE' || m.situacao === 'ATRASADO').length
    linhas.push({
      chave: item.chave,
      id: null,
      data: payload.corpo.data,
      presentes,
      total: marcacoes.length,
      atrasos: marcacoes.filter((m) => m.situacao === 'ATRASADO').length,
      uniformes: marcacoes.filter((m) => m.uniforme).length,
      percentual: marcacoes.length === 0 ? null : Math.round((presentes / marcacoes.length) * 100),
      alterada: false,
      naoEnviado: true,
    })
  }
  return linhas
}
