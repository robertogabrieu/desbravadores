import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ErroApp } from '../comum/erros'

/** Onde os bytes moram. O caminho e sempre montado pelo servidor, nunca vem do cliente. */
export interface Armazenamento {
  gravar(caminho: string, buffer: Buffer): Promise<void>
  /** Move um arquivo temporario (upload em disco) para o destino, sem le-lo para a memoria. */
  gravarDeArquivo(caminho: string, origemTemporaria: string): Promise<void>
  abrir(caminho: string): Readable
  remover(caminho: string): Promise<void>
}

export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO')

/** Implementacao em disco, sob `ARQUIVOS_DIR`. */
export class ArmazenamentoDisco implements Armazenamento {
  private readonly raiz: string

  constructor(raiz: string) {
    this.raiz = resolve(raiz)
  }

  async gravar(caminho: string, buffer: Buffer): Promise<void> {
    const destino = this.resolver(caminho)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, buffer)
  }

  /** `rename` quando ha um so volume; entre volumes (EXDEV) copia em stream e apaga o temporario. */
  async gravarDeArquivo(caminho: string, origemTemporaria: string): Promise<void> {
    const destino = this.resolver(caminho)
    await mkdir(dirname(destino), { recursive: true })
    try {
      await rename(origemTemporaria, destino)
    } catch (erro) {
      if (!(erro instanceof Error) || (erro as NodeJS.ErrnoException).code !== 'EXDEV') throw erro
      await pipeline(createReadStream(origemTemporaria), createWriteStream(destino))
      await rm(origemTemporaria, { force: true })
    }
  }

  abrir(caminho: string): Readable {
    const origem = this.resolver(caminho)
    try {
      statSync(origem)
    } catch {
      throw new ErroApp('NAO_ENCONTRADO', 'Arquivo não encontrado.')
    }
    return createReadStream(origem)
  }

  async remover(caminho: string): Promise<void> {
    await rm(this.resolver(caminho), { force: true })
  }

  private resolver(caminho: string): string {
    const destino = resolve(this.raiz, caminho)
    if (!destino.startsWith(this.raiz + sep)) throw new Error(`Caminho fora de ARQUIVOS_DIR: ${caminho}`)
    return destino
  }
}
