import { Injectable } from '@nestjs/common'
import { anoClube, hojeNoFuso, type AulaEnvio, type AulaEnvioSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoAtividade } from '../atividades/servico-atividade'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { Prisma } from '../generated/prisma/client.js'
import type { ConfiguracaoClube, RegistroAula, TipoPessoa } from '../generated/prisma/client.js'
import { ServicoPontos } from '../pontos/servico-pontos'
import { ehFichaDaSessao } from '../progresso/conclusoes'
import {
  DIAS_DE_CORRECAO,
  DIAS_DE_ENVIO_TARDIO,
  MS_POR_DIA,
  dentroDoPrazoDeCorrecao,
  diasEntre,
} from '../reunioes/apoio'
import { exigirClasseNoEscopo } from './apoio'

type Envio = z.infer<typeof AulaEnvio>
type Saida = z.infer<typeof AulaEnvioSaida>
type Marca = Envio['requisitosMarcados'][number]
type SemEfeito = Saida['requisitosSemEfeito'][number]
type Tx = Prisma.TransactionClient
type Membros = Map<string, { nome: string; tipo: TipoPessoa; usuarioId: string | null }>

interface Contexto {
  sessao: SessaoLogada
  registro: RegistroAula
  envio: Envio
  membros: Membros
  agora: Date
}

const TEMPO_DA_TRANSACAO_MS = 20_000
const CODIGOS_DE_CORRIDA = ['P2002', 'P2034']
const AVISO_FORA_DO_PUBLICADO = 'Esta aula foi registrada fora do cronograma publicado.'

function ehCorrida(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && CODIGOS_DE_CORRIDA.includes(erro.code)
}

function regra(mensagem: string): ErroApp {
  return new ErroApp('REGRA', mensagem)
}

/** Instante com precisao de milissegundo, que e o que a coluna `versao` guarda. */
function emMilissegundos(instante: Date): Date {
  return new Date(instante.getTime())
}

function chaveDoPar(marca: Marca): string {
  return `${marca.dbvId}:${marca.requisitoId}`
}

/** Um par so conta uma vez, na primeira aparicao. */
function semRepetidos(marcas: Marca[]): Marca[] {
  return [...new Map(marcas.map((marca) => [chaveDoPar(marca), marca])).values()]
}

