import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { criarBancoIsolado, type BancoIsolado } from '../../test/banco-isolado'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoTipoDaFicha } from '../desbravadores/tipo-da-ficha.service'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { criarClubeBase } from '../scripts/clube-criar'
import { TarefasPeriodicas } from './tarefas.service'

const data = (civil: string): Date => new Date(`${civil}T00:00:00Z`)

/** Banco próprio: a varredura passa por todos os clubes e não pode mexer nas fichas das outras specs. */
describe('tarefas periodicas: varredura do Tipo', () => {
  let banco: BancoIsolado
  let prisma: PrismaService
  let tipo: ServicoTipoDaFicha
  let tarefas: TarefasPeriodicas

  beforeAll(async () => {
    banco = await criarBancoIsolado()
    prisma = new PrismaService(banco.url)
    tipo = new ServicoTipoDaFicha(prisma, new ServicoEscopo(prisma))
    tarefas = new TarefasPeriodicas(banco.prisma, tipo)
  })

  afterAll(async () => {
    tarefas.onModuleDestroy()
    await prisma.$disconnect()
    await banco.encerrar()
  })

  afterEach(() => {
    delete process.env['TAREFAS_PERIODICAS']
    jest.restoreAllMocks()
  })

  async function clubeComUnidade() {
    const sufixo = randomUUID().slice(0, 8)
    const clube = await banco.prisma.$transaction((tx) => criarClubeBase(tx, { nome: `Clube ${sufixo}`, slug: `clube-${sufixo}` }))
    const unidade = await banco.prisma.unidade.create({ data: { clubeId: clube.id, nome: `Unidade ${sufixo}` } })
    return { clube, unidade }
  }

  async function ficha(
    clubeId: string,
    dados: { nascimento: string; tipo?: 'DBV' | 'DIRETORIA' | 'LIDER'; diretoriaPeloAdm?: boolean; unidadeId?: string },
  ) {
    const dbv = await banco.prisma.desbravador.create({
      data: {
        clubeId,
        nome: `Pessoa ${randomUUID().slice(0, 8)}`,
        nomePublico: 'Pessoa',
        tipo: dados.tipo ?? 'DBV',
        diretoriaPeloAdm: dados.diretoriaPeloAdm ?? false,
        diretoriaDesde: dados.tipo === 'DIRETORIA' ? data('2026-02-01') : null,
        nascimento: data(dados.nascimento),
        sexo: 'F',
        entradaEm: data('2026-02-01'),
      },
    })
    if (dados.unidadeId) {
      await banco.prisma.membroUnidade.create({ data: { clubeId, dbvId: dbv.id, unidadeId: dados.unidadeId, inicio: data('2026-02-01') } })
    }
    return dbv
  }

  const lerFicha = (id: string) =>
    banco.prisma.desbravador.findUniqueOrThrow({
      where: { id },
      select: { tipo: true, diretoriaPeloAdm: true, diretoriaDesde: true, membros: { select: { fim: true } } },
    })

  it('virada de ano: quem faz 16 em agosto entra na Diretoria em 1º de janeiro, em todos os clubes, e sai da unidade nesse dia', async () => {
    const a = await clubeComUnidade()
    const b = await clubeComUnidade()
    const naA = await ficha(a.clube.id, { nascimento: '2010-08-10', unidadeId: a.unidade.id })
    const naB = await ficha(b.clube.id, { nascimento: '2010-08-10', unidadeId: b.unidade.id })

    await tarefas.sincronizarTodos('2026-12-31')
    expect((await lerFicha(naA.id)).tipo).toBe('DBV')

    await tarefas.sincronizarTodos('2027-01-01')
    for (const id of [naA.id, naB.id]) {
      expect(await lerFicha(id)).toEqual({
        tipo: 'DIRETORIA',
        diretoriaPeloAdm: false,
        diretoriaDesde: data('2027-01-01'),
        membros: [{ fim: data('2027-01-01') }],
      })
    }

    await tarefas.sincronizarTodos('2027-01-02')
    expect((await lerFicha(naA.id)).diretoriaDesde).toEqual(data('2027-01-01'))
  })

  it('não mexe no Líder nem na Diretoria do Adm; devolve a DBV a Diretoria automática que perdeu a regra', async () => {
    const { clube } = await clubeComUnidade()
    const lider = await ficha(clube.id, { nascimento: '2000-01-01', tipo: 'LIDER' })
    const peloAdm = await ficha(clube.id, { nascimento: '2014-05-10', tipo: 'DIRETORIA', diretoriaPeloAdm: true })
    const semRegra = await ficha(clube.id, { nascimento: '2014-05-10', tipo: 'DIRETORIA' })

    await tarefas.sincronizarTodos('2026-09-30')

    expect((await lerFicha(lider.id)).tipo).toBe('LIDER')
    expect(await lerFicha(peloAdm.id)).toMatchObject({ tipo: 'DIRETORIA', diretoriaPeloAdm: true })
    expect(await lerFicha(semRegra.id)).toMatchObject({ tipo: 'DBV', diretoriaDesde: null })
  })

  it('gravação condicional: se o Adm mudou a ficha depois da leitura, a varredura não sobrescreve', async () => {
    const { clube, unidade } = await clubeComUnidade()
    const dbv = await ficha(clube.id, { nascimento: '2009-03-03', unidadeId: unidade.id })
    const lida = { id: dbv.id, tipo: 'DBV' as const, diretoriaPeloAdm: false, diretoriaDesde: null, nascimento: dbv.nascimento, usuarioId: null, papeis: [] }
    await banco.prisma.desbravador.update({ where: { id: dbv.id }, data: { tipo: 'LIDER' } })

    const gravou = await prisma.$transaction((tx) => tipo.aplicar(tx, clube.id, lida, '2026-09-30'))

    expect(gravou).toBe(false)
    expect(await lerFicha(dbv.id)).toEqual({ tipo: 'LIDER', diretoriaPeloAdm: false, diretoriaDesde: null, membros: [{ fim: null }] })
  })

  it('gravação condicional: nascimento corrigido ou conta trocada depois da leitura não grava a Diretoria velha', async () => {
    const { clube, unidade } = await clubeComUnidade()
    const corrigida = await ficha(clube.id, { nascimento: '2009-03-03', unidadeId: unidade.id })
    const lidaCorrigida = { id: corrigida.id, tipo: 'DBV' as const, diretoriaPeloAdm: false, diretoriaDesde: null, nascimento: corrigida.nascimento, usuarioId: null, papeis: [] }
    await banco.prisma.desbravador.update({ where: { id: corrigida.id }, data: { nascimento: data('2015-03-03') } })
    const outraConta = await ficha(clube.id, { nascimento: '2015-03-03', unidadeId: unidade.id })
    const lidaComConta = { id: outraConta.id, tipo: 'DBV' as const, diretoriaPeloAdm: false, diretoriaDesde: null, nascimento: outraConta.nascimento, usuarioId: randomUUID(), papeis: ['CONSELHEIRO' as const] }

    expect(await prisma.$transaction((tx) => tipo.aplicar(tx, clube.id, lidaCorrigida, '2026-09-30'))).toBe(false)
    expect(await prisma.$transaction((tx) => tipo.aplicar(tx, clube.id, lidaComConta, '2026-09-30'))).toBe(false)

    for (const id of [corrigida.id, outraConta.id]) {
      expect(await lerFicha(id)).toEqual({ tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null, membros: [{ fim: null }] })
    }
  })

  it('erro numa ficha fica no log e a varredura segue com as outras do clube', async () => {
    const { clube, unidade } = await clubeComUnidade()
    const a = await ficha(clube.id, { nascimento: '2009-03-03', unidadeId: unidade.id })
    const b = await ficha(clube.id, { nascimento: '2009-04-04', unidadeId: unidade.id })
    jest.spyOn(tipo, 'aplicar').mockRejectedValueOnce(new Error('falha simulada'))
    const registro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const mudaram = await tipo.sincronizarClube(clube.id, '2026-09-30')

    expect(mudaram).toBe(1)
    const tipos = [(await lerFicha(a.id)).tipo, (await lerFicha(b.id)).tipo].sort()
    expect(tipos).toEqual(['DBV', 'DIRETORIA'])
    expect(registro).toHaveBeenCalledWith(expect.stringContaining('falha simulada'))
  })

  it('trava: duas varreduras ao mesmo tempo no processo rodam uma vez só', async () => {
    await clubeComUnidade()
    const clubes = await banco.prisma.clube.count()
    const porClube = jest.spyOn(tipo, 'sincronizarClube')

    await Promise.all([tarefas.sincronizarTodos('2026-09-30'), tarefas.sincronizarTodos('2026-09-30')])

    expect(porClube).toHaveBeenCalledTimes(clubes)
  })

  it('só liga com TAREFAS_PERIODICAS=1: sem ela, subir não varre nada', () => {
    const varrer = jest.spyOn(tarefas, 'sincronizarTodos').mockResolvedValue()

    tarefas.onModuleInit()
    expect(varrer).not.toHaveBeenCalled()

    process.env['TAREFAS_PERIODICAS'] = '1'
    tarefas.onModuleInit()
    expect(varrer).toHaveBeenCalledTimes(1)
    tarefas.onModuleDestroy()
  })
})
