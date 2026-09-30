import type { INestApplication } from '@nestjs/common'
import type { PerfilDbvSaida } from '@desbravadores/shared'
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
import { ajustarPermissao, anoCorrente, clienteHttp, corpo, hoje } from '../../test/p6'

type Perfil = z.infer<typeof PerfilDbvSaida>

describe('perfil do desbravador', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const dbv = await criarDbv({ clubeId: clube.id, nome: 'Maria Cristina Souza' })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    return { clube, unidade, dbv }
  }

  const perfilDe = (id: string) => `/api/desbravadores/${id}/perfil`

  it('devolve o desbravador, a classe atual e a avancada, posicao, pontos e frequencia do mes', async () => {
    const { clube, unidade, dbv } = await cenario()
    const colega = await criarDbv({ clubeId: clube.id, nome: 'Colega Mais Pontos' })
    await criarMembro({ dbvId: colega.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    const avancada = await prismaDeTeste().classe.findFirstOrThrow({
      where: { tipo: 'AVANCADA', clubeId: null, classeBase: { nome: 'Amigo' } },
    })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: avancada.id, anoClube: anoCorrente() })
    await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 12, data: hoje() })
    await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 900, data: hoje(), estornado: true })
    await criarLancamento({ clubeId: clube.id, dbvId: colega.id, pontos: 30, data: hoje() })
    await criarReuniao({ unidadeId: unidade.id, data: hoje(), chamada: [{ dbvId: dbv.id, situacao: 'FALTA' }] })

    const resposta = await api.get(perfilDe(dbv.id), adm.autorizacao)

    expect(resposta.status).toBe(200)
    const perfil = corpo<Perfil>(resposta)
    expect(perfil.dbv).toMatchObject({ id: dbv.id, nome: 'Maria Cristina Souza', unidade: { id: unidade.id } })
    expect(perfil.dbv.classeAtual).toMatchObject({ id: amigo.id, nome: 'Amigo' })
    expect(perfil.dbv.avancadaAtual).toMatchObject({ id: avancada.id })
    expect(perfil.mes).toBe(hoje().slice(0, 7))
    expect(perfil.pontosMes).toBe(12)
    expect(perfil.posicaoMes).toBe(2)
    expect(perfil.frequenciaMes).toBe(0)
  })

  it('sem lancamento nem chamada no mes: 0 ponto, frequencia nula', async () => {
    const { clube, dbv } = await cenario()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    const perfil = corpo<Perfil>(await api.get(perfilDe(dbv.id), adm.autorizacao))

    expect(perfil).toMatchObject({ pontosMes: 0, frequenciaMes: null, posicaoMes: 1, classesInvestidas: [] })
  })

  it('lista as classes investidas com o ano do clube e ignora as que ainda cursa', async () => {
    const { clube, dbv } = await cenario()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: 2024, status: 'INVESTIDA' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: companheiro.id, anoClube: anoCorrente() })

    const perfil = corpo<Perfil>(await api.get(perfilDe(dbv.id), adm.autorizacao))

    expect(perfil.classesInvestidas.map((c) => [c.classe.id, c.anoClube])).toEqual([[amigo.id, 2024]])
  })

  it('desbravador inativo abre, mas sem posicao no ranking', async () => {
    const clube = await criarClube()
    const dbv = await criarDbv({ clubeId: clube.id, ativo: false })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 5, data: hoje() })

    const perfil = corpo<Perfil>(await api.get(perfilDe(dbv.id), adm.autorizacao))

    expect(perfil).toMatchObject({ posicaoMes: null, pontosMes: 5 })
  })

  describe('contato do responsavel', () => {
    async function comResponsavel() {
      const dados = await cenario()
      await prismaDeTeste().desbravador.update({
        where: { id: dados.dbv.id },
        data: { responsavelNome: 'Dona Rosa', responsavelTelefone: '11999990000' },
      })
      return dados
    }

    it('vem para quem tem dbv.ver_contato', async () => {
      const { clube, unidade, dbv } = await comResponsavel()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })

      const perfil = corpo<Perfil>(await api.get(perfilDe(dbv.id), conselheiro.autorizacao))

      expect(perfil.dbv.contato).toMatchObject({ responsavelNome: 'Dona Rosa', responsavelTelefone: '11999990000' })
    })

    it('nao vem para quem nao tem a permissao (a chave some)', async () => {
      const { clube, unidade, dbv } = await comResponsavel()
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [(await classeOficial('Amigo')).id] })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: (await classeOficial('Amigo')).id, anoClube: anoCorrente() })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await ajustarPermissao(conselheiro.vinculo.id, 'dbv.ver_contato', false)

      const doInstrutor = corpo<Perfil>(await api.get(perfilDe(dbv.id), instrutor.autorizacao))
      const doConselheiro = corpo<Perfil>(await api.get(perfilDe(dbv.id), conselheiro.autorizacao))

      expect(doInstrutor.dbv).not.toHaveProperty('contato')
      expect(doConselheiro.dbv).not.toHaveProperty('contato')
    })
  })

  describe('escopo (fora dele: 404)', () => {
    it('conselheiro abre o DBV da sua unidade e nao o de outra', async () => {
      const { clube, unidade, dbv } = await cenario()
      const outra = await criarUnidade({ clubeId: clube.id })
      const deOutra = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: deOutra.id, unidadeId: outra.id, inicio: '2026-02-01' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })

      expect((await api.get(perfilDe(dbv.id), conselheiro.autorizacao)).status).toBe(200)
      const fora = await api.get(perfilDe(deOutra.id), conselheiro.autorizacao)
      expect(fora.status).toBe(404)
      expect(fora.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    })

    it('instrutor abre o matriculado nas suas classes neste ano; matricula de ano passado ou de outra classe nao vale', async () => {
      const { clube, dbv } = await cenario()
      const amigo = await classeOficial('Amigo')
      const companheiro = await classeOficial('Companheiro')
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const antigo = await criarDbv({ clubeId: clube.id })
      const deOutraClasse = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: antigo.id, classeId: amigo.id, anoClube: anoCorrente() - 1 })
      await criarMatricula({ clubeId: clube.id, dbvId: deOutraClasse.id, classeId: companheiro.id, anoClube: anoCorrente() })

      expect((await api.get(perfilDe(dbv.id), instrutor.autorizacao)).status).toBe(200)
      expect((await api.get(perfilDe(antigo.id), instrutor.autorizacao)).status).toBe(404)
      expect((await api.get(perfilDe(deOutraClasse.id), instrutor.autorizacao)).status).toBe(404)
    })

    it('sem dbv.ver: 403; id inexistente: 404; id malformado: 400', async () => {
      const { clube, unidade, dbv } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await ajustarPermissao(conselheiro.vinculo.id, 'dbv.ver', false)

      expect((await api.get(perfilDe(dbv.id), conselheiro.autorizacao)).status).toBe(403)
      expect((await api.get(perfilDe('00000000-0000-4000-8000-000000000000'), adm.autorizacao)).status).toBe(404)
      expect((await api.get(perfilDe('nao-e-uuid'), adm.autorizacao)).status).toBe(400)
    })
  })
})
