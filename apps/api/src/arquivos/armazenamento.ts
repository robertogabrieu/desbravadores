import { createReadStream, statSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { ErroApp } from '../comum/erros'

/** Onde os bytes moram. O caminho e sempre montado pelo servidor, nunca vem do cliente. */
export interface Armazenamento {
  gravar(caminho: string, buffer: Buffer): Promise<void>
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
