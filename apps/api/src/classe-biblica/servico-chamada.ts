import { Injectable } from '@nestjs/common'
import type { ChamadaCBEnvio, ChamadaCBEnvioSaida, ChamadaCBSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paraDataCivil } from '../desbravadores/apoio'
import { Prisma } from '../generated/prisma/client.js'
import type { EncontroClasseBiblica } from '../generated/prisma/client.js'
import { ServicoPontos, type PontoDevido } from '../pontos/servico-pontos'
import { diaEMes } from '../progresso/conclusoes'
import { linhaDoEncontro, membrosDaChamada, SELECAO_LINHA, SELECAO_VINCULO, vinculo, type MembroDaChamada } from './composicao'
import { garantirCriterios } from './criterios'
import { ServicoEscopoGrupos, type AcessoAoPainel } from './escopo-grupos'
import { ENCONTRO_NAO_ENCONTRADO, hojeDoClube } from './servico-encontros'

type Chamada = z.infer<typeof ChamadaCBSaida>
type Envio = z.infer<typeof ChamadaCBEnvio>
type Saida = z.infer<typeof ChamadaCBEnvioSaida>
type Tx = Prisma.TransactionClient
type Banco = Tx | PrismaService
type Nomeado = { dbvId: string; nome: string }

const TEMPO_DA_TRANSACAO_MS = 20_000
const CODIGOS_DE_CORRIDA = ['P2002', 'P2034']

function ehCorrida(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && CODIGOS_DE_CORRIDA.includes(erro.code)
}

function porNome<T extends { nome: string }>(a: T, b: T): number {
  return colador.compare(a.nome, b.nome)
}

function recusaDeCancelado(encontro: EncontroClasseBiblica): ErroApp {
  return new ErroApp('REGRA', `O encontro de ${diaEMes(paraDataCivil(encontro.data))} foi cancelado; a chamada não foi registrada.`)
}

