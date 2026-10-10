import { rm } from 'node:fs/promises'
import { extname } from 'node:path'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  MARCACOES_PADRAO,
  MaterialCBArquivoDados,
  type DatasSaida,
  type EdicaoRascunhoEntrada,
  type EdicaoSaida,
  type GrupoCB,
  type GruposEntrada,
  type GruposSaida,
  type MaterialCB,
  type MaterialCBLinkEntrada,
  type SituacaoEdicaoCB,
  type TerminarEntrada,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { caminhoDoMaterial, ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { gerarUuidV7 } from '../comum/uuid-v7'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { EdicaoClasseBiblica, Prisma } from '../generated/prisma/client.js'
import type { ArquivoEmDisco } from '../materiais/materiais.service'
import { conteudoConfereComExtensao } from '../materiais/conferencia-de-documento'
import { garantirCriterios } from './criterios'
import { ROTULO_DO_IMPEDIMENTO, TIPOS_QUE_IMPEDEM } from './datas'
import { EDICAO_NAO_ENCONTRADA, GRUPO_NAO_ENCONTRADO } from './escopo-grupos'

type Edicao = z.infer<typeof EdicaoSaida>
type Material = z.infer<typeof MaterialCB>
type Grupo = z.infer<typeof GrupoCB>
type Banco = Prisma.TransactionClient | PrismaService

const TEMPO_DA_TRANSACAO_MS = 20_000
const CONFIRA = 'Confira os campos informados.'
const TRAVADOS_DEPOIS_DE_TERMINAR = 'Início, fim e dia da semana não mudam depois que os encontros foram criados.'

/** Campos de grupo que montam o `GrupoCB` e o material. */
export const SELECAO_GRUPO = {
  id: true,
  nome: true,
  ordem: true,
  materialTitulo: true,
  materialUrl: true,
  materialArquivoId: true,
  materialArquivo: { select: { bytes: true } },
} as const

interface LinhaDeMaterial {
  materialTitulo: string | null
  materialUrl: string | null
  materialArquivoId: string | null
  materialArquivo: { bytes: number } | null
}

/** Material de estudo do grupo: PDF por URL assinada ou link externo. */
export function materialDoGrupo(arquivos: ServicoArquivos, clubeId: string, grupo: LinhaDeMaterial): Material | null {
  if (grupo.materialArquivoId) {
    return {
      titulo: grupo.materialTitulo ?? '',
      tipo: 'PDF',
      url: arquivos.urlAssinada(clubeId, grupo.materialArquivoId, 'original'),
      bytes: grupo.materialArquivo?.bytes ?? null,
    }
  }
  if (grupo.materialUrl) return { titulo: grupo.materialTitulo ?? '', tipo: 'LINK', url: grupo.materialUrl, bytes: null }
  return null
}

/** Regra 2: derivada, nunca guardada; o material não entra na conta. */
export function situacaoDaEdicao(edicao: Pick<EdicaoClasseBiblica, 'terminadaEm' | 'fim'>, hoje: string): z.infer<typeof SituacaoEdicaoCB> {
  if (!edicao.terminadaEm) return 'NAO_TERMINADA'
  return edicao.fim && paraDataCivil(edicao.fim) < hoje ? 'ENCERRADA' : 'EM_ANDAMENTO'
}

export function saidaDaEdicao(edicao: EdicaoClasseBiblica, hoje: string): Edicao {
  return {
    id: edicao.id,
    nome: edicao.nome,
    inicio: edicao.inicio ? paraDataCivil(edicao.inicio) : null,
    fim: edicao.fim ? paraDataCivil(edicao.fim) : null,
    diaSemana: edicao.diaSemana,
    horario: edicao.horario,
    local: edicao.local,
    etapa: edicao.etapa,
    situacao: situacaoDaEdicao(edicao, hoje),
    terminadaEm: edicao.terminadaEm ? edicao.terminadaEm.toISOString() : null,
    atualizadaEm: edicao.atualizadaEm.toISOString(),
  }
}

/** "2027-03-07" → "07/03". */
function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`
}

/** Toda ocorrência do dia da semana entre início e fim, inclusive (regra 4). */
function datasDoDia(inicio: string, fim: string, diaSemana: number): string[] {
  const datas: string[] = []
  const dia = daDataCivil(inicio)
  dia.setUTCDate(dia.getUTCDate() + ((diaSemana - dia.getUTCDay() + 7) % 7))
  for (const ultimo = daDataCivil(fim); dia <= ultimo; dia.setUTCDate(dia.getUTCDate() + 7)) datas.push(paraDataCivil(dia))
  return datas
}

function lerDadosDoArquivo(corpo: unknown): z.infer<typeof MaterialCBArquivoDados> {
  const bruto = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)['dados'] : undefined
  let json: unknown
  try {
    json = typeof bruto === 'string' ? JSON.parse(bruto) : undefined
  } catch {
    json = undefined
  }
  const resultado = MaterialCBArquivoDados.safeParse(json)
  if (!resultado.success) throw new ErroApp('VALIDACAO', CONFIRA, { dados: 'Dados do material inválidos.' })
  return resultado.data
}

interface OcupacaoPorEdicao { nome: string; inicio: string; fim: string }

/** Unidades já em grupo de edição terminada (outra que não esta) com período cruzando [inicio, fim] (regra 3). */
async function unidadesEmEdicaoTerminada(db: Banco, clubeId: string, edicaoId: string, inicio: Date, fim: Date): Promise<Map<string, OcupacaoPorEdicao>> {
  const ligacoes = await db.grupoUnidadeClasseBiblica.findMany({
    where: {
      clubeId,
      edicaoId: { not: edicaoId },
      grupo: { clubeId, removidoEm: null },
      edicao: { clubeId, terminadaEm: { not: null }, inicio: { lte: fim }, fim: { gte: inicio } },
    },
    select: { unidadeId: true, edicao: { select: { nome: true, inicio: true, fim: true } } },
  })
  const ocupadas = new Map<string, OcupacaoPorEdicao>()
  for (const { unidadeId, edicao } of ligacoes) {
    if (!edicao.inicio || !edicao.fim) continue
    ocupadas.set(unidadeId, { nome: edicao.nome ?? '', inicio: paraDataCivil(edicao.inicio), fim: paraDataCivil(edicao.fim) })
  }
  return ocupadas
}

function mensagemDeConflito(unidade: string, outra: OcupacaoPorEdicao): string {
  return `A unidade ${unidade} já está na edição ${outra.nome}, de ${diaMes(outra.inicio)} a ${diaMes(outra.fim)}. Tire-a deste grupo para continuar.`
}

async function travarClube(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`classe-biblica:${clubeId}`}, 0))`
}

