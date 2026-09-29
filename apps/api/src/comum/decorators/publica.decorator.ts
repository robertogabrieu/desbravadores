import { SetMetadata } from '@nestjs/common'
import { ACESSO_PUBLICA } from './acesso'

/** Rota aberta: nenhuma guarda global olha o token. */
export const Publica = (): MethodDecorator & ClassDecorator => SetMetadata(ACESSO_PUBLICA, true)