/** Lista da chamada e envio da fila (regras 8–12). Não existe desfazer chamada (regra 10): corrige-se marcando as faltas. */
@Injectable()
export class ServicoChamada {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopoGrupos: ServicoEscopoGrupos,
    private readonly pontos: ServicoPontos,
  ) {}

  async lista(sessao: SessaoLogada, encontroId: string, grupoId: string): Promise<Chamada> {
    const { clubeId } = sessao
    const { grupo, acesso } = await this.escopoGrupos.exigirGrupo(sessao, grupoId)
    const encontro = await encontroDoGrupo(this.prisma, clubeId, encontroId, grupo.edicaoId)
    exigirAberto(encontro, await hojeDoClube(this.prisma, clubeId))
    const edicao = await this.prisma.edicaoClasseBiblica.findFirstOrThrow({
      where: { clubeId, id: grupo.edicaoId },
      select: { nome: true, inicio: true },
    })
    const membros = await membrosDoEscopo(sessao, grupo, encontro, acesso, await membrosNaData(this.prisma, clubeId, grupo.id, encontro))
    const [presencas, chamada] = await Promise.all([
      this.prisma.presencaClasseBiblica.findMany({
        where: { clubeId, encontroId: encontro.id, dbvId: { in: membros.map((m) => m.dbvId) } },
        select: { dbvId: true, presente: true, participou: true, versao: true },
      }),
      this.prisma.chamadaClasseBiblica.findFirst({ where: { clubeId, encontroId: encontro.id, grupoId: grupo.id }, select: { grupoId: true } }),
    ])
    const gravadas = new Map(presencas.map((linha) => [linha.dbvId, linha]))
    const unidades = new Map<string, Chamada['unidades'][number]>()
    for (const membro of membros) {
      const unidade = unidades.get(membro.unidadeId) ?? { id: membro.unidadeId, nome: membro.unidadeNome, desbravadores: [] }
      unidades.set(membro.unidadeId, unidade)
      const gravada = gravadas.get(membro.dbvId)
      unidade.desbravadores.push({
        dbvId: membro.dbvId,
        nome: membro.nome,
        entrouEm: edicao.inicio && membro.inicio && membro.inicio > edicao.inicio ? paraDataCivil(membro.inicio) : null,
        presente: gravada?.presente ?? true,
        participou: gravada?.participou ?? false,
        versao: gravada ? gravada.versao.toISOString() : null,
      })
    }
    return {
      encontro: {
        id: encontro.id,
        edicaoId: encontro.edicaoId,
        edicaoNome: edicao.nome ?? '',
        data: paraDataCivil(encontro.data),
        horario: encontro.horario,
        local: encontro.local,
        dataOriginal: encontro.dataOriginal ? paraDataCivil(encontro.dataOriginal) : null,
      },
      grupo: { id: grupo.id, nome: grupo.nome },
      unidades: [...unidades.values()].sort(porNome).map((unidade) => ({ ...unidade, desbravadores: unidade.desbravadores.sort(porNome) })),
      registrada: chamada !== null,
    }
  }

  /** `PUT /sync/classe-biblica/encontros/:id/grupos/:grupoId`. Corrida de banco vira 503 para a fila repetir. */
  async enviar(sessao: SessaoLogada, encontroId: string, grupoId: string, envio: Envio, agora: Date = new Date()): Promise<Saida> {
    const { grupo, acesso } = await this.escopoGrupos.exigirGrupo(sessao, grupoId)
    try {
      return await this.prisma.$transaction((tx) => this.aplicar(tx, sessao, encontroId, grupo, acesso, envio, agora), {
        timeout: TEMPO_DA_TRANSACAO_MS,
      })
    } catch (erro) {
      if (ehCorrida(erro)) throw new ErroApp('TEMPORARIO', 'Não foi possível salvar agora. Tentaremos de novo.')
      throw erro
    }
  }

  private async aplicar(
    tx: Tx,
    sessao: SessaoLogada,
    encontroId: string,
    grupo: { id: string; nome: string; edicaoId: string },
    acesso: AcessoAoPainel,
    envio: Envio,
    agora: Date,
  ): Promise<Saida> {
    const { clubeId } = sessao
    const jaProcessado = await envioProcessado(tx, clubeId, envio.envioId)
    if (jaProcessado) return montarSaida(tx, clubeId, jaProcessado.encontroId, jaProcessado.grupoId, acesso, [], [])

    // Serializa com outro envio, com remarcar e com cancelar do mesmo encontro; quem esperou relê tudo.
    await tx.$queryRaw`SELECT id FROM "EncontroClasseBiblica" WHERE id = ${encontroId}::uuid AND "clubeId" = ${clubeId}::uuid FOR UPDATE`
    const processadoNaEspera = await envioProcessado(tx, clubeId, envio.envioId)
    if (processadoNaEspera) return montarSaida(tx, clubeId, processadoNaEspera.encontroId, processadoNaEspera.grupoId, acesso, [], [])

    const encontro = await encontroDoGrupo(tx, clubeId, encontroId, grupo.edicaoId)
    exigirAberto(encontro, await hojeDoClube(tx, clubeId, agora))

    // Quem já tem linha em outro grupo neste encontro não está na lista e volta em ignorados: a linha não muda de grupo.
    const membros = await membrosDoEscopo(sessao, grupo, encontro, acesso, await membrosNaData(tx, clubeId, grupo.id, encontro))
    const daLista = new Map(membros.map((membro) => [membro.dbvId, membro]))
    const foraIds = envio.linhas.map((linha) => linha.dbvId).filter((dbvId) => !daLista.has(dbvId))
    const conhecidos = await tx.desbravador.findMany({ where: { clubeId, id: { in: foraIds } }, select: { id: true, nome: true } })
    const nomesDeFora = new Map(conhecidos.map((dbv) => [dbv.id, dbv.nome]))
    const ignorados = foraIds.map((dbvId) => ({ dbvId, nome: nomesDeFora.get(dbvId) ?? 'Desbravador não encontrado' }))

    const antes = new Map(
      (await tx.presencaClasseBiblica.findMany({ where: { clubeId, encontroId: encontro.id, dbvId: { in: [...daLista.keys()] } } })).map((linha) => [
        linha.dbvId,
        linha,
      ]),
    )
    const versao = new Date(agora.getTime())
    const conflitos: Nomeado[] = []
    const gravadas: { dbvId: string; presente: boolean; participou: boolean }[] = []
    for (const linha of envio.linhas) {
      const membro = daLista.get(linha.dbvId)
      if (!membro) continue
      const presente = linha.presente
      const participou = presente && linha.participou
      const gravada = antes.get(linha.dbvId)
      if (gravada?.presente === presente && gravada.participou === participou) continue
      if (gravada && (linha.versaoVista === null || Date.parse(linha.versaoVista) !== gravada.versao.getTime())) {
        conflitos.push({ dbvId: membro.dbvId, nome: membro.nome })
      }
      const marcas = { presente, participou, versao, alteradaPorId: sessao.usuarioId, envioId: envio.envioId }
      await tx.presencaClasseBiblica.upsert({
        where: { encontroId_dbvId: { encontroId: encontro.id, dbvId: membro.dbvId }, clubeId },
        create: { clubeId, encontroId: encontro.id, dbvId: membro.dbvId, grupoId: grupo.id, unidadeId: membro.unidadeId, ...marcas },
        update: marcas,
      })
      gravadas.push({ dbvId: membro.dbvId, presente, participou })
    }

    await tx.chamadaClasseBiblica.upsert({
      where: { encontroId_grupoId: { encontroId: encontro.id, grupoId: grupo.id }, clubeId },
      create: { clubeId, encontroId: encontro.id, grupoId: grupo.id, registradaPorId: sessao.usuarioId },
      update: {},
    })
    await this.sincronizarPontos(tx, sessao, encontro, gravadas)
    await tx.envioClasseBiblicaProcessado.create({ data: { envioId: envio.envioId, clubeId, encontroId: encontro.id, grupoId: grupo.id } })
    return montarSaida(tx, clubeId, encontro.id, grupo.id, acesso, conflitos, ignorados)
  }

  /** Regra 11: presença e participação pelos critérios padrão ativos; falta não desconta e corrigir estorna. */
  private async sincronizarPontos(
    tx: Tx,
    sessao: SessaoLogada,
    encontro: EncontroClasseBiblica,
    gravadas: { dbvId: string; presente: boolean; participou: boolean }[],
  ): Promise<void> {
    if (gravadas.length === 0) return
    const { clubeId } = sessao
    await garantirCriterios(tx, clubeId)
    const criterios = await tx.criterioRanking.findMany({
      where: { clubeId, padrao: true, ativo: true, gatilho: { in: ['CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO'] } },
      select: { id: true, gatilho: true, pontos: true },
    })
    const presenca = criterios.find((criterio) => criterio.gatilho === 'CLASSE_BIBLICA_PRESENCA')
    const participacao = criterios.find((criterio) => criterio.gatilho === 'CLASSE_BIBLICA_PARTICIPACAO')
    for (const linha of gravadas) {
      const devidos: PontoDevido[] = []
      if (linha.presente && presenca) devidos.push({ criterioId: presenca.id, pontos: presenca.pontos })
      if (linha.participou && participacao) devidos.push({ criterioId: participacao.id, pontos: participacao.pontos })
      await this.pontos.sincronizar(tx, {
        clubeId,
        dbvId: linha.dbvId,
        origemTipo: 'CLASSE_BIBLICA',
        origemId: `${encontro.id}:${linha.dbvId}`,
        data: paraDataCivil(encontro.data),
        devidos,
        lancadoPorId: sessao.usuarioId,
      })
    }
  }
}

