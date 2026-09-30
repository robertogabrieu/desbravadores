import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import { criarClube, criarUsuario, desconectarPrismaDeTeste } from '../../test/fabricas'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoAtividade } from './servico-atividade'

describe('ServicoAtividade.registrar', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await criarAppDeTeste()
  }, 30_000)
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('grava a atividade do clube com autor, descricao e link', async () => {
    const clube = await criarClube()
    const autor = await criarUsuario()
    const prisma = app.get(PrismaService)
    await prisma.$transaction((tx) =>
      app.get(ServicoAtividade).registrar(tx, { clubeId: clube.id, autorId: autor.id, tipo: 'CRONOGRAMA_PUBLICADO', descricao: 'Cronograma publicado', link: '/adm/classes' }),
    )
    await prisma.$transaction((tx) =>
      app.get(ServicoAtividade).registrar(tx, { clubeId: clube.id, autorId: autor.id, tipo: 'EVENTO_CRIADO', descricao: 'Evento criado', link: null }),
    )
    const linhas = await prisma.atividade.findMany({ where: { clubeId: clube.id }, orderBy: { descricao: 'asc' } })
    expect(linhas.map((a) => [a.autorId, a.tipo, a.descricao, a.link])).toEqual([
      [autor.id, 'CRONOGRAMA_PUBLICADO', 'Cronograma publicado', '/adm/classes'],
      [autor.id, 'EVENTO_CRIADO', 'Evento criado', null],
    ])
  })

  it('a transacao que falha nao deixa atividade para tras', async () => {
    const clube = await criarClube()
    const autor = await criarUsuario()
    const prisma = app.get(PrismaService)
    await expect(
      prisma.$transaction(async (tx) => {
        await app.get(ServicoAtividade).registrar(tx, { clubeId: clube.id, autorId: autor.id, tipo: 'AULA_REGISTRADA', descricao: 'x', link: null })
        throw new Error('desfaz')
      }),
    ).rejects.toThrow('desfaz')
    expect(await prisma.atividade.count({ where: { clubeId: clube.id } })).toBe(0)
  })
})
