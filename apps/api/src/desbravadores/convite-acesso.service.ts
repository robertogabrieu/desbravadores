import { Injectable } from '@nestjs/common'
import {
  PAPEIS,
  type ConviteAcessoEntrada,
  type ConviteAcessoGeradoSaida,
  type SituacaoAcessoSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { urlDoApp } from '../email/modelos'
import { gerarTokenOpaco, hashDoToken } from '../sessao/tokens'
import {
  apresentarConvite,
  conviteAberto,
  exigirRelacoesDoConvite,
  VALIDADE_CONVITE_ACESSO_MS,
} from './convite-acesso.apresentacao'

type Entrada = z.infer<typeof ConviteAcessoEntrada>

/** Convite de acesso por link, gerado pelo Adm na ficha do desbravador (SPEC convite-por-link). */
@Injectable()
export class ConviteAcessoService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(sessao: SessaoLogada, dbvId: string, entrada: Entrada): Promise<z.infer<typeof ConviteAcessoGeradoSaida>> {
    const { clubeId } = sessao
    const ficha = await this.exigirFicha(clubeId, dbvId)
    if (ficha.usuarioId) throw new ErroApp('REGRA', 'Este desbravador já tem acesso ao app.')
    if (!ficha.ativo) throw new ErroApp('REGRA', 'Reative o desbravador antes de convidar.')
    const relacoes = {
      clubeId,
      unidadeIds: entrada.papel === 'CONSELHEIRO' ? [...new Set(entrada.unidadeIds)] : [],
      classeIds: entrada.papel === 'INSTRUTOR' ? [...new Set(entrada.classeIds)] : [],
    }
    const naoEncontrada = entrada.papel === 'CONSELHEIRO' ? 'Unidade não encontrada.' : 'Classe não encontrada.'
    await exigirRelacoesDoConvite(this.prisma, relacoes, new ErroApp('NAO_ENCONTRADO', naoEncontrada))

    const token = gerarTokenOpaco()
    const agora = new Date()
    const convite = await this.prisma.$transaction(async (tx) => {
      await tx.conviteAcesso.updateMany({ where: { clubeId, dbvId, ...conviteAberto(agora) }, data: { canceladoEm: agora } })
      return tx.conviteAcesso.create({
        data: {
          ...relacoes,
          dbvId,
          papel: entrada.papel,
          tokenHash: hashDoToken(token),
          expiraEm: new Date(agora.getTime() + VALIDADE_CONVITE_ACESSO_MS),
          criadoPorId: sessao.usuarioId,
        },
      })
    })
    const link = `${urlDoApp()}/acesso/${token}`
    return { ...(await apresentarConvite(this.prisma, convite, link)), link }
  }

  /** Conta ligada a ficha (com os papeis ativos no clube) ou o convite aberto; o link nao volta, so o hash existe. */
  async situacao(sessao: SessaoLogada, dbvId: string): Promise<z.infer<typeof SituacaoAcessoSaida>> {
    const { clubeId } = sessao
    const ficha = await this.exigirFicha(clubeId, dbvId)
    if (ficha.usuarioId) {
      const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: ficha.usuarioId }, select: { email: true } })
      const vinculos = await this.prisma.vinculo.findMany({
        where: { clubeId, usuarioId: ficha.usuarioId, ativo: true },
        select: { papel: true },
      })
      const papeis = vinculos.map((v) => v.papel).sort((a, b) => PAPEIS.indexOf(a) - PAPEIS.indexOf(b))
      return { convite: null, conta: { email: usuario.email, papeis } }
    }
    const aberto = await this.prisma.conviteAcesso.findFirst({
      where: { clubeId, dbvId, ...conviteAberto(new Date()) },
      orderBy: { criadoEm: 'desc' },
    })
    return { convite: aberto ? await apresentarConvite(this.prisma, aberto, null) : null, conta: null }
  }

  async cancelar(sessao: SessaoLogada, dbvId: string): Promise<void> {
    const { clubeId } = sessao
    await this.exigirFicha(clubeId, dbvId)
    const agora = new Date()
    await this.prisma.conviteAcesso.updateMany({ where: { clubeId, dbvId, ...conviteAberto(agora) }, data: { canceladoEm: agora } })
  }

  private async exigirFicha(clubeId: string, id: string): Promise<{ usuarioId: string | null; ativo: boolean }> {
    const ficha = await this.prisma.desbravador.findFirst({ where: { clubeId, id }, select: { usuarioId: true, ativo: true } })
    if (!ficha) throw new ErroApp('NAO_ENCONTRADO', 'Desbravador não encontrado.')
    return ficha
  }
}
