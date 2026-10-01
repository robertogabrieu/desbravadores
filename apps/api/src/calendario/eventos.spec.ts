import type { INestApplication } from '@nestjs/common'
import type { CalendarioSaida, EventoGravadoSaida, EventoSaida } from '@desbravadores/shared'
import request from 'supertest'
import type { Server } from 'node:http'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  admDefinirClasseClube,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarEvento,
  criarRegistroAula,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo, hoje } from '../../test/p6'

type Gravado = z.infer<typeof EventoGravadoSaida>
type Saida = z.infer<typeof EventoSaida>
type Ano = z.infer<typeof CalendarioSaida>

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
  return requisitos.map((r) => r.id)
}

describe('calendário do clube — eventos', () => {
  let app: INestApplication
  const http = clienteHttp(() => app)
  const apagar = (url: string, auth: string) => request(app.getHttpServer() as Server).delete(url).set('Authorization', auth)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const evento = (sobrescrever: Record<string, unknown> = {}) => ({
    nome: 'Acampamento de Primavera',
    tipo: 'ACAMPAMENTO',
    inicio: dia(10),
    fim: dia(10),
    horario: null,
    local: null,
    ...sobrescrever,
  })

  async function cenario() {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const requisitos = await requisitosDa(amigo.id, 6)
    return { clube, amigo, adm, instrutor, requisitos }
  }

  const notificacoesDe = (usuarioId: string) =>
    prismaDeTeste().notificacao.findMany({ where: { usuarioId, tipo: 'CONFLITO_CRONOGRAMA' }, orderBy: { criadaEm: 'asc' } })

  describe('CRUD e marcações', () => {
    it('cria com o padrão do tipo quando as marcações não vêm e registra a atividade', async () => {
      const { clube, adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento())
      expect(resposta.status).toBe(201)
      const { evento: criado, aulasAfetadas } = corpo<Gravado>(resposta)
      expect(criado).toMatchObject({ tipo: 'ACAMPAMENTO', cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: true, inicio: dia(10) })
      expect(aulasAfetadas).toEqual([])
      const atividades = await prismaDeTeste().atividade.findMany({ where: { clubeId: clube.id } })
      expect(atividades.map((a) => a.tipo)).toEqual(['EVENTO_CRIADO'])
    })

    it('marcações enviadas valem mais que o padrão', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'FERIADO', bloqueiaAula: true }))
      expect(corpo<Gravado>(resposta).evento).toMatchObject({ cancelaReuniao: false, bloqueiaAula: true, bomParaCampo: false })
    })

    it('rejeita fim antes do início', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ inicio: dia(5), fim: dia(4) }))
      expect(resposta.status).toBe(400)
    })

    it('edita, lista no ano e remove logicamente (sem atividade nova ao editar)', async () => {
      const { clube, adm } = await cenario()
      const { evento: criado } = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento()))
      const editado = await http.patch(`/api/calendario/eventos/${criado.id}`, adm.autorizacao, evento({ nome: 'Novo nome', tipo: 'EVENTO' }))
      expect(editado.status).toBe(200)
      expect(corpo<Gravado>(editado).evento).toMatchObject({ id: criado.id, nome: 'Novo nome', bloqueiaAula: true })
      expect(await prismaDeTeste().atividade.count({ where: { clubeId: clube.id } })).toBe(1)

      const ano = Number(dia(10).slice(0, 4))
      const lista = corpo<Ano>(await http.get(`/api/calendario?ano=${ano}`, adm.autorizacao))
      expect(lista.eventos.map((e) => e.nome)).toEqual(['Novo nome'])

      const remocao = await apagar(`/api/calendario/eventos/${criado.id}`, adm.autorizacao)
      expect(remocao.status).toBe(204)
      const linha = await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: criado.id } })
      expect(linha.removidoEm).not.toBeNull()
      expect(corpo<Ano>(await http.get(`/api/calendario?ano=${ano}`, adm.autorizacao)).eventos).toEqual([])
    })

    it('instrutor lê o calendário do clube, sem eventos de outro clube', async () => {
      const { clube, instrutor } = await cenario()
      const outro = await criarClube()
      await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(3) })
      await criarEvento({ clubeId: outro.id, tipo: 'FERIADO', inicio: dia(3) })
      const resposta = await http.get(`/api/calendario?ano=${dia(3).slice(0, 4)}`, instrutor.autorizacao)
      expect(resposta.status).toBe(200)
      expect(corpo<Ano>(resposta).eventos).toHaveLength(1)
    })

    it('404 ao editar ou remover evento de outro clube ou já removido', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      const alheio = await criarEvento({ clubeId: outro.id, tipo: 'EVENTO', inicio: dia(4) })
      expect((await http.patch(`/api/calendario/eventos/${alheio.id}`, adm.autorizacao, evento())).status).toBe(404)
      expect((await apagar(`/api/calendario/eventos/${alheio.id}`, adm.autorizacao)).status).toBe(404)
    })

    it('instrutor e conselheiro não gravam eventos (403)', async () => {
      const { clube, instrutor } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const existente = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: dia(4) })
      for (const acesso of [instrutor, conselheiro]) {
        expect((await http.post('/api/calendario/eventos', acesso.autorizacao, evento())).status).toBe(403)
        expect((await http.patch(`/api/calendario/eventos/${existente.id}`, acesso.autorizacao, evento())).status).toBe(403)
        expect((await apagar(`/api/calendario/eventos/${existente.id}`, acesso.autorizacao)).status).toBe(403)
      }
    })
  })

  describe('avisos de conflito', () => {
    it('acampamento sem bom para campo põe aula individual futura em conflito e avisa Adm e instrutor com o link de cada um', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ bomParaCampo: false }))
      const { aulasAfetadas } = corpo<Gravado>(resposta)
      expect(aulasAfetadas).toHaveLength(1)
      expect(aulasAfetadas[0]).toMatchObject({ aulaId: cronograma.aulas[0].id, cronogramaId: cronograma.id, data: dia(10) })
      expect(aulasAfetadas[0].classe.id).toBe(amigo.id)
      const doAdm = await notificacoesDe(adm.usuario.id)
      const doInstrutor = await notificacoesDe(instrutor.usuario.id)
      expect(doAdm.map((n) => n.link)).toEqual([`/cronograma/montar?classe=${amigo.id}`])
      expect(doInstrutor.map((n) => n.link)).toEqual([`/cronograma?classe=${amigo.id}`])
    })

    it('se o instrutor monta, só ele é avisado, com link de montagem', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'SEM_REUNIAO' }))
      expect((await notificacoesDe(instrutor.usuario.id)).map((n) => n.link)).toEqual([`/cronograma/montar?classe=${amigo.id}`])
      expect(await notificacoesDe(adm.usuario.id)).toEqual([])
    })

    it('editar o mesmo evento três vezes avisa uma vez só', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const { evento: criado, aulasAfetadas } = corpo<Gravado>(
        await http.post('/api/calendario/eventos', adm.autorizacao, evento({ bomParaCampo: false })),
      )
      expect(aulasAfetadas).toHaveLength(1)
      for (const nome of ['a', 'b', 'c']) {
        const editado = corpo<Gravado>(await http.patch(`/api/calendario/eventos/${criado.id}`, adm.autorizacao, evento({ nome, bomParaCampo: false })))
        expect(editado.aulasAfetadas).toEqual([])
      }
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
    })

    it('dois Adms gravando eventos na mesma data ao mesmo tempo avisam uma vez só por pessoa e classe', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const outroAdm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      await Promise.all([
        http.post('/api/calendario/eventos', adm.autorizacao, evento({ nome: 'A', bomParaCampo: false })),
        http.post('/api/calendario/eventos', outroAdm.autorizacao, evento({ nome: 'B', bomParaCampo: false })),
      ])
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
      expect(await notificacoesDe(adm.usuario.id)).toHaveLength(1)
    })

    it('dois PATCH ao mesmo tempo levando o mesmo evento à mesma data avisam uma vez só por pessoa e classe', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const outroAdm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const { evento: criado } = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento({ inicio: dia(40), fim: dia(40) })))
      const levar = (auth: string, nome: string) =>
        http.patch(`/api/calendario/eventos/${criado.id}`, auth, evento({ nome, bomParaCampo: false }))
      await Promise.all([levar(adm.autorizacao, 'A'), levar(outroAdm.autorizacao, 'B')])
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
      expect(await notificacoesDe(adm.usuario.id)).toHaveLength(1)
    })

    it('uma notificação por pessoa e classe mesmo com várias aulas afetadas', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      await criarCronograma({
        clubeId: clube.id,
        classeId: amigo.id,
        aulas: [{ data: dia(10), requisitoIds: requisitos.slice(0, 1) }, { data: dia(11), requisitoIds: requisitos.slice(1, 2) }],
      })
      const { aulasAfetadas } = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento({ fim: dia(11), bomParaCampo: false })))
      expect(aulasAfetadas.map((a) => a.data)).toEqual([dia(10), dia(11)])
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
      expect(await notificacoesDe(adm.usuario.id)).toHaveLength(1)
    })

    it('conta a aula da última publicação mesmo quando o vivo já a tirou, sem duplicar quando está nos dois', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos.slice(0, 1) }, { data: dia(12), requisitoIds: requisitos.slice(1, 2) }] })
      await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
      await prismaDeTeste().aulaPlanejada.update({ where: { id: cronograma.aulas[1].id }, data: { removidaEm: new Date() } })
      const { aulasAfetadas } = corpo<Gravado>(
        await http.post('/api/calendario/eventos', adm.autorizacao, evento({ fim: dia(12), tipo: 'SEM_REUNIAO' })),
      )
      expect(aulasAfetadas.map((a) => a.aulaId).sort()).toEqual(cronograma.aulas.map((a) => a.id).sort())
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
    })

    it('nunca afeta aula sem requisitos, dada, passada ou de classe Agrupadas', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const agrupada = await prismaDeTeste().classe.create({
        data: { clubeId: clube.id, origem: 'CLUBE', nome: 'Agrupada', tipo: 'REGULAR', trilha: 'AGRUPADAS', ordem: 998 },
      })
      await criarCronograma({
        clubeId: clube.id,
        classeId: amigo.id,
        aulas: [
          { data: dia(-3), requisitoIds: requisitos.slice(0, 1) },
          { data: dia(10), requisitoIds: requisitos.slice(1, 2) },
          { data: dia(11), requisitoIds: [] },
        ],
      })
      await criarCronograma({ clubeId: clube.id, classeId: agrupada.id, aulas: [{ data: dia(11), requisitoIds: requisitos.slice(2, 3) }] })
      await criarRegistroAula({ clubeId: clube.id, classeId: amigo.id, data: dia(10) })
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ inicio: dia(-3), fim: dia(11), tipo: 'SEM_REUNIAO' }))
      expect(corpo<Gravado>(resposta).aulasAfetadas).toEqual([])
      expect(await notificacoesDe(instrutor.usuario.id)).toEqual([])
    })

    it('instrutor de outro clube com a mesma classe oficial não é avisado nem vê aulas do outro clube', async () => {
      const { clube, amigo, adm, requisitos } = await cenario()
      const outro = await criarClube()
      const instrutorAlheio = await criarAcesso({ clubeId: outro.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      await criarCronograma({ clubeId: outro.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const { aulasAfetadas } = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'SEM_REUNIAO' })))
      expect(aulasAfetadas).toHaveLength(1)
      expect(await notificacoesDe(instrutorAlheio.usuario.id)).toEqual([])
    })

    it('remover um evento não avisa ninguém', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const alvo = await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: dia(10) })
      expect((await apagar(`/api/calendario/eventos/${alvo.id}`, adm.autorizacao)).status).toBe(204)
      expect(await notificacoesDe(instrutor.usuario.id)).toEqual([])
    })
  })

  describe('GET /calendario/eventos/:id', () => {
    it('le o evento do clube para qualquer papel logado; removido e de outro clube → 404; id malformado → 400', async () => {
      const { adm, instrutor } = await cenario()
      const outro = await criarClube()
      const criado = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento())).evento
      const lido = corpo<Saida>(await http.get(`/api/calendario/eventos/${criado.id}`, instrutor.autorizacao).expect(200))
      expect(lido).toEqual(criado)
      const alheio = await criarEvento({ clubeId: outro.id, tipo: 'EVENTO', inicio: dia(4) })
      await http.get(`/api/calendario/eventos/${alheio.id}`, adm.autorizacao).expect(404)
      await http.get('/api/calendario/eventos/nao-e-uuid', adm.autorizacao).expect(400)
      expect((await apagar(`/api/calendario/eventos/${criado.id}`, adm.autorizacao)).status).toBe(204)
      await http.get(`/api/calendario/eventos/${criado.id}`, adm.autorizacao).expect(404)
    })

    it('a atividade "evento criado" leva à ficha do evento', async () => {
      const { clube, adm } = await cenario()
      const criado = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento())).evento
      const [atividade] = await prismaDeTeste().atividade.findMany({ where: { clubeId: clube.id } })
      expect(atividade?.link).toBe(`/adm/calendario/eventos/${criado.id}`)
    })

    testarIsolamento({
      titulo: 'GET /calendario/eventos/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const alvo = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(3) })
        return { metodo: 'get', caminho: `/api/calendario/eventos/${alvo.id}` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
