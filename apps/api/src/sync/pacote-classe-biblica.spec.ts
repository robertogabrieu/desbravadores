import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarDbv,
  criarEdicaoCB,
  criarEncontroCB,
  criarGrupoCB,
  criarMatricula,
  criarMembro,
  criarUnidade,
  desconectarPrismaDeTeste,
} from '../../test/fabricas'
import { ajustarPermissao, anoCorrente, clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Pacote = z.infer<typeof PacoteSaida>

const DIA = 86_400_000

function dia(deslocamento: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() + deslocamento * DIA))
}

describe('GET /api/sync/pacote: classe bíblica', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function baixar(autorizacao: string): Promise<Pacote> {
    const resposta = await api.get('/api/sync/pacote', autorizacao)
    expect(resposta.status).toBe(200)
    return PacoteSaida.parse(corpo<unknown>(resposta))
  }

  /**
   * Daniel (Águias e Leões) e Ester (Gaviões) numa edição terminada; Ana em Águias, Rui saiu de Águias ontem,
   * Caio em Leões, Duda em Gaviões. Encontros em hoje−8, −7, 0, +3 (cancelado), +7 e +8; rascunho com encontro hoje.
   */
  async function cenario() {
    const clube = await criarClube()
    const c = clube.id
    const adm = await criarAcesso({ clubeId: c, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: c, nome: 'Águias' })
    const leoes = await criarUnidade({ clubeId: c, nome: 'Leões' })
    const gavioes = await criarUnidade({ clubeId: c, nome: 'Gaviões' })
    const edicao = await criarEdicaoCB({ clubeId: c, terminada: true, nome: 'CB', inicio: dia(-60), fim: dia(60) })
    const daniel = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id, leoes.id] })
    const ester = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [gavioes.id] })
    const membro = async (nome: string, unidadeId: string, fim?: string) => {
      const dbv = await criarDbv({ clubeId: c, nome })
      await criarMembro({ dbvId: dbv.id, unidadeId, inicio: dia(-90), ...(fim ? { fim } : {}) })
      return dbv
    }
    const ana = await membro('Ana Lima', aguias.id)
    const rui = await membro('Rui Paz', aguias.id, dia(-1))
    const caio = await membro('Caio Reis', leoes.id)
    const duda = await membro('Duda Melo', gavioes.id)
    const encontro = (data: string, cancelado = false) => criarEncontroCB({ clubeId: c, edicaoId: edicao.id, data, cancelado })
    await encontro(dia(-8))
    const passado = await encontro(dia(-7))
    const deHoje = await encontro(dia(0))
    await encontro(dia(3), true)
    const proximo = await encontro(dia(7))
    await encontro(dia(8))
    const rascunho = await criarEdicaoCB({ clubeId: c, inicio: dia(-60), fim: dia(60) })
    await criarEncontroCB({ clubeId: c, edicaoId: rascunho.id, data: dia(0) })
    await criarChamadaCB({ clubeId: c, encontroId: passado.id, grupoId: daniel.id, linhas: [
      { dbvId: ana.id, unidadeId: aguias.id, participou: true },
      { dbvId: caio.id, unidadeId: leoes.id, presente: false },
    ] })
    await criarChamadaCB({ clubeId: c, encontroId: passado.id, grupoId: ester.id, linhas: [{ dbvId: duda.id, unidadeId: gavioes.id }] })
    return { clube, adm, aguias, leoes, gavioes, edicao, daniel, ester, ana, rui, caio, duda, passado, deHoje, proximo }
  }

  it('Adm leva os encontros não cancelados de hoje−7 a hoje+7, os grupos, os membros com início e fim e as presenças', async () => {
    const { adm, edicao, daniel, ester, aguias, leoes, gavioes, ana, rui, caio, duda, passado, deHoje, proximo } = await cenario()
    const cb = (await baixar(adm.autorizacao)).classeBiblica
    expect(cb?.encontros.map((e) => e.id)).toEqual([passado.id, deHoje.id, proximo.id])
    expect(cb?.encontros[0]).toEqual({
      id: passado.id, edicaoId: edicao.id, edicaoNome: 'CB', data: dia(-7), horario: '14:00', local: 'Sala 3 da igreja', dataOriginal: null,
    })
    expect(cb?.grupos.map((g) => [g.id, g.nome, g.encontroIds])).toEqual([
      [daniel.id, 'Daniel', [passado.id, deHoje.id, proximo.id]],
      [ester.id, 'Ester', [passado.id, deHoje.id, proximo.id]],
    ])
    expect(cb?.grupos[0]?.unidades).toEqual([
      { id: aguias.id, nome: 'Águias', membros: [
        { dbvId: ana.id, nome: 'Ana Lima', inicio: dia(-90), fim: null },
        { dbvId: rui.id, nome: 'Rui Paz', inicio: dia(-90), fim: dia(-1) },
      ] },
      { id: leoes.id, nome: 'Leões', membros: [{ dbvId: caio.id, nome: 'Caio Reis', inicio: dia(-90), fim: null }] },
    ])
    expect(cb?.grupos[1]?.unidades.map((u) => u.id)).toEqual([gavioes.id])
    expect(cb?.presencas).toHaveLength(3)
    expect(cb?.presencas).toEqual(expect.arrayContaining([
      expect.objectContaining({ encontroId: passado.id, dbvId: ana.id, presente: true, participou: true }),
      expect.objectContaining({ encontroId: passado.id, dbvId: caio.id, presente: false, participou: false }),
      expect.objectContaining({ encontroId: passado.id, dbvId: duda.id, presente: true }),
    ]))
    expect(cb?.presencas.every((p) => typeof p.versao === 'string')).toBe(true)
    expect(cb?.chamadasRegistradas).toEqual(
      expect.arrayContaining([{ encontroId: passado.id, grupoId: daniel.id }, { encontroId: passado.id, grupoId: ester.id }]),
    )
    expect(cb?.chamadasRegistradas).toHaveLength(2)
  })

  it('Conselheiro sem a permissão recebe null; com ela, só os grupos e desbravadores das unidades dele', async () => {
    const { clube, aguias, daniel, ana, passado } = await cenario()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
    expect((await baixar(conselheiro.autorizacao)).classeBiblica).toBeNull()
    await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)
    const cb = (await baixar(conselheiro.autorizacao)).classeBiblica
    expect(cb?.grupos.map((g) => g.id)).toEqual([daniel.id])
    expect(cb?.grupos[0]?.unidades).toEqual([
      { id: aguias.id, nome: 'Águias', membros: [{ dbvId: ana.id, nome: 'Ana Lima', inicio: dia(-90), fim: null }] },
    ])
    expect(cb?.presencas.map((p) => p.dbvId)).toEqual([ana.id])
    expect(cb?.chamadasRegistradas).toEqual([{ encontroId: passado.id, grupoId: daniel.id }])
  })

  it('Instrutor com a permissão leva só os CURSANDO numa classe dele', async () => {
    const { clube, daniel, ana, caio } = await cenario()
    const classe = await criarClasseDoClube(clube.id)
    await criarMatricula({ clubeId: clube.id, dbvId: caio.id, classeId: classe.id, anoClube: anoCorrente() })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    expect((await baixar(instrutor.autorizacao)).classeBiblica).toBeNull()
    await ajustarPermissao(instrutor.vinculo.id, 'classebiblica.chamada', true)
    const cb = (await baixar(instrutor.autorizacao)).classeBiblica
    expect(cb?.grupos.map((g) => g.id)).toEqual([daniel.id])
    expect(cb?.grupos[0]?.unidades.flatMap((u) => u.membros.map((m) => m.dbvId))).toEqual([caio.id])
    expect(cb?.presencas.map((p) => p.dbvId)).toEqual([caio.id])
    void ana
  })

  it('nada de outro clube entra no pacote', async () => {
    await cenario()
    const outro = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
    expect((await baixar(outro.autorizacao)).classeBiblica).toEqual({ encontros: [], grupos: [], presencas: [], chamadasRegistradas: [] })
  })
})
