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
  anoCorrente,
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
      expect(bloqueada).toMatchObject({ conflito: true, classeIdsComAulaDada: [], requisitoIds: [requisitos[0]] })
      expect(bloqueada?.situacao).toMatchObject({ temClasse: false, reuniaoMantida: false, extra: null })
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
      expect(saida.datas.find((data) => data.data === DOMINGO_B)?.classeIdsComAulaDada).toEqual([amigo.id])
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
      expect((corpo<{ mensagem: string }>(recusado)).mensagem).toBe('Há classes fora do novo período: 05/07. Mova-as antes.')
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
      const semAula = await colocar(cronograma.id, requisitos[0], SEGUNDA, adm.autorizacao)
      expect(semAula.status).toBe(422)
      expect(corpo<{ mensagem: string }>(semAula).mensagem).toBe('Crie o dia de classe desta data antes de colocar o requisito.')
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
      const repetida = await criarAula(cronograma.id, SEGUNDA, adm.autorizacao)
      expect(repetida.status).toBe(409)
      expect(corpo<{ mensagem: string }>(repetida).mensagem).toBe('Já existe dia de classe nesta data.')
    })

    it('classe individual não cria aula por data (422)', async () => {
      const { adm, cronograma } = await cenario()
      const recusada = await criarAula(cronograma.id, DOMINGO_A, adm.autorizacao)
      expect(recusada.status).toBe(422)
      expect(corpo<{ mensagem: string }>(recusada).mensagem).toBe('Só as classes agrupadas aceitam qualquer data.')
    })
  })

  describe('aula dada', () => {
    it('data com registro (sem aula planejada) recusa colocar; aula com registro recusa tirar e editar', async () => {
      const { clube, amigo, adm, requisitos, cronograma } = await cenario()
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_B })
      const recusada = await colocar(cronograma.id, requisitos[0], DOMINGO_B, adm.autorizacao)
      expect(recusada.status).toBe(422)
      expect(corpo<{ mensagem: string }>(recusada).mensagem).toBe('Esta classe já foi dada.')

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

      const statusDasChamadas: number[] = []
      const colocando = await consultasDuranteA(async () => {
        statusDasChamadas.push((await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)).status)
      })

      const visto = await versao()
      const publicando = await consultasDuranteA(async () => {
        statusDasChamadas.push((await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: visto })).status)
      })
      expect(statusDasChamadas).toEqual([200, 200])
      expect(consultasDeOutrasConexoesComATrava(colocando)).toEqual([])
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
      const inexistente = await removerAula('019d0000-0000-7000-8000-000000000000', adm.autorizacao)
      expect(inexistente.status).toBe(404)
      expect(corpo<{ mensagem: string }>(inexistente).mensagem).toBe('Dia de classe não encontrado.')
      const resposta = await removerAula(primeira.id, adm.autorizacao)
      expect(resposta.status).toBe(200)
      expect((await aulasAtivas(cronograma.id)).map((aula) => aula.id)).toEqual([segunda.id])
      const jaRemovida = await removerAula(primeira.id, adm.autorizacao)
      expect(jaRemovida.status).toBe(404)
      expect(corpo<{ mensagem: string }>(jaRemovida).mensagem).toBe('Dia de classe não encontrado.')
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
      expect(bloqueada).toMatchObject({ aulaId: null, conflito: false, situacao: { temClasse: false, reuniaoMantida: true, extra: null } })
      expect(saida.datas.find((data) => data.data === DOMINGO_B)).toMatchObject({ aulaId: null, conflito: false, situacao: { temClasse: false, reuniaoMantida: false, extra: null } })
      expect(saida.datas.some((data) => data.data === SEGUNDA)).toBe(false)
    })

    it('individuais: data bomParaCampo fora do dia de reunião aparece sem aula', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: '2026-07-17', fim: '2026-07-18' })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      expect(saida.datas.find((data) => data.data === '2026-07-17')).toMatchObject({ aulaId: null, situacao: { bomParaCampo: true } })
    })

    it('individuais: os domingos das férias somem da montagem', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-07-01', fim: '2026-07-31' })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      const datasDeJulho = saida.datas.map((data) => data.data).filter((data) => data.startsWith('2026-07'))
      expect(datasDeJulho).toEqual([])
      expect(saida.datas.some((data) => data.data === '2026-06-28')).toBe(true)
    })

    it('individuais: domingo em férias com classe marcada aparece, em conflito e sem classe', async () => {
      const { clube, amigo, adm, requisitos, cronograma } = await cenario()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-07-01', fim: '2026-07-31' })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      expect(saida.datas.filter((data) => data.data.startsWith('2026-07')).map((data) => data.data)).toEqual([DOMINGO_A])
      expect(saida.datas.find((data) => data.data === DOMINGO_A)).toMatchObject({ conflito: true, situacao: { temClasse: false, ferias: true } })
    })

    it('individuais: acampamento dentro das férias e extra com classe entram; extra só com reunião não', async () => {
      const { clube, amigo, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-07-01', fim: '2026-07-31' })
      await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: '2026-07-17', fim: '2026-07-19' })
      await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-07-08' })
      await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-07-22', marcacoes: { temClasse: false } })
      const saida = corpo<Saida>(await http.get(`/api/classes/${amigo.id}/cronograma/montagem`, adm.autorizacao))
      const datasDeJulho = saida.datas.map((data) => data.data).filter((data) => data.startsWith('2026-07'))
      expect(datasDeJulho).toEqual(['2026-07-08', '2026-07-17', '2026-07-18', '2026-07-19'])
      expect(saida.datas.find((data) => data.data === '2026-07-08')).toMatchObject({ situacao: { temClasse: true, extra: { temClasse: true } } })
    })

    it('agrupadas seguem livres: férias não filtram as datas criadas', async () => {
      const clube = await criarClube()
      const classe = await prismaDeTeste().classe.findFirstOrThrow({ where: { trilha: 'AGRUPADAS', clubeId: null }, select: { id: true } })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: classe.id })
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-07-01', fim: '2026-07-31' })
      const criada = await criarAulaAgrupada(cronograma.id, SEGUNDA, adm.autorizacao)
      expect(criada.status).toBe(201)
      expect(corpo<Saida>(criada)).toMatchObject({ datasLivres: true, datas: [{ data: SEGUNDA }] })
    })

    it('colocar em data de férias responde 422 "não é dia de classe"; na quarta da extra com classe grava', async () => {
      const { clube, adm, requisitos, cronograma } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2026-07-01', fim: '2026-07-31' })
      await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-07-08' })
      const recusada = await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      expect(recusada.status).toBe(422)
      expect(corpo<{ mensagem: string }>(recusada).mensagem).toBe('Esta data não é dia de classe.')
      expect((await colocar(cronograma.id, requisitos[0], '2026-07-08', adm.autorizacao)).status).toBe(200)
    })
  })

  describe('regular e avançada juntas: um cronograma só', () => {
    async function cenarioPar() {
      const base = await cenario()
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({
        where: { tipo: 'AVANCADA', clubeId: null, classeBase: { nome: 'Amigo' } },
        select: { id: true, nome: true },
      })
      const requisitosAvancada = await requisitosDa(avancada.id, 3)
      // O vínculo gravado já traz o par (é o que a gravação do vínculo faz); o escopo não expande mais.
      await prismaDeTeste().vinculoClasse.create({ data: { vinculoId: base.instrutor.vinculo.id, classeId: avancada.id } })
      return { ...base, avancada, requisitosAvancada }
    }
    const rotaMontagem = (classeId: string) => `/api/classes/${classeId}/cronograma/montagem`
    const visto = async (cronogramaId: string) =>
      (await prismaDeTeste().cronograma.findUniqueOrThrow({ where: { id: cronogramaId } })).atualizadoEm.toISOString()
    const doAno = (classeId: string, clubeId: string) =>
      prismaDeTeste().cronograma.findFirst({ where: { clubeId, classeId, anoClube: anoCorrente() } })
    const removerAulaPar = (aulaId: string, auth: string) =>
      request(app.getHttpServer() as Server).delete(`/api/aulas-planejadas/${aulaId}`).set('Authorization', auth)
    const dataDe = (saida: Saida, data: string) => saida.datas.find((candidata) => candidata.data === data)

    it('a leitura pela regular traz as duas classes: requisitos com classeId, uma data com requisito das duas e a avançada identificada', async () => {
      const { amigo, adm, requisitos, cronograma, avancada, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[1], DOMINGO_B, adm.autorizacao)

      const saida = corpo<Saida>(await http.get(rotaMontagem(amigo.id), adm.autorizacao))
      expect(saida.classe.id).toBe(amigo.id)
      expect(saida.avancada).toEqual({ id: avancada.id, nome: avancada.nome })
      expect(saida.requisitos.filter((requisito) => requisito.classeId === amigo.id).map((requisito) => requisito.id).slice(0, 4)).toEqual(requisitos)
      expect(saida.requisitos.filter((requisito) => requisito.classeId === avancada.id).map((requisito) => requisito.id).slice(0, 3)).toEqual(requisitosAvancada)
      expect(saida.requisitos.find((requisito) => requisito.id === requisitosAvancada[0])).toMatchObject({ classeId: avancada.id, data: DOMINGO_A })
      expect(dataDe(saida, DOMINGO_A)?.requisitoIds.sort()).toEqual([requisitos[0], requisitosAvancada[0]].sort())
      expect(dataDe(saida, DOMINGO_B)?.requisitoIds).toEqual([requisitosAvancada[1]])
      expect(saida).not.toHaveProperty('avancada.datas')
    })

    it('enviar e publicar usam o nome do par; a publicação avisa também quem só instrui a avançada, sem repetir quem instrui as duas', async () => {
      const { clube, amigo, adm, instrutor, avancada, requisitos, cronograma } = await cenarioPar()
      const soDaAvancada = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [avancada.id] })
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      const nomeDoPar = `Amigo + ${avancada.nome}`
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, instrutor.autorizacao)

      expect((await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(200)
      const enviados = await prismaDeTeste().notificacao.findMany({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_ENVIADO' } })
      expect(enviados.map((aviso) => aviso.titulo)).toEqual([`Cronograma enviado: ${nomeDoPar}`])

      expect((await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })).status).toBe(200)
      const publicados = await prismaDeTeste().notificacao.findMany({ where: { clubeId: clube.id, tipo: 'CRONOGRAMA_PUBLICADO' } })
      expect(publicados.map((aviso) => aviso.titulo)).toEqual([`Cronograma publicado: ${nomeDoPar}`, `Cronograma publicado: ${nomeDoPar}`])
      expect(publicados.map((aviso) => aviso.usuarioId).sort()).toEqual([instrutor.usuario.id, soDaAvancada.usuario.id].sort())
    })

    it('a leitura pelo id da avançada responde a montagem da regular; sem cronograma, cronograma nulo e a avançada identificada', async () => {
      const { amigo, adm, requisitosAvancada, avancada, cronograma } = await cenarioPar()
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      const pelaAvancada = corpo<Saida>(await http.get(rotaMontagem(avancada.id), adm.autorizacao))
      expect(pelaAvancada.cronograma).toMatchObject({ id: cronograma.id, anoClube: anoCorrente() })
      expect(pelaAvancada.classe.id).toBe(amigo.id)
      expect(dataDe(pelaAvancada, DOMINGO_A)?.requisitoIds).toEqual([requisitosAvancada[0]])

      const vazia = corpo<Saida>(await http.get(`${rotaMontagem(avancada.id)}?anoClube=2030`, adm.autorizacao))
      expect(vazia).toMatchObject({ cronograma: null, requisitos: [], datas: [], avancada: { id: avancada.id } })
      expect(vazia.classe.id).toBe(amigo.id)
    })

    it('avançada sem par (regular desativada no clube), outra regular sem par e agrupada: avançada nula e cronograma próprio', async () => {
      const { clube, amigo, adm, avancada } = await cenarioPar()
      const companheiro = await classeOficial('Companheiro')
      const avancadaDoCompanheiro = await prismaDeTeste().classe.findFirstOrThrow({
        where: { tipo: 'AVANCADA', clubeId: null, classeBaseId: companheiro.id },
        select: { id: true },
      })
      await admDefinirClasseClube({ clubeId: clube.id, classeId: avancadaDoCompanheiro.id, ativa: false })
      expect(corpo<Saida>(await http.get(rotaMontagem(companheiro.id), adm.autorizacao)).avancada).toBeNull()
      const agrupada = await prismaDeTeste().classe.findFirstOrThrow({ where: { trilha: 'AGRUPADAS', clubeId: null }, select: { id: true } })
      expect(corpo<Saida>(await http.get(rotaMontagem(agrupada.id), adm.autorizacao)).avancada).toBeNull()

      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: false })
      const criada = corpo<Saida>(
        await http.post('/api/cronogramas', adm.autorizacao, { classeId: avancada.id, anoClube: anoCorrente(), inicio: '2026-02-01', fim: '2027-01-31' }),
      )
      expect(criada.classe.id).toBe(avancada.id)
      expect(criada.avancada).toBeNull()
      expect(await doAno(avancada.id, clube.id)).not.toBeNull()
    })

    it('criar pela regular ou pela avançada cria só o cronograma da regular; repetir responde 409', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({ where: { tipo: 'AVANCADA', clubeId: null, classeBase: { nome: 'Amigo' } }, select: { id: true } })
      const entrada = { anoClube: anoCorrente(), inicio: '2026-02-01', fim: '2027-01-31' }

      const pelaAvancada = await http.post('/api/cronogramas', adm.autorizacao, { ...entrada, classeId: avancada.id })
      expect(pelaAvancada.status).toBe(201)
      expect(corpo<Saida>(pelaAvancada)).toMatchObject({ classe: { id: amigo.id }, cronograma: { status: 'RASCUNHO', inicio: '2026-02-01' }, avancada: { id: avancada.id } })
      expect(await doAno(avancada.id, clube.id)).toBeNull()
      expect(await doAno(amigo.id, clube.id)).not.toBeNull()
      expect((await http.post('/api/cronogramas', adm.autorizacao, { ...entrada, classeId: amigo.id })).status).toBe(409)
      expect((await http.post('/api/cronogramas', adm.autorizacao, { ...entrada, classeId: avancada.id })).status).toBe(409)
    })

    it('colocar requisito da avançada em data que já tem requisito da regular reaproveita a mesma aula', async () => {
      const { adm, requisitos, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      const [aulaDaRegular] = await aulasAtivas(cronograma.id)
      const saida = corpo<Saida>(await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao))
      const aulas = await aulasAtivas(cronograma.id)
      expect(aulas).toHaveLength(1)
      expect(aulas[0].id).toBe(aulaDaRegular.id)
      expect(dataDe(saida, DOMINGO_A)).toMatchObject({ aulaId: aulaDaRegular.id })
      expect(await prismaDeTeste().aulaRequisito.count({ where: { aulaPlanejadaId: aulaDaRegular.id } })).toBe(2)
    })

    it('tirar o último requisito de uma classe não apaga a aula se a outra ainda tem requisito; tirar o último das duas apaga', async () => {
      const { adm, requisitos, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)

      expect((await tirar(cronograma.id, requisitos[0], adm.autorizacao)).status).toBe(200)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
      const meio = corpo<Saida>(await tirar(cronograma.id, requisitosAvancada[0], adm.autorizacao))
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
      expect(dataDe(meio, DOMINGO_A)?.aulaId).toBeNull()
    })

    it('mover o requisito da avançada para outra data não apaga a aula que a regular ainda usa', async () => {
      const { adm, requisitos, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      const saida = corpo<Saida>(await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_B, adm.autorizacao))
      expect(dataDe(saida, DOMINGO_A)?.requisitoIds).toEqual([requisitos[0]])
      expect(dataDe(saida, DOMINGO_B)?.requisitoIds).toEqual([requisitosAvancada[0]])
      expect(await aulasAtivas(cronograma.id)).toHaveLength(2)
    })

    it('aula dada da avançada trava os requisitos da avançada e deixa os da regular livres (e vice-versa)', async () => {
      const { clube, amigo, adm, requisitos, cronograma, avancada, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await criarRegistroAula({ clubeId: clube.id, classeId: avancada.id, data: DOMINGO_A })

      const lida = corpo<Saida>(await http.get(rotaMontagem(amigo.id), adm.autorizacao))
      expect(dataDe(lida, DOMINGO_A)?.classeIdsComAulaDada).toEqual([avancada.id])
      expect((await tirar(cronograma.id, requisitosAvancada[0], adm.autorizacao)).status).toBe(422)
      expect((await colocar(cronograma.id, requisitosAvancada[1], DOMINGO_A, adm.autorizacao)).status).toBe(422)
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_B, adm.autorizacao)).status).toBe(422)
      // A regular não deu a aula: o requisito dela se move e se tira.
      expect((await colocar(cronograma.id, requisitos[1], DOMINGO_A, adm.autorizacao)).status).toBe(200)
      expect((await colocar(cronograma.id, requisitos[0], DOMINGO_B, adm.autorizacao)).status).toBe(200)
      expect((await tirar(cronograma.id, requisitos[1], adm.autorizacao)).status).toBe(200)
      // O encontro não muda nem some: a avançada já o deu.
      const aulaId = dataDe(lida, DOMINGO_A)?.aulaId
      expect((await http.patch(`/api/aulas-planejadas/${aulaId}`, adm.autorizacao, { horario: '10:00' })).status).toBe(422)
      expect((await removerAulaPar(aulaId as string, adm.autorizacao)).status).toBe(422)

      // Do outro lado: a regular deu a aula de DOMINGO_B, a avançada continua livre ali.
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_B })
      expect((await colocar(cronograma.id, requisitos[0], '2026-07-19', adm.autorizacao)).status).toBe(422)
      expect((await colocar(cronograma.id, requisitosAvancada[1], DOMINGO_B, adm.autorizacao)).status).toBe(200)
    })

    it('remover o dia apaga a aula única com os requisitos das duas classes; editar o horário vale para o encontro', async () => {
      const { adm, requisitos, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      const [aula] = await aulasAtivas(cronograma.id)

      const editada = corpo<Saida>(await http.patch(`/api/aulas-planejadas/${aula.id}`, adm.autorizacao, { horario: '10:00', local: 'Sala 2', titulo: 'Nós' }))
      expect(dataDe(editada, DOMINGO_A)).toMatchObject({ aulaId: aula.id, horario: '10:00', local: 'Sala 2', titulo: 'Nós' })

      const removida = corpo<Saida>(await removerAulaPar(aula.id, adm.autorizacao))
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
      expect(await prismaDeTeste().aulaRequisito.count({ where: { cronogramaId: cronograma.id } })).toBe(0)
      expect(removida.requisitos.every((requisito) => requisito.data === null)).toBe(true)
    })

    it('conflito é um só por encontro: a data futura que perdeu a classe vem em conflito se qualquer classe tem requisito sem registro', async () => {
      const { clube, amigo, adm, cronograma, requisitos, requisitosAvancada, avancada } = await cenarioPar()
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[1], DOMINGO_B, adm.autorizacao)
      await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: DOMINGO_A })
      await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: DOMINGO_B })
      await criarRegistroAula({ clubeId: clube.id, classeId: avancada.id, data: DOMINGO_B })

      const lida = corpo<Saida>(await http.get(rotaMontagem(amigo.id), adm.autorizacao))
      // A: as duas têm requisito e nenhuma registrou. B: só a avançada tem requisito e ela já registrou.
      expect(dataDe(lida, DOMINGO_A)?.conflito).toBe(true)
      expect(dataDe(lida, DOMINGO_B)?.conflito).toBe(false)
    })

    it('instrutor da regular monta os requisitos da avançada pelo cronograma da regular; o não liberado, conselheiro e outro clube não', async () => {
      const { clube, amigo, instrutor, cronograma, avancada, requisitosAvancada } = await cenarioPar()
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, instrutor.autorizacao)).status).toBe(403)
      expect((await http.get(rotaMontagem(avancada.id), instrutor.autorizacao)).status).toBe(403)
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, conselheiro.autorizacao)).status).toBe(403)
      const outroClube = await criarClube()
      const admDeFora = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, admDeFora.autorizacao)).status).toBe(404)

      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, instrutor.autorizacao)).status).toBe(200)
      expect((await http.get(rotaMontagem(avancada.id), instrutor.autorizacao)).status).toBe(200)
      expect((await tirar(cronograma.id, requisitosAvancada[0], instrutor.autorizacao)).status).toBe(200)
    })

    it('instrutor de outra classe continua com 404 na avançada; requisito de classe fora do cronograma, 404', async () => {
      const { clube, amigo, adm, avancada, cronograma } = await cenarioPar()
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      const companheiro = await classeOficial('Companheiro')
      const foraDoVinculo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [companheiro.id] })
      expect((await http.get(rotaMontagem(avancada.id), foraDoVinculo.autorizacao)).status).toBe(404)
      const [requisitoAlheio] = await requisitosDa(companheiro.id, 1)
      expect((await colocar(cronograma.id, requisitoAlheio, DOMINGO_A, adm.autorizacao)).status).toBe(404)
    })

    it('publicar leva os requisitos das duas classes no retrato; enviar e publicar são de um registro só', async () => {
      const { clube, amigo, adm, instrutor, cronograma, requisitos, requisitosAvancada } = await cenarioPar()
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      await colocar(cronograma.id, requisitos[0], DOMINGO_A, adm.autorizacao)
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)

      const enviado = await http.post(`/api/cronogramas/${cronograma.id}/enviar`, instrutor.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })
      expect(enviado.status).toBe(200)
      expect(corpo<Saida>(enviado).cronograma?.status).toBe('ENVIADO')

      const resposta = await http.post(`/api/cronogramas/${cronograma.id}/publicar`, adm.autorizacao, { atualizadoEmVisto: await visto(cronograma.id) })
      expect(resposta.status).toBe(200)
      expect(corpo<Saida>(resposta).cronograma).toMatchObject({ id: cronograma.id, status: 'PUBLICADO' })
      expect(await prismaDeTeste().cronograma.count({ where: { clubeId: clube.id } })).toBe(1)
      const publicacoes = await prismaDeTeste().cronogramaPublicacao.findMany({ where: { clubeId: clube.id } })
      expect(publicacoes).toHaveLength(1)
      const [aula] = (publicacoes[0].conteudo as { aulas: { requisitoIds: string[] }[] }).aulas
      expect(aula.requisitoIds.sort()).toEqual([requisitos[0], requisitosAvancada[0]].sort())
      expect(aula).not.toHaveProperty('requisitos')
    })

    it('editar um cronograma publicado o devolve a rascunho', async () => {
      const { adm, cronograma, requisitosAvancada } = await cenarioPar()
      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'PUBLICADO' } })
      const saida = corpo<Saida>(await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao))
      expect(saida.cronograma?.status).toBe('RASCUNHO')
    })

    it('mudar o período vale para o cronograma único; aula de qualquer classe fora do novo período responde 422', async () => {
      const { adm, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_B, adm.autorizacao)
      const recusado = await http.patch(`/api/cronogramas/${cronograma.id}`, adm.autorizacao, { inicio: '2026-07-13', fim: '2027-01-31' })
      expect(recusado.status).toBe(422)
      expect(corpo<{ mensagem: string }>(recusado).mensagem).toContain('12/07')
      const aceito = corpo<Saida>(await http.patch(`/api/cronogramas/${cronograma.id}`, adm.autorizacao, { inicio: '2026-07-01', fim: '2027-01-31' }))
      expect(aceito.cronograma).toMatchObject({ inicio: '2026-07-01', fim: '2027-01-31' })
    })

    it('desativar no clube um requisito da avançada o tira do cronograma da regular e o devolve a rascunho', async () => {
      const { clube, amigo, adm, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await prismaDeTeste().cronograma.update({ where: { id: cronograma.id }, data: { status: 'PUBLICADO' } })
      await http.patch(`/api/requisitos/${requisitosAvancada[0]}/ajuste`, adm.autorizacao, { ativo: false }).expect(200)
      expect((await doAno(amigo.id, clube.id))?.status).toBe('RASCUNHO')
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
    })

    it('instrutor com o par gravado monta o cronograma do par: coloca e tira requisito', async () => {
      const { clube, amigo, cronograma, avancada, requisitos, requisitosAvancada } = await cenarioPar()
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      const soDaAvancada = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [avancada.id, amigo.id] })

      expect((await http.get(rotaMontagem(amigo.id), soDaAvancada.autorizacao)).status).toBe(200)
      expect((await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, soDaAvancada.autorizacao)).status).toBe(200)
      expect((await colocar(cronograma.id, requisitos[0], DOMINGO_B, soDaAvancada.autorizacao)).status).toBe(200)
      expect((await tirar(cronograma.id, requisitosAvancada[0], soDaAvancada.autorizacao)).status).toBe(200)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
    })

    it('desfeito o par, o requisito da avançada que ficou no cronograma da regular continua listado e pode ser tirado, mas não se coloca outro', async () => {
      const { clube, amigo, adm, cronograma, avancada, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await admDefinirClasseClube({ clubeId: clube.id, classeId: avancada.id, ativa: false })

      const lida = corpo<Saida>(await http.get(rotaMontagem(amigo.id), adm.autorizacao))
      expect(lida.avancada).toBeNull()
      expect(lida.requisitos.filter((requisito) => requisito.classeId === avancada.id)).toEqual([
        expect.objectContaining({ id: requisitosAvancada[0], classeId: avancada.id, data: DOMINGO_A }),
      ])
      expect((await colocar(cronograma.id, requisitosAvancada[1], DOMINGO_B, adm.autorizacao)).status).toBe(404)

      const depois = corpo<Saida>(await tirar(cronograma.id, requisitosAvancada[0], adm.autorizacao))
      expect(depois.requisitos.some((requisito) => requisito.classeId === avancada.id)).toBe(false)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(0)
    })

    it('tirar o último requisito da avançada mantém a aula se a regular já deu aula naquela data', async () => {
      const { clube, amigo, adm, cronograma, requisitosAvancada } = await cenarioPar()
      await colocar(cronograma.id, requisitosAvancada[0], DOMINGO_A, adm.autorizacao)
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: DOMINGO_A })

      expect((await tirar(cronograma.id, requisitosAvancada[0], adm.autorizacao)).status).toBe(200)
      expect(await aulasAtivas(cronograma.id)).toHaveLength(1)
    })

    it('regular com duas avançadas ativas pareia sempre com a de menor ordem', async () => {
      const { clube, amigo, adm, avancada } = await cenarioPar()
      const oficial = await prismaDeTeste().classe.findUniqueOrThrow({ where: { id: avancada.id }, select: { ordem: true } })
      const maisTarde = await prismaDeTeste().classe.create({
        data: { clubeId: clube.id, origem: 'CLUBE', nome: 'Avançada extra', tipo: 'AVANCADA', trilha: 'INDIVIDUAL', classeBaseId: amigo.id, ordem: oficial.ordem + 100 },
      })

      expect(corpo<Saida>(await http.get(rotaMontagem(amigo.id), adm.autorizacao)).avancada?.id).toBe(avancada.id)
      expect(corpo<Saida>(await http.get(rotaMontagem(maisTarde.id), adm.autorizacao)).classe.id).toBe(maisTarde.id)
    })

    it('com a regular inativa no clube, a avançada tem cronograma e "quem monta" próprios', async () => {
      const { clube, amigo, adm, avancada, requisitosAvancada } = await cenarioPar()
      const instrutorDaAvancada = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [avancada.id] })
      const cronogramaAvancada = await criarCronograma({ clubeId: clube.id, classeId: avancada.id })
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR', ativa: false })
      expect((await colocar(cronogramaAvancada.id, requisitosAvancada[0], DOMINGO_A, instrutorDaAvancada.autorizacao)).status).toBe(403)

      await http.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)
      const saida = corpo<Saida>(await colocar(cronogramaAvancada.id, requisitosAvancada[0], DOMINGO_A, instrutorDaAvancada.autorizacao))
      expect(saida).toMatchObject({ cronograma: { id: cronogramaAvancada.id }, classe: { id: avancada.id }, avancada: null })
      expect(saida.requisitos.every((requisito) => requisito.classeId === avancada.id)).toBe(true)
      expect((await http.get(rotaMontagem(avancada.id), instrutorDaAvancada.autorizacao)).status).toBe(200)
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
