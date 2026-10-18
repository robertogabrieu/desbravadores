import { ErroApp } from '../comum/erros'

const ORIGEM_DE_DESENVOLVIMENTO = 'http://localhost:5173'

export interface OrigemWebauthn {
  /** Dominio inteiro da origem (sem porta): so ele enxerga as passkeys deste app. */
  rpID: string
  /** Origem completa, com porta, que o navegador informa no desafio. */
  origin: string
}

/**
 * `rpID` e `origin` saem de `APP_URL`. Sem ela, dev e teste usam o localhost do web;
 * em producao a falta falha aqui, no primeiro uso, em vez de aceitar uma origem errada.
 */
export function origemWebauthn(): OrigemWebauthn {
  const appUrl = process.env['APP_URL']
  if (!appUrl && process.env['NODE_ENV'] === 'production') {
    throw new ErroApp('ERRO_INTERNO', 'APP_URL não configurada: não dá para validar passkeys.')
  }
  const url = new URL(appUrl || ORIGEM_DE_DESENVOLVIMENTO)
  return { rpID: url.hostname, origin: url.origin }
}

/** O `userHandle` que o aparelho devolve no login e o id do usuario, em base64url (regra 3). */
export function userHandleDe(usuarioId: string): string {
  return Buffer.from(usuarioId).toString('base64url')
}
