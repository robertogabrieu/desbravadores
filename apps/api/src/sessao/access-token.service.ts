import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ErroApp } from '../comum/erros'

export const VALIDADE_ACCESS_SEGUNDOS = 15 * 60

export interface DadosDoAccess {
  usuarioId: string
  vinculoId: string | null
}

interface CargaDoAccess {
  sub: string
  vinculoId: string | null
}

@Injectable()
export class ServicoAccessToken {
  constructor(private readonly jwt: JwtService) {}

  /** Access JWT de 15 min com `{ sub, vinculoId }` e nada mais de autorizacao (D9). */
  emitir(dados: DadosDoAccess, agora: Date = new Date()): string {
    const carga: CargaDoAccess & { iat: number } = {
      sub: dados.usuarioId,
      vinculoId: dados.vinculoId,
      iat: Math.floor(agora.getTime() / 1000),
    }
    return this.jwt.sign(carga, { expiresIn: VALIDADE_ACCESS_SEGUNDOS, algorithm: 'HS256' })
  }

  verificar(token: string): DadosDoAccess {
    try {
      const carga = this.jwt.verify<Partial<CargaDoAccess>>(token, { algorithms: ['HS256'] })
      if (typeof carga.sub !== 'string') throw new Error('sem sub')
      return { usuarioId: carga.sub, vinculoId: typeof carga.vinculoId === 'string' ? carga.vinculoId : null }
    } catch {
      throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
    }
  }
}
