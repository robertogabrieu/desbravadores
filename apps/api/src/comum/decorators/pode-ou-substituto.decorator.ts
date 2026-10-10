import { applyDecorators, SetMetadata } from '@nestjs/common'
import type { ChavePermissao } from '@desbravadores/shared'
import { ACEITA_SUBSTITUTO } from './acesso'
import { Pode } from './pode.decorator'

/** `@Pode(permissao)` que aceita tambem a credencial do link de substituicao, restrita ao alvo e ao dia. */
export const PodeOuSubstituto = (permissao: ChavePermissao): MethodDecorator & ClassDecorator =>
  applyDecorators(Pode(permissao), SetMetadata(ACEITA_SUBSTITUTO, true))
