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
  criarEdicaoCB,
  criarEncontroCB,
  criarEvento,
  criarGrupoCB,
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

/** O domingo de hoje+8 em diante, mais `deslocamento` dias (-1 = o sábado antes, 3 = a quarta depois). */
function proximoDomingo(deslocamento = 0): string {
  const base = new Date(`${dia(8)}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + ((7 - base.getUTCDay()) % 7) + deslocamento)
  return base.toISOString().slice(0, 10)
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
      expect(criado).toMatchObject({ tipo: 'ACAMPAMENTO', temReuniao: false, temClasse: true, bomParaCampo: true, inicio: dia(10) })
      expect(aulasAfetadas).toEqual([])
      const atividades = await prismaDeTeste().atividade.findMany({ where: { clubeId: clube.id } })
      expect(atividades.map((a) => a.tipo)).toEqual(['EVENTO_CRIADO'])
    })

    it('marcações enviadas valem mais que o padrão', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'FERIADO', temClasse: false }))
      expect(corpo<Gravado>(resposta).evento).toMatchObject({ temReuniao: true, temClasse: false, bomParaCampo: false })
    })

    it('marcações omitidas valem o padrão do tipo, no positivo', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'EVENTO' }))
      expect(corpo<Gravado>(resposta).evento).toMatchObject({ temReuniao: true, temClasse: false, bomParaCampo: false })
    })

    it('Férias grava sempre o padrão; extra grava campo = não', async () => {
      const { adm } = await cenario()
      const ferias = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'FERIAS', temReuniao: true, bomParaCampo: true }))
      expect(corpo<Gravado>(ferias).evento).toMatchObject({ temReuniao: false, temClasse: true, bomParaCampo: false })
      const extra = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', bomParaCampo: true }))
      expect(corpo<Gravado>(extra).evento).toMatchObject({ bomParaCampo: false })
    })

    it('a validação roda depois do padrão: extra sem marcações enviadas vale reunião e classe', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA' }))
      expect(resposta.status).toBe(201)
      expect(corpo<Gravado>(resposta).evento).toMatchObject({ temReuniao: true, temClasse: true })
    })

    it('extra com fim diferente do início ou sem as duas caixas → 400 com o campo', async () => {
      const { adm } = await cenario()
      const longa = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', fim: dia(11) }))
      expect(longa.status).toBe(400)
      expect(longa.body).toMatchObject({ codigo: 'VALIDACAO', campos: { fim: 'A reunião extra é de um dia só.' } })
      const vazia = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', temReuniao: false, temClasse: false }))
      expect(vazia.status).toBe(400)
      expect(vazia.body).toMatchObject({ campos: { temReuniao: 'Marque Terá reunião, Terá classe ou as duas.' } })
    })

    it('aba antiga que manda cancelaReuniao ou bloqueiaAula → 400 geral, sem campos', async () => {
      const { adm } = await cenario()
      for (const antiga of [{ cancelaReuniao: true }, { bloqueiaAula: false }]) {
        const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento(antiga))
        expect(resposta.status).toBe(400)
        expect(resposta.body).toMatchObject({ codigo: 'VALIDACAO', mensagem: 'Atualize o app para salvar este evento.' })
        expect((resposta.body as { campos?: unknown }).campos).toBeUndefined()
      }
    })

    it('uma extra por data: a segunda é recusada; editar a própria, extra removida ou de outro clube não contam', async () => {
      const { clube, adm } = await cenario()
      const outro = await criarClube()
      const primeira = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA' }))).evento
      const segunda = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA' }))
      expect(segunda.status).toBe(400)
      expect(segunda.body).toMatchObject({ campos: { inicio: 'Já há uma reunião extra nesta data.' } })

      const propria = await http.patch(`/api/calendario/eventos/${primeira.id}`, adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', nome: 'Editada' }))
      expect(propria.status).toBe(200)

      await criarEvento({ clubeId: outro.id, tipo: 'REUNIAO_EXTRA', inicio: dia(20) })
      expect((await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', inicio: dia(20), fim: dia(20) }))).status).toBe(201)

      const removida = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: dia(21) })
      await prismaDeTeste().eventoCalendario.update({ where: { id: removida.id }, data: { removidoEm: new Date() } })
      expect((await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', inicio: dia(21), fim: dia(21) }))).status).toBe(201)
    })

    it('calendário do ano: a quarta da extra com reunião entra nos dias de reunião e os domingos das férias saem', async () => {
      const { clube, adm } = await cenario()
      await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2030-01-23' })
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: '2030-02-01', fim: '2030-02-11' })
      const { diasDeReuniao } = corpo<Ano>(await http.get('/api/calendario?ano=2030', adm.autorizacao))
      expect(diasDeReuniao).toEqual(expect.arrayContaining(['2030-01-06', '2030-01-23', '2030-01-27', '2030-02-17']))
      expect(diasDeReuniao).not.toContain('2030-02-03')
      expect(diasDeReuniao).not.toContain('2030-02-10')
    })

    it('rejeita fim antes do início', async () => {
      const { adm } = await cenario()
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ inicio: dia(5), fim: dia(4) }))
      expect(resposta.status).toBe(400)
      expect(resposta.body).toMatchObject({ codigo: 'VALIDACAO', campos: { fim: expect.any(String) as string } })
    })

    it('edita, lista no ano e remove logicamente (sem atividade nova ao editar)', async () => {
      const { clube, adm } = await cenario()
      const { evento: criado } = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento()))
      const editado = await http.patch(`/api/calendario/eventos/${criado.id}`, adm.autorizacao, evento({ nome: 'Novo nome', tipo: 'EVENTO' }))
      expect(editado.status).toBe(200)
      expect(corpo<Gravado>(editado).evento).toMatchObject({ id: criado.id, nome: 'Novo nome', temClasse: false })
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

    it('Férias sobre a classe de um domingo avisa com o texto de classe', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const domingo = proximoDomingo()
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: domingo, requisitoIds: requisitos }] })
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'FERIAS', inicio: domingo, fim: domingo }))
      expect(corpo<Gravado>(resposta).aulasAfetadas.map((a) => a.data)).toEqual([domingo])
      const [aviso] = await notificacoesDe(instrutor.usuario.id)
      expect(aviso.titulo).toBe('Classe em conflito com o calendário')
      expect(aviso.texto).toMatch(/deixou de ser dia de classe\.$/)
    })

    it('acampamento dentro das férias não afeta a classe do sábado dele', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const sabado = proximoDomingo(-1)
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: dia(-3), fim: dia(40) })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: sabado, requisitoIds: requisitos }] })
      const resposta = await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'ACAMPAMENTO', inicio: sabado, fim: sabado }))
      expect(corpo<Gravado>(resposta).aulasAfetadas).toEqual([])
      expect(await notificacoesDe(instrutor.usuario.id)).toEqual([])
    })

    it('excluir a extra com classe dentro das férias põe a classe daquela data em conflito e avisa', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const quarta = proximoDomingo(3)
      await criarEvento({ clubeId: clube.id, tipo: 'FERIAS', inicio: dia(-3), fim: dia(40) })
      const extra = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: quarta })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: quarta, requisitoIds: requisitos }] })
      expect((await apagar(`/api/calendario/eventos/${extra.id}`, adm.autorizacao)).status).toBe(204)
      expect((await notificacoesDe(instrutor.usuario.id)).map((n) => n.titulo)).toEqual(['Classe em conflito com o calendário'])
    })

    it('excluir extra com classe numa quarta com classe planejada avisa; sem classe planejada, não avisa ninguém', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      const quarta = proximoDomingo(3)
      const extra = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: quarta })
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: quarta, requisitoIds: requisitos }] })
      expect((await apagar(`/api/calendario/eventos/${extra.id}`, adm.autorizacao)).status).toBe(204)
      expect((await notificacoesDe(instrutor.usuario.id)).map((n) => n.titulo)).toEqual(['Classe em conflito com o calendário'])

      const quinta = proximoDomingo(4)
      const outra = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: quinta })
      expect((await apagar(`/api/calendario/eventos/${outra.id}`, adm.autorizacao)).status).toBe(204)
      expect(await notificacoesDe(instrutor.usuario.id)).toHaveLength(1)
    })

    it('mover a extra com classe para outra data devolve a aula da data antiga em aulasAfetadas', async () => {
      const { clube, amigo, adm, requisitos } = await cenario()
      const quarta = proximoDomingo(3)
      const extra = await criarEvento({ clubeId: clube.id, tipo: 'REUNIAO_EXTRA', inicio: quarta })
      const cronograma = await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: quarta, requisitoIds: requisitos }] })
      const resposta = await http.patch(`/api/calendario/eventos/${extra.id}`, adm.autorizacao, evento({ tipo: 'REUNIAO_EXTRA', inicio: proximoDomingo(4), fim: proximoDomingo(4), temReuniao: true, temClasse: true }))
      expect(corpo<Gravado>(resposta).aulasAfetadas.map((a) => a.aulaId)).toEqual([cronograma.aulas[0].id])
    })

    it('remover um evento não avisa ninguém', async () => {
      const { clube, amigo, adm, instrutor, requisitos } = await cenario()
      await criarCronograma({ clubeId: clube.id, classeId: amigo.id, aulas: [{ data: dia(10), requisitoIds: requisitos }] })
      const alvo = await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: dia(10) })
      expect((await apagar(`/api/calendario/eventos/${alvo.id}`, adm.autorizacao)).status).toBe(204)
      expect(await notificacoesDe(instrutor.usuario.id)).toEqual([])
    })
  })

  describe('encontro da Classe Bíblica no calendário', () => {
    const RECUSA = 'Este encontro é da Classe Bíblica: remarque ou cancele pela edição.'

    async function comEncontros() {
      const base = await cenario()
      const edicao = await criarEdicaoCB({ clubeId: base.clube.id, terminada: true })
      await criarGrupoCB({ clubeId: base.clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Grupo Daniel' })
      await criarGrupoCB({ clubeId: base.clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Grupo Ester' })
      const removido = await criarGrupoCB({ clubeId: base.clube.id, edicaoId: edicao.id, unidadeIds: [], nome: 'Grupo Removido' })
      await prismaDeTeste().grupoClasseBiblica.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
      const ativo = await criarEncontroCB({ clubeId: base.clube.id, edicaoId: edicao.id, data: dia(5) })
      const cancelado = await criarEncontroCB({ clubeId: base.clube.id, edicaoId: edicao.id, data: dia(12), cancelado: true })
      return { ...base, edicao, ativo, cancelado }
    }

    it('o ano e a ficha trazem a edição, os grupos não removidos, o cancelamento e o motivo; os outros tipos trazem null', async () => {
      const { clube, adm, edicao, ativo, cancelado } = await comEncontros()
      const feriado = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(5) })
      const ano = corpo<Ano>(await http.get(`/api/calendario?ano=${dia(5).slice(0, 4)}`, adm.autorizacao).expect(200))
      const doAno = (id: string) => ano.eventos.find((e) => e.id === id)
      expect(doAno(ativo.eventoId)?.classeBiblica).toEqual({ edicaoId: edicao.id, grupos: ['Grupo Daniel', 'Grupo Ester'], cancelado: false, motivo: null })
      expect(doAno(feriado.id)?.classeBiblica).toBeNull()
      const lido = corpo<Saida>(await http.get(`/api/calendario/eventos/${cancelado.eventoId}`, adm.autorizacao).expect(200))
      expect(lido).toMatchObject({ tipo: 'CLASSE_BIBLICA', classeBiblica: { edicaoId: edicao.id, grupos: ['Grupo Daniel', 'Grupo Ester'], cancelado: true, motivo: 'chuva forte' } })
      const outro = corpo<Saida>(await http.get(`/api/calendario/eventos/${feriado.id}`, adm.autorizacao).expect(200))
      expect(outro.classeBiblica).toBeNull()
    })

    it('o encontro não muda os dias de reunião do ano', async () => {
      const { adm } = await cenario()
      const outroAdm = await comEncontros()
      const ano = dia(5).slice(0, 4)
      const sem = corpo<Ano>(await http.get(`/api/calendario?ano=${ano}`, adm.autorizacao).expect(200))
      const com = corpo<Ano>(await http.get(`/api/calendario?ano=${ano}`, outroAdm.adm.autorizacao).expect(200))
      expect(com.diasDeReuniao).toEqual(sem.diasDeReuniao)
    })

    it('POST, PATCH e DELETE recusam o tipo, também ao levar um evento comum para ele, e o encontro fica como estava', async () => {
      const { clube, adm, ativo } = await comEncontros()
      const comum = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: dia(4) })
      const recusas = [
        await http.post('/api/calendario/eventos', adm.autorizacao, evento({ tipo: 'CLASSE_BIBLICA' })),
        await http.patch(`/api/calendario/eventos/${ativo.eventoId}`, adm.autorizacao, evento()),
        await http.patch(`/api/calendario/eventos/${comum.id}`, adm.autorizacao, evento({ tipo: 'CLASSE_BIBLICA' })),
        await apagar(`/api/calendario/eventos/${ativo.eventoId}`, adm.autorizacao),
      ]
      for (const resposta of recusas) {
        expect(resposta.status).toBe(422)
        expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: RECUSA })
      }
      const doEncontro = await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: ativo.eventoId } })
      expect(doEncontro).toMatchObject({ nome: 'Classe Bíblica', tipo: 'CLASSE_BIBLICA', removidoEm: null })
      expect(await prismaDeTeste().eventoCalendario.count({ where: { clubeId: clube.id, tipo: 'CLASSE_BIBLICA' } })).toBe(2)
      expect((await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: comum.id } })).tipo).toBe('EVENTO')
    })

    it('encontro de outro clube não aparece no ano e responde 404 na ficha, no PATCH e no DELETE', async () => {
      const { adm } = await cenario()
      const alheio = await comEncontros()
      const ano = corpo<Ano>(await http.get(`/api/calendario?ano=${dia(5).slice(0, 4)}`, adm.autorizacao).expect(200))
      expect(ano.eventos.some((e) => e.tipo === 'CLASSE_BIBLICA')).toBe(false)
      await http.get(`/api/calendario/eventos/${alheio.ativo.eventoId}`, adm.autorizacao).expect(404)
      expect((await http.patch(`/api/calendario/eventos/${alheio.ativo.eventoId}`, adm.autorizacao, evento())).status).toBe(404)
      expect((await apagar(`/api/calendario/eventos/${alheio.ativo.eventoId}`, adm.autorizacao)).status).toBe(404)
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
