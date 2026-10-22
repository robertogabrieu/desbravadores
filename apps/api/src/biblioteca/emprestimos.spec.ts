import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type {
  DesbravadorParaEmprestimoSaida,
  EmprestimoSaida,
  EmprestimosSaida,
  LivroFisicoDetalheSaida,
} from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarMembro,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { ajustarPermissao, corpo } from '../../test/p6'
import type { Prisma } from '../generated/prisma/client.js'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

interface Erro {
  codigo: string
  mensagem: string
  campos?: Record<string, string>
}

const HOJE = '2026-10-21'
const dia = (data: string): Date => new Date(`${data}T00:00:00Z`)

describe('empréstimos de livro físico', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 21/10/2026 (quarta-feira, meio-dia no fuso do clube).
  beforeEach(() => congelarRelogio('2026-10-21T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  const get = (acesso: Acesso, caminho: string): request.Test => request(servidor()).get(caminho).set('Authorization', acesso.autorizacao)
  const post = (acesso: Acesso, caminho: string, dados?: object): request.Test =>
    request(servidor()).post(caminho).set('Authorization', acesso.autorizacao).send(dados ?? {})

  async function cenario(exemplares = 3) {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const livro = await livroDireto(clube.id, adm.usuario.id, 'Pilgrim', exemplares)
    return { clube, adm, conselheiro, instrutor, livro, exemplares: livro.exemplares }
  }

  async function livroDireto(clubeId: string, usuarioId: string, nome: string, quantos: number) {
    const categoria = await prismaDeTeste().categoriaBiblioteca.create({ data: { clubeId, nome: `Livros ${nome}`, ordem: 1 } })
    const item = await prismaDeTeste().itemBiblioteca.create({
      data: { clubeId, categoriaId: categoria.id, nome, ordem: 1, tipo: 'FISICO', enviadoPorId: usuarioId },
    })
    for (let numero = 1; numero <= quantos; numero++) {
      await prismaDeTeste().exemplarBiblioteca.create({ data: { clubeId, itemId: item.id, numero } })
    }
    const exemplares = await prismaDeTeste().exemplarBiblioteca.findMany({ where: { itemId: item.id }, orderBy: { numero: 'asc' } })
    return { ...item, exemplares }
  }

  /** Empréstimo direto no banco, com `devolverAte` à escolha (e `devolvidoEm` quando já voltou). */
  function emprestimoDireto(dados: {
    clubeId: string
    exemplarId: string
    desbravadorId: string
    porId: string
    emprestadoEm?: string
    devolverAte: string
    devolvidoEm?: string
  }) {
    return prismaDeTeste().emprestimoBiblioteca.create({
      data: {
        clubeId: dados.clubeId,
        exemplarId: dados.exemplarId,
        desbravadorId: dados.desbravadorId,
        emprestadoEm: dia(dados.emprestadoEm ?? '2026-10-01'),
        devolverAte: dia(dados.devolverAte),
        devolvidoEm: dados.devolvidoEm ? dia(dados.devolvidoEm) : null,
        emprestadoPorId: dados.porId,
        devolvidoPorId: dados.devolvidoEm ? dados.porId : null,
      },
    })
  }

  const emprestar = (acesso: Acesso, dados: object) => post(acesso, '/api/biblioteca/emprestimos', dados)
  const abertosDe = (exemplarId: string) =>
    prismaDeTeste().emprestimoBiblioteca.count({ where: { exemplarId, devolvidoEm: null } })

  describe('POST /biblioteca/emprestimos', () => {
    it('grava devolverAte = emprestadoEm + 14 dias (21/10 devolve até 04/11) e quem emprestou', async () => {
      const { clube, conselheiro, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })

      const resposta = await emprestar(conselheiro, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(201)

      expect(corpo<EmprestimoSaida>(resposta)).toMatchObject({
        exemplarId: exemplares[0].id,
        desbravadorId: dbv.id,
        emprestadoEm: '2026-10-21',
        devolverAte: '2026-11-04',
        devolvidoEm: null,
      })
      const gravado = await prismaDeTeste().emprestimoBiblioteca.findFirstOrThrow({ where: { exemplarId: exemplares[0].id } })
      expect(gravado).toMatchObject({ clubeId: clube.id, emprestadoPorId: conselheiro.usuario.id, devolvidoEm: null })
    })

    it('aceita data anterior, de hoje até 60 dias atrás, e soma os 14 dias a partir dela', async () => {
      const { clube, adm, exemplares } = await cenario()
      const [a, b] = [await criarDbv({ clubeId: clube.id }), await criarDbv({ clubeId: clube.id })]

      const hoje = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: a.id, emprestadoEm: '2026-10-21' }).expect(201)
      const limite = await emprestar(adm, { exemplarId: exemplares[1].id, desbravadorId: b.id, emprestadoEm: '2026-08-22' }).expect(201)

      expect(corpo<EmprestimoSaida>(hoje).devolverAte).toBe('2026-11-04')
      expect(corpo<EmprestimoSaida>(limite).devolverAte).toBe('2026-09-05')
    })

    it.each([
      ['no futuro', '2026-10-22'],
      ['com 61 dias', '2026-08-21'],
    ])('recusa data %s com 400', async (_titulo, emprestadoEm) => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id, emprestadoEm }).expect(400)

      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'VALIDACAO', mensagem: 'Escolha uma data de hoje até 60 dias atrás.' })
      expect(await abertosDe(exemplares[0].id)).toBe(0)
    })

    it('recusa data anterior à entrada do desbravador no clube, com o nome na mensagem', async () => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Ana Lima' })
      await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: { entradaEm: dia('2026-09-10') } })

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id, emprestadoEm: '2026-09-09' }).expect(400)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'VALIDACAO', mensagem: 'Essa data é anterior à entrada de Ana Lima no clube.' })

      await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id, emprestadoEm: '2026-09-10' }).expect(201)
    })

    it('recusa com 400 qualquer campo de devolução vindo do cliente', async () => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })

      for (const extra of [{ devolverAte: '2027-01-01' }, { devolvidoEm: '2026-10-21' }, { emprestadoPorId: adm.usuario.id }]) {
        const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id, ...extra }).expect(400)
        expect(corpo<Erro>(resposta).codigo).toBe('VALIDACAO')
      }
      expect(await abertosDe(exemplares[0].id)).toBe(0)
    })

    it('exemplar já emprestado: 409 "Esse exemplar acabou de ser emprestado."', async () => {
      const { clube, adm, exemplares } = await cenario()
      const [primeiro, segundo] = [await criarDbv({ clubeId: clube.id }), await criarDbv({ clubeId: clube.id })]
      await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: primeiro.id }).expect(201)

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: segundo.id }).expect(409)

      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Esse exemplar acabou de ser emprestado.' })
    })

    it('exemplar baixado: 409 "Esse exemplar foi retirado do acervo."', async () => {
      const { clube, adm, exemplares } = await cenario()
      await prismaDeTeste().exemplarBiblioteca.update({ where: { id: exemplares[0].id }, data: { baixadoEm: new Date(), baixadoPorId: adm.usuario.id } })
      const dbv = await criarDbv({ clubeId: clube.id })

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(409)

      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Esse exemplar foi retirado do acervo.' })
    })

    it('desbravador que já tem livro: 409 "<Nome> já está com <livro>. Peça a devolução antes."', async () => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Bia Souza' })
      await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(201)

      const resposta = await emprestar(adm, { exemplarId: exemplares[1].id, desbravadorId: dbv.id }).expect(409)

      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Bia Souza já está com Pilgrim. Peça a devolução antes.' })
      expect(await abertosDe(exemplares[1].id)).toBe(0)
    })

    it('depois de devolver, o mesmo desbravador e o mesmo exemplar podem emprestar de novo', async () => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      const primeiro = corpo<EmprestimoSaida>(await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(201))
      await post(adm, `/api/biblioteca/emprestimos/${primeiro.id}/devolucao`).expect(201)

      await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(201)
    })

    it.each([
      ['inativo', { ativo: false }],
      ['que não é DBV', { tipo: 'DIRETORIA' as const }],
    ])('desbravador %s: 404 "Desbravador não encontrado."', async (_titulo, mudanca) => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: mudanca })

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(404)

      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Desbravador não encontrado.' })
    })

    it('desbravador de outro clube: 404 "Desbravador não encontrado."', async () => {
      const { adm, exemplares } = await cenario()
      const outro = await criarClube()
      const alheio = await criarDbv({ clubeId: outro.id })

      const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: alheio.id }).expect(404)

      expect(corpo<Erro>(resposta).mensagem).toBe('Desbravador não encontrado.')
    })

    it('exemplar de outro clube, de livro removido ou inexistente: 404 "Livro não encontrado."', async () => {
      const { clube, adm, livro, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      const outro = await criarClube()
      const admAlheio = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      const alheio = await livroDireto(outro.id, admAlheio.usuario.id, 'Alheio', 1)
      await prismaDeTeste().itemBiblioteca.update({ where: { id: livro.id }, data: { removidoEm: new Date() } })

      for (const exemplarId of [alheio.exemplares[0].id, exemplares[0].id, '0198f3a2-0000-7000-8000-000000000000']) {
        const resposta = await emprestar(adm, { exemplarId, desbravadorId: dbv.id }).expect(404)
        expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Livro não encontrado.' })
      }
    })

    it('conselheiro e instrutor emprestam a desbravador de outra unidade e de outra classe', async () => {
      const { clube, exemplares } = await cenario()
      const minha = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
      const dela = await criarUnidade({ clubeId: clube.id, nome: 'Leões' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const dbvA = await criarDbv({ clubeId: clube.id })
      const dbvB = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbvA.id, unidadeId: dela.id, inicio: '2026-03-01' })
      await criarMembro({ dbvId: dbvB.id, unidadeId: dela.id, inicio: '2026-03-01' })

      await emprestar(conselheiro, { exemplarId: exemplares[0].id, desbravadorId: dbvA.id }).expect(201)
      await emprestar(instrutor, { exemplarId: exemplares[1].id, desbravadorId: dbvB.id }).expect(201)
    })

    it('com biblioteca.emprestar desligada por ajuste do vínculo: 403', async () => {
      const { clube, conselheiro, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      await ajustarPermissao(conselheiro.vinculo.id, 'biblioteca.emprestar', false)

      await emprestar(conselheiro, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).expect(403)
    })

    describe('concorrência', () => {
      it('dois instrutores no mesmo exemplar ao mesmo tempo: um empresta, o outro recebe 409 com a mensagem', async () => {
        const { clube, adm, conselheiro, exemplares } = await cenario()
        const [a, b] = [await criarDbv({ clubeId: clube.id }), await criarDbv({ clubeId: clube.id })]

        const respostas = await Promise.all([
          emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: a.id }).then((r) => r),
          emprestar(conselheiro, { exemplarId: exemplares[0].id, desbravadorId: b.id }).then((r) => r),
        ])

        expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
        const perdeu = respostas.find((r) => r.status === 409)
        expect(corpo<Erro>(perdeu!).mensagem).toBe('Esse exemplar acabou de ser emprestado.')
        expect(await abertosDe(exemplares[0].id)).toBe(1)
      })

      it('exemplares diferentes ao mesmo desbravador ao mesmo tempo: um empresta, o outro recebe 409 (não 500)', async () => {
        const { clube, adm, conselheiro, exemplares } = await cenario()
        const dbv = await criarDbv({ clubeId: clube.id, nome: 'Caio Reis' })

        const respostas = await Promise.all([
          emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).then((r) => r),
          emprestar(conselheiro, { exemplarId: exemplares[1].id, desbravadorId: dbv.id }).then((r) => r),
        ])

        expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
        const perdeu = respostas.find((r) => r.status === 409)
        expect(corpo<Erro>(perdeu!).mensagem).toBe('Caio Reis já está com Pilgrim. Peça a devolução antes.')
        expect(await prismaDeTeste().emprestimoBiblioteca.count({ where: { desbravadorId: dbv.id, devolvidoEm: null } })).toBe(1)
      })

      it('violação do índice único de desbravador (escapou da trava) vira 409 com a mensagem, nunca 500', async () => {
        const { clube, adm, usuarioDoOutro, exemplares } = await comEscritaSemTrava()
        const dbv = await criarDbv({ clubeId: clube.id, nome: 'Duda Melo' })
        await concorrenteSemTrava(
          (tx) => tx.emprestimoBiblioteca.create({ data: dadosAbertos(clube.id, exemplares[1].id, dbv.id, usuarioDoOutro) }),
          async () => {
            const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: dbv.id })
            expect(resposta.status).toBe(409)
            expect(corpo<Erro>(resposta).mensagem).toBe('Duda Melo já está com Pilgrim. Peça a devolução antes.')
          },
        )
        expect(await abertosDe(exemplares[0].id)).toBe(0)
      })

      it('violação do índice único de exemplar (escapou da trava) vira 409 com a mensagem, nunca 500', async () => {
        const { clube, adm, usuarioDoOutro, exemplares } = await comEscritaSemTrava()
        const [dono, perdedor] = [await criarDbv({ clubeId: clube.id }), await criarDbv({ clubeId: clube.id })]
        await concorrenteSemTrava(
          (tx) => tx.emprestimoBiblioteca.create({ data: dadosAbertos(clube.id, exemplares[0].id, dono.id, usuarioDoOutro) }),
          async () => {
            const resposta = await emprestar(adm, { exemplarId: exemplares[0].id, desbravadorId: perdedor.id })
            expect(resposta.status).toBe(409)
            expect(corpo<Erro>(resposta).mensagem).toBe('Esse exemplar acabou de ser emprestado.')
          },
        )
      })

      /** Espera a gravação do pedido parar no índice que a outra transação ainda segura; é aí que o banco recusa. */
      async function esperarGravacaoBloqueada(): Promise<void> {
        for (let tentativa = 0; tentativa < 100; tentativa++) {
          const [{ bloqueadas }] = await prismaDeTeste().$queryRaw<Array<{ bloqueadas: bigint }>>`
            SELECT count(*) AS bloqueadas FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%EmprestimoBiblioteca%'`
          if (bloqueadas > 0n) return
          await new Promise((resolver) => setTimeout(resolver, 50))
        }
        throw new Error('A gravação do empréstimo não chegou a esperar pelo índice.')
      }

      async function comEscritaSemTrava() {
        const base = await cenario()
        return { ...base, usuarioDoOutro: base.conselheiro.usuario.id }
      }

      function dadosAbertos(clubeId: string, exemplarId: string, desbravadorId: string, emprestadoPorId: string) {
        return { clubeId, exemplarId, desbravadorId, emprestadoEm: dia('2026-10-20'), devolverAte: dia('2026-11-03'), emprestadoPorId }
      }

      /**
       * Segura uma gravação concorrente sem a trava do clube, ainda sem commit; o pedido passa pelas conferências
       * (que não a enxergam), para no índice único e, quando ela confirma, tem de terminar em 409.
       */
      async function concorrenteSemTrava(gravar: (tx: Prisma.TransactionClient) => Promise<unknown>, pedido: () => Promise<void>): Promise<void> {
        let liberar: () => void = () => undefined
        const segura = new Promise<void>((resolver) => {
          liberar = resolver
        })
        let gravada: () => void = () => undefined
        const pronta = new Promise<void>((resolver) => {
          gravada = resolver
        })
        const concorrente = prismaDeTeste().$transaction(
          async (tx) => {
            await gravar(tx)
            gravada()
            await segura
          },
          { timeout: 20_000 },
        )
        await pronta
        const execucao = pedido()
        await esperarGravacaoBloqueada()
        liberar()
        await concorrente
        await execucao
      }
    })
  })

  describe('POST /biblioteca/emprestimos/:id/devolucao', () => {
    it('devolve com a data de hoje do servidor, ignora o corpo e registra quem devolveu', async () => {
      const { clube, conselheiro, instrutor, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      const aberto = await emprestimoDireto({
        clubeId: clube.id,
        exemplarId: exemplares[0].id,
        desbravadorId: dbv.id,
        porId: conselheiro.usuario.id,
        devolverAte: '2026-10-15',
      })

      const resposta = await post(instrutor, `/api/biblioteca/emprestimos/${aberto.id}/devolucao`, { devolvidoEm: '2020-01-01', devolverAte: '2030-01-01' }).expect(201)

      expect(corpo<EmprestimoSaida>(resposta)).toMatchObject({ id: aberto.id, devolvidoEm: HOJE, devolverAte: '2026-10-15' })
      const gravado = await prismaDeTeste().emprestimoBiblioteca.findUniqueOrThrow({ where: { id: aberto.id } })
      expect(gravado).toMatchObject({ devolvidoPorId: instrutor.usuario.id, emprestadoPorId: conselheiro.usuario.id })
      expect(gravado.devolvidoEm?.toISOString().slice(0, 10)).toBe(HOJE)
      expect(gravado.devolverAte.toISOString().slice(0, 10)).toBe('2026-10-15')
    })

    it('devolução dupla (em sequência e ao mesmo tempo): uma passa, a outra recebe 409 "Este livro já foi devolvido."', async () => {
      const { clube, adm, conselheiro, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      const aberto = await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-11-01' })
      const rota = `/api/biblioteca/emprestimos/${aberto.id}/devolucao`

      const respostas = await Promise.all([post(adm, rota).then((r) => r), post(conselheiro, rota).then((r) => r)])

      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
      expect(corpo<Erro>(respostas.find((r) => r.status === 409)!)).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Este livro já foi devolvido.' })
      const outra = await post(adm, rota).expect(409)
      expect(corpo<Erro>(outra).mensagem).toBe('Este livro já foi devolvido.')
    })

    it('desbravador inativado com livro aberto continua devolvível', async () => {
      const { clube, adm, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id, ativo: false })
      const aberto = await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-10-01' })

      await post(adm, `/api/biblioteca/emprestimos/${aberto.id}/devolucao`).expect(201)
    })

    it('empréstimo inexistente: 404', async () => {
      const { adm } = await cenario()
      await post(adm, '/api/biblioteca/emprestimos/0198f3a2-0000-7000-8000-000000000000/devolucao').expect(404)
    })

    it('com biblioteca.emprestar desligada: 403', async () => {
      const { clube, adm, instrutor, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })
      const aberto = await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-11-01' })
      await ajustarPermissao(instrutor.vinculo.id, 'biblioteca.emprestar', false)

      await post(instrutor, `/api/biblioteca/emprestimos/${aberto.id}/devolucao`).expect(403)
    })

    it('baixa que cruza com o empréstimo: uma das duas escritas vence, nunca as duas', async () => {
      const { clube, adm, conselheiro, livro, exemplares } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id })

      const [emprestimo, baixa] = await Promise.all([
        emprestar(conselheiro, { exemplarId: exemplares[0].id, desbravadorId: dbv.id }).then((r) => r),
        post(adm, `/api/biblioteca/itens/${livro.id}/exemplares/${exemplares[0].id}/baixa`).then((r) => r),
      ])

      const baixado = (await prismaDeTeste().exemplarBiblioteca.findUniqueOrThrow({ where: { id: exemplares[0].id } })).baixadoEm !== null
      const emAberto = await abertosDe(exemplares[0].id)
      expect(baixado && emAberto === 1).toBe(false)
      expect(baixado || emAberto === 1).toBe(true)
      if (baixado) {
        expect([emprestimo.status, baixa.status]).toEqual([409, 201])
        expect(corpo<Erro>(emprestimo).mensagem).toBe('Esse exemplar foi retirado do acervo.')
      } else {
        expect([emprestimo.status, baixa.status]).toEqual([201, 409])
        expect(corpo<Erro>(baixa).mensagem).toBe('Esse exemplar está emprestado. Registre a devolução antes.')
      }
    })
  })

  describe('GET /biblioteca/itens/:id/exemplares', () => {
    it('traz o livro com total e disponíveis, os exemplares com quem está com eles e quem já devolveu', async () => {
      const { clube, adm, conselheiro, livro, exemplares } = await cenario(3)
      const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
      const [atrasado, pontual, antigo] = [
        await criarDbv({ clubeId: clube.id, nome: 'Ana Atrasada' }),
        await criarDbv({ clubeId: clube.id, nome: 'Paulo Pontual' }),
        await criarDbv({ clubeId: clube.id, nome: 'Alice Antiga' }),
      ]
      await criarMembro({ dbvId: atrasado.id, unidadeId: unidade.id, inicio: '2026-03-01' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: atrasado.id, porId: adm.usuario.id, emprestadoEm: '2026-10-01', devolverAte: '2026-10-15' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[1].id, desbravadorId: pontual.id, porId: adm.usuario.id, emprestadoEm: '2026-10-10', devolverAte: '2026-10-21' })
      // Alice devolveu duas vezes: aparece uma só vez, com a devolução mais recente.
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[2].id, desbravadorId: antigo.id, porId: adm.usuario.id, devolverAte: '2026-06-14', devolvidoEm: '2026-06-10' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[2].id, desbravadorId: antigo.id, porId: adm.usuario.id, devolverAte: '2026-09-14', devolvidoEm: '2026-09-12' })

      const detalhe = corpo<LivroFisicoDetalheSaida>(await get(conselheiro, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(200))

      expect(detalhe.item).toMatchObject({ id: livro.id, nome: 'Pilgrim', tipo: 'FISICO', total: 3, disponiveis: 1 })
      expect(detalhe.exemplares.map((e) => [e.numero, e.situacao])).toEqual([
        [1, 'EMPRESTADO'],
        [2, 'EMPRESTADO'],
        [3, 'DISPONIVEL'],
      ])
      expect(detalhe.exemplares[0].emprestimo).toMatchObject({
        desbravadorNome: 'Ana Atrasada',
        desbravadorAtivo: true,
        unidade: 'Águias',
        devolverAte: '2026-10-15',
        situacao: 'ATRASADO',
        dias: 6,
      })
      expect(detalhe.exemplares[1].emprestimo).toMatchObject({ desbravadorNome: 'Paulo Pontual', unidade: null, situacao: 'VENCE_HOJE', dias: 0 })
      expect(detalhe.exemplares[2].emprestimo).toBeNull()
      expect(detalhe.jaDevolveram).toEqual([{ desbravadorId: antigo.id, desbravadorNome: 'Alice Antiga', unidade: null, devolvidoEm: '2026-09-12' }])
    })

    it('exemplar baixado sai da lista e do total, mas quem o devolveu continua no histórico', async () => {
      const { clube, adm, livro, exemplares } = await cenario(2)
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Leo Leitor' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-10-05', devolvidoEm: '2026-10-04' })
      await prismaDeTeste().exemplarBiblioteca.update({ where: { id: exemplares[0].id }, data: { baixadoEm: new Date(), baixadoPorId: adm.usuario.id } })

      const detalhe = corpo<LivroFisicoDetalheSaida>(await get(adm, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(200))

      expect(detalhe.item).toMatchObject({ total: 1, disponiveis: 1 })
      expect(detalhe.exemplares.map((e) => e.numero)).toEqual([2])
      expect(detalhe.jaDevolveram.map((d) => d.desbravadorNome)).toEqual(['Leo Leitor'])
    })

    it('desbravador inativado com o livro: continua listado, "inativo" e sem unidade', async () => {
      const { clube, adm, livro, exemplares } = await cenario(1)
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Ivo Inativo' })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-03-01' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-10-01' })
      await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: { ativo: false } })

      const detalhe = corpo<LivroFisicoDetalheSaida>(await get(adm, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(200))

      expect(detalhe.exemplares[0].emprestimo).toMatchObject({ desbravadorNome: 'Ivo Inativo', desbravadorAtivo: false, unidade: null, situacao: 'ATRASADO', dias: 20 })
    })

    it('livro digital, removido ou de outro clube: 404 "Livro não encontrado."', async () => {
      const { clube, adm, livro } = await cenario(1)
      const categoria = await prismaDeTeste().categoriaBiblioteca.findFirstOrThrow({ where: { clubeId: clube.id } })
      const pdf = await prismaDeTeste().arquivo.create({
        data: { clubeId: clube.id, caminho: `clube/${clube.id}/biblioteca/x.pdf`, mime: 'application/pdf', bytes: 10, criadoPorId: adm.usuario.id },
      })
      const digital = await prismaDeTeste().itemBiblioteca.create({
        data: { clubeId: clube.id, categoriaId: categoria.id, nome: 'Digital', ordem: 2, arquivoId: pdf.id, enviadoPorId: adm.usuario.id },
      })
      const removido = await livroDireto(clube.id, adm.usuario.id, 'Removido', 1)
      await prismaDeTeste().itemBiblioteca.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
      const outro = await criarClube()
      const admAlheio = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      const alheio = await livroDireto(outro.id, admAlheio.usuario.id, 'Alheio', 1)

      for (const id of [digital.id, removido.id, alheio.id]) {
        const resposta = await get(adm, `/api/biblioteca/itens/${id}/exemplares`).expect(404)
        expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Livro não encontrado.' })
      }
      await get(adm, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(200)
    })

    it('com biblioteca.emprestar desligada por ajuste do vínculo: 403', async () => {
      const { conselheiro, livro } = await cenario(1)
      await get(conselheiro, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(200)
      await ajustarPermissao(conselheiro.vinculo.id, 'biblioteca.emprestar', false)

      await get(conselheiro, `/api/biblioteca/itens/${livro.id}/exemplares`).expect(403)
    })
  })

  describe('GET /biblioteca/emprestimos', () => {
    /** Cinco empréstimos abertos: atrasado há 6 e 2 dias, vence hoje, e dois no prazo; mais um já devolvido. */
    async function aba() {
      const base = await cenario(6)
      const { clube, adm, exemplares } = base
      const nomes = ['Ana Alta', 'Bruno Bom', 'Carla Cruz', 'Davi Dias', 'Eva Eloy', 'Fabio Fim']
      const dbvs: Awaited<ReturnType<typeof criarDbv>>[] = []
      for (const nome of nomes) dbvs.push(await criarDbv({ clubeId: clube.id, nome }))
      const abrir = (indice: number, devolverAte: string) =>
        emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[indice].id, desbravadorId: dbvs[indice].id, porId: adm.usuario.id, devolverAte })
      const ids = [
        (await abrir(0, '2026-10-19')).id,
        (await abrir(1, '2026-10-15')).id,
        (await abrir(2, '2026-10-21')).id,
        (await abrir(3, '2026-11-05')).id,
        (await abrir(4, '2026-10-22')).id,
      ]
      await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[5].id, desbravadorId: dbvs[5].id, porId: adm.usuario.id, devolverAte: '2026-10-01', devolvidoEm: '2026-10-02' })
      return { ...base, ids }
    }
    const listar = (acesso: Acesso, consulta = '') => get(acesso, `/api/biblioteca/emprestimos${consulta}`)

    it('ordena do mais atrasado ao mais no prazo e traz os totais', async () => {
      const { adm, ids } = await aba()

      const saida = corpo<EmprestimosSaida>(await listar(adm).expect(200))

      expect(saida.totais).toEqual({ emprestados: 5, atrasados: 2, vencemHoje: 1 })
      expect(saida.itens.map((i) => i.emprestimoId)).toEqual([ids[1], ids[0], ids[2], ids[4], ids[3]])
      expect(saida.itens.map((i) => [i.situacao, i.dias])).toEqual([
        ['ATRASADO', 6],
        ['ATRASADO', 2],
        ['VENCE_HOJE', 0],
        ['NO_PRAZO', 0],
        ['NO_PRAZO', 0],
      ])
      expect(saida.itens[0]).toMatchObject({ titulo: 'Pilgrim', numeroDoExemplar: 2, desbravadorNome: 'Bruno Bom', desbravadorAtivo: true, unidade: null, devolverAte: '2026-10-15' })
    })

    it.each([
      ['atrasados', 2],
      ['vencem-hoje', 1],
      ['no-prazo', 2],
      ['todas', 5],
    ])('filtro situacao=%s devolve %i itens e os totais não mudam', async (situacao, quantos) => {
      const { adm } = await aba()

      const saida = corpo<EmprestimosSaida>(await listar(adm, `?situacao=${situacao}`).expect(200))

      expect(saida.itens).toHaveLength(quantos)
      expect(saida.totais).toEqual({ emprestados: 5, atrasados: 2, vencemHoje: 1 })
    })

    it('busca no nome do desbravador e no título do livro, sem diferenciar acento e maiúscula', async () => {
      const { clube, adm, exemplares } = await aba()
      const outro = await livroDireto(clube.id, adm.usuario.id, 'Éden Perdido', 1)
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Gabi Gomes' })
      await emprestimoDireto({ clubeId: clube.id, exemplarId: outro.exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-11-10' })
      expect(exemplares).toHaveLength(6)

      const porNome = corpo<EmprestimosSaida>(await listar(adm, '?busca=CARLA').expect(200))
      const porTitulo = corpo<EmprestimosSaida>(await listar(adm, `?busca=${encodeURIComponent('eden')}`).expect(200))

      expect(porNome.itens.map((i) => i.desbravadorNome)).toEqual(['Carla Cruz'])
      expect(porTitulo.itens.map((i) => i.desbravadorNome)).toEqual(['Gabi Gomes'])
      expect(porNome.totais.emprestados).toBe(6)
    })

    it('desbravador inativado continua na aba, marcado como inativo, sem unidade e contando como atrasado', async () => {
      const { clube, adm } = await aba()
      await prismaDeTeste().desbravador.updateMany({ where: { clubeId: clube.id, nome: 'Bruno Bom' }, data: { ativo: false } })

      const saida = corpo<EmprestimosSaida>(await listar(adm).expect(200))

      expect(saida.totais.atrasados).toBe(2)
      expect(saida.itens[0]).toMatchObject({ desbravadorNome: 'Bruno Bom', desbravadorAtivo: false, unidade: null, situacao: 'ATRASADO' })
    })

    it('conselheiro e instrutor recebem 403', async () => {
      const { conselheiro, instrutor } = await cenario()
      await listar(conselheiro).expect(403)
      await listar(instrutor).expect(403)
    })

    it('situacao desconhecida: 400', async () => {
      const { adm } = await cenario()
      await listar(adm, '?situacao=qualquer').expect(400)
    })

    it('empréstimo de outro clube nunca entra na lista nem nos totais', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      const admAlheio = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      const alheio = await livroDireto(outro.id, admAlheio.usuario.id, 'Alheio', 1)
      const dbv = await criarDbv({ clubeId: outro.id })
      await emprestimoDireto({ clubeId: outro.id, exemplarId: alheio.exemplares[0].id, desbravadorId: dbv.id, porId: admAlheio.usuario.id, devolverAte: '2026-09-01' })

      const saida = corpo<EmprestimosSaida>(await listar(adm).expect(200))

      expect(saida).toEqual({ totais: { emprestados: 0, atrasados: 0, vencemHoje: 0 }, itens: [] })
    })
  })

  describe('GET /biblioteca/desbravadores', () => {
    const buscar = (acesso: Acesso, busca: string) => get(acesso, `/api/biblioteca/desbravadores?busca=${encodeURIComponent(busca)}`)

    it('acha pelo nome em qualquer unidade e classe, só com o que o empréstimo precisa, e mostra o livro em aberto', async () => {
      const { clube, adm, conselheiro, exemplares } = await cenario()
      const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Leões' })
      const livre = await criarDbv({ clubeId: clube.id, nome: 'João Pedro' })
      const comLivro = await criarDbv({ clubeId: clube.id, nome: 'Joana Dark' })
      await criarMembro({ dbvId: livre.id, unidadeId: unidade.id, inicio: '2026-03-01' })
      const aberto = await emprestimoDireto({ clubeId: clube.id, exemplarId: exemplares[0].id, desbravadorId: comLivro.id, porId: adm.usuario.id, devolverAte: '2026-11-01' })

      const achados = corpo<DesbravadorParaEmprestimoSaida[]>(await buscar(conselheiro, 'joao').expect(200))
      const duas = corpo<DesbravadorParaEmprestimoSaida[]>(await buscar(conselheiro, 'JO').expect(200))

      expect(achados).toEqual([{ id: livre.id, nome: 'João Pedro', unidade: 'Leões', entradaEm: '2026-02-01', livroEmAberto: null }])
      expect(duas.map((d) => d.nome)).toEqual(['Joana Dark', 'João Pedro'])
      expect(duas[0]).toEqual({ id: comLivro.id, nome: 'Joana Dark', unidade: null, entradaEm: '2026-02-01', livroEmAberto: { emprestimoId: aberto.id, titulo: 'Pilgrim' } })
      expect(Object.keys(duas[1]).sort()).toEqual(['entradaEm', 'id', 'livroEmAberto', 'nome', 'unidade'])
    })

    it('exige 2 letras (400), devolve no máximo 20 e só ativos do tipo DBV', async () => {
      const { clube, adm } = await cenario()
      for (let n = 1; n <= 22; n++) await criarDbv({ clubeId: clube.id, nome: `Maria ${String(n).padStart(2, '0')}` })
      await criarDbv({ clubeId: clube.id, nome: 'Maria Inativa', ativo: false })
      await criarDbv({ clubeId: clube.id, nome: 'Maria Diretoria', tipo: 'DIRETORIA' })

      await buscar(adm, 'm').expect(400)
      await get(adm, '/api/biblioteca/desbravadores').expect(400)
      const achados = corpo<DesbravadorParaEmprestimoSaida[]>(await buscar(adm, 'maria').expect(200))

      expect(achados).toHaveLength(20)
      expect(achados.map((d) => d.nome)).not.toContain('Maria Inativa')
      expect(achados.map((d) => d.nome)).not.toContain('Maria Diretoria')
    })

    it('nunca traz desbravador de outro clube', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      await criarDbv({ clubeId: outro.id, nome: 'Zeca Alheio' })

      expect(corpo<DesbravadorParaEmprestimoSaida[]>(await buscar(adm, 'zeca').expect(200))).toEqual([])
    })

    it('com biblioteca.emprestar desligada por ajuste do vínculo: 403', async () => {
      const { clube, instrutor } = await cenario()
      await criarDbv({ clubeId: clube.id, nome: 'Zeca' })
      await buscar(instrutor, 'zeca').expect(200)
      await ajustarPermissao(instrutor.vinculo.id, 'biblioteca.emprestar', false)

      await buscar(instrutor, 'zeca').expect(403)
    })
  })

  describe('isolamento entre clubes', () => {
    const doApp = (): INestApplication => app
    const seguinte = async (clubeId: string) => {
      const adm = await criarAcesso({ clubeId, papel: 'ADM' })
      const livro = await livroDireto(clubeId, adm.usuario.id, 'Do B', 1)
      const dbv = await criarDbv({ clubeId, nome: 'Dono Do B' })
      const emprestimo = await emprestimoDireto({ clubeId, exemplarId: livro.exemplares[0].id, desbravadorId: dbv.id, porId: adm.usuario.id, devolverAte: '2026-10-01' })
      return { livro, dbv, emprestimo }
    }

    testarIsolamento({
      titulo: 'POST /biblioteca/emprestimos/:id/devolucao',
      app: doApp,
      papel: 'CONSELHEIRO',
      semear: async (clube) => {
        const { emprestimo } = await seguinte(clube.id)
        return {
          metodo: 'post',
          caminho: `/api/biblioteca/emprestimos/${emprestimo.id}/devolucao`,
          conferirIntacto: async () => {
            const depois = await prismaDeTeste().emprestimoBiblioteca.findUniqueOrThrow({ where: { id: emprestimo.id } })
            expect(depois.devolvidoEm).toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'GET /biblioteca/itens/:id/exemplares',
      app: doApp,
      papel: 'CONSELHEIRO',
      semear: async (clube) => {
        const { livro } = await seguinte(clube.id)
        return { metodo: 'get', caminho: `/api/biblioteca/itens/${livro.id}/exemplares` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'GET /biblioteca/emprestimos',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { emprestimo } = await seguinte(clube.id)
        return { metodo: 'get', caminho: '/api/biblioteca/emprestimos', idsDoOutroClube: [emprestimo.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'GET /biblioteca/desbravadores',
      app: doApp,
      papel: 'CONSELHEIRO',
      semear: async (clube) => {
        const { dbv } = await seguinte(clube.id)
        return { metodo: 'get', caminho: '/api/biblioteca/desbravadores?busca=Dono', idsDoOutroClube: [dbv.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })
  })
})
