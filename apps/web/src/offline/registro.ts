import type { z } from 'zod'
import type { RegistrarTipo, TipoFila } from './tipos'

/** Os tipos guardam genéricos diferentes; o motor só os usa por `tipo`, então o mapa apaga o parâmetro. */
type TipoRegistrado = TipoFila<never, z.ZodType>

const tiposRegistrados = new Map<string, TipoRegistrado>()

export const registrarTipo: RegistrarTipo = (definicao) => {
  tiposRegistrados.set(definicao.tipo, definicao as unknown as TipoRegistrado)
}

export const obterTipo = (tipo: string): TipoFila | undefined => tiposRegistrados.get(tipo) as unknown as TipoFila | undefined

export const limparRegistro = (): void => {
  tiposRegistrados.clear()
}
