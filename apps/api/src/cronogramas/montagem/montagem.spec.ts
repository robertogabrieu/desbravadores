import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { CronogramaLeitura, MontagemSaida } from '@desbravadores/shared'
import { Client } from 'pg'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../../test/app'
import {
  admCriarRequisitoAjuste,
  admDefinirClasseClube,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarEvento,
  criarRegistroAula,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../../test/fabricas'
import { clienteHttp, corpo } from '../../../test/p6'

type Saida = z.infer<typeof MontagemSaida>
type Leitura = z.infer<typeof CronogramaLeitura>

// Domingos de 2026 (o dia de reunião padrão): 05/07, 12/07, 19/07. Segunda: 06/07.
const DOMINGO_A = '2026-07-05'
const DOMINGO_B = '2026-07-12'
const SEGUNDA = '2026-07-06'

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

interface ConsultaVista {
  conexao: number
  texto: string
}

/**
 * Registra cada consulta que qualquer conexão pg faz enquanto `acao` roda. A conexão é identificada pelo `processID`
 * do Postgres; a chamada original segue intacta.
 */
async function consultasDuranteA(acao: () => Promise<unknown>): Promise<ConsultaVista[]> {
  const espiao = jest.spyOn(Client.prototype, 'query')
  try {
    await acao()
    return espiao.mock.calls.map((argumentos, indice) => {
      const primeiro = argumentos[0] as unknown
      const texto = typeof primeiro === 'string' ? primeiro : ((primeiro as { text?: string } | undefined)?.text ?? '')
      return { conexao: (espiao.mock.contexts[indice] as unknown as { processID: number }).processID, texto }
    })
  } finally {
    espiao.mockRestore()
  }
}

/** O que outras conexões consultaram entre a trava do cronograma (FOR UPDATE) e o fim da transação que a segura. */
function consultasDeOutrasConexoesComATrava(vistas: ConsultaVista[]): ConsultaVista[] {
  const inicio = vistas.findIndex((vista) => /FOR UPDATE/i.test(vista.texto))
  expect(inicio).toBeGreaterThanOrEqual(0)
  const dona = vistas[inicio].conexao
  const fim = vistas.findIndex((vista, indice) => indice > inicio && vista.conexao === dona && /^\s*(COMMIT|ROLLBACK)/i.test(vista.texto))
  expect(fim).toBeGreaterThan(inicio)
  return vistas.slice(inicio, fim).filter((vista) => vista.conexao !== dona)
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

describe('Montagem do cronograma', () => {
  let app: INestApplication
  const http = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => jest.useRealTimers())

  async function cenario() {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const requisitos = await requisitosDa(amigo.id, 4)
    const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id })
    return { clube, amigo, adm, instrutor, requisitos, cronograma }
  }

  const colocar = (cronogramaId: string, requisitoId: string, data: string, auth: string) =>
    http.put(`/api/cronogramas/${cronogramaId}/requisitos/${requisitoId}`, auth, { data })
  const tirar = (cronogramaId: string, requisitoId: string, auth: string) =>
    request(app.getHttpServer() as Server).delete(`/api/cronogramas/${cronogramaId}/requisitos/${requisitoId}`).set('Authorization', auth)
  const requisitoNaSaida = (saida: Saida, id: string) => saida.requisitos.find((requisito) => requisito.id === id)
  const aulasAtivas = (cronogramaId: string) =>
    prismaDeTeste().aulaPlanejada.findMany({ where: { cronogramaId, removidaEm: null }, select: { id: true, data: true } })

  describe('GET /classes/:id/cronograma/montagem', () => {
    it('sem cronograma responde 200 com cronograma null', async () => {
      const { adm } = await cenario()
      const outra = await classeOficial('Companheiro')
      const resposta = await http.get(`/api/classes/${outra.id}/cronograma/montagem`, adm.autorizacao)
      expect(resposta.status).toBe(200)
      expect(corpo<Saida>(resposta)).toMatchObject({ cronograma: null, datas: [], requisitos: [], datasLivres: false })
    })

    it('traz dias de reunião, datas com aula (bloqueadas com conflito) e requisitos com a data atual', async () => {
      const { clube, amigo, adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: DOMINGO_A })

      const resposta = await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao)
      const saida = corpo<Saida>(resposta)
      const bloqueada = saida.datas.find((data) => data.data === DOMINGO_A)
      expect(bloqueada).toMatchObject({ conflito: true, aulaDada: false, requisitoIds: [requisitos[0]] })
      expect(bloqueada?.situacao.bloqueiaAula).toBe(true)
      expect(saida.datas.some((data) => data.data === DOMINGO_B && data.aulaId === null)).toBe(true)
      expect(saida.datas.some((data) => data.data === SEGUNDA)).toBe(false)
      expect(requisitoNaSaida(saida, requisitos[0])?.data).toBe(DOMINGO_A)
      expect(requisitoNaSaida(saida, requisitos[1])?.data).toBeNull()
      expect(saida.requisitos.map((requisito) => requisito.id).slice(0, 4)).toEqual(requisitos)
    })

    it('reflete o ajuste do clube: requisito desativado some e campo ajustado vale', async () => {
      const { clube, amigo, adm, requisitos } = await cenario()
      await admCriarRequisitoAjuste({ clubeId: clube.id, requisitoId: requisitos[0], ativo: false })
      await admCriarRequisitoAjuste({ clubeId: clube.id, requisitoId: requisitos[1], campo: true })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      expect(requisitoNaSaida(saida, requisitos[0])).toBeUndefined()
      expect(requisitoNaSaida(saida, requisitos[1])?.campo).toBe(true)
    })

    it('requisito que saiu do caderno oficial não volta por ajuste do clube: some da leitura e não se coloca', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const guia = await classeOficial('Guia')
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: guia.id })
      const [requisitoId] = await requisitosDa(guia.id, 1)
      // O catálogo oficial é compartilhado: desliga um requisito da classe Guia (que nenhum outro teste conta) e religa no finally.
      await prismaDeTeste().requisito.update({ where: { id: requisitoId }, data: { ativo: false } })
      try {
        await admCriarRequisitoAjuste({ clubeId: clube.id, requisitoId, ativo: true })
        const saida = corpo<Saida>(await http.get(`/api/classes/${guia.id}/cronograma/montagem`, adm.autorizacao))
        expect(requisitoNaSaida(saida, requisitoId)).toBeUndefined()
        expect((await colocar(cronograma.id, requisitoId, DOMINGO_A, adm.autorizacao)).status).toBe(404)
      } finally {
        await prismaDeTeste().requisitoAjuste.deleteMany({ where: { requisitoId } })
        await prismaDeTeste().requisito.update({ where: { id: requisitoId }, data: { ativo: true } })
      }
    })

    it('colocar e desativar o mesmo requisito ao mesmo tempo nunca deixa requisito desativado colocado', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      const desativar = () => http.patch(`/api/requisitos/${requisitos[0]}/ajuste`, adm.autorizacao, { ativo: false })
      await Promise.all([colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao), desativar()])
      expect(await prismaDeTeste().aulaRequisito.count({ where: { cronogramaId: cronograma.id, requisitoId: requisitos[0] } })).toBe(0)
    })

    it('marca aula dada na data com registro, mesmo sem aula planejada', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_B })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      expect(saida.datas.find((data) => data.data === DOMINGO_B)?.aulaDada).toBe(true)
    })

    it('instrutor da classe que não monta recebe 403; instrutor de outra classe, 404; classe liberada abre', async () => {
      const { clube, amigo, instrutor } = await cenario()
      const foraDoVinculo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [(await classeOficial('Companheiro')).id] })
      const rota = `/api/classes/${amigo.id}/cronograma/montagem`
      expect((await http.get(rota, instrutor.autorizacao)).status).toBe(403)
      expect((await http.get(rota, foraDoVinculo.autorizacao)).status).toBe(404)
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      expect((await http.get(rota, instrutor.autorizacao)).status).toBe(200)
    })

    it('conselheiro recebe 403', async () => {
      const { clube, amigo } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      expect((await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, conselheiro.autorizacao)).status).toBe(403)
    })
  })

  describe('POST /cronogramas e PATCH /cronogramas/:id', () => {
    it('cria o cronograma em rascunho com o período dado; repetir o ano responde 409', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const entrada = { classeId: amigo.id, anoClube: 2026, inicio: '2026-02-01', fim: '2027-01-31' }
      const criado = await http.post('/api/cronogramas', adm.autorizacao, entrada)
      expect(criado.status).toBe(201)
      expect(corpo<Saida>(criado).cronograma).toMatchObject({ status: 'RASCUNHO', inicio: '2026-02-01', fim: '2027-01-31' })
      expect((await http.post('/api/cronogramas', adm.autorizacao, entrada)).status).toBe(409)
      expect((await http.post('/api/cronogramas', adm.autorizacao, { classeId: amigo.id, anoClube: 2026, inicio: '2026-02-01' })).status).toBe(400)
    })

    it('período que deixa aula de fora responde 422 listando as datas; período válido grava', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const recusado = await http.patch(`/api/cronogramas/${cronograma.id}`, adm.autorizacao, { inicio: '2026-02-01', fim: '2026-06-30' })
      expect(recusado.status).toBe(422)
      expect((corpo<{ mensagem: string }>(recusado)).mensagem).toContain('05/07')
      const aceito = await http.patch(`/api/cronogramas/${cronograma.id}`, adm.autorizacao, { inicio: '2026-03-01', fim: '2026-12-31' })
      expect(aceito.status).toBe(200)
      expect(corpo<Saida>(aceito).cronograma?.inicio).toBe('2026-03-01')
    })
  })

  describe('colocar, mover e tirar requisito (individuais)', () => {
    it('coloca: cria a aula da data e o requisito passa a ter data', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      const resposta = await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      expect(resposta.status).toBe(200)
      const saida = corpo<Saida>(resposta)
      expect(requisitoNaSaida(saida, requisitos[0])?.data).toBe(DOMINGO_A)
      expect(saida.datas.find((data) => data.data === DOMINGO_A)?.requisitoIds).toEqual([requisitos[0]])
    })

    it('move: a aula que esvazia é removida; a que ainda tem requisito fica', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitos[1], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitos[0], DOMINGO_B, adm.autorizacao)
      let ativas = await aulasAtivas(cronograma.id)
      expect(ativas).toHaveLength(2)
      await colocar(cronograma.id, requisitos[1], DOMINGO_B, adm.autorizacao)
      ativas = await aulasAtivas(cronograma.id)
      expect(ativas.map((aula) => aula.data.toISOString().slice(0, 10))).toEqual([DOMINGO_B])
      const removidas = await prismaDeTeste().aulaPlanejada.count({ where: { cronogramaId: cronograma.id, removidaEm: { not: null } } })
      expect(removidas).toBe(1)
    })

    it('tira: a aula esvaziada é removida e o requisito fica sem data', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const resposta = await tirar(cronograma.id, requisitos[0], adm.autorizacao)
      expect(resposta.status).toBe(200)
      expect(requisitoNaSaida(corpo<Saida>(resposta), requisitos[0])?.data).toBeNull()
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
    })

    it('data que não é de aula (segunda-feira) ou fora do período responde 422', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      expect((await colocar(cronograma.id, requisitos[0], SEGUNDA, adm.autorizacao)).status).toBe(422)
      expect((await colocar(cronograma.id, requisitos[0], '2027-03-07', adm.autorizacao)).status).toBe(422)
    })

    it('data bloqueada por evento responde 422; acampamento com bom para campo aceita a sexta', async () => {
      const { clube, adm, requisitos, cronograma } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: DOMINGO_A })
      expect((await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)).status).toBe(422)
      await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: '2026-07-17', fim: '2026-07-19' })
      expect((await colocar(cronograma.id, requisitos[0], '2026-07-17', adm.autorizacao)).status).toBe(200)
    })

    it('requisito de outra classe responde 404', async () => {
      const { adm, cronograma } = await cenario()
      const [deOutraClasse] = await requisitosDa((await classeOficial('Companheiro')).id, 1)
      expect((await colocar(cronograma.id, deOutraClasse, DOMINGO_A, adm.autorizacao)).status).toBe(404)
    })
  })

  describe('classes agrupadas', () => {
    async function cenarioAgrupadas() {
      const clube = await criarClube()
      const classe = await prismaDeTeste().classe.findFirstOrThrow({ where: { trilha: 'AGRUPADAS', clubeId: null }, select: { id: true } })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const requisitos = await requisitosDa(classe.id, 2)
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: classe.id })
      return { clube, classe, adm, requisitos, cronograma }
    }
    const criarAula = (cronogramaId: string, data: string, auth: string) =>
      http.post(`/api/cronogramas/${cronogramaId}/aulas`, auth, { data, horario: null, local: null, titulo: null })

    it('aceita aula em qualquer data; colocar exige a aula criada; tirar não remove a aula', async () => {
      const { adm, requisitos, cronograma } = await cenarioAgrupadas()
      expect((await colocar(cronograma.id, requisitos[0], SEGUNDA, adm.autorizacao)).status).toBe(422)
      const criada = await criarAula(cronograma.id, SEGUNDA, adm.autorizacao)
      expect(criada.status).toBe(201)
      expect(corpo<Saida>(criada)).toMatchObject({ datasLivres: true, datas: [{ data: SEGUNDA }] })
      expect((await colocar(cronograma.id, requisitos[0], SEGUNDA, adm.autorizacao)).status).toBe(200)
      await tirar(cronograma.id, requisitos[0], adm.autorizacao)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
    })

    it('POST aulas em data com aula ativa responde 409', async () => {
      const { adm, cronograma } = await cenarioAgrupadas()
      await criarAula(cronograma.id, SEGUNDA, adm.autorizacao)
      expect((await criarAula(cronograma.id, SEGUNDA, adm.autorizacao)).status).toBe(409)
    })

    it('classe individual não cria aula por data (422)', async () => {
      const { adm, cronograma } = await cenario()
      expect((await criarAula(cronograma.id, DOMINGO_A, adm.autorizacao)).status).toBe(422)
    })
  })

  describe('aula dada', () => {
    it('data com registro (sem aula planejada) recusa colocar; aula com registro recusa tirar e editar', async () => {
      const { clube, amigo, adm, requisitos, cronograma } = await cenario()
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_B })
      const recusada = await colocar(cronograma.id, requisitos[0], DOMINGO_B, adm.autorizacao)
      expect(recusada.status).toBe(422)
      expect(corpo<{ mensagem: string }>(recusada).mensagem).toBe('Esta aula já foi dada.')

      await colocar(cronograma.id, requisitos[1], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_A })
      expect((await tirar(cronograma.id, requisitos[1], adm.autorizacao)).status).toBe(422)
      expect((await colocar(cronograma.id, requisitos[1], '2026-07-19', adm.autorizacao)).status).toBe(422)
      expect((await http.patch(`/api/aulas-planejadas/${aula.id}`, adm.autorizacao, { horario: '10:00' })).status).toBe(422)
    })
  })

  describe('concorrência (G3) e estado', () => {
    it('toda edição volta a RASCUNHO e renova atualizadoEm, inclusive já em rascunho', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      const primeira = corpo<Saida>(await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao))
      const segunda = corpo<Saida>(await colocar(cronograma.id, requisitos[1], DOMINGO_A, adm.autorizacao))
      expect(segunda.cronograma?.status).toBe('RASCUNHO')
      expect(new Date(segunda.cronograma?.atualizadoEm ?? 0).getTime()).toBeGreaterThan(new Date(primeira.cronograma?.atualizadoEm ?? 0).getTime())

      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'PUBLICADO' } })
      const terceira = corpo<Saida>(await tirar(cronograma.id, requisitos[1], adm.autorizacao))
      expect(terceira.cronograma?.status).toBe('RASCUNHO')
    })

    it('enquanto trava o cronograma, colocar e publicar leem só pela própria transação (nenhuma outra conexão)', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      const versao = async () => (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronograma.id } })).atualizadoEm.toISOString()

      const colocando = await consultasDuranteA(() => colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao))
      expect(consultasDeOutrasConexoesComATrava(colocando)).toEqual([])

      const visto = await versao()
      const publicando = await consultasDuranteA(() => http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: visto }))
      expect(consultasDeOutrasConexoesComATrava(publicando)).toEqual([])
    })

    it('editar horário, local e título da aula', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)
      const resposta = await http.patch(`/api/aulas-planejadas/${aula.id}`, adm.autorizacao, { horario: '09:30', local: 'Salão', titulo: 'Nós' })
      expect(resposta.status).toBe(200)
      expect(corpo<Saida>(resposta).datas.find((data) => data.data === DOMINGO_A)).toMatchObject({ horario: '09:30', local: 'Salão', titulo: 'Nós' })
    })
  })

  describe('enviar e publicar', () => {
    async function cenarioInstrutorLiberado() {
      const base = await cenario()
      await admDefinirClasseClube({ clubeId: base.clube.id, classeId: base.amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      return base
    }
    const visto = async (cronogramaId: string) =>
      (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronogramaId } })).atualizadoEm.toISOString()

    it('instrutor liberado monta e envia; o Adm é avisado e a atividade registrada', async () => {
      const { clube, instrutor, adm, requisitos, cronograma } = await cenarioInstrutorLiberado()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, instrutor.autorizacao)
      const resposta = await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })
      expect(resposta.status).toBe(200)
      expect(corpo<Saida>(resposta).cronograma).toMatchObject({ status: 'ENVIADO', enviadoPor: instrutor.usuario.nome })
      const avisos = await prismaDeTeste().notificacao.findMany({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_ENVIADO' } })
      expect(avisos.map((aviso) => aviso.usuarioId)).toEqual([adm.usuario.id])
      expect(await prismaDeTeste().atividade.count({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_ENVIADO' } })).toBe(1)
    })

    it('enviar com atualizadoEmVisto velho responde 409; Adm não envia (403); só de rascunho (422)', async () => {
      const { instrutor, adm, cronograma } = await cenarioInstrutorLiberado()
      const velho = await visto(cronograma.id)
      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { atualizadoEm: new Date('2026-06-16T00:00:00Z') } })
      expect((await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: velho })).status).toBe(409)
      expect((await http.post(`/api/cronogramas/${cronograma.id}/enviar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(403)
      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'ENVIADO' } })
      expect((await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(422)
    })

    it('instrutor que não monta não edita nem envia (403)', async () => {
      const { instrutor, requisitos, cronograma } = await cenario()
      expect((await colocar(cronograma.id, requisitos[0], DOMINGO_A, instrutor.autorizacao)).status).toBe(403)
      expect((await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(403)
    })

    it('publicar com atualizadoEmVisto velho responde 409 e nada é publicado', async () => {
      const { adm, cronograma } = await cenario()
      const velho = new Date('2020-01-01T00:00:00Z').toISOString()
      expect((await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: velho })).status).toBe(409)
      expect(await prismaDeTeste().cronogramaPublicacao.count({ where: { cronogramaId: cronograma.id } })).toBe(0)
    })

    it('publicar grava o retrato; quem não monta passa a ver o publicado; instrutores são avisados com o link certo', async () => {
      const { clube, amigo, adm, instrutor, requisitos, cronograma } = await cenario()
      const quemMonta = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const antes = corpo<Leitura>(await http.get(`/api/classes/${amigo.id}/cronograma`, instrutor.autorizacao))
      expect(antes.aulas).toHaveLength(0)

      const resposta = await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })
      expect(resposta.status).toBe(200)
      expect(corpo<Saida>(resposta).cronograma).toMatchObject({ status: 'PUBLICADO' })
      expect(corpo<Saida>(resposta).cronograma?.publicadoEm).not.toBeNull()

      const publicacao = await prismaDeTeste().cronogramaPublicacao.findFirstOrThrow({ where: { cronogramaId: cronograma.id } })
      expect(publicacao.conteudo).toMatchObject({ aulas: [{ data: DOMINGO_A, requisitoIds: [requisitos[0]] }] })
      const depois = corpo<Leitura>(await http.get(`/api/classes/${amigo.id}/cronograma`, instrutor.autorizacao))
      expect(depois.aulas.map((aula) => aula.data)).toEqual([DOMINGO_A])

      const avisos = await prismaDeTeste().notificacao.findMany({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_PUBLICADO' } })
      expect(avisos.map((aviso) => aviso.usuarioId).sort()).toEqual([instrutor.usuario.id, quemMonta.usuario.id].sort())
      expect(avisos.every((aviso) => aviso.link === `/cronograma?classe=${amigo.id}`)).toBe(true)
      expect(await prismaDeTeste().atividade.count({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_PUBLICADO' } })).toBe(1)
    })

    it('quem monta é avisado com o link da montagem; instrutor não publica (403); publicado não publica de novo (422)', async () => {
      const { clube, amigo, adm, instrutor, cronograma } = await cenarioInstrutorLiberado()
      expect((await http.post(`/api/cronogramas/${cronograma.id}/publicar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(403)
      await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })
      const aviso = await prismaDeTeste().notificacao.findFirstOrThrow({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_PUBLICADO' } })
      expect(aviso.link).toBe(`/cronograma/montar?classe=${amigo.id}`)
      expect((await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(422)
    })
  })

  describe('lote M1: remover aula, classe desativada e datas bloqueadas', () => {
    const removerAula = (aulaId: string, auth: string) =>
      request(app.getHttpServer() as Server).delete(`/api/aulas-planejadas/${aulaId}`).set('Authorization', auth)
    const criarAulaAgrupada = (cronogramaId: string, data: string, auth: string) =>
      http.post(`/api/cronogramas/${cronogramaId}/aulas`, auth, { data, horario: null, local: null, titulo: null })

    it('DELETE aula individual: remoção lógica, requisitos voltam a sem data e o cronograma volta a rascunho', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitos[1], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)
      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'PUBLICADO' } })
      const antes = (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronograma.id } })).atualizadoEm.getTime()

      const resposta = await removerAula(aula.id, adm.autorizacao)
      expect(resposta.status).toBe(200)
      const saida = corpo<Saida>(resposta)
      expect(saida.cronograma?.status).toBe('RASCUNHO')
      expect(new Date(saida.cronograma?.atualizadoEm ?? 0).getTime()).toBeGreaterThan(antes)
      expect(requisitoNaSaida(saida, requisitos[0])?.data).toBeNull()
      expect(requisitoNaSaida(saida, requisitos[1])?.aulaId).toBeNull()
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
      expect(await prismaDeTeste().aulaPlanejada.count({ where: { id: aula.id, removidaEm: { not: null } } })).toBe(1)
    })

    it('DELETE aula agrupada remove a aula; aula dada 422; outra aula inexistente 404; instrutor que não monta 403', async () => {
      const clube = await criarClube()
      const classe = await prismaDeTeste().classe.findFirstOrThrow({ where: { trilha: 'AGRUPADAS', clubeId: null }, select: { id: true } })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: classe.id })
      await criarAulaAgrupada(cronograma.id, SEGUNDA, adm.autorizacao)
      await criarAulaAgrupada(cronograma.id, '2026-07-07', adm.autorizacao)
      const [primeira, segunda] = await aulasAtivas(cronograma.id)
      await criarRegistroAula({ clubeId: clube.id, classeId: classe.id, data: '2026-07-07' })

      expect((await removerAula(segunda.id, adm.autorizacao)).status).toBe(422)
      expect((await removerAula(primeira.id, instrutor.autorizacao)).status).toBe(403)
      expect((await removerAula('019d0000-0000-7000-8000-000000000000', adm.autorizacao)).status).toBe(404)
      const resposta = await removerAula(primeira.id, adm.autorizacao)
      expect(resposta.status).toBe(200)
      expect((await aulasAtivas(cronograma.id)).map((aula) => aula.id)).toEqual([segunda.id])
      expect((await removerAula(primeira.id, adm.autorizacao)).status).toBe(404)
    })

    it('DELETE aula de outro clube responde 404', async () => {
      const { adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)
      const intruso = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
      expect((await removerAula(aula.id, intruso.autorizacao)).status).toBe(404)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
    })

    it('classe desativada no clube: toda mutação responde 422 e o GET continua lendo', async () => {
      const { clube, amigo, adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)
      const vistoAgora = (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronograma.id } })).atualizadoEm.toISOString()
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: false })
      const auth = adm.autorizacao
      const chamadas = [
        () => http.post('/api/cronogramas', auth, { classeId: amigo.id, anoClube: 2030, inicio: '2030-02-01', fim: '2030-12-31' }),
        () => http.patch(`/api/cronogramas/${cronograma.id}`, auth, { inicio: '2026-02-01', fim: '2026-12-31' }),
        () => colocar(cronograma.id, requisitos[1], DOMINGO_B, auth),
        () => tirar(cronograma.id, requisitos[0], auth),
        () => http.post(`/api/cronogramas/${cronograma.id}/aulas`, auth, { data: DOMINGO_B, horario: null, local: null, titulo: null }),
        () => http.patch(`/api/aulas-planejadas/${aula.id}`, auth, { horario: '10:00' }),
        () => removerAula(aula.id, auth),
        () => http.post(`/api/cronogramas/${cronograma.id}/publicar`, auth, { atualizadoEmVisto: vistoAgora }),
      ]
      const respostas = []
      for (const chamada of chamadas) respostas.push(await chamada())
      expect(respostas.map((resposta) => resposta.status)).toEqual(Array(chamadas.length).fill(422))
      expect(corpo<{ mensagem: string }>(respostas[2]).mensagem).toBe('Esta classe está desativada no clube.')
      expect((await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, auth)).status).toBe(200)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
    })

    it('classe desativada: enviar também responde 422', async () => {
      const { clube, amigo, cronograma } = await cenario()
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR', ativa: false })
      const visto = (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronograma.id } })).atualizadoEm.toISOString()
      const resposta = await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: visto })
      expect(resposta.status).toBe(422)
      expect(corpo<{ mensagem: string }>(resposta).mensagem).toBe('Esta classe está desativada no clube.')
    })

    it('individuais: dia de reunião com evento que bloqueia aparece sem aula, com a situação e sem conflito', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: DOMINGO_A })
      await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: DOMINGO_B })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      const bloqueada = saida.datas.find((data) => data.data === DOMINGO_A)
      expect(bloqueada).toMatchObject({ aulaId: null, conflito: false, situacao: { bloqueiaAula: true } })
      expect(saida.datas.find((data) => data.data === DOMINGO_B)).toMatchObject({ aulaId: null, conflito: false, situacao: { cancelaReuniao: true } })
      expect(saida.datas.some((data) => data.data === SEGUNDA)).toBe(false)
    })

    it('individuais: data bomParaCampo fora do dia de reunião aparece sem aula', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: '2026-07-17', fim: '2026-07-18' })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      expect(saida.datas.find((data) => data.data === '2026-07-17')).toMatchObject({ aulaId: null, situacao: { bomParaCampo: true } })
    })
  })

  describe('isolamento entre clubes', () => {
    it('Adm de outro clube recebe 404 em toda rota de cronograma alheio e nada muda', async () => {
      const { requisitos, cronograma } = await cenario()
      const outroClube = await criarClube()
      const intruso = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })
      const [aula] = (await colocarComoAdmDoClube(cronograma.id, requisitos[0])) ?? []
      const vistoAgora = new Date().toISOString()
      const auth = intruso.autorizacao
      // Uma requisição por vez: em rajada o servidor de teste derruba a conexão (ECONNRESET).
      const chamadas = [
        () => colocar(cronograma.id, requisitos[1], DOMINGO_A, auth),
        () => tirar(cronograma.id, requisitos[0], auth),
        () => http.patch(`/api/cronogramas/${cronograma.id}`, auth, { inicio: '2026-02-01', fim: '2026-12-31' }),
        () => http.post(`/api/cronogramas/${cronograma.id}/aulas`, auth, { data: DOMINGO_B, horario: null, local: null, titulo: null }),
        () => http.patch(`/api/aulas-planejadas/${aula.id}`, auth, { horario: '10:00' }),
        () => http.post(`/api/cronogramas/${cronograma.id}/enviar`, auth, { atualizadoEmVisto: vistoAgora }),
        () => http.post(`/api/cronogramas/${cronograma.id}/publicar`, auth, { atualizadoEmVisto: vistoAgora }),
      ]
      const respostas = []
      for (const chamada of chamadas) respostas.push(await chamada())
      expect(respostas.map((resposta) => resposta.status)).toEqual([404, 404, 404, 404, 404, 404, 404])
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)

      const propria = corpo<Saida>(await http.get(`/api/classes/${cronograma.classeId}/cronograma/montagem`, auth))
      expect(propria.cronograma).toBeNull()
    })

    async function colocarComoAdmDoClube(cronogramaId: string, requisitoId: string) {
      const cronograma = await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronogramaId } })
      const adm = await criarAcesso({ clubeId: cronograma.clubeId, papel: 'ADM' })
      await colocar(cronogramaId, requisitoId, DOMINGO_A, adm.autorizacao)
      return aulasAtivas(cronogramaId)
    }
  })
})
