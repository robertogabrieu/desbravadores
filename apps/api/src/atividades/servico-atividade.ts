import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client.js'

/** Tipos que o feed da visao geral mostra. */
export type TipoAtividade = 'AULA_REGISTRADA' | 'CRONOGRAMA_ENVIADO' | 'CRONOGRAMA_PUBLICADO' | 'EVENTO_CRIADO'

export interface EntradaAtividade {
  clubeId: string
  autorId: string
  tipo: TipoAtividade
  descricao: string
  link: string | null
}

@Injectable()
export class ServicoAtividade {
  /** Grava na transacao de quem chama: a atividade nasce e some junto com a acao. */
  async registrar(tx: Prisma.TransactionClient, entrada: EntradaAtividade): Promise<void> {
    await tx.atividade.create({ data: entrada })
  }
}
