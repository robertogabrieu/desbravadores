import type { INestApplication } from '@nestjs/common'
import type { MembroSaida, UnidadeSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { anoCorrente, clienteHttp, corpo, hoje } from '../../test/p6'

type Unidade = z.infer<typeof UnidadeSaida>
type Membro = z.infer<typeof MembroSaida>

describe('unidades', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function colocar(clubeId: string, dbvId: string, unidadeId: string): Promise<void> {
    await prismaDeTeste().membroUnidade.create({ data: { clubeId, dbvId, unidadeId, inicio: new Date('2026-02-01') } })
  }

  it('GET /unidades: ADM ve todas ordenadas por nome, com conselheiros e total; ?todas=true inclui inativas', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const zebra = await criarUnidade({ clubeId: clube.id, nome: 'Zebras' })
    const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
    const antiga = await criarUnidade({ clubeId: clube.id, nome: 'Antiga' })
    await prismaDeTeste().unidade.updateMany({ where: { id: antiga.id, clubeId: clube.id }, data: { ativa: false } })
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
    const dbv = await criarDbv({ clubeId: clube.id })
    await colocar(clube.id, dbv.id, aguias.id)

    const lista = corpo<Unidade[]>(await api.get('/api/unidades', adm.autorizacao).expect(200))
    expect(lista.map((u) => u.nome)).toEqual(['Aguias', 'Zebras'])
    expect(lista[0]).toMatchObject({ id: aguias.id, totalMembros: 1, ativa: true })
    expect(lista[0]?.conselheiros).toEqual([{ usuarioId: cons.usuario.id, nome: cons.usuario.nome }])
    expect(lista[1]).toMatchObject({ id: zebra.id, totalMembros: 0, conselheiros: [] })
    const todas = corpo<Unidade[]>(await api.get('/api/unidades?todas=true', adm.autorizacao).expect(200))
    expect(todas.map((u) => u.nome)).toEqual(['Aguias', 'Antiga', 'Zebras'])
  })

  it('GET /unidades: conselheiro so as suas; instrutor recebe lista vazia', async () => {
    const clube = await criarClube()
    const minha = await criarUnidade({ clubeId: clube.id })
    await criarUnidade({ clubeId: clube.id })
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const doConselheiro = corpo<Unidade[]>(await api.get('/api/unidades', cons.autorizacao).expect(200))
    expect(doConselheiro.map((u) => u.id)).toEqual([minha.id])
    expect(corpo<Unidade[]>(await api.get('/api/unidades', instrutor.autorizacao).expect(200))).toEqual([])
  })

  it('GET /unidades/:id/membros: ADM qualquer, conselheiro so as suas (404), instrutor 404; so DBV', async () => {
    const clube = await criarClube()
    const minha = await criarUnidade({ clubeId: clube.id })
    const outra = await criarUnidade({ clubeId: clube.id })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const amigo = await classeOficial('Amigo')
    const dbv = await criarDbv({ clubeId: clube.id, nome: 'Bruno' })
    const outroDbv = await criarDbv({ clubeId: clube.id, nome: 'Alice' })
    await colocar(clube.id, dbv.id, minha.id)
    await colocar(clube.id, outroDbv.id, minha.id)
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })

    const membros = corpo<Membro[]>(await api.get(`/api/unidades/${minha.id}/membros`, cons.autorizacao).expect(200))
    expect(membros.map((m) => m.nome)).toEqual(['Alice', 'Bruno'])
    expect(membros[1]).toMatchObject({ dbvId: dbv.id, desde: '2026-02-01', classeAtual: { nome: 'Amigo' } })
    expect(membros[0]?.classeAtual).toBeNull()
    await api.get(`/api/unidades/${outra.id}/membros`, adm.autorizacao).expect(200)
    const negado = await api.get(`/api/unidades/${outra.id}/membros`, cons.autorizacao).expect(404)
    expect(negado.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    await api.get(`/api/unidades/${minha.id}/membros`, instrutor.autorizacao).expect(404)
  })

  it('GET /unidades/sem-membros: so DBV ativo sem passagem aberta; nao-Adm → 403', async () => {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const solto = await criarDbv({ clubeId: clube.id })
    const alocado = await criarDbv({ clubeId: clube.id })
    const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
    const inativo = await criarDbv({ clubeId: clube.id, ativo: false })
    await colocar(clube.id, alocado.id, unidade.id)
    const lista = corpo<Membro[]>(await api.get('/api/unidades/sem-membros', adm.autorizacao).expect(200))
    const ids = lista.map((m) => m.dbvId)
    expect(ids).toEqual([solto.id])
    expect(ids).not.toEqual(expect.arrayContaining([alocado.id, lider.id, inativo.id]))
    await api.get('/api/unidades/sem-membros', cons.autorizacao).expect(403)
    await api.get('/api/unidades/sem-membros', instrutor.autorizacao).expect(403)
  })

  it('POST /unidades cria com padrao MISTA; nome repetido → 409; conselheiro → 403', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const criada = corpo<Unidade>(
      await api.post('/api/unidades', adm.autorizacao, { nome: 'Leoes', gritoDeGuerra: 'Rugimos!' }).expect(201),
    )
    expect(criada).toMatchObject({ nome: 'Leoes', tipo: 'MISTA', gritoDeGuerra: 'Rugimos!', ativa: true, totalMembros: 0, conselheiros: [] })
    const repetida = await api.post('/api/unidades', adm.autorizacao, { nome: 'Leoes' }).expect(409)
    expect(repetida.body).toMatchObject({ codigo: 'CONFLITO' })
    const outro = await criarClube()
    const admDoOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    const doOutro = corpo<Unidade>(await api.post('/api/unidades', admDoOutro.autorizacao, { nome: 'Leoes' }).expect(201))
    const gravada = await prismaDeTeste().unidade.findFirstOrThrow({ where: { id: doOutro.id, clubeId: outro.id } })
    expect(gravada.nome).toBe('Leoes')
    await api.post('/api/unidades', cons.autorizacao, { nome: 'Outra' }).expect(403)
    await api.post('/api/unidades', adm.autorizacao, { tipo: 'MISTA' }).expect(400)
  })

  it('PATCH /unidades/:id edita; nome de outra unidade → 409; desativar com membros → 422 REGRA; sem membros desativa', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const a = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
    const b = await criarUnidade({ clubeId: clube.id, nome: 'Bravos' })
    const dbv = await criarDbv({ clubeId: clube.id })
    await colocar(clube.id, dbv.id, a.id)

    const editada = corpo<Unidade>(await api.patch(`/api/unidades/${a.id}`, adm.autorizacao, { tipo: 'MASCULINA', gritoDeGuerra: null }).expect(200))
    expect(editada).toMatchObject({ tipo: 'MASCULINA', gritoDeGuerra: null, totalMembros: 1 })
    const conflito = await api.patch(`/api/unidades/${b.id}`, adm.autorizacao, { nome: 'Aguias' }).expect(409)
    expect(conflito.body).toMatchObject({ codigo: 'CONFLITO' })
    const recusa = await api.patch(`/api/unidades/${a.id}`, adm.autorizacao, { ativa: false }).expect(422)
    expect(recusa.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Mova os membros antes de desativar' })
    await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: null, desde: hoje() }).expect(200)
    const desativada = corpo<Unidade>(await api.patch(`/api/unidades/${a.id}`, adm.autorizacao, { ativa: false }).expect(200))
    expect(desativada.ativa).toBe(false)
  })

  describe('isolamento entre clubes', () => {
    testarIsolamento({
      titulo: 'GET /unidades (lista)',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const unidade = await criarUnidade({ clubeId: clube.id })
        return { metodo: 'get', caminho: '/api/unidades?todas=true', idsDoOutroClube: [unidade.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'GET /unidades/:id/membros',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const unidade = await criarUnidade({ clubeId: clube.id })
        return { metodo: 'get', caminho: `/api/unidades/${unidade.id}/membros` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'GET /unidades/sem-membros',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const dbv = await criarDbv({ clubeId: clube.id })
        return { metodo: 'get', caminho: '/api/unidades/sem-membros', idsDoOutroClube: [dbv.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'PATCH /unidades/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Original' })
        return {
          metodo: 'patch',
          caminho: `/api/unidades/${unidade.id}`,
          corpo: { nome: 'Invadida' },
          conferirIntacto: async () => {
            const depois = await prismaDeTeste().unidade.findUniqueOrThrow({ where: { id: unidade.id } })
            expect(depois.nome).toBe('Original')
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
