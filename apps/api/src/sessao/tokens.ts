import { createHash, randomBytes } from 'node:crypto'

/** 32 bytes aleatorios em base64url: o valor que vai para o e-mail ou para o cookie. */
export function gerarTokenOpaco(): string {
  return randomBytes(32).toString('base64url')
}

/** So o SHA-256 do token vai para o banco. */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
