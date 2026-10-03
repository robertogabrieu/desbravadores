import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  PAPEIS,
  permissaoSeAplica,
  type AjustePermissao,
  type Papel,
  type UsuarioCriarEntrada,
  type UsuarioEditarEntrada,
  type UsuarioFiltro,
  type UsuarioLista,
  type UsuarioSaida,
  type VinculoEditarEntrada,
  type VinculoEntrada,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paginar, semAcento } from '../desbravadores/apoio'
import { ServicoTipoDaFicha } from '../desbravadores/tipo-da-ficha.service'
import { emailAdicionado, emailConvite } from '../email/modelos'
import { SERVICO_EMAIL, type ServicoEmail } from '../email/servico-email'
import type { Prisma, Usuario } from '../generated/prisma/client.js'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'

type Saida = z.infer<typeof UsuarioSaida>
type Entrada = z.infer<typeof VinculoEntrada>
type Cliente = Prisma.TransactionClient

function incluirVinculos(clubeId: string) {
  return {
    vinculos: {
      where: { clubeId },
      include: {
        unidades: { include: { unidade: { select: { id: true, nome: true } } } },
        classes: { include: { classe: { select: SELECAO_REF_CLASSE } } },
        ajustes: true,
      },
    },
  } satisfies Prisma.UsuarioInclude
}

type UsuarioComVinculos = Prisma.UsuarioGetPayload<{ include: ReturnType<typeof incluirVinculos> }>

function situacaoNoClube(usuario: Pick<Usuario, 'status'>, ativos: number): Saida['situacao'] {
  if (ativos === 0) return 'INATIVO'
  return usuario.status === 'CONVIDADO' ? 'CONVIDADO' : 'ATIVO'
}

