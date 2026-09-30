import type { INestApplication } from '@nestjs/common'
import type { CronogramaLeitura } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarCronograma,
  criarClube,
  criarEvento,
  criarRegistroAula,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo, criarClasseDoClube, hoje } from '../../test/p6'
import { ServicoCronograma } from './servico-cronograma'

type Leitura = z.infer<typeof CronogramaLeitura>

/** Congela so o `Date` (o resto do tempo segue real, para o banco e o HTTP). */
function congelarRelogio(instante: string): void {
  jest.useFakeTimers({
    now: new Date(instante),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  })
}

function dia(deslocamento: number): string {
  const data = new Date(`${hoje()}T00:00:00Z`)
  data.setUTCDate(data.getUTCDate() + deslocamento)
  return data.toISOString().slice(0, 10)
}

async function requisitosDa(classeId: string, quantos: number): Promise<string[]> {
  const requisitos = await prismaDeTeste().requisito.findMany({
    where: { secao: { classeId }, ativo: true },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
    take: quantos,
    select: { id: true },
  })
  return requisitos.map((requisito) => requisito.id)
}

describe('GET /api/classes/:id/cronograma', () => {
  let app: INestApplication
  const http = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })
  // Meio do ano do clube: os dias relativos (-10 a +30) nunca cruzam a virada de 01/02 nem o fim do ano.
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => jest.useRealTimers())

  const rota = (classeId: string, ano?: number): string => `/api/classes/${classeId}/cronograma${ano ? `?anoClube=${ano}` : ''}`

  async function cenario() {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const requisitos = await requisitosDa(amigo.id, 4)
    return { clube, amigo, adm, instrutor, requisitos }
  }

  it('Adm recebe o cronograma vivo, com o status real, requisitos e situacao PLANEJADA', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, status: 'ENVIADO', aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 2) }] })
    const resposta = await http.get(rota(amigo.id), adm.autorizacao)
    expect(resposta.status).toBe(200)
    const leitura = corpo<Leitura>(resposta)
    expect(leitura).toMatchObject({ fonte: 'VIVO', status: 'ENVIADO', podeMontar: true, anoClube: anoCorrente(), classe: { id: amigo.id } })
    expect(leitura.aulas).toHaveLength(1)
    expect(leitura.aulas[0]).toMatchObject({ origem: 'PLANEJADA', data: dia(5), situacao: 'PLANEJADA', registroAulaId: null })
    expect(leitura.aulas[0]?.requisitos.map((r) => r.id).sort()).toEqual([...requisitos.slice(0, 2)].sort())
  })

  it('instrutor sem publicacao: lista vazia, status e fonte nulos, nao monta', async () => {
    const { clube, amigo, instrutor, requisitos } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 1) }] })
    const leitura = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao))
    expect(leitura).toMatchObject({ aulas: [], status: null, fonte: null, podeMontar: false })
  })

  it('sem cronograma nenhum (ou em outro ano): cronogramaId nulo e lista vazia', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 1) }] })
    const outroAno = corpo<Leitura>(await http.get(rota(amigo.id, anoCorrente() + 1), adm.autorizacao))
    expect(outroAno).toMatchObject({ cronogramaId: null, aulas: [], status: null, fonte: null, anoClube: anoCorrente() + 1 })
  })

  it('instrutor ve so o publicado, com status mascarado; o que mudou no vivo depois nao aparece', async () => {
    const { clube, amigo, adm, instrutor, requisitos } = await cenario()
    const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, status: 'PUBLICADO', aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 1) }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
    await prismaDeTeste().aulaPlanejada.create({ data: { clubeId: clube.id, cronogramaId: cronograma.id, data: new Date(`${dia(12)}T00:00:00Z`) } })
    await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'RASCUNHO' } })

    const doInstrutor = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao))
    expect(doInstrutor).toMatchObject({ fonte: 'PUBLICADO', status: 'PUBLICADO', podeMontar: false, cronogramaId: cronograma.id })
    expect(doInstrutor.publicadoEm).not.toBeNull()
    expect(doInstrutor.aulas.map((aula) => aula.data)).toEqual([dia(5)])

    const doAdm = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao))
    expect(doAdm).toMatchObject({ fonte: 'VIVO', status: 'RASCUNHO' })
    expect(doAdm.aulas.map((aula) => aula.data)).toEqual([dia(5), dia(12)])
  })

  it('a ultima publicacao vence, e o retrato repetido nao duplica aulas', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 1) }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
    const aula = cronograma.aulas[0]
    const retrato = { id: aula.id, data: dia(5), horario: null, local: null, titulo: null, requisitoIds: requisitos.slice(0, 1) }
    await prismaDeTeste().cronogramaPublicacao.create({
      data: { clubeId: clube.id, cronogramaId: cronograma.id, conteudo: { aulas: [retrato, retrato] }, publicadoPorId: adm.usuario.id },
    })
    const servico = app.get(ServicoCronograma)
    const ultima = await servico.ultimaPublicacao(clube.id, cronograma.id)
    expect(ultima?.aulas).toHaveLength(1)
    expect(await servico.ultimaPublicacao(clube.id, (await criarCronograma({ clubeId: clube.id, classeId: (await classeOficial('Companheiro')).id })).id)).toBeNull()
  })

  it('instrutor com a classe liberada para montar recebe o vivo', async () => {
    const { clube, amigo, instrutor, requisitos } = await cenario()
    await prismaDeTeste().classeClube.update({ where: { clubeId_classeId: { clubeId: clube.id, classeId: amigo.id } }, data: { quemMontaCronograma: 'INSTRUTOR' } })
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, status: 'ENVIADO', aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 1) }] })
    const leitura = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao))
    expect(leitura).toMatchObject({ fonte: 'VIVO', status: 'ENVIADO', podeMontar: true })
    expect(leitura.aulas).toHaveLength(1)
  })

  it('o ajuste do clube vale no campo do requisito', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: requisitos[0], campo: true } })
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: requisitos[1], campo: false } })
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(5), requisitoIds: requisitos.slice(0, 2) }] })
    const leitura = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao))
    const campo = new Map(leitura.aulas[0]?.requisitos.map((r) => [r.id, r.campo]))
    expect(campo.get(requisitos[0])).toBe(true)
    expect(campo.get(requisitos[1])).toBe(false)
  })

  it('na virada do ano do clube: 31/01 ainda le o ano anterior, 01/02 ja le o novo', async () => {
    // O token de acesso vale poucos minutos: cada dia emite o seu, com o relogio ja no dia.
    congelarRelogio('2027-01-31T15:00:00Z')
    const { clube, amigo, adm } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id })
    expect(corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao))).toMatchObject({ anoClube: 2026, aulas: [] })
    expect(corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao)).cronogramaId).not.toBeNull()

    congelarRelogio('2027-02-01T15:00:00Z')
    const admDoDia = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    expect(anoCorrente()).toBe(2027)
    expect(corpo<Leitura>(await http.get(rota(amigo.id), admDoDia.autorizacao))).toMatchObject({ anoClube: 2027, cronogramaId: null, aulas: [] })
  })

  it('sem cronograma: quem monta ve os registros do ano como EXTRA; quem nao monta, nada', async () => {
    const { clube, amigo, adm, instrutor } = await cenario()
    const registro = await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(-4) })
    const doAdm = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao))
    expect(doAdm).toMatchObject({ cronogramaId: null, status: null, fonte: null, podeMontar: true })
    expect(doAdm.aulas).toMatchObject([{ origem: 'EXTRA', data: dia(-4), situacao: 'DADA', registroAulaId: registro.id }])
    const doInstrutor = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao))
    expect(doInstrutor).toMatchObject({ cronogramaId: null, podeMontar: false, aulas: [] })

    await prismaDeTeste().classeClube.update({ where: { clubeId_classeId: { clubeId: clube.id, classeId: amigo.id } }, data: { quemMontaCronograma: 'INSTRUTOR' } })
    const liberado = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao))
    expect(liberado).toMatchObject({ podeMontar: true })
    expect(liberado.aulas.map((aula) => aula.registroAulaId)).toEqual([registro.id])
  })

  it('conselheiro: 403', async () => {
    const { clube, amigo } = await cenario()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    expect((await http.get(rota(amigo.id), conselheiro.autorizacao)).status).toBe(403)
  })

  it('instrutor de outra classe, classe de outro clube e classe inexistente: 404', async () => {
    const { clube, adm, instrutor } = await cenario()
    const companheiro = await classeOficial('Companheiro')
    expect((await http.get(rota(companheiro.id), instrutor.autorizacao)).status).toBe(404)
    const outroClube = await criarClube()
    const classeAlheia = await criarClasseDoClube(outroClube.id)
    expect((await http.get(rota(classeAlheia.id), adm.autorizacao)).status).toBe(404)
    expect((await http.get(rota('00000000-0000-7000-8000-000000000000'), adm.autorizacao)).status).toBe(404)
    expect((await http.get(rota(companheiro.id), adm.autorizacao)).status).toBe(200)
    expect(clube.id).toBeDefined()
  })

  it('aula registrada vira DADA e aponta o registro; hoje e passada sem registro se distinguem', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    await criarCronograma({
      clubeId: clube.id,
      classeId: amigo.id,
      aulas: [
        { data: dia(-7), requisitoIds: requisitos.slice(0, 1) },
        { data: dia(-3), requisitoIds: requisitos.slice(1, 2) },
        { data: dia(0), requisitoIds: requisitos.slice(2, 3) },
        { data: dia(4), requisitoIds: requisitos.slice(3, 4) },
      ],
    })
    const registro = await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(-7) })
    const aulas = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao)).aulas
    expect(aulas.map((aula) => aula.situacao)).toEqual(['DADA', 'NAO_REGISTRADA', 'HOJE', 'PLANEJADA'])
    expect(aulas[0]?.registroAulaId).toBe(registro.id)
    expect(aulas[1]?.registroAulaId).toBeNull()
  })

  it('registro em data sem aula planejada aparece como EXTRA, DADA e na ordem por data', async () => {
    const { clube, amigo, adm, requisitos } = await cenario()
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(-10), requisitoIds: requisitos.slice(0, 1) }, { data: dia(6), requisitoIds: requisitos.slice(1, 2) }] })
    const extra = await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(-4) })
    const aulas = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao)).aulas
    expect(aulas.map((aula) => aula.data)).toEqual([dia(-10), dia(-4), dia(6)])
    expect(aulas[1]).toMatchObject({ origem: 'EXTRA', id: null, situacao: 'DADA', registroAulaId: extra.id, requisitos: [] })
  })

  it('o EXTRA tambem aparece para o instrutor que ve o publicado', async () => {
    const { clube, amigo, adm, instrutor, requisitos } = await cenario()
    const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(6), requisitoIds: requisitos.slice(0, 1) }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
    await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(-4) })
    const aulas = corpo<Leitura>(await http.get(rota(amigo.id), instrutor.autorizacao)).aulas
    expect(aulas.map((aula) => [aula.origem, aula.data])).toEqual([['EXTRA', dia(-4)], ['PLANEJADA', dia(6)]])
  })

  describe('conflito com o calendario', () => {
    it('individual futura com requisitos e sem registro numa data que deixou de ser de aula: CONFLITO', async () => {
      const { clube, amigo, adm, requisitos } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: dia(10) })
      await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: dia(20), fim: dia(21) })
      await criarCronograma({
        clubeId: clube.id,
        classeId: amigo.id,
        aulas: [
          { data: dia(10), requisitoIds: requisitos.slice(0, 1) },
          { data: dia(20), requisitoIds: requisitos.slice(1, 2) },
          { data: dia(30), requisitoIds: requisitos.slice(2, 3) },
        ],
      })
      const aulas = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao)).aulas
      expect(aulas.map((aula) => aula.situacao)).toEqual(['CONFLITO', 'PLANEJADA', 'PLANEJADA'])
    })

    it('data passada, aula sem requisitos ou com registro nao conflitam', async () => {
      const { clube, amigo, adm, requisitos } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: dia(-6), fim: dia(20) })
      await criarCronograma({
        clubeId: clube.id,
        classeId: amigo.id,
        aulas: [
          { data: dia(-5), requisitoIds: requisitos.slice(0, 1) },
          { data: dia(5), requisitoIds: [] },
          { data: dia(8), requisitoIds: requisitos.slice(1, 2) },
        ],
      })
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(8) })
      const aulas = corpo<Leitura>(await http.get(rota(amigo.id), adm.autorizacao)).aulas
      expect(aulas.map((aula) => aula.situacao)).toEqual(['NAO_REGISTRADA', 'PLANEJADA', 'DADA'])
    })

    it('trilha agrupada nunca conflita', async () => {
      const { clube, adm } = await cenario()
      const classe = await prismaDeTeste().classe.create({
        data: { clubeId: clube.id, origem: 'CLUBE', nome: 'Agrupada', tipo: 'REGULAR', trilha: 'AGRUPADAS', ordem: 998 },
      })
      const secao = await prismaDeTeste().secaoRequisito.create({ data: { classeId: classe.id, codigo: 'S1', nome: 'Secao', ordem: 1 } })
      const requisito = await prismaDeTeste().requisito.create({ data: { secaoId: secao.id, codigo: 'R1', texto: 'Texto', ordem: 1 } })
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: dia(10) })
      await criarCronograma({ clubeId: clube.id, classeId: classe.id, aulas: [{ data: dia(10), requisitoIds: [requisito.id] }] })
      const aulas = corpo<Leitura>(await http.get(rota(classe.id), adm.autorizacao)).aulas
      expect(aulas.map((aula) => aula.situacao)).toEqual(['PLANEJADA'])
    })
  })

  describe('isolamento entre clubes (mesma classe oficial nos dois)', () => {
    it('cronograma, publicacao, registro e evento do outro clube nao aparecem nem conflitam', async () => {
      const a = await cenario()
      const b = await cenario()
      const cronogramaB = await criarCronograma({ clubeId: b.clube.id, classeId: b.amigo.id, aulas: [{ data: dia(10), requisitoIds: b.requisitos.slice(0, 1) }] })
      await publicarCronograma({ cronogramaId: cronogramaB.id, publicadoPorId: b.adm.usuario.id })
      await criarRegistroAula({ clubeId: b.clube.id, classeId: b.amigo.id, data: dia(-2) })
      await criarEvento({ clubeId: b.clube.id, tipo: 'EVENTO', inicio: dia(15) })
      await criarCronograma({ clubeId: a.clube.id, classeId: a.amigo.id, aulas: [{ data: dia(15), requisitoIds: a.requisitos.slice(0, 1) }] })

      const doA = corpo<Leitura>(await http.get(rota(a.amigo.id), a.adm.autorizacao))
      expect(doA.aulas.map((aula) => [aula.origem, aula.data, aula.situacao])).toEqual([['PLANEJADA', dia(15), 'PLANEJADA']])
      expect(doA.cronogramaId).not.toBe(cronogramaB.id)
      const instrutorA = corpo<Leitura>(await http.get(rota(a.amigo.id), a.instrutor.autorizacao))
      expect(instrutorA.aulas).toEqual([])
    })
  })
})

