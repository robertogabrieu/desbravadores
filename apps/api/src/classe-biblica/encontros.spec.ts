import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, type EncontroDetalheSaida, type EncontroSaida, type ErroApi } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarDbv,
  criarEdicaoCB,
  criarEncontroCB,
  criarEvento,
  criarGrupoCB,
  criarMembro,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { ajustarPermissao, clienteHttp, corpo } from '../../test/p6'
import { diaEMes } from '../progresso/conclusoes'

type Detalhe = z.infer<typeof EncontroDetalheSaida>
type Encontro = z.infer<typeof EncontroSaida>
type ComAvisos = { dados: Encontro; avisos: { codigo: string; mensagem: string }[] }
type Erro = z.infer<typeof ErroApi>

const BASE = '/api/classe-biblica/encontros'
const DIA = 86_400_000

function dia(deslocamento: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() + deslocamento * DIA))
}

describe('classe bíblica: remarcar, cancelar e desfazer (regra 7)', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  /** Edição de hoje−30 a hoje+60, grupos Daniel (Águias) e Ester (Gaviões); encontros em hoje+7, hoje+14 e hoje+21 (cancelado). */
  async function cenario() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
    const gavioes = await criarUnidade({ clubeId: clube.id, nome: 'Gaviões' })
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB', inicio: dia(-30), fim: dia(60) })
    const daniel = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id] })
    await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [gavioes.id] })
    const e1 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(7) })
    const e2 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(14) })
    const e3 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(21), cancelado: true })
    return { clube, adm, aguias, gavioes, edicao, daniel, e1, e2, e3 }
  }

  const evento = (eventoId: string) => prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: eventoId } })

  describe('GET /encontros/:id', () => {
    it('traz o encontro, a edição, os grupos, as datas ocupadas e os avisos do período', async () => {
      const { clube, adm, edicao, e1, e2 } = await cenario()
      const feriado = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(10) })
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: dia(11) })
      const detalhe = corpo<Detalhe>(await api.get(`${BASE}/${e1.id}`, adm.autorizacao).expect(200))
      expect(detalhe.encontro).toMatchObject({
        id: e1.id, edicaoId: edicao.id, data: dia(7), horario: '14:00', cancelado: false, temChamada: false, podeDesfazer: false, dataOriginal: null,
      })
      expect(detalhe.edicao).toEqual({ id: edicao.id, nome: 'CB', inicio: dia(-30), fim: dia(60) })
      expect(detalhe.grupos).toEqual(['Daniel', 'Ester'])
      expect(detalhe.ocupadas).toEqual([dia(14)])
      expect(detalhe.avisos).toEqual([{ data: dia(10), motivo: `Feriado: ${feriado.nome}` }])
      void e2
    })

    it('encontro de outro clube responde 404 e quem não gerencia recebe 403', async () => {
      const { clube, e1 } = await cenario()
      const outro = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
      await api.get(`${BASE}/${e1.id}`, outro.autorizacao).expect(404)
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)
      await api.get(`${BASE}/${e1.id}`, conselheiro.autorizacao).expect(403)
    })
  })

  describe('remarcar', () => {
    it('muda a data e o horário do encontro e do evento e guarda a data original', async () => {
      const { adm, e1 } = await cenario()
      const resposta = corpo<ComAvisos>(
        await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(9), horario: '15:30' }).expect(201),
      )
      expect(resposta.dados).toMatchObject({ data: dia(9), horario: '15:30', dataOriginal: dia(7) })
      expect(resposta.avisos).toEqual([])
      const ev = await evento(e1.eventoId)
      expect([ev.inicio.toISOString().slice(0, 10), ev.fim.toISOString().slice(0, 10), ev.horario]).toEqual([dia(9), dia(9), '15:30'])

      // Remarcar de novo mantém a primeira data original.
      const segunda = corpo<ComAvisos>(await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(8) }).expect(201))
      expect(segunda.dados).toMatchObject({ data: dia(8), horario: '15:30', dataOriginal: dia(7) })
    })

    it('remarcar de volta para a data original limpa a data original', async () => {
      const { adm, e1 } = await cenario()
      await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(9) }).expect(201)
      const deVolta = corpo<ComAvisos>(await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(7) }).expect(201))
      expect(deVolta.dados).toMatchObject({ data: dia(7), dataOriginal: null })
      const gravado = await prismaDeTeste().encontroClasseBiblica.findUniqueOrThrow({ where: { id: e1.id } })
      expect(gravado.dataOriginal).toBeNull()
    })

    it('data em feriado avisa e deixa seguir', async () => {
      const { clube, adm, e1 } = await cenario()
      const feriado = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(9) })
      const resposta = corpo<ComAvisos>(await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(9) }).expect(201))
      expect(resposta.dados.data).toBe(dia(9))
      expect(resposta.avisos).toEqual([{ codigo: expect.any(String) as string, mensagem: `${diaEMes(dia(9))} cai em Feriado: ${feriado.nome}.` }])
    })

    it('recusa data fora do período, no passado ou de outro encontro não cancelado; a de cancelado é aceita', async () => {
      const { adm, e1 } = await cenario()
      const recusa = async (data: string) =>
        corpo<Erro>(await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data }).expect(400)).campos?.['data']
      expect(await recusa(dia(61))).toBeDefined()
      expect(await recusa(dia(-31))).toBeDefined()
      expect(await recusa(dia(-1))).toBeDefined()
      expect(await recusa(dia(14))).toBeDefined()
      await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(21) }).expect(201)
    })

    it('encontro com chamada de qualquer grupo responde 409 para remarcar e cancelar', async () => {
      const { clube, adm, aguias, daniel, e1 } = await cenario()
      const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana' })
      await criarMembro({ dbvId: ana.id, unidadeId: aguias.id, inicio: dia(-60) })
      await criarChamadaCB({ clubeId: clube.id, encontroId: e1.id, grupoId: daniel.id, linhas: [{ dbvId: ana.id, unidadeId: aguias.id }] })
      const remarcar = corpo<Erro>(await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(9) }).expect(409))
      expect(remarcar.mensagem).toContain('já tem chamada')
      await api.post(`${BASE}/${e1.id}/cancelar`, adm.autorizacao, { motivo: 'chuva' }).expect(409)
      const detalhe = corpo<Detalhe>(await api.get(`${BASE}/${e1.id}`, adm.autorizacao).expect(200))
      expect(detalhe.encontro.temChamada).toBe(true)
    })

    it('chamada sem linhas também trava', async () => {
      const { clube, adm, daniel, e1 } = await cenario()
      await criarChamadaCB({ clubeId: clube.id, encontroId: e1.id, grupoId: daniel.id, linhas: [] })
      await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(9) }).expect(409)
    })

    it('encontro de outro clube responde 404', async () => {
      const { e1 } = await cenario()
      const outro = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
      await api.post(`${BASE}/${e1.id}/remarcar`, outro.autorizacao, { data: dia(9) }).expect(404)
      await api.post(`${BASE}/${e1.id}/cancelar`, outro.autorizacao, { motivo: 'x' }).expect(404)
      await api.post(`${BASE}/${e1.id}/desfazer-cancelamento`, outro.autorizacao).expect(404)
    })
  })

  describe('cancelar e desfazer', () => {
    it('cancelar guarda o motivo e o encontro sai das datas ocupadas; desfazer até a data devolve', async () => {
      const { adm, e1, e2 } = await cenario()
      const cancelado = corpo<Encontro>(await api.post(`${BASE}/${e2.id}/cancelar`, adm.autorizacao, { motivo: 'chuva forte' }).expect(201))
      expect(cancelado).toMatchObject({ cancelado: true, motivo: 'chuva forte', podeDesfazer: true })
      const encontro = await prismaDeTeste().encontroClasseBiblica.findUniqueOrThrow({ where: { id: e2.id } })
      expect(encontro.canceladoPorId).toBe(adm.usuario.id)
      expect(corpo<Detalhe>(await api.get(`${BASE}/${e1.id}`, adm.autorizacao).expect(200)).ocupadas).toEqual([])

      const desfeito = corpo<Encontro>(await api.post(`${BASE}/${e2.id}/desfazer-cancelamento`, adm.autorizacao).expect(201))
      expect(desfeito).toMatchObject({ cancelado: false, motivo: null, podeDesfazer: false })
    })

    it('cancelar exige o motivo', async () => {
      const { adm, e1 } = await cenario()
      await api.post(`${BASE}/${e1.id}/cancelar`, adm.autorizacao, {}).expect(400)
    })

    it('desfazer depois da data é recusado', async () => {
      const { clube, adm, edicao } = await cenario()
      const passado = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(-7), cancelado: true })
      const detalhe = corpo<Detalhe>(await api.get(`${BASE}/${passado.id}`, adm.autorizacao).expect(200))
      expect(detalhe.encontro.podeDesfazer).toBe(false)
      await api.post(`${BASE}/${passado.id}/desfazer-cancelamento`, adm.autorizacao).expect(422)
    })

    it('desfazer com a data ocupada por outro encontro não cancelado é recusado', async () => {
      const { adm, e1, e3 } = await cenario()
      await api.post(`${BASE}/${e1.id}/remarcar`, adm.autorizacao, { data: dia(21) }).expect(201)
      const detalhe = corpo<Detalhe>(await api.get(`${BASE}/${e3.id}`, adm.autorizacao).expect(200))
      expect(detalhe.encontro.podeDesfazer).toBe(false)
      const erro = corpo<Erro>(await api.post(`${BASE}/${e3.id}/desfazer-cancelamento`, adm.autorizacao).expect(422))
      expect(erro.mensagem).toContain(diaEMes(dia(21)))
    })
  })
})
