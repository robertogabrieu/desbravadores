import { Injectable, type PipeTransform } from '@nestjs/common'
import type { z } from 'zod'
import { ErroApp } from '../erros'

@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(valor: unknown): z.output<T> {
    const resultado = this.schema.safeParse(valor)
    if (resultado.success) return resultado.data
    const campos: Record<string, string> = {}
    for (const problema of resultado.error.issues) {
      const caminho = problema.path.map(String).join('.') || '_'
      campos[caminho] ??= problema.message
    }
    throw new ErroApp('VALIDACAO', 'Confira os campos informados.', campos)
  }
}