describe('ServicoCronograma.instrutoresDaClasse (B10)', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('a mesma classe oficial em dois clubes nao mistura instrutores; inativo e outros papeis ficam fora', async () => {
    const amigo = await classeOficial('Amigo')
    const clubeA = await criarClube()
    const clubeB = await criarClube()
    const ativo = await criarAcesso({ clubeId: clubeA.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const doOutroClube = await criarAcesso({ clubeId: clubeB.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const usuarioInativo = await criarUsuario()
    await criarVinculo({ usuarioId: usuarioInativo.id, clubeId: clubeA.id, papel: 'INSTRUTOR', ativo: false, classeIds: [amigo.id] })
    const outraClasse = await criarAcesso({ clubeId: clubeA.id, papel: 'INSTRUTOR', classeIds: [(await classeOficial('Companheiro')).id] })

    const servico = app.get(ServicoCronograma)
    expect(await servico.instrutoresDaClasse(clubeA.id, amigo.id)).toEqual([{ usuarioId: ativo.usuario.id, nome: ativo.usuario.nome }])
    expect(await servico.instrutoresDaClasse(clubeB.id, amigo.id)).toEqual([{ usuarioId: doOutroClube.usuario.id, nome: doOutroClube.usuario.nome }])
    expect(outraClasse.usuario.id).toBeDefined()
  })
})