/** Rascunho da edição, grupos, datas e terminar (regras 1–5 e 14), e o material dos grupos (regra 15). */
@Injectable()
export class ServicoEdicoes {
  private readonly logger = new Logger(ServicoEdicoes.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly arquivos: ServicoArquivos,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async criar(sessao: SessaoLogada, entrada: z.infer<typeof EdicaoRascunhoEntrada>): Promise<Edicao> {
    const { clubeId } = sessao
    exigirPeriodo(entrada.inicio ?? null, entrada.fim ?? null)
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const criada = await this.prisma.edicaoClasseBiblica.create({
      data: {
        clubeId,
        nome: entrada.nome || null,
        inicio: entrada.inicio ? daDataCivil(entrada.inicio) : null,
        fim: entrada.fim ? daDataCivil(entrada.fim) : null,
        diaSemana: entrada.diaSemana ?? configuracao.diaReuniao,
        horario: entrada.horario ?? null,
        local: entrada.local !== undefined ? entrada.local : configuracao.localReuniaoPadrao,
        etapa: entrada.etapa ?? 1,
        criadaPorId: sessao.usuarioId,
      },
    })
    return saidaDaEdicao(criada, (await this.escopo.relogio(clubeId)).hoje)
  }

  /** Salva o que veio; em edição terminada, horário e local descem aos encontros futuros sem chamada (regra 14). */
  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof EdicaoRascunhoEntrada>): Promise<Edicao> {
    const { clubeId } = sessao
    const { hoje } = await this.escopo.relogio(clubeId)
    const editada = await this.prisma.$transaction(async (tx) => {
      // Sob a trava do terminar: quem decide o que está travado lê a edição já terminada, se o terminar veio antes.
      await travarClube(tx, clubeId)
      const atual = await exigirEdicao(tx, clubeId, id)
      const terminada = atual.terminadaEm !== null
      if (terminada) {
        const mudou = (novo: string | number | null | undefined, antigo: Date | number | null): boolean =>
          novo !== undefined && novo !== (antigo instanceof Date ? paraDataCivil(antigo) : antigo)
        if (mudou(entrada.inicio, atual.inicio) || mudou(entrada.fim, atual.fim) || mudou(entrada.diaSemana, atual.diaSemana)) {
          throw new ErroApp('REGRA', TRAVADOS_DEPOIS_DE_TERMINAR)
        }
        if (entrada.horario === null) throw new ErroApp('VALIDACAO', CONFIRA, { horario: 'Informe o horário.' })
        if (entrada.nome === '') throw new ErroApp('VALIDACAO', CONFIRA, { nome: 'Informe o nome.' })
      }
      const inicio = entrada.inicio !== undefined ? entrada.inicio : atual.inicio && paraDataCivil(atual.inicio)
      const fim = entrada.fim !== undefined ? entrada.fim : atual.fim && paraDataCivil(atual.fim)
      exigirPeriodo(inicio, fim)

      const gravada = await tx.edicaoClasseBiblica.update({
        where: { clubeId_id: { clubeId, id } },
        data: {
          ...(entrada.nome !== undefined ? { nome: entrada.nome || null } : {}),
          ...(entrada.inicio !== undefined ? { inicio: entrada.inicio ? daDataCivil(entrada.inicio) : null } : {}),
          ...(entrada.fim !== undefined ? { fim: entrada.fim ? daDataCivil(entrada.fim) : null } : {}),
          ...(entrada.diaSemana !== undefined ? { diaSemana: entrada.diaSemana } : {}),
          ...(entrada.horario !== undefined ? { horario: entrada.horario } : {}),
          ...(entrada.local !== undefined ? { local: entrada.local } : {}),
          ...(entrada.etapa !== undefined ? { etapa: entrada.etapa } : {}),
        },
      })
      if (terminada) await propagarAosEncontros(tx, clubeId, atual, gravada, hoje)
      return gravada
    }, { timeout: TEMPO_DA_TRANSACAO_MS })
    return saidaDaEdicao(editada, hoje)
  }

