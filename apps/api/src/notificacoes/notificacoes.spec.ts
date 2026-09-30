import type { INestApplication } from '@nestjs/common'
import type { NotificacoesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, criarNotificacao, criarUsuario, criarVinculo, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoNotificacoes } from './servico-notificacoes'

type Saida = z.infer<typeof NotificacoesSaida>

describe('notificacoes', () => {
  let app: INestApplication
  let servico: ServicoNotificacoes
  let prisma: PrismaService
  const http = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
    servico = app.get(ServicoNotificacoes)
    prisma = app.get(PrismaService)
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const notificar = (
    clubeId: string,
    destinos: { usuarioId: string; link: string }[],
    titulo = 'Cronograma publicado',
  ): Promise<void> =>
    prisma.$transaction((tx) => servico.notificar(tx, { clubeId, destinos, tipo: 'CRONOGRAMA_PUBLICADO', titulo, texto: 'Texto' }))

  describe('notificar', () => {
    it('grava uma linha por pessoa, cada uma com o link do seu destino', async () => {
      const clube = await criarClube()
      const a = await criarUsuario()
      const b = await criarUsuario()
      await notificar(clube.id, [{ usuarioId: a.id, link: '/cronograma/montar?classe=1' }, { usuarioId: b.id, link: '/cronograma?classe=1' }])
      const linhas = await prisma.notificacao.findMany({ where: { clubeId: clube.id } })
      expect(linhas.map((l) => [l.usuarioId, l.link, l.tipo, l.titulo, l.texto, l.lidaEm]).sort((x, y) => String(x[1]).localeCompare(String(y[1])))).toEqual([
        [b.id, '/cronograma?classe=1', 'CRONOGRAMA_PUBLICADO', 'Cronograma publicado', 'Texto', null],
        [a.id, '/cronograma/montar?classe=1', 'CRONOGRAMA_PUBLICADO', 'Cronograma publicado', 'Texto', null],
      ])
    })

    it('a mesma pessoa repetida na lista recebe uma linha so; lista vazia nao grava nada', async () => {
      const clube = await criarClube()
      const a = await criarUsuario()
      await notificar(clube.id, [{ usuarioId: a.id, link: '/x' }, { usuarioId: a.id, link: '/y' }])
      await notificar(clube.id, [])
      const linhas = await prisma.notificacao.findMany({ where: { clubeId: clube.id } })
      expect(linhas).toHaveLength(1)
      expect(linhas[0]?.link).toBe('/x')
    })

    it('guarda so as 50 mais recentes de cada pessoa, sem tocar nas dos outros nem nas de outro clube', async () => {
      const clube = await criarClube()
      const outroClube = await criarClube()
      const a = await criarUsuario()
      const b = await criarUsuario()
      const base = Date.now() - 3_600_000
      for (let i = 0; i < 50; i++) await criarNotificacao({ clubeId: clube.id, usuarioId: a.id, titulo: `a${i}`, criadaEm: new Date(base + i * 1000) })
      for (let i = 0; i < 3; i++) await criarNotificacao({ clubeId: clube.id, usuarioId: b.id, titulo: `b${i}`, criadaEm: new Date(base + i * 1000) })
      for (let i = 0; i < 5; i++) await criarNotificacao({ clubeId: outroClube.id, usuarioId: a.id, titulo: `o${i}`, criadaEm: new Date(base + i * 1000) })

      await notificar(clube.id, [{ usuarioId: a.id, link: '/x' }], 'nova')

      const deA = await prisma.notificacao.findMany({ where: { clubeId: clube.id, usuarioId: a.id }, orderBy: { criadaEm: 'asc' } })
      expect(deA).toHaveLength(50)
      expect(deA.map((n) => n.titulo)).not.toContain('a0')
      expect(deA.at(-1)?.titulo).toBe('nova')
      expect(await prisma.notificacao.count({ where: { clubeId: clube.id, usuarioId: b.id } })).toBe(3)
      expect(await prisma.notificacao.count({ where: { clubeId: outroClube.id, usuarioId: a.id } })).toBe(5)
    })
  })

  describe('rotas do sino', () => {
    it('GET lista so as do proprio usuario no clube ativo, da mais nova para a mais velha, com o contador', async () => {
      const clube = await criarClube()
      const outroClube = await criarClube()
      const eu = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const outro = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id, titulo: 'velha', criadaEm: new Date(Date.now() - 60_000), lida: true })
      await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id, titulo: 'nova' })
      await criarNotificacao({ clubeId: clube.id, usuarioId: outro.usuario.id, titulo: 'do outro' })
      await criarNotificacao({ clubeId: outroClube.id, usuarioId: eu.usuario.id, titulo: 'de outro clube' })

      const resposta = await http.get('/api/notificacoes', eu.autorizacao)
      expect(resposta.status).toBe(200)
      const saida = corpo<Saida>(resposta)
      expect(saida.itens.map((i) => [i.titulo, i.lida])).toEqual([['nova', false], ['velha', true]])
      expect(saida.naoLidas).toBe(1)
    })

    it('GET devolve no maximo 50 itens, e o contador conta todas as nao lidas', async () => {
      const clube = await criarClube()
      const eu = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const base = Date.now() - 3_600_000
      for (let i = 0; i < 52; i++) await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id, criadaEm: new Date(base + i * 1000) })
      const saida = corpo<Saida>(await http.get('/api/notificacoes', eu.autorizacao))
      expect(saida.itens).toHaveLength(50)
      expect(saida.naoLidas).toBe(52)
    })

    it('POST /:id/lida marca a propria (204); repetir tambem e 204', async () => {
      const clube = await criarClube()
      const eu = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const n = await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id })
      expect((await http.post(`/api/notificacoes/${n.id}/lida`, eu.autorizacao)).status).toBe(204)
      expect((await http.post(`/api/notificacoes/${n.id}/lida`, eu.autorizacao)).status).toBe(204)
      expect(corpo<Saida>(await http.get('/api/notificacoes', eu.autorizacao)).naoLidas).toBe(0)
    })

    it('POST /:id/lida de outra pessoa, de outro clube ou inexistente: 404 e nada muda', async () => {
      const clube = await criarClube()
      const outroClube = await criarClube()
      const eu = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const outro = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alheia = await criarNotificacao({ clubeId: clube.id, usuarioId: outro.usuario.id })
      const doMesmoUsuarioEmOutroClube = await criarNotificacao({ clubeId: outroClube.id, usuarioId: eu.usuario.id })
      await criarVinculo({ usuarioId: eu.usuario.id, clubeId: outroClube.id, papel: 'ADM' })
      for (const id of [alheia.id, doMesmoUsuarioEmOutroClube.id, '00000000-0000-7000-8000-000000000000']) {
        expect((await http.post(`/api/notificacoes/${id}/lida`, eu.autorizacao)).status).toBe(404)
      }
      const depois = await prismaDeTeste().notificacao.findMany({ where: { id: { in: [alheia.id, doMesmoUsuarioEmOutroClube.id] } } })
      expect(depois.every((linha) => linha.lidaEm === null)).toBe(true)
    })

    it('POST /lidas marca todas as minhas, e so as minhas', async () => {
      const clube = await criarClube()
      const outroClube = await criarClube()
      const eu = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const outro = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id })
      await criarNotificacao({ clubeId: clube.id, usuarioId: eu.usuario.id })
      const doOutro = await criarNotificacao({ clubeId: clube.id, usuarioId: outro.usuario.id })
      const emOutroClube = await criarNotificacao({ clubeId: outroClube.id, usuarioId: eu.usuario.id })

      expect((await http.post('/api/notificacoes/lidas', eu.autorizacao)).status).toBe(204)
      expect(corpo<Saida>(await http.get('/api/notificacoes', eu.autorizacao)).naoLidas).toBe(0)
      const intactas = await prismaDeTeste().notificacao.findMany({ where: { id: { in: [doOutro.id, emOutroClube.id] } } })
      expect(intactas.every((linha) => linha.lidaEm === null)).toBe(true)
    })

    it('sem login: 401', async () => {
      expect((await http.get('/api/notificacoes', 'Bearer invalido')).status).toBe(401)
    })
  })
})
