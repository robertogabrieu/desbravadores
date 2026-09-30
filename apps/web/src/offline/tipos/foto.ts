import { FotoEnvioSaida } from '@desbravadores/shared'
import type { FotoEnvioDados } from '@desbravadores/shared'
import type { z } from 'zod'
import { registrarTipo } from '../index'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila } from '../tipos'

/** Uma foto da fila: o arquivo já reduzido vai em `blob`, e o `dados` é o JSON do multipart. */
export interface PayloadFoto {
  fotoId: string
  /** Nome do álbum, só para o rótulo da fila. */
  albumTitulo: string
  nomeArquivo: string
  dados: z.infer<typeof FotoEnvioDados>
}

type Saida = z.infer<typeof FotoEnvioSaida>

const BYTES_POR_MB = 1024 * 1024

/** "1,6 MB" a partir de 1 MB; abaixo disso "512 KB". */
export function formatarTamanho(bytes: number): string {
  if (bytes >= BYTES_POR_MB) return `${(bytes / BYTES_POR_MB).toFixed(1).replace('.', ',')} MB`
  return `${Math.round(bytes / 1024)} KB`
}

const rotulo = (payload: PayloadFoto): string => `Foto · ${payload.albumTitulo}`

const detalhe = (_payload: PayloadFoto, blob?: Blob): string => (blob ? formatarTamanho(blob.size) : '')

// A chave é única por foto, então nunca há o que fundir; vale a mais nova.
const fundir = (_anterior: PayloadFoto, novo: PayloadFoto): PayloadFoto => novo

function enviar(item: ItemFila<PayloadFoto>, ctx: ContextoEnvio): Promise<unknown> {
  if (!item.blob) throw new Error('A foto guardada perdeu o arquivo')
  return ctx.enviarArquivo(
    `/api/sync/fotos/${item.payload.fotoId}`,
    {
      metodo: 'PUT',
      campos: { dados: JSON.stringify(item.payload.dados) },
      campoArquivo: 'arquivo',
      arquivo: item.blob,
      nomeArquivo: item.payload.nomeArquivo,
    },
    // O motor já grava o progresso que o contexto recebe; nada a acrescentar aqui.
    () => undefined,
  )
}

/** Álbuns (lista e detalhe) e o detalhe da reunião, que mostra miniaturas do álbum dela. */
export async function aoEnviar(_saida: Saida, ctx: Pick<ContextoAposEnvio<PayloadFoto>, 'queryClient'>): Promise<void> {
  await Promise.all([ctx.queryClient.invalidateQueries({ queryKey: ['albuns'] }), ctx.queryClient.invalidateQueries({ queryKey: ['reuniao'] })])
}

registrarTipo({ tipo: 'FOTO', rotulo, detalhe, fundir, enviar, saida: FotoEnvioSaida, aoEnviar })
