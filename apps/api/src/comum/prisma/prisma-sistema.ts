import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { variavel } from '../ambiente'

/**
 * Client SEM a guarda de clube (SPEC D22). So `sessao/`, `auth/` e `scripts/` o importam:
 * a regra `no-restricted-imports` do lint barra o resto.
 */
export class PrismaSistema extends PrismaClient {
  constructor(connectionString: string = variavel('DATABASE_URL')) {
    // Curto: o formato longo imprime os argumentos da consulta (nome, nascimento, e-mail) no log e no Sentry.
    super({ adapter: new PrismaPg({ connectionString }), errorFormat: 'minimal' })
  }
}
