import { timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { EntrarNoLink, Entrada, EstadoDoLink, LinkPublico } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp, type CodigoErro } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import type { Substituicao } from '../generated/prisma/client.js'
import { ServicoAccessToken } from '../sessao/access-token.service'
import { ServicoRefresh } from '../sessao/refresh.service'
import { gerarTokenOpaco, hashDoToken } from '../sessao/tokens'
import { alvoAtivo, alvoDoLink } from '../substituicoes/alvo'

type Estado = z.infer<typeof EstadoDoLink>

interface LinkLido extends Substituicao {
  unidade: { nome: string } | null
  classe: { nome: string } | null
  substituto: { nome: string } | null
}

type Situacao =
  | { estado: 'INEXISTENTE'; link: null; identificado: false }
  | { estado: Exclude<Estado, 'INEXISTENTE'>; link: LinkLido; identificado: boolean }

interface Conta {
  id: string
  nome: string
}

const RECUSA_POR_ESTADO: Record<Exclude<Estado, 'ABERTO'>, { codigo: CodigoErro; mensagem: string }> = {
  INEXISTENTE: { codigo: 'TOKEN_INVALIDO', mensagem: 'Este link não existe.' },
  CANCELADO: { codigo: 'TOKEN_INVALIDO', mensagem: 'O Adm cancelou este link.' },
  ENCERRADO: { codigo: 'TOKEN_INVALIDO', mensagem: 'O horário deste link já terminou.' },
  ANTES: { codigo: 'REGRA', mensagem: 'O link ainda não abriu. Volte no horário da reunião.' },
  EM_OUTRO_APARELHO: { codigo: 'CONFLITO', mensagem: 'Este link já está aberto em outro celular.' },
}

/** Recusa do `entrar` com o estado em `campos`, para a tela escolher S1, S6 ou S7 sem outra leitura. */
function recusa(estado: Exclude<Estado, 'ABERTO'>): ErroApp {
  const { codigo, mensagem } = RECUSA_POR_ESTADO[estado]
  return new ErroApp(codigo, mensagem, { estado })
}

/** Lado público do link de substituição: quem abre vê o estado e entra sem login, dentro da janela. */
@Injectable()
export class SubstituicaoPublicaService {
  constructor(
    private readonly prisma: PrismaSistema,
    private readonly access: ServicoAccessToken,
    private readonly refresh: ServicoRefresh,
  ) {}

  async ver(token: string, segredo: string | undefined, cookie: string | undefined): Promise<z.infer<typeof LinkPublico>> {
    const agora = new Date()
    const { estado, link, identificado } = await this.situacao(token, segredo, agora)
    if (link === null) {
      return {
        estado, tipo: null, alvo: null, data: null, inicioEm: null, fimEm: null, fimEnvioEm: null,
        agora: agora.toISOString(), conta: null, identificado: false,
      }
    }
    const conta = await this.contaNoClube(cookie, link.clubeId, agora)
    return {
      estado,
      tipo: link.tipo,
      alvo: { nome: nomeDoAlvo(link) },
      data: link.data.toISOString().slice(0, 10),
      inicioEm: link.inicioEm.toISOString(),
      fimEm: link.fimEm.toISOString(),
      fimEnvioEm: link.fimEnvioEm.toISOString(),
      agora: agora.toISOString(),
      conta: conta && { nome: conta.nome },
      identificado,
    }
  }

