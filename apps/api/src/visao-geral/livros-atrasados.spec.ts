import type { INestApplication } from '@nestjs/common'
import type { EmprestimosSaida, VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
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
import { clienteHttp, corpo } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral: livros atrasados', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 21/10/2026.
  beforeEach(() => congelarRelogio('2026-10-21T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  const dia = (data: string): Date => new Date(`${data}T00:00:00Z`)

  async function clubeComLivro(exemplares: number) {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const categoria = await prismaDeTeste().categoriaBiblioteca.create({ data: { clubeId: clube.id, nome: 'Livros', ordem: 1 } })
    const item = await prismaDeTeste().itemBiblioteca.create({
      data: { clubeId: clube.id, categoriaId: categoria.id, nome: 'Pilgrim', ordem: 1, tipo: 'FISICO', enviadoPorId: adm.usuario.id },
    })
    const ids: string[] = []
    for (let numero = 1; numero <= exemplares; numero++) {
      ids.push((await prismaDeTeste().exemplarBiblioteca.create({ data: { clubeId: clube.id, itemId: item.id, numero } })).id)
    }
    return { clube, adm, item, exemplarIds: ids }
  }

  /** Empréstimo aberto de um desbravador novo, com devolução em `devolverAte`. */
  async function emprestarAte(base: { clube: { id: string }; adm: Acesso; exemplarIds: string[] }, indice: number, devolverAte: string, nome = `Leitor ${indice}`) {
    const dbv = await criarDbv({ clubeId: base.clube.id, nome })
    await prismaDeTeste().emprestimoBiblioteca.create({
      data: {
        clubeId: base.clube.id,
        exemplarId: base.exemplarIds[indice],
        desbravadorId: dbv.id,
        emprestadoEm: dia('2026-09-01'),
        devolverAte: dia(devolverAte),
        emprestadoPorId: base.adm.usuario.id,
      },
    })
    return dbv
  }

  const visaoDe = async (adm: Acesso): Promise<Visao['livrosAtrasados']> =>
    corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).livrosAtrasados

  it('clube sem livro físico: null (o cartão some), mesmo com livro digital', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    expect(await visaoDe(adm)).toBeNull()
  })

  it('só livro físico removido conta como sem livro físico: null', async () => {
    const base = await clubeComLivro(1)
    await prismaDeTeste().itemBiblioteca.update({ where: { id: base.item.id }, data: { removidoEm: new Date() } })
    expect(await visaoDe(base.adm)).toBeNull()
  })

  it('com livro físico e nada atrasado: total 0 e lista vazia (vence hoje e no prazo não contam)', async () => {
    const base = await clubeComLivro(2)
    await emprestarAte(base, 0, '2026-10-21')
    await emprestarAte(base, 1, '2026-11-04')
    expect(await visaoDe(base.adm)).toEqual({ total: 0, itens: [] })
  })

  it('devolvido não conta, e atrasado traz título, nome, unidade atual e dias (mínimo 1)', async () => {
    const base = await clubeComLivro(2)
    const unidade = await criarUnidade({ clubeId: base.clube.id, nome: 'Águias' })
    const dbv = await emprestarAte(base, 0, '2026-10-20', 'Ana Atrasada')
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-03-01' })
    const devolvido = await criarDbv({ clubeId: base.clube.id })
    await prismaDeTeste().emprestimoBiblioteca.create({
      data: {
        clubeId: base.clube.id,
        exemplarId: base.exemplarIds[1],
        desbravadorId: devolvido.id,
        emprestadoEm: dia('2026-08-01'),
        devolverAte: dia('2026-08-15'),
        devolvidoEm: dia('2026-10-01'),
        emprestadoPorId: base.adm.usuario.id,
        devolvidoPorId: base.adm.usuario.id,
      },
    })

    const emprestimo = await prismaDeTeste().emprestimoBiblioteca.findFirstOrThrow({ where: { desbravadorId: dbv.id } })
    expect(await visaoDe(base.adm)).toEqual({
      total: 1,
      itens: [{ emprestimoId: emprestimo.id, titulo: 'Pilgrim', desbravadorNome: 'Ana Atrasada', desbravadorAtivo: true, unidade: 'Águias', dias: 1 }],
    })
  })

  it('mais de 5 atrasados: 5 itens, os mais atrasados primeiro, e o total é o real', async () => {
    const base = await clubeComLivro(7)
    // Atrasos de 1 a 7 dias, gravados fora de ordem.
    const atrasos = [3, 7, 1, 5, 2, 6, 4]
    for (const [indice, dias] of atrasos.entries()) {
      await emprestarAte(base, indice, `2026-10-${String(21 - dias).padStart(2, '0')}`)
    }

    const cartao = await visaoDe(base.adm)

    expect(cartao?.total).toBe(7)
    expect(cartao?.itens.map((item) => item.dias)).toEqual([7, 6, 5, 4, 3])
  })

  it('desbravador inativado com livro aberto continua atrasado, marcado como inativo e sem unidade', async () => {
    const base = await clubeComLivro(1)
    const unidade = await criarUnidade({ clubeId: base.clube.id })
    const dbv = await emprestarAte(base, 0, '2026-10-01', 'Ivo Inativo')
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-03-01' })
    await prismaDeTeste().desbravador.update({ where: { id: dbv.id }, data: { ativo: false } })

    const cartao = await visaoDe(base.adm)

    expect(cartao?.total).toBe(1)
    expect(cartao?.itens[0]).toMatchObject({ desbravadorNome: 'Ivo Inativo', desbravadorAtivo: false, unidade: null, dias: 20 })
  })

  it('o total é o mesmo número do selo da aba Empréstimos (totais.atrasados)', async () => {
    const base = await clubeComLivro(4)
    await emprestarAte(base, 0, '2026-10-20')
    await emprestarAte(base, 1, '2026-10-01')
    await emprestarAte(base, 2, '2026-10-21')
    await emprestarAte(base, 3, '2026-12-01')

    const cartao = await visaoDe(base.adm)
    const aba = corpo<EmprestimosSaida>(await api.get('/api/biblioteca/emprestimos', base.adm.autorizacao).expect(200))

    expect(cartao?.total).toBe(2)
    expect(cartao?.total).toBe(aba.totais.atrasados)
  })

  it('atraso e livro físico de outro clube nunca entram', async () => {
    const meu = await clubeComLivro(1)
    const outro = await clubeComLivro(1)
    await emprestarAte(outro, 0, '2026-09-01')

    expect(await visaoDe(meu.adm)).toEqual({ total: 0, itens: [] })
  })
})
