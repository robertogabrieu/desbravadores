import { Inject, Injectable, Logger } from '@nestjs/common'
import { permissoesEfetivas, type EuSaida, type SessaoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { Sessao } from '../comum/decorators/sessao.decorator'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { emailRedefinicao } from '../email/modelos'
import { SERVICO_EMAIL, type ServicoEmail } from '../email/servico-email'
import { ServicoAccessToken, VALIDADE_ACCESS_SEGUNDOS } from '../sessao/access-token.service'
import { ServicoRefresh, type RefreshEmitido } from '../sessao/refresh.service'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'
import { hashDaSenha, senhaConfere } from './senha'
import { montarVinculos } from './vinculos-resumo'

/** O que as rotas de sessao devolvem: o corpo e o refresh opaco que vai no cookie. */
export interface SessaoEmitida {
  saida: z.infer<typeof SessaoSaida>
  refresh: string
}

const MENSAGEM_CREDENCIAIS = 'E-mail ou senha incorretos.'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaSistema,
    private readonly access: ServicoAccessToken,
    private readonly refresh: ServicoRefresh,
    private readonly tokens: ServicoTokenUsoUnico,
    @Inject(SERVICO_EMAIL) private readonly email: ServicoEmail,
  ) {}

  async login(entrada: { email: string; senha: string }, aparelho?: string): Promise<SessaoEmitida> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: entrada.email } })
    const confere = await senhaConfere(usuario?.senhaHash, entrada.senha)
    if (!usuario || usuario.status !== 'ATIVO' || !confere) throw new ErroApp('CREDENCIAIS', MENSAGEM_CREDENCIAIS)
    const emitido = await this.refresh.criarFamilia(usuario.id, { aparelho })
    await this.prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } })
    return this.sessaoDe(emitido)
  }

  async renovar(tokenDeRefresh: string, vinculoId?: string): Promise<SessaoEmitida> {
    const emitido = await this.refresh.rotacionar(tokenDeRefresh, vinculoId ? { vinculoId } : {})
    return this.sessaoDe(emitido)
  }

  async logout(tokenDeRefresh: string | undefined): Promise<void> {
    if (tokenDeRefresh) await this.refresh.revogarFamiliaDoToken(tokenDeRefresh)
  }

  async sairDeTodos(usuarioId: string): Promise<void> {
    await this.refresh.revogarFamilias(usuarioId)
  }

  async aceitarConvite(entrada: { token: string; senha: string }, aparelho?: string): Promise<SessaoEmitida> {
    const usuarioId = await this.tokens.consumir(entrada.token, 'CONVITE')
    const senhaHash = await hashDaSenha(entrada.senha)
    const { count } = await this.prisma.usuario.updateMany({
      where: { id: usuarioId, status: 'CONVIDADO' },
      data: { senhaHash, status: 'ATIVO', ultimoAcessoEm: new Date() },
    })
    if (count === 0) throw new ErroApp('TOKEN_INVALIDO', 'Este link já foi usado ou venceu. Peça um novo.')
    return this.sessaoDe(await this.refresh.criarFamilia(usuarioId, { aparelho }))
  }

  /** Nunca revela se o e-mail existe: quem chama responde 204 de qualquer jeito. */
  async esqueciSenha(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } })
    if (usuario?.status !== 'ATIVO') return
    const token = await this.tokens.gerar(usuario.id, 'SENHA')
    // Sem await: o tempo do SMTP nao pode separar conta ativa de inexistente.
    this.email.enviar(emailRedefinicao({ para: usuario.email, token })).catch((erro: unknown) => {
      this.logger.error(`Falha ao enviar e-mail de redefinicao: ${erro instanceof Error ? erro.message : String(erro)}`)
    })
  }

  async redefinirSenha(entrada: { token: string; senha: string }): Promise<void> {
    const usuarioId = await this.tokens.consumir(entrada.token, 'SENHA')
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash: await hashDaSenha(entrada.senha) } })
    await this.refresh.revogarFamilias(usuarioId)
  }

  /** `GET /eu`: papel e permissoes vem do banco a cada chamada (D9). */
  async eu(sessao: Sessao): Promise<z.infer<typeof EuSaida>> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: sessao.usuarioId },
      select: { id: true, nome: true, email: true, genero: true },
    })
    const vinculos = await montarVinculos(this.prisma, sessao.usuarioId)
    const vinculoAtivo = vinculos.find((v) => v.id === sessao.vinculoId) ?? null
    const ajustes = vinculoAtivo
      ? await this.prisma.permissaoAjuste.findMany({
          where: { vinculoId: vinculoAtivo.id },
          select: { permissao: true, concedida: true },
        })
      : []
    return {
      usuario,
      vinculoAtivo,
      vinculos,
      permissoes: vinculoAtivo ? permissoesEfetivas(vinculoAtivo.papel, ajustes) : [],
    }
  }

  private async sessaoDe(emitido: RefreshEmitido): Promise<SessaoEmitida> {
    const agora = Date.now()
    const vinculos = await montarVinculos(this.prisma, emitido.usuarioId)
    const saida: z.infer<typeof SessaoSaida> = {
      accessToken: this.access.emitir({ usuarioId: emitido.usuarioId, vinculoId: emitido.vinculoId }),
      expiraEm: new Date(agora + VALIDADE_ACCESS_SEGUNDOS * 1000).toISOString(),
      vinculoAtivoId: emitido.vinculoId,
      vinculos: vinculos as z.infer<typeof SessaoSaida>['vinculos'],
    }
    return { saida, refresh: emitido.token }
  }
}
