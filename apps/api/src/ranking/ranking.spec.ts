import type { INestApplication } from '@nestjs/common'
import type { RankingSaida, RankingUnidadesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarLancamento,
  criarMatricula,
  criarMembro,
  criarReuniao,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Ranking = z.infer<typeof RankingSaida>
type Unidades = z.infer<typeof RankingUnidadesSaida>

const MES = '2026-03'

describe('ranking do mes', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  afterEach(() => descongelarRelogio())

  async function clubeComUnidade() {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    return { clube, unidade, adm }
  }

  async function dbvNaUnidade(clubeId: string, unidadeId: string, nome: string, extra: { ativo?: boolean; tipo?: 'DBV' | 'LIDER' } = {}) {
    const dbv = await criarDbv({ clubeId, nome, ...extra })
    await criarMembro({ dbvId: dbv.id, unidadeId, inicio: '2026-02-01' })
    return dbv
  }

  it('soma so lancamentos ativos do mes civil e ordena por pontos, frequencia (nula por ultimo) e nome', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const eva = await dbvNaUnidade(clube.id, unidade.id, 'Eva Lima')
    const bia = await dbvNaUnidade(clube.id, unidade.id, 'Bia Souza')
    const davi = await dbvNaUnidade(clube.id, unidade.id, 'Davi Rocha')
    const caio = await dbvNaUnidade(clube.id, unidade.id, 'Caio Alves')
    const ana = await dbvNaUnidade(clube.id, unidade.id, 'Ana Costa')
    const zero = await dbvNaUnidade(clube.id, unidade.id, 'Zeca Nunes')

    await criarLancamento({ clubeId: clube.id, dbvId: eva.id, pontos: 40, data: '2026-03-01' })
    await criarLancamento({ clubeId: clube.id, dbvId: eva.id, pontos: -10, data: '2026-03-31' })
    await criarLancamento({ clubeId: clube.id, dbvId: eva.id, pontos: 999, data: '2026-03-10', estornado: true })
    await criarLancamento({ clubeId: clube.id, dbvId: eva.id, pontos: 500, data: '2026-02-28' })
    await criarLancamento({ clubeId: clube.id, dbvId: eva.id, pontos: 500, data: '2026-04-01' })
    for (const dbv of [bia, davi, caio, ana]) {
      await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: '2026-03-15' })
    }

    await criarReuniao({
      unidadeId: unidade.id,
      data: '2026-03-08',
      chamada: [
        { dbvId: bia.id, situacao: 'PRESENTE' },
        { dbvId: caio.id, situacao: 'PRESENTE' },
        { dbvId: davi.id, situacao: 'FALTA' },
      ],
    })
    await criarReuniao({
      unidadeId: unidade.id,
      data: '2026-03-15',
      chamada: [
        { dbvId: bia.id, situacao: 'ATRASADO' },
        { dbvId: caio.id, situacao: 'FALTA' },
        { dbvId: davi.id, situacao: 'PRESENTE' },
      ],
    })
    await criarReuniao({
      unidadeId: unidade.id,
      data: '2026-04-05',
      chamada: [{ dbvId: ana.id, situacao: 'PRESENTE' }],
    })

    const resposta = await api.get(`/api/ranking?mes=${MES}`, adm.autorizacao)

    expect(resposta.status).toBe(200)
    const saida = corpo<Ranking>(resposta)
    expect(saida.mes).toBe(MES)
    expect(saida.itens.map((i) => [i.posicao, i.nome, i.pontos, i.frequencia])).toEqual([
      [1, 'Eva Lima', 30, null],
      [2, 'Bia Souza', 10, 100],
      [3, 'Caio Alves', 10, 50],
      [4, 'Davi Rocha', 10, 50],
      [5, 'Ana Costa', 10, null],
      [6, 'Zeca Nunes', 0, null],
    ])
    expect(saida.itens[0]?.dbvId).toBe(eva.id)
    expect(saida.itens[5]?.dbvId).toBe(zero.id)
    expect(saida.itens[0]?.unidade?.id).toBe(unidade.id)
  })

  it('traz a classe regular do ano corrente e ignora a matricula que nao esta cursando', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const dbv = await dbvNaUnidade(clube.id, unidade.id, 'Com Classe')
    const semClasse = await dbvNaUnidade(clube.id, unidade.id, 'Sem Classe')
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
    await criarMatricula({ clubeId: clube.id, dbvId: semClasse.id, classeId: companheiro.id, anoClube: anoCorrente(), status: 'DESISTIU' })

    const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}`, adm.autorizacao))

    const porNome = new Map(saida.itens.map((i) => [i.nome, i]))
    expect(porNome.get('Com Classe')?.classe).toMatchObject({ id: amigo.id, nome: 'Amigo' })
    expect(porNome.get('Sem Classe')?.classe).toBeNull()
  })

  it('deixa de fora LIDER e inativo, e mostra quem nao pontuou com 0', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const ativo = await dbvNaUnidade(clube.id, unidade.id, 'Ativo Sem Ponto')
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Lider Da Silva', tipo: 'LIDER' })
    const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Inativo Souza', { ativo: false })
    await criarLancamento({ clubeId: clube.id, dbvId: lider.id, pontos: 50, data: '2026-03-02' })
    await criarLancamento({ clubeId: clube.id, dbvId: inativo.id, pontos: 50, data: '2026-03-02' })

    const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}`, adm.autorizacao))

    expect(saida.itens.map((i) => i.dbvId)).toEqual([ativo.id])
    expect(saida.itens[0]?.pontos).toBe(0)
  })

  it('Diretoria conta nos meses antes da entrada, com a unidade de entao; do mes da entrada em diante, nao', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const ana = await dbvNaUnidade(clube.id, unidade.id, 'Ana Costa')
    const dora = await criarDbv({ clubeId: clube.id, nome: 'Dora Diretoria', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: dora.id }, data: { diretoriaDesde: new Date('2026-04-10T00:00:00Z') } })
    await criarMembro({ dbvId: dora.id, unidadeId: unidade.id, inicio: '2026-02-01', fim: '2026-04-10' })
    const entrouEmMarco = await criarDbv({ clubeId: clube.id, nome: 'Eli Marco', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: entrouEmMarco.id }, data: { diretoriaDesde: new Date('2026-03-31T00:00:00Z') } })
    await criarMembro({ dbvId: entrouEmMarco.id, unidadeId: unidade.id, inicio: '2026-02-01', fim: '2026-03-31' })
    await criarLancamento({ clubeId: clube.id, dbvId: ana.id, pontos: 10, data: '2026-03-05' })
    await criarLancamento({ clubeId: clube.id, dbvId: dora.id, pontos: 30, data: '2026-03-05' })
    await criarLancamento({ clubeId: clube.id, dbvId: entrouEmMarco.id, pontos: 99, data: '2026-03-05' })

    const marco = corpo<Ranking>(await api.get(`/api/ranking?mes=2026-03`, adm.autorizacao))
    expect(marco.itens.map((i) => [i.dbvId, i.unidade?.id])).toEqual([
      [dora.id, unidade.id],
      [ana.id, unidade.id],
    ])
    const daUnidade = corpo<Ranking>(await api.get(`/api/ranking?mes=2026-03&unidadeId=${unidade.id}`, adm.autorizacao))
    expect(daUnidade.itens.map((i) => i.dbvId)).toEqual([dora.id, ana.id])
    const unidades = corpo<Unidades>(await api.get(`/api/ranking/unidades?mes=2026-03`, adm.autorizacao))
    expect(unidades.map((u) => [u.unidade.id, u.mediaPontos, u.totalDbvs])).toEqual([[unidade.id, 20, 2]])

    const abril = corpo<Ranking>(await api.get(`/api/ranking?mes=2026-04`, adm.autorizacao))
    expect(abril.itens.map((i) => i.dbvId)).toEqual([ana.id])
  })

  it('Lider que vira Diretoria nao aparece nos meses passados, nem com uma unidade antiga que terminou antes', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const ana = await dbvNaUnidade(clube.id, unidade.id, 'Ana Costa')
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Lia Lider', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: lider.id }, data: { diretoriaDesde: new Date('2026-04-10T00:00:00Z') } })
    const exDbv = await criarDbv({ clubeId: clube.id, nome: 'Rui Antigo', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: exDbv.id }, data: { diretoriaDesde: new Date('2026-04-10T00:00:00Z') } })
    await criarMembro({ dbvId: exDbv.id, unidadeId: unidade.id, inicio: '2026-01-01', fim: '2026-02-15' })
    await criarLancamento({ clubeId: clube.id, dbvId: exDbv.id, pontos: 5, data: '2026-02-05' })

    for (const mes of ['2026-02', '2026-03']) {
      const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${mes}`, adm.autorizacao))
      expect(saida.itens.map((i) => i.dbvId)).toEqual([ana.id])
    }
    const unidades = corpo<Unidades>(await api.get(`/api/ranking/unidades?mes=2026-03`, adm.autorizacao))
    expect(unidades.map((u) => [u.unidade.id, u.totalDbvs])).toEqual([[unidade.id, 1]])
  })

  it('saiu e voltou a Diretoria: so os meses da unidade que terminou na reentrada contam', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const outra = await criarUnidade({ clubeId: clube.id })
    const volta = await criarDbv({ clubeId: clube.id, nome: 'Vera Volta', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: volta.id }, data: { diretoriaDesde: new Date('2026-05-05T00:00:00Z') } })
    await criarMembro({ dbvId: volta.id, unidadeId: unidade.id, inicio: '2026-01-01', fim: '2026-02-10' })
    await criarMembro({ dbvId: volta.id, unidadeId: outra.id, inicio: '2026-03-20', fim: '2026-05-05' })
    const semUnidade = await criarDbv({ clubeId: clube.id, nome: 'Sem Volta', tipo: 'DIRETORIA' })
    await prismaDeTeste().desbravador.update({ where: { id: semUnidade.id }, data: { diretoriaDesde: new Date('2026-05-05T00:00:00Z') } })
    await criarMembro({ dbvId: semUnidade.id, unidadeId: unidade.id, inicio: '2026-01-01', fim: '2026-02-10' })

    const doMes = async (mes: string) =>
      corpo<Ranking>(await api.get(`/api/ranking?mes=${mes}`, adm.autorizacao)).itens.map((i) => [i.dbvId, i.unidade?.id])
    expect(await doMes('2026-01')).toEqual([])
    expect(await doMes('2026-02')).toEqual([])
    expect(await doMes('2026-03')).toEqual([[volta.id, outra.id]])
    expect(await doMes('2026-04')).toEqual([[volta.id, outra.id]])
    expect(await doMes('2026-05')).toEqual([])
  })

  it('sem mes, usa o mes corrente no fuso do clube (02:00 UTC de 1o de maio ainda e abril)', async () => {
    congelarRelogio('2026-05-01T02:00:00Z')
    const { clube, unidade, adm } = await clubeComUnidade()
    const dbv = await dbvNaUnidade(clube.id, unidade.id, 'Mes Corrente')
    await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 7, data: '2026-04-30' })
    await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 100, data: '2026-05-01' })

    const saida = corpo<Ranking>(await api.get('/api/ranking', adm.autorizacao))

    expect(saida.mes).toBe('2026-04')
    expect(saida.itens[0]?.pontos).toBe(7)
  })

  it('filtra por unidade pelos membros atuais e reposiciona dentro do filtro', async () => {
    const { clube, unidade, adm } = await clubeComUnidade()
    const outra = await criarUnidade({ clubeId: clube.id })
    const a = await dbvNaUnidade(clube.id, unidade.id, 'Alfa Um')
    const b = await dbvNaUnidade(clube.id, unidade.id, 'Beta Dois')
    const deOutra = await dbvNaUnidade(clube.id, outra.id, 'Gama Tres')
    const quePassou = await criarDbv({ clubeId: clube.id, nome: 'Delta Quatro' })
    await criarMembro({ dbvId: quePassou.id, unidadeId: unidade.id, inicio: '2026-01-01', fim: '2026-02-15' })
    await criarMembro({ dbvId: quePassou.id, unidadeId: outra.id, inicio: '2026-02-15' })
    await criarLancamento({ clubeId: clube.id, dbvId: deOutra.id, pontos: 99, data: '2026-03-02' })
    await criarLancamento({ clubeId: clube.id, dbvId: quePassou.id, pontos: 98, data: '2026-03-02' })
    await criarLancamento({ clubeId: clube.id, dbvId: b.id, pontos: 5, data: '2026-03-02' })

    const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}&unidadeId=${unidade.id}`, adm.autorizacao))

    expect(saida.itens.map((i) => [i.posicao, i.dbvId])).toEqual([
      [1, b.id],
      [2, a.id],
    ])
  })

  it('unidade de outro clube no filtro responde 404', async () => {
    const { adm } = await clubeComUnidade()
    const outroClube = await criarClube()
    const unidadeDeFora = await criarUnidade({ clubeId: outroClube.id })

    const resposta = await api.get(`/api/ranking?mes=${MES}&unidadeId=${unidadeDeFora.id}`, adm.autorizacao)

    expect(resposta.status).toBe(404)
  })

  it('mes malformado e recusado', async () => {
    const { adm } = await clubeComUnidade()
    expect((await api.get('/api/ranking?mes=2026-13', adm.autorizacao)).status).toBe(400)
  })

  it('sem login, 401', async () => {
    expect((await api.get('/api/ranking', '')).status).toBe(401)
  })

  describe('privacidade: nome e frequencia so no escopo de quem pede', () => {
    async function cenario() {
      const clube = await criarClube()
      const minha = await criarUnidade({ clubeId: clube.id })
      const alheia = await criarUnidade({ clubeId: clube.id })
      const meuDbv = await dbvNaUnidade(clube.id, minha.id, 'Maria Cristina Souza')
      const dbvAlheio = await dbvNaUnidade(clube.id, alheia.id, 'Joao Pedro Lima')
      for (const dbv of [meuDbv, dbvAlheio]) {
        await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: '2026-03-02' })
      }
      await criarReuniao({
        unidadeId: minha.id,
        data: '2026-03-08',
        chamada: [{ dbvId: meuDbv.id, situacao: 'PRESENTE' }],
      })
      await criarReuniao({
        unidadeId: alheia.id,
        data: '2026-03-08',
        chamada: [{ dbvId: dbvAlheio.id, situacao: 'PRESENTE' }],
      })
      return { clube, minha, alheia, meuDbv, dbvAlheio }
    }

    const resumo = (saida: Ranking, id: string) => {
      const item = saida.itens.find((i) => i.dbvId === id)
      return item && { nome: item.nome, frequencia: item.frequencia, abrePerfil: item.abrePerfil }
    }

    it('ADM ve tudo', async () => {
      const { clube, meuDbv, dbvAlheio } = await cenario()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

      const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}`, adm.autorizacao))

      expect(resumo(saida, meuDbv.id)).toEqual({ nome: 'Maria Cristina Souza', frequencia: 100, abrePerfil: true })
      expect(resumo(saida, dbvAlheio.id)).toEqual({ nome: 'Joao Pedro Lima', frequencia: 100, abrePerfil: true })
    })

    it('conselheiro ve completo so os da sua unidade; os demais so pelo nome publico', async () => {
      const { clube, minha, meuDbv, dbvAlheio } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })

      const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}`, conselheiro.autorizacao))

      expect(resumo(saida, meuDbv.id)).toEqual({ nome: 'Maria Cristina Souza', frequencia: 100, abrePerfil: true })
      expect(resumo(saida, dbvAlheio.id)).toEqual({ nome: 'Joao', frequencia: null, abrePerfil: false })
    })

    it('instrutor ve completo so os matriculados nas suas classes no ano', async () => {
      const { clube, meuDbv, dbvAlheio } = await cenario()
      const amigo = await classeOficial('Amigo')
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      await criarMatricula({ clubeId: clube.id, dbvId: meuDbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: dbvAlheio.id, classeId: amigo.id, anoClube: anoCorrente() - 1 })

      const saida = corpo<Ranking>(await api.get(`/api/ranking?mes=${MES}`, instrutor.autorizacao))

      expect(resumo(saida, meuDbv.id)).toEqual({ nome: 'Maria Cristina Souza', frequencia: 100, abrePerfil: true })
      expect(resumo(saida, dbvAlheio.id)).toEqual({ nome: 'Joao', frequencia: null, abrePerfil: false })
    })
  })

  describe('ranking das unidades', () => {
    it('ordena pela media de pontos por DBV ativo membro atual e deixa fora a unidade sem DBV', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const u1 = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
      const u2 = await criarUnidade({ clubeId: clube.id, nome: 'Bravos' })
      await criarUnidade({ clubeId: clube.id, nome: 'Vazia' })
      const soInativos = await criarUnidade({ clubeId: clube.id, nome: 'So Inativos' })
      const a = await dbvNaUnidade(clube.id, u1.id, 'Um A')
      const b = await dbvNaUnidade(clube.id, u1.id, 'Um B')
      const c = await dbvNaUnidade(clube.id, u2.id, 'Dois C')
      const inativo = await dbvNaUnidade(clube.id, soInativos.id, 'Inativo D', { ativo: false })
      const ex = await criarDbv({ clubeId: clube.id, nome: 'Ex Membro' })
      await criarMembro({ dbvId: ex.id, unidadeId: u1.id, inicio: '2026-01-01', fim: '2026-02-01' })
      await criarLancamento({ clubeId: clube.id, dbvId: a.id, pontos: 10, data: '2026-03-02' })
      await criarLancamento({ clubeId: clube.id, dbvId: b.id, pontos: 21, data: '2026-03-03' })
      await criarLancamento({ clubeId: clube.id, dbvId: c.id, pontos: 20, data: '2026-03-02' })
      await criarLancamento({ clubeId: clube.id, dbvId: inativo.id, pontos: 500, data: '2026-03-02' })
      await criarLancamento({ clubeId: clube.id, dbvId: ex.id, pontos: 500, data: '2026-03-02' })
      await criarLancamento({ clubeId: clube.id, dbvId: a.id, pontos: 500, data: '2026-04-02' })

      const resposta = await api.get(`/api/ranking/unidades?mes=${MES}`, adm.autorizacao)

      expect(resposta.status).toBe(200)
      const saida = corpo<Unidades>(resposta)
      expect(saida.map((u) => [u.posicao, u.unidade.id, u.mediaPontos, u.totalDbvs])).toEqual([
        [1, u2.id, 20, 1],
        [2, u1.id, 15.5, 2],
      ])
    })

    it('qualquer papel logado consulta; instrutor tambem', async () => {
      const clube = await criarClube()
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })

      const resposta = await api.get(`/api/ranking/unidades?mes=${MES}`, instrutor.autorizacao)

      expect(resposta.status).toBe(200)
      expect(resposta.body).toEqual([])
    })
  })
})
