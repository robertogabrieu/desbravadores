import type { INestApplication } from '@nestjs/common'
import type { ClasseDetalheSaida, ClasseSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Classe = z.infer<typeof ClasseSaida>
type Detalhe = z.infer<typeof ClasseDetalheSaida>

describe('classes', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('GET /classes: oficiais + do clube, por ordem, com corToken, ativa e quem monta; qualquer papel logado', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const propria = await criarClasseDoClube(clube.id, 'Classe Propria')
    const alheia = await criarClasseDoClube(outro.id, 'Classe Alheia')
    const pesquisador = await classeOficial('Pesquisador')
    await prismaDeTeste().classeClube.update({
      where: { clubeId_classeId: { clubeId: clube.id, classeId: pesquisador.id } },
      data: { ativa: false, quemMontaCronograma: 'INSTRUTOR' },
    })

    const lista = corpo<Classe[]>(await api.get('/api/classes', instrutor.autorizacao).expect(200))
    const ids = lista.map((c) => c.id)
    expect(ids).toContain(propria.id)
    expect(ids).not.toContain(alheia.id)
    expect(lista.filter((c) => c.origem === 'OFICIAL')).toHaveLength(14)
    expect(lista.map((c) => c.ordem)).toEqual([...lista.map((c) => c.ordem)].sort((a, b) => a - b))

    const porNome = (nome: string, tipo: string): Classe | undefined =>
      lista.find((c) => c.nome.startsWith(nome) && c.tipo === tipo && c.trilha === 'INDIVIDUAL')
    expect(porNome('Amigo', 'REGULAR')).toMatchObject({ corToken: '--classe-amigo', ativa: true, quemMontaCronograma: 'ADM' })
    expect(lista.find((c) => c.tipo === 'AVANCADA' && c.classeBaseId === (lista.find((x) => x.nome === 'Guia')?.id ?? ''))?.corToken).toBe('--classe-guia')
    expect(lista.filter((c) => c.trilha === 'AGRUPADAS').every((c) => c.corToken === '--color-primary')).toBe(true)
    expect(lista.find((c) => c.id === propria.id)).toMatchObject({ corToken: '--color-primary', origem: 'CLUBE', ativa: true })
    expect(lista.find((c) => c.id === pesquisador.id)).toMatchObject({ ativa: false, quemMontaCronograma: 'INSTRUTOR' })
  })

  it('filtra por trilha e por tipo', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const agrupadas = corpo<Classe[]>(await api.get('/api/classes?trilha=AGRUPADAS', adm.autorizacao).expect(200))
    expect(agrupadas.map((c) => [c.nome, c.tipo, c.idade])).toEqual([
      ['Agrupadas (Amigo a Guia)', 'REGULAR', 16],
      ['Agrupadas — avançada', 'AVANCADA', 16],
    ])
    const avancadas = corpo<Classe[]>(await api.get('/api/classes?trilha=INDIVIDUAL&tipo=AVANCADA', adm.autorizacao).expect(200))
    expect(avancadas).toHaveLength(6)
    expect(avancadas.every((c) => c.tipo === 'AVANCADA')).toBe(true)
  })

  it('classe desativada some da lista, mas continua detalhavel por quem ja tinha algo nela', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const retirada = await criarClasseDoClube(clube.id, 'Classe Retirada')
    await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })

    const lista = corpo<Classe[]>(await api.get('/api/classes', adm.autorizacao).expect(200))
    expect(lista.map((c) => c.id)).not.toContain(retirada.id)
    const detalhe = corpo<Detalhe>(await api.get(`/api/classes/${retirada.id}`, adm.autorizacao).expect(200))
    expect(detalhe.nome).toBe('Classe Retirada')
  })

  it('totalRequisitos conta os ativos com o ajuste do clube (sem afetar outros clubes)', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const admOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    const requisito = await prismaDeTeste().requisito.findFirstOrThrow({
      where: { secao: { classeId: amigo.id }, ativo: true }, select: { id: true },
    })
    const total = async (autorizacao: string): Promise<number> => {
      const lista = corpo<Classe[]>(await api.get('/api/classes', autorizacao).expect(200))
      return lista.find((c) => c.id === amigo.id)?.totalRequisitos ?? -1
    }
    expect(await total(adm.autorizacao)).toBe(24)
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: requisito.id, ativo: false } })
    expect(await total(adm.autorizacao)).toBe(23)
    expect(await total(admOutro.autorizacao)).toBe(24)
  })

  it('GET /classes/:id traz secoes e requisitos por ordem, com o ajuste do clube aplicado', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    const requisitos = await prismaDeTeste().requisito.findMany({
      where: { secao: { classeId: amigo.id } }, select: { id: true, campo: true }, orderBy: { ordem: 'asc' }, take: 2,
    })
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: requisitos[0].id, ativo: false } })
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: requisitos[1].id, campo: !requisitos[1].campo } })
    const detalhe = corpo<Detalhe>(await api.get(`/api/classes/${amigo.id}`, adm.autorizacao).expect(200))
    expect(detalhe).toMatchObject({ id: amigo.id, nome: 'Amigo', totalRequisitos: 23 })
    expect(detalhe.secoes.length).toBeGreaterThan(0)
    const todos = detalhe.secoes.flatMap((s) => s.requisitos)
    expect(todos).toHaveLength(24)
    expect(todos.find((r) => r.id === requisitos[0].id)?.ativo).toBe(false)
    expect(todos.find((r) => r.id === requisitos[1].id)).toMatchObject({ ativo: true, campo: !requisitos[1].campo })
    const ordens = detalhe.secoes.map((s) => s.ordem)
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b))
  })

  it('classe de outro clube, id inexistente ou id malformado nao sao encontrados', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const alheia = await criarClasseDoClube(outro.id)
    await api.get(`/api/classes/${alheia.id}`, adm.autorizacao).expect(404)
    await api.get('/api/classes/019a0000-0000-7000-8000-000000000000', adm.autorizacao).expect(404)
    await api.get('/api/classes/nao-e-uuid', adm.autorizacao).expect(400)
  })

  describe('isolamento entre clubes', () => {
    testarIsolamento({
      titulo: 'GET /classes (lista)',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const classe = await criarClasseDoClube(clube.id)
        return { metodo: 'get', caminho: '/api/classes', idsDoOutroClube: [classe.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'GET /classes/:id',
      app: () => app,
      papel: 'INSTRUTOR',
      semear: async (clube) => {
        const classe = await criarClasseDoClube(clube.id)
        return { metodo: 'get', caminho: `/api/classes/${classe.id}` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
