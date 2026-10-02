import type { INestApplication } from '@nestjs/common'
import type { InicioInstrutorSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  admCriarEspecialidadeClube,
  admCriarRequisitoAjuste,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarCronograma,
  criarNotificacao,
  criarRegistroAula,
  criarEspecialidadeConcluida,
  criarRequisitoConcluido,
  criarTarefa,
  criarVinculo,
  criarUsuario,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Inicio = z.infer<typeof InicioInstrutorSaida>

describe('instrutor: inicio e pedido de liberacao', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  beforeEach(() => congelarRelogio('2026-09-30T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  describe('GET /inicio/instrutor', () => {
    it('classes por ordem (individuais, depois Agrupadas), aula da ultima publicacao, hoje, aulas dadas e progresso medio', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const agrupada = await prismaDeTeste().classe.findFirstOrThrow({ where: { clubeId: null, trilha: 'AGRUPADAS', tipo: 'REGULAR' }, select: { id: true } })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [agrupada.id, amigo.id] })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const requisitos = await prismaDeTeste().requisito.findMany({ where: { ativo: true, secao: { classeId: amigo.id } }, select: { id: true } })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
      await criarRequisitoConcluido({ clubeId: clube.id, dbvId: dbv.id, requisitoId: requisitos[0].id })
      const cronograma = await criarCronograma({
        clubeId: clube.id,
        classeId: amigo.id,
        aulas: [
          { data: '2026-09-23', requisitoIds: [requisitos[0].id] },
          { data: '2026-09-30', requisitoIds: [requisitos[1].id, requisitos[2].id] },
          { data: '2026-10-07', requisitoIds: [requisitos[3].id] },
        ],
      })
      await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
      await prismaDeTeste().aulaPlanejada.create({ data: { clubeId: clube.id, cronogramaId: cronograma.id, data: new Date('2026-10-01T00:00:00Z') } })
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-23', presencas: [{ dbvId: dbv.id }] })
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2025-11-05' })

      const saida = corpo<Inicio>(await api.get('/api/inicio/instrutor', instrutor.autorizacao).expect(200))

      expect(saida.classes.map((item) => item.classe.id)).toEqual([amigo.id, agrupada.id])
      const [doAmigo, daAgrupada] = saida.classes
      expect(doAmigo).toMatchObject({
        totalDbvs: 1,
        progressoMedio: Math.round((1 / requisitos.length) * 100),
        aulaHoje: true,
        aulaHojeRegistrada: false,
        aulasDadas: 1,
      })
      expect(doAmigo.proximaAula).toMatchObject({ data: '2026-09-30', totalRequisitos: 2 })
      expect(daAgrupada).toMatchObject({ totalDbvs: 0, progressoMedio: null, proximaAula: null, aulaHoje: false, aulasDadas: 0 })
    })

    it('aula de hoje ja registrada', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: '2026-09-30', requisitoIds: [] }] })
      await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-30' })

      const saida = corpo<Inicio>(await api.get('/api/inicio/instrutor', instrutor.autorizacao).expect(200))

      expect(saida.classes[0]).toMatchObject({ aulaHoje: true, aulaHojeRegistrada: true, aulasDadas: 1 })
    })

    describe('alerta de faltas (F13)', () => {
      async function turma() {
        const clube = await criarClube()
        const amigo = await classeOficial('Amigo')
        const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
        const faltoso = await criarDbv({ clubeId: clube.id, nome: 'Faltoso' })
        const irregular = await criarDbv({ clubeId: clube.id, nome: 'Irregular' })
        const presente = await criarDbv({ clubeId: clube.id, nome: 'Presente' })
        for (const dbv of [faltoso, irregular, presente]) await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
        return { clube, amigo, instrutor, faltoso, irregular, presente }
      }

      it('DBVs ausentes nas 2 ultimas aulas; a mais antiga nao conta', async () => {
        const { clube, amigo, instrutor, faltoso, irregular, presente } = await turma()
        await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-02', presencas: [{ dbvId: irregular.id, presente: false }, { dbvId: presente.id, presente: false }] })
        await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-09', presencas: [{ dbvId: faltoso.id, presente: false }, { dbvId: irregular.id, presente: true }, { dbvId: presente.id }] })
        await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-16', presencas: [{ dbvId: faltoso.id, presente: false }, { dbvId: irregular.id, presente: false }, { dbvId: presente.id }] })

        const saida = corpo<Inicio>(await api.get('/api/inicio/instrutor', instrutor.autorizacao).expect(200))

        expect(saida.alertaFaltas).toHaveLength(1)
        expect(saida.alertaFaltas[0].classe.id).toBe(amigo.id)
        expect(saida.alertaFaltas[0].dbvs).toEqual([{ dbvId: faltoso.id, nome: 'Faltoso' }])
      })

      it('menos de 2 aulas registradas: sem alerta', async () => {
        const { clube, amigo, instrutor, faltoso } = await turma()
        await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-16', presencas: [{ dbvId: faltoso.id, presente: false }] })

        const saida = corpo<Inicio>(await api.get('/api/inicio/instrutor', instrutor.autorizacao).expect(200))

        expect(saida.alertaFaltas).toEqual([])
      })
    })

    describe('para cobrar (tarefa para casa)', () => {
      async function turma(quantos = 2) {
        const clube = await criarClube()
        const amigo = await classeOficial('Amigo')
        const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
        const requisitos = (await prismaDeTeste().requisito.findMany({ where: { ativo: true, secao: { classeId: amigo.id } }, select: { id: true }, orderBy: { id: 'asc' }, take: 3 })).map((r) => r.id)
        const dbvs = []
        for (let i = 0; i < quantos; i++) {
          const dbv = await criarDbv({ clubeId: clube.id, nome: `Dbv ${i}` })
          await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: 2026 })
          dbvs.push(dbv)
        }
        const registro = (data: string) => criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data })
        const paraCobrar = async (acesso = instrutor) =>
          corpo<Inicio>(await api.get('/api/inicio/instrutor', acesso.autorizacao).expect(200)).classes.find((c) => c.classe.id === amigo.id)?.paraCobrar
        return { clube, amigo, instrutor, requisitos, dbvs, registro, paraCobrar }
      }

      it('cumpriu no dia nao deve: quem entregou no proprio registro sai da conta', async () => {
        const t = await turma()
        const aula = await t.registro('2026-09-23')
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: aula.id, itens: [{ requisitoId: t.requisitos[0] }] })
        await criarRequisitoConcluido({ clubeId: t.clube.id, dbvId: t.dbvs[0].id, requisitoId: t.requisitos[0], concluidoEm: '2026-09-23', registroAulaId: aula.id })

        expect(await t.paraCobrar()).toEqual({ requisitos: 1, especialidades: 0, desbravadores: 1 })
      })

      it('concluiu pela ficha ou desistiu sai da conta; quem se matricula depois passa a dever', async () => {
        const t = await turma(3)
        const aula = await t.registro('2026-09-23')
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: aula.id, itens: [{ requisitoId: t.requisitos[0] }] })
        await criarRequisitoConcluido({ clubeId: t.clube.id, dbvId: t.dbvs[0].id, requisitoId: t.requisitos[0] })
        await prismaDeTeste().matriculaClasse.updateMany({ where: { dbvId: t.dbvs[1].id }, data: { status: 'DESISTIU' } })
        expect(await t.paraCobrar()).toEqual({ requisitos: 1, especialidades: 0, desbravadores: 1 })

        const tardio = await criarDbv({ clubeId: t.clube.id, nome: 'Tardio' })
        await criarMatricula({ clubeId: t.clube.id, dbvId: tardio.id, classeId: t.amigo.id, anoClube: 2026 })
        expect(await t.paraCobrar()).toEqual({ requisitos: 1, especialidades: 0, desbravadores: 2 })
      })

      it('item inativo, ano virado, todos entregaram ou tarefa encerrada: paraCobrar nulo', async () => {
        const t = await turma()
        const [a, b, c, d] = [await t.registro('2026-09-02'), await t.registro('2026-09-09'), await t.registro('2026-09-16'), await t.registro('2026-09-23')]
        await admCriarRequisitoAjuste({ clubeId: t.clube.id, requisitoId: t.requisitos[0], ativo: false })
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: a.id, itens: [{ requisitoId: t.requisitos[0] }] })
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: b.id, itens: [{ requisitoId: t.requisitos[1] }], anoClube: 2025 })
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: c.id, itens: [{ requisitoId: t.requisitos[1] }], encerrada: true })
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: d.id, itens: [{ requisitoId: t.requisitos[2] }] })
        for (const dbv of t.dbvs) await criarRequisitoConcluido({ clubeId: t.clube.id, dbvId: dbv.id, requisitoId: t.requisitos[2] })

        expect(await t.paraCobrar()).toBeNull()
      })

      it('conta itens distintos entre tarefas, com especialidade, e desbravadores distintos', async () => {
        const t = await turma(5)
        const especialidade = await admCriarEspecialidadeClube({ clubeId: t.clube.id })
        const [a, b] = [await t.registro('2026-09-09'), await t.registro('2026-09-16')]
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: a.id, itens: [{ requisitoId: t.requisitos[0] }, { requisitoId: t.requisitos[1] }, { especialidadeId: especialidade.id }] })
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: b.id, itens: [{ requisitoId: t.requisitos[1] }] })

        expect(await t.paraCobrar()).toEqual({ requisitos: 2, especialidades: 1, desbravadores: 5 })
      })

      it('especialidade concluida na tela de especialidades tira a pendencia; desativada some', async () => {
        const t = await turma()
        const viva = await admCriarEspecialidadeClube({ clubeId: t.clube.id })
        const morta = await admCriarEspecialidadeClube({ clubeId: t.clube.id })
        await prismaDeTeste().especialidade.update({ where: { id: morta.id }, data: { ativa: false } })
        const aula = await t.registro('2026-09-23')
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: aula.id, itens: [{ especialidadeId: viva.id }, { especialidadeId: morta.id }] })
        await criarEspecialidadeConcluida({ clubeId: t.clube.id, dbvId: t.dbvs[0].id, especialidadeId: viva.id })

        expect(await t.paraCobrar()).toEqual({ requisitos: 0, especialidades: 1, desbravadores: 1 })
      })

      it('a propria ficha nao conta', async () => {
        const t = await turma(1)
        const propria = await criarDbv({ clubeId: t.clube.id, nome: 'Instrutor Dbv', usuarioId: t.instrutor.usuario.id })
        await criarMatricula({ clubeId: t.clube.id, dbvId: propria.id, classeId: t.amigo.id, anoClube: 2026 })
        const aula = await t.registro('2026-09-23')
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: aula.id, itens: [{ requisitoId: t.requisitos[0] }] })

        expect(await t.paraCobrar()).toEqual({ requisitos: 1, especialidades: 0, desbravadores: 1 })

        await criarRequisitoConcluido({ clubeId: t.clube.id, dbvId: t.dbvs[0].id, requisitoId: t.requisitos[0] })
        expect(await t.paraCobrar()).toBeNull()
      })

      it('outro clube nao entra e instrutor de outra classe nao ve a tarefa', async () => {
        const t = await turma(1)
        const aula = await t.registro('2026-09-23')
        await criarTarefa({ clubeId: t.clube.id, classeId: t.amigo.id, registroAulaId: aula.id, itens: [{ requisitoId: t.requisitos[0] }] })

        const outroClube = await criarClube()
        const estranho = await criarDbv({ clubeId: outroClube.id })
        await criarMatricula({ clubeId: outroClube.id, dbvId: estranho.id, classeId: t.amigo.id, anoClube: 2026 })
        const aulaDeLa = await criarRegistroAula({ clubeId: outroClube.id, classeId: t.amigo.id, data: '2026-09-23' })
        await criarTarefa({ clubeId: outroClube.id, classeId: t.amigo.id, registroAulaId: aulaDeLa.id, itens: [{ requisitoId: t.requisitos[1] }] })
        expect(await t.paraCobrar()).toEqual({ requisitos: 1, especialidades: 0, desbravadores: 1 })

        const companheiro = await classeOficial('Companheiro')
        const deOutraClasse = await criarAcesso({ clubeId: t.clube.id, papel: 'INSTRUTOR', classeIds: [companheiro.id] })
        const saida = corpo<Inicio>(await api.get('/api/inicio/instrutor', deOutraClasse.autorizacao).expect(200))
        expect(saida.classes.map((c) => [c.classe.id, c.paraCobrar])).toEqual([[companheiro.id, null]])
      })
    })

    it('Adm e conselheiro: 403', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

      await api.get('/api/inicio/instrutor', adm.autorizacao).expect(403)
      await api.get('/api/inicio/instrutor', conselheiro.autorizacao).expect(403)
    })
  })

  describe('POST /classes/:id/pedir-liberacao', () => {
    async function cenario() {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      return { clube, amigo, instrutor, adm }
    }
    const pedidos = (clubeId: string) => prismaDeTeste().notificacao.findMany({ where: { clubeId, tipo: 'PEDIDO_LIBERAR_CRONOGRAMA' } })

    it('duas chamadas simultaneas em 24 h notificam so uma vez', async () => {
      const { clube, amigo, instrutor } = await cenario()
      const chamadas = await Promise.all([
        api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao),
        api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao),
      ])
      expect(chamadas.map((c) => c.status)).toEqual([204, 204])
      expect(await pedidos(clube.id)).toHaveLength(1)
    })

    it('notifica so os Adms ativos do clube, com o link da classe; repeticao em 24 h e 204 sem notificar', async () => {
      const { clube, amigo, instrutor, adm } = await cenario()
      const inativo = await criarVinculo({ usuarioId: (await criarUsuario()).id, clubeId: clube.id, papel: 'ADM', ativo: false })
      const outroClube = await criarClube()
      const admDeFora = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })

      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao).expect(204)
      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao).expect(204)

      const enviados = await pedidos(clube.id)
      expect(enviados).toHaveLength(1)
      expect(enviados[0]).toMatchObject({ usuarioId: adm.usuario.id, link: `/adm/classes?classe=${amigo.id}` })
      expect(enviados[0].texto).toContain(instrutor.usuario.nome)
      expect(inativo.ativo).toBe(false)
      expect(await pedidos(outroClube.id)).toEqual([])
      expect(admDeFora.usuario.id).not.toBe(adm.usuario.id)
    })

    it('depois de 24 h notifica de novo', async () => {
      const { clube, amigo, instrutor, adm } = await cenario()
      await criarNotificacao({
        clubeId: clube.id, usuarioId: adm.usuario.id, tipo: 'PEDIDO_LIBERAR_CRONOGRAMA',
        link: `/adm/classes?classe=${amigo.id}`, criadaEm: new Date('2026-09-29T14:00:00Z'),
      })

      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao).expect(204)

      expect(await pedidos(clube.id)).toHaveLength(2)
    })

    it('classe que o instrutor ja monta: 422; classe de outro vinculo: 404; Adm e conselheiro: 403', async () => {
      const { clube, amigo, instrutor, adm } = await cenario()
      const companheiro = await classeOficial('Companheiro')
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      await prismaDeTeste().classeClube.update({
        where: { clubeId_classeId: { clubeId: clube.id, classeId: amigo.id } },
        data: { quemMontaCronograma: 'INSTRUTOR' },
      })

      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, instrutor.autorizacao).expect(422)
      await api.post(`/api/classes/${companheiro.id}/pedir-liberacao`, instrutor.autorizacao).expect(404)
      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, adm.autorizacao).expect(403)
      await api.post(`/api/classes/${amigo.id}/pedir-liberacao`, conselheiro.autorizacao).expect(403)
      expect(await pedidos(clube.id)).toEqual([])
    })
  })
})
