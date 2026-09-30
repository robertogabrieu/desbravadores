/** Lado maior da foto depois de reduzida, em pixels (SPEC E10). */
export const LADO_MAXIMO = 1600
export const QUALIDADE_JPEG = 0.8

/** O aparelho não conseguiu abrir ou regravar a foto (ex.: HEIC num Android). */
export class ErroFormatoFoto extends Error {
  constructor() {
    super('Formato de foto não aceito')
    this.name = 'ErroFormatoFoto'
  }
}

export interface ImagemDecodificada {
  largura: number
  altura: number
  /** Libera a memória da imagem decodificada. */
  fechar(): void
}

/** O que a redução pede ao navegador; nos testes entra um falso, porque o jsdom não tem canvas. */
export interface AmbienteReducao<I extends ImagemDecodificada = ImagemDecodificada> {
  decodificar(arquivo: Blob): Promise<I>
  codificar(imagem: I, largura: number, altura: number, qualidade: number): Promise<Blob>
}

/** Cabe a foto em `LADO_MAXIMO` pelo lado maior, mantendo a proporção; foto menor não é ampliada. */
export function calcularDimensoes(largura: number, altura: number): { largura: number; altura: number } {
  const maior = Math.max(largura, altura)
  if (maior <= LADO_MAXIMO) return { largura, altura }
  const escala = LADO_MAXIMO / maior
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) }
}

/** Reduz a foto para JPEG; qualquer falha do aparelho vira `ErroFormatoFoto`, para a tela recusar na hora. */
export async function reduzirFoto<I extends ImagemDecodificada>(arquivo: Blob, ambiente: AmbienteReducao<I>): Promise<Blob> {
  let imagem: I
  try {
    imagem = await ambiente.decodificar(arquivo)
  } catch {
    throw new ErroFormatoFoto()
  }
  try {
    const { largura, altura } = calcularDimensoes(imagem.largura, imagem.altura)
    return await ambiente.codificar(imagem, largura, altura, QUALIDADE_JPEG)
  } catch {
    throw new ErroFormatoFoto()
  } finally {
    imagem.fechar()
  }
}

interface ImagemDoNavegador extends ImagemDecodificada {
  bitmap: ImageBitmap
}

export const ambienteDoNavegador: AmbienteReducao<ImagemDoNavegador> = {
  async decodificar(arquivo) {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    return { bitmap, largura: bitmap.width, altura: bitmap.height, fechar: () => bitmap.close() }
  },
  codificar(imagem, largura, altura, qualidade) {
    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura
    const contexto = tela.getContext('2d')
    if (!contexto) return Promise.reject(new Error('Sem canvas'))
    contexto.drawImage(imagem.bitmap, 0, 0, largura, altura)
    return new Promise<Blob>((resolver, rejeitar) => {
      tela.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('Sem imagem'))), 'image/jpeg', qualidade)
    })
  },
}