  async grupos(sessao: SessaoLogada, id: string): Promise<z.infer<typeof GruposSaida>> {
    const { clubeId } = sessao
    const edicao = await exigirEdicao(this.prisma, clubeId, id)
    const [grupos, unidades, emOutraEdicao] = await Promise.all([
      this.gruposDaEdicao(clubeId, id),
      this.prisma.unidade.findMany({
        where: { clubeId, ativa: true },
        select: {
          id: true,
          nome: true,
          _count: { select: { membros: { where: { clubeId, fim: null, dbv: { clubeId, ativo: true, tipo: 'DBV' } } } } },
        },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      }),
      edicao.inicio && edicao.fim ? unidadesEmEdicaoTerminada(this.prisma, clubeId, id, edicao.inicio, edicao.fim) : new Map<string, OcupacaoPorEdicao>(),
    ])
    const grupoDaUnidade = new Map(grupos.flatMap((grupo) => grupo.unidadeIds.map((unidadeId) => [unidadeId, grupo.nome] as const)))
    return {
      grupos,
      unidades: unidades.map((unidade) => {
        const outra = emOutraEdicao.get(unidade.id)
        const grupo = grupoDaUnidade.get(unidade.id)
        const ocupadaPor = outra
          ? { tipo: 'EDICAO' as const, nome: outra.nome, inicio: outra.inicio, fim: outra.fim }
          : grupo !== undefined
            ? { tipo: 'GRUPO' as const, nome: grupo }
            : null
        return { id: unidade.id, nome: unidade.nome, dbvs: unidade._count.membros, ocupadaPor }
      }),
      atualizadaEm: edicao.atualizadaEm.toISOString(),
    }
  }

