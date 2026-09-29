import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { ErroApp } from '../erros'
import { ServicoAccessToken } from '../../sessao/access-token.service'
import { ServicoSessao } from '../../sessao/sessao.service'
import { ACESSO_AUTENTICADO, ACESSO_PUBLICA, acessosDeclarados } from '../decorators/acesso'
import type { RequisicaoComSessao } from '../decorators/sessao.decorator'

@Injectable()
export class GuardaSessao implements CanActivate {
  constructor(
    private readonly access: ServicoAccessToken,
    private readonly sessao: ServicoSessao,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const acessos = acessosDeclarados(contexto.getHandler(), contexto.getClass())
    if (acessos.length !== 1) {
      throw new Error(`Rota sem exatamente uma declaracao de acesso: ${contexto.getClass().name}.${contexto.getHandler().name}`)
    }
    if (acessos[0] === ACESSO_PUBLICA) return true

    const req = contexto.switchToHttp().getRequest<RequisicaoComSessao>()
    const cabecalho = req.headers.authorization
    if (!cabecalho?.startsWith('Bearer ')) {
      throw new ErroApp('NAO_AUTENTICADO', 'Você precisa entrar para continuar.')
    }
    const { usuarioId, vinculoId } = this.access.verificar(cabecalho.slice('Bearer '.length))
    const vinculo = vinculoId ? await this.sessao.carregarVinculoAtivo(usuarioId, vinculoId) : null

    if (!vinculo && acessos[0] !== ACESSO_AUTENTICADO) {
      throw new ErroApp('VINCULO_INATIVO', 'Seu acesso a este clube não está mais ativo. Escolha outro papel.')
    }
    req.sessao = {
      usuarioId,
      vinculoId: vinculo?.vinculoId ?? null,
      clubeId: vinculo?.clubeId ?? null,
      papel: vinculo?.papel ?? null,
    }
    return true
  }
}
