import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ArquivoEnvio, ContextoAposEnvio, ContextoEnvio, ItemFila } from '../../offline'
import { obterTipo } from '../../offline/registro'
import { aoEnviar, formatarTamanho } from '../../offline/tipos/foto'
import type { PayloadFoto } from '../../offline/tipos/foto'

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const payload: PayloadFoto = {
  fotoId: uuid(900),
  albumTitulo: 'Reunião · 20/09',
  nomeArquivo: 'foto.jpg',
  dados: {
    versaoPayload: 1,
    album: { tipo: 'EXISTENTE', id: uuid(700) },
    legenda: 'Grito de guerra',
  },
}

const item = (blob: Blob): ItemFila<PayloadFoto> => ({
  id: 'i1', versaoPayload: 1, usuarioId: 'u', vinculoId: 'v', tipo: 'FOTO', chave: `foto:${payload.fotoId}`,
  rotulo: '', detalhe: '', payload, blob, estado: 'NA_FILA', progresso: 0, tentativas: 0,
  proximaTentativaEm: null, criadoEm: 1, atualizadoEm: 1,
})

describe('tipo FOTO da fila', () => {
  const tipo = obterTipo('FOTO')

  it('registra o tipo com rótulo do álbum e tamanho no detalhe', () => {
    expect(tipo).toBeDefined()
    expect(tipo?.rotulo(payload)).toBe('Foto · Reunião · 20/09')
    expect(tipo?.detalhe(payload, new Blob([new Uint8Array(1_700_000)]))).toBe('1,6 MB')
  })

  it('formata tamanhos pequenos em KB', () => {
    expect(formatarTamanho(512 * 1024)).toBe('512 KB')
    expect(formatarTamanho(1024 * 1024)).toBe('1,0 MB')
  })

  it('envia multipart PUT com o arquivo e o JSON em "dados"', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const enviarArquivo = vi.fn<ContextoEnvio['enviarArquivo']>(() => Promise.resolve({}))
    const ctx: ContextoEnvio = { requisitar: vi.fn(), enviarArquivo, queryClient: new QueryClient() }
    await tipo?.enviar(item(blob), ctx)
    const chamada = enviarArquivo.mock.calls[0]
    if (!chamada) throw new Error('enviarArquivo não foi chamado')
    const [caminho, arquivo]: [string, ArquivoEnvio] = [chamada[0], chamada[1]]
    expect(caminho).toBe(`/api/sync/fotos/${payload.fotoId}`)
    expect(arquivo.metodo).toBe('PUT')
    expect(arquivo.campoArquivo).toBe('arquivo')
    expect(arquivo.arquivo).toBe(blob)
    expect(arquivo.nomeArquivo).toBe('foto.jpg')
    expect(JSON.parse(arquivo.campos.dados ?? '')).toEqual(payload.dados)
  })

  it('a saída exige fotoId e albumId', () => {
    expect(tipo?.saida.safeParse({ fotoId: uuid(900), albumId: uuid(700) }).success).toBe(true)
    expect(tipo?.saida.safeParse({ fotoId: uuid(900) }).success).toBe(false)
  })

  it('ao enviar invalida os álbuns e o detalhe da reunião', async () => {
    const queryClient = new QueryClient()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
    const ctx = { queryClient, item: item(new Blob()) } as unknown as ContextoAposEnvio<PayloadFoto>
    await aoEnviar({ fotoId: uuid(900), albumId: uuid(700) }, ctx)
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['albuns'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['reuniao'] })
  })
})
