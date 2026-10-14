import type { INestApplication } from '@nestjs/common'
import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import { criarAcesso, criarClube, criarEvento, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral: proximo evento', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 15/06/2026 (12h no fuso do clube).
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  async function proximoDe(clubeId: string): Promise<Visao['proximoEvento']> {
    const adm = await criarAcesso({ clubeId, papel: 'ADM' })
    return corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).proximoEvento
  }

  it('nenhum evento a frente: nulo', async () => {
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-06-14' })
    expect(await proximoDe(clube.id)).toBeNull()
  })

  it('evento que e hoje vale; traz horario e local quando existem e nulos quando nao', async () => {
    const clube = await criarClube()
    const hoje = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: '2026-06-15', uniforme: 'GALA', pontosParticipacao: 10 })
    expect(await proximoDe(clube.id)).toEqual({
      id: hoje.id, nome: hoje.nome, tipo: 'EVENTO_ESPECIAL', inicio: '2026-06-15', fim: '2026-06-15', horario: null, local: null,
    })

    await prismaDeTeste().eventoCalendario.update({ where: { id: hoje.id }, data: { horario: '19:00', local: 'Igreja central' } })
    expect(await proximoDe(clube.id)).toMatchObject({ id: hoje.id, horario: '19:00', local: 'Igreja central' })
  })

  it('evento de varios dias em andamento vem antes de um que ainda nao comecou', async () => {
    const clube = await criarClube()
    const emAndamento = await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: '2026-06-13', fim: '2026-06-17' })
    await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-06-20' })
    expect(await proximoDe(clube.id)).toMatchObject({ id: emAndamento.id, tipo: 'ACAMPAMENTO', inicio: '2026-06-13', fim: '2026-06-17' })
  })

  it('o mais proximo ganha entre varios a frente, e ja terminado fica de fora', async () => {
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-06-01', fim: '2026-06-14' })
    const tardio = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-08-01' })
    const cedo = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-07-01' })
    expect(await proximoDe(clube.id)).toMatchObject({ id: cedo.id })
    expect(cedo.id).not.toBe(tardio.id)
  })

  it('virada de ano: em dezembro, o evento de janeiro e o proximo', async () => {
    congelarRelogio('2026-12-30T15:00:00Z')
    const clube = await criarClube()
    const janeiro = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2027-01-09' })
    expect(await proximoDe(clube.id)).toMatchObject({ id: janeiro.id, inicio: '2027-01-09' })
  })

  it('cancelado (removido) nao entra', async () => {
    const clube = await criarClube()
    const cancelado = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-06-20' })
    await prismaDeTeste().eventoCalendario.update({ where: { id: cancelado.id }, data: { removidoEm: new Date() } })
    const seguinte = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-07-20' })
    expect(await proximoDe(clube.id)).toMatchObject({ id: seguinte.id })
  })

  it('tipos fora do cartao (Classe Biblica, feriado, ferias, reuniao extra, sem reuniao) nao entram', async () => {
    const clube = await criarClube()
    for (const tipo of ['CLASSE_BIBLICA', 'FERIADO', 'FERIAS', 'REUNIAO_EXTRA', 'SEM_REUNIAO'] as const) {
      await criarEvento({ clubeId: clube.id, tipo, inicio: '2026-06-16' })
    }
    expect(await proximoDe(clube.id)).toBeNull()
  })

  it('nao enxerga evento de outro clube', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    await criarEvento({ clubeId: outro.id, tipo: 'EVENTO', inicio: '2026-06-16' })
    expect(await proximoDe(clube.id)).toBeNull()
    const proprio = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2026-09-16' })
    expect(await proximoDe(clube.id)).toMatchObject({ id: proprio.id })
  })
})
