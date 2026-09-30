import type { INestApplication } from '@nestjs/common'
import type { EspecialidadesDoDbvSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarEspecialidadeConcluida,
  criarMatricula,
  criarRegistroAula,
  criarRequisitoConcluido,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Progresso = z.infer<typeof ProgressoDbvSaida>
type Especialidades = z.infer<typeof EspecialidadesDoDbvSaida>

describe('marcar e desmarcar fora da aula', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)
  const apagar = (url: string, auth: string) => request(app.getHttpServer() as never).delete(url).set('Authorization', auth)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Os tokens do helper de isolamento nascem no beforeAll, com o relogio real: nao se congela para eles.
  beforeEach(() => {
    if (!expect.getState().currentTestName?.includes('isolamento entre clubes')) congelarRelogio('2026-09-30T15:00:00Z')
  })
  afterEach(() => descongelarRelogio())

  async function cenario() {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    const requisito = await prismaDeTeste().requisito.findFirstOrThrow({ where: { ativo: true, secao: { classeId: amigo.id } } })
    const doCompanheiro = await prismaDeTeste().requisito.findFirstOrThrow({ where: { ativo: true, secao: { classeId: companheiro.id } } })
    const dbv = await criarDbv({ clubeId: clube.id })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const colega = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    return { clube, amigo, requisito, doCompanheiro, dbv, instrutor, colega, adm }
  }

  const caminhoRequisito = (dbvId: string, requisitoId: string) => `/api/desbravadores/${dbvId}/requisitos/${requisitoId}`
  const caminhoEspecialidade = (dbvId: string, id: string) => `/api/desbravadores/${dbvId}/especialidades/${id}`

  async function lancamentos(dbvId: string, origemTipo: 'REQUISITO' | 'ESPECIALIDADE') {
    return prismaDeTeste().lancamentoPontos.findMany({ where: { dbvId, origemTipo } })
  }

  describe('requisito', () => {
    it('outro instrutor da classe marca; devolve o progresso; pontos com o valor do criterio e a data da conclusao', async () => {
      const { clube, requisito, dbv, colega, instrutor } = await cenario()
      await criarRequisitoConcluido({ clubeId: clube.id, dbvId: dbv.id, requisitoId: (await prismaDeTeste().requisito.findFirstOrThrow({ where: { secaoId: requisito.secaoId, id: { not: requisito.id } } })).id })
      const criterio = await criterioPorGatilho(clube.id, 'REQUISITO')

      const resposta = await api.put(caminhoRequisito(dbv.id, requisito.id), colega.autorizacao, { concluidoEm: '2026-09-20' }).expect(200)

      const marcado = corpo<Progresso>(resposta).matriculas[0].secoes.flatMap((secao) => secao.requisitos).find((item) => item.id === requisito.id)
      expect(marcado).toMatchObject({ concluidoEm: '2026-09-20', marcadoPor: colega.usuario.nome })
      const pontos = await lancamentos(dbv.id, 'REQUISITO')
      expect(pontos).toHaveLength(1)
      expect(pontos[0]).toMatchObject({
        origemId: `${dbv.id}:${requisito.id}`,
        criterioId: criterio.id,
        pontos: criterio.pontos,
        estornadoEm: null,
      })
      expect(pontos[0].data.toISOString().slice(0, 10)).toBe('2026-09-20')

      const desmarcado = await apagar(caminhoRequisito(dbv.id, requisito.id), instrutor.autorizacao).expect(200)
      const item = corpo<Progresso>(desmarcado).matriculas[0].secoes.flatMap((secao) => secao.requisitos).find((i) => i.id === requisito.id)
      expect(item?.concluidoEm).toBeNull()
      expect((await lancamentos(dbv.id, 'REQUISITO'))[0].estornadoEm).not.toBeNull()
    })

    it('ja concluido: 409 CONFLITO com a data; dia de hoje e inicio do ano sao aceitos', async () => {
      const { clube, requisito, dbv, instrutor } = await cenario()
      await criarRequisitoConcluido({ clubeId: clube.id, dbvId: dbv.id, requisitoId: requisito.id, concluidoEm: '2026-03-01' })

      const conflito = await api.put(caminhoRequisito(dbv.id, requisito.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(409)

      expect(conflito.body).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Já concluído em 01/03.' })
      const outro = await prismaDeTeste().requisito.findFirstOrThrow({ where: { secaoId: requisito.secaoId, id: { not: requisito.id } } })
      await api.put(caminhoRequisito(dbv.id, outro.id), instrutor.autorizacao, { concluidoEm: '2026-09-30' }).expect(200)
      const terceiro = await prismaDeTeste().requisito.findFirstOrThrow({ where: { secaoId: requisito.secaoId, id: { notIn: [requisito.id, outro.id] } } })
      await api.put(caminhoRequisito(dbv.id, terceiro.id), instrutor.autorizacao, { concluidoEm: '2026-02-01' }).expect(200)
    })

    it('data fora de [inicio do ano do clube, hoje] e 422', async () => {
      const { requisito, dbv, instrutor } = await cenario()

      const futura = await api.put(caminhoRequisito(dbv.id, requisito.id), instrutor.autorizacao, { concluidoEm: '2026-10-01' }).expect(422)
      await api.put(caminhoRequisito(dbv.id, requisito.id), instrutor.autorizacao, { concluidoEm: '2026-01-31' }).expect(422)

      expect(futura.body).toMatchObject({ codigo: 'REGRA' })
      expect(await lancamentos(dbv.id, 'REQUISITO')).toHaveLength(0)
    })

    it('DELETE remove a conclusao de qualquer origem (da aula tambem) e estorna', async () => {
      const { clube, amigo, requisito, dbv, adm } = await cenario()
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: '2026-09-13', concluidos: [{ dbvId: dbv.id, requisitoId: requisito.id }] })
      const criterio = await criterioPorGatilho(clube.id, 'REQUISITO')
      await prismaDeTeste().lancamentoPontos.create({
        data: {
          clubeId: clube.id, dbvId: dbv.id, criterioId: criterio.id, pontos: criterio.pontos, data: new Date('2026-09-13T00:00:00Z'),
          origemTipo: 'REQUISITO', origemId: `${dbv.id}:${requisito.id}`, lancadoPorId: adm.usuario.id,
        },
      })

      await apagar(caminhoRequisito(dbv.id, requisito.id), adm.autorizacao).expect(200)

      const linhas = await prismaDeTeste().requisitoConcluido.findMany({ where: { dbvId: dbv.id, requisitoId: requisito.id } })
      expect(linhas).toHaveLength(1)
      expect(linhas[0].removidoEm).not.toBeNull()
      expect(linhas[0].removidoPorId).toBe(adm.usuario.id)
      expect((await lancamentos(dbv.id, 'REQUISITO'))[0].estornadoEm).not.toBeNull()
    })

    it('criterio inativo nao lanca; lider marca e nao pontua', async () => {
      const { clube, amigo, requisito, dbv, instrutor } = await cenario()
      const lider = await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      await criarMatricula({ clubeId: clube.id, dbvId: lider.id, classeId: amigo.id })

      await api.put(caminhoRequisito(lider.id, requisito.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(200)
      await prismaDeTeste().criterioRanking.updateMany({ where: { clubeId: clube.id, gatilho: 'REQUISITO' }, data: { ativo: false } })
      await api.put(caminhoRequisito(dbv.id, requisito.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(200)

      expect(await lancamentos(lider.id, 'REQUISITO')).toHaveLength(0)
      expect(await lancamentos(dbv.id, 'REQUISITO')).toHaveLength(0)
    })

    it('escopo: instrutor de outra classe 404, requisito de classe em que nao esta matriculado 404, conselheiro 403', async () => {
      const { clube, requisito, doCompanheiro, dbv, instrutor } = await cenario()
      const alheio = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [(await classeOficial('Companheiro')).id] })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

      await api.put(caminhoRequisito(dbv.id, requisito.id), alheio.autorizacao, { concluidoEm: '2026-09-01' }).expect(404)
      await api.put(caminhoRequisito(dbv.id, doCompanheiro.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(404)
      await api.put(caminhoRequisito(dbv.id, requisito.id), conselheiro.autorizacao, { concluidoEm: '2026-09-01' }).expect(403)
      await apagar(caminhoRequisito(dbv.id, requisito.id), conselheiro.autorizacao).expect(403)
    })

    testarIsolamento({
      titulo: 'PUT /desbravadores/:id/requisitos/:requisitoId',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const amigo = await classeOficial('Amigo')
        const requisito = await prismaDeTeste().requisito.findFirstOrThrow({ where: { ativo: true, secao: { classeId: amigo.id } } })
        const dbv = await criarDbv({ clubeId: clubeB.id })
        await criarMatricula({ clubeId: clubeB.id, dbvId: dbv.id, classeId: amigo.id })
        return {
          metodo: 'put',
          caminho: caminhoRequisito(dbv.id, requisito.id),
          corpo: { concluidoEm: '2026-09-01' },
          conferirIntacto: async () => {
            expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: dbv.id } })).toBe(0)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })

  describe('especialidade', () => {
    async function especialidade(): Promise<{ id: string }> {
      return prismaDeTeste().especialidade.findFirstOrThrow({ where: { clubeId: null, ativa: true }, select: { id: true } })
    }

    it('outro instrutor marca e desmarca; lista com quem marcou e podeDesmarcar; pontos e estorno', async () => {
      const { clube, dbv, colega, instrutor } = await cenario()
      const esp = await especialidade()
      const criterio = await criterioPorGatilho(clube.id, 'ESPECIALIDADE')

      const marcada = corpo<Especialidades>(
        await api.put(caminhoEspecialidade(dbv.id, esp.id), colega.autorizacao, { concluidoEm: '2026-08-15' }).expect(200),
      )

      expect(marcada.dbvId).toBe(dbv.id)
      expect(marcada.concluidas).toEqual([
        { especialidadeId: esp.id, concluidaEm: '2026-08-15', marcadoPor: colega.usuario.nome, podeDesmarcar: true },
      ])
      const pontos = await lancamentos(dbv.id, 'ESPECIALIDADE')
      expect(pontos).toHaveLength(1)
      expect(pontos[0]).toMatchObject({ origemId: `${dbv.id}:${esp.id}`, criterioId: criterio.id, pontos: criterio.pontos })
      expect(pontos[0].data.toISOString().slice(0, 10)).toBe('2026-08-15')

      const lista = corpo<Especialidades>(await api.get(`/api/desbravadores/${dbv.id}/especialidades`, instrutor.autorizacao).expect(200))
      expect(lista.concluidas).toHaveLength(1)
      const depois = corpo<Especialidades>(await apagar(caminhoEspecialidade(dbv.id, esp.id), instrutor.autorizacao).expect(200))
      expect(depois.concluidas).toEqual([])
      expect((await lancamentos(dbv.id, 'ESPECIALIDADE'))[0].estornadoEm).not.toBeNull()
    })

    it('ja concluida 409; data fora do ano 422; inexistente ou de outro clube 404', async () => {
      const { clube, dbv, instrutor } = await cenario()
      const esp = await especialidade()
      const outroClube = await criarClube()
      const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow()
      const alheia = await prismaDeTeste().especialidade.create({ data: { clubeId: outroClube.id, origem: 'CLUBE', areaId: area.id, nome: `Alheia ${Date.now()}` } })
      await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: dbv.id, especialidadeId: esp.id, concluidaEm: '2026-03-01' })

      const conflito = await api.put(caminhoEspecialidade(dbv.id, esp.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(409)
      await api.put(caminhoEspecialidade(dbv.id, esp.id), instrutor.autorizacao, { concluidoEm: '2026-12-01' }).expect(422)
      await api.put(caminhoEspecialidade(dbv.id, alheia.id), instrutor.autorizacao, { concluidoEm: '2026-09-01' }).expect(404)

      expect(conflito.body).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Já concluído em 01/03.' })
    })

    it('escopo: instrutor sem matricula do DBV 404, conselheiro 403 ao marcar e desmarcar, Adm desmarca', async () => {
      const { clube, dbv, adm } = await cenario()
      const esp = await especialidade()
      const alheio = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [(await classeOficial('Companheiro')).id] })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      await criarEspecialidadeConcluida({ clubeId: clube.id, dbvId: dbv.id, especialidadeId: esp.id })

      await api.put(caminhoEspecialidade(dbv.id, esp.id), alheio.autorizacao, { concluidoEm: '2026-09-01' }).expect(404)
      await api.put(caminhoEspecialidade(dbv.id, esp.id), conselheiro.autorizacao, { concluidoEm: '2026-09-01' }).expect(403)
      await apagar(caminhoEspecialidade(dbv.id, esp.id), conselheiro.autorizacao).expect(403)
      await apagar(caminhoEspecialidade(dbv.id, esp.id), adm.autorizacao).expect(200)
    })

    testarIsolamento({
      titulo: 'GET /desbravadores/:id/especialidades',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const dbv = await criarDbv({ clubeId: clubeB.id })
        return { metodo: 'get', caminho: `/api/desbravadores/${dbv.id}/especialidades` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
