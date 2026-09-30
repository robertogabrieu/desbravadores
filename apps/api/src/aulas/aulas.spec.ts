import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { AulaEnvioSaida, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import type request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarDbv,
  criarMatricula,
  criarRegistroAula,
  criarRequisitoConcluido,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo } from '../../test/p6'

type Saida = z.infer<typeof AulaEnvioSaida>

const DIA = 86_400_000

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

interface Presenca {
  dbvId: string
  presente?: boolean
  versaoVista?: string | null
}

describe('PUT /api/sync/aulas/:uuid', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function requisitosDa(classeId: string, quantos: number): Promise<string[]> {
    const requisitos = await prismaDeTeste().requisito.findMany({
      where: { secao: { classeId }, ativo: true },
      orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
      take: quantos,
      select: { id: true },
    })
    return requisitos.map((requisito) => requisito.id)
  }

  async function cenario(clubeExistente?: { id: string }) {
    const clube = clubeExistente ?? (await criarClube())
    const classe = await classeOficial('Amigo')
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Lider Fulano', tipo: 'LIDER' })
    for (const dbv of [ana, bia, lider]) {
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
    }
    const [r1, r2, r3] = await requisitosDa(classe.id, 3)

    const enviar = (
      dados: {
        uuid?: string
        data?: string
        presencas?: Presenca[]
        marcados?: { dbvId: string; requisitoId: string }[]
        desmarcados?: { dbvId: string; requisitoId: string }[]
        aulaPlanejadaId?: string | null
        envioId?: string
        feitaEm?: Date
        autorizacao?: string
        classeId?: string
      } = {},
    ): request.Test =>
      api.put(`/api/sync/aulas/${dados.uuid ?? randomUUID()}`, dados.autorizacao ?? instrutor.autorizacao, {
        versaoPayload: 1,
        envioId: dados.envioId ?? randomUUID(),
        classeId: dados.classeId ?? classe.id,
        data: dados.data ?? diasAtras(0),
        feitaNoAparelhoEm: (dados.feitaEm ?? new Date()).toISOString(),
        aulaPlanejadaId: dados.aulaPlanejadaId ?? null,
        presencas: (dados.presencas ?? [{ dbvId: ana.id }, { dbvId: bia.id }]).map((p) => ({
          presente: true,
          versaoVista: null,
          ...p,
        })),
        requisitosMarcados: dados.marcados ?? [],
        requisitosDesmarcados: dados.desmarcados ?? [],
      })

    const ok = async (req: request.Test): Promise<Saida> => {
      const resposta = await req
      expect(resposta.status).toBe(200)
      return AulaEnvioSaida.parse(corpo<unknown>(resposta))
    }
    const versaoDe = (saida: Saida, dbvId: string): string => saida.presencas.find((p) => p.dbvId === dbvId)?.versao ?? ''
    const concluidosAtivos = (dbvId: string) =>
      prismaDeTeste().requisitoConcluido.findMany({ where: { clubeId: clube.id, dbvId, removidoEm: null } })
    const lancamentos = (dbvId: string) =>
      prismaDeTeste().lancamentoPontos.findMany({ where: { clubeId: clube.id, dbvId, origemTipo: 'REQUISITO', estornadoEm: null } })
    return { clube, classe, instrutor, adm, ana, bia, lider, r1: r1 ?? '', r2: r2 ?? '', r3: r3 ?? '', enviar, ok, versaoDe, concluidosAtivos, lancamentos }
  }

  it('cria a aula com o id do aparelho, as presencas, o requisito, os pontos e uma atividade', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const saida = await c.ok(c.enviar({ uuid, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    expect(saida.registroAulaId).toBe(uuid)
    expect(saida.presencas.map((p) => p.dbvId).sort()).toEqual([c.ana.id, c.bia.id].sort())
    expect(saida.conflitos).toEqual([])
    expect(saida.ignorados).toEqual([])
    expect(saida.requisitosSemEfeito).toEqual([])
    expect(saida.avisos).toEqual([])
    expect(saida.totalPontos).toBe(4)
    const registro = await prismaDeTeste().registroAula.findUniqueOrThrow({ where: { id: uuid } })
    expect(registro).toMatchObject({ clubeId: c.clube.id, classeId: c.classe.id, registradoPorId: c.instrutor.usuario.id })
    const concluidos = await c.concluidosAtivos(c.ana.id)
    expect(concluidos).toHaveLength(1)
    expect(concluidos[0]).toMatchObject({ requisitoId: c.r1, registroAulaId: uuid })
    const pontos = await c.lancamentos(c.ana.id)
    expect(pontos.map((l) => l.pontos)).toEqual([4])
    expect(pontos[0]?.origemId).toBe(`${c.ana.id}:${c.r1}`)
    const atividades = await prismaDeTeste().atividade.findMany({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })
    expect(atividades).toHaveLength(1)
    expect(atividades[0]?.descricao).toContain('Amigo')
  })

  it('reenviar o mesmo envioId responde o estado atual sem gravar nada', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const envioId = randomUUID()
    const primeira = await c.ok(c.enviar({ uuid, envioId, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    const segunda = await c.ok(c.enviar({ uuid, envioId, presencas: [{ dbvId: c.ana.id, presente: false }] }))
    expect(segunda.registroAulaId).toBe(primeira.registroAulaId)
    expect(segunda.presencas).toEqual(primeira.presencas)
    expect(segunda.conflitos).toEqual([])
    const presenca = await prismaDeTeste().presencaAula.findFirstOrThrow({ where: { registroAulaId: uuid, dbvId: c.ana.id } })
    expect(presenca.presente).toBe(true)
    expect(await prismaDeTeste().envioAulaProcessado.count({ where: { clubeId: c.clube.id, envioId } })).toBe(1)
    expect(await prismaDeTeste().atividade.count({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })).toBe(1)
  })

  it('a mesma classe oficial em dois clubes na mesma data nao colide', async () => {
    const a = await cenario()
    const b = await cenario()
    const data = diasAtras(1)
    const saidaA = await a.ok(a.enviar({ data }))
    const saidaB = await b.ok(b.enviar({ data }))
    expect(saidaA.registroAulaId).not.toBe(saidaB.registroAulaId)
    expect(await prismaDeTeste().registroAula.count({ where: { clubeId: a.clube.id, classeId: a.classe.id, data: new Date(`${data}T00:00:00Z`) } })).toBe(1)
    expect(await prismaDeTeste().registroAula.count({ where: { clubeId: b.clube.id, classeId: b.classe.id, data: new Date(`${data}T00:00:00Z`) } })).toBe(1)
    // um aparelho de A nao enxerga nem altera o registro de B, mesmo com o id dele
    const invasao = await a.enviar({ uuid: saidaB.registroAulaId, data: diasAtras(3) })
    expect(invasao.status).toBe(422)
    expect((await prismaDeTeste().presencaAula.findMany({ where: { registroAulaId: saidaB.registroAulaId } })).length).toBe(2)
  })

  it('duas aulas da mesma (clube, classe, data) sao uma so, mesmo com ids diferentes', async () => {
    const c = await cenario()
    const data = diasAtras(1)
    const primeira = await c.ok(c.enviar({ data }))
    const segunda = await c.ok(c.enviar({ data }))
    expect(segunda.registroAulaId).toBe(primeira.registroAulaId)
    expect(await prismaDeTeste().atividade.count({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })).toBe(1)
  })

  it('conflito de presenca: versao vista velha entra em conflitos e a ultima gravacao vale', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const criada = await c.ok(c.enviar({ uuid }))
    const vista = c.versaoDe(criada, c.ana.id)
    const semConflito = await c.ok(c.enviar({ uuid, presencas: [{ dbvId: c.ana.id, presente: false, versaoVista: vista }] }))
    expect(semConflito.conflitos).toEqual([])
    const comConflito = await c.ok(c.enviar({ uuid, presencas: [{ dbvId: c.ana.id, presente: true, versaoVista: vista }] }))
    expect(comConflito.conflitos).toEqual([{ dbvId: c.ana.id, nome: 'Ana Souza' }])
    const presenca = await prismaDeTeste().presencaAula.findFirstOrThrow({ where: { registroAulaId: uuid, dbvId: c.ana.id } })
    expect(presenca.presente).toBe(true)
    expect(presenca.versao.toISOString()).toBe(c.versaoDe(comConflito, c.ana.id))
  })

  it('membros fora da aula (outra classe ou outro clube) vao para ignorados e nao ganham presenca', async () => {
    const c = await cenario()
    const outroClube = await criarClube()
    const estranho = await criarDbv({ clubeId: outroClube.id, nome: 'Estranho' })
    const semMatricula = await criarDbv({ clubeId: c.clube.id, nome: 'Sem Matricula' })
    const inativo = await criarDbv({ clubeId: c.clube.id, nome: 'Inativo', ativo: false })
    await criarMatricula({ clubeId: c.clube.id, dbvId: inativo.id, classeId: c.classe.id, anoClube: anoCorrente() })
    const desistiu = await criarDbv({ clubeId: c.clube.id, nome: 'Desistiu' })
    await criarMatricula({ clubeId: c.clube.id, dbvId: desistiu.id, classeId: c.classe.id, anoClube: anoCorrente(), status: 'DESISTIU' })
    const saida = await c.ok(
      c.enviar({
        presencas: [{ dbvId: c.ana.id }, { dbvId: estranho.id }, { dbvId: semMatricula.id }, { dbvId: inativo.id }, { dbvId: desistiu.id }],
        marcados: [{ dbvId: semMatricula.id, requisitoId: c.r1 }],
      }),
    )
    expect(saida.presencas.map((p) => p.dbvId)).toEqual([c.ana.id])
    expect(saida.ignorados.map((i) => i.dbvId).sort()).toEqual([estranho.id, semMatricula.id, inativo.id, desistiu.id].sort())
    expect(saida.ignorados.find((i) => i.dbvId === semMatricula.id)?.nome).toBe('Sem Matricula')
    expect(await c.concluidosAtivos(semMatricula.id)).toEqual([])
  })

  it('requisito de quem o proprio envio diz que faltou vira AUSENTE, sem efeito e sem recusar', async () => {
    const c = await cenario()
    const saida = await c.ok(
      c.enviar({
        presencas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id, presente: false }],
        marcados: [
          { dbvId: c.ana.id, requisitoId: c.r1 },
          { dbvId: c.bia.id, requisitoId: c.r1 },
        ],
      }),
    )
    expect(saida.requisitosSemEfeito).toEqual([{ dbvId: c.bia.id, requisitoId: c.r1, motivo: 'AUSENTE', concluidoEm: null }])
    expect(await c.concluidosAtivos(c.bia.id)).toEqual([])
    expect(await c.concluidosAtivos(c.ana.id)).toHaveLength(1)
  })

  it('requisito ja concluido nao muda; com a data desta aula mais antiga a conclusao se move para ela', async () => {
    const c = await cenario()
    const anterior = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(10) })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: c.r1, concluidoEm: diasAtras(10), registroAulaId: anterior.id })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.bia.id, requisitoId: c.r1, concluidoEm: diasAtras(1) })

    const uuid = randomUUID()
    const saida = await c.ok(
      c.enviar({
        uuid,
        data: diasAtras(3),
        marcados: [
          { dbvId: c.ana.id, requisitoId: c.r1 },
          { dbvId: c.bia.id, requisitoId: c.r1 },
        ],
      }),
    )
    expect(saida.requisitosSemEfeito).toEqual(
      expect.arrayContaining([
        { dbvId: c.ana.id, requisitoId: c.r1, motivo: 'JA_CONCLUIDO', concluidoEm: diasAtras(10) },
        { dbvId: c.bia.id, requisitoId: c.r1, motivo: 'JA_CONCLUIDO', concluidoEm: diasAtras(3) },
      ]),
    )
    const deAna = await c.concluidosAtivos(c.ana.id)
    expect(deAna).toHaveLength(1)
    expect(deAna[0]).toMatchObject({ registroAulaId: anterior.id })
    const deBia = await c.concluidosAtivos(c.bia.id)
    expect(deBia).toHaveLength(1)
    expect(deBia[0]?.registroAulaId).toBe(uuid)
    expect(deBia[0]?.concluidoEm.toISOString().slice(0, 10)).toBe(diasAtras(3))
    // mover nao lanca pontos novos: os de quando foram lancados continuam valendo
    expect(await c.lancamentos(c.bia.id)).toEqual([])
  })

  it('requisito de outra classe ou inativo no clube vira REQUISITO_INVALIDO; aula fora do publicado vira aviso; nada recusa', async () => {
    const c = await cenario()
    const outraClasse = await classeOficial('Companheiro')
    const [deOutraClasse] = await requisitosDa(outraClasse.id, 1)
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: c.clube.id, requisitoId: c.r2, ativo: false } })
    const cronograma = await criarCronograma({ clubeId: c.clube.id, classeId: c.classe.id, aulas: [{ data: diasAtras(0), requisitoIds: [c.r3] }] })
    const planejada = cronograma.aulas[0]?.id ?? ''

    const uuid = randomUUID()
    const saida = await c.ok(
      c.enviar({
        uuid,
        aulaPlanejadaId: planejada,
        marcados: [
          { dbvId: c.ana.id, requisitoId: deOutraClasse ?? '' },
          { dbvId: c.ana.id, requisitoId: c.r2 },
          { dbvId: c.ana.id, requisitoId: c.r3 },
        ],
      }),
    )
    expect(saida.requisitosSemEfeito).toEqual(
      expect.arrayContaining([
        { dbvId: c.ana.id, requisitoId: deOutraClasse ?? '', motivo: 'REQUISITO_INVALIDO', concluidoEm: null },
        { dbvId: c.ana.id, requisitoId: c.r2, motivo: 'REQUISITO_INVALIDO', concluidoEm: null },
      ]),
    )
    expect(saida.requisitosSemEfeito).toHaveLength(2)
    expect((await c.concluidosAtivos(c.ana.id)).map((r) => r.requisitoId)).toEqual([c.r3])
    // o cronograma nunca foi publicado: a aula planejada e do vivo e sai do registro
    expect(saida.avisos).toEqual(['Esta aula foi registrada fora do cronograma publicado.'])
    expect((await prismaDeTeste().registroAula.findUniqueOrThrow({ where: { id: uuid } })).aulaPlanejadaId).toBeNull()
  })

  it('aula planejada da ultima publicacao na mesma data fica ligada, sem aviso', async () => {
    const c = await cenario()
    const cronograma = await criarCronograma({ clubeId: c.clube.id, classeId: c.classe.id, aulas: [{ data: diasAtras(0), requisitoIds: [c.r1] }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: c.adm.usuario.id })
    const planejada = cronograma.aulas[0]?.id ?? ''
    const uuid = randomUUID()
    const saida = await c.ok(c.enviar({ uuid, aulaPlanejadaId: planejada }))
    expect(saida.avisos).toEqual([])
    expect((await prismaDeTeste().registroAula.findUniqueOrThrow({ where: { id: uuid } })).aulaPlanejadaId).toBe(planejada)

    // a mesma aula planejada numa data diferente esta fora do publicado
    const outra = await c.ok(c.enviar({ data: diasAtras(2), aulaPlanejadaId: planejada }))
    expect(outra.avisos).toHaveLength(1)
  })

  it('desmarcar so remove a conclusao desta aula e estorna; as de outra aula ou do fora-da-aula ficam', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    await c.ok(c.enviar({ uuid, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    const outra = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(9) })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: c.r2, concluidoEm: diasAtras(9), registroAulaId: outra.id })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: c.r3, concluidoEm: diasAtras(9) })

    await c.ok(
      c.enviar({
        uuid,
        presencas: [{ dbvId: c.ana.id }],
        desmarcados: [
          { dbvId: c.ana.id, requisitoId: c.r1 },
          { dbvId: c.ana.id, requisitoId: c.r2 },
          { dbvId: c.ana.id, requisitoId: c.r3 },
        ],
      }),
    )
    expect((await c.concluidosAtivos(c.ana.id)).map((r) => r.requisitoId).sort()).toEqual([c.r2, c.r3].sort())
    expect(await c.lancamentos(c.ana.id)).toEqual([])
    const removida = await prismaDeTeste().requisitoConcluido.findFirstOrThrow({ where: { dbvId: c.ana.id, requisitoId: c.r1 } })
    expect(removida.removidoEm).not.toBeNull()
  })

  it('presente que passa a faltou nao apaga as conclusoes', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    const criada = await c.ok(c.enviar({ uuid, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    await c.ok(c.enviar({ uuid, presencas: [{ dbvId: c.ana.id, presente: false, versaoVista: c.versaoDe(criada, c.ana.id) }] }))
    expect(await c.concluidosAtivos(c.ana.id)).toHaveLength(1)
    expect(await c.lancamentos(c.ana.id)).toHaveLength(1)
  })

  it('LIDER entra na aula e conclui requisito, mas nao pontua', async () => {
    const c = await cenario()
    const saida = await c.ok(
      c.enviar({
        presencas: [{ dbvId: c.ana.id }, { dbvId: c.lider.id }],
        marcados: [{ dbvId: c.lider.id, requisitoId: c.r1 }],
      }),
    )
    expect(saida.presencas.map((p) => p.dbvId)).toContain(c.lider.id)
    expect(saida.ignorados).toEqual([])
    expect(await c.concluidosAtivos(c.lider.id)).toHaveLength(1)
    expect(await c.lancamentos(c.lider.id)).toEqual([])
    expect(saida.totalPontos).toBe(0)
  })

  it('criterio de requisito inativo conclui sem lancar pontos', async () => {
    const c = await cenario()
    const criterio = await criterioPorGatilho(c.clube.id, 'REQUISITO')
    await prismaDeTeste().criterioRanking.update({ where: { id: criterio.id }, data: { ativo: false } })
    const saida = await c.ok(c.enviar({ marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    expect(await c.concluidosAtivos(c.ana.id)).toHaveLength(1)
    expect(await c.lancamentos(c.ana.id)).toEqual([])
    expect(saida.totalPontos).toBe(0)
  })

  describe('prazo', () => {
    it('instrutor nao cria aula de mais de 30 dias nem com envio de mais de 7 dias; o Adm tambem nao cria fora da janela', async () => {
      const c = await cenario()
      expect((await c.enviar({ data: diasAtras(31) })).status).toBe(422)
      expect((await c.enviar({ data: diasAtras(31), autorizacao: c.adm.autorizacao })).status).toBe(422)
      expect((await c.enviar({ data: diasAtras(-1) })).status).toBe(422)
      expect((await c.enviar({ feitaEm: new Date(Date.now() - 8 * DIA) })).status).toBe(422)
      expect((await c.enviar({ data: diasAtras(30) })).status).toBe(200)
    })

    it('correcao: instrutor ate 30 dias contados no aparelho, Adm sem prazo', async () => {
      const c = await cenario()
      const velha = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(40), presencas: [{ dbvId: c.ana.id }] })
      const envio = { uuid: velha.id, data: diasAtras(40), presencas: [{ dbvId: c.ana.id, presente: false }] }
      expect((await c.enviar(envio)).status).toBe(422)
      expect((await c.enviar({ ...envio, autorizacao: c.adm.autorizacao })).status).toBe(200)

      const recente = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(29), presencas: [{ dbvId: c.ana.id }] })
      const dentro = { uuid: recente.id, data: diasAtras(29), presencas: [{ dbvId: c.ana.id, presente: false }] }
      expect((await c.enviar(dentro)).status).toBe(200)
      // aparelho que so enviou depois de 7 dias perde o prazo, mesmo com a aula recente
      expect((await c.enviar({ ...dentro, feitaEm: new Date(Date.now() - 8 * DIA) })).status).toBe(422)
    })
  })

  describe('escopo e isolamento', () => {
    it('instrutor de outra classe recebe 404, conselheiro 403 e o Adm alcanca qualquer classe', async () => {
      const c = await cenario()
      const outra = await classeOficial('Companheiro')
      expect((await c.enviar({ classeId: outra.id })).status).toBe(404)
      const conselheiro = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO' })
      expect((await c.enviar({ autorizacao: conselheiro.autorizacao })).status).toBe(403)
      expect((await c.enviar({ classeId: outra.id, autorizacao: c.adm.autorizacao, presencas: [] })).status).toBe(200)
    })

    it('o registro de um clube nao aparece para o instrutor de outro, mesmo com o id', async () => {
      const a = await cenario()
      const b = await cenario()
      const saidaA = await a.ok(a.enviar({ data: diasAtras(2) }))
      const resposta = await b.enviar({ uuid: saidaA.registroAulaId, data: diasAtras(2) })
      expect(resposta.status).toBeGreaterThanOrEqual(400)
      const doA = await prismaDeTeste().presencaAula.findMany({ where: { registroAulaId: saidaA.registroAulaId } })
      expect(doA.every((p) => p.clubeId === a.clube.id)).toBe(true)
    })
  })

  describe('concorrencia', () => {
    async function comRetry(enviar: () => request.Test): Promise<request.Response> {
      let resposta = await enviar()
      for (let tentativa = 0; tentativa < 3 && resposta.status === 503; tentativa++) resposta = await enviar()
      return resposta
    }

    it('dois aparelhos criando a mesma (classe, data): a corrida responde 503 TEMPORARIO ou grava, e ha um so registro', async () => {
      const c = await cenario()
      const data = diasAtras(1)
      const respostas = await Promise.all([c.enviar({ data }), c.enviar({ data })])
      for (const resposta of respostas) expect([200, 503]).toContain(resposta.status)
      for (const resposta of respostas.filter((r) => r.status === 503)) {
        expect(corpo<{ codigo: string }>(resposta).codigo).toBe('TEMPORARIO')
      }
      const depois = await comRetry(() => c.enviar({ data }))
      expect(depois.status).toBe(200)
      expect(await prismaDeTeste().registroAula.count({ where: { clubeId: c.clube.id, classeId: c.classe.id } })).toBe(1)
      expect(await prismaDeTeste().atividade.count({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })).toBe(1)
    })
  })
})
