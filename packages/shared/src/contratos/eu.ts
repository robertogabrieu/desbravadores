import { z } from 'zod'
import { Sexo } from '../enums'
import { Uuid } from './comum'
import { VinculoResumo } from './auth'

export const EuSaida = z.object({
  usuario: z.object({ id: Uuid, nome: z.string(), email: z.string(), genero: Sexo.nullable() }),
  vinculoAtivo: VinculoResumo.nullable(),
  vinculos: z.array(VinculoResumo),
  /** Permissões efetivas do vínculo ativo (chaves do catálogo). Vazio sem vínculo ativo. */
  permissoes: z.array(z.string()),
})

