import { SetMetadata } from '@nestjs/common'
import { ACESSO_LOGADO } from './acesso'

/** Exige vinculo ativo, sem permissao especifica. */
export const Logado = (): MethodDecorator & ClassDecorator => SetMetadata(ACESSO_LOGADO, true)
