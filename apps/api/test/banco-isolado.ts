import { PrismaSistema } from '../src/comum/prisma/prisma-sistema'
import { variavelObrigatoria } from './ambiente'
import { apagarBanco, criarBancoTemporario, type BancoTemporario } from './banco'

export interface BancoIsolado extends BancoTemporario {
  prisma: PrismaSistema
  encerrar(): Promise<void>
}

/** Banco proprio de um arquivo de teste, para quem altera dado compartilhado (a carga oficial). */
export async function criarBancoIsolado(): Promise<BancoIsolado> {
  const urlAdmin = variavelObrigatoria('DATABASE_URL_ADMIN')
  const banco = await criarBancoTemporario(urlAdmin, variavelObrigatoria('DATABASE_URL'))
  const prisma = new PrismaSistema(banco.url)
  return {
    ...banco,
    prisma,
    encerrar: async () => {
      await prisma.$disconnect()
      await apagarBanco(urlAdmin, banco.nome)
    },
  }
}
