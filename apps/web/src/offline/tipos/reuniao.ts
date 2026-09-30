import { ReuniaoEnvioSaida } from '@desbravadores/shared'
import { toast } from 'sonner'
import type { z } from 'zod'
import { registrarTipo } from '../index'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila, PayloadReuniao } from '../tipos'

/** O que a fila guarda: o payload do contrato mais a soma provisória de pontos, só para o `detalhe`. */
export interface PayloadReuniaoFila extends PayloadReuniao {
  pontosProvisorios: number
}

type Saida = z.infer<typeof ReuniaoEnvioSaida>

const RAIZES_INVALIDADAS = ['reunioes', 'reuniao', 'grade', 'inicio', 'ranking']

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const rotulo = (payload: PayloadReuniaoFila): string =>
  `${payload.correcao ? 'Correção na chamada' : 'Chamada'} · ${payload.unidadeNome} · ${diaMes(payload.corpo.data)}`

const detalhe = (payload: PayloadReuniaoFila): string =>
  `${payload.corpo.linhas.length} DBVs · ${payload.pontosProvisorios} pts (provisório)`

/** Linhas por desbravador (a nova vence) e cabeçalho `novo ?? anterior`. */
export function fundir(anterior: PayloadReuniaoFila, novo: PayloadReuniaoFila): PayloadReuniaoFila {
  const linhas = new Map(anterior.corpo.linhas.map((linha) => [linha.dbvId, linha]))
  for (const linha of novo.corpo.linhas) linhas.set(linha.dbvId, linha)
  return {
    ...novo,
    reuniaoId: anterior.reuniaoId,
    correcao: anterior.correcao,
    corpo: { ...novo.corpo, cabecalho: novo.corpo.cabecalho ?? anterior.corpo.cabecalho, linhas: [...linhas.values()] },
  }
}

const enviar = (item: ItemFila<PayloadReuniaoFila>, ctx: ContextoEnvio): Promise<unknown> =>
  ctx.requisitar(`/api/sync/reunioes/${item.payload.reuniaoId}`, { metodo: 'PUT', corpo: item.payload.corpo })

const nomes = (lista: { nome: string }[]): string => lista.map((item) => item.nome).join(', ')

function avisar(saida: Saida): void {
  if (saida.conflitoCabecalho) toast.warning('O horário ou as observações tinham sido mudados por outra pessoa; a sua versão valeu.')
  if (saida.conflitos.length > 0) {
    toast.warning(
      `${saida.conflitos.length} linhas tinham sido alteradas por outra pessoa; a sua versão valeu e a anterior ficou registrada: ${nomes(saida.conflitos)}.`,
    )
  }
  if (saida.ignorados.length > 0) toast.warning(`${nomes(saida.ignorados)} não eram da unidade nessa data e ficaram fora.`)
}

/** Passa para os itens seguintes da chave as versões que este envio acabou de gravar. */
async function atualizarSeguintes(saida: Saida, ctx: ContextoAposEnvio<PayloadReuniaoFila>): Promise<void> {
  const versoes = new Map(saida.linhas.map((linha) => [linha.dbvId, linha.versao]))
  for (const seguinte of await ctx.seguintesDaChave()) {
    const { corpo } = seguinte.payload
    await ctx.atualizarPayload(seguinte.id, {
      ...seguinte.payload,
      reuniaoId: saida.reuniaoId,
      corpo: {
        ...corpo,
        cabecalho: corpo.cabecalho && { ...corpo.cabecalho, versaoVista: saida.cabecalhoVersao },
        linhas: corpo.linhas.map((linha) => ({ ...linha, versaoVista: versoes.get(linha.dbvId) ?? linha.versaoVista })),
      },
    })
  }
}

export async function aoEnviar(saida: Saida, ctx: ContextoAposEnvio<PayloadReuniaoFila>): Promise<void> {
  await atualizarSeguintes(saida, ctx)
  await Promise.all(RAIZES_INVALIDADAS.map((raiz) => ctx.queryClient.invalidateQueries({ queryKey: [raiz] })))
  await ctx.baixarPacote()
  avisar(saida)
}

registrarTipo({ tipo: 'REUNIAO', rotulo, detalhe, fundir, enviar, saida: ReuniaoEnvioSaida, aoEnviar })