  /** Grava os grupos como vieram (regras 3 e 14): o que sumiu sai, se não tiver chamada. */
  async salvarGrupos(sessao: SessaoLogada, id: string, entrada: z.infer<typeof GruposEntrada>): Promise<z.infer<typeof GruposSaida>> {
    const { clubeId } = sessao
    await this.prisma.$transaction(
      async (tx) => {
        await travarClube(tx, clubeId)
        const edicao = await exigirEdicao(tx, clubeId, id)
        const unidadeIds = [...new Set(entrada.grupos.flatMap((grupo) => grupo.unidadeIds))]
        const unidades = await tx.unidade.findMany({ where: { clubeId, id: { in: unidadeIds }, ativa: true }, select: { id: true, nome: true } })
        if (unidades.length !== unidadeIds.length) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
        const nomeDa = new Map(unidades.map((unidade) => [unidade.id, unidade.nome]))

        const vistas = new Set<string>()
        for (const grupo of entrada.grupos) {
          for (const unidadeId of new Set(grupo.unidadeIds)) {
            if (vistas.has(unidadeId)) throw new ErroApp('VALIDACAO', `A unidade ${nomeDa.get(unidadeId) ?? ''} está em dois grupos.`)
            vistas.add(unidadeId)
          }
        }
        if (edicao.terminadaEm && entrada.grupos.some((grupo) => grupo.nome === '')) {
          throw new ErroApp('VALIDACAO', CONFIRA, { grupos: 'Dê um nome a cada grupo.' })
        }
        if (edicao.terminadaEm && entrada.grupos.some((grupo) => grupo.unidadeIds.length === 0)) {
          throw new ErroApp('VALIDACAO', CONFIRA, { grupos: 'Cada grupo precisa de ao menos uma unidade.' })
        }

        const existentes = await tx.grupoClasseBiblica.findMany({
          where: { clubeId, edicaoId: id, removidoEm: null },
          select: { id: true, nome: true, _count: { select: { chamadas: { where: { clubeId } } } } },
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        })
        const idsExistentes = new Set(existentes.map((grupo) => grupo.id))
        if (entrada.grupos.some((grupo) => grupo.id !== undefined && !idsExistentes.has(grupo.id))) {
          throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
        }
        const mantidos = new Set(entrada.grupos.flatMap((grupo) => (grupo.id ? [grupo.id] : [])))
        const saindo = existentes.filter((grupo) => !mantidos.has(grupo.id))
        const comChamada = saindo.find((grupo) => grupo._count.chamadas > 0)
        if (comChamada) throw new ErroApp('REGRA', `O grupo ${comChamada.nome} já tem chamada feita e não pode sair da edição.`)

        if (edicao.inicio && edicao.fim) {
          const ocupadas = await unidadesEmEdicaoTerminada(tx, clubeId, id, edicao.inicio, edicao.fim)
          const emConflito = [...vistas].find((unidadeId) => ocupadas.has(unidadeId))
          const outra = emConflito && ocupadas.get(emConflito)
          if (emConflito && outra) throw new ErroApp('REGRA', mensagemDeConflito(nomeDa.get(emConflito) ?? '', outra))
        }

        await tx.grupoUnidadeClasseBiblica.deleteMany({ where: { clubeId, edicaoId: id } })
        if (saindo.length > 0) {
          await tx.grupoClasseBiblica.updateMany({
            where: { clubeId, id: { in: saindo.map((grupo) => grupo.id) } },
            data: { removidoEm: new Date() },
          })
        }
        const ligacoes: Prisma.GrupoUnidadeClasseBiblicaCreateManyInput[] = []
        for (const [ordem, grupo] of entrada.grupos.entries()) {
          const grupoId = grupo.id
            ? (await tx.grupoClasseBiblica.update({ where: { clubeId_id: { clubeId, id: grupo.id } }, data: { nome: grupo.nome, ordem }, select: { id: true } })).id
            : (await tx.grupoClasseBiblica.create({ data: { clubeId, edicaoId: id, nome: grupo.nome, ordem }, select: { id: true } })).id
          for (const unidadeId of new Set(grupo.unidadeIds)) ligacoes.push({ clubeId, edicaoId: id, grupoId, unidadeId })
        }
        if (ligacoes.length > 0) await tx.grupoUnidadeClasseBiblica.createMany({ data: ligacoes })
        await tx.edicaoClasseBiblica.update({ where: { clubeId_id: { clubeId, id } }, data: { atualizadaEm: new Date() } })
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
    return this.grupos(sessao, id)
  }

  /** Datas da etapa 3: Férias, Feriado e Sem reunião vêm desmarcadas, com o motivo (regra 4). */
  async datas(sessao: SessaoLogada, id: string): Promise<z.infer<typeof DatasSaida>> {
    const edicao = await exigirEdicao(this.prisma, sessao.clubeId, id)
    return { datas: await datasDaEdicao(this.prisma, sessao.clubeId, edicao) }
  }

  /** Regra 5: trava por clube, reconfere a regra 3, cria encontros e eventos; idempotente por `terminadaEm`. */
  async terminar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof TerminarEntrada>): Promise<void> {
    const { clubeId } = sessao
    await this.prisma.$transaction(
      async (tx) => {
        await travarClube(tx, clubeId)
        const edicao = await exigirEdicao(tx, clubeId, id)
        if (edicao.terminadaEm) return
        const { nome, inicio, fim, horario } = edicao
        const faltando: Record<string, string> = {}
        if (!nome) faltando['nome'] = 'Informe o nome.'
        if (!inicio) faltando['inicio'] = 'Informe o início.'
        if (!fim) faltando['fim'] = 'Informe o fim.'
        if (!horario) faltando['horario'] = 'Informe o horário.'
        if (!nome || !inicio || !fim || !horario) throw new ErroApp('VALIDACAO', CONFIRA, faltando)
        exigirPeriodo(paraDataCivil(inicio), paraDataCivil(fim))

        const grupos = await tx.grupoClasseBiblica.findMany({
          where: { clubeId, edicaoId: id, removidoEm: null },
          select: { nome: true, unidades: { where: { clubeId }, select: { unidadeId: true, unidade: { select: { nome: true } } } } },
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        })
        if (grupos.length === 0) throw new ErroApp('REGRA', 'Crie ao menos um grupo antes de terminar.')
        if (grupos.some((grupo) => !grupo.nome || grupo.unidades.length === 0)) {
          throw new ErroApp('REGRA', 'Cada grupo precisa de um nome e de ao menos uma unidade.')
        }

        const possiveis = new Set(datasDoDia(paraDataCivil(inicio), paraDataCivil(fim), edicao.diaSemana))
        const marcadas = [...new Set(entrada.datas)].sort()
        if (marcadas.some((data) => !possiveis.has(data))) {
          throw new ErroApp('VALIDACAO', CONFIRA, { datas: 'Escolha só datas da lista da edição.' })
        }

        const ocupadas = await unidadesEmEdicaoTerminada(tx, clubeId, id, inicio, fim)
        for (const { unidadeId, unidade } of grupos.flatMap((grupo) => grupo.unidades)) {
          const outra = ocupadas.get(unidadeId)
          if (outra) throw new ErroApp('REGRA', mensagemDeConflito(unidade.nome, outra))
        }

        const encontros = marcadas.map((data) => ({ data: daDataCivil(data), eventoId: gerarUuidV7() }))
        await tx.eventoCalendario.createMany({
          data: encontros.map(({ data, eventoId }) => ({
            id: eventoId,
            clubeId,
            nome,
            tipo: 'CLASSE_BIBLICA' as const,
            inicio: data,
            fim: data,
            horario,
            local: edicao.local,
            ...MARCACOES_PADRAO.CLASSE_BIBLICA,
            criadoPorId: sessao.usuarioId,
          })),
        })
        await tx.encontroClasseBiblica.createMany({
          data: encontros.map(({ data, eventoId }) => ({ clubeId, edicaoId: id, data, horario, local: edicao.local, eventoId })),
        })
        await tx.edicaoClasseBiblica.update({ where: { clubeId_id: { clubeId, id } }, data: { terminadaEm: new Date(), etapa: 3 } })
        await garantirCriterios(tx, clubeId)
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }

  async anexarLink(sessao: SessaoLogada, grupoId: string, entrada: z.infer<typeof MaterialCBLinkEntrada>): Promise<Grupo> {
    const { clubeId } = sessao
    await this.exigirGrupo(clubeId, grupoId)
    await this.prisma.grupoClasseBiblica.updateMany({
      where: { clubeId, id: grupoId, removidoEm: null },
      data: { materialTitulo: entrada.titulo, materialUrl: entrada.url, materialArquivoId: null },
    })
    return this.grupoCB(clubeId, grupoId)
  }

  /** PDF de até 20 MB; troca o do grupo e o `Arquivo` antigo fica (regra 15). O temporário do multer some em qualquer desfecho. */
  async anexarArquivo(sessao: SessaoLogada, grupoId: string, corpo: unknown, arquivo: ArquivoEmDisco | undefined): Promise<Grupo> {
    if (!arquivo) throw new ErroApp('VALIDACAO', CONFIRA, { arquivo: 'Envie o arquivo.' })
    try {
      return await this.gravarArquivo(sessao, grupoId, corpo, arquivo)
    } finally {
      await rm(arquivo.path, { force: true })
    }
  }

  private async gravarArquivo(sessao: SessaoLogada, grupoId: string, corpo: unknown, arquivo: ArquivoEmDisco): Promise<Grupo> {
    const { clubeId } = sessao
    const dados = lerDadosDoArquivo(corpo)
    await this.exigirGrupo(clubeId, grupoId)
    const ext = extname(arquivo.originalname).slice(1).toLowerCase()
    if (ext !== 'pdf' || !(await conteudoConfereComExtensao(arquivo.path, 'pdf'))) throw new ErroApp('REGRA', 'Envie um arquivo PDF válido.')

    const arquivoId = gerarUuidV7()
    const destino = caminhoDoMaterial(clubeId, arquivoId, ext)
    try {
      await this.armazenamento.gravarDeArquivo(destino, arquivo.path)
      await this.prisma.$transaction(async (tx) => {
        await tx.arquivo.create({
          data: { id: arquivoId, clubeId, caminho: destino, mime: 'application/pdf', bytes: arquivo.size, criadoPorId: sessao.usuarioId },
          select: { id: true },
        })
        const { count } = await tx.grupoClasseBiblica.updateMany({
          where: { clubeId, id: grupoId, removidoEm: null },
          data: { materialTitulo: dados.titulo, materialArquivoId: arquivoId, materialUrl: null },
        })
        if (count === 0) throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
      })
    } catch (erro) {
      await this.apagarDoDisco(destino)
      throw erro
    }
    return this.grupoCB(clubeId, grupoId)
  }

  private async apagarDoDisco(caminho: string): Promise<void> {
    try {
      await this.armazenamento.remover(caminho)
    } catch (erro) {
      this.logger.error(`Nao foi possivel apagar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  private async exigirGrupo(clubeId: string, grupoId: string): Promise<void> {
    const grupo = await this.prisma.grupoClasseBiblica.findFirst({ where: { clubeId, id: grupoId, removidoEm: null }, select: { id: true } })
    if (!grupo) throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
  }

  private async grupoCB(clubeId: string, grupoId: string): Promise<Grupo> {
    const [grupo] = await this.gruposDaEdicao(clubeId, null, grupoId)
    if (!grupo) throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
    return grupo
  }

  private async gruposDaEdicao(clubeId: string, edicaoId: string | null, grupoId?: string): Promise<Grupo[]> {
    const grupos = await this.prisma.grupoClasseBiblica.findMany({
      where: { clubeId, removidoEm: null, ...(edicaoId ? { edicaoId } : {}), ...(grupoId ? { id: grupoId } : {}) },
      select: {
        ...SELECAO_GRUPO,
        unidades: { where: { clubeId }, select: { unidadeId: true, unidade: { select: { nome: true } } } },
        _count: { select: { chamadas: { where: { clubeId } } } },
      },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    })
    return grupos.map((grupo) => ({
      id: grupo.id,
      nome: grupo.nome,
      ordem: grupo.ordem,
      unidadeIds: [...grupo.unidades].sort((a, b) => a.unidade.nome.localeCompare(b.unidade.nome, 'pt-BR')).map((ligacao) => ligacao.unidadeId),
      material: materialDoGrupo(this.arquivos, clubeId, grupo),
      temChamada: grupo._count.chamadas > 0,
    }))
  }
}

async function exigirEdicao(db: Banco, clubeId: string, id: string): Promise<EdicaoClasseBiblica> {
  const edicao = await db.edicaoClasseBiblica.findFirst({ where: { clubeId, id } })
  if (!edicao) throw new ErroApp('NAO_ENCONTRADO', EDICAO_NAO_ENCONTRADA)
  return edicao
}

function exigirPeriodo(inicio: string | null, fim: string | null): void {
  if (inicio && fim && fim <= inicio) {
    const [ano, mes, dia] = inicio.split('-')
    throw new ErroApp('VALIDACAO', CONFIRA, { fim: `O fim precisa ser depois do início (${dia}/${mes}/${ano})` })
  }
}

async function datasDaEdicao(db: Banco, clubeId: string, edicao: EdicaoClasseBiblica): Promise<z.infer<typeof DatasSaida>['datas']> {
  if (!edicao.inicio || !edicao.fim) throw new ErroApp('REGRA', 'Preencha o início e o fim da edição antes de escolher as datas.')
  const eventos = await db.eventoCalendario.findMany({
    where: { clubeId, removidoEm: null, tipo: { in: TIPOS_QUE_IMPEDEM }, inicio: { lte: edicao.fim }, fim: { gte: edicao.inicio } },
    select: { nome: true, tipo: true, inicio: true, fim: true },
    orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
  })
  return datasDoDia(paraDataCivil(edicao.inicio), paraDataCivil(edicao.fim), edicao.diaSemana).map((data) => {
    const evento = eventos.find((e) => paraDataCivil(e.inicio) <= data && data <= paraDataCivil(e.fim))
    return evento
      ? { data, marcada: false, motivo: `${ROTULO_DO_IMPEDIMENTO[evento.tipo] ?? ''}: ${evento.nome}` }
      : { data, marcada: true, motivo: null }
  })
}

/** Regra 14: horário e local mudam os encontros de hoje em diante sem chamada; o nome vai a todos os eventos da edição. */
async function propagarAosEncontros(
  tx: Prisma.TransactionClient,
  clubeId: string,
  antes: EdicaoClasseBiblica,
  depois: EdicaoClasseBiblica,
  hoje: string,
): Promise<void> {
  const encontros = await tx.encontroClasseBiblica.findMany({ where: { clubeId, edicaoId: depois.id }, select: { eventoId: true } })
  const todosOsEventos = encontros.map((encontro) => encontro.eventoId)
  if (depois.nome && depois.nome !== antes.nome) {
    await tx.eventoCalendario.updateMany({ where: { clubeId, id: { in: todosOsEventos } }, data: { nome: depois.nome } })
  }
  if (depois.horario === antes.horario && depois.local === antes.local) return
  const futuros = await tx.encontroClasseBiblica.findMany({
    where: { clubeId, edicaoId: depois.id, data: { gte: daDataCivil(hoje) }, chamadas: { none: { clubeId } } },
    select: { id: true, eventoId: true },
  })
  if (futuros.length === 0) return
  const mudanca = { ...(depois.horario ? { horario: depois.horario } : {}), local: depois.local }
  await tx.encontroClasseBiblica.updateMany({ where: { clubeId, id: { in: futuros.map((e) => e.id) } }, data: mudanca })
  await tx.eventoCalendario.updateMany({ where: { clubeId, id: { in: futuros.map((e) => e.eventoId) } }, data: mudanca })
}
