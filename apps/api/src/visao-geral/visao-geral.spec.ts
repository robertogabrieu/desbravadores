import type { INestApplication } from '@nestjs/common'
import { mediaTurma, percentualClasse, type VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import {
  admCriarDbvComDatas,
  admDefinirClasseClube,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarEspecialidadeConcluida,
  criarMatricula,
  criarMembro,
  criarRequisitoConcluido,
  criarReuniao,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral (GET /visao-geral)', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 15/06/2026: ano do clube 2026 (02/01/2026 a 31/01/2027); ha 3 meses = 15/03/2026.
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  it('conselheiro e instrutor → 403', async () => {
    const clube = await criarClube()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    await api.get('/api/visao-geral', conselheiro.autorizacao).expect(403)
    await api.get('/api/visao-geral', instrutor.autorizacao).expect(403)
  })

  it('clube vazio: zeros, nulos e listas vazias (nada vaza do outro clube)', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const unidadeOutro = await criarUnidade({ clubeId: outro.id })
    const dbvOutro = await admCriarDbvComDatas({ clubeId: outro.id, entradaEm: '2026-01-10' })
    await criarMembro({ dbvId: dbvOutro.id, unidadeId: unidadeOutro.id, inicio: '2026-02-01' })
    await criarReuniao({ unidadeId: unidadeOutro.id, data: '2026-06-07', chamada: [{ dbvId: dbvOutro.id }] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    const saida = corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200))
    expect(saida).toMatchObject({
      dbvsAtivos: 0, variacaoTrimestre: 0, unidades: 0, instrutores: 0, classesCobertas: 0,
      frequenciaMes: null, variacaoFrequencia: null, especialidadesAno: 0, especialidadesPorDbv: 0,
      unidadesResumo: [], cronogramasEnviados: [], atividades: [],
    })
    expect(saida.progressoClasses.every((c) => c.totalDbvs === 0 && c.media === null && c.instrutores.length === 0)).toBe(true)
  })

  it('cada numero de G10 com dados semeados', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    const pesquisador = await classeOficial('Pesquisador')
    const guia = await classeOficial('Guia')

    // DBVs: ativos hoje = d1, d2, d3, d6 (4); ativos ha 3 meses = d1, d2, d4 (3, d4 saiu depois).
    const d1 = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-10' })
    const d2 = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-02-01' })
    const d3 = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-06-01' })
    const d4 = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-01', saidaEm: '2026-05-01' })
    await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-01', saidaEm: '2026-02-20' })
    const d6 = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-06-10' })
    await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-10', tipo: 'LIDER' })
    await admCriarDbvComDatas({ clubeId: outro.id, entradaEm: '2026-01-10' })

    // Unidades: A, B e C ativas; D inativa.
    const unidadeA = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
    const unidadeB = await criarUnidade({ clubeId: clube.id, nome: 'Bravos' })
    const unidadeC = await criarUnidade({ clubeId: clube.id, nome: 'Condores' })
    const unidadeD = await criarUnidade({ clubeId: clube.id, nome: 'Dragoes' })
    await prismaDeTeste().unidade.update({ where: { id: unidadeD.id }, data: { ativa: false } })
    await criarMembro({ dbvId: d1.id, unidadeId: unidadeA.id, inicio: '2026-02-01' })
    await criarMembro({ dbvId: d2.id, unidadeId: unidadeA.id, inicio: '2026-02-01' })
    await criarMembro({ dbvId: d4.id, unidadeId: unidadeA.id, inicio: '2026-01-01', fim: '2026-05-01' })
    await criarMembro({ dbvId: d3.id, unidadeId: unidadeB.id, inicio: '2026-06-01' })
    await criarMembro({ dbvId: d6.id, unidadeId: unidadeB.id, inicio: '2026-06-10' })
    const conselheiro = await criarUsuario({ nome: 'Carla Conselheira' })
    await criarVinculo({ usuarioId: conselheiro.id, clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidadeA.id] })

    // Instrutores (2 ativos, 1 inativo): Amigo e Companheiro cobertas; Pesquisador desativada; Guia so com instrutor inativo.
    const ana = await criarUsuario({ nome: 'Ana Instrutora' })
    const bia = await criarUsuario({ nome: 'Bia Instrutora' })
    const caio = await criarUsuario({ nome: 'Caio Inativo' })
    await criarVinculo({ usuarioId: ana.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id, companheiro.id] })
    await criarVinculo({ usuarioId: bia.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id, pesquisador.id] })
    await criarVinculo({ usuarioId: caio.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [guia.id], ativo: false })
    await criarAcesso({ clubeId: outro.id, papel: 'INSTRUTOR', classeIds: [guia.id] })
    await admDefinirClasseClube({ clubeId: clube.id, classeId: pesquisador.id, ativa: false })

    // Frequencia: junho ate hoje = 4 presencas em 6 linhas (67); maio = 3 em 4 (75); fora do mes e futuro nao contam.
    await criarReuniao({ unidadeId: unidadeA.id, data: '2026-06-01', chamada: [
      { dbvId: d1.id, situacao: 'PRESENTE' }, { dbvId: d2.id, situacao: 'ATRASADO' },
      { dbvId: d3.id, situacao: 'FALTA' }, { dbvId: d6.id, situacao: 'FALTA_JUSTIFICADA' },
    ] })
    await criarReuniao({ unidadeId: unidadeB.id, data: '2026-06-15', chamada: [{ dbvId: d6.id, situacao: 'PRESENTE' }, { dbvId: d3.id, situacao: 'PRESENTE' }] })
    await criarReuniao({ unidadeId: unidadeA.id, data: '2026-06-28', chamada: [{ dbvId: d1.id, situacao: 'FALTA' }, { dbvId: d2.id, situacao: 'FALTA' }] })
    await criarReuniao({ unidadeId: unidadeA.id, data: '2026-05-10', chamada: [{ dbvId: d1.id, situacao: 'PRESENTE' }, { dbvId: d2.id, situacao: 'FALTA' }] })
    await criarReuniao({ unidadeId: unidadeA.id, data: '2026-05-31', chamada: [{ dbvId: d1.id, situacao: 'PRESENTE' }, { dbvId: d2.id, situacao: 'PRESENTE' }] })
    await criarReuniao({ unidadeId: unidadeA.id, data: '2026-04-30', chamada: [{ dbvId: d1.id, situacao: 'FALTA' }] })
    const unidadeOutro = await criarUnidade({ clubeId: outro.id })
    await criarReuniao({ unidadeId: unidadeOutro.id, data: '2026-06-07', chamada: [{ dbvId: (await admCriarDbvComDatas({ clubeId: outro.id, entradaEm: '2026-01-01' })).id, situacao: 'FALTA' }] })

    // Especialidades: 3 no ano do clube (03/2026 x2 e 01/02/2026); 31/01/2026, removida e de outro clube ficam fora.
    const especialidades = await prismaDeTeste().especialidade.findMany({ where: { clubeId: null }, take: 6, orderBy: { id: 'asc' } })
    const [e1, e2, e3, e4, e5, e6] = especialidades
    await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: d1.id, especialidadeId: e1.id, concluidaEm: '2026-03-01' })
    await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: d2.id, especialidadeId: e2.id, concluidaEm: '2026-03-01' })
    await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: d4.id, especialidadeId: e3.id, concluidaEm: '2026-02-01' })
    await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: d1.id, especialidadeId: e4.id, concluidaEm: '2026-01-31' })
    const removida = await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: d1.id, especialidadeId: e5.id, concluidaEm: '2026-04-01' })
    await prismaDeTeste().especialidadeConcluida.update({ where: { id: removida.id }, data: { removidoEm: new Date(), removidoPorId: adm.usuario.id } })
    const dbvOutro = await admCriarDbvComDatas({ clubeId: outro.id, entradaEm: '2026-01-01' })
    await criarEspecialidadeConcluida({ clubeId: outro.id, dbvId: dbvOutro.id, especialidadeId: e6.id, concluidaEm: '2026-03-01' })

    // Progresso: Amigo com d1 (1 requisito) e d2 (nenhum); o requisito removido de d2 nao conta.
    const detalhe = corpo<{ totalRequisitos: number; secoes: { requisitos: { id: string; ativo: boolean }[] }[] }>(
      await api.get(`/api/classes/${amigo.id}`, adm.autorizacao).expect(200),
    )
    const [r1, r2] = detalhe.secoes.flatMap((s) => s.requisitos).filter((r) => r.ativo)
    await criarMatricula({ clubeId: clube.id, dbvId: d1.id, classeId: amigo.id, anoClube: 2026 })
    await criarMatricula({ clubeId: clube.id, dbvId: d2.id, classeId: amigo.id, anoClube: 2026 })
    await criarMatricula({ clubeId: clube.id, dbvId: d3.id, classeId: amigo.id, anoClube: 2025 })
    await criarRequisitoConcluido({ clubeId: clube.id, dbvId: d1.id, requisitoId: r1.id })
    const requisitoRemovido = await criarRequisitoConcluido({ clubeId: clube.id, dbvId: d2.id, requisitoId: r2.id })
    await prismaDeTeste().requisitoConcluido.update({ where: { id: requisitoRemovido.id }, data: { removidoEm: new Date(), removidoPorId: adm.usuario.id } })

    // Cronogramas: so o ENVIADO aparece.
    const enviado = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, status: 'ENVIADO' })
    await prismaDeTeste().cronograma.update({ where: { id: enviado.id }, data: { enviadoPorId: ana.id, enviadoEm: new Date('2026-06-10T12:00:00Z') } })
    await criarCronograma({ clubeId: clube.id, classeId: companheiro.id, status: 'RASCUNHO' })
    await criarCronograma({ clubeId: clube.id, classeId: guia.id, status: 'PUBLICADO' })
    await criarCronograma({ clubeId: outro.id, classeId: amigo.id, status: 'ENVIADO' })

    const saida = corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200))

    expect(saida).toMatchObject({
      dbvsAtivos: 4, variacaoTrimestre: 1, unidades: 3, instrutores: 2, classesCobertas: 2,
      frequenciaMes: 67, variacaoFrequencia: -8, especialidadesAno: 3, especialidadesPorDbv: 0.8,
    })

    const porClasse = (id: string) => saida.progressoClasses.find((c) => c.classe.id === id)
    expect(porClasse(amigo.id)).toMatchObject({
      media: mediaTurma([percentualClasse(1, detalhe.totalRequisitos), 0]), totalDbvs: 2, instrutores: ['Ana Instrutora', 'Bia Instrutora'],
    })
    expect(porClasse(companheiro.id)).toMatchObject({ media: null, totalDbvs: 0, instrutores: ['Ana Instrutora'] })
    expect(porClasse(pesquisador.id)).toBeUndefined()

    expect(saida.unidadesResumo.map((u) => u.nome)).toEqual(['Aguias', 'Bravos', 'Condores'])
    expect(saida.unidadesResumo[0]).toMatchObject({ id: unidadeA.id, conselheiros: ['Carla Conselheira'], totalDbvs: 2, frequenciaMes: 50 })
    expect(saida.unidadesResumo[1]).toMatchObject({ id: unidadeB.id, conselheiros: [], totalDbvs: 2, frequenciaMes: 100 })
    expect(saida.unidadesResumo[2]).toMatchObject({ id: unidadeC.id, totalDbvs: 0, frequenciaMes: null })

    expect(saida.cronogramasEnviados).toEqual([
      { cronogramaId: enviado.id, classe: expect.objectContaining({ id: amigo.id }) as unknown, enviadoPor: 'Ana Instrutora', enviadoEm: '2026-06-10T12:00:00.000Z' },
    ])
  })

  it('progresso por classe: classe desativada não aparece, nem com matrícula de quem já estava nela', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const retirada = await criarClasseDoClube(clube.id, 'Retirada')
    const dbv = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-10' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: retirada.id, anoClube: 2026 })
    const idsNaVisao = async (): Promise<string[]> =>
      corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).progressoClasses.map((c) => c.classe.id)
    expect(await idsNaVisao()).toContain(retirada.id)
    await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })
    expect(await idsNaVisao()).not.toContain(retirada.id)
  })

  it('progresso por classe: oficial inativo não volta por ajuste, ajuste false desliga, null usa o oficial', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const classe = await classeOficial('Pesquisador')
    const dbv = await admCriarDbvComDatas({ clubeId: clube.id, entradaEm: '2026-01-10' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: 2026 })
    const [ativo1, ativo2, inativo] = await prismaDeTeste().requisito.findMany({ where: { secao: { classeId: classe.id }, ativo: true }, take: 3, select: { id: true } })
    await criarRequisitoConcluido({ clubeId: clube.id, dbvId: dbv.id, requisitoId: ativo1.id })
    // O catálogo oficial é compartilhado e só tem requisitos ativos: em vez de criar um, este teste desliga um da
    // classe Pesquisador (que nenhum outro teste conta) e o religa no finally; o resto só mexe em ajuste do clube.
    await prismaDeTeste().requisito.update({ where: { id: inativo.id }, data: { ativo: false } })

    const totalDoDetalhe = async (): Promise<number> =>
      corpo<{ totalRequisitos: number }>(await api.get(`/api/classes/${classe.id}`, adm.autorizacao).expect(200)).totalRequisitos
    const mediaDaClasse = async (): Promise<number | null | undefined> =>
      corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).progressoClasses.find((c) => c.classe.id === classe.id)?.media
    const conferir = async (): Promise<void> => {
      expect(await mediaDaClasse()).toBe(mediaTurma([percentualClasse(1, await totalDoDetalhe())]))
    }
    const ajustar = (requisitoId: string, ativo: boolean | null) =>
      prismaDeTeste().requisitoAjuste.upsert({
        where: { clubeId_requisitoId: { clubeId: clube.id, requisitoId } },
        create: { clubeId: clube.id, requisitoId, ativo },
        update: { ativo },
      })

    try {
      const base = await totalDoDetalhe()
      await conferir()
      await ajustar(inativo.id, true)
      expect(await totalDoDetalhe()).toBe(base)
      await conferir()
      await ajustar(ativo2.id, false)
      expect(await totalDoDetalhe()).toBe(base - 1)
      await conferir()
      // "voltar ao oficial" gravado como linha com ativo null: usa o oficial nos dois.
      await ajustar(inativo.id, null)
      await ajustar(ativo2.id, null)
      expect(await totalDoDetalhe()).toBe(base)
      await conferir()
    } finally {
      await prismaDeTeste().requisitoAjuste.deleteMany({ where: { requisitoId: inativo.id } })
      await prismaDeTeste().requisito.update({ where: { id: inativo.id }, data: { ativo: true } })
    }
  })

  it('atividade recente: so os tipos do feed, os 10 mais novos, do clube', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const autor = await criarUsuario({ nome: 'Dora Autora' })
    const outroAdm = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    const tipos = ['AULA_REGISTRADA', 'CRONOGRAMA_ENVIADO', 'CRONOGRAMA_PUBLICADO', 'EVENTO_CRIADO']
    for (let i = 0; i < 12; i += 1) {
      await prismaDeTeste().atividade.create({
        data: {
          clubeId: clube.id, autorId: i === 11 ? null : autor.id, tipo: tipos[i % 4], descricao: `Atividade ${i}`,
          link: i === 11 ? '/adm/cronogramas' : null, criadaEm: new Date(Date.UTC(2026, 5, 1, 12, i)),
        },
      })
    }
    await prismaDeTeste().atividade.create({ data: { clubeId: clube.id, tipo: 'OUTRO_TIPO', descricao: 'Fora do feed', criadaEm: new Date('2026-06-14T12:00:00Z') } })
    await prismaDeTeste().atividade.create({ data: { clubeId: outro.id, autorId: outroAdm.usuario.id, tipo: 'EVENTO_CRIADO', descricao: 'Do outro clube', criadaEm: new Date('2026-06-14T12:00:00Z') } })

    const { atividades } = corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200))
    expect(atividades).toHaveLength(10)
    expect(atividades.map((a) => a.descricao)).toEqual(Array.from({ length: 10 }, (_, i) => `Atividade ${11 - i}`))
    expect(atividades[0]).toMatchObject({ autor: null, link: '/adm/cronogramas' })
    expect(atividades[1]).toMatchObject({ autor: 'Dora Autora', link: null })
  })
})
