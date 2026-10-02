import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { variavel } from '../ambiente'
import { guardaClube } from './guarda-clube'

/**
 * Client usado pelos modulos de feature: toda operacao em modelo de clube passa pela guarda.
 * `$extends` devolve um client novo em vez de mutar `this`, por isso ele e o retorno do
 * construtor: quem injeta este servico so recebe a versao guardada.
 */
export class PrismaService extends PrismaClient {
  constructor(connectionString: string = variavel('DATABASE_URL')) {
    // Curto: o formato longo imprime os argumentos da consulta (nome, nascimento, e-mail) no log e no Sentry.
    super({ adapter: new PrismaPg({ connectionString }), errorFormat: 'minimal' })
    return this.$extends(guardaClube) as unknown as PrismaService
  }
}
