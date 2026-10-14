import type { INestApplication } from '@nestjs/common'
import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import {
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarEdicaoCB,
  criarEncontroCB,
  criarGrupoCB,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral: chamadas da Classe Biblica', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 15/06/2026; a janela vai de 08/06 a 15/06.
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  async function paresDe(clubeId: string): Promise<Visao['chamadasClasseBiblica']> {
    const adm = await criarAcesso({ clubeId, papel: 'ADM' })
    return corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).chamadasClasseBiblica
  }

  it('sem encontro na janela: lista vazia', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Grupo A' })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-07' })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-16' })
    expect(await paresDe(clube.id)).toEqual([])
  })

  it('par sem chamada aparece (grupo sem desbravadores conta) e o com chamada registrada nao', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    const comChamada = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Alfa' })
    const semChamada = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Beta' })
    const encontro = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14' })
    await criarChamadaCB({ clubeId: clube.id, encontroId: encontro.id, grupoId: comChamada.id, linhas: [] })

    expect(await paresDe(clube.id)).toEqual([{ encontroId: encontro.id, data: '2026-06-14', grupoId: semChamada.id, grupoNome: 'Beta' }])
  })

  it('limites da janela: hoje e 7 dias atras entram, 8 dias atras nao', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    const grupo = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Alfa' })
    const hoje = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-15' })
    const limite = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-08' })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-07' })

    expect((await paresDe(clube.id)).map((par) => [par.encontroId, par.grupoId])).toEqual([
      [hoje.id, grupo.id],
      [limite.id, grupo.id],
    ])
  })

  it('ordem: encontro mais recente primeiro, depois o nome do grupo', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Zeta' })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Alfa' })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-09' })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14' })

    expect((await paresDe(clube.id)).map((par) => `${par.data} ${par.grupoNome}`)).toEqual([
      '2026-06-14 Alfa',
      '2026-06-14 Zeta',
      '2026-06-09 Alfa',
      '2026-06-09 Zeta',
    ])
  })

  it('encontro cancelado nao entra', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [] })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14', cancelado: true })
    expect(await paresDe(clube.id)).toEqual([])
  })

  it('edicao nao terminada nao entra', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: false })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [] })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14' })
    expect(await paresDe(clube.id)).toEqual([])
  })

  it('grupo removido nao entra, mesmo com o encontro valido', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    const removido = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Removido' })
    const ativo = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Ativo' })
    await prismaDeTeste().grupoClasseBiblica.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
    await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14' })
    expect((await paresDe(clube.id)).map((par) => par.grupoId)).toEqual([ativo.id])
  })

  it('encontro remarcado vale pela data nova: remarcado para fora da janela some, para dentro entra', async () => {
    const clube = await criarClube()
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, unidadeIds: [] })
    const paraFora = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-06-14' })
    const paraDentro = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-05-01' })
    await prismaDeTeste().encontroClasseBiblica.update({ where: { id: paraFora.id }, data: { data: new Date('2026-06-21T00:00:00Z'), dataOriginal: new Date('2026-06-14T00:00:00Z') } })
    await prismaDeTeste().encontroClasseBiblica.update({ where: { id: paraDentro.id }, data: { data: new Date('2026-06-12T00:00:00Z'), dataOriginal: new Date('2026-05-01T00:00:00Z') } })

    expect((await paresDe(clube.id)).map((par) => [par.encontroId, par.data])).toEqual([[paraDentro.id, '2026-06-12']])
  })

  it('nao enxerga pares de outro clube', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const edicaoOutro = await criarEdicaoCB({ clubeId: outro.id, terminada: true })
    await criarGrupoCB({ clubeId: outro.id, edicaoId: edicaoOutro.id, unidadeIds: [] })
    await criarEncontroCB({ clubeId: outro.id, edicaoId: edicaoOutro.id, data: '2026-06-14' })
    expect(await paresDe(clube.id)).toEqual([])
    expect(await paresDe(outro.id)).toHaveLength(1)
  })
})
