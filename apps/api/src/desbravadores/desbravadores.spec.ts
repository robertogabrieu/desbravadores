import type { INestApplication } from '@nestjs/common'
import type { DesbravadorSaida, MatriculaSaida, MembroSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { ServicoClassePelaIdade } from './classe-pela-idade.service'
import { travarMatriculasDoDesbravador } from './desbravadores.service'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import {
  ajustarPermissao,
  anoCorrente,
  clienteHttp,
  corpo,
  criarClasseDoClube,
  hoje,
  nascimentoComIdade,
} from '../../test/p6'

type Dbv = z.infer<typeof DesbravadorSaida>
type ComAvisos = { dados: Dbv; avisos: { codigo: string; mensagem: string }[] }
type Pagina = { itens: Dbv[]; total: number; pagina: number; porPagina: number }

/** Nascimento no ano civil que dá `idade` no ano do clube corrente, no dia e mês pedidos ("MM-DD"). */
const nascidoEm = (idade: number, mesDia: string): string => `${anoCorrente() - idade}-${mesDia}`

describe('desbravadores: escopo, contato, cadastro, matricula', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  describe('escopo por papel (GET)', () => {
    it('ADM ve todos do clube e nao ve os de outro clube', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const a = await criarDbv({ clubeId: clube.id })
      const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      const fora = await criarDbv({ clubeId: outro.id })
      const resposta = await api.get('/api/desbravadores', adm.autorizacao).expect(200)
      const ids = corpo<Pagina>(resposta).itens.map((i) => i.id)
      expect(ids).toEqual(expect.arrayContaining([a.id, lider.id]))
      expect(ids).not.toContain(fora.id)
    })

    it('conselheiro so ve DBV das suas unidades e nunca LIDER', async () => {
      const clube = await criarClube()
      const minha = await criarUnidade({ clubeId: clube.id })
      const outra = await criarUnidade({ clubeId: clube.id })
      const dbvMeu = await criarDbv({ clubeId: clube.id })
      const dbvOutro = await criarDbv({ clubeId: clube.id })
      const semUnidade = await criarDbv({ clubeId: clube.id })
      const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      const prisma = prismaDeTeste()
      await prisma.membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbvMeu.id, unidadeId: minha.id, inicio: new Date('2026-02-01') },
      })
      await prisma.membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbvOutro.id, unidadeId: outra.id, inicio: new Date('2026-02-01') },
      })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })

      const lista = corpo<Pagina>(await api.get('/api/desbravadores', cons.autorizacao).expect(200))
      expect(lista.itens.map((i) => i.id)).toEqual([dbvMeu.id])
      await api.get(`/api/desbravadores/${dbvMeu.id}`, cons.autorizacao).expect(200)
      for (const id of [dbvOutro.id, semUnidade.id, lider.id]) {
        const r = await api.get(`/api/desbravadores/${id}`, cons.autorizacao).expect(404)
        expect(r.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      }
    })

    it('conselheiro nao ve DBV cuja passagem pela unidade ja acabou', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01'), fim: new Date('2026-03-01') },
      })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await api.get(`/api/desbravadores/${dbv.id}`, cons.autorizacao).expect(404)
    })

    it('instrutor so ve matriculados nas suas classes no ano corrente (DBV e LIDER)', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const guia = await classeOficial('Guia')
      const doAmigo = await criarDbv({ clubeId: clube.id })
      const liderDoAmigo = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      const doGuia = await criarDbv({ clubeId: clube.id })
      const anoPassado = await criarDbv({ clubeId: clube.id })
      const semClasse = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: doAmigo.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: liderDoAmigo.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: doGuia.id, classeId: guia.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: anoPassado.id, classeId: amigo.id, anoClube: anoCorrente() - 1 })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

      const lista = corpo<Pagina>(await api.get('/api/desbravadores', instrutor.autorizacao).expect(200))
      expect(lista.itens.map((i) => i.id).sort()).toEqual([doAmigo.id, liderDoAmigo.id].sort())
      for (const id of [doGuia.id, anoPassado.id, semClasse.id]) {
        await api.get(`/api/desbravadores/${id}`, instrutor.autorizacao).expect(404)
      }
    })

    it('sem dbv.ver_contato a chave contato nao vem no JSON; com ela, vem', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const dbv = await prismaDeTeste().desbravador.create({
        data: {
          clubeId: clube.id, nome: 'Ana Souza', nomePublico: 'Ana S.', nascimento: new Date('2014-01-10'),
          sexo: 'F', entradaEm: new Date('2026-02-01'), responsavelNome: 'Mae da Ana', responsavelTelefone: '11999990000',
        },
      })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      const consSemContato = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await ajustarPermissao(consSemContato.vinculo.id, 'dbv.ver_contato', false)
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

      const comContato = await api.get(`/api/desbravadores/${dbv.id}`, cons.autorizacao).expect(200)
      expect(corpo<Dbv>(comContato).contato).toEqual({
        responsavelNome: 'Mae da Ana', responsavelTelefone: '11999990000', responsavelEmail: null,
      })
      await api.get(`/api/desbravadores/${dbv.id}`, adm.autorizacao).expect(200)
      for (const acesso of [consSemContato, instrutor]) {
        const detalhe = await api.get(`/api/desbravadores/${dbv.id}`, acesso.autorizacao).expect(200)
        expect(Object.keys(detalhe.body as object)).not.toContain('contato')
        const lista = await api.get('/api/desbravadores', acesso.autorizacao).expect(200)
        expect(JSON.stringify(lista.body)).not.toContain('contato')
        expect(JSON.stringify(lista.body)).not.toContain('Mae da Ana')
      }
    })

    it('a saida traz unidade atual, classe regular e avancada cursando', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({
        where: { clubeId: null, classeBaseId: amigo.id }, select: { id: true },
      })
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascimentoComIdade(10) })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: avancada.id, anoClube: anoCorrente() })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const saida = corpo<Dbv>(await api.get(`/api/desbravadores/${dbv.id}`, adm.autorizacao).expect(200))
      expect(saida.unidade).toEqual({ id: unidade.id, nome: 'Aguias' })
      expect(saida.classeAtual).toMatchObject({ id: amigo.id, nome: 'Amigo', tipo: 'REGULAR', corToken: '--classe-amigo' })
      expect(saida.avancadaAtual).toMatchObject({ id: avancada.id, tipo: 'AVANCADA', corToken: '--classe-amigo' })
      expect(typeof saida.idade).toBe('number')
    })
  })

  describe('filtros e paginacao', () => {
    it('25 por pagina, ordem por nome, busca sem acento, sem unidade, classe, situacao', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const nomes = Array.from({ length: 27 }, (_, i) => `Aluno ${String(i).padStart(2, '0')}`)
      const criados = []
      for (const nome of nomes) criados.push(await criarDbv({ clubeId: clube.id, nome }))
      const pagina1 = corpo<Pagina>(await api.get('/api/desbravadores', adm.autorizacao).expect(200))
      expect(pagina1).toMatchObject({ total: 27, pagina: 1, porPagina: 25 })
      expect(pagina1.itens).toHaveLength(25)
      expect(pagina1.itens.map((i) => i.nome)).toEqual(nomes.slice(0, 25))
      const pagina2 = corpo<Pagina>(await api.get('/api/desbravadores?pagina=2', adm.autorizacao).expect(200))
      expect(pagina2.itens.map((i) => i.nome)).toEqual(nomes.slice(25))

      const joao = await criarDbv({ clubeId: clube.id, nome: 'João Conceição' })
      const busca = corpo<Pagina>(await api.get('/api/desbravadores?busca=conceicao', adm.autorizacao).expect(200))
      expect(busca.itens.map((i) => i.id)).toEqual([joao.id])
      const caixa = corpo<Pagina>(await api.get('/api/desbravadores?busca=JOAO', adm.autorizacao).expect(200))
      expect(caixa.itens.map((i) => i.id)).toEqual([joao.id])

      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: joao.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      const daUnidade = corpo<Pagina>(await api.get(`/api/desbravadores?unidadeId=${unidade.id}`, adm.autorizacao).expect(200))
      expect(daUnidade.itens.map((i) => i.id)).toEqual([joao.id])
      const semUnidade = corpo<Pagina>(await api.get('/api/desbravadores?semUnidade=true&porPagina=100', adm.autorizacao).expect(200))
      expect(semUnidade.total).toBe(27)
      expect(semUnidade.itens.map((i) => i.id)).not.toContain(joao.id)

      await criarMatricula({ clubeId: clube.id, dbvId: criados[3].id, classeId: amigo.id, anoClube: anoCorrente() })
      const daClasse = corpo<Pagina>(await api.get(`/api/desbravadores?classeId=${amigo.id}`, adm.autorizacao).expect(200))
      expect(daClasse.itens.map((i) => i.id)).toEqual([criados[3].id])

      const inativo = await criarDbv({ clubeId: clube.id, nome: 'Zeca Inativo', ativo: false })
      const ativos = corpo<Pagina>(await api.get('/api/desbravadores?porPagina=100', adm.autorizacao).expect(200))
      expect(ativos.itens.map((i) => i.id)).not.toContain(inativo.id)
      const inativos = corpo<Pagina>(await api.get('/api/desbravadores?ativo=false', adm.autorizacao).expect(200))
      expect(inativos.itens.map((i) => i.id)).toEqual([inativo.id])
      const todos = corpo<Pagina>(await api.get('/api/desbravadores?ativo=todos&porPagina=100', adm.autorizacao).expect(200))
      expect(todos.total).toBe(29)
    })
  })

  describe('POST /desbravadores', () => {
    const base = { nome: 'Maria da Silva', sexo: 'F' as const, entradaEm: '2026-02-01' }

    it('cria com nome publico calculado, unidade e matricula regular + avancada', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id, tipo: 'FEMININA' })
      const amigo = await classeOficial('Amigo')
      const resposta = await api
        .post('/api/desbravadores', adm.autorizacao, {
          ...base, nascimento: nascimentoComIdade(10), unidadeId: unidade.id, classeId: amigo.id,
        })
        .expect(201)
      const { dados, avisos } = corpo<ComAvisos>(resposta)
      expect(avisos).toEqual([])
      expect(dados).toMatchObject({ nome: 'Maria da Silva', nomePublico: 'Maria S.', tipo: 'DBV', ativo: true })
      expect(dados.unidade?.id).toBe(unidade.id)
      expect(dados.classeAtual?.nome).toBe('Amigo')
      expect(dados.avancadaAtual?.tipo).toBe('AVANCADA')
      const membro = await prismaDeTeste().membroUnidade.findFirstOrThrow({ where: { clubeId: clube.id, dbvId: dados.id } })
      expect(membro.fim).toBeNull()
      expect(membro.inicio.toISOString().slice(0, 10)).toBe('2026-02-01')
      const matriculas = await prismaDeTeste().matriculaClasse.findMany({ where: { clubeId: clube.id, dbvId: dados.id } })
      expect(matriculas).toHaveLength(2)
      expect(matriculas.every((m) => m.anoClube === anoCorrente() && m.status === 'CURSANDO')).toBe(true)
    })

    it('incluirAvancada=false matricula so a regular', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const { dados } = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, {
            ...base, nascimento: nascimentoComIdade(10), classeId: amigo.id, incluirAvancada: false,
          })
          .expect(201),
      )
      expect(dados.classeAtual?.nome).toBe('Amigo')
      expect(dados.avancadaAtual).toBeNull()
    })

    it('avisa (sem impedir) unidade de sexo diferente e classe fora da idade', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Aguias', tipo: 'MASCULINA' })
      const amigo = await classeOficial('Amigo')
      const { avisos, dados } = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, {
            ...base, nascimento: nascimentoComIdade(11), unidadeId: unidade.id, classeId: amigo.id,
          })
          .expect(201),
      )
      expect(dados.id).toBeDefined()
      expect(avisos).toEqual(
        expect.arrayContaining([
          { codigo: 'AVISO_SEXO_UNIDADE', mensagem: 'A unidade Aguias é masculina.' },
          { codigo: 'AVISO_IDADE_CLASSE', mensagem: 'Pela idade, a classe esperada é Companheiro.' },
        ]),
      )
      expect(avisos).toHaveLength(2)
    })

    it('DBV sem classe e matriculado pela regua de 30/06, com a avancada; com classe, fica a do Adm', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const pelaIdade = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascidoEm(11, '03-15') }).expect(201),
      )
      expect(pelaIdade.dados.classeAtual?.nome).toBe('Companheiro')
      expect(pelaIdade.dados.avancadaAtual?.tipo).toBe('AVANCADA')
      expect(pelaIdade.avisos).toEqual([])
      const doSegundoSemestre = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascidoEm(11, '09-15') }).expect(201),
      )
      expect(doSegundoSemestre.dados.classeAtual?.nome).toBe('Amigo')

      const doAdm = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascidoEm(11, '03-15'), classeId: amigo.id })
          .expect(201),
      )
      expect(doAdm.dados.classeAtual?.nome).toBe('Amigo')
      const matriculas = await prismaDeTeste().matriculaClasse.findMany({ where: { clubeId: clube.id, dbvId: doAdm.dados.id } })
      expect(matriculas).toHaveLength(2)
    })

    it('avancada desligada no clube: nem o cadastro pela idade nem a matricula manual a incluem', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({ where: { classeBaseId: amigo.id, tipo: 'AVANCADA', clubeId: null } })
      await prismaDeTeste().classeClube.upsert({
        where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } },
        create: { clubeId: clube.id, classeId: avancada.id, ativa: false },
        update: { ativa: false },
      })

      const pelaIdade = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascidoEm(10, '03-15') }).expect(201),
      )
      expect(pelaIdade.dados.classeAtual?.nome).toBe('Amigo')
      expect(pelaIdade.dados.avancadaAtual).toBeNull()

      const manual = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(10, '03-15') })
      const matriculas = corpo<z.infer<typeof MatriculaSaida>[]>(
        await api
          .post(`/api/desbravadores/${manual.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: anoCorrente(), incluirAvancada: true })
          .expect(201),
      )
      expect(matriculas.map((m) => m.classe.id)).toEqual([amigo.id])
    })

    it('Diretoria sem classe, e quem vira Diretoria pela idade, fica sem matricula; menos de 10 anos tambem', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const casos: object[] = [
        { ...base, nascimento: nascidoEm(11, '03-15'), tipo: 'DIRETORIA' },
        { ...base, nascimento: nascidoEm(16, '03-15') },
        { ...base, nascimento: nascidoEm(9, '03-15') },
      ]
      for (const pedido of casos) {
        const { dados } = corpo<ComAvisos>(await api.post('/api/desbravadores', adm.autorizacao, pedido).expect(201))
        expect(dados.classeAtual).toBeNull()
      }
      expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('aviso de idade pela regua de 30/06: quem faz 11 no 1o semestre ja e Companheiro; no 2o, ainda Amigo', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const avisos = async (nascimento: string) =>
        corpo<ComAvisos>(await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento, classeId: amigo.id }).expect(201)).avisos
      expect(await avisos(nascidoEm(11, '03-15'))).toEqual([
        { codigo: 'AVISO_IDADE_CLASSE', mensagem: 'Pela idade, a classe esperada é Companheiro.' },
      ])
      expect(await avisos(nascidoEm(11, '09-15'))).toEqual([])
    })

    it('classe agrupada: DBV com menos de 16 anos avisa, com 16 nao', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const agrupada = await classeOficial('Agrupadas (Amigo a Guia)', 'AGRUPADAS')
      const cadastrar = async (idadeDoDbv: number) =>
        corpo<ComAvisos>(
          await api
            .post('/api/desbravadores', adm.autorizacao, {
              ...base, nascimento: nascimentoComIdade(idadeDoDbv), classeId: agrupada.id,
            })
            .expect(201),
        ).avisos
      expect(await cadastrar(15)).toEqual([
        { codigo: 'AVISO_IDADE_CLASSE', mensagem: 'As classes agrupadas são para 16 anos ou mais.' },
      ])
      expect(await cadastrar(16)).toEqual([])
    })

    it('classe desativada: cadastro com ela responde 404 e nada e criado', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const retirada = await criarClasseDoClube(clube.id, 'Retirada')
      await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })
      await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascimentoComIdade(12), classeId: retirada.id }).expect(404)
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('LIDER com usuario do clube; unidade em LIDER e recusada (422)', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const usuario = await criarUsuario()
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const nascimento = '1990-03-04'
      const { dados } = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento, tipo: 'LIDER', usuarioId: usuario.id })
          .expect(201),
      )
      expect(dados).toMatchObject({ tipo: 'LIDER', usuarioId: usuario.id, unidade: null })
      const comUnidade = await api
        .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento, tipo: 'LIDER', unidadeId: unidade.id })
        .expect(422)
      expect(comUnidade.body).toMatchObject({ codigo: 'REGRA' })
    })

    it('DBV com conta de usuario do clube e aceito no cadastro e na edicao; conselheiro ou instrutor vira Diretoria', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const usuario = await criarUsuario()
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      const { dados } = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascimentoComIdade(16), usuarioId: usuario.id })
          .expect(201),
      )
      expect(dados).toMatchObject({ tipo: 'DIRETORIA', usuarioId: usuario.id })

      const outroUsuario = await criarUsuario()
      await criarVinculo({ usuarioId: outroUsuario.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const semConta = await criarDbv({ clubeId: clube.id })
      const editado = corpo<ComAvisos>(
        await api.patch(`/api/desbravadores/${semConta.id}`, adm.autorizacao, { usuarioId: outroUsuario.id }).expect(200),
      )
      expect(editado.dados).toMatchObject({ tipo: 'DIRETORIA', usuarioId: outroUsuario.id })
    })

    it('conta ja ligada a outra ficha do clube: cadastro e edicao recusam (422) e nada muda', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const usuario = await criarUsuario()
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      await criarDbv({ clubeId: clube.id, usuarioId: usuario.id })
      const mensagem = 'Este usuário já está ligado a outro desbravador do clube.'
      const novo = await api
        .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nascimentoComIdade(16), usuarioId: usuario.id })
        .expect(422)
      expect(novo.body).toMatchObject({ codigo: 'REGRA', mensagem })
      const semConta = await criarDbv({ clubeId: clube.id })
      const editado = await api.patch(`/api/desbravadores/${semConta.id}`, adm.autorizacao, { usuarioId: usuario.id }).expect(422)
      expect(editado.body).toMatchObject({ codigo: 'REGRA', mensagem })
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id, usuarioId: usuario.id } })).toBe(1)
    })

    it('ids de outro clube (unidade, classe, usuario do LIDER) e usuario sem vinculo ativo → 404', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidadeFora = await criarUnidade({ clubeId: outro.id })
      const classeFora = await criarClasseDoClube(outro.id)
      const usuarioFora = await criarUsuario()
      await criarVinculo({ usuarioId: usuarioFora.id, clubeId: outro.id, papel: 'INSTRUTOR' })
      const usuarioInativo = await criarUsuario()
      await criarVinculo({ usuarioId: usuarioInativo.id, clubeId: clube.id, papel: 'INSTRUTOR', ativo: false })
      const nascimento = nascimentoComIdade(10)
      const casos: object[] = [
        { ...base, nascimento, unidadeId: unidadeFora.id },
        { ...base, nascimento, classeId: classeFora.id },
        { ...base, nascimento, tipo: 'LIDER', usuarioId: usuarioFora.id },
        { ...base, nascimento, tipo: 'LIDER', usuarioId: usuarioInativo.id },
      ]
      for (const corpoDoPedido of casos) {
        const r = await api.post('/api/desbravadores', adm.autorizacao, corpoDoPedido).expect(404)
        expect(r.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      }
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('so quem tem dbv.cadastrar cadastra; corpo invalido → 400', async () => {
      const clube = await criarClube()
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await api.post('/api/desbravadores', cons.autorizacao, { ...base, nascimento: '2014-01-01' }).expect(403)
      const r = await api.post('/api/desbravadores', adm.autorizacao, { nome: 'X' }).expect(400)
      expect(r.body).toMatchObject({ codigo: 'VALIDACAO' })
    })
  })

  describe('PATCH /desbravadores/:id', () => {
    it('ADM altera todos os campos', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const { dados } = corpo<ComAvisos>(
        await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { nome: 'Novo Nome', sexo: 'F', nascimento: '2013-03-03' }).expect(200),
      )
      expect(dados).toMatchObject({ nome: 'Novo Nome', sexo: 'F', nascimento: '2013-03-03' })
    })

    it('conselheiro com dbv.editar so muda campos permitidos; outro campo → 422 REGRA sem alterar nada', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Original', sexo: 'M' })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await ajustarPermissao(cons.vinculo.id, 'dbv.editar', true)
      const ok = await api
        .patch(`/api/desbravadores/${dbv.id}`, cons.autorizacao, { nome: 'Editado', responsavelNome: 'Pai', autorizacaoImagem: true })
        .expect(200)
      expect(corpo<ComAvisos>(ok).dados).toMatchObject({ nome: 'Editado', autorizacaoImagem: true })
      const recusa = await api.patch(`/api/desbravadores/${dbv.id}`, cons.autorizacao, { nome: 'Outro', sexo: 'F' }).expect(422)
      expect(recusa.body).toMatchObject({ codigo: 'REGRA' })
      const depois = await prismaDeTeste().desbravador.findFirstOrThrow({ where: { id: dbv.id, clubeId: clube.id } })
      expect(depois).toMatchObject({ nome: 'Editado', sexo: 'M' })
    })

    it('conselheiro sem dbv.editar → 403; fora do escopo → 404; instrutor → 403', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      const dbvFora = await criarDbv({ clubeId: clube.id })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      const semPermissao = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await api.patch(`/api/desbravadores/${dbv.id}`, semPermissao.autorizacao, { nome: 'Xx' }).expect(403)
      const comPermissao = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await ajustarPermissao(comPermissao.vinculo.id, 'dbv.editar', true)
      await api.patch(`/api/desbravadores/${dbvFora.id}`, comPermissao.autorizacao, { nome: 'Xx' }).expect(404)
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      await api.patch(`/api/desbravadores/${dbv.id}`, instrutor.autorizacao, { nome: 'Xx' }).expect(403)
    })

    it('DBV sem classe no ano: a edicao ja volta com a classe da regua, com a avancada', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(11, '03-15') })
      const { dados } = corpo<ComAvisos>(await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { nome: 'Outro Nome' }).expect(200))
      expect(dados.classeAtual?.nome).toBe('Companheiro')
      expect(dados.avancadaAtual?.tipo).toBe('AVANCADA')
    })

    it('Diretoria do Adm volta a DBV na edicao ja com a classe da regua', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA', nascimento: nascidoEm(11, '03-15') })
      await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: { diretoriaPeloAdm: true } })
      const { dados } = corpo<ComAvisos>(await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { tipo: 'DBV' }).expect(200))
      expect(dados).toMatchObject({ tipo: 'DBV', classeAtual: { nome: 'Companheiro' } })
    })

    it('DBV com classe fora da idade: a edicao nao troca a classe', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(11, '03-15') })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      const { dados } = corpo<ComAvisos>(await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { nome: 'Outro Nome' }).expect(200))
      expect(dados.classeAtual?.nome).toBe('Amigo')
      expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id, dbvId: dbv.id } })).toBe(1)
    })

    it('usuarioId de outro clube no LIDER → 404', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      const usuarioFora = await criarUsuario()
      await criarVinculo({ usuarioId: usuarioFora.id, clubeId: outro.id, papel: 'ADM' })
      await api.patch(`/api/desbravadores/${lider.id}`, adm.autorizacao, { usuarioId: usuarioFora.id }).expect(404)
    })
  })

  describe('inativar e reativar', () => {
    it('inativar fecha a unidade aberta e desiste das matriculas CURSANDO; reativar sem classe para a idade fica sem classe', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const guia = await classeOficial('Guia')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(9, '03-15') })
      await prismaDeTeste().membroUnidade.create({
        data: { clubeId: clube.id, dbvId: dbv.id, unidadeId: unidade.id, inicio: new Date('2026-02-01') },
      })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: guia.id, anoClube: anoCorrente() - 1, status: 'CONCLUIDA' })

      const inativado = corpo<Dbv>(
        await api.post(`/api/desbravadores/${dbv.id}/inativar`, adm.autorizacao, { saidaEm: '2026-08-10' }).expect(200),
      )
      expect(inativado).toMatchObject({ ativo: false, saidaEm: '2026-08-10', unidade: null, classeAtual: null })
      const membro = await prismaDeTeste().membroUnidade.findFirstOrThrow({ where: { clubeId: clube.id, dbvId: dbv.id } })
      expect(membro.fim?.toISOString().slice(0, 10)).toBe('2026-08-10')
      const matriculas = await prismaDeTeste().matriculaClasse.findMany({ where: { clubeId: clube.id, dbvId: dbv.id } })
      expect(matriculas.find((m) => m.classeId === amigo.id)?.status).toBe('DESISTIU')
      expect(matriculas.find((m) => m.classeId === guia.id)?.status).toBe('CONCLUIDA')
      const repetido = await api.post(`/api/desbravadores/${dbv.id}/inativar`, adm.autorizacao, { saidaEm: '2026-08-11' }).expect(422)
      expect(repetido.body).toMatchObject({ codigo: 'REGRA' })

      const reativado = corpo<Dbv>(await api.post(`/api/desbravadores/${dbv.id}/reativar`, adm.autorizacao).expect(200))
      expect(reativado).toMatchObject({ ativo: true, saidaEm: null, unidade: null, classeAtual: null })
      const jaAtivo = await api.post(`/api/desbravadores/${dbv.id}/reativar`, adm.autorizacao).expect(422)
      expect(jaAtivo.body).toMatchObject({ codigo: 'REGRA' })
    })

    it('reativar sem matricula no ano: volta na hora com a classe da regua, nao a escolhida antes', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(11, '03-15') })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
      await api.post(`/api/desbravadores/${dbv.id}/inativar`, adm.autorizacao, { saidaEm: '2026-08-10' }).expect(200)

      const reativado = corpo<Dbv>(await api.post(`/api/desbravadores/${dbv.id}/reativar`, adm.autorizacao).expect(200))
      expect(reativado.classeAtual?.nome).toBe('Companheiro')
      expect(await app.get(ServicoClassePelaIdade).sincronizarClube(clube.id)).toBe(0)
    })

    it('inativar espera a trava do desbravador: matricula criada por quem a segurava tambem vira DESISTIU', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(10, '03-15') })

      // Faz o papel da varredura: segura a trava, deixa a inativação começar e só então grava a matrícula.
      let inativacao: Promise<unknown> | undefined
      await prismaDeTeste().$transaction(async (tx) => {
        await travarMatriculasDoDesbravador(tx, dbv.id)
        inativacao = api.post(`/api/desbravadores/${dbv.id}/inativar`, adm.autorizacao, { saidaEm: '2026-08-10' }).expect(200).then()
        await new Promise((resolver) => setTimeout(resolver, 500))
        await tx.matriculaClasse.create({ data: { clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() } })
      })
      await inativacao

      const matricula = await prismaDeTeste().matriculaClasse.findFirstOrThrow({ where: { clubeId: clube.id, dbvId: dbv.id } })
      expect(matricula.status).toBe('DESISTIU')
    })

    it('matricular espera a trava do desbravador: inativado por quem a segurava, a matricula e recusada', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(10, '03-15') })

      // Faz o papel da inativação: segura a trava, deixa a matrícula começar e só então inativa.
      let matricula: Promise<{ body: unknown }> | undefined
      await prismaDeTeste().$transaction(async (tx) => {
        await travarMatriculasDoDesbravador(tx, dbv.id)
        matricula = api
          .post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: anoCorrente(), incluirAvancada: false })
          .expect(422)
          .then((resposta) => resposta)
        await new Promise((resolver) => setTimeout(resolver, 500))
        await tx.desbravador.update({ where: { id: dbv.id }, data: { ativo: false } })
      })
      expect((await matricula)?.body).toMatchObject({ mensagem: 'Reative o desbravador antes de matricular.' })
      expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id, dbvId: dbv.id } })).toBe(0)
    })

    it('DBV so com matricula em AGRUPADAS: a varredura nao cria a individual', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const agrupada = await classeOficial('Agrupadas (Amigo a Guia)', 'AGRUPADAS')
      const dbv = await criarDbv({ clubeId: clube.id, nascimento: nascidoEm(11, '03-15') })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: agrupada.id, anoClube: anoCorrente() })

      expect(await app.get(ServicoClassePelaIdade).sincronizarClube(clube.id)).toBe(0)

      const ficha = corpo<Dbv>(await api.get(`/api/desbravadores/${dbv.id}`, adm.autorizacao).expect(200))
      expect(ficha.classeAtual?.nome).toBe('Agrupadas (Amigo a Guia)')
    })

    it('conselheiro nao inativa nem reativa (403)', async () => {
      const clube = await criarClube()
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const dbv = await criarDbv({ clubeId: clube.id })
      await api.post(`/api/desbravadores/${dbv.id}/inativar`, cons.autorizacao, { saidaEm: '2026-08-10' }).expect(403)
      await api.post(`/api/desbravadores/${dbv.id}/reativar`, cons.autorizacao).expect(403)
    })
  })

  describe('PUT /desbravadores/:id/unidade', () => {
    it('move: fecha a passagem anterior em desde e abre a nova; null tira da unidade', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const a = await criarUnidade({ clubeId: clube.id })
      const b = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      const desde = hoje()
      const primeira = corpo<Dbv>(await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: a.id, desde }).expect(200))
      expect(primeira.unidade?.id).toBe(a.id)
      const segunda = corpo<Dbv>(await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: b.id, desde }).expect(200))
      expect(segunda.unidade?.id).toBe(b.id)
      const passagens = await prismaDeTeste().membroUnidade.findMany({ where: { clubeId: clube.id, dbvId: dbv.id } })
      expect(passagens).toHaveLength(2)
      expect(passagens.filter((p) => p.fim === null)).toHaveLength(1)
      const fora = corpo<Dbv>(await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: null, desde }).expect(200))
      expect(fora.unidade).toBeNull()
      expect(await prismaDeTeste().membroUnidade.count({ where: { clubeId: clube.id, dbvId: dbv.id, fim: null } })).toBe(0)
    })

    it('LIDER → 422 REGRA; unidade de outro clube → 404; conselheiro → 403', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const unidadeFora = await criarUnidade({ clubeId: outro.id })
      const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const r = await api.put(`/api/desbravadores/${lider.id}/unidade`, adm.autorizacao, { unidadeId: unidade.id, desde: hoje() }).expect(422)
      expect(r.body).toMatchObject({ codigo: 'REGRA' })
      await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: unidadeFora.id, desde: hoje() }).expect(404)
      await api.put(`/api/desbravadores/${dbv.id}/unidade`, cons.autorizacao, { unidadeId: unidade.id, desde: hoje() }).expect(403)
    })
  })

  describe('POST /desbravadores/:id/matriculas', () => {
    it('regular com incluirAvancada cria as duas', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const saida = corpo<z.infer<typeof MatriculaSaida>[]>(
        await api
          .post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: anoCorrente(), incluirAvancada: true })
          .expect(201),
      )
      expect(saida.map((m) => m.classe.tipo).sort()).toEqual(['AVANCADA', 'REGULAR'])
      expect(saida.every((m) => m.status === 'CURSANDO' && m.anoClube === anoCorrente())).toBe(true)
    })

    it('regular sem incluirAvancada cria so a regular', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const saida = corpo<z.infer<typeof MatriculaSaida>[]>(
        await api
          .post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: anoCorrente(), incluirAvancada: false })
          .expect(201),
      )
      expect(saida).toHaveLength(1)
      expect(saida[0]?.classe.tipo).toBe('REGULAR')
    })

    it('avancada sozinha nao cria a regular', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({ where: { clubeId: null, classeBaseId: amigo.id }, select: { id: true } })
      const saida = corpo<z.infer<typeof MatriculaSaida>[]>(
        await api
          .post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: avancada.id, anoClube: anoCorrente() })
          .expect(201),
      )
      expect(saida.map((m) => m.classe.tipo)).toEqual(['AVANCADA'])
      const todas = await prismaDeTeste().matriculaClasse.findMany({ where: { clubeId: clube.id, dbvId: dbv.id } })
      expect(todas).toHaveLength(1)
    })

    it('nova regular CURSANDO na mesma trilha e ano manda a anterior (e a avancada ligada) para DESISTIU', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const companheiro = await classeOficial('Companheiro')
      const ano = anoCorrente()
      await api.post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: ano }).expect(201)
      await api.post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: companheiro.id, anoClube: ano }).expect(201)
      const todas = await prismaDeTeste().matriculaClasse.findMany({
        where: { clubeId: clube.id, dbvId: dbv.id }, include: { classe: true },
      })
      expect(todas).toHaveLength(4)
      const cursando = todas.filter((m) => m.status === 'CURSANDO').map((m) => m.classe.nome)
      expect(cursando).toHaveLength(2)
      expect(cursando).toEqual(expect.arrayContaining(['Companheiro']))
      const desistiu = todas.filter((m) => m.status === 'DESISTIU')
      expect(desistiu).toHaveLength(2)
      expect(desistiu.map((m) => m.classe.tipo).sort()).toEqual(['AVANCADA', 'REGULAR'])
      // Trilha diferente nao e afetada.
      const agrupada = await classeOficial('Agrupadas (Amigo a Guia)', 'AGRUPADAS')
      await api.post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, { classeId: agrupada.id, anoClube: ano, incluirAvancada: false }).expect(201)
      expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id, dbvId: dbv.id, status: 'CURSANDO' } })).toBe(3)
    })

    it('classe desativada: matricula nova → 404; a matricula que ja existia continua legivel', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const retirada = await criarClasseDoClube(clube.id, 'Retirada')
      await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })
      const novo = await criarDbv({ clubeId: clube.id })
      await api
        .post(`/api/desbravadores/${novo.id}/matriculas`, adm.autorizacao, { classeId: retirada.id, anoClube: anoCorrente() })
        .expect(404)
      expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id, dbvId: novo.id } })).toBe(0)

      const antigo = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: antigo.id, classeId: retirada.id, anoClube: anoCorrente() })
      const dados = corpo<Dbv>(await api.get(`/api/desbravadores/${antigo.id}`, adm.autorizacao).expect(200))
      expect(dados.classeAtual).toMatchObject({ id: retirada.id, nome: 'Retirada' })
    })

    it('classe de outro clube → 404; DBV de outro clube → 404; conselheiro → 403', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const dbv = await criarDbv({ clubeId: clube.id })
      const dbvFora = await criarDbv({ clubeId: outro.id })
      const classeFora = await criarClasseDoClube(outro.id)
      const amigo = await classeOficial('Amigo')
      const pedido = { classeId: classeFora.id, anoClube: anoCorrente() }
      await api.post(`/api/desbravadores/${dbv.id}/matriculas`, adm.autorizacao, pedido).expect(404)
      await api.post(`/api/desbravadores/${dbvFora.id}/matriculas`, adm.autorizacao, { classeId: amigo.id, anoClube: anoCorrente() }).expect(404)
      await api.post(`/api/desbravadores/${dbv.id}/matriculas`, cons.autorizacao, { classeId: amigo.id, anoClube: anoCorrente() }).expect(403)
    })
  })

  describe('GET /unidades (membros ja cobre desbravadores)', () => {
    it('MembroSaida so de DBV ativo', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: unidade.id, desde: hoje() }).expect(200)
      const membros = corpo<z.infer<typeof MembroSaida>[]>(await api.get(`/api/unidades/${unidade.id}/membros`, adm.autorizacao).expect(200))
      expect(membros.map((m) => m.dbvId)).toEqual([dbv.id])
    })
  })
})