/** Recusas contra o estado do servidor (regras 8 e 12): o remarcado vale pelo encontro quando a data nova chega. */
function exigirAberto(encontro: EncontroClasseBiblica, hoje: string): void {
  if (encontro.canceladoEm) throw recusaDeCancelado(encontro)
  const data = paraDataCivil(encontro.data)
  if (data <= hoje) return
  if (encontro.dataOriginal) {
    throw new ErroApp(
      'REGRA',
      `O encontro de ${diaEMes(paraDataCivil(encontro.dataOriginal))} foi remarcado para ${diaEMes(data)}; a chamada só pode ser feita a partir desse dia.`,
    )
  }
  throw new ErroApp('REGRA', `A chamada do encontro de ${diaEMes(data)} só pode ser feita a partir desse dia.`)
}

async function encontroDoGrupo(db: Banco, clubeId: string, encontroId: string, edicaoId: string): Promise<EncontroClasseBiblica> {
  const encontro = await db.encontroClasseBiblica.findFirst({ where: { clubeId, id: encontroId, edicaoId } })
  if (!encontro) throw new ErroApp('NAO_ENCONTRADO', ENCONTRO_NAO_ENCONTRADO)
  return encontro
}

async function envioProcessado(tx: Tx, clubeId: string, envioId: string): Promise<{ encontroId: string; grupoId: string } | null> {
  return tx.envioClasseBiblicaProcessado.findFirst({ where: { clubeId, envioId }, select: { encontroId: true, grupoId: true } })
}

