import { Injectable } from '@nestjs/common'
import { Senha, type AceitarConviteAcessoEntrada, type ConvitePublicoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import {
  apresentarConvite,
  conviteAberto,
  exigirRelacoesDoConvite,
} from '../desbravadores/convite-acesso.apresentacao'
import type { ConviteAcesso } from '../generated/prisma/client.js'
import { hashDoToken } from '../sessao/tokens'
import { UsuariosService } from '../usuarios/usuarios.service'
import { AuthService, type SessaoEmitida } from './auth.service'
import { hashDaSenha, senhaConfere } from './senha'

const MENSAGEM_INVALIDO = 'Este convite não vale mais. Peça um novo ao Adm do clube.'
const MENSAGEM_RELACAO_SUMIU =
  'A unidade ou a classe deste convite não está mais disponível. Peça um novo convite ao Adm do clube.'

/** Lado publico do convite por link: quem abre o link ve o convite e cria (ou liga) a conta. */
@Injectable()
export class ConviteAcessoPublicoService {
  constructor(
    private readonly prisma: PrismaSistema,
    private readonly auth: AuthService,
    private readonly usuarios: UsuariosService,
  ) {}

  async ver(token: string): Promise<z.infer<typeof ConvitePublicoSaida>> {
    const convite = await this.conviteValido(token)
    const [clube, ficha, apresentado] = await Promise.all([
      this.prisma.clube.findUniqueOrThrow({ where: { id: convite.clubeId }, select: { nome: true } }),
      this.prisma.desbravador.findUniqueOrThrow({ where: { id: convite.dbvId }, select: { nome: true } }),
      apresentarConvite(this.prisma, convite, null),
    ])
    return { clube: clube.nome, nome: ficha.nome, papel: apresentado.papel, unidades: apresentado.unidades, classes: apresentado.classes }
  }

  async aceitar(token: string, entrada: z.infer<typeof AceitarConviteAcessoEntrada>, aparelho?: string): Promise<SessaoEmitida> {
    const convite = await this.conviteValido(token)
    const { clubeId } = convite
    await exigirRelacoesDoConvite(this.prisma, convite, new ErroApp('REGRA', MENSAGEM_RELACAO_SUMIU))
    const ficha = await this.prisma.desbravador.findUniqueOrThrow({ where: { id: convite.dbvId } })
    if (ficha.usuarioId) throw new ErroApp('REGRA', 'Este desbravador já tem acesso ao app.')

    const existente = await this.prisma.usuario.findUnique({ where: { email: entrada.email } })
    let senhaHash: string | null = null
    if (existente) {
      const confere = await senhaConfere(existente.senhaHash, entrada.senha)
      if (!confere || existente.status !== 'ATIVO') {
        throw new ErroApp('CONTA_EXISTENTE', 'Você já tem conta. Digite a senha que você usa.')
      }
      const outraFicha = await this.prisma.desbravador.findFirst({
        where: { clubeId, usuarioId: existente.id, id: { not: ficha.id } },
        select: { id: true },
      })
      if (outraFicha) throw new ErroApp('REGRA', 'Este e-mail já está ligado a outro desbravador do clube.')
    } else {
      const regra = Senha.safeParse(entrada.senha)
      if (!regra.success) {
        const mensagem = regra.error.issues[0]?.message ?? 'Senha inválida.'
        throw new ErroApp('VALIDACAO', mensagem, { senha: mensagem })
      }
      senhaHash = await hashDaSenha(entrada.senha)
    }

    const agora = new Date()
    const usuarioId = await this.prisma.$transaction(async (tx) => {
      const consumido = await tx.conviteAcesso.updateMany({
        where: { id: convite.id, clubeId, ...conviteAberto(agora) },
        data: { usadoEm: agora },
      })
      if (consumido.count === 0) throw new ErroApp('TOKEN_INVALIDO', MENSAGEM_INVALIDO)
      const usuario = existente
        ? await tx.usuario.update({ where: { id: existente.id }, data: { ultimoAcessoEm: agora } })
        : await tx.usuario.create({
            data: { nome: ficha.nome, email: entrada.email, genero: ficha.sexo, senhaHash, status: 'ATIVO', ultimoAcessoEm: agora },
          })
      const ligada = await tx.desbravador.updateMany({
        where: { clubeId, id: ficha.id, usuarioId: null },
        data: { usuarioId: usuario.id },
      })
      if (ligada.count === 0) throw new ErroApp('REGRA', 'Este desbravador já tem acesso ao app.')
      await this.usuarios.acrescentarPapel(tx, clubeId, usuario.id, convite.papel, convite)
      return usuario.id
    })
    return this.auth.abrirSessao(usuarioId, aparelho)
  }

  private async conviteValido(token: string): Promise<ConviteAcesso> {
    const convite = await this.prisma.conviteAcesso.findUnique({ where: { tokenHash: hashDoToken(token) } })
    if (!convite || convite.usadoEm || convite.canceladoEm || convite.expiraEm <= new Date()) {
      throw new ErroApp('TOKEN_INVALIDO', MENSAGEM_INVALIDO)
    }
    return convite
  }
}
