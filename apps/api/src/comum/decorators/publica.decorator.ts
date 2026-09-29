import { SetMetadata } from '@nestjs/common'

export const ROTA_PUBLICA = 'rotaPublica'

// Provisorio: a guarda global de autenticacao e a decisao de acesso reais chegam com o modulo de sessao.
export const Publica = (): MethodDecorator & ClassDecorator => SetMetadata(ROTA_PUBLICA, true)
