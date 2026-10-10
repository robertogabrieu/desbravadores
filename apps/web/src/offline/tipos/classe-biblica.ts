import { ChamadaCBEnvio, ChamadaCBEnvioSaida } from '@desbravadores/shared'
import { toast } from 'sonner'
import { z } from 'zod'
import { diaMes } from '../../modulos/classe-biblica/formatos'
import { itensDaChave, registrarTipo } from '../index'
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

const PayloadDaFila = z.object({
  encontroId: z.string(),
  grupoId: z.string(),
  grupoNome: z.string(),
  data: z.string(),
  corpo: ChamadaCBEnvio,
})

const RAIZES_INVALIDADAS = ['classe-biblica', 'inicio', 'ranking', 'progresso']

export const chaveDaChamadaCB = (encontroId: string, grupoId: string): string => `classe-biblica:${encontroId}:${grupoId}`

/** Itens CLASSE_BIBLICA ainda não enviados (na fila, enviando ou com erro), na ordem de criação; payload ilegível fica fora. */
export function pendentesDaChamadaCB(itens: ItemFila[]): ItemFila<PayloadChamadaCB>[] {
  return itens
    .filter((item) => item.tipo === 'CLASSE_BIBLICA' && item.estado !== 'ENVIADO')
    .sort((a, b) => a.criadoEm - b.criadoEm)
    .flatMap((item) => {
      const lido = PayloadDaFila.safeParse(item.payload)
      return lido.success ? [{ ...item, payload: lido.data }] : []
    })
}

/** O que o aparelho ainda guarda da chamada deste encontro e grupo; vazio = nada pendente. */
export async function chamadaCBNaFila(encontroId: string, grupoId: string): Promise<ItemFila<PayloadChamadaCB>[]> {
  return pendentesDaChamadaCB(await itensDaChave(chaveDaChamadaCB(encontroId, grupoId)))
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

/** Versão gravada por desbravador (`dbvId` → `versao`). */
type OuvinteDoEnvio = (versoes: Map<string, string>) => void
const ouvintesDoEnvio = new Map<string, Set<OuvinteDoEnvio>>()

/** A tela aberta desta chamada ouve os envios dela, para a correção seguinte partir das versões gravadas. */
export function ouvirEnvioDaChamadaCB(encontroId: string, grupoId: string, ouvinte: OuvinteDoEnvio): () => void {
  const chave = chaveDaChamadaCB(encontroId, grupoId)
  const ouvintes = ouvintesDoEnvio.get(chave) ?? new Set()
  ouvintes.add(ouvinte)
  ouvintesDoEnvio.set(chave, ouvintes)
  return () => {
    ouvintes.delete(ouvinte)
    if (ouvintes.size === 0) ouvintesDoEnvio.delete(chave)
  }
}

function contarATela(saida: Saida, payload: PayloadChamadaCB): void {
  const versoes = new Map(saida.linhas.map((linha) => [linha.dbvId, linha.versao]))
  ouvintesDoEnvio.get(chaveDaChamadaCB(payload.encontroId, payload.grupoId))?.forEach((ouvinte) => ouvinte(versoes))
}

export async function aoEnviar(saida: Saida, ctx: ContextoAposEnvio<PayloadChamadaCB>): Promise<void> {
  await atualizarSeguintes(saida, ctx)
  contarATela(saida, ctx.item.payload)
  await Promise.all(RAIZES_INVALIDADAS.map((raiz) => ctx.queryClient.invalidateQueries({ queryKey: [raiz] })))
  await ctx.baixarPacote()
  avisar(saida)
}

registrarTipo({ tipo: 'CLASSE_BIBLICA', rotulo, detalhe, fundir, enviar, saida: ChamadaCBEnvioSaida, aoEnviar })
