import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  configurarClube,
  criarAcesso,
  criarAlbum,
  criarClube,
  criarDbv,
  criarEvento,
  criarMatricula,
  criarMembro,
  criarReuniao,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo, hoje } from '../../test/p6'

type Pacote = z.infer<typeof PacoteSaida>

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * 86_400_000))
}

describe('GET /api/sync/pacote', () => {
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

  async function clubeComConselheiro() {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
    const outra = await criarUnidade({ clubeId: clube.id, nome: 'Bravos' })
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    return { clube, unidade, outra, acesso }
  }

  it('CONSELHEIRO recebe so as suas unidades, o clube e os 5 criterios padrao de chamada', async () => {
    const { clube, unidade, acesso } = await clubeComConselheiro()
    await configurarClube({ clubeId: clube.id, diaReuniao: 6, horaReuniao: '14:30', descontarFalta: true, pontosDescontoFalta: 2 })
    const pacote = await baixar(acesso.autorizacao)
    expect(pacote.unidades.map((u) => u.id)).toEqual([unidade.id])
    expect(pacote).toMatchObject({
      usuarioId: acesso.usuario.id,
      vinculoId: acesso.vinculo.id,
      clube: { id: clube.id, diaReuniao: 6, horaReuniao: '14:30', descontarFalta: true, pontosDescontoFalta: 2 },
    })
    expect(pacote.criterios.map((c) => c.gatilho)).toEqual(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO'])
  })

  it('ADM e INSTRUTOR recebem unidades, reunioes e albuns vazios', async () => {
    const { clube, unidade } = await clubeComConselheiro()
    const dbv = await criarDbv({ clubeId: clube.id })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    await criarReuniao({ unidadeId: unidade.id, data: diasAtras(1), chamada: [{ dbvId: dbv.id }] })
    await criarAlbum({ unidadeId: unidade.id, data: diasAtras(1) })
    for (const papel of ['ADM', 'INSTRUTOR'] as const) {
      const acesso = await criarAcesso({ clubeId: clube.id, papel })
      const pacote = await baixar(acesso.autorizacao)
      expect(pacote.unidades).toEqual([])
      expect(pacote.reunioesRecentes).toEqual([])
      expect(pacote.albunsRecentes).toEqual([])
    }
  })

  it('membros: so DBV ativo e membro atual, com nome, idade, classe e autorizacao de imagem', async () => {
    const { clube, unidade, outra, acesso } = await clubeComConselheiro()
    const classe = await classeOficial('Amigo')
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Souza', sexo: 'F', nascimento: '2014-05-10' })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Lima' })
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Lider Fulano', tipo: 'LIDER' })
    const inativo = await criarDbv({ clubeId: clube.id, nome: 'Inativo', ativo: false })
    const saiu = await criarDbv({ clubeId: clube.id, nome: 'Saiu Da Unidade' })
    const daOutra = await criarDbv({ clubeId: clube.id, nome: 'Da Outra' })
    for (const dbv of [bia, ana, lider, inativo]) {
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    }
    await criarMembro({ dbvId: saiu.id, unidadeId: unidade.id, inicio: '2026-02-01', fim: '2026-03-01' })
    await criarMembro({ dbvId: daOutra.id, unidadeId: outra.id, inicio: '2026-02-01' })
    await criarMatricula({ clubeId: clube.id, dbvId: bia.id, classeId: classe.id, anoClube: anoCorrente() })
    await prismaDeTeste().desbravador.update({ where: { id: bia.id }, data: { autorizacaoImagem: true } })

    const pacote = await baixar(acesso.autorizacao)
    const membros = pacote.unidades[0]?.membros ?? []
    expect(membros.map((m) => m.nome)).toEqual(['Ana Lima', 'Bia Souza'])
    expect(membros[1]).toMatchObject({
      dbvId: bia.id,
      nomePublico: 'Bia',
      sexo: 'F',
      idade: expect.any(Number) as number,
      autorizacaoImagem: true,
      classeAtual: { id: classe.id, nome: 'Amigo' },
    })
    expect(membros[0]).toMatchObject({ autorizacaoImagem: false, classeAtual: null })
  })

  it('reunioes dos ultimos 30 dias com a chamada e as versoes; as mais velhas e as de outra unidade ficam fora', async () => {
    const { clube, unidade, outra, acesso } = await clubeComConselheiro()
    const dbv = await criarDbv({ clubeId: clube.id })
    const versao = new Date('2026-09-01T12:00:00.123Z')
    const recente = await criarReuniao({
      unidadeId: unidade.id,
      data: diasAtras(30),
      local: 'Igreja',
      observacoes: 'Nota',
      cabecalhoVersao: new Date('2026-09-02T10:00:00.456Z'),
      chamada: [{ dbvId: dbv.id, situacao: 'ATRASADO', biblia: true, versao }],
    })
    await criarReuniao({ unidadeId: unidade.id, data: diasAtras(31), chamada: [{ dbvId: dbv.id }] })
    await criarReuniao({ unidadeId: outra.id, data: diasAtras(2), chamada: [{ dbvId: dbv.id }] })

    const pacote = await baixar(acesso.autorizacao)
    expect(pacote.reunioesRecentes).toEqual([
      {
        id: recente.id,
        unidadeId: unidade.id,
        data: diasAtras(30),
        horario: '09:00',
        local: 'Igreja',
        observacoes: 'Nota',
        cabecalhoVersao: '2026-09-02T10:00:00.456Z',
        chamada: [
          { dbvId: dbv.id, situacao: 'ATRASADO', uniforme: false, biblia: true, licao: false, versao: '2026-09-01T12:00:00.123Z' },
        ],
      },
    ])
  })

  it('albuns dos ultimos 60 dias, com ou sem foto', async () => {
    const { unidade, outra, acesso } = await clubeComConselheiro()
    const dentro = await criarAlbum({ unidadeId: unidade.id, titulo: 'Dentro', data: diasAtras(60) })
    await criarAlbum({ unidadeId: unidade.id, titulo: 'Fora', data: diasAtras(61) })
    await criarAlbum({ unidadeId: outra.id, titulo: 'Outra unidade', data: diasAtras(1) })
    const pacote = await baixar(acesso.autorizacao)
    expect(pacote.albunsRecentes).toEqual([
      { id: dentro.id, unidadeId: unidade.id, titulo: 'Dentro', data: diasAtras(60), reuniaoId: null },
    ])
  })

  it('versao: estavel entre pedidos e diferente quando o dado muda', async () => {
    const { clube, unidade, acesso } = await clubeComConselheiro()
    const dbv = await criarDbv({ clubeId: clube.id, nome: 'Carlos' })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })

    const primeiro = await baixar(acesso.autorizacao)
    const segundo = await baixar(acesso.autorizacao)
    expect(segundo.versao).toBe(primeiro.versao)
    expect(primeiro.versao).toMatch(/^[0-9a-f]{64}$/)

    await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: { nome: 'Carlos Alberto' } })
    const aposNome = await baixar(acesso.autorizacao)
    expect(aposNome.versao).not.toBe(primeiro.versao)

    await criarReuniao({ unidadeId: unidade.id, data: hoje(), chamada: [{ dbvId: dbv.id }] })
    const aposReuniao = await baixar(acesso.autorizacao)
    expect(aposReuniao.versao).not.toBe(aposNome.versao)
  })

  describe('calendario', () => {
    function emDias(dias: number): string {
      return diasAtras(-dias)
    }

    it('traz os eventos da janela de 120 dias, com tipo, nome, datas, horario, local e marcacoes', async () => {
      const { clube, acesso } = await clubeComConselheiro()
      const extra = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: emDias(10) })
      await prismaDeTeste().eventoCalendario.update({ where: { id: extra.id }, data: { nome: 'Encontro', horario: '15:00', local: 'Parque' } })
      const ferias = await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: emDias(-5), fim: emDias(3) })
      const noLimite = await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: emDias(120) })

      const pacote = await baixar(acesso.autorizacao)

      expect(pacote.calendario).toHaveLength(3)
      expect(pacote.calendario).toContainEqual({
        nome: 'Encontro',
        tipo: 'REUNIAO_EXTRA',
        inicio: emDias(10),
        fim: emDias(10),
        horario: '15:00',
        local: 'Parque',
        temReuniao: extra.temReuniao,
        temClasse: extra.temClasse,
        bomParaCampo: extra.bomParaCampo,
      })
      expect(pacote.calendario.map((evento) => evento.nome).sort()).toEqual(['Encontro', ferias.nome, noLimite.nome].sort())
    })

    it('fora da janela, ja encerrado, removido ou de outro clube nao entra', async () => {
      const { clube, acesso } = await clubeComConselheiro()
      const outroClube = await criarClube()
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: emDias(121) })
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: emDias(-9), fim: emDias(-1) })
      const removido = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: emDias(5) })
      await prismaDeTeste().eventoCalendario.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
      await criarEvento({ clubeId: outroClube.id, tipo: 'EVENTO', inicio: emDias(5) })

      const pacote = await baixar(acesso.autorizacao)

      expect(pacote.calendario).toEqual([])
    })

    it('vai para os tres papeis', async () => {
      const { clube } = await clubeComConselheiro()
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: emDias(7), fim: emDias(14) })
      for (const papel of ['ADM', 'CONSELHEIRO', 'INSTRUTOR'] as const) {
        const acesso = await criarAcesso({ clubeId: clube.id, papel })
        const pacote = await baixar(acesso.autorizacao)
        expect(pacote.calendario).toHaveLength(1)
      }
    })

    it('versao muda quando o calendario muda', async () => {
      const { clube, acesso } = await clubeComConselheiro()

      const antes = await baixar(acesso.autorizacao)
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: emDias(5) })
      const depois = await baixar(acesso.autorizacao)

      expect(depois.versao).not.toBe(antes.versao)
    })
  })

  it('nao mostra dado de outro clube', async () => {
    const a = await clubeComConselheiro()
    const b = await clubeComConselheiro()
    const dbvB = await criarDbv({ clubeId: b.clube.id })
    await criarMembro({ dbvId: dbvB.id, unidadeId: b.unidade.id, inicio: '2026-02-01' })
    const reuniaoB = await criarReuniao({ unidadeId: b.unidade.id, data: diasAtras(1), chamada: [{ dbvId: dbvB.id }] })
    const albumB = await criarAlbum({ unidadeId: b.unidade.id, data: diasAtras(1) })
    const texto = JSON.stringify(await baixar(a.acesso.autorizacao))
    for (const id of [dbvB.id, reuniaoB.id, albumB.id, b.unidade.id, b.clube.id]) expect(texto).not.toContain(id)
  })

  it('sem login: 401', async () => {
    const resposta = await api.get('/api/sync/pacote', '')
    expect(resposta.status).toBe(401)
  })
})
