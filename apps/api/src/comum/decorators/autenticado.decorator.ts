import { SetMetadata } from '@nestjs/common'
import { ACESSO_AUTENTICADO } from './acesso'

/** Token valido basta; o vinculo pode ser nulo (so `GET /eu` e `POST /auth/sair-de-todos`). */
export const Autenticado = (): MethodDecorator & ClassDecorator => SetMetadata(ACESSO_AUTENTICADO, true)
