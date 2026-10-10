import type { Armazenamento } from './armazenamento'

export interface DestinoParaGravar {
  caminho: string
  /** `string` é o caminho de um temporário que o armazenamento move; `Buffer` são os bytes que ele grava. */
  origem: string | Buffer
}

/**
 * Grava cada destino no armazenamento e só então roda `confirmar` (a transação do banco). Qualquer
 * passo que falhe apaga todos os destinos e relança o mesmo erro: não sobra arquivo sem linha.
 */
export async function gravarEConfirmar<T>(
  armazenamento: Armazenamento,
  destinos: DestinoParaGravar[],
  confirmar: () => Promise<T>,
  aoFalharApagar: (caminho: string) => Promise<void>,
): Promise<T> {
  try {
    for (const { caminho, origem } of destinos) {
      if (typeof origem === 'string') await armazenamento.gravarDeArquivo(caminho, origem)
      else await armazenamento.gravar(caminho, origem)
    }
    return await confirmar()
  } catch (erro) {
    await Promise.allSettled(destinos.map(({ caminho }) => aoFalharApagar(caminho)))
    throw erro
  }
}
