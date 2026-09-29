import argon2 from 'argon2'

/**
 * Hash de uma senha que ninguem tem, com os mesmos parametros do hash real: login com e-mail
 * inexistente verifica contra ele, para o tempo de resposta nao revelar se o e-mail existe (D7).
 */
const HASH_FALSO =
  '$argon2id$v=19$m=65536,p=4,t=3$Hut6RyOWDnBi0w/m73r3Eg$3BKGZUES7ue7uJVkVrnzQhKO8U1rJZ5OgMPQFuRryEY'

export function hashDaSenha(senha: string): Promise<string> {
  return argon2.hash(senha, { type: argon2.argon2id })
}

/** Verifica sempre um hash (o falso, se nao houver): o custo e o mesmo nos dois casos. */
export async function senhaConfere(hash: string | null | undefined, senha: string): Promise<boolean> {
  const confere = await argon2.verify(hash ?? HASH_FALSO, senha)
  return hash != null && confere
}
