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

  describe('Diretoria nos meses anteriores à entrada: o ranking não muda com a troca de Tipo', () => {
    const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
    const CRIANCA = '2014-03-10'

    async function retrato(autorizacao: string) {
      const fotos: unknown[] = []
      for (const mes of MESES) {
        const ranking = corpo<Ranking>(await api.get(`/api/ranking?mes=${mes}`, autorizacao))
        const unidades = corpo<Unidades>(await api.get(`/api/ranking/unidades?mes=${mes}`, autorizacao))
        fotos.push({
          mes,
          itens: ranking.itens.map((i) => [i.dbvId, i.unidade?.id ?? null, i.pontos]),
          medias: unidades.map((u) => [u.unidade.id, u.mediaPontos, u.totalDbvs]),
        })
      }
      return fotos
    }

    async function itemDe(autorizacao: string, mes: string, dbvId: string) {
      return corpo<Ranking>(await api.get(`/api/ranking?mes=${mes}`, autorizacao)).itens.find((i) => i.dbvId === dbvId)
    }

    async function trocarTipo(autorizacao: string, dbvId: string, tipo: 'DBV' | 'DIRETORIA' | 'LIDER') {
      await api.patch(`/api/desbravadores/${dbvId}`, autorizacao, { tipo }).expect(200)
    }

    async function moverUnidade(autorizacao: string, dbvId: string, unidadeId: string | null, desde: string) {
      await api.put(`/api/desbravadores/${dbvId}/unidade`, autorizacao, { unidadeId, desde }).expect(200)
    }

    /** Ana fica na unidade A o ano todo e Caio na B; a pessoa observada pontua em fevereiro e em agosto. */
    async function cenario() {
      congelarRelogio('2026-10-05T15:00:00Z')
      const { clube, unidade: unidadeA, adm } = await clubeComUnidade()
      const unidadeB = await criarUnidade({ clubeId: clube.id })
      const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Costa', nascimento: CRIANCA })
      await criarMembro({ dbvId: ana.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      const caio = await criarDbv({ clubeId: clube.id, nome: 'Caio Alves', nascimento: CRIANCA })
      await criarMembro({ dbvId: caio.id, unidadeId: unidadeB.id, inicio: '2026-01-01' })
      const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Trocou', nascimento: CRIANCA })
      await criarLancamento({ clubeId: clube.id, dbvId: ana.id, pontos: 10, data: '2026-02-05' })
      await criarLancamento({ clubeId: clube.id, dbvId: caio.id, pontos: 20, data: '2026-02-05' })
      await criarLancamento({ clubeId: clube.id, dbvId: bia.id, pontos: 30, data: '2026-02-05' })
      await criarLancamento({ clubeId: clube.id, dbvId: bia.id, pontos: 40, data: '2026-08-05' })
      return { clube, adm, unidadeA, unidadeB, ana, caio, bia }
    }

    it('troca simples: aparece na unidade de então em jan-set, com as mesmas médias; do mês da entrada em diante, não', async () => {
      const { adm, unidadeA, unidadeB, bia, caio } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01', fim: '2026-03-20' })
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeB.id, inicio: '2026-07-01' })
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      expect((await itemDe(adm.autorizacao, '2026-02', bia.id))?.unidade?.id).toBe(unidadeB.id)
      const fevereiro = corpo<Unidades>(await api.get(`/api/ranking/unidades?mes=2026-02`, adm.autorizacao))
      expect(fevereiro.find((u) => u.unidade.id === unidadeB.id)).toMatchObject({ mediaPontos: 25, totalDbvs: 2 })
      const daUnidade = corpo<Ranking>(await api.get(`/api/ranking?mes=2026-02&unidadeId=${unidadeB.id}`, adm.autorizacao))
      expect(daUnidade.itens.map((i) => i.dbvId)).toEqual([bia.id, caio.id])
      expect(await itemDe(adm.autorizacao, '2026-10', bia.id)).toBeUndefined()
    })

    it('o mês da entrada já não conta, nem quando ela cai no último dia dele', async () => {
      const { adm, unidadeA, bia } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      congelarRelogio('2026-08-31T15:00:00Z')

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect((await itemDe(adm.autorizacao, '2026-07', bia.id))?.unidade?.id).toBe(unidadeA.id)
      expect(await itemDe(adm.autorizacao, '2026-08', bia.id)).toBeUndefined()
    })

    it('Adm muda a unidade no dia da entrada: vale a que estava aberta na troca de Tipo; tirada no mesmo dia, aparece sem unidade', async () => {
      const { clube, adm, unidadeA, unidadeB, bia } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      const eli = await criarDbv({ clubeId: clube.id, nome: 'Eli Tirado', nascimento: CRIANCA })
      await criarMembro({ dbvId: eli.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      await criarLancamento({ clubeId: clube.id, dbvId: eli.id, pontos: 7, data: '2026-03-05' })
      await moverUnidade(adm.autorizacao, bia.id, unidadeB.id, '2026-10-05')
      await moverUnidade(adm.autorizacao, eli.id, null, '2026-10-05')
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')
      await trocarTipo(adm.autorizacao, eli.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      expect((await itemDe(adm.autorizacao, '2026-02', bia.id))?.unidade?.id).toBe(unidadeB.id)
      expect(await itemDe(adm.autorizacao, '2026-03', eli.id)).toMatchObject({ unidade: null, pontos: 7 })
    })

    it('passagem com início futuro: vale a unidade que a ficha tinha aberta na troca de Tipo', async () => {
      const { adm, unidadeA, unidadeB, bia } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      await moverUnidade(adm.autorizacao, bia.id, unidadeB.id, '2026-10-20')
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      expect((await itemDe(adm.autorizacao, '2026-02', bia.id))?.unidade?.id).toBe(unidadeB.id)
    })

    it('DBV sem unidade continua aparecendo sem unidade depois de entrar na Diretoria', async () => {
      const { adm, bia } = await cenario()
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      expect(await itemDe(adm.autorizacao, '2026-02', bia.id)).toMatchObject({ unidade: null, pontos: 30 })
    })

    it('Líder que passa a Diretoria não aparece em mês nenhum, nem quando tinha sido DBV antes de Líder', async () => {
      const { adm, unidadeA, bia } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      await trocarTipo(adm.autorizacao, bia.id, 'LIDER')
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      for (const mes of MESES) expect(await itemDe(adm.autorizacao, mes, bia.id)).toBeUndefined()
    })

    it('saída e reentrada: vale a última entrada', async () => {
      const { adm, unidadeA, unidadeB, bia } = await cenario()
      await criarMembro({ dbvId: bia.id, unidadeId: unidadeA.id, inicio: '2026-01-01' })
      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')
      await trocarTipo(adm.autorizacao, bia.id, 'DBV')
      expect((await itemDe(adm.autorizacao, '2026-02', bia.id))?.unidade).toBeNull()
      await moverUnidade(adm.autorizacao, bia.id, unidadeB.id, '2026-10-05')
      const antes = await retrato(adm.autorizacao)

      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')

      expect(await retrato(adm.autorizacao)).toEqual(antes)
      expect((await itemDe(adm.autorizacao, '2026-02', bia.id))?.unidade?.id).toBe(unidadeB.id)

      await trocarTipo(adm.autorizacao, bia.id, 'LIDER')
      await trocarTipo(adm.autorizacao, bia.id, 'DIRETORIA')
      expect(await itemDe(adm.autorizacao, '2026-02', bia.id)).toBeUndefined()
    })
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
