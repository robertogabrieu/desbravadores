import type { INestApplication } from '@nestjs/common'
import { GATILHOS_DE_REGRA, REGRAS_DE_PONTUACAO, type RegrasSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../../test/app'
import {
  anoCorrente,
  criarAcesso,
  criarClube,
  criarDbv,
  criarEvento,
  criarLancamento,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../../test/fabricas'
import { clienteHttp, corpo } from '../../../test/p6'

type Regras = z.infer<typeof RegrasSaida>

const ROTA = '/api/ranking/regras'

describe('ranking: regras de pontuação', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  /** `criarClube` já semeia as 7 básicas; apagá-las reproduz o clube antigo, que nunca as teve. */
  async function admDeClubeNovo() {
    const clube = await criarClube()
    await prismaDeTeste().criterioRanking.deleteMany({ where: { clubeId: clube.id } })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    return { clube, adm }
  }

  it('GET em clube sem nenhuma linha devolve as 9 regras com os valores iniciais e cria as linhas', async () => {
    const { clube, adm } = await admDeClubeNovo()
    expect(await prismaDeTeste().criterioRanking.count({ where: { clubeId: clube.id } })).toBe(0)

    const saida = corpo<Regras>(await api.get(ROTA, adm.autorizacao).expect(200))

    expect(saida.regras).toEqual(
      REGRAS_DE_PONTUACAO.map((regra) => ({ gatilho: regra.gatilho, pontos: regra.pontosIniciais, ativo: regra.ligadaNoInicio })),
    )
    expect(saida.regras.find((regra) => regra.gatilho === 'LICAO')).toMatchObject({ pontos: 3, ativo: false })
    const filtro = { clubeId: clube.id, padrao: true, gatilho: { in: [...GATILHOS_DE_REGRA] } }
    expect(await prismaDeTeste().criterioRanking.count({ where: filtro })).toBe(9)
    await api.get(ROTA, adm.autorizacao).expect(200)
    expect(await prismaDeTeste().criterioRanking.count({ where: filtro })).toBe(9)
  })

  it('GET recusa conselheiro e instrutor', async () => {
    const clube = await criarClube()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })

    await api.get(ROTA, conselheiro.autorizacao).expect(403)
    await api.get(ROTA, instrutor.autorizacao).expect(403)
  })

  it('critério personalizado já chamado "Presença" não derruba o GET', async () => {
    const { clube, adm } = await admDeClubeNovo()
    await prismaDeTeste().criterioRanking.create({
      data: { clubeId: clube.id, nome: 'Presença', pontos: 1, ativo: true, ordem: 1, gatilho: 'MANUAL', lancadoPor: 'ADM', padrao: false },
    })

    const saida = corpo<Regras>(await api.get(ROTA, adm.autorizacao).expect(200))

    expect(saida.regras).toHaveLength(9)
    const presenca = await criterioPorGatilho(clube.id, 'PRESENCA')
    expect(presenca.nome).not.toBe('Presença')
    expect(presenca.nome).toContain('Presença')
  })

  it('PATCH atualiza só o clube do usuário', async () => {
    const outro = await admDeClubeNovo()
    await api.get(ROTA, outro.adm.autorizacao).expect(200)
    const { clube, adm } = await admDeClubeNovo()
    await api.get(ROTA, adm.autorizacao).expect(200)

    const saida = corpo<{ gatilho: string; pontos: number; ativo: boolean }>(
      await api.patch(`${ROTA}/BIBLIA`, adm.autorizacao, { pontos: 7, ativo: false }).expect(200),
    )

    expect(saida).toEqual({ gatilho: 'BIBLIA', pontos: 7, ativo: false })
    expect(await criterioPorGatilho(clube.id, 'BIBLIA')).toMatchObject({ pontos: 7, ativo: false })
    expect(await criterioPorGatilho(outro.clube.id, 'BIBLIA')).toMatchObject({ pontos: 3, ativo: true })
  })

  it('PATCH em clube sem linhas as cria e atualiza', async () => {
    const { clube, adm } = await admDeClubeNovo()

    await api.patch(`${ROTA}/CLASSE_BIBLICA_PRESENCA`, adm.autorizacao, { pontos: 8, ativo: true }).expect(200)

    expect(await prismaDeTeste().criterioRanking.count({ where: { clubeId: clube.id, gatilho: { in: [...GATILHOS_DE_REGRA] } } })).toBe(9)
    expect(await criterioPorGatilho(clube.id, 'CLASSE_BIBLICA_PRESENCA')).toMatchObject({ pontos: 8 })
  })

  it('PATCH sem ranking.configurar responde 403', async () => {
    const clube = await criarClube()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

    await api.patch(`${ROTA}/PRESENCA`, conselheiro.autorizacao, { pontos: 1, ativo: true }).expect(403)
  })

  it('PATCH recusa pontos fora de 0 a 1000, não inteiros e corpo sem ativo', async () => {
    const { adm } = await admDeClubeNovo()

    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: -1, ativo: true }).expect(400)
    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 1001, ativo: true }).expect(400)
    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 2.5, ativo: true }).expect(400)
    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 5 }).expect(400)
    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 0, ativo: true }).expect(200)
    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 1000, ativo: true }).expect(200)
  })

  it('PATCH com gatilho fora dos 9 responde 404', async () => {
    const { adm } = await admDeClubeNovo()

    await api.patch(`${ROTA}/MANUAL`, adm.autorizacao, { pontos: 1, ativo: true }).expect(404)
    await api.patch(`${ROTA}/NAO_EXISTE`, adm.autorizacao, { pontos: 1, ativo: true }).expect(404)
  })

  it('mudar Presença não altera lançamentos antigos', async () => {
    const { clube, adm } = await admDeClubeNovo()
    await api.get(ROTA, adm.autorizacao).expect(200)
    const presenca = await criterioPorGatilho(clube.id, 'PRESENCA')
    const dbv = await criarDbv({ clubeId: clube.id })
    const antigo = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: '2026-09-06', criterioId: presenca.id })

    await api.patch(`${ROTA}/PRESENCA`, adm.autorizacao, { pontos: 4, ativo: true }).expect(200)

    const depois = await prismaDeTeste().lancamentoPontos.findUniqueOrThrow({ where: { id: antigo.id } })
    expect(depois.pontos).toBe(10)
    expect(depois.estornadoEm).toBeNull()
    expect((await criterioPorGatilho(clube.id, 'PRESENCA')).pontos).toBe(4)
  })

  it('eventos: só evento especial não removido do ano; foram só com a lista concluída', async () => {
    const { clube, adm } = await admDeClubeNovo()
    const ano = anoCorrente()
    const semLista = await criarEvento({
      clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: `${ano}-03-10`, uniforme: 'GALA', pontosParticipacao: 20, pontosUniforme: 5,
    })
    const concluido = await criarEvento({
      clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: `${ano}-04-10`, uniforme: 'CAMPO', listaConcluidaEm: new Date(),
    })
    const removido = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: `${ano}-05-10`, uniforme: 'GALA' })
    await prismaDeTeste().eventoCalendario.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
    await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: `${ano}-06-10` })
    await criarEvento({ clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: `${ano - 1}-06-10`, uniforme: 'GALA' })

    const saida = corpo<Regras>(await api.get(ROTA, adm.autorizacao).expect(200))

    expect(saida.eventos.map((evento) => evento.id)).toEqual([semLista.id, concluido.id])
    expect(saida.eventos[0]).toMatchObject({
      inicio: `${ano}-03-10`, fim: `${ano}-03-10`, uniforme: 'GALA', pontosParticipacao: 20, pontosUniforme: 5, listaConcluida: false, foram: null,
    })
    expect(saida.eventos[1]).toMatchObject({ listaConcluida: true, foram: 0 })
  })

  it('as rotas antigas de pontos da Classe Bíblica respondem 404', async () => {
    const { adm } = await admDeClubeNovo()

    await api.get('/api/classe-biblica/pontos', adm.autorizacao).expect(404)
    await api
      .patch('/api/classe-biblica/pontos', adm.autorizacao, { itens: [{ gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: 1, ativo: true }] })
      .expect(404)
  })
})
