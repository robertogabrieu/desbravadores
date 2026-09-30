import type { INestApplication } from '@nestjs/common'
import type { ConfiguracaoClubeSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Configuracao = z.infer<typeof ConfiguracaoClubeSaida>

describe('configuracao do clube', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // 15/06/2026 e segunda; domingo 21/06 e o proximo dia de reuniao (padrao do clube: domingo).
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  async function cenario() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    return { clube, adm, amigo }
  }

  it('GET devolve a configuracao do clube com fuso e inicio do ano; Adm apenas', async () => {
    const { clube, adm } = await cenario()
    const saida = corpo<Configuracao>(await api.get('/api/clube/configuracao', adm.autorizacao).expect(200))
    expect(saida).toEqual({
      diaReuniao: 0, horaReuniao: '09:00', localReuniaoPadrao: null,
      limiarFrequenciaAlerta: 70, limiarProgressoAlerta: 40, metaFrequencia: 80,
      fuso: 'America/Sao_Paulo', inicioAnoClube: '02-01',
    })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    await api.get('/api/clube/configuracao', conselheiro.autorizacao).expect(403)
    await api.get('/api/clube/configuracao', instrutor.autorizacao).expect(403)
  })

  it('PATCH edita hora, local, limiares e meta; conselheiro → 403; valor invalido → 400', async () => {
    const { clube, adm } = await cenario()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const mudanca = { horaReuniao: '14:30', localReuniaoPadrao: 'Salao', limiarFrequenciaAlerta: 60, limiarProgressoAlerta: 30, metaFrequencia: 90 }
    const saida = corpo<Configuracao>(await api.patch('/api/clube/configuracao', adm.autorizacao, mudanca).expect(200))
    expect(saida).toMatchObject(mudanca)
    expect(corpo<Configuracao>(await api.get('/api/clube/configuracao', adm.autorizacao))).toMatchObject(mudanca)
    await api.patch('/api/clube/configuracao', conselheiro.autorizacao, mudanca).expect(403)
    await api.patch('/api/clube/configuracao', adm.autorizacao, { horaReuniao: '25:00' }).expect(400)
    await api.patch('/api/clube/configuracao', adm.autorizacao, { metaFrequencia: 101 }).expect(400)
  })

  it('fuso e inicioAnoClube nao sao editaveis', async () => {
    const { clube, adm } = await cenario()
    await api.patch('/api/clube/configuracao', adm.autorizacao, { fuso: 'UTC', inicioAnoClube: '03-01', metaFrequencia: 85 }).expect(200)
    const gravada = await prismaDeTeste().configuracaoClube.findUniqueOrThrow({ where: { clubeId: clube.id } })
    expect(gravada).toMatchObject({ fuso: 'America/Sao_Paulo', inicioAnoClube: '02-01', metaFrequencia: 85 })
  })

  it('G9: mudar o dia com aula futura no dia de reuniao atual → 422 com as classes; nada e gravado', async () => {
    const { clube, adm, amigo } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: '2026-06-21', requisitoIds: [] }] })
    const resposta = await api.patch('/api/clube/configuracao', adm.autorizacao, { diaReuniao: 3, metaFrequencia: 99 }).expect(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Há aulas marcadas no dia atual de reunião: Amigo. Mova-as antes.' })
    const gravada = await prismaDeTeste().configuracaoClube.findUniqueOrThrow({ where: { clubeId: clube.id } })
    expect(gravada).toMatchObject({ diaReuniao: 0, metaFrequencia: 80 })
  })

  it('G9: nao bloqueia aula passada, removida, de outro dia da semana, de Agrupadas, de outro clube nem o mesmo dia', async () => {
    const { clube, adm, amigo } = await cenario()
    const agrupada = await prismaDeTeste().classe.findFirstOrThrow({ where: { trilha: 'AGRUPADAS', clubeId: null } })
    const outro = await criarClube()
    const crono = await criarCronograma({
      clubeId: clube.id,
      classeId: amigo.id,
      aulas: [
        { data: '2026-06-14', requisitoIds: [] }, // domingo passado
        { data: '2026-06-24', requisitoIds: [] }, // quarta (campo)
        { data: '2026-06-28', requisitoIds: [] }, // domingo, mas removida abaixo
      ],
    })
    await prismaDeTeste().aulaPlanejada.update({ where: { id: crono.aulas[2].id }, data: { removidaEm: new Date() } })
    await criarCronograma({ clubeId: clube.id, classeId: agrupada.id, aulas: [{ data: '2026-06-21', requisitoIds: [] }] })
    await criarCronograma({ clubeId: outro.id, classeId: amigo.id, aulas: [{ data: '2026-06-21', requisitoIds: [] }] })

    await api.patch('/api/clube/configuracao', adm.autorizacao, { diaReuniao: 0 }).expect(200)
    const saida = corpo<Configuracao>(await api.patch('/api/clube/configuracao', adm.autorizacao, { diaReuniao: 3 }).expect(200))
    expect(saida.diaReuniao).toBe(3)
  })

  it('G9: lista todas as classes com aula, sem repetir', async () => {
    const { clube, adm, amigo } = await cenario()
    const companheiro = await classeOficial('Companheiro')
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: '2026-06-21', requisitoIds: [] }, { data: '2026-06-28', requisitoIds: [] }] })
    await criarCronograma({ clubeId: clube.id, classeId: companheiro.id, aulas: [{ data: '2026-06-21', requisitoIds: [] }] })
    const resposta = await api.patch('/api/clube/configuracao', adm.autorizacao, { diaReuniao: 5 }).expect(422)
    expect((resposta.body as { mensagem: string }).mensagem).toBe('Há aulas marcadas no dia atual de reunião: Amigo, Companheiro. Mova-as antes.')
  })
})
