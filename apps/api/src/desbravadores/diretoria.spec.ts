import type { INestApplication } from '@nestjs/common'
import type { DesbravadorSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo, hoje } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Dbv = z.infer<typeof DesbravadorSaida>
type Pagina = { itens: Dbv[]; total: number; pagina: number; porPagina: number }
type Papel = 'ADM' | 'CONSELHEIRO' | 'INSTRUTOR'

const anoDeHoje = (): number => Number(hoje().slice(0, 4))
/** Faz 16 em 30/06 do ano corrente: o último nascimento que entra pela idade. */
const nasceuNoLimite = (): string => `${anoDeHoje() - 16}-06-30`
/** Faz 16 em 01/07: fica fora pela idade neste ano. */
const nasceuDepoisDoLimite = (): string => `${anoDeHoje() - 16}-07-01`
const crianca = (): string => `${anoDeHoje() - 11}-03-10`

describe('diretoria: marca calculada na saida e filtro da lista', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function liderComPapeis(clubeId: string, papeis: { papel: Papel; ativo?: boolean; clubeId?: string }[], nascimento = crianca()) {
    const usuario = await criarUsuario()
    for (const p of papeis) await criarVinculo({ usuarioId: usuario.id, clubeId: p.clubeId ?? clubeId, papel: p.papel, ativo: p.ativo })
    return criarDbv({ clubeId, tipo: 'LIDER', usuarioId: usuario.id, nascimento })
  }

  async function detalhe(id: string, autorizacao: string): Promise<Dbv> {
    return corpo<Dbv>(await api.get(`/api/desbravadores/${id}`, autorizacao).expect(200))
  }

  it('pela idade: 16 em 30/06 entra; 16 em 01/07 fica fora', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const noLimite = await criarDbv({ clubeId: clube.id, nascimento: nasceuNoLimite() })
    const depois = await criarDbv({ clubeId: clube.id, nascimento: nasceuDepoisDoLimite() })

    expect((await detalhe(noLimite.id, adm.autorizacao)).diretoria).toEqual({ membro: true, motivos: ['IDADE'] })
    expect((await detalhe(depois.id, adm.autorizacao)).diretoria).toEqual({ membro: false, motivos: [] })
    const lista = corpo<Pagina>(await api.get('/api/desbravadores', adm.autorizacao).expect(200))
    expect(lista.itens.find((i) => i.id === noLimite.id)?.diretoria).toEqual({ membro: true, motivos: ['IDADE'] })
    expect(lista.itens.find((i) => i.id === depois.id)?.diretoria).toEqual({ membro: false, motivos: [] })
  })

  it('pelo papel: conselheiro e instrutor ativos contam, e os motivos se somam a idade', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conselheiro = await liderComPapeis(clube.id, [{ papel: 'CONSELHEIRO' }])
    const instrutor = await liderComPapeis(clube.id, [{ papel: 'INSTRUTOR' }])
    const tudo = await liderComPapeis(clube.id, [{ papel: 'INSTRUTOR' }, { papel: 'CONSELHEIRO' }], nasceuNoLimite())

    expect((await detalhe(conselheiro.id, adm.autorizacao)).diretoria).toEqual({ membro: true, motivos: ['CONSELHEIRO'] })
    expect((await detalhe(instrutor.id, adm.autorizacao)).diretoria).toEqual({ membro: true, motivos: ['INSTRUTOR'] })
    expect((await detalhe(tudo.id, adm.autorizacao)).diretoria).toEqual({
      membro: true,
      motivos: ['IDADE', 'CONSELHEIRO', 'INSTRUTOR'],
    })
  })

  it('vinculo inativo, papel ADM e vinculo de outro clube nao contam', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const inativo = await liderComPapeis(clube.id, [{ papel: 'CONSELHEIRO', ativo: false }])
    const soAdm = await liderComPapeis(clube.id, [{ papel: 'ADM' }])
    const deOutroClube = await liderComPapeis(clube.id, [{ papel: 'INSTRUTOR', clubeId: outro.id }])

    for (const dbv of [inativo, soAdm, deOutroClube]) {
      expect((await detalhe(dbv.id, adm.autorizacao)).diretoria).toEqual({ membro: false, motivos: [] })
    }
    const fora = corpo<Pagina>(await api.get('/api/desbravadores?diretoria=nao', adm.autorizacao).expect(200))
    expect(fora.itens.map((i) => i.id).sort()).toEqual([inativo.id, soAdm.id, deOutroClube.id].sort())
  })

  it('filtro diretoria=sim|nao conta no banco e pagina sobre o resultado', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const membros = [
      await criarDbv({ clubeId: clube.id, nome: 'A Idade', nascimento: nasceuNoLimite() }),
      await liderComPapeis(clube.id, [{ papel: 'CONSELHEIRO' }]),
      await liderComPapeis(clube.id, [{ papel: 'INSTRUTOR' }]),
    ]
    const foraDela = [
      await criarDbv({ clubeId: clube.id, nascimento: nasceuDepoisDoLimite() }),
      await criarDbv({ clubeId: clube.id }),
    ]
    await criarDbv({ clubeId: outro.id, nascimento: nasceuNoLimite() })
    await liderComPapeis(outro.id, [{ papel: 'CONSELHEIRO' }])

    const p1 = corpo<Pagina>(await api.get('/api/desbravadores?diretoria=sim&porPagina=2&pagina=1', adm.autorizacao).expect(200))
    const p2 = corpo<Pagina>(await api.get('/api/desbravadores?diretoria=sim&porPagina=2&pagina=2', adm.autorizacao).expect(200))
    expect(p1.total).toBe(3)
    expect(p1.itens).toHaveLength(2)
    expect(p2.itens).toHaveLength(1)
    expect([...p1.itens, ...p2.itens].map((i) => i.id).sort()).toEqual(membros.map((m) => m.id).sort())
    expect([...p1.itens, ...p2.itens].every((i) => i.diretoria.membro)).toBe(true)

    const nao = corpo<Pagina>(await api.get('/api/desbravadores?diretoria=nao&porPagina=1', adm.autorizacao).expect(200))
    expect(nao.total).toBe(2)
    expect(nao.itens).toHaveLength(1)
    expect(foraDela.map((f) => f.id)).toContain(nao.itens[0]?.id)

    const todos = corpo<Pagina>(await api.get('/api/desbravadores', adm.autorizacao).expect(200))
    expect(todos.total).toBe(5)
  })

  it('diretoria fora de sim|nao e recusado', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await api.get('/api/desbravadores?diretoria=talvez', adm.autorizacao).expect(400)
  })

  describe('o ano e o do fuso do clube', () => {
    afterEach(() => descongelarRelogio())

    it('01/01 01h UTC: em Sao Paulo ainda e 31/12, em UTC ja e o ano novo', async () => {
      congelarRelogio('2027-01-01T01:00:00Z')
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const fazEmAgosto = await criarDbv({ clubeId: clube.id, nascimento: '2010-08-10' })
      const prisma = prismaDeTeste()

      await prisma.configuracaoClube.update({ where: { clubeId: clube.id }, data: { fuso: 'America/Sao_Paulo' } })
      expect((await detalhe(fazEmAgosto.id, adm.autorizacao)).diretoria.membro).toBe(false)
      await prisma.configuracaoClube.update({ where: { clubeId: clube.id }, data: { fuso: 'UTC' } })
      expect((await detalhe(fazEmAgosto.id, adm.autorizacao)).diretoria.membro).toBe(true)
      const sim = corpo<Pagina>(await api.get('/api/desbravadores?diretoria=sim', adm.autorizacao).expect(200))
      expect(sim.itens.map((i) => i.id)).toEqual([fazEmAgosto.id])
    })
  })
})
