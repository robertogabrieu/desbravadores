import sharp, { type Sharp } from 'sharp'
import { ErroApp } from '../comum/erros'

// Uma foto por vez e sem cache de decodificacao: o container da API tem 384 MB (SPEC Fase 1, E10).
sharp.concurrency(1)
sharp.cache(false)

export const LIMITE_BYTES_FOTO = 2 * 1024 * 1024
const LIMITE_PIXELS = 40_000_000
const LADO_MAIOR = 1600
const LADO_MINIATURA = 400
const QUALIDADE = 80
const FORMATOS_ACEITOS = new Set(['jpeg', 'png', 'webp'])

const FORMATO_NAO_ACEITO = 'Formato de foto não aceito.'
const GRANDE_DEMAIS = 'Foto grande demais.'

export interface FotoProcessada {
  original: Buffer
  miniatura: Buffer
  largura: number
  altura: number
}

function reduzida(entrada: Sharp, lado: number): Sharp {
  return entrada
    .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALIDADE, mozjpeg: true })
}

/**
 * Confere o formato pelos bytes (o nome e o tipo que o cliente declara nao valem), limita os
 * pixels, aplica a orientacao do EXIF e regrava como JPEG sem metadados, mais a miniatura.
 */
export async function processarFoto(bytes: Buffer): Promise<FotoProcessada> {
  try {
    const { format, width, height } = await sharp(bytes, { limitInputPixels: LIMITE_PIXELS }).metadata()
    if (!format || !FORMATOS_ACEITOS.has(format)) throw new ErroApp('REGRA', FORMATO_NAO_ACEITO)
    if ((width ?? 0) * (height ?? 0) > LIMITE_PIXELS) throw new ErroApp('REGRA', GRANDE_DEMAIS)

    const base = sharp(bytes, { limitInputPixels: LIMITE_PIXELS }).rotate().flatten({ background: '#ffffff' })
    const { data: original, info } = await reduzida(base, LADO_MAIOR).toBuffer({ resolveWithObject: true })
    const miniatura = await reduzida(sharp(original), LADO_MINIATURA).toBuffer()
    return { original, miniatura, largura: info.width, altura: info.height }
  } catch (erro) {
    if (erro instanceof ErroApp) throw erro
    const excedeuPixels = erro instanceof Error && /pixel limit/i.test(erro.message)
    throw new ErroApp('REGRA', excedeuPixels ? GRANDE_DEMAIS : FORMATO_NAO_ACEITO)
  }
}
