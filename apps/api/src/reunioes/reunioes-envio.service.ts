import { Injectable } from '@nestjs/common'
import {
  hojeNoFuso,
  pontosPorCriterio,
  type ReuniaoEnvio,
  type ReuniaoEnvioSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { Prisma } from '../generated/prisma/client.js'
import type { ConfiguracaoClube, Reuniao } from '../generated/prisma/client.js'
import { ServicoPontos, type PontoDevido } from '../pontos/servico-pontos'
import {
  DIAS_DE_CORRECAO,
  DIAS_DE_ENVIO_TARDIO,
  MS_POR_DIA,
  dentroDoPrazoDeCorrecao,
  diasEntre,
  exigirUnidadeNoEscopo,
} from './apoio'

type Envio = z.infer<typeof ReuniaoEnvio>
type Saida = z.infer<typeof ReuniaoEnvioSaida>
type LinhaEnvio = Envio['linhas'][number]
type Tx = Prisma.TransactionClient

const TEMPO_DA_TRANSACAO_MS = 20_000
const CODIGOS_DE_CORRIDA = ['P2002', 'P2034']

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

@Injectable()
export class ReunioesEnvioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly pontos: ServicoPontos,
  ) {}

  /** `PUT /sync/reunioes/:uuid` (SPEC Fase 1, 5.1 e 5.2). Corrida de banco vira 503 para a fila repetir. */
  async enviar(sessao: SessaoLogada, uuid: string, envio: Envio, agora: Date = new Date()): Promise<Saida> {
    await exigirUnidadeNoEscopo(this.prisma, this.escopo, sessao, envio.unidadeId)
    if (sessao.substituicao && envio.data !== sessao.substituicao.data) throw new ErroApp('NAO_ENCONTRADO', 'Reunião não encontrada.')
    const feito = new Date(Math.min(Date.parse(envio.feitaNoAparelhoEm), agora.getTime()))
    try {
      return await this.prisma.$transaction((tx) => this.aplicar(tx, sessao, uuid, envio, feito, emMilissegundos(agora)), {
        timeout: TEMPO_DA_TRANSACAO_MS,
      })
    } catch (erro) {
      if (ehCorrida(erro)) throw new ErroApp('TEMPORARIO', 'Não foi possível salvar agora. Tentaremos de novo.')
      throw erro
    }
  }

  private async aplicar(tx: Tx, sessao: SessaoLogada, uuid: string, envio: Envio, feito: Date, agora: Date): Promise<Saida> {
    const { clubeId } = sessao
    const jaProcessado = await this.envioProcessado(tx, clubeId, envio.envioId)
    if (jaProcessado) return this.estadoAtual(tx, clubeId, jaProcessado)

    const configuracao = await tx.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const localizada = await this.localizarOuCriar(tx, sessao, uuid, envio, feito, agora, configuracao)

    // Serializa dois envios da mesma reuniao; o que esperou relê tudo depois do bloqueio.
    await tx.$queryRaw`SELECT id FROM "Reuniao" WHERE id = ${localizada.reuniao.id}::uuid FOR UPDATE`
    const processadoNaEspera = await this.envioProcessado(tx, clubeId, envio.envioId)
    if (processadoNaEspera) return this.estadoAtual(tx, clubeId, processadoNaEspera)
    const reuniao = await tx.reuniao.findFirstOrThrow({ where: { clubeId, id: localizada.reuniao.id } })

    if (!localizada.criada) this.exigirNoPrazo(sessao, reuniao, feito, agora, configuracao.fuso)

    const conflitoCabecalho = localizada.criada ? false : await this.aplicarCabecalho(tx, sessao, reuniao, envio, agora)
    const { conflitos, ignorados, gravadas } = await this.aplicarLinhas(tx, sessao, reuniao, envio, agora)
    if (gravadas.length > 0 && !localizada.criada && envio.cabecalho === null) {
      await tx.reuniao.updateMany({ where: { clubeId, id: reuniao.id }, data: { atualizadaPorId: sessao.usuarioId, atualizadaEm: agora } })
    }
    // Houve substituicao so quando o link gravou alguma linha; envio do titular nao apaga a marca.
    if (sessao.substituicao && gravadas.length > 0) {
      await tx.reuniao.updateMany({ where: { clubeId, id: reuniao.id }, data: { substituicaoId: sessao.substituicao.id } })
    }
    await this.sincronizarPontos(tx, sessao, reuniao, configuracao, gravadas)

    await tx.envioProcessado.create({ data: { envioId: envio.envioId, clubeId, reuniaoId: reuniao.id } })
    const atual = await tx.reuniao.findFirstOrThrow({ where: { clubeId, id: reuniao.id } })
    return this.montarSaida(tx, clubeId, atual, { conflitos, ignorados, conflitoCabecalho })
  }

  private async envioProcessado(tx: Tx, clubeId: string, envioId: string): Promise<string | null> {
    const processado = await tx.envioProcessado.findFirst({ where: { clubeId, envioId }, select: { reuniaoId: true } })
    return processado?.reuniaoId ?? null
  }

  private async estadoAtual(tx: Tx, clubeId: string, reuniaoId: string): Promise<Saida> {
    const reuniao = await tx.reuniao.findFirstOrThrow({ where: { clubeId, id: reuniaoId } })
    return this.montarSaida(tx, clubeId, reuniao, { conflitos: [], ignorados: [], conflitoCabecalho: false })
  }

  /** Passo 2: a reuniao do :uuid, ou a da (unidade, data), ou uma nova. */
  private async localizarOuCriar(
    tx: Tx,
    sessao: SessaoLogada,
    uuid: string,
    envio: Envio,
    feito: Date,
    agora: Date,
    configuracao: ConfiguracaoClube,
  ): Promise<{ reuniao: Reuniao; criada: boolean }> {
    const { clubeId } = sessao
    const doUuid = await tx.reuniao.findFirst({ where: { clubeId, id: uuid } })
    if (doUuid) return { reuniao: this.conferirDoUuid(doUuid, envio), criada: false }

    const daData = await tx.reuniao.findFirst({ where: { clubeId, unidadeId: envio.unidadeId, data: daDataCivil(envio.data) } })
    if (daData) return { reuniao: daData, criada: false }

    this.exigirCriacaoValida(envio, feito, agora, configuracao.fuso)
    const cabecalho = envio.cabecalho ?? { horario: configuracao.horaReuniao, local: configuracao.localReuniaoPadrao, observacoes: null }
    // skipDuplicates gera ON CONFLICT DO NOTHING: violacao dentro da transacao a aborta e nao daria para reler.
    const { count: inseridas } = await tx.reuniao.createMany({
      data: [
        {
          id: uuid,
          clubeId,
          unidadeId: envio.unidadeId,
          data: daDataCivil(envio.data),
          horario: cabecalho.horario,
          local: cabecalho.local,
          observacoes: cabecalho.observacoes,
          registradaPorId: sessao.usuarioId,
          atualizadaPorId: sessao.usuarioId,
          atualizadaEm: agora,
          cabecalhoVersao: agora,
        },
      ],
      skipDuplicates: true,
    })
    if (inseridas === 1) return { reuniao: await tx.reuniao.findFirstOrThrow({ where: { clubeId, id: uuid } }), criada: true }

    const concorrenteDoUuid = await tx.reuniao.findFirst({ where: { clubeId, id: uuid } })
    if (concorrenteDoUuid) return { reuniao: this.conferirDoUuid(concorrenteDoUuid, envio), criada: false }
    const concorrenteDaData = await tx.reuniao.findFirst({ where: { clubeId, unidadeId: envio.unidadeId, data: daDataCivil(envio.data) } })
    if (concorrenteDaData) return { reuniao: concorrenteDaData, criada: false }
    throw regra('Esta reunião não pôde ser registrada: o identificador já pertence a outro registro.')
  }

  private conferirDoUuid(reuniao: Reuniao, envio: Envio): Reuniao {
    if (paraDataCivil(reuniao.data) !== envio.data) throw regra('A data de uma reunião registrada não muda.')
    if (reuniao.unidadeId !== envio.unidadeId) throw regra('Esta reunião pertence a outra unidade.')
    return reuniao
  }

  /** Criacao (E11): envio de ate 7 dias atras e data entre hoje-30 e hoje, contados em `feito`. */
  private exigirCriacaoValida(envio: Envio, feito: Date, agora: Date, fuso: string): void {
    if (feito.getTime() < agora.getTime() - DIAS_DE_ENVIO_TARDIO * MS_POR_DIA) {
      throw regra('Esta chamada foi feita há mais de 7 dias e não pode mais ser enviada.')
    }
    const hoje = hojeNoFuso(fuso, feito)
    const atraso = diasEntre(envio.data, hoje)
    if (atraso < 0 || atraso > DIAS_DE_CORRECAO) {
      throw regra('A data da reunião deve estar entre hoje e os últimos 30 dias.')
    }
  }

  /** Passo 4: ADM sem prazo; conselheiro ate 30 dias depois da data, com envio de ate 7 dias. */
  private exigirNoPrazo(sessao: SessaoLogada, reuniao: Reuniao, feito: Date, agora: Date, fuso: string): void {
    if (sessao.papel === 'ADM') return
    const tardio = feito.getTime() < agora.getTime() - DIAS_DE_ENVIO_TARDIO * MS_POR_DIA
    if (tardio || !dentroDoPrazoDeCorrecao(paraDataCivil(reuniao.data), feito, fuso)) {
      throw regra('Esta reunião já não pode ser alterada.')
    }
  }

  /** Passo 5. Devolve se o cabecalho tinha sido mudado por outra pessoa depois do que o aparelho viu. */
  private async aplicarCabecalho(tx: Tx, sessao: SessaoLogada, reuniao: Reuniao, envio: Envio, agora: Date): Promise<boolean> {
    const { cabecalho } = envio
    if (cabecalho === null) return false
    const vista = cabecalho.versaoVista === null ? null : Date.parse(cabecalho.versaoVista)
    const conflito = vista !== reuniao.cabecalhoVersao.getTime()
    await tx.reuniao.updateMany({
      where: { clubeId: sessao.clubeId, id: reuniao.id },
      data: {
        horario: cabecalho.horario,
        local: cabecalho.local,
        observacoes: cabecalho.observacoes,
        cabecalhoVersao: agora,
        atualizadaPorId: sessao.usuarioId,
        atualizadaEm: agora,
      },
    })
    return conflito
  }

  /** Passos 6 e 7 (linhas): membros da chamada (E12) e conflito por linha (5.2). */
  private async aplicarLinhas(tx: Tx, sessao: SessaoLogada, reuniao: Reuniao, envio: Envio, agora: Date) {
    const { clubeId } = sessao
    const porDbv = new Map(envio.linhas.map((linha) => [linha.dbvId, linha]))
    const dataDaReuniao = daDataCivil(envio.data)
    // Vale a unidade na data, não o Tipo de hoje: quem virou Diretoria depois ainda é da chamada daquele dia.
    const membros = await tx.membroUnidade.findMany({
      where: {
        clubeId,
        unidadeId: reuniao.unidadeId,
        dbvId: { in: [...porDbv.keys()] },
        inicio: { lte: dataDaReuniao },
        OR: [{ fim: null }, { fim: { gt: dataDaReuniao } }],
        dbv: { clubeId, ativo: true },
      },
      select: { dbvId: true, dbv: { select: { nome: true } } },
    })
    const nomes = new Map(membros.map((membro) => [membro.dbvId, membro.dbv.nome]))
    const foraIds = [...porDbv.keys()].filter((dbvId) => !nomes.has(dbvId))
    const conhecidos = await tx.desbravador.findMany({ where: { clubeId, id: { in: foraIds } }, select: { id: true, nome: true } })
    const nomesDosForaDeLista = new Map(conhecidos.map((dbv) => [dbv.id, dbv.nome]))
    const ignorados = foraIds.map((dbvId) => ({ dbvId, nome: nomesDosForaDeLista.get(dbvId) ?? 'Desbravador não encontrado' }))

    const gravadasAntes = new Map(
      (await tx.chamada.findMany({ where: { clubeId, reuniaoId: reuniao.id } })).map((linha) => [linha.dbvId, linha]),
    )
    const conflitos: { dbvId: string; nome: string }[] = []
    const gravadas: LinhaEnvio[] = []
    const novas: LinhaEnvio[] = []
    const alteracoes: Prisma.ChamadaAlteracaoCreateManyInput[] = []

    for (const [dbvId, linha] of porDbv) {
      if (!nomes.has(dbvId)) continue
      const gravada = gravadasAntes.get(dbvId)
      if (!gravada) {
        novas.push(linha)
        gravadas.push(linha)
        continue
      }
      const identica =
        gravada.situacao === linha.situacao &&
        gravada.uniforme === linha.uniforme &&
        gravada.biblia === linha.biblia &&
        gravada.licao === linha.licao
      if (identica) continue

      const emConflito = linha.versaoVista === null || Date.parse(linha.versaoVista) !== gravada.versao.getTime()
      if (emConflito) conflitos.push({ dbvId, nome: nomes.get(dbvId) ?? '' })
      alteracoes.push({
        clubeId,
        reuniaoId: reuniao.id,
        dbvId,
        antes: this.instantaneo(gravada),
        depois: this.instantaneo({ ...linha, versao: agora }),
        origem: emConflito ? 'CONFLITO_SYNC' : 'EDICAO',
        alteradaPorId: sessao.usuarioId,
      })
      await tx.chamada.updateMany({
        where: { clubeId, reuniaoId: reuniao.id, dbvId },
        data: {
          situacao: linha.situacao,
          uniforme: linha.uniforme,
          biblia: linha.biblia,
          licao: linha.licao,
          versao: agora,
          alteradaPorId: sessao.usuarioId,
          envioId: envio.envioId,
        },
      })
      gravadas.push(linha)
    }

    if (novas.length > 0) {
      await tx.chamada.createMany({
        data: novas.map((linha) => ({
          clubeId,
          reuniaoId: reuniao.id,
          dbvId: linha.dbvId,
          situacao: linha.situacao,
          uniforme: linha.uniforme,
          biblia: linha.biblia,
          licao: linha.licao,
          versao: agora,
          alteradaPorId: sessao.usuarioId,
          envioId: envio.envioId,
        })),
      })
    }
    if (alteracoes.length > 0) await tx.chamadaAlteracao.createMany({ data: alteracoes })
    return { conflitos, ignorados, gravadas }
  }

  private instantaneo(linha: {
    situacao: string
    uniforme: boolean
    biblia: boolean
    licao: boolean
    versao: Date
  }): Prisma.InputJsonObject {
    return {
      situacao: linha.situacao,
      uniforme: linha.uniforme,
      biblia: linha.biblia,
      licao: linha.licao,
      versao: linha.versao.toISOString(),
    }
  }

  /** Passo 7 (5.3): uma chamada a `sincronizar` por DBV gravado, inclusive quem virou PRESENTE. */
  private async sincronizarPontos(
    tx: Tx,
    sessao: SessaoLogada,
    reuniao: Reuniao,
    configuracao: ConfiguracaoClube,
    gravadas: LinhaEnvio[],
  ): Promise<void> {
    if (gravadas.length === 0) return
    const { clubeId } = sessao
    const criterios = await tx.criterioRanking.findMany({ where: { clubeId, padrao: true } })
    const idPorGatilho = new Map(criterios.map((criterio) => [criterio.gatilho, criterio.id]))
    const config = { descontarFalta: configuracao.descontarFalta, pontosDescontoFalta: configuracao.pontosDescontoFalta }

    for (const linha of gravadas) {
      const devidos = pontosPorCriterio(linha, criterios, config).flatMap((item): PontoDevido[] => {
        if (item.gatilho === 'FALTA') return [{ criterioId: null, pontos: item.pontos }]
        const criterioId = idPorGatilho.get(item.gatilho)
        return criterioId ? [{ criterioId, pontos: item.pontos }] : []
      })
      await this.pontos.sincronizar(tx, {
        clubeId,
        dbvId: linha.dbvId,
        origemTipo: 'CHAMADA',
        origemId: `${reuniao.id}:${linha.dbvId}`,
        data: paraDataCivil(reuniao.data),
        devidos,
        lancadoPorId: sessao.usuarioId,
      })
    }
  }

  /** Passo 9: pontos e versao de todas as linhas da reuniao. */
  private async montarSaida(
    tx: Tx,
    clubeId: string,
    reuniao: Reuniao,
    extras: Pick<Saida, 'conflitos' | 'ignorados' | 'conflitoCabecalho'>,
  ): Promise<Saida> {
    const [linhas, lancamentos] = await Promise.all([
      tx.chamada.findMany({ where: { clubeId, reuniaoId: reuniao.id }, select: { dbvId: true, versao: true } }),
      tx.lancamentoPontos.findMany({
        where: { clubeId, origemTipo: 'CHAMADA', origemId: { startsWith: `${reuniao.id}:` }, estornadoEm: null },
        select: { dbvId: true, pontos: true },
      }),
    ])
    const pontosPorDbv = new Map<string, number>(linhas.map((linha) => [linha.dbvId, 0]))
    for (const lancamento of lancamentos) {
      pontosPorDbv.set(lancamento.dbvId, (pontosPorDbv.get(lancamento.dbvId) ?? 0) + lancamento.pontos)
    }
    const pontos = [...pontosPorDbv].map(([dbvId, total]) => ({ dbvId, pontos: total }))
    return {
      reuniaoId: reuniao.id,
      pontos,
      totalPontos: pontos.reduce((soma, item) => soma + item.pontos, 0),
      linhas: linhas.map((linha) => ({ dbvId: linha.dbvId, versao: linha.versao.toISOString() })),
      cabecalhoVersao: reuniao.cabecalhoVersao.toISOString(),
      ...extras,
    }
  }
}
