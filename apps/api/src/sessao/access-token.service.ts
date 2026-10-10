import { Injectable } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
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

export const TIPO_SUBSTITUICAO = 'substituicao'

export interface DadosDaSubstituicao {
  substituicaoId: string
}

interface CargaDaSubstituicao {
  sub: string
  tipo: typeof TIPO_SUBSTITUICAO
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

  /** Credencial do link de substituicao: `{ sub: <id da substituicao>, tipo }`, valida ate `validadeAte`. */
  emitirSubstituicao(substituicaoId: string, validadeAte: Date, agora: Date = new Date()): string {
    const carga: CargaDaSubstituicao & { iat: number; exp: number } = {
      sub: substituicaoId,
      tipo: TIPO_SUBSTITUICAO,
      iat: Math.floor(agora.getTime() / 1000),
      exp: Math.floor(validadeAte.getTime() / 1000),
    }
    return this.jwt.sign(carga, { algorithm: 'HS256' })
  }

  /** So a sessao normal: qualquer carga com `tipo` (a credencial de substituicao) e recusada. */
  verificar(token: string): DadosDoAccess {
    try {
      const carga = this.jwt.verify<Partial<CargaDoAccess> & { tipo?: unknown }>(token, { algorithms: ['HS256'] })
      if (typeof carga.sub !== 'string') throw new Error('sem sub')
      if (carga.tipo !== undefined) throw new Error('carga com tipo')
      return { usuarioId: carga.sub, vinculoId: typeof carga.vinculoId === 'string' ? carga.vinculoId : null }
    } catch {
      throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
    }
  }

  /**
   * So a credencial de substituicao. Vencida, mas assinada por nos e do tipo certo, e o fim do
   * envio: `SUBSTITUICAO_ENCERRADA`, que encerra a tela; o resto e `NAO_AUTENTICADO`.
   */
  verificarSubstituicao(token: string): DadosDaSubstituicao {
    const carga = this.cargaDaSubstituicao(token)
    if (carga === 'VENCIDA') throw new ErroApp('SUBSTITUICAO_ENCERRADA', 'Este link de substituição foi encerrado.')
    if (!carga) throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
    return { substituicaoId: carga.sub }
  }

  private cargaDaSubstituicao(token: string): CargaDaSubstituicao | 'VENCIDA' | null {
    try {
      return this.comoSubstituicao(this.jwt.verify<Record<string, unknown>>(token, { algorithms: ['HS256'] }))
    } catch (erro) {
      if (!(erro instanceof TokenExpiredError)) return null
    }
    try {
      const vencida = this.jwt.verify<Record<string, unknown>>(token, { algorithms: ['HS256'], ignoreExpiration: true })
      return this.comoSubstituicao(vencida) ? 'VENCIDA' : null
    } catch {
      return null
    }
  }

  private comoSubstituicao(carga: Record<string, unknown>): CargaDaSubstituicao | null {
    if (carga['tipo'] !== TIPO_SUBSTITUICAO || typeof carga['sub'] !== 'string') return null
    return { sub: carga['sub'], tipo: TIPO_SUBSTITUICAO }
  }
}
