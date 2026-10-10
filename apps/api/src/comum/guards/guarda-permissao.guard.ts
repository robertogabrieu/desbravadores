import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ehChavePermissao, permissoesEfetivas } from '@desbravadores/shared'
import { ErroApp } from '../erros'
import { PrismaService } from '../prisma/prisma.service'
import { ACESSO_PODE } from '../decorators/acesso'
import type { RequisicaoComSessao } from '../decorators/sessao.decorator'

@Injectable()
export class GuardaPermissao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const exigida = this.reflector.getAllAndOverride<string | undefined>(ACESSO_PODE, [
      contexto.getHandler(),
      contexto.getClass(),
    ])
    if (exigida === undefined) return true

    const sessao = contexto.switchToHttp().getRequest<RequisicaoComSessao>().sessao
    // A guarda de sessao so abre sessao de substituicao em rota marcada; as permissoes sao as do papel.
    if (sessao?.substituicao) return true
    if (!sessao?.vinculoId || !sessao.papel) {
      throw new ErroApp('VINCULO_INATIVO', 'Seu acesso a este clube não está mais ativo. Escolha outro papel.')
    }
    const ajustes = await this.prisma.permissaoAjuste.findMany({
      where: { vinculoId: sessao.vinculoId },
      select: { permissao: true, concedida: true },
    })
    const efetivas: string[] = permissoesEfetivas(sessao.papel, ajustes)
    if (!ehChavePermissao(exigida) || !efetivas.includes(exigida)) {
      throw new ErroApp('SEM_PERMISSAO', 'Você não tem permissão para fazer isso.')
    }
    return true
  }
}
