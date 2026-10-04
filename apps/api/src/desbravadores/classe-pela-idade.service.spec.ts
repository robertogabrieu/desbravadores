import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { criarBancoIsolado, type BancoIsolado } from '../../test/banco-isolado'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { StatusMatricula, TipoPessoa } from '../generated/prisma/client.js'
import { criarClubeBase } from '../scripts/clube-criar'
import { ServicoClassePelaIdade } from './classe-pela-idade.service'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'
import { ServicoTipoDaFicha } from './tipo-da-ficha.service'

const data = (civil: string): Date => new Date(`${civil}T00:00:00Z`)

/** Banco próprio: as classes oficiais são criadas aqui, com idades conhecidas, sem depender da carga. */
describe('classe pela idade: a varredura preenche quem está sem classe regular no ano', () => {
  let banco: BancoIsolado
  let prisma: PrismaService
  let servico: ServicoClassePelaIdade
  const classes: Record<'amigo' | 'amigoAvancada' | 'companheiro' | 'companheiroAvancada' | 'agrupadas', string> = {
    amigo: '',
    amigoAvancada: '',
    companheiro: '',
    companheiroAvancada: '',
    agrupadas: '',
  }

  beforeAll(async () => {
    banco = await criarBancoIsolado()
    prisma = new PrismaService(banco.url)
    const escopo = new ServicoEscopo(prisma)
    const desbravadores = new DesbravadoresService(prisma, escopo, new ServicoTipoDaFicha(prisma, escopo))
    servico = new ServicoClassePelaIdade(prisma, escopo, desbravadores)

    const oficial = { clubeId: null, origem: 'OFICIAL' as const }
    const amigo = await banco.prisma.classe.create({ data: { ...oficial, nome: 'Amigo', idade: 10, tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 1 } })
    const companheiro = await banco.prisma.classe.create({
      data: { ...oficial, nome: 'Companheiro', idade: 11, tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 3 },
    })
    classes.amigo = amigo.id
    classes.companheiro = companheiro.id
    classes.amigoAvancada = (
      await banco.prisma.classe.create({
        data: { ...oficial, nome: 'Amigo da Natureza', idade: 10, tipo: 'AVANCADA', trilha: 'INDIVIDUAL', ordem: 2, classeBaseId: amigo.id },
      })
    ).id
    classes.companheiroAvancada = (
      await banco.prisma.classe.create({
        data: { ...oficial, nome: 'Companheiro de Excursionismo', idade: 11, tipo: 'AVANCADA', trilha: 'INDIVIDUAL', ordem: 4, classeBaseId: companheiro.id },
      })
    ).id
    classes.agrupadas = (
      await banco.prisma.classe.create({
        data: { ...oficial, nome: 'Agrupadas (Amigo a Guia)', idade: 16, tipo: 'REGULAR', trilha: 'AGRUPADAS', ordem: 10 },
      })
    ).id
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await banco.encerrar()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  async function clube() {
    const sufixo = randomUUID().slice(0, 8)
    return banco.prisma.$transaction((tx) => criarClubeBase(tx, { nome: `Clube ${sufixo}`, slug: `clube-${sufixo}` }))
  }

  async function ficha(clubeId: string, dados: { nascimento: string; tipo?: TipoPessoa; ativo?: boolean }) {
    return banco.prisma.desbravador.create({
      data: {
        clubeId,
        nome: `Pessoa ${randomUUID().slice(0, 8)}`,
        nomePublico: 'Pessoa',
        tipo: dados.tipo ?? 'DBV',
        diretoriaDesde: dados.tipo === 'DIRETORIA' ? data('2026-02-01') : null,
        nascimento: data(dados.nascimento),
        sexo: 'F',
        ativo: dados.ativo ?? true,
        entradaEm: data('2026-02-01'),
      },
    })
  }

  async function matricula(clubeId: string, dbvId: string, classeId: string, anoClube: number, status: StatusMatricula = 'CURSANDO') {
    await banco.prisma.matriculaClasse.create({ data: { clubeId, dbvId, classeId, anoClube, status } })
  }

  /** Matrículas do ano como `classeId:status`, em ordem estável. */
  async function doAno(dbvId: string, anoClube: number): Promise<string[]> {
    const linhas = await banco.prisma.matriculaClasse.findMany({ where: { dbvId, anoClube }, select: { classeId: true, status: true } })
    return linhas.map((linha) => `${linha.classeId}:${linha.status}`).sort()
  }

  const cursando = (...ids: string[]): string[] => ids.map((id) => `${id}:CURSANDO`).sort()

  it('virada: no novo ano do clube, quem está sem matrícula recebe a classe da régua, com a avançada', async () => {
    const { id: clubeId } = await clube()
    const faz11NoPrimeiroSemestre = await ficha(clubeId, { nascimento: '2016-03-15' })
    const faz11NoSegundoSemestre = await ficha(clubeId, { nascimento: '2016-09-15' })
    await matricula(clubeId, faz11NoPrimeiroSemestre.id, classes.amigo, 2026)

    expect(await servico.sincronizarClube(clubeId, '2027-01-31')).toBe(0)

    expect(await servico.sincronizarClube(clubeId, '2027-02-01')).toBe(2)
    expect(await doAno(faz11NoPrimeiroSemestre.id, 2027)).toEqual(cursando(classes.companheiro, classes.companheiroAvancada))
    expect(await doAno(faz11NoSegundoSemestre.id, 2027)).toEqual(cursando(classes.amigo, classes.amigoAvancada))
    expect(await doAno(faz11NoPrimeiroSemestre.id, 2026)).toEqual(cursando(classes.amigo))

    expect(await servico.sincronizarClube(clubeId, '2027-02-02')).toBe(0)
  })

  it('não troca a matrícula CURSANDO escolhida pelo Adm, mesmo fora da idade', async () => {
    const { id: clubeId } = await clube()
    const dbv = await ficha(clubeId, { nascimento: '2016-03-15' })
    await matricula(clubeId, dbv.id, classes.amigo, 2027)

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(0)
    expect(await doAno(dbv.id, 2027)).toEqual(cursando(classes.amigo))
  })

  it('não cria quando há CONCLUIDA ou INVESTIDA no ano; cria quando só há DESISTIU', async () => {
    const { id: clubeId } = await clube()
    const concluiu = await ficha(clubeId, { nascimento: '2016-03-15' })
    const investido = await ficha(clubeId, { nascimento: '2016-03-15' })
    const desistiu = await ficha(clubeId, { nascimento: '2016-03-15' })
    await matricula(clubeId, concluiu.id, classes.amigo, 2027, 'CONCLUIDA')
    await matricula(clubeId, investido.id, classes.amigo, 2027, 'INVESTIDA')
    await matricula(clubeId, desistiu.id, classes.amigo, 2027, 'DESISTIU')

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(1)
    expect(await doAno(concluiu.id, 2027)).toEqual([`${classes.amigo}:CONCLUIDA`])
    expect(await doAno(investido.id, 2027)).toEqual([`${classes.amigo}:INVESTIDA`])
    expect(await doAno(desistiu.id, 2027)).toEqual(
      [`${classes.amigo}:DESISTIU`, ...cursando(classes.companheiro, classes.companheiroAvancada)].sort(),
    )
  })

  it('regular DESISTIU e avançada já CONCLUIDA no ano: matricula só a regular, sem erro', async () => {
    const { id: clubeId } = await clube()
    const dbv = await ficha(clubeId, { nascimento: '2016-03-15' })
    await matricula(clubeId, dbv.id, classes.companheiro, 2027, 'DESISTIU')
    await matricula(clubeId, dbv.id, classes.companheiroAvancada, 2027, 'CONCLUIDA')

    expect(await servico.aplicar(clubeId, dbv.id, 2027)).toBe(true)
    expect(await doAno(dbv.id, 2027)).toEqual([`${classes.companheiro}:CURSANDO`, `${classes.companheiroAvancada}:CONCLUIDA`].sort())
  })

  it('ignora Diretoria, Líder e inativo', async () => {
    const { id: clubeId } = await clube()
    const fichas = [
      await ficha(clubeId, { nascimento: '2016-03-15', tipo: 'DIRETORIA' }),
      await ficha(clubeId, { nascimento: '2016-03-15', tipo: 'LIDER' }),
      await ficha(clubeId, { nascimento: '2016-03-15', ativo: false }),
    ]

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(0)
    for (const { id } of fichas) expect(await doAno(id, 2027)).toEqual([])
  })

  it('idade sem classe (9 anos) e classe desativada no clube: nada é feito', async () => {
    const { id: clubeId } = await clube()
    const noveAnos = await ficha(clubeId, { nascimento: '2018-03-15' })
    const amigoDesligado = await ficha(clubeId, { nascimento: '2016-09-15' })
    await banco.prisma.classeClube.upsert({
      where: { clubeId_classeId: { clubeId, classeId: classes.amigo } },
      create: { clubeId, classeId: classes.amigo, ativa: false },
      update: { ativa: false },
    })

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(0)
    expect(await doAno(noveAnos.id, 2027)).toEqual([])
    expect(await doAno(amigoDesligado.id, 2027)).toEqual([])
  })

  it('matrícula regular em AGRUPADAS conta como ter classe: não cria a individual', async () => {
    const { id: clubeId } = await clube()
    const dbv = await ficha(clubeId, { nascimento: '2016-03-15' })
    await matricula(clubeId, dbv.id, classes.agrupadas, 2027)

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(0)
    expect(await doAno(dbv.id, 2027)).toEqual(cursando(classes.agrupadas))
  })

  it('reconferência: matrícula feita pelo Adm depois da leitura → aplicar não grava e a do Adm continua CURSANDO', async () => {
    const { id: clubeId } = await clube()
    const dbv = await ficha(clubeId, { nascimento: '2016-03-15' })
    await matricula(clubeId, dbv.id, classes.amigo, 2027)

    expect(await servico.aplicar(clubeId, dbv.id, 2027)).toBe(false)
    expect(await doAno(dbv.id, 2027)).toEqual(cursando(classes.amigo))

    const semClasse = await ficha(clubeId, { nascimento: '2016-03-15' })
    expect(await servico.aplicar(clubeId, semClasse.id, 2027)).toBe(true)
    expect(await doAno(semClasse.id, 2027)).toEqual(cursando(classes.companheiro, classes.companheiroAvancada))
  })

  it('reconferência: ficha que virou Diretoria ou foi inativada depois da leitura não recebe classe', async () => {
    const { id: clubeId } = await clube()
    const virouDiretoria = await ficha(clubeId, { nascimento: '2016-03-15' })
    const inativada = await ficha(clubeId, { nascimento: '2016-03-15' })
    await banco.prisma.desbravador.update({ where: { id: virouDiretoria.id }, data: { tipo: 'DIRETORIA', diretoriaDesde: data('2027-03-01') } })
    await banco.prisma.desbravador.update({ where: { id: inativada.id }, data: { ativo: false } })

    expect(await servico.aplicar(clubeId, virouDiretoria.id, 2027)).toBe(false)
    expect(await servico.aplicar(clubeId, inativada.id, 2027)).toBe(false)
    expect(await doAno(virouDiretoria.id, 2027)).toEqual([])
    expect(await doAno(inativada.id, 2027)).toEqual([])
  })

  it('erro numa ficha fica no log e a varredura segue com as outras do clube', async () => {
    const { id: clubeId } = await clube()
    const a = await ficha(clubeId, { nascimento: '2016-03-15' })
    const b = await ficha(clubeId, { nascimento: '2016-03-15' })
    jest.spyOn(servico, 'aplicar').mockRejectedValueOnce(new Error('falha simulada'))
    const registro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    expect(await servico.sincronizarClube(clubeId, '2027-03-01')).toBe(1)
    const comClasse = [await doAno(a.id, 2027), await doAno(b.id, 2027)].filter((linhas) => linhas.length > 0)
    expect(comClasse).toHaveLength(1)
    expect(registro).toHaveBeenCalledWith(expect.stringContaining('falha simulada'))
  })
})
