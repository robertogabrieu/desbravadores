import type { INestApplication } from '@nestjs/common'
import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarEvento,
  criarMembro,
  criarReuniao,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral: unidades sem chamada', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = segunda 15/06/2026; o clube reune aos domingos, entao a ultima reuniao e 14/06.
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  async function pendentesDe(clubeId: string): Promise<Visao['unidadesSemChamada']> {
    const adm = await criarAcesso({ clubeId, papel: 'ADM' })
    return corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).unidadesSemChamada
  }

  /** Unidade com um desbravador ativo nela desde `inicio` (e ate `fim`, se vier). */
  async function unidadeComDbv(clubeId: string, nome: string, inicio = '2026-02-01', fim?: string) {
    const unidade = await criarUnidade({ clubeId, nome })
    const dbv = await criarDbv({ clubeId })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio, ...(fim ? { fim } : {}) })
    return { unidade, dbv }
  }
  const nomes = (resultado: Visao['unidadesSemChamada']): string[] => (resultado?.unidades ?? []).map((unidade) => unidade.nome)

  it('unidade sem chamada aparece com id, nome e conselheiros; a que lancou chamada nao', async () => {
    const clube = await criarClube()
    const pendente = await unidadeComDbv(clube.id, 'Aguias')
    const lancou = await unidadeComDbv(clube.id, 'Lobos')
    const conselheiro = await criarUsuario({ nome: 'Carla Conselheira' })
    await criarVinculo({ usuarioId: conselheiro.id, clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [pendente.unidade.id] })
    await criarReuniao({ unidadeId: lancou.unidade.id, data: '2026-06-14', chamada: [{ dbvId: lancou.dbv.id }] })
    // Chamada em outra data nao vale para a ultima reuniao.
    await criarReuniao({ unidadeId: pendente.unidade.id, data: '2026-06-07', chamada: [{ dbvId: pendente.dbv.id }] })

    expect(await pendentesDe(clube.id)).toEqual({
      reuniao: '2026-06-14',
      unidades: [{ id: pendente.unidade.id, nome: 'Aguias', conselheiros: ['Carla Conselheira'] }],
    })
  })

  it('reuniao registrada sem nenhuma linha de chamada continua pendente', async () => {
    const clube = await criarClube()
    const { unidade } = await unidadeComDbv(clube.id, 'Aguias')
    await criarReuniao({ unidadeId: unidade.id, data: '2026-06-14', chamada: [] })
    expect(nomes(await pendentesDe(clube.id))).toEqual(['Aguias'])
  })

  it('unidade sem desbravador na data da reuniao nao conta: sem membros, saiu antes ou entrou depois', async () => {
    const clube = await criarClube()
    await criarUnidade({ clubeId: clube.id, nome: 'Vazia' })
    await unidadeComDbv(clube.id, 'Saiu antes', '2026-02-01', '2026-06-10')
    await unidadeComDbv(clube.id, 'Entrou depois', '2026-06-15')
    await unidadeComDbv(clube.id, 'Saiu depois', '2026-02-01', '2026-06-20')
    await unidadeComDbv(clube.id, 'Entrou no dia', '2026-06-14')

    expect(nomes(await pendentesDe(clube.id)).sort()).toEqual(['Entrou no dia', 'Saiu depois'])
  })

  it('hoje e dia de reuniao: a de hoje ainda nao vale, vale a anterior', async () => {
    congelarRelogio('2026-06-14T15:00:00Z')
    const clube = await criarClube()
    const { unidade, dbv } = await unidadeComDbv(clube.id, 'Aguias')
    const outra = await unidadeComDbv(clube.id, 'Lobos')
    await criarReuniao({ unidadeId: outra.unidade.id, data: '2026-06-14', chamada: [{ dbvId: outra.dbv.id }] })
    await criarReuniao({ unidadeId: unidade.id, data: '2026-06-07', chamada: [{ dbvId: dbv.id }] })

    expect(await pendentesDe(clube.id)).toEqual({
      reuniao: '2026-06-07',
      unidades: [expect.objectContaining({ nome: 'Lobos' })],
    })
  })

  it('virada de ano: em janeiro, antes da primeira reuniao do ano, vale a de dezembro', async () => {
    congelarRelogio('2027-01-05T15:00:00Z')
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-12-27', fim: '2027-01-10' })
    await unidadeComDbv(clube.id, 'Aguias')
    const resultado = await pendentesDe(clube.id)
    expect(resultado?.reuniao).toBe('2026-12-20')
    expect(nomes(resultado)).toEqual(['Aguias'])
  })

  it('calendario sem nenhum dia de reuniao nos dois anos: nulo', async () => {
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2025-01-01', fim: '2026-06-14' })
    await unidadeComDbv(clube.id, 'Aguias')
    expect(await pendentesDe(clube.id)).toBeNull()
  })

  it('reuniao extra com Tera reuniao vira a ultima reuniao', async () => {
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-06-13' })
    await unidadeComDbv(clube.id, 'Aguias')
    expect((await pendentesDe(clube.id))?.reuniao).toBe('2026-06-14')
    await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: '2026-06-14' })
    expect((await pendentesDe(clube.id))?.reuniao).toBe('2026-06-13')
  })

  it('devolve todas as pendentes, sem cortar em 5, por nome', async () => {
    const clube = await criarClube()
    for (const letra of ['G', 'F', 'E', 'D', 'C', 'B', 'A']) await unidadeComDbv(clube.id, `Unidade ${letra}`)
    const resultado = await pendentesDe(clube.id)
    expect(nomes(resultado)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letra) => `Unidade ${letra}`))
  })

  it('nao enxerga unidade nem reuniao de outro clube', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    await unidadeComDbv(outro.id, 'So do outro')
    const propria = await unidadeComDbv(clube.id, 'Propria')
    // O outro clube lancar chamada na mesma data nao tira a unidade do clube.
    const doOutro = await unidadeComDbv(outro.id, 'Outra do outro')
    await criarReuniao({ unidadeId: doOutro.unidade.id, data: '2026-06-14', chamada: [{ dbvId: doOutro.dbv.id }] })

    expect(await pendentesDe(clube.id)).toEqual({
      reuniao: '2026-06-14',
      unidades: [expect.objectContaining({ id: propria.unidade.id })],
    })
    expect(nomes(await pendentesDe(outro.id))).toEqual(['So do outro'])
  })
})