/**
 * A lista do grupo cortada pelo escopo (regra 9, D33). Quem só tem a chamada e não tem ninguém do escopo num grupo
 * que tem gente na data é recusado: registrar uma lista vazia daria o encontro por feito para o grupo inteiro.
 */
async function membrosDoEscopo(
  sessao: SessaoLogada,
  grupo: { nome: string },
  encontro: { data: Date },
  acesso: AcessoAoPainel,
  todos: MembroDaChamada[],
): Promise<MembroDaChamada[]> {
  if (!acesso.corte) return todos
  const doEscopo = await acesso.corte.itens(todos)
  if (doEscopo.length === 0 && todos.length > 0) {
    const de = sessao.papel === 'INSTRUTOR' ? 'das suas classes' : 'das suas unidades'
    throw new ErroApp('REGRA', `Nenhum desbravador ${de} estava no ${grupo.nome} em ${diaEMes(paraDataCivil(encontro.data))}.`)
  }
  return doEscopo
}

/** A lista do grupo na composição da data do encontro (regras 8 e 14, ver `membrosDaChamada`). */
async function membrosNaData(db: Banco, clubeId: string, grupoId: string, encontro: { id: string; data: Date }): Promise<MembroDaChamada[]> {
  const { data } = encontro
  const [ligacoes, linhas] = await Promise.all([
    db.grupoUnidadeClasseBiblica.findMany({
      where: { clubeId, grupoId, inicio: { lte: data }, OR: [{ fim: null }, { fim: { gt: data } }] },
      select: { unidadeId: true },
    }),
    db.presencaClasseBiblica.findMany({ where: { clubeId, encontroId: encontro.id }, select: SELECAO_LINHA }),
  ])
  const unidadeIds = ligacoes.map((ligacao) => ligacao.unidadeId)
  const gravadosDoGrupo = linhas.filter((linha) => linha.grupoId === grupoId).map((linha) => linha.dbvId)
  const vinculos = await db.membroUnidade.findMany({
    where: {
      clubeId,
      inicio: { lte: data },
      AND: [{ OR: [{ unidadeId: { in: unidadeIds } }, { dbvId: { in: gravadosDoGrupo } }] }, { OR: [{ fim: null }, { fim: { gt: data } }] }],
      dbv: { clubeId, ativo: true },
    },
    select: SELECAO_VINCULO,
  })
  return membrosDaChamada(grupoId, new Set(unidadeIds), data, linhas.map(linhaDoEncontro), vinculos.map(vinculo))
}

async function montarSaida(
  tx: Tx,
  clubeId: string,
  encontroId: string,
  grupoId: string,
  acesso: AcessoAoPainel,
  conflitos: Nomeado[],
  ignorados: Nomeado[],
): Promise<Saida> {
  const linhas = await tx.presencaClasseBiblica.findMany({
    where: { clubeId, encontroId, grupoId },
    select: { dbvId: true, unidadeId: true, presente: true, participou: true, versao: true },
    orderBy: { dbvId: 'asc' },
  })
  const doEscopo = acesso.corte ? await acesso.corte.itens(linhas) : linhas
  return {
    linhas: doEscopo.map((linha) => ({ dbvId: linha.dbvId, presente: linha.presente, participou: linha.participou, versao: linha.versao.toISOString() })),
    conflitos,
    ignorados,
    presentes: doEscopo.filter((linha) => linha.presente).length,
    participaram: doEscopo.filter((linha) => linha.participou).length,
  }
}
