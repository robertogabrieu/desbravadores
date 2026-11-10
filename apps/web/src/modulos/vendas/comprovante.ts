import { LIMITE_BYTES_COMPROVANTE, MENSAGEM_COMPROVANTE_GRANDE } from '@desbravadores/shared'
import { ambienteDoNavegador, ErroFormatoFoto, reduzirFoto } from '../galeria/reducao'

export const FORMATOS_ACEITOS_NO_COMPROVANTE = 'image/*,application/pdf'

/** O arquivo escolhido não serve de comprovante; a mensagem já é o texto da tela. */
export class ErroDeComprovante extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeComprovante'
  }
}

/** Foto é reduzida no aparelho (vira JPEG); PDF segue como está. Os dois precisam caber no limite do servidor. */
export async function prepararComprovante(arquivo: File): Promise<File> {
  if (arquivo.type === 'application/pdf') {
    if (arquivo.size > LIMITE_BYTES_COMPROVANTE) throw new ErroDeComprovante(MENSAGEM_COMPROVANTE_GRANDE)
    return arquivo
  }
  if (!arquivo.type.startsWith('image/')) throw new ErroDeComprovante('Envie uma foto ou um PDF.')
  let reduzida: Blob
  try {
    reduzida = await reduzirFoto(arquivo, ambienteDoNavegador)
  } catch (erro) {
    if (erro instanceof ErroFormatoFoto) throw new ErroDeComprovante('Não foi possível abrir esta foto. Tire um print ou envie o PDF do banco.')
    throw erro
  }
  if (reduzida.size > LIMITE_BYTES_COMPROVANTE) throw new ErroDeComprovante(MENSAGEM_COMPROVANTE_GRANDE)
  return new File([reduzida], 'comprovante.jpg', { type: 'image/jpeg' })
}