function montarSaida(usuario: UsuarioComVinculos): Saida {
  const vinculos = [...usuario.vinculos].sort((a, b) => PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel))
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    genero: usuario.genero,
    ultimoAcessoEm: usuario.ultimoAcessoEm?.toISOString() ?? null,
    situacao: situacaoNoClube(usuario, vinculos.filter((v) => v.ativo).length),
    vinculos: vinculos.map((vinculo) => ({
      id: vinculo.id,
      papel: vinculo.papel,
      ativo: vinculo.ativo,
      unidades: vinculo.unidades.map((l) => l.unidade).sort((a, b) => colador.compare(a.nome, b.nome)),
      classes: vinculo.classes.map((l) => refClasse(l.classe)).sort((a, b) => colador.compare(a.nome, b.nome)),
      ajustes: vinculo.ajustes
        .map((a) => ({ permissao: a.permissao, concedida: a.concedida }))
        .sort((a, b) => a.permissao.localeCompare(b.permissao)),
    })),
  }
}

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: ServicoTokenUsoUnico,
    @Inject(SERVICO_EMAIL) private readonly email: ServicoEmail,
    private readonly tipo: ServicoTipoDaFicha,
  ) {}

  async listar(sessao: SessaoLogada, filtro: z.infer<typeof UsuarioFiltro>): Promise<z.infer<typeof UsuarioLista>> {
    const { clubeId } = sessao
    const candidatos = await this.prisma.usuario.findMany({
      where: { vinculos: { some: { clubeId } } },
      select: { id: true, nome: true, email: true, vinculos: { where: { clubeId, ativo: true }, select: { papel: true } } },
    })
    const termo = filtro.busca ? semAcento(filtro.busca) : undefined
    const buscados = candidatos.filter(
      (c) => !termo || semAcento(c.nome).includes(termo) || semAcento(c.email).includes(termo),
    )
    const contagem = (papel: Papel): number => buscados.filter((c) => c.vinculos.some((v) => v.papel === papel)).length
    const doPapel = filtro.papel ? buscados.filter((c) => c.vinculos.some((v) => v.papel === filtro.papel)) : buscados
    const ordenados = [...doPapel].sort((a, b) => colador.compare(a.nome, b.nome))
    const idsDaPagina = paginar(ordenados, filtro.pagina, filtro.porPagina).map((c) => c.id)

    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: idsDaPagina }, vinculos: { some: { clubeId } } },
      include: incluirVinculos(clubeId),
    })
    const porId = new Map(usuarios.map((u) => [u.id, u]))
    return {
      itens: idsDaPagina.flatMap((id) => {
        const usuario = porId.get(id)
        return usuario ? [montarSaida(usuario)] : []
      }),
      total: ordenados.length,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      contagens: { todos: buscados.length, ADM: contagem('ADM'), CONSELHEIRO: contagem('CONSELHEIRO'), INSTRUTOR: contagem('INSTRUTOR') },
    }
  }

  /** E-mail existente so ganha vinculos e a resposta ecoa o enviado: nao revela a conta (SPEC D21). */
  async criar(sessao: SessaoLogada, entrada: z.infer<typeof UsuarioCriarEntrada>): Promise<Saida> {
    const { clubeId } = sessao
    const papeis = entrada.vinculos.map((v) => v.papel)
    if (new Set(papeis).size !== papeis.length) throw new ErroApp('REGRA', 'O mesmo papel foi informado duas vezes.')
    for (const vinculo of entrada.vinculos) await this.validarVinculo(clubeId, vinculo)

    const existente = await this.prisma.usuario.findUnique({ where: { email: entrada.email } })
    if (existente) await this.exigirPapeisLivres(clubeId, existente.id, papeis)
    const hoje = await this.tipo.hoje(clubeId)

    const usuario = await this.prisma.$transaction(async (tx) => {
      const alvo =
        existente ??
        (await tx.usuario.create({ data: { nome: entrada.nome, email: entrada.email, genero: entrada.genero ?? null } }))
      for (const vinculo of entrada.vinculos) await this.aplicarVinculo(tx, clubeId, alvo.id, vinculo)
      await this.tipo.sincronizarConta(tx, clubeId, alvo.id, hoje)
      return alvo
    })
    await this.avisarNovoAcesso(clubeId, usuario)

    const gravado = await this.carregar(clubeId, usuario.id)
    return { ...montarSaida(gravado), nome: entrada.nome, genero: entrada.genero ?? null, situacao: 'CONVIDADO', ultimoAcessoEm: null }
  }

  /** Usuário com vínculo (ativo ou não) neste clube, com todos os vínculos daqui; senão 404. */
  async obter(sessao: SessaoLogada, id: string): Promise<Saida> {
    return montarSaida(await this.carregar(sessao.clubeId, id))
  }

  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof UsuarioEditarEntrada>): Promise<Saida> {
    const { clubeId } = sessao
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, vinculos: { some: { clubeId } } },
      include: { vinculos: { select: { clubeId: true } } },
    })
    if (!usuario) throw new ErroApp('NAO_ENCONTRADO', 'Usuário não encontrado.')
    if (usuario.status !== 'CONVIDADO') {
      throw new ErroApp('REGRA', 'Só é possível editar quem ainda não aceitou o convite.')
    }
    if (usuario.vinculos.some((v) => v.clubeId !== clubeId)) {
      throw new ErroApp('REGRA', 'Este usuário também participa de outro clube; só ele pode alterar os próprios dados.')
    }
    await this.prisma.usuario.update({ where: { id }, data: { nome: entrada.nome, genero: entrada.genero } })
    return montarSaida(await this.carregar(clubeId, id))
  }

  async desativar(sessao: SessaoLogada, id: string): Promise<Saida> {
    const { clubeId } = sessao
    await this.carregar(clubeId, id)
    const hoje = await this.tipo.hoje(clubeId)
    await this.prisma.$transaction(async (tx) => {
      await this.travarAdmsDoClube(tx, clubeId)
      const ativos = await tx.vinculo.findMany({ where: { clubeId, usuarioId: id, ativo: true }, select: { id: true, papel: true } })
      await this.exigirOutroAdm(tx, clubeId, ativos.map((v) => v.id), ativos.some((v) => v.papel === 'ADM'))
      await tx.vinculo.updateMany({ where: { clubeId, usuarioId: id, ativo: true }, data: { ativo: false } })
      await this.tipo.sincronizarConta(tx, clubeId, id, hoje)
    })
    return montarSaida(await this.carregar(clubeId, id))
  }

  async adicionarVinculo(sessao: SessaoLogada, id: string, entrada: Entrada): Promise<Saida> {
    const { clubeId } = sessao
    await this.carregar(clubeId, id)
    await this.validarVinculo(clubeId, entrada)
    await this.exigirPapeisLivres(clubeId, id, [entrada.papel])
    const hoje = await this.tipo.hoje(clubeId)
    await this.prisma.$transaction(async (tx) => {
      await this.aplicarVinculo(tx, clubeId, id, entrada)
      await this.tipo.sincronizarConta(tx, clubeId, id, hoje)
    })
    return montarSaida(await this.carregar(clubeId, id))
  }

  async editarVinculo(sessao: SessaoLogada, vinculoId: string, entrada: z.infer<typeof VinculoEditarEntrada>): Promise<Saida> {
    const { clubeId } = sessao
    const vinculo = await this.prisma.vinculo.findFirst({ where: { id: vinculoId, clubeId } })
    if (!vinculo) throw new ErroApp('NAO_ENCONTRADO', 'Vínculo não encontrado.')
    this.exigirRelacoesDoPapel(vinculo.papel, entrada)
    if (entrada.ajustes) this.validarAjustes(vinculo.papel, entrada.ajustes)
    const classesDoVinculo = await this.prisma.vinculoClasse.findMany({ where: { vinculoId }, select: { classeId: true } })
    await this.validarRelacoes(clubeId, entrada.unidadeIds ?? [], entrada.classeIds ?? [], classesDoVinculo.map((c) => c.classeId))
    const hoje = await this.tipo.hoje(clubeId)

    await this.prisma.$transaction(async (tx) => {
      if (entrada.ativo === false && vinculo.ativo && vinculo.papel === 'ADM') {
        await this.travarAdmsDoClube(tx, clubeId)
        await this.exigirOutroAdm(tx, clubeId, [vinculo.id], true)
      }
      if (entrada.ativo !== undefined) await tx.vinculo.update({ where: { id: vinculo.id, clubeId }, data: { ativo: entrada.ativo } })
      await this.substituirRelacoes(tx, clubeId, vinculo.id, entrada)
      await this.tipo.sincronizarConta(tx, clubeId, vinculo.usuarioId, hoje)
    })
    return montarSaida(await this.carregar(clubeId, vinculo.usuarioId))
  }

  async reenviarConvite(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId } = sessao
    const usuario = await this.carregar(clubeId, id)
    if (usuario.status !== 'CONVIDADO') throw new ErroApp('REGRA', 'Este usuário já definiu a senha.')
    const clube = await this.prisma.clube.findUniqueOrThrow({ where: { id: clubeId } })
    const token = await this.tokens.gerar(usuario.id, 'CONVITE')
    await this.email.enviar(emailConvite({ para: usuario.email, nome: usuario.nome, clube: clube.nome, token }))
  }

  /**
   * Convite por link: papel ja ativo no clube ganha as unidades/classes a mais; papel ausente ou
   * desativado nasce (ou volta) so com as do convite. Roda na transacao de quem chama, que ja ligou a
   * ficha a conta: o Tipo da ficha e recalculado junto.
   */
  async acrescentarPapel(
    tx: Cliente,
    clubeId: string,
    usuarioId: string,
    papel: Papel,
    relacoes: { unidadeIds: string[]; classeIds: string[] },
  ): Promise<void> {
    const ativo = await tx.vinculo.findFirst({ where: { clubeId, usuarioId, papel, ativo: true } })
    if (ativo) {
      await tx.vinculoUnidade.createMany({
        data: [...new Set(relacoes.unidadeIds)].map((unidadeId) => ({ clubeId, vinculoId: ativo.id, unidadeId })),
        skipDuplicates: true,
      })
      await tx.vinculoClasse.createMany({
        data: [...new Set(relacoes.classeIds)].map((classeId) => ({ vinculoId: ativo.id, classeId })),
        skipDuplicates: true,
      })
    } else {
      await this.aplicarVinculo(tx, clubeId, usuarioId, { papel, ...relacoes, ajustes: [] })
    }
    await this.tipo.sincronizarConta(tx, clubeId, usuarioId, await this.tipo.hoje(clubeId))
  }

  /** Usuario alcancavel so por quem tem vinculo (ativo ou nao) neste clube; senao 404. */
  private async carregar(clubeId: string, id: string): Promise<UsuarioComVinculos> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, vinculos: { some: { clubeId } } },
      include: incluirVinculos(clubeId),
    })
    if (!usuario) throw new ErroApp('NAO_ENCONTRADO', 'Usuário não encontrado.')
    return usuario
  }

  private async avisarNovoAcesso(clubeId: string, usuario: Usuario): Promise<void> {
    const clube = await this.prisma.clube.findUniqueOrThrow({ where: { id: clubeId } })
    try {
      if (usuario.status === 'CONVIDADO') {
        const token = await this.tokens.gerar(usuario.id, 'CONVITE')
        await this.email.enviar(emailConvite({ para: usuario.email, nome: usuario.nome, clube: clube.nome, token }))
      } else {
        await this.email.enviar(emailAdicionado({ para: usuario.email, nome: usuario.nome, clube: clube.nome }))
      }
    } catch (erro) {
      // O acesso ja foi gravado; o Adm pode reenviar o convite.
      this.logger.warn(`Falha ao enviar e-mail para o usuario ${usuario.id}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  private async exigirPapeisLivres(clubeId: string, usuarioId: string, papeis: Papel[]): Promise<void> {
    const repetido = await this.prisma.vinculo.findFirst({
      where: { clubeId, usuarioId, ativo: true, papel: { in: papeis } },
      select: { id: true },
    })
    if (repetido) throw new ErroApp('CONFLITO', 'Este usuário já tem esse papel no clube.')
  }

  /** Serializa quem tira Adm do clube: quem chega depois conta os Adm já sem o do primeiro. */
  private async travarAdmsDoClube(tx: Cliente, clubeId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`adm-do-clube:${clubeId}`}, 0))`
  }

  private async exigirOutroAdm(tx: Cliente, clubeId: string, idsSaindo: string[], saiUmAdm: boolean): Promise<void> {
    if (!saiUmAdm) return
    const restantes = await tx.vinculo.count({
      where: { clubeId, papel: 'ADM', ativo: true, id: { notIn: idsSaindo } },
    })
    if (restantes === 0) throw new ErroApp('ULTIMO_ADM', 'O clube precisa de pelo menos um administrador ativo.')
  }

  private exigirRelacoesDoPapel(papel: Papel, relacoes: { unidadeIds?: string[]; classeIds?: string[] }): void {
    if (papel !== 'CONSELHEIRO' && relacoes.unidadeIds?.length) throw new ErroApp('REGRA', 'Só conselheiro tem unidades.')
    if (papel !== 'INSTRUTOR' && relacoes.classeIds?.length) throw new ErroApp('REGRA', 'Só instrutor tem classes.')
  }

  private validarAjustes(papel: Papel, ajustes: z.infer<typeof AjustePermissao>[]): void {
    if (papel === 'ADM' && ajustes.length > 0) {
      throw new ErroApp('AJUSTE_INVALIDO', 'O administrador tem todas as permissões; não há o que ajustar.')
    }
    for (const ajuste of ajustes) {
      if (!permissaoSeAplica(papel, ajuste.permissao)) {
        throw new ErroApp('AJUSTE_INVALIDO', `A permissão "${ajuste.permissao}" não se aplica ao papel informado.`)
      }
    }
  }

  private async validarVinculo(clubeId: string, vinculo: Entrada): Promise<void> {
    this.validarAjustes(vinculo.papel, vinculo.ajustes)
    await this.validarRelacoes(clubeId, vinculo.unidadeIds, vinculo.classeIds)
  }

  /**
   * Unidade precisa ser do clube; classe, oficial ou do clube, e ativa, salvo a que o vinculo ja tinha.
   * Qualquer outra → 404.
   */
  private async validarRelacoes(
    clubeId: string,
    unidadeIds: string[],
    classeIds: string[],
    classesJaVinculadas: string[] = [],
  ): Promise<void> {
    const unidades = [...new Set(unidadeIds)]
    if (unidades.length > 0) {
      const achadas = await this.prisma.unidade.count({ where: { clubeId, id: { in: unidades } } })
      if (achadas !== unidades.length) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    }
    const classes = [...new Set(classeIds)]
    if (classes.length > 0) {
      const achadas = await this.prisma.classe.count({
        where: {
          id: { in: classes },
          OR: [{ clubeId: null }, { clubeId }],
          AND: { OR: [{ ativa: true }, { id: { in: classesJaVinculadas } }] },
        },
      })
      if (achadas !== classes.length) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
    }
  }

  /** Cria o vinculo, ou reativa o desativado do mesmo papel, com as unidades/classes/ajustes informados. */
  private async aplicarVinculo(tx: Cliente, clubeId: string, usuarioId: string, entrada: Entrada): Promise<void> {
    const existente = await tx.vinculo.findFirst({ where: { clubeId, usuarioId, papel: entrada.papel } })
    const vinculo = existente
      ? await tx.vinculo.update({ where: { id: existente.id, clubeId }, data: { ativo: true } })
      : await tx.vinculo.create({ data: { clubeId, usuarioId, papel: entrada.papel } })
    await this.substituirRelacoes(tx, clubeId, vinculo.id, entrada)
  }

  /** Troca so o que foi informado (`undefined` = deixa como esta). */
  private async substituirRelacoes(
    tx: Cliente,
    clubeId: string,
    vinculoId: string,
    novas: { unidadeIds?: string[]; classeIds?: string[]; ajustes?: z.infer<typeof AjustePermissao>[] },
  ): Promise<void> {
    if (novas.unidadeIds) {
      await tx.vinculoUnidade.deleteMany({ where: { clubeId, vinculoId } })
      await tx.vinculoUnidade.createMany({
        data: [...new Set(novas.unidadeIds)].map((unidadeId) => ({ clubeId, vinculoId, unidadeId })),
      })
    }
    if (novas.classeIds) {
      await tx.vinculoClasse.deleteMany({ where: { vinculoId } })
      await tx.vinculoClasse.createMany({ data: [...new Set(novas.classeIds)].map((classeId) => ({ vinculoId, classeId })) })
    }
    if (novas.ajustes) {
      const ultimoPorChave = new Map(novas.ajustes.map((a) => [a.permissao, a.concedida]))
      await tx.permissaoAjuste.deleteMany({ where: { vinculoId } })
      await tx.permissaoAjuste.createMany({
        data: [...ultimoPorChave].map(([permissao, concedida]) => ({ vinculoId, permissao, concedida })),
      })
    }
  }
}
