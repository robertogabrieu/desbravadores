import { applyDecorators, SetMetadata } from '@nestjs/common'
import { ACEITA_SUBSTITUTO } from './acesso'
import { Logado } from './logado.decorator'

/** `@Logado()` que aceita tambem a credencial do link de substituicao, restrita ao alvo e ao dia. */
export const LogadoOuSubstituto = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Logado(), SetMetadata(ACEITA_SUBSTITUTO, true))
