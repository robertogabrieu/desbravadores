import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, ReuniaoEnvioSaida, type SituacaoChamada } from '@desbravadores/shared'
import type { z } from 'zod'
import type request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  chamadasDaReuniao,
  configurarClube,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMembro,
  criarReuniao,
  criarUnidade,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Saida = z.infer<typeof ReuniaoEnvioSaida>

interface Marca {
  dbvId: string
  situacao?: SituacaoChamada
  uniforme?: boolean
  biblia?: boolean
  licao?: boolean
  versaoVista?: string | null
}

const DIA = 86_400_000

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

describe('PUT /api/sync/reunioes/:uuid', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario(papel: 'CONSELHEIRO' | 'ADM' | 'INSTRUTOR' = 'CONSELHEIRO') {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const acesso = await criarAcesso({ clubeId: clube.id, papel, unidadeIds: papel === 'CONSELHEIRO' ? [unidade.id] : [] })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    for (const dbv of [ana, bia]) await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })

    const enviar = (
      dados: {
        uuid?: string
        unidadeId?: string
        data?: string
        linhas: Marca[]
        cabecalho?: { horario: string; local: string | null; observacoes: string | null; versaoVista: string | null } | null
        envioId?: string
        feitaEm?: Date
        autorizacao?: string
      },
    ): request.Test =>
      api.put(`/api/sync/reunioes/${dados.uuid ?? randomUUID()}`, dados.autorizacao ?? acesso.autorizacao, {
        versaoPayload: 1,
        envioId: dados.envioId ?? randomUUID(),
        unidadeId: dados.unidadeId ?? unidade.id,
        data: dados.data ?? diasAtras(0),
        feitaNoAparelhoEm: (dados.feitaEm ?? new Date()).toISOString(),
        cabecalho: dados.cabecalho === undefined ? { horario: '09:00', local: null, observacoes: null, versaoVista: null } : dados.cabecalho,
        linhas: dados.linhas.map((l) => ({
          situacao: 'PRESENTE',
          uniforme: false,
          biblia: false,
          licao: false,
          versaoVista: null,
          ...l,
        })),
      })

    const ok = async (req: request.Test): Promise<Saida> => {
      const resposta = await req
      expect(resposta.status).toBe(200)
      return ReuniaoEnvioSaida.parse(corpo<unknown>(resposta))
    }
    const versaoDe = (saida: Saida, dbvId: string): string => saida.linhas.find((l) => l.dbvId === dbvId)?.versao ?? ''
    const pontosDe = (saida: Saida, dbvId: string): number => saida.pontos.find((p) => p.dbvId === dbvId)?.pontos ?? Number.NaN
    const ativos = (reuniaoId: string, dbvId?: string) =>
      prismaDeTeste().lancamentoPontos.findMany({
        where: { clubeId: clube.id, origemTipo: 'CHAMADA', origemId: dbvId ? `${reuniaoId}:${dbvId}` : { startsWith: `${reuniaoId}:` }, estornadoEm: null },
      })
    return { clube, unidade, acesso, ana, bia, enviar, ok, versaoDe, pontosDe, ativos }
  }

  it('cria a reuniao com o id do aparelho, as linhas, o cabecalho e os pontos por criterio', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const saida = await c.ok(
      c.enviar({
        uuid,
        cabecalho: { horario: '14:30', local: 'Igreja', observacoes: 'Trazer lanche', versaoVista: null },
        linhas: [
          { dbvId: c.ana.id, situacao: 'PRESENTE', uniforme: true, biblia: true },
          { dbvId: c.bia.id, situacao: 'ATRASADO' },
        ],
      }),
    )
    expect(saida.reuniaoId).toBe(uuid)
    expect(saida.conflitoCabecalho).toBe(false)
    expect(saida.conflitos).toEqual([])
    expect(saida.ignorados).toEqual([])
    // presenca 10 + pontualidade 5 + uniforme 5 + biblia 3 / presenca 10
    expect(c.pontosDe(saida, c.ana.id)).toBe(23)
    expect(c.pontosDe(saida, c.bia.id)).toBe(10)
    expect(saida.totalPontos).toBe(33)
    const reuniao = await prismaDeTeste().reuniao.findUniqueOrThrow({ where: { id: uuid } })
    expect(reuniao).toMatchObject({ clubeId: c.clube.id, unidadeId: c.unidade.id, horario: '14:30', local: 'Igreja', observacoes: 'Trazer lanche', registradaPorId: c.acesso.usuario.id })
    expect(reuniao.cabecalhoVersao.toISOString()).toBe(saida.cabecalhoVersao)
    expect((await chamadasDaReuniao(uuid)).length).toBe(2)
    expect((await c.ativos(uuid)).length).toBe(5)
    const pontualidade = await criterioPorGatilho(c.clube.id, 'PONTUALIDADE')
    expect((await c.ativos(uuid, c.bia.id)).some((l) => l.criterioId === pontualidade.id)).toBe(false)
  })

  it('reenviar o mesmo envioId responde o estado atual sem gravar nada', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const envioId = randomUUID()
    const primeira = await c.ok(c.enviar({ uuid, envioId, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
    const segunda = await c.ok(
      c.enviar({ uuid, envioId, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA', versaoVista: c.versaoDe(primeira, c.ana.id) }] }),
    )
    expect(segunda).toEqual(primeira)
    expect((await chamadasDaReuniao(uuid)).find((l) => l.dbvId === c.ana.id)?.situacao).toBe('PRESENTE')
    expect(await prismaDeTeste().chamadaAlteracao.count({ where: { clubeId: c.clube.id, reuniaoId: uuid } })).toBe(0)
    expect(await prismaDeTeste().envioProcessado.count({ where: { clubeId: c.clube.id, envioId } })).toBe(1)
    expect((await c.ativos(uuid)).length).toBe(4)
  })

  describe('pontos', () => {
    it('FALTA com desconto vira lancamento sem criterio e FALTA->PRESENTE o estorna', async () => {
      const c = await cenario()
      await configurarClube({ clubeId: c.clube.id, descontarFalta: true, pontosDescontoFalta: 4 })
      const uuid = randomUUID()
      const primeira = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }, { dbvId: c.bia.id }] }))
      expect(c.pontosDe(primeira, c.ana.id)).toBe(-4)
      const desconto = await c.ativos(uuid, c.ana.id)
      expect(desconto).toHaveLength(1)
      expect(desconto[0]).toMatchObject({ criterioId: null, pontos: -4 })

      const segunda = await c.ok(
        c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'PRESENTE', versaoVista: c.versaoDe(primeira, c.ana.id) }] }),
      )
      expect(c.pontosDe(segunda, c.ana.id)).toBe(15)
      expect((await c.ativos(uuid, c.ana.id)).every((l) => l.criterioId !== null)).toBe(true)
      const estornados = await prismaDeTeste().lancamentoPontos.count({ where: { clubeId: c.clube.id, origemId: `${uuid}:${c.ana.id}`, criterioId: null, estornadoEm: { not: null } } })
      expect(estornados).toBe(1)
    })

    it('FALTA sem desconto configurado nao lanca nada', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const saida = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }, { dbvId: c.bia.id }] }))
      expect(c.pontosDe(saida, c.ana.id)).toBe(0)
      expect(await c.ativos(uuid, c.ana.id)).toHaveLength(0)
    })

    it('correcao depois de mudar o criterio mantem o valor antigo do que continua devido', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const primeira = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
      expect(c.pontosDe(primeira, c.ana.id)).toBe(15)
      const presenca = await criterioPorGatilho(c.clube.id, 'PRESENCA')
      await prismaDeTeste().criterioRanking.update({ where: { id: presenca.id }, data: { pontos: 20 } })
      const segunda = await c.ok(
        c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'ATRASADO', versaoVista: c.versaoDe(primeira, c.ana.id) }] }),
      )
      // presenca fica com os 10 da epoca; pontualidade some
      expect(c.pontosDe(segunda, c.ana.id)).toBe(10)
    })

    it('chamada de uma linha por DBV: uma sincronizacao por dbv, inclusive quem virou PRESENTE', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const primeira = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA_JUSTIFICADA' }, { dbvId: c.bia.id }] }))
      expect(c.pontosDe(primeira, c.ana.id)).toBe(0)
      expect(c.pontosDe(primeira, c.bia.id)).toBe(15)
    })
  })

  describe('conflito por versao (SPEC 5.2)', () => {
    it('versaoVista igual a gravada: EDICAO; diferente: CONFLITO_SYNC com o nome em `conflitos`', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const criada = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
      const v1 = c.versaoDe(criada, c.ana.id)

      const editada = await c.ok(c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA', versaoVista: v1 }] }))
      expect(editada.conflitos).toEqual([])
      expect(c.versaoDe(editada, c.ana.id)).not.toBe(v1)

      const conflitada = await c.ok(c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'ATRASADO', versaoVista: v1 }] }))
      expect(conflitada.conflitos).toEqual([{ dbvId: c.ana.id, nome: 'Ana Souza' }])
      expect((await chamadasDaReuniao(uuid)).find((l) => l.dbvId === c.ana.id)?.situacao).toBe('ATRASADO')

      const alteracoes = await prismaDeTeste().chamadaAlteracao.findMany({ where: { clubeId: c.clube.id, reuniaoId: uuid }, orderBy: { alteradaEm: 'asc' } })
      expect(alteracoes.map((a) => a.origem)).toEqual(['EDICAO', 'CONFLITO_SYNC'])
      expect(alteracoes[1]).toMatchObject({ dbvId: c.ana.id, alteradaPorId: c.acesso.usuario.id, antes: { situacao: 'FALTA' }, depois: { situacao: 'ATRASADO' } })
    })

    it('linha identica ao gravado nao gera alteracao nem muda a versao', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const criada = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
      const v1 = c.versaoDe(criada, c.ana.id)
      const de_novo = await c.ok(c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, versaoVista: v1 }] }))
      expect(c.versaoDe(de_novo, c.ana.id)).toBe(v1)
      expect(await prismaDeTeste().chamadaAlteracao.count({ where: { clubeId: c.clube.id, reuniaoId: uuid } })).toBe(0)
    })

    it('cabecalho: versaoVista velha vale o deste envio e avisa; correta nao avisa; nulo nao mexe', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const criada = await c.ok(
        c.enviar({ uuid, cabecalho: { horario: '09:00', local: 'A', observacoes: null, versaoVista: null }, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }),
      )
      const semAviso = await c.ok(
        c.enviar({ uuid, cabecalho: { horario: '10:00', local: 'B', observacoes: 'x', versaoVista: criada.cabecalhoVersao }, linhas: [{ dbvId: c.ana.id }] }),
      )
      expect(semAviso.conflitoCabecalho).toBe(false)
      expect(semAviso.cabecalhoVersao).not.toBe(criada.cabecalhoVersao)

      const comAviso = await c.ok(
        c.enviar({ uuid, cabecalho: { horario: '11:00', local: 'C', observacoes: null, versaoVista: criada.cabecalhoVersao }, linhas: [{ dbvId: c.ana.id }] }),
      )
      expect(comAviso.conflitoCabecalho).toBe(true)
      const gravada = await prismaDeTeste().reuniao.findUniqueOrThrow({ where: { id: uuid } })
      expect(gravada).toMatchObject({ horario: '11:00', local: 'C', observacoes: null })

      const intocado = await c.ok(c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id }] }))
      expect(intocado.cabecalhoVersao).toBe(comAviso.cabecalhoVersao)
      expect(intocado.conflitoCabecalho).toBe(false)
    })

    it('atualiza atualizadaPor/Em quando uma linha muda', async () => {
      const c = await cenario()
      const outro = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const uuid = randomUUID()
      const criada = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
      await c.ok(c.enviar({ uuid, autorizacao: outro.autorizacao, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA', versaoVista: c.versaoDe(criada, c.ana.id) }] }))
      const reuniao = await prismaDeTeste().reuniao.findUniqueOrThrow({ where: { id: uuid } })
      expect(reuniao.atualizadaPorId).toBe(outro.usuario.id)
      expect(reuniao.registradaPorId).toBe(c.acesso.usuario.id)
    })
  })

  describe('membros (E12)', () => {
    it('quem nao era membro DBV da unidade na data e ignorado e devolvido com o nome', async () => {
      const c = await cenario()
      const estranha = await criarDbv({ clubeId: c.clube.id, nome: 'Carla Fora' })
      const tardia = await criarDbv({ clubeId: c.clube.id, nome: 'Dora Tardia' })
      await criarMembro({ dbvId: tardia.id, unidadeId: c.unidade.id, inicio: diasAtras(0) })
      const uuid = randomUUID()
      const data = diasAtras(3)
      const saida = await c.ok(c.enviar({ uuid, data, linhas: [{ dbvId: c.ana.id }, { dbvId: estranha.id }, { dbvId: tardia.id }] }))
      expect(saida.ignorados.map((i) => i.nome).sort()).toEqual(['Carla Fora', 'Dora Tardia'])
      expect((await chamadasDaReuniao(uuid)).map((l) => l.dbvId)).toEqual([c.ana.id])
      expect(await prismaDeTeste().lancamentoPontos.count({ where: { clubeId: c.clube.id, dbvId: estranha.id } })).toBe(0)
    })

    it('membro cuja passagem terminou antes da data tambem e ignorado; quem trocou de unidade na data pertence a nova', async () => {
      const c = await cenario()
      const outra = await criarUnidade({ clubeId: c.clube.id })
      const saiu = await criarDbv({ clubeId: c.clube.id, nome: 'Eva Saiu' })
      await criarMembro({ dbvId: saiu.id, unidadeId: c.unidade.id, inicio: '2026-01-01', fim: diasAtras(10) })
      await criarMembro({ dbvId: saiu.id, unidadeId: outra.id, inicio: diasAtras(10) })
      const data = diasAtras(3)
      const saida = await c.ok(c.enviar({ data, linhas: [{ dbvId: c.ana.id }, { dbvId: saiu.id }] }))
      expect(saida.ignorados.map((i) => i.nome)).toEqual(['Eva Saiu'])
    })

    it('DBV inativo nao entra na chamada', async () => {
      const c = await cenario()
      const inativo = await criarDbv({ clubeId: c.clube.id, nome: 'Fabio Inativo', ativo: false })
      await criarMembro({ dbvId: inativo.id, unidadeId: c.unidade.id, inicio: '2026-01-01' })
      const saida = await c.ok(c.enviar({ linhas: [{ dbvId: c.ana.id }, { dbvId: inativo.id }] }))
      expect(saida.ignorados.map((i) => i.nome)).toEqual(['Fabio Inativo'])
    })

    it('vale a unidade na data: quem virou Diretoria depois da reuniao entra nela; a reuniao do dia da troca ja nao a inclui', async () => {
      const c = await cenario()
      const dora = await criarDbv({ clubeId: c.clube.id, nome: 'Dora Diretoria', tipo: 'DIRETORIA' })
      await criarMembro({ dbvId: dora.id, unidadeId: c.unidade.id, inicio: '2026-01-01', fim: diasAtras(1) })

      const antes = randomUUID()
      const saidaAntes = await c.ok(c.enviar({ uuid: antes, data: diasAtras(3), linhas: [{ dbvId: c.ana.id }, { dbvId: dora.id }] }))
      expect(saidaAntes.ignorados).toEqual([])
      expect((await chamadasDaReuniao(antes)).map((l) => l.dbvId).sort()).toEqual([c.ana.id, dora.id].sort())

      const naTroca = await c.ok(c.enviar({ data: diasAtras(1), linhas: [{ dbvId: c.ana.id }, { dbvId: dora.id }] }))
      expect(naTroca.ignorados.map((i) => i.nome)).toEqual(['Dora Diretoria'])
    })
  })

  describe('data e prazo (E11)', () => {
    it('criacao com feitaNoAparelhoEm de 8 dias atras: 422', async () => {
      const c = await cenario()
      const resposta = await c.enviar({ data: diasAtras(9), feitaEm: new Date(Date.now() - 8 * DIA), linhas: [{ dbvId: c.ana.id }] })
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA' })
    })

    it('feitaNoAparelhoEm no futuro conta como agora', async () => {
      const c = await cenario()
      await c.ok(c.enviar({ data: diasAtras(0), feitaEm: new Date(Date.now() + 3 * DIA), linhas: [{ dbvId: c.ana.id }] }))
    })

    it('criacao: hoje e 30 dias atras passam; amanha e 31 dias atras nao', async () => {
      const c = await cenario()
      await c.ok(c.enviar({ data: diasAtras(30), linhas: [{ dbvId: c.ana.id }] }))
      await c.ok(c.enviar({ data: diasAtras(0), linhas: [{ dbvId: c.ana.id }] }))
      const amanha = hojeNoFuso('America/Sao_Paulo', new Date(Date.now() + DIA))
      for (const data of [diasAtras(31), amanha]) {
        const resposta = await c.enviar({ data, linhas: [{ dbvId: c.ana.id }] })
        expect(resposta.status).toBe(422)
        expect(resposta.body).toMatchObject({ codigo: 'REGRA' })
      }
    })

    it('criacao com data velha e envio dentro de 7 dias e valida se a data estava no prazo em relacao ao envio', async () => {
      const c = await cenario()
      await c.ok(c.enviar({ data: diasAtras(33), feitaEm: new Date(Date.now() - 4 * DIA), linhas: [{ dbvId: c.ana.id }] }))
    })

    it('data travada: outra data para o mesmo :uuid da 422', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      await c.ok(c.enviar({ uuid, data: diasAtras(2), linhas: [{ dbvId: c.ana.id }] }))
      const resposta = await c.enviar({ uuid, data: diasAtras(1), linhas: [{ dbvId: c.ana.id }] })
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'A data de uma reunião registrada não muda.' })
    })

    it(':uuid de uma reuniao de outra unidade da 422', async () => {
      const c = await cenario()
      const outra = await criarUnidade({ clubeId: c.clube.id })
      const vinculado = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const alheia = await criarReuniao({ unidadeId: outra.id, data: diasAtras(1) })
      const resposta = await c.enviar({ uuid: alheia.id, data: diasAtras(1), autorizacao: vinculado.autorizacao, linhas: [{ dbvId: c.ana.id }] })
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA' })
    })

    it(':uuid de uma reuniao de outro clube da 422', async () => {
      const c = await cenario()
      const clubeB = await criarClube()
      const unidadeB = await criarUnidade({ clubeId: clubeB.id })
      const deOutroClube = await criarReuniao({ unidadeId: unidadeB.id, data: diasAtras(1) })
      const resposta = await c.enviar({ uuid: deOutroClube.id, data: diasAtras(1), linhas: [{ dbvId: c.ana.id }] })
      expect(resposta.status).toBe(422)
    })

    it('mesma (unidade, data) com outro :uuid usa a reuniao existente', async () => {
      const c = await cenario()
      const primeiro = await c.ok(c.enviar({ uuid: randomUUID(), data: diasAtras(2), linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] }))
      const segundo = await c.ok(c.enviar({ uuid: randomUUID(), data: diasAtras(2), cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] }))
      expect(segundo.reuniaoId).toBe(primeiro.reuniaoId)
      expect(await prismaDeTeste().reuniao.count({ where: { clubeId: c.clube.id, unidadeId: c.unidade.id } })).toBe(1)
    })

    it('correcao do conselheiro: 25 dias depois da data passa; 40 dias depois nao', async () => {
      const c = await cenario()
      const recente = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(25), chamada: [{ dbvId: c.ana.id }] })
      await c.ok(c.enviar({ uuid: recente.id, data: diasAtras(25), cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] }))
      const velha = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(40), chamada: [{ dbvId: c.ana.id }] })
      const resposta = await c.enviar({ uuid: velha.id, data: diasAtras(40), cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] })
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Esta reunião já não pode ser alterada.' })
    })

    it('prazo pelo feitaNoAparelhoEm: chamada corrigida no dia 27 e enviada 6 dias depois ainda vale; no dia 31 nao', async () => {
      const c = await cenario()
      const daquele = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(33), chamada: [{ dbvId: c.ana.id }] })
      await c.ok(
        c.enviar({ uuid: daquele.id, data: diasAtras(33), cabecalho: null, feitaEm: new Date(Date.now() - 6 * DIA), linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] }),
      )
      const fora = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(37), chamada: [{ dbvId: c.ana.id }] })
      const resposta = await c.enviar({ uuid: fora.id, data: diasAtras(37), cabecalho: null, feitaEm: new Date(Date.now() - 6 * DIA), linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] })
      expect(resposta.status).toBe(422)
    })

    it('correcao feita no aparelho ha mais de 7 dias: 422 para o conselheiro', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(12), chamada: [{ dbvId: c.ana.id }] })
      const resposta = await c.enviar({ uuid: reuniao.id, data: diasAtras(12), cabecalho: null, feitaEm: new Date(Date.now() - 8 * DIA), linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] })
      expect(resposta.status).toBe(422)
    })

    it('Adm nao tem prazo', async () => {
      const c = await cenario('ADM')
      const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(100), chamada: [{ dbvId: c.ana.id }] })
      await c.ok(c.enviar({ uuid: reuniao.id, data: diasAtras(100), cabecalho: null, feitaEm: new Date(Date.now() - 20 * DIA), linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }] }))
      expect((await chamadasDaReuniao(reuniao.id))[0]?.situacao).toBe('FALTA')
    })
  })

  describe('escopo (5.4) e validacao', () => {
    it('instrutor: 403; conselheiro de outra unidade: 404; Adm alcanca qualquer unidade', async () => {
      const c = await cenario()
      const instrutor = await criarAcesso({ clubeId: c.clube.id, papel: 'INSTRUTOR' })
      const forbidden = await c.enviar({ autorizacao: instrutor.autorizacao, linhas: [{ dbvId: c.ana.id }] })
      expect(forbidden.status).toBe(403)

      const outraUnidade = await criarUnidade({ clubeId: c.clube.id })
      const semNegocio = await c.enviar({ unidadeId: outraUnidade.id, linhas: [{ dbvId: c.ana.id }] })
      expect(semNegocio.status).toBe(404)
      expect(semNegocio.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })

      const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      await c.ok(c.enviar({ unidadeId: outraUnidade.id, autorizacao: adm.autorizacao, linhas: [{ dbvId: c.ana.id }] }))
    })

    it('corpo fora do contrato: 400; sem token: 401', async () => {
      const c = await cenario()
      const invalido = await api.put(`/api/sync/reunioes/${randomUUID()}`, c.acesso.autorizacao, { versaoPayload: 2 })
      expect(invalido.status).toBe(400)
      const malformado = await api.put('/api/sync/reunioes/nao-e-uuid', c.acesso.autorizacao, {})
      expect(malformado.status).toBe(400)
      const anonimo = await api.put(`/api/sync/reunioes/${randomUUID()}`, '', {})
      expect(anonimo.status).toBe(401)
    })
  })

  describe('concorrencia', () => {
    async function comRetry(enviar: () => request.Test): Promise<request.Response> {
      let resposta = await enviar()
      for (let tentativa = 0; tentativa < 3 && resposta.status === 503; tentativa++) resposta = await enviar()
      return resposta
    }

    it('dois envios simultaneos na mesma reuniao nao duplicam lancamentos', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const criada = await c.ok(c.enviar({ uuid, linhas: [{ dbvId: c.ana.id, situacao: 'FALTA' }, { dbvId: c.bia.id }] }))
      const v = c.versaoDe(criada, c.ana.id)
      const respostas = await Promise.all([
        comRetry(() => c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'PRESENTE', uniforme: true, versaoVista: v }] })),
        comRetry(() => c.enviar({ uuid, cabecalho: null, linhas: [{ dbvId: c.ana.id, situacao: 'PRESENTE', biblia: true, versaoVista: v }] })),
      ])
      expect(respostas.map((r) => r.status)).toEqual([200, 200])
      const ativosAna = await c.ativos(uuid, c.ana.id)
      const criterios = ativosAna.map((l) => l.criterioId)
      expect(new Set(criterios).size).toBe(criterios.length)
    })

    it('dois aparelhos criando a mesma (unidade, data): os dois gravam e ha uma so reuniao', async () => {
      const c = await cenario()
      const data = diasAtras(1)
      const respostas = await Promise.all([
        comRetry(() => c.enviar({ uuid: randomUUID(), data, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] })),
        comRetry(() => c.enviar({ uuid: randomUUID(), data, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] })),
      ])
      expect(respostas.map((r) => r.status)).toEqual([200, 200])
      expect(await prismaDeTeste().reuniao.count({ where: { clubeId: c.clube.id, unidadeId: c.unidade.id } })).toBe(1)
      const ids = respostas.map((r) => ReuniaoEnvioSaida.parse(corpo<unknown>(r)).reuniaoId)
      expect(ids[0]).toBe(ids[1])
      const ativos = await c.ativos(ids[0] ?? '')
      expect(ativos).toHaveLength(4)
    })

    it('o mesmo envioId enviado duas vezes ao mesmo tempo grava uma vez', async () => {
      const c = await cenario()
      const uuid = randomUUID()
      const envioId = randomUUID()
      const respostas = await Promise.all([
        comRetry(() => c.enviar({ uuid, envioId, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] })),
        comRetry(() => c.enviar({ uuid, envioId, linhas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id }] })),
      ])
      expect(respostas.map((r) => r.status)).toEqual([200, 200])
      expect(await prismaDeTeste().envioProcessado.count({ where: { clubeId: c.clube.id, envioId } })).toBe(1)
      expect(await c.ativos(uuid)).toHaveLength(4)
    })
  })
})
