import { open } from 'node:fs/promises'

export interface FormatoDeComprovante {
  ext: 'jpg' | 'png' | 'webp' | 'pdf'
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
}

const BYTES_LIDOS = 12

const ehIgual = (cabeca: Buffer, inicio: number, esperado: string | number[]): boolean => {
  const bytes = typeof esperado === 'string' ? Buffer.from(esperado, 'latin1') : Buffer.from(esperado)
  return cabeca.subarray(inicio, inicio + bytes.length).equals(bytes)
}

/** O formato pelos bytes do início do arquivo: extensão e `Content-Type` do cliente não provam nada. `null` se não for foto nem PDF aceitos. */
export async function formatoDoComprovante(caminho: string): Promise<FormatoDeComprovante | null> {
  const arquivo = await open(caminho, 'r')
  try {
    const cabeca = Buffer.alloc(BYTES_LIDOS)
    const { bytesRead } = await arquivo.read(cabeca, 0, BYTES_LIDOS, 0)
    const lida = cabeca.subarray(0, bytesRead)
    if (ehIgual(lida, 0, '%PDF-')) return { ext: 'pdf', mime: 'application/pdf' }
    if (ehIgual(lida, 0, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg' }
    if (ehIgual(lida, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png' }
    if (ehIgual(lida, 0, 'RIFF') && ehIgual(lida, 8, 'WEBP')) return { ext: 'webp', mime: 'image/webp' }
    return null
  } finally {
    await arquivo.close()
  }
}
