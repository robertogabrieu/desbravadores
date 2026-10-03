import { EuSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { banco } from './banco'
import type { RegistroSessao } from './banco'

type Eu = z.infer<typeof EuSaida>

export async function gravarIdentidade(eu: Eu, agora = Date.now()): Promise<void> {
  await banco.sessoes.put({ usuarioId: eu.usuario.id, eu, ultimoContatoEm: agora })
}

export async function tocarContato(usuarioId: string, agora = Date.now()): Promise<void> {
  await banco.sessoes.update(usuarioId, { ultimoContatoEm: agora })
}

/** Tira do aparelho só a identidade guardada: sem ela, o app não reabre sem internet como esse usuário.
 *  Pacote, rascunhos e fila ficam (a pessoa pode voltar a ter o papel). */
export async function apagarIdentidade(usuarioId: string): Promise<void> {
  await banco.sessoes.delete(usuarioId)
}

/** Identidade do último usuário que falou com a API, ou nula se não há uma íntegra guardada. */
export async function lerUltimaIdentidade(): Promise<RegistroSessao | null> {
  const todas = await banco.sessoes.toArray()
  const ultima = todas.sort((a, b) => b.ultimoContatoEm - a.ultimoContatoEm)[0]
  if (!ultima) return null
  const eu = EuSaida.safeParse(ultima.eu)
  return eu.success ? { ...ultima, eu: eu.data } : null
}
