import { HttpResponse } from 'msw'
import type { JsonBodyType } from 'msw'

/** Registro que leitura e escrita dividem num teste: a escrita troca `atual`, a leitura devolve o que estiver lá. */
export interface Caixa<T> {
  atual: T
}

export const caixa = <T>(atual: T): Caixa<T> => ({ atual })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Leitura por id como a API: id malformado → 400 VALIDACAO; fora das caixas → 404 NAO_ENCONTRADO. */
export function lerPorId<T extends JsonBodyType & { id: string }>(id: string, caixas: Caixa<T>[], naoEncontrado: string) {
  if (!UUID.test(id)) return HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Confira os campos informados.' }, { status: 400 })
  const achada = caixas.find((c) => c.atual.id === id)
  if (!achada) return HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: naoEncontrado }, { status: 404 })
  return HttpResponse.json(achada.atual)
}
