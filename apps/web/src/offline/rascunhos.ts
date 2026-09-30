import { banco } from './banco'
import type { ApagarRascunho, GravarRascunho, LerRascunho } from './tipos'

/** Valor cru do rascunho, ou `null` quando não há. Quem lê valida o formato. */
export const lerRascunho: LerRascunho = async (usuarioId, chave) => {
  const registro = await banco.rascunhos.get([usuarioId, chave])
  return registro ? registro.valor : null
}

export const gravarRascunho: GravarRascunho = async (usuarioId, chave, valor) => {
  await banco.rascunhos.put({ usuarioId, chave, valor, atualizadoEm: Date.now() })
}

export const apagarRascunho: ApagarRascunho = async (usuarioId, chave) => {
  await banco.rascunhos.delete([usuarioId, chave])
}
