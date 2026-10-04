import { Injectable } from '@nestjs/common'
import {
  AVISOS_IMPORTACAO,
  avisoDeSexoDaUnidade,
  idade,
  idadeDaClasse,
  MENSAGEM_DIRETORIA_SEM_UNIDADE,
  motivosDiretoria,
  nomePublico as calcularNomePublico,
  PAPEIS_DA_DIRETORIA,
  regraDaDiretoria,
  tipoDaFicha,
  type Aviso as AvisoContrato,
  type DesbravadorCriarEntrada,
  type DesbravadorEditarEntrada,
  type DesbravadorFiltro,
  type DesbravadorSaida,
  type Papel,
  type InativarEntrada,
  type MatriculaEntrada,
  type MatriculaSaida,
  type MoverUnidadeEntrada,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { Prisma } from '../generated/prisma/client.js'
import { colador, daDataCivil, paginar, paraDataCivil, semAcento } from './apoio'
import { ServicoEscopo, type RelogioDoClube } from './escopo.service'
import { ServicoTipoDaFicha } from './tipo-da-ficha.service'

type Saida = z.infer<typeof DesbravadorSaida>
type Matricula = z.infer<typeof MatriculaSaida>
type Aviso = z.infer<typeof AvisoContrato>
type Cliente = Prisma.TransactionClient
export type ClasseParaMatricula = { id: string; tipo: 'REGULAR' | 'AVANCADA'; trilha: 'INDIVIDUAL' | 'AGRUPADAS' }
export type ClasseDaIdade = ClasseParaMatricula & { nome: string }

/** Uma conta liga no maximo uma ficha por clube: o indice parcial de Desbravador recusa a segunda. */
function recusarContaJaLigada(falha: unknown): never {
  if (falha instanceof Prisma.PrismaClientKnownRequestError && falha.code === 'P2002') {
    throw new ErroApp('REGRA', 'Este usuário já está ligado a outro desbravador do clube.')
  }
  throw falha
}

/** O caderno das Agrupadas e para 16 anos ou mais: uma turma so, sem divisao por idade. */
const IDADE_MINIMA_AGRUPADAS = 16

const CAMPOS_DO_CONSELHEIRO = [
  'nome',
  'nomePublico',
  'responsavelNome',
  'responsavelTelefone',
  'responsavelEmail',
  'autorizacaoImagem',
  'autorizacaoImagemEm',
]

function relacoesDoAno(clubeId: string, anoClube: number) {
  return {
    usuario: {
      select: {
        vinculos: {
          where: { clubeId, ativo: true },
          select: {
            papel: true,
            classes: { select: { classe: { select: { ...SELECAO_REF_CLASSE, ordem: true } } } },
            unidades: { where: { clubeId }, select: { unidade: { select: { id: true, nome: true } } } },
          },
        },
      },
    },
    membros: {
      where: { fim: null },
      include: { unidade: { select: { id: true, nome: true, tipo: true } } },
    },
    matriculas: {
      where: { anoClube, status: 'CURSANDO' },
      orderBy: { classe: { ordem: 'asc' } },
      include: { classe: { select: { ...SELECAO_REF_CLASSE, idade: true } } },
    },
  } satisfies Prisma.DesbravadorInclude
}

type DesbravadorCompleto = Prisma.DesbravadorGetPayload<{ include: ReturnType<typeof relacoesDoAno> }>

function motivos(dbv: DesbravadorCompleto, hoje: string): Saida['motivosDiretoria'] {
  const ficha = {
    tipo: dbv.tipo,
    diretoriaPeloAdm: dbv.diretoriaPeloAdm,
    diretoriaDesde: dbv.diretoriaDesde ? paraDataCivil(dbv.diretoriaDesde) : null,
    nascimento: paraDataCivil(dbv.nascimento),
    papeis: dbv.usuario?.vinculos.map((vinculo) => vinculo.papel) ?? [],
  }
  return motivosDiretoria(ficha, hoje)
}

/** O que a conta ligada à ficha conduz no clube: classes que instrui e unidades que aconselha. */
function conduz(dbv: DesbravadorCompleto): Pick<Saida, 'instrui' | 'aconselha'> {
  const vinculos = dbv.usuario?.vinculos ?? []
  const classes = vinculos
    .filter((vinculo) => vinculo.papel === 'INSTRUTOR')
    .flatMap((vinculo) => vinculo.classes.map((ligacao) => ligacao.classe))
    .sort((a, b) => a.ordem - b.ordem)
  const unidades = vinculos
    .filter((vinculo) => vinculo.papel === 'CONSELHEIRO')
    .flatMap((vinculo) => vinculo.unidades.map((ligacao) => ligacao.unidade))
    .sort((a, b) => colador.compare(a.nome, b.nome))
  return { instrui: classes.map(refClasse), aconselha: unidades.map((unidade) => ({ id: unidade.id, nome: unidade.nome })) }
}

function classeRegularAtual(dbv: DesbravadorCompleto): DesbravadorCompleto['matriculas'][number]['classe'] | undefined {
  return dbv.matriculas.find((m) => m.classe.tipo === 'REGULAR')?.classe
}

export function montarSaida(dbv: DesbravadorCompleto, relogio: RelogioDoClube, comContato: boolean): Saida {
  const avancada = dbv.matriculas.find((m) => m.classe.tipo === 'AVANCADA')?.classe
  const regular = classeRegularAtual(dbv)
  const unidade = dbv.membros[0]?.unidade
  const saida: Saida = {
    id: dbv.id,
    nome: dbv.nome,
    nomePublico: dbv.nomePublico,
    tipo: dbv.tipo,
    nascimento: paraDataCivil(dbv.nascimento),
    idade: idade(paraDataCivil(dbv.nascimento), relogio.hoje),
    sexo: dbv.sexo,
    ativo: dbv.ativo,
    entradaEm: paraDataCivil(dbv.entradaEm),
    saidaEm: dbv.saidaEm ? paraDataCivil(dbv.saidaEm) : null,
    autorizacaoImagem: dbv.autorizacaoImagem,
    autorizacaoImagemEm: dbv.autorizacaoImagemEm ? paraDataCivil(dbv.autorizacaoImagemEm) : null,
    usuarioId: dbv.usuarioId,
    unidade: unidade ? { id: unidade.id, nome: unidade.nome } : null,
    classeAtual: regular ? refClasse(regular) : null,
    avancadaAtual: avancada ? refClasse(avancada) : null,
    motivosDiretoria: motivos(dbv, relogio.hoje),
    ...conduz(dbv),
  }
  if (comContato) {
    saida.contato = {
      responsavelNome: dbv.responsavelNome,
      responsavelTelefone: dbv.responsavelTelefone,
      responsavelEmail: dbv.responsavelEmail,
    }
  }
  return saida
}

/** Classe desligada pelo clube (`ClasseClube.ativa = false`) não existe para matrícula nova. */
export const ativaNoClube = (clubeId: string) => ({ clubes: { none: { clubeId, ativa: false } } }) satisfies Prisma.ClasseWhereInput

/**
 * Classe regular ativa (e ativa no clube) que a idade de referência pede: na individual, a da idade exata;
 * nas agrupadas, a maior que a idade já alcança (com `ORDEM_CLASSE_DA_IDADE`).
 */
export function ondeClasseDaIdade(clubeId: string, trilha: 'INDIVIDUAL' | 'AGRUPADAS', idadeDeReferencia: number): Prisma.ClasseWhereInput {
  return {
    OR: [{ clubeId: null }, { clubeId }],
    ativa: true,
    tipo: 'REGULAR',
    trilha,
    idade: trilha === 'INDIVIDUAL' ? idadeDeReferencia : { lte: idadeDeReferencia },
    ...ativaNoClube(clubeId),
  }
}

export const ORDEM_CLASSE_DA_IDADE = [{ idade: 'desc' }, { ordem: 'asc' }] satisfies Prisma.ClasseOrderByWithRelationInput[]

/**
 * Serializa a escrita de matrícula de um desbravador até o fim da transação: a varredura que leu "sem classe"
 * espera o Adm que está matriculando. O lock advisory é reentrante na mesma transação.
 */
export async function travarMatriculasDoDesbravador(tx: Cliente, dbvId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`matriculas-desbravador:${dbvId}`}, 0))`
}

@Injectable()
export class DesbravadoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly tipo: ServicoTipoDaFicha,
  ) {}

  async listar(sessao: SessaoLogada, filtro: z.infer<typeof DesbravadorFiltro>) {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const permissoes = await this.escopo.permissoes(sessao)
    const doPapel = await this.escopo.filtroDesbravadores(sessao, relogio)
    const condicoes: Prisma.DesbravadorWhereInput[] = [doPapel]
    if (filtro.ativo !== 'todos') condicoes.push({ ativo: filtro.ativo === 'true' })
    if (filtro.tipo) condicoes.push({ tipo: filtro.tipo })
    if (filtro.unidadeId) condicoes.push({ membros: { some: { clubeId, unidadeId: filtro.unidadeId, fim: null } } })
    if (filtro.semUnidade) condicoes.push({ membros: { none: { fim: null } } })
    if (filtro.classeId) {
      condicoes.push({
        matriculas: { some: { clubeId, classeId: filtro.classeId, anoClube: relogio.anoClube, status: 'CURSANDO' } },
      })
    }

    const candidatos = await this.prisma.desbravador.findMany({
      where: { clubeId, AND: condicoes },
      select: { id: true, nome: true },
    })
    const termo = filtro.busca ? semAcento(filtro.busca) : undefined
    const ordenados = candidatos
      .filter((c) => !termo || semAcento(c.nome).includes(termo))
      .sort((a, b) => colador.compare(a.nome, b.nome))
    const idsDaPagina = paginar(ordenados, filtro.pagina, filtro.porPagina).map((c) => c.id)

    const linhas = await this.prisma.desbravador.findMany({
      where: { clubeId, id: { in: idsDaPagina } },
      include: relacoesDoAno(clubeId, relogio.anoClube),
    })
    const porId = new Map(linhas.map((linha) => [linha.id, linha]))
    const comContato = permissoes.includes('dbv.ver_contato')
    const itens = idsDaPagina.flatMap((id) => {
      const linha = porId.get(id)
      return linha ? [montarSaida(linha, relogio, comContato)] : []
    })
    return { itens, total: ordenados.length, pagina: filtro.pagina, porPagina: filtro.porPagina }
  }

  async obter(sessao: SessaoLogada, id: string): Promise<Saida> {
    const relogio = await this.escopo.relogio(sessao.clubeId)
    const permissoes = await this.escopo.permissoes(sessao)
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    return montarSaida(dbv, relogio, permissoes.includes('dbv.ver_contato'))
  }

  async criar(sessao: SessaoLogada, entrada: z.infer<typeof DesbravadorCriarEntrada>) {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    if (entrada.tipo === 'LIDER' && entrada.unidadeId) {
      throw new ErroApp('REGRA', 'Líder não pertence a uma unidade.')
    }
    if (entrada.tipo === 'DIRETORIA' && entrada.unidadeId) throw new ErroApp('REGRA', MENSAGEM_DIRETORIA_SEM_UNIDADE)
    if (entrada.unidadeId) await this.exigirUnidade(clubeId, entrada.unidadeId)
    if (entrada.usuarioId) await this.exigirUsuarioDoClube(clubeId, entrada.usuarioId)
    const classe = entrada.classeId ? await this.exigirClasse(clubeId, entrada.classeId) : undefined
    if (classe && classe.tipo !== 'REGULAR') {
      throw new ErroApp('REGRA', 'Escolha a classe regular; a avançada entra junto.')
    }

    const criado = await this.prisma
      .$transaction((tx) => this.gravarNovo(tx, { clubeId, anoClube: relogio.anoClube, hoje: relogio.hoje, entrada, classe }))
      .catch(recusarContaJaLigada)
    const resposta = await this.saidaComAvisos(sessao, criado.id, relogio)
    if (criado.unidadeIgnorada) {
      resposta.avisos.push({ codigo: AVISOS_IMPORTACAO.diretoriaSemUnidade, mensagem: MENSAGEM_DIRETORIA_SEM_UNIDADE })
    }
    return resposta
  }

  /**
   * Miolo do cadastro: pessoa, membro da unidade e matrícula (regular + avançada), no cliente da transação.
   * O Tipo é decidido antes de gravar: quem já tem a regra da Diretoria entra nela, sem unidade. Desbravador
   * sem classe escolhida entra na classe da idade, quando houver.
   */
  async gravarNovo(
    tx: Cliente,
    dados: {
      clubeId: string
      anoClube: number
      hoje: string
      entrada: z.infer<typeof DesbravadorCriarEntrada>
      classe: ClasseParaMatricula | undefined
    },
  ): Promise<{ id: string; unidadeIgnorada: boolean }> {
    const { clubeId, anoClube, hoje, entrada, classe } = dados
    const papeis = entrada.usuarioId ? await this.papeisDaDiretoria(tx, clubeId, entrada.usuarioId) : []
    const pedido = {
      tipo: entrada.tipo,
      diretoriaPeloAdm: entrada.tipo === 'DIRETORIA' && !regraDaDiretoria(entrada.nascimento, papeis, hoje),
      diretoriaDesde: null,
      nascimento: entrada.nascimento,
      papeis,
    }
    const { tipo, diretoriaPeloAdm } = tipoDaFicha(pedido, hoje)
    // Quem nunca foi desbravador no clube está na Diretoria desde que entrou.
    const diretoriaDesde = tipo === 'DIRETORIA' ? daDataCivil(entrada.entradaEm) : null
    const dbv = await tx.desbravador.create({
      data: {
        clubeId,
        nome: entrada.nome,
        nomePublico: entrada.nomePublico ?? calcularNomePublico(entrada.nome),
        tipo,
        diretoriaPeloAdm,
        diretoriaDesde,
        usuarioId: entrada.usuarioId ?? null,
        nascimento: daDataCivil(entrada.nascimento),
        sexo: entrada.sexo,
        responsavelNome: entrada.responsavelNome ?? null,
        responsavelTelefone: entrada.responsavelTelefone ?? null,
        responsavelEmail: entrada.responsavelEmail ?? null,
        autorizacaoImagem: entrada.autorizacaoImagem,
        autorizacaoImagemEm: entrada.autorizacaoImagemEm ? daDataCivil(entrada.autorizacaoImagemEm) : null,
        entradaEm: daDataCivil(entrada.entradaEm),
      },
    })
    if (entrada.unidadeId && tipo === 'DBV') {
      await tx.membroUnidade.create({
        data: { clubeId, dbvId: dbv.id, unidadeId: entrada.unidadeId, inicio: daDataCivil(entrada.entradaEm) },
      })
    }
    if (classe) {
      await this.matricular(tx, {
        clubeId,
        dbvId: dbv.id,
        classe,
        anoClube,
        incluirAvancada: entrada.incluirAvancada,
      })
    } else if (tipo === 'DBV') {
      await this.matricularPelaIdade(tx, { clubeId, dbvId: dbv.id, nascimento: entrada.nascimento, anoClube })
    }
    return { id: dbv.id, unidadeIgnorada: Boolean(entrada.unidadeId) && tipo !== 'DBV' }
  }

  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof DesbravadorEditarEntrada>) {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const atual = await this.carregarNoEscopo(sessao, id, relogio)
    if (sessao.papel !== 'ADM') {
      const alemDoPermitido = Object.keys(entrada).filter((campo) => !CAMPOS_DO_CONSELHEIRO.includes(campo))
      if (alemDoPermitido.length > 0) {
        throw new ErroApp('REGRA', 'Você só pode alterar nome, responsável e autorização de imagem.')
      }
    }
    // O formulário manda o Tipo sempre; só conta como escolha do Adm quando muda.
    const tipoEscolhido = entrada.tipo !== undefined && entrada.tipo !== atual.tipo ? entrada.tipo : undefined
    if (entrada.usuarioId) await this.exigirUsuarioDoClube(clubeId, entrada.usuarioId)

    await this.prisma.$transaction(async (tx) => {
      await tx.desbravador.update({
        where: { id, clubeId },
        data: {
          nome: entrada.nome,
          nomePublico: entrada.nomePublico,
          usuarioId: entrada.usuarioId,
          nascimento: entrada.nascimento ? daDataCivil(entrada.nascimento) : undefined,
          sexo: entrada.sexo,
          responsavelNome: entrada.responsavelNome,
          responsavelTelefone: entrada.responsavelTelefone,
          responsavelEmail: entrada.responsavelEmail,
          autorizacaoImagem: entrada.autorizacaoImagem,
          autorizacaoImagemEm: entrada.autorizacaoImagemEm ? daDataCivil(entrada.autorizacaoImagemEm) : entrada.autorizacaoImagemEm,
        },
      })
      const ficha = await this.tipo.lerFicha(tx, clubeId, id)
      if (tipoEscolhido) await this.tipo.escolhaDoAdm(tx, clubeId, ficha, tipoEscolhido, relogio.hoje)
      else await this.tipo.aplicar(tx, clubeId, ficha, relogio.hoje)
    }).catch(recusarContaJaLigada)
    return this.saidaComAvisos(sessao, id, relogio)
  }

  async inativar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof InativarEntrada>): Promise<Saida> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    if (!dbv.ativo) throw new ErroApp('REGRA', 'Este desbravador já está inativo.')
    const saida = daDataCivil(entrada.saidaEm)
    if (saida < dbv.entradaEm) throw new ErroApp('REGRA', 'A saída não pode ser antes da entrada.')

    await this.prisma.$transaction(async (tx) => {
      await tx.desbravador.update({ where: { id, clubeId }, data: { ativo: false, saidaEm: saida } })
      for (const membro of dbv.membros) {
        await tx.membroUnidade.update({
          where: { id: membro.id, clubeId },
          data: { fim: saida < membro.inicio ? membro.inicio : saida },
        })
      }
      await tx.matriculaClasse.updateMany({
        where: { clubeId, dbvId: id, status: 'CURSANDO' },
        data: { status: 'DESISTIU' },
      })
    })
    return this.obter(sessao, id)
  }

  async reativar(sessao: SessaoLogada, id: string): Promise<Saida> {
    const relogio = await this.escopo.relogio(sessao.clubeId)
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    if (dbv.ativo) throw new ErroApp('REGRA', 'Este desbravador já está ativo.')
    await this.prisma.desbravador.update({ where: { id, clubeId: sessao.clubeId }, data: { ativo: true, saidaEm: null } })
    return this.obter(sessao, id)
  }

  async moverUnidade(sessao: SessaoLogada, id: string, entrada: z.infer<typeof MoverUnidadeEntrada>): Promise<Saida> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    if (dbv.tipo === 'LIDER') throw new ErroApp('REGRA', 'Líder não pertence a uma unidade.')
    if (dbv.tipo === 'DIRETORIA') throw new ErroApp('REGRA', MENSAGEM_DIRETORIA_SEM_UNIDADE)
    if (!dbv.ativo) throw new ErroApp('REGRA', 'Reative o desbravador antes de mudar a unidade.')
    if (entrada.unidadeId) await this.exigirUnidade(clubeId, entrada.unidadeId)
    const aberto = dbv.membros[0]
    if ((aberto?.unidadeId ?? null) === entrada.unidadeId) return this.obter(sessao, id)
    const desde = daDataCivil(entrada.desde)
    if (aberto && desde < aberto.inicio) {
      throw new ErroApp('REGRA', 'A data não pode ser anterior à entrada na unidade atual.')
    }

    await this.prisma.$transaction(async (tx) => {
      if (aberto) await tx.membroUnidade.update({ where: { id: aberto.id, clubeId }, data: { fim: desde } })
      if (entrada.unidadeId) {
        await tx.membroUnidade.create({ data: { clubeId, dbvId: id, unidadeId: entrada.unidadeId, inicio: desde } })
      }
    })
    return this.obter(sessao, id)
  }

  async matricularEmClasse(sessao: SessaoLogada, id: string, entrada: z.infer<typeof MatriculaEntrada>): Promise<Matricula[]> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    if (!dbv.ativo) throw new ErroApp('REGRA', 'Reative o desbravador antes de matricular.')
    const classe = await this.exigirClasse(clubeId, entrada.classeId)
    return this.prisma.$transaction((tx) =>
      this.matricular(tx, {
        clubeId,
        dbvId: id,
        classe,
        anoClube: entrada.anoClube,
        incluirAvancada: entrada.incluirAvancada,
      }),
    )
  }

  /** Classe regular individual da idade completada até 30/06 do ano do clube; empate, a de menor ordem. */
  async classeDaIdade(cliente: Cliente, clubeId: string, nascimento: string, anoClube: number): Promise<ClasseDaIdade | null> {
    return cliente.classe.findFirst({
      where: ondeClasseDaIdade(clubeId, 'INDIVIDUAL', idadeDaClasse(nascimento, anoClube)),
      orderBy: ORDEM_CLASSE_DA_IDADE,
      select: { id: true, nome: true, tipo: true, trilha: true },
    })
  }

  /** Matricula na classe da idade, com a avançada. Devolve se havia classe para a idade. */
  async matricularPelaIdade(
    tx: Cliente,
    dados: { clubeId: string; dbvId: string; nascimento: string; anoClube: number },
  ): Promise<boolean> {
    const { clubeId, dbvId, nascimento, anoClube } = dados
    const classe = await this.classeDaIdade(tx, clubeId, nascimento, anoClube)
    if (!classe) return false
    await this.matricular(tx, { clubeId, dbvId, classe, anoClube, incluirAvancada: true })
    return true
  }

  private async carregarNoEscopo(sessao: SessaoLogada, id: string, relogio: RelogioDoClube): Promise<DesbravadorCompleto> {
    const doPapel = await this.escopo.filtroDesbravadores(sessao, relogio)
    const dbv = await this.prisma.desbravador.findFirst({
      where: { clubeId: sessao.clubeId, AND: [doPapel, { id }] },
      include: relacoesDoAno(sessao.clubeId, relogio.anoClube),
    })
    if (!dbv) throw new ErroApp('NAO_ENCONTRADO', 'Desbravador não encontrado.')
    return dbv
  }

  private async papeisDaDiretoria(tx: Cliente, clubeId: string, usuarioId: string): Promise<Papel[]> {
    const vinculos = await tx.vinculo.findMany({
      where: { clubeId, usuarioId, ativo: true, papel: { in: [...PAPEIS_DA_DIRETORIA] } },
      select: { papel: true },
    })
    return vinculos.map((vinculo) => vinculo.papel)
  }

  private async exigirUnidade(clubeId: string, unidadeId: string): Promise<void> {
    const unidade = await this.prisma.unidade.findFirst({ where: { id: unidadeId, clubeId }, select: { id: true } })
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
  }

  private async exigirUsuarioDoClube(clubeId: string, usuarioId: string): Promise<void> {
    const vinculo = await this.prisma.vinculo.findFirst({
      where: { clubeId, usuarioId, ativo: true },
      select: { id: true },
    })
    if (!vinculo) throw new ErroApp('NAO_ENCONTRADO', 'Usuário não encontrado.')
  }

  /** Classe para matricula nova: a desativada responde como inexistente. */
  private async exigirClasse(clubeId: string, classeId: string) {
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId }], ativa: true },
      select: { id: true, tipo: true, trilha: true },
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
    return classe
  }

  /**
   * Matricula na classe. Regular nova desiste da regular CURSANDO anterior da mesma trilha no ano
   * (e da avancada ligada a ela); so uma regular CURSANDO por trilha e ano.
   */
  private async matricular(
    tx: Cliente,
    dados: {
      clubeId: string
      dbvId: string
      classe: ClasseParaMatricula
      anoClube: number
      incluirAvancada: boolean
    },
  ): Promise<Matricula[]> {
    const { clubeId, dbvId, classe, anoClube } = dados
    await travarMatriculasDoDesbravador(tx, dbvId)
    if (classe.tipo === 'REGULAR') {
      const anteriores = await tx.matriculaClasse.findMany({
        where: {
          clubeId,
          dbvId,
          anoClube,
          status: 'CURSANDO',
          classeId: { not: classe.id },
          classe: { tipo: 'REGULAR', trilha: classe.trilha },
        },
        select: { classeId: true },
      })
      if (anteriores.length > 0) {
        const idsAnteriores = anteriores.map((anterior) => anterior.classeId)
        await tx.matriculaClasse.updateMany({
          where: {
            clubeId,
            dbvId,
            anoClube,
            status: 'CURSANDO',
            OR: [{ classeId: { in: idsAnteriores } }, { classe: { tipo: 'AVANCADA', classeBaseId: { in: idsAnteriores } } }],
          },
          data: { status: 'DESISTIU' },
        })
      }
    }
    const classeIds = [classe.id]
    if (classe.tipo === 'REGULAR' && dados.incluirAvancada) {
      const avancada = await tx.classe.findFirst({
        where: { classeBaseId: classe.id, tipo: 'AVANCADA', OR: [{ clubeId: null }, { clubeId }] },
        orderBy: { ordem: 'asc' },
        select: { id: true },
      })
      if (avancada) classeIds.push(avancada.id)
    }
    const matriculas: Matricula[] = []
    for (const classeId of classeIds) matriculas.push(await this.garantirMatricula(tx, { clubeId, dbvId, classeId, anoClube }))
    return matriculas
  }

  private async garantirMatricula(
    tx: Cliente,
    dados: { clubeId: string; dbvId: string; classeId: string; anoClube: number },
  ): Promise<Matricula> {
    const { clubeId, dbvId, classeId, anoClube } = dados
    const incluir = { classe: { select: SELECAO_REF_CLASSE } } satisfies Prisma.MatriculaClasseInclude
    const existente = await tx.matriculaClasse.findFirst({ where: { clubeId, dbvId, classeId, anoClube } })
    if (existente && (existente.status === 'CONCLUIDA' || existente.status === 'INVESTIDA')) {
      throw new ErroApp('REGRA', 'Este desbravador já concluiu esta classe neste ano.')
    }
    const matricula = !existente
      ? await tx.matriculaClasse.create({ data: { clubeId, dbvId, classeId, anoClube }, include: incluir })
      : await tx.matriculaClasse.update({
          where: { id: existente.id, clubeId },
          data: { status: 'CURSANDO' },
          include: incluir,
        })
    return { id: matricula.id, classe: refClasse(matricula.classe), anoClube: matricula.anoClube, status: matricula.status }
  }

  private async saidaComAvisos(sessao: SessaoLogada, id: string, relogio: RelogioDoClube) {
    const dbv = await this.carregarNoEscopo(sessao, id, relogio)
    const permissoes = await this.escopo.permissoes(sessao)
    const avisos = await this.avisosDoCadastro(sessao.clubeId, dbv, relogio)
    return { dados: montarSaida(dbv, relogio, permissoes.includes('dbv.ver_contato')), avisos }
  }

  private async avisosDoCadastro(clubeId: string, dbv: DesbravadorCompleto, relogio: RelogioDoClube): Promise<Aviso[]> {
    const avisos: Aviso[] = []
    const unidade = dbv.membros[0]?.unidade
    const avisoDeSexo = unidade ? avisoDeSexoDaUnidade(unidade, dbv.sexo) : undefined
    if (avisoDeSexo) avisos.push(avisoDeSexo)
    const classe = classeRegularAtual(dbv)
    if (dbv.tipo === 'DBV' && classe?.idade != null) {
      const nascimento = paraDataCivil(dbv.nascimento)
      const idadeDeReferencia = idadeDaClasse(nascimento, relogio.anoClube)
      if (classe.trilha === 'AGRUPADAS' && idadeDeReferencia < IDADE_MINIMA_AGRUPADAS) {
        avisos.push({ codigo: 'AVISO_IDADE_CLASSE', mensagem: 'As classes agrupadas são para 16 anos ou mais.' })
      }
      if (classe.trilha === 'INDIVIDUAL' && classe.idade !== idadeDeReferencia) {
        const esperada = await this.classeDaIdade(this.prisma, clubeId, nascimento, relogio.anoClube)
        avisos.push({
          codigo: 'AVISO_IDADE_CLASSE',
          mensagem: esperada
            ? `Pela idade, a classe esperada é ${esperada.nome}.`
            : 'Pela idade, esta não é a classe esperada.',
        })
      }
    }
    return avisos
  }
}
