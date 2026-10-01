import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { AulaEnvioSaida } from '@desbravadores/shared'
import type { PacoteSaida, ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarRequisitoConcluido,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo, hoje } from '../../test/p6'

type Pacote = z.infer<typeof PacoteSaida>

const MENSAGEM = 'Outro instrutor ou o Adm registra os seus requisitos.'

describe('instrutor que cursa a classe que instrui não marca os próprios requisitos', () => {
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

  async function cenario() {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const requisito = await prismaDeTeste().requisito.findFirstOrThrow({ where: { ativo: true, secao: { classeId: amigo.id } } })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const propria = await criarDbv({ clubeId: clube.id, nome: 'Ivo Instrutor', usuarioId: instrutor.usuario.id })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    for (const dbv of [propria, ana]) await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
    return { clube, amigo, requisito, instrutor, adm, propria, ana }
  }

  const caminho = (dbvId: string, requisitoId: string) => `/api/desbravadores/${dbvId}/requisitos/${requisitoId}`

  it('marcar a própria ficha é recusado com 422 e nada é gravado', async () => {
    const { requisito, instrutor, propria } = await cenario()
    const resposta = await api.put(caminho(propria.id, requisito.id), instrutor.autorizacao, { concluidoEm: hoje() }).expect(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: MENSAGEM })
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: propria.id } })).toBe(0)
  })

  it('desmarcar a própria ficha também é recusado, e a conclusão continua', async () => {
    const { clube, requisito, instrutor, propria } = await cenario()
    await criarRequisitoConcluido({ clubeId: clube.id, dbvId: propria.id, requisitoId: requisito.id })
    const resposta = await apagar(caminho(propria.id, requisito.id), instrutor.autorizacao).expect(422)
    expect(resposta.body).toMatchObject({ mensagem: MENSAGEM })
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: propria.id, removidoEm: null } })).toBe(1)
  })

  it('o mesmo instrutor marca a ficha de outra pessoa da turma', async () => {
    const { requisito, instrutor, ana } = await cenario()
    await api.put(caminho(ana.id, requisito.id), instrutor.autorizacao, { concluidoEm: hoje() }).expect(200)
  })

  it('o Adm marca a ficha do instrutor', async () => {
    const { requisito, adm, propria } = await cenario()
    await api.put(caminho(propria.id, requisito.id), adm.autorizacao, { concluidoEm: hoje() }).expect(200)
  })

  it('no progresso, a ficha dele vem marcada como "você" e sem permissão de marcar', async () => {
    const { amigo, instrutor, propria, ana } = await cenario()
    const daClasse = corpo<z.infer<typeof ProgressoClasseSaida>>(await api.get(`/api/classes/${amigo.id}/progresso`, instrutor.autorizacao).expect(200))
    const voce = new Map(daClasse.itens.map((item) => [item.dbvId, item.voce]))
    expect(voce.get(propria.id)).toBe(true)
    expect(voce.get(ana.id)).toBe(false)

    const doDbv = corpo<z.infer<typeof ProgressoDbvSaida>>(await api.get(`/api/desbravadores/${propria.id}/progresso`, instrutor.autorizacao).expect(200))
    const podeMarcar = (saida: z.infer<typeof ProgressoDbvSaida>) =>
      new Set(saida.matriculas.flatMap((m) => m.secoes.flatMap((secao) => secao.requisitos.map((r) => r.podeMarcar))))
    expect(podeMarcar(doDbv)).toEqual(new Set([false]))
    const outra = corpo<z.infer<typeof ProgressoDbvSaida>>(await api.get(`/api/desbravadores/${ana.id}/progresso`, instrutor.autorizacao).expect(200))
    expect(podeMarcar(outra)).toEqual(new Set([true]))
  })

  it('no pacote da aula, a ficha dele vem marcada como "você"', async () => {
    const { instrutor, propria, ana } = await cenario()
    const pacote = corpo<Pacote>(await api.get('/api/sync/pacote', instrutor.autorizacao).expect(200))
    const membros = pacote.instrutor?.classes[0]?.membros ?? []
    expect(membros.find((m) => m.dbvId === propria.id)?.voce).toBe(true)
    expect(membros.find((m) => m.dbvId === ana.id)?.voce).toBe(false)
  })

  const enviarAula = (classeId: string, autorizacao: string, dados: { presencas: string[]; marcados?: { dbvId: string; requisitoId: string }[]; desmarcados?: { dbvId: string; requisitoId: string }[] }) =>
    api.put(`/api/sync/aulas/${randomUUID()}`, autorizacao, {
      versaoPayload: 1,
      envioId: randomUUID(),
      classeId,
      data: hoje(),
      feitaNoAparelhoEm: new Date().toISOString(),
      aulaPlanejadaId: null,
      presencas: dados.presencas.map((dbvId) => ({ dbvId, presente: true, versaoVista: null })),
      requisitosMarcados: dados.marcados ?? [],
      requisitosDesmarcados: dados.desmarcados ?? [],
    })

  it('no envio da aula, a marcação da própria ficha fica sem efeito e o resto da aula grava', async () => {
    const { amigo, requisito, instrutor, propria, ana } = await cenario()
    const saida = corpo<z.infer<typeof AulaEnvioSaida>>(
      await enviarAula(amigo.id, instrutor.autorizacao, {
        presencas: [propria.id, ana.id],
        marcados: [
          { dbvId: propria.id, requisitoId: requisito.id },
          { dbvId: ana.id, requisitoId: requisito.id },
        ],
      }).expect(200),
    )
    expect(saida.requisitosSemEfeito).toEqual([{ dbvId: propria.id, requisitoId: requisito.id, motivo: 'PROPRIA_FICHA', concluidoEm: null }])
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: propria.id } })).toBe(0)
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: ana.id, removidoEm: null } })).toBe(1)
    expect(await prismaDeTeste().presencaAula.count({ where: { registroAulaId: saida.registroAulaId, presente: true } })).toBe(2)
  })

  it('envio antigo da fila que desmarca a própria ficha sobe sem erro e a conclusão continua', async () => {
    const { clube, amigo, requisito, instrutor, propria, ana } = await cenario()
    await criarRequisitoConcluido({ clubeId: clube.id, dbvId: propria.id, requisitoId: requisito.id })
    const saida = corpo<z.infer<typeof AulaEnvioSaida>>(
      await enviarAula(amigo.id, instrutor.autorizacao, {
        presencas: [propria.id, ana.id],
        desmarcados: [{ dbvId: propria.id, requisitoId: requisito.id }],
      }).expect(200),
    )
    expect(saida.requisitosSemEfeito).toEqual([{ dbvId: propria.id, requisitoId: requisito.id, motivo: 'PROPRIA_FICHA', concluidoEm: null }])
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: propria.id, removidoEm: null } })).toBe(1)
  })

  it('no envio da aula, o Adm marca a ficha do instrutor', async () => {
    const { amigo, requisito, adm, propria } = await cenario()
    const saida = corpo<z.infer<typeof AulaEnvioSaida>>(
      await enviarAula(amigo.id, adm.autorizacao, { presencas: [propria.id], marcados: [{ dbvId: propria.id, requisitoId: requisito.id }] }).expect(200),
    )
    expect(saida.requisitosSemEfeito).toEqual([])
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { dbvId: propria.id, removidoEm: null } })).toBe(1)
  })
})