@Injectable()
export class AulasEnvioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly pontos: ServicoPontos,
    private readonly atividades: ServicoAtividade,
    private readonly cronogramas: ServicoCronograma,
  ) {}

  /** `PUT /sync/aulas/:uuid` (SPEC Fase 2, 4.1). Corrida de banco vira 503 para a fila repetir. */
  async enviar(sessao: SessaoLogada, uuid: string, envio: Envio, agora: Date = new Date()): Promise<Saida> {
    const classe = await exigirClasseNoEscopo(this.prisma, this.escopo, sessao, envio.classeId)
    const feito = new Date(Math.min(Date.parse(envio.feitaNoAparelhoEm), agora.getTime()))
    try {
      return await this.prisma.$transaction((tx) => this.aplicar(tx, sessao, classe, uuid, envio, feito, emMilissegundos(agora)), {
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
    classe: { id: string; nome: string },
    uuid: string,
    envio: Envio,
    feito: Date,
    agora: Date,
  ): Promise<Saida> {
    const { clubeId } = sessao
    const jaProcessado = await this.envioProcessado(tx, clubeId, envio.envioId)
    if (jaProcessado) return this.estadoAtual(tx, clubeId, jaProcessado)

    const configuracao = await tx.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const localizado = await this.localizarOuCriar(tx, sessao, uuid, envio, feito, agora, configuracao)

    // Serializa dois envios da mesma aula; o que esperou relê tudo depois do bloqueio.
    await tx.$queryRaw`SELECT id FROM "RegistroAula" WHERE id = ${localizado.registro.id}::uuid FOR UPDATE`
    const processadoNaEspera = await this.envioProcessado(tx, clubeId, envio.envioId)
    if (processadoNaEspera) return this.estadoAtual(tx, clubeId, processadoNaEspera)
    const registro = await tx.registroAula.findFirstOrThrow({ where: { clubeId, id: localizado.registro.id } })

    if (!localizado.criada) this.exigirNoPrazo(sessao, registro, feito, agora, configuracao.fuso)

    const membros = await this.membrosDaAula(tx, clubeId, classe.id, envio.data, configuracao.inicioAnoClube)
    const contexto: Contexto = { sessao, registro, envio, membros, agora }
    const presencas = await this.aplicarPresencas(tx, contexto)
    const planejada = await this.aulaPlanejadaValida(tx, contexto)
    const requisitos = await this.aplicarRequisitos(tx, contexto)

    const gravouAlgo = presencas.gravadas > 0 || requisitos.gravou
    const ligarPlanejada = planejada.id !== null && planejada.id !== registro.aulaPlanejadaId
    if (localizado.criada ? ligarPlanejada : gravouAlgo || ligarPlanejada) {
      await tx.registroAula.updateMany({
        where: { clubeId, id: registro.id },
        data: { atualizadoEm: agora, ...(ligarPlanejada ? { aulaPlanejadaId: planejada.id } : {}) },
      })
    }

    await tx.envioAulaProcessado.create({ data: { envioId: envio.envioId, clubeId, registroAulaId: registro.id } })
    if (localizado.criada) await this.registrarAtividade(tx, sessao, classe.nome)

    const ignorados = await this.nomearIgnorados(tx, clubeId, [...presencas.foraDaAula, ...requisitos.foraDaAula])
    return this.montarSaida(tx, clubeId, registro.id, {
      conflitos: presencas.conflitos,
      ignorados,
      requisitosSemEfeito: requisitos.semEfeito,
      avisos: planejada.aviso ? [planejada.aviso] : [],
    })
  }

  private async envioProcessado(tx: Tx, clubeId: string, envioId: string): Promise<string | null> {
    const processado = await tx.envioAulaProcessado.findFirst({ where: { clubeId, envioId }, select: { registroAulaId: true } })
    return processado?.registroAulaId ?? null
  }

  private estadoAtual(tx: Tx, clubeId: string, registroAulaId: string): Promise<Saida> {
    return this.montarSaida(tx, clubeId, registroAulaId, { conflitos: [], ignorados: [], requisitosSemEfeito: [], avisos: [] })
  }

  /** Passo 2: a aula do :uuid, ou a da (classe, data) do clube, ou uma nova. */
  private async localizarOuCriar(
    tx: Tx,
    sessao: SessaoLogada,
    uuid: string,
    envio: Envio,
    feito: Date,
    agora: Date,
    configuracao: ConfiguracaoClube,
  ): Promise<{ registro: RegistroAula; criada: boolean }> {
    const { clubeId } = sessao
    const daData = { clubeId, classeId: envio.classeId, data: daDataCivil(envio.data) }
    const doUuid = await tx.registroAula.findFirst({ where: { clubeId, id: uuid } })
    if (doUuid) return { registro: this.conferirDoUuid(doUuid, envio), criada: false }
    const existente = await tx.registroAula.findFirst({ where: daData })
    if (existente) return { registro: existente, criada: false }

    this.exigirCriacaoValida(envio, feito, agora, configuracao.fuso)
    // skipDuplicates gera ON CONFLICT DO NOTHING: violacao dentro da transacao a aborta e nao daria para reler.
    const { count: inseridas } = await tx.registroAula.createMany({
      data: [{ id: uuid, ...daData, registradoPorId: sessao.usuarioId, atualizadoEm: agora }],
      skipDuplicates: true,
    })
    if (inseridas === 1) return { registro: await tx.registroAula.findFirstOrThrow({ where: { clubeId, id: uuid } }), criada: true }

    const concorrenteDoUuid = await tx.registroAula.findFirst({ where: { clubeId, id: uuid } })
    if (concorrenteDoUuid) return { registro: this.conferirDoUuid(concorrenteDoUuid, envio), criada: false }
    const concorrenteDaData = await tx.registroAula.findFirst({ where: daData })
    if (concorrenteDaData) return { registro: concorrenteDaData, criada: false }
    throw regra('Esta aula não pôde ser registrada: o identificador já pertence a outro registro.')
  }

  private conferirDoUuid(registro: RegistroAula, envio: Envio): RegistroAula {
    if (registro.classeId !== envio.classeId) throw new ErroApp('NAO_ENCONTRADO', 'Aula não encontrada.')
    if (paraDataCivil(registro.data) !== envio.data) throw regra('A data de uma aula registrada não muda.')
    return registro
  }

  /** Criacao: envio de ate 7 dias atras e data entre hoje-30 e hoje, contados em `feito`. */
  private exigirCriacaoValida(envio: Envio, feito: Date, agora: Date, fuso: string): void {
    if (feito.getTime() < agora.getTime() - DIAS_DE_ENVIO_TARDIO * MS_POR_DIA) {
      throw regra('Esta aula foi registrada há mais de 7 dias e não pode mais ser enviada.')
    }
    const atraso = diasEntre(envio.data, hojeNoFuso(fuso, feito))
    if (atraso < 0 || atraso > DIAS_DE_CORRECAO) {
      throw regra('A data da aula deve estar entre hoje e os últimos 30 dias.')
    }
  }

  /** Adm sem prazo; instrutor ate 30 dias depois da data, com envio de ate 7 dias. */
  private exigirNoPrazo(sessao: SessaoLogada, registro: RegistroAula, feito: Date, agora: Date, fuso: string): void {
    if (sessao.papel === 'ADM') return
    const tardio = feito.getTime() < agora.getTime() - DIAS_DE_ENVIO_TARDIO * MS_POR_DIA
    if (tardio || !dentroDoPrazoDeCorrecao(paraDataCivil(registro.data), feito, fuso)) {
      throw regra('Esta aula já não pode ser alterada.')
    }
  }

  /** F1: matriculas CURSANDO na classe no ano do clube da data, ativo, de qualquer Tipo (todos cursam classe). */
  private async membrosDaAula(tx: Tx, clubeId: string, classeId: string, data: string, inicioAnoClube: string): Promise<Membros> {
    const matriculas = await tx.matriculaClasse.findMany({
      where: {
        clubeId,
        classeId,
        anoClube: anoClube(data, inicioAnoClube),
        status: 'CURSANDO',
        dbv: { clubeId, ativo: true, tipo: { in: ['DBV', 'DIRETORIA', 'LIDER'] } },
      },
      select: { dbvId: true, dbv: { select: { nome: true, tipo: true, usuarioId: true } } },
    })
    return new Map(matriculas.map(({ dbvId, dbv }) => [dbvId, { nome: dbv.nome, tipo: dbv.tipo, usuarioId: dbv.usuarioId }]))
  }

  /** Presenca com conflito por `versao`: a ultima gravacao vale, a versao vista velha vira conflito. */
  private async aplicarPresencas(tx: Tx, { sessao, registro, envio, membros, agora }: Contexto) {
    const { clubeId } = sessao
    const foraDaAula = envio.presencas.filter((p) => !membros.has(p.dbvId)).map((p) => p.dbvId)
    const gravadasAntes = new Map(
      (await tx.presencaAula.findMany({ where: { clubeId, registroAulaId: registro.id } })).map((p) => [p.dbvId, p]),
    )
    const conflitos: { dbvId: string; nome: string }[] = []
    const novas: Prisma.PresencaAulaCreateManyInput[] = []
    let gravadas = 0

    for (const presenca of new Map(envio.presencas.map((p) => [p.dbvId, p])).values()) {
      const membro = membros.get(presenca.dbvId)
      if (!membro) continue
      const gravada = gravadasAntes.get(presenca.dbvId)
      if (!gravada) {
        novas.push({
          clubeId,
          registroAulaId: registro.id,
          dbvId: presenca.dbvId,
          presente: presenca.presente,
          versao: agora,
          alteradaPorId: sessao.usuarioId,
          envioId: envio.envioId,
        })
        continue
      }
      if (gravada.presente === presenca.presente) continue
      const emConflito = presenca.versaoVista === null || Date.parse(presenca.versaoVista) !== gravada.versao.getTime()
      if (emConflito) conflitos.push({ dbvId: presenca.dbvId, nome: membro.nome })
      await tx.presencaAula.updateMany({
        where: { clubeId, registroAulaId: registro.id, dbvId: presenca.dbvId },
        data: { presente: presenca.presente, versao: agora, alteradaPorId: sessao.usuarioId, envioId: envio.envioId },
      })
      gravadas++
    }
    if (novas.length > 0) await tx.presencaAula.createMany({ data: novas })
    return { conflitos, foraDaAula, gravadas: gravadas + novas.length }
  }

  /** F5: so vale a aula planejada da ultima publicacao da classe na mesma data; o resto vira aviso. */
  private async aulaPlanejadaValida(tx: Tx, { sessao, registro, envio }: Contexto): Promise<{ id: string | null; aviso: string | null }> {
    if (envio.aulaPlanejadaId === null) return { id: null, aviso: null }
    const { clubeId } = sessao
    const cronograma = await tx.cronograma.findFirst({
      where: { clubeId, classeId: envio.classeId, aulas: { some: { clubeId, id: envio.aulaPlanejadaId } } },
      select: { id: true },
    })
    const publicacao = cronograma ? await this.cronogramas.ultimaPublicacao(clubeId, cronograma.id) : null
    const publicada = publicacao?.aulas.some((aula) => aula.id === envio.aulaPlanejadaId && aula.data === paraDataCivil(registro.data))
    return publicada ? { id: envio.aulaPlanejadaId, aviso: null } : { id: null, aviso: AVISO_FORA_DO_PUBLICADO }
  }

  /**
   * F3, F4 e F6: desmarca so o desta aula (estorna), marca o que vale, e o resto vai para `requisitosSemEfeito`.
   * A marca na propria ficha fica sem efeito em vez de recusar a aula: envio antigo da fila nao pode travar a presenca dos outros.
   */
  private async aplicarRequisitos(tx: Tx, contexto: Contexto) {
    const { sessao, registro, envio, membros } = contexto
    const { clubeId } = sessao
    const semEfeito: SemEfeito[] = []
    const daPropriaFicha = (marca: Marca): boolean => {
      if (!ehFichaDaSessao(sessao, membros.get(marca.dbvId)?.usuarioId ?? null)) return false
      semEfeito.push({ dbvId: marca.dbvId, requisitoId: marca.requisitoId, motivo: 'PROPRIA_FICHA', concluidoEm: null })
      return true
    }
    const desmarcadas = semRepetidos(envio.requisitosDesmarcados).filter((marca) => !daPropriaFicha(marca))
    const marcadas = semRepetidos(envio.requisitosMarcados).filter((marca) => !daPropriaFicha(marca))
    const foraDaAula = new Set<string>()
    let gravou = false

    for (const marca of desmarcadas) {
      const membro = membros.get(marca.dbvId)
      if (!membro) {
        foraDaAula.add(marca.dbvId)
        continue
      }
      const { count } = await tx.requisitoConcluido.updateMany({
        where: { clubeId, dbvId: marca.dbvId, requisitoId: marca.requisitoId, registroAulaId: registro.id, removidoEm: null },
        data: { removidoEm: contexto.agora, removidoPorId: sessao.usuarioId },
      })
      if (count === 0) continue
      gravou = true
      if (membro.tipo === 'DBV') await this.sincronizarPontos(tx, contexto, marca, [])
    }

    const validos = await this.requisitosValidos(tx, clubeId, envio.classeId, marcadas.map((m) => m.requisitoId))
    const jaConcluidos = new Map(
      (
        await tx.requisitoConcluido.findMany({
          where: {
            clubeId,
            removidoEm: null,
            dbvId: { in: marcadas.map((m) => m.dbvId) },
            requisitoId: { in: marcadas.map((m) => m.requisitoId) },
          },
        })
      ).map((conclusao) => [`${conclusao.dbvId}:${conclusao.requisitoId}`, conclusao]),
    )
    const ausentes = new Set(envio.presencas.filter((p) => !p.presente).map((p) => p.dbvId))
    const criterio = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: 'REQUISITO', padrao: true } })

    for (const marca of marcadas) {
      const membro = membros.get(marca.dbvId)
      if (!membro) {
        foraDaAula.add(marca.dbvId)
        continue
      }
      const sem = (motivo: SemEfeito['motivo'], concluidoEm: string | null): void => {
        semEfeito.push({ dbvId: marca.dbvId, requisitoId: marca.requisitoId, motivo, concluidoEm })
      }
      if (!validos.has(marca.requisitoId)) {
        sem('REQUISITO_INVALIDO', null)
        continue
      }
      if (ausentes.has(marca.dbvId)) {
        sem('AUSENTE', null)
        continue
      }
      const existente = jaConcluidos.get(chaveDoPar(marca))
      if (existente) {
        const nossa = registro.data.getTime()
        const maisAntiga = nossa < existente.concluidoEm.getTime()
        if (maisAntiga) {
          await tx.requisitoConcluido.updateMany({
            where: { clubeId, id: existente.id },
            data: { concluidoEm: registro.data, registroAulaId: registro.id },
          })
          gravou = true
        }
        sem('JA_CONCLUIDO', paraDataCivil(maisAntiga ? registro.data : existente.concluidoEm))
        continue
      }
      await tx.requisitoConcluido.create({
        data: {
          clubeId,
          dbvId: marca.dbvId,
          requisitoId: marca.requisitoId,
          concluidoEm: registro.data,
          registroAulaId: registro.id,
          marcadoPorId: sessao.usuarioId,
        },
      })
      gravou = true
      if (membro.tipo === 'DBV' && criterio?.ativo) {
        await this.sincronizarPontos(tx, contexto, marca, [{ criterioId: criterio.id, pontos: criterio.pontos }])
      }
    }
    return { semEfeito, foraDaAula: [...foraDaAula], gravou }
  }

  /** Requisitos da classe que o clube considera ativos (o ajuste do clube vale sobre o oficial). */
  private async requisitosValidos(tx: Tx, clubeId: string, classeId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const [requisitos, ajustes] = await Promise.all([
      tx.requisito.findMany({ where: { id: { in: ids }, secao: { classeId } }, select: { id: true, ativo: true } }),
      tx.requisitoAjuste.findMany({ where: { clubeId, requisitoId: { in: ids } }, select: { requisitoId: true, ativo: true } }),
    ])
    const ajustePorId = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste.ativo]))
    return new Set(requisitos.filter((r) => ajustePorId.get(r.id) ?? r.ativo).map((r) => r.id))
  }

  private sincronizarPontos(tx: Tx, { sessao, registro }: Contexto, marca: Marca, devidos: { criterioId: string; pontos: number }[]): Promise<void> {
    return this.pontos.sincronizar(tx, {
      clubeId: sessao.clubeId,
      dbvId: marca.dbvId,
      origemTipo: 'REQUISITO',
      origemId: chaveDoPar(marca),
      data: paraDataCivil(registro.data),
      devidos,
      lancadoPorId: sessao.usuarioId,
    })
  }

  private async registrarAtividade(tx: Tx, sessao: SessaoLogada, nomeDaClasse: string): Promise<void> {
    const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: sessao.usuarioId }, select: { nome: true } })
    await this.atividades.registrar(tx, {
      clubeId: sessao.clubeId,
      autorId: sessao.usuarioId,
      tipo: 'AULA_REGISTRADA',
      descricao: `${usuario.nome} registrou a aula de ${nomeDaClasse}`,
      link: null,
    })
  }

  private async nomearIgnorados(tx: Tx, clubeId: string, dbvIds: string[]): Promise<Saida['ignorados']> {
    const unicos = [...new Set(dbvIds)]
    if (unicos.length === 0) return []
    const conhecidos = await tx.desbravador.findMany({ where: { clubeId, id: { in: unicos } }, select: { id: true, nome: true } })
    const nomes = new Map(conhecidos.map((dbv) => [dbv.id, dbv.nome]))
    return unicos.map((dbvId) => ({ dbvId, nome: nomes.get(dbvId) ?? 'Desbravador não encontrado' }))
  }

  /** Versoes de todas as presencas da aula e os pontos de requisito ativos das conclusoes dela. */
  private async montarSaida(
    tx: Tx,
    clubeId: string,
    registroAulaId: string,
    extras: Pick<Saida, 'conflitos' | 'ignorados' | 'requisitosSemEfeito' | 'avisos'>,
  ): Promise<Saida> {
    const [presencas, conclusoes] = await Promise.all([
      tx.presencaAula.findMany({ where: { clubeId, registroAulaId }, select: { dbvId: true, versao: true } }),
      tx.requisitoConcluido.findMany({ where: { clubeId, registroAulaId, removidoEm: null }, select: { dbvId: true, requisitoId: true } }),
    ])
    const lancamentos = await tx.lancamentoPontos.aggregate({
      where: {
        clubeId,
        origemTipo: 'REQUISITO',
        origemId: { in: conclusoes.map((c) => `${c.dbvId}:${c.requisitoId}`) },
        estornadoEm: null,
      },
      _sum: { pontos: true },
    })
    return {
      registroAulaId,
      presencas: presencas.map((p) => ({ dbvId: p.dbvId, versao: p.versao.toISOString() })),
      totalPontos: lancamentos._sum.pontos ?? 0,
      ...extras,
    }
  }
}
