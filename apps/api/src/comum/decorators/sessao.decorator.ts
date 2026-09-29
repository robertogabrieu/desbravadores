import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Papel } from '@desbravadores/shared'
import type { Request } from 'express'

/** O que as guardas deixam em `req.sessao`; clube e papel vem do banco, nunca do token. */
export interface Sessao {
  usuarioId: string
  vinculoId: string | null
  clubeId: string | null
  papel: Papel | null
}

/** Sessao de rota `@Logado`/`@Pode`: o vinculo ativo esta garantido. */
export interface SessaoLogada extends Sessao {
  vinculoId: string
  clubeId: string
  papel: Papel
}

export interface RequisicaoComSessao extends Request {
  sessao?: Sessao
}

function sessaoDoContexto(contexto: ExecutionContext): Sessao {
  const sessao = contexto.switchToHttp().getRequest<RequisicaoComSessao>().sessao
  if (!sessao) throw new Error('Rota sem sessao: falta @Autenticado, @Logado ou @Pode')
  return sessao
}

export const SessaoAtual = createParamDecorator((_dados: unknown, contexto: ExecutionContext): Sessao =>
  sessaoDoContexto(contexto),
)

export const SessaoDoClube = createParamDecorator((_dados: unknown, contexto: ExecutionContext): SessaoLogada => {
  const sessao = sessaoDoContexto(contexto)
  if (!sessao.vinculoId || !sessao.clubeId || !sessao.papel) {
    throw new Error('SessaoDoClube em rota sem vinculo ativo: use @Logado ou @Pode')
  }
  return { ...sessao, vinculoId: sessao.vinculoId, clubeId: sessao.clubeId, papel: sessao.papel }
})