  async entrar(token: string, entrada: z.infer<typeof EntrarNoLink>, cookie: string | undefined): Promise<z.infer<typeof Entrada>> {
    const agora = new Date()
    const situacao = await this.situacao(token, entrada.segredo, agora)
    if (situacao.estado !== 'ABERTO') throw recusa(situacao.estado)
    const { link, identificado } = situacao
    if (identificado && link.substituto) return this.apresentar(link, link.substituto.nome, null, agora)

    const conta = entrada.usarConta ? await this.contaNoClube(cookie, link.clubeId, agora) : null
    if (entrada.usarConta && !conta) throw new ErroApp('REGRA', 'Não achamos sua conta neste navegador. Escreva seu nome.')
    if (!conta && !entrada.nome) {
      throw new ErroApp('VALIDACAO', 'Escreva seu nome e sobrenome', { nome: 'Escreva seu nome e sobrenome' })
    }

    const segredo = gerarTokenOpaco()
    const nome = await this.prisma.$transaction(async (tx) => {
      // Prende o aparelho primeiro: a segunda entrada simultânea espera esta e cai na contagem 0.
      const presa = await tx.substituicao.updateMany({
        where: { id: link.id, clubeId: link.clubeId, aparelhoHash: null, canceladoEm: null, fimEm: { gt: agora } },
        data: { aparelhoHash: hashDoToken(segredo), identificadaEm: agora },
      })
      if (presa.count !== 1) throw recusa('EM_OUTRO_APARELHO')
      const autor =
        conta ??
        (await tx.usuario.create({
          data: { nome: entrada.nome ?? '', email: `substituto-${link.id}@substituto.invalid`, senhaHash: null, status: 'SUBSTITUTO' },
          select: { id: true, nome: true },
        }))
      await tx.substituicao.updateMany({ where: { id: link.id, clubeId: link.clubeId }, data: { substitutoId: autor.id } })
      return autor.nome
    })
    return this.apresentar(link, nome, segredo, agora)
  }

  private apresentar(link: LinkLido, nome: string, segredo: string | null, agora: Date): z.infer<typeof Entrada> {
    const alvoId = alvoDoLink(link) ?? ''
    return {
      credencial: this.access.emitirSubstituicao(link.id, link.fimEnvioEm, agora),
      segredo,
      identidade: {
        substituicaoId: link.id,
        nome,
        tipo: link.tipo,
        alvoId,
        alvoNome: nomeDoAlvo(link),
        clubeId: link.clubeId,
        data: link.data.toISOString().slice(0, 10),
        fimEm: link.fimEm.toISOString(),
        fimEnvioEm: link.fimEnvioEm.toISOString(),
      },
      agora: agora.toISOString(),
    }
  }

  /** Estados na ordem da SPEC: INEXISTENTE, CANCELADO, ENCERRADO, ANTES, EM_OUTRO_APARELHO, ABERTO. */
  private async situacao(token: string, segredo: string | undefined, agora: Date): Promise<Situacao> {
    const link = await this.prisma.substituicao.findUnique({
      where: { tokenHash: hashDoToken(token) },
      include: { unidade: { select: { nome: true } }, classe: { select: { nome: true } }, substituto: { select: { nome: true } } },
    })
    if (!link) return { estado: 'INEXISTENTE', link: null, identificado: false }
    const alvoId = alvoDoLink(link)
    const ativo = alvoId !== null && (await alvoAtivo(this.prisma, link.clubeId, link.tipo, alvoId)) !== null
    if (link.canceladoEm || !ativo) return { estado: 'CANCELADO', link, identificado: false }
    if (agora >= link.fimEm) return { estado: 'ENCERRADO', link, identificado: false }
    if (agora < link.inicioEm) return { estado: 'ANTES', link, identificado: false }
    const identificado = link.aparelhoHash !== null && segredo !== undefined && segredoConfere(segredo, link.aparelhoHash)
    if (link.aparelhoHash !== null && !identificado) return { estado: 'EM_OUTRO_APARELHO', link, identificado: false }
    return { estado: 'ABERTO', link, identificado }
  }

  /** Conta do cookie de refresh, lida sem rotacionar; só vale com vínculo ativo no clube do link (S3). */
  private async contaNoClube(cookie: string | undefined, clubeId: string, agora: Date): Promise<Conta | null> {
    if (!cookie) return null
    const dono = await this.refresh.lerSemRotacionar(cookie, agora)
    if (!dono) return null
    return this.prisma.usuario.findFirst({
      where: { id: dono.usuarioId, status: 'ATIVO', vinculos: { some: { clubeId, ativo: true } } },
      select: { id: true, nome: true },
    })
  }
}

function nomeDoAlvo(link: LinkLido): string {
  return (link.tipo === 'CHAMADA' ? link.unidade?.nome : link.classe?.nome) ?? ''
}

/** Compara os hashes em tempo constante. */
function segredoConfere(segredo: string, aparelhoHash: string): boolean {
  const apresentado = Buffer.from(hashDoToken(segredo))
  const gravado = Buffer.from(aparelhoHash)
  return apresentado.length === gravado.length && timingSafeEqual(apresentado, gravado)
}
