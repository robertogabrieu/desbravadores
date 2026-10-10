import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { ErroApp } from '../erros'
import { ServicoAccessToken, type DadosDoAccess } from '../../sessao/access-token.service'
import { ServicoSessao } from '../../sessao/sessao.service'
import { ACEITA_SUBSTITUTO, ACESSO_AUTENTICADO, ACESSO_PUBLICA, acessosDeclarados } from '../decorators/acesso'
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
    const token = cabecalho.slice('Bearer '.length)
    // Rota marcada: a credencial de substituicao so e tentada quando o token nao e de sessao normal.
    if (this.aceitaSubstituto(contexto)) {
      try {
        this.access.verificar(token)
      } catch {
        await this.abrirSessaoDeSubstituicao(req, this.access.verificarSubstituicao(token).substituicaoId)
        return true
      }
    }
    await this.abrirSessao(req, this.access.verificar(token), acessos[0])
    return true
  }

  private aceitaSubstituto(contexto: ExecutionContext): boolean {
    const marcada = (alvo: object): boolean => Reflect.getMetadata(ACEITA_SUBSTITUTO, alvo) === true
    return marcada(contexto.getHandler()) || marcada(contexto.getClass())
  }

  /** Leitura (GET/HEAD) vale ate o fim do link; o resto e gravacao, que vale ate o fim do envio. */
  private async abrirSessaoDeSubstituicao(req: RequisicaoComSessao, substituicaoId: string): Promise<void> {
    const leitura = req.method === 'GET' || req.method === 'HEAD'
    const ativa = await this.sessao.carregarSubstituicao(substituicaoId, leitura ? 'LEITURA' : 'GRAVACAO')
    req.sessao = {
      usuarioId: ativa.usuarioId,
      vinculoId: ativa.substituicaoId,
      clubeId: ativa.clubeId,
      papel: ativa.papel,
      substituicao: { id: ativa.substituicaoId, unidadeId: ativa.unidadeId, classeId: ativa.classeId, data: ativa.data },
    }
  }

  private async abrirSessao(
    req: RequisicaoComSessao,
    { usuarioId, vinculoId }: DadosDoAccess,
    acesso: string | undefined,
  ): Promise<void> {
    const vinculo = vinculoId ? await this.sessao.carregarVinculoAtivo(usuarioId, vinculoId) : null

    if (!vinculo && acesso !== ACESSO_AUTENTICADO) {
      throw new ErroApp('VINCULO_INATIVO', 'Seu acesso a este clube não está mais ativo. Escolha outro papel.')
    }
    req.sessao = {
      usuarioId,
      vinculoId: vinculo?.vinculoId ?? null,
      clubeId: vinculo?.clubeId ?? null,
      papel: vinculo?.papel ?? null,
    }
  }
}
