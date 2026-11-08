import { semAcento } from '../../progresso/formatos'

const TIPO_DA_IMAGEM = 'image/png'
const TAMANHO_MAXIMO_DO_NOME = 60

/** O pedaço de `navigator` que o compartilhamento usa; nos testes entra um falso. */
export interface Compartilhador {
  canShare?: (dados: ShareData) => boolean
  share?: (dados: ShareData) => Promise<void>
}

/** "pedido-3-marlene-prado.png": o comprador sem acento, espaço nem símbolo, para o arquivo abrir em qualquer aparelho. */
export function nomeDoArquivoDoPedido(numero: number, comprador: string): string {
  const seguro = semAcento(comprador)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = [`pedido-${numero}`, seguro].filter(Boolean).join('-')
  return `${base.slice(0, TAMANHO_MAXIMO_DO_NOME - '.png'.length).replace(/-+$/, '')}.png`
}

export const arquivoDaImagem = (blob: Blob, nome: string): File => new File([blob], nome, { type: TIPO_DA_IMAGEM })

/** O aparelho aceita compartilhar este arquivo? Sem `canShare`, ou com `canShare` recusando, só resta baixar. */
export function podeCompartilhar(arquivo: File, alvo: Compartilhador = navigator): boolean {
  return typeof alvo.canShare === 'function' && alvo.canShare({ files: [arquivo] })
}

/** Abre o menu do aparelho. Fechá-lo sem escolher nada não é falha. */
export async function compartilharImagem(arquivo: File, titulo: string, alvo: Compartilhador = navigator): Promise<void> {
  if (!alvo.share) return
  try {
    await alvo.share({ files: [arquivo], title: titulo })
  } catch (falha) {
    if (falha instanceof DOMException && falha.name === 'AbortError') return
    throw falha
  }
}

/** Entrega o arquivo ao navegador como download; nada passa pelo servidor. */
export function baixarImagem(arquivo: File): void {
  const endereco = URL.createObjectURL(arquivo)
  const ancora = document.createElement('a')
  ancora.href = endereco
  ancora.download = arquivo.name
  document.body.append(ancora)
  ancora.click()
  ancora.remove()
  setTimeout(() => URL.revokeObjectURL(endereco), 0)
}
