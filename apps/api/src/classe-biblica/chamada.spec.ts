import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, type ChamadaCBEnvioSaida, type ChamadaCBSaida, type ErroApi } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarDbv,
  criarEdicaoCB,
  criarEncontroCB,
  criarGrupoCB,
  criarMatricula,
  criarMembro,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { ajustarPermissao, anoCorrente, clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'
import { diaEMes } from '../progresso/conclusoes'
import { garantirCriterios } from './criterios'

type Chamada = z.infer<typeof ChamadaCBSaida>
type Saida = z.infer<typeof ChamadaCBEnvioSaida>
type Erro = z.infer<typeof ErroApi>
interface Linha { dbvId: string; presente: boolean; participou: boolean; versaoVista?: string | null }

const DIA = 86_400_000

function dia(deslocamento: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() + deslocamento * DIA))
}

describe('classe bíblica: chamada (regras 8–12)', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  /**
   * Daniel (Águias e Leões) e Ester (Gaviões). Ana e Bia em Águias; Noah entrou em Águias há 3 dias;
   * Rui saiu de Águias ontem; Zé está inativo em Águias; Caio em Leões; Duda em Gaviões. Encontro hoje.
   */
  async function cenario() {
    const clube = await criarClube()
    const c = clube.id
    const adm = await criarAcesso({ clubeId: c, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: c, nome: 'Águias' })
    const leoes = await criarUnidade({ clubeId: c, nome: 'Leões' })
    const gavioes = await criarUnidade({ clubeId: c, nome: 'Gaviões' })
    const edicao = await criarEdicaoCB({ clubeId: c, terminada: true, nome: 'CB', inicio: dia(-60), fim: dia(60) })
    const daniel = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id, leoes.id] })
    const ester = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [gavioes.id] })
    const membro = async (nome: string, unidadeId: string, inicio = dia(-90), fim?: string, ativo = true) => {
      const dbv = await criarDbv({ clubeId: c, nome, ativo })
      await criarMembro({ dbvId: dbv.id, unidadeId, inicio, ...(fim ? { fim } : {}) })
      return dbv
    }
    const ana = await membro('Ana Lima', aguias.id)
    const bia = await membro('Bia Souza', aguias.id)
    const noah = await membro('Noah Dias', aguias.id, dia(-3))
    const rui = await membro('Rui Paz', aguias.id, dia(-90), dia(-1))
    const ze = await membro('Zé Inativo', aguias.id, dia(-90), undefined, false)
    const caio = await membro('Caio Reis', leoes.id)
    const duda = await membro('Duda Melo', gavioes.id)
    const encontro = await criarEncontroCB({ clubeId: c, edicaoId: edicao.id, data: dia(0) })
    return { clube, adm, aguias, leoes, gavioes, edicao, daniel, ester, ana, bia, noah, rui, ze, caio, duda, encontro }
  }

  const urlChamada = (encontroId: string, grupoId: string) => `/api/classe-biblica/encontros/${encontroId}/grupos/${grupoId}/chamada`
  const urlEnvio = (encontroId: string, grupoId: string) => `/api/sync/classe-biblica/encontros/${encontroId}/grupos/${grupoId}`
  const envio = (linhas: Linha[], envioId: string = randomUUID()) => ({
    envioId,
    linhas: linhas.map((linha) => ({ versaoVista: null, ...linha })),
  })
  const lancamentos = (clubeId: string) =>
    prismaDeTeste().lancamentoPontos.findMany({ where: { clubeId, origemTipo: 'CLASSE_BIBLICA' }, orderBy: { pontos: 'desc' } })

  describe('GET da lista', () => {
    it('lista por unidade, na data, todos presentes; quem saiu ou está inativo não aparece', async () => {
      const { adm, encontro, daniel, edicao, aguias, leoes, ana, bia, noah, caio } = await cenario()
      const chamada = corpo<Chamada>(await api.get(urlChamada(encontro.id, daniel.id), adm.autorizacao).expect(200))
      expect(chamada.encontro).toMatchObject({ id: encontro.id, edicaoId: edicao.id, edicaoNome: 'CB', data: dia(0), dataOriginal: null })
      expect(chamada.grupo).toEqual({ id: daniel.id, nome: 'Daniel' })
      expect(chamada.registrada).toBe(false)
      expect(chamada.unidades.map((u) => [u.id, u.nome, u.desbravadores.map((d) => d.dbvId)])).toEqual([
        [aguias.id, 'Águias', [ana.id, bia.id, noah.id]],
        [leoes.id, 'Leões', [caio.id]],
      ])
      const [anaNaLista, , noahNaLista] = chamada.unidades[0]?.desbravadores ?? []
      expect(anaNaLista).toEqual({ dbvId: ana.id, nome: 'Ana Lima', entrouEm: null, presente: true, participou: false, versao: null })
      expect(noahNaLista?.entrouEm).toBe(dia(-3))
    })

    it('traz as marcas e as versões já gravadas', async () => {
      const { clube, adm, encontro, daniel, aguias, ana } = await cenario()
      await criarChamadaCB({ clubeId: clube.id, encontroId: encontro.id, grupoId: daniel.id, linhas: [{ dbvId: ana.id, unidadeId: aguias.id, presente: false }] })
      const chamada = corpo<Chamada>(await api.get(urlChamada(encontro.id, daniel.id), adm.autorizacao).expect(200))
      expect(chamada.registrada).toBe(true)
      expect(chamada.unidades[0]?.desbravadores[0]).toMatchObject({ dbvId: ana.id, presente: false, participou: false, versao: expect.any(String) as string })
    })

    it('encontro que ainda não chegou é recusado; remarcado para o futuro, com o texto da regra 12', async () => {
      const { clube, adm, edicao, daniel, encontro } = await cenario()
      const futuro = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(7) })
      const erro = corpo<Erro>(await api.get(urlChamada(futuro.id, daniel.id), adm.autorizacao).expect(422))
      expect(erro.mensagem).toBe(`A chamada do encontro de ${diaEMes(dia(7))} só pode ser feita a partir desse dia.`)
      await prismaDeTeste().encontroClasseBiblica.update({
        where: { id: encontro.id },
        data: { data: new Date(`${dia(6)}T00:00:00Z`), dataOriginal: new Date(`${dia(0)}T00:00:00Z`) },
      })
      const remarcado = corpo<Erro>(await api.get(urlChamada(encontro.id, daniel.id), adm.autorizacao).expect(422))
      expect(remarcado.mensagem).toBe(
        `O encontro de ${diaEMes(dia(0))} foi remarcado para ${diaEMes(dia(6))}; a chamada só pode ser feita a partir desse dia.`,
      )
    })

    it('encontro cancelado é recusado; encontro de outra edição ou de outro clube responde 404', async () => {
      const { clube, adm, edicao, daniel } = await cenario()
      const cancelado = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(-7), cancelado: true })
      const erro = corpo<Erro>(await api.get(urlChamada(cancelado.id, daniel.id), adm.autorizacao).expect(422))
      expect(erro.mensagem).toBe(`O encontro de ${diaEMes(dia(-7))} foi cancelado; a chamada não foi registrada.`)
      const outraEdicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true, inicio: dia(-60), fim: dia(60) })
      const deOutra = await criarEncontroCB({ clubeId: clube.id, edicaoId: outraEdicao.id, data: dia(0) })
      await api.get(urlChamada(deOutra.id, daniel.id), adm.autorizacao).expect(404)
      const outroClube = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
      const { encontro } = await cenario()
      await api.get(urlChamada(encontro.id, daniel.id), outroClube.autorizacao).expect(404)
    })
  })

  describe('PUT da fila', () => {
    it('grava as linhas, participou=false para ausente, a chamada registrada e os pontos 10 + 5 na data do encontro', async () => {
      const { clube, adm, encontro, daniel, aguias, ana, bia, caio } = await cenario()
      const saida = corpo<Saida>(
        await api
          .put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([
            { dbvId: ana.id, presente: true, participou: true },
            { dbvId: bia.id, presente: false, participou: true },
            { dbvId: caio.id, presente: true, participou: false },
          ]))
          .expect(200),
      )
      expect(saida).toMatchObject({ conflitos: [], ignorados: [], presentes: 2, participaram: 1 })
      expect(saida.linhas.find((l) => l.dbvId === bia.id)).toMatchObject({ presente: false, participou: false })
      const presencas = await prismaDeTeste().presencaClasseBiblica.findMany({ where: { encontroId: encontro.id } })
      expect(presencas).toHaveLength(3)
      expect(presencas.find((p) => p.dbvId === bia.id)).toMatchObject({ presente: false, participou: false, unidadeId: aguias.id, grupoId: daniel.id })
      expect(await prismaDeTeste().chamadaClasseBiblica.count({ where: { encontroId: encontro.id, grupoId: daniel.id } })).toBe(1)

      const pontos = await lancamentos(clube.id)
      expect(pontos.filter((p) => p.dbvId === ana.id).map((p) => p.pontos)).toEqual([10, 5])
      expect(pontos.filter((p) => p.dbvId === bia.id)).toEqual([])
      expect(pontos.filter((p) => p.dbvId === caio.id).map((p) => p.pontos)).toEqual([10])
      const daAna = pontos.find((p) => p.dbvId === ana.id)
      expect(daAna?.origemId).toBe(`${encontro.id}:${ana.id}`)
      expect(daAna?.data.toISOString().slice(0, 10)).toBe(dia(0))
    })

    it('mesmo envioId duas vezes não duplica linha nem ponto', async () => {
      const { clube, adm, encontro, daniel, ana } = await cenario()
      const corpoDoEnvio = envio([{ dbvId: ana.id, presente: true, participou: true }])
      await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, corpoDoEnvio).expect(200)
      const repetido = corpo<Saida>(await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, corpoDoEnvio).expect(200))
      expect(repetido.linhas).toHaveLength(1)
      expect(await prismaDeTeste().presencaClasseBiblica.count({ where: { encontroId: encontro.id } })).toBe(1)
      expect(await lancamentos(clube.id)).toHaveLength(2)
      expect(await prismaDeTeste().envioClasseBiblicaProcessado.count({ where: { envioId: corpoDoEnvio.envioId } })).toBe(1)
    })

    it('corrigir para falta estorna os dois pontos e não lança desconto; não há rota de desfazer', async () => {
      const { clube, adm, encontro, daniel, ana } = await cenario()
      const primeira = corpo<Saida>(
        await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: true }])).expect(200),
      )
      const versao = primeira.linhas[0]?.versao ?? null
      const corrigida = corpo<Saida>(
        await api
          .put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: false, participou: true, versaoVista: versao }]))
          .expect(200),
      )
      expect(corrigida.conflitos).toEqual([])
      expect(corrigida).toMatchObject({ presentes: 0, participaram: 0 })
      const pontos = await lancamentos(clube.id)
      expect(pontos).toHaveLength(2)
      expect(pontos.every((p) => p.estornadoEm !== null)).toBe(true)
      expect(await prismaDeTeste().lancamentoPontos.count({ where: { clubeId: clube.id, criterioId: null } })).toBe(0)
      await api.post(`${urlChamada(encontro.id, daniel.id)}/desfazer`, adm.autorizacao).expect(404)
    })

    it('conflito pela versão: a que chega por último vale e volta com o nome', async () => {
      const { adm, encontro, daniel, ana, bia } = await cenario()
      await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([
        { dbvId: ana.id, presente: true, participou: false },
        { dbvId: bia.id, presente: true, participou: false },
      ])).expect(200)
      const saida = corpo<Saida>(
        await api
          .put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([
            { dbvId: ana.id, presente: false, participou: false, versaoVista: null },
            { dbvId: bia.id, presente: true, participou: false, versaoVista: null },
          ]))
          .expect(200),
      )
      expect(saida.conflitos).toEqual([{ dbvId: ana.id, nome: 'Ana Lima' }])
      expect(saida.linhas.find((l) => l.dbvId === ana.id)?.presente).toBe(false)
    })

    it('linhas de inativo, de quem saiu da unidade e de outro grupo voltam em ignorados com o nome', async () => {
      const { adm, encontro, daniel, ana, rui, ze, duda } = await cenario()
      const saida = corpo<Saida>(
        await api
          .put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([
            { dbvId: ana.id, presente: true, participou: false },
            { dbvId: rui.id, presente: true, participou: false },
            { dbvId: ze.id, presente: true, participou: false },
            { dbvId: duda.id, presente: true, participou: false },
          ]))
          .expect(200),
      )
      expect(saida.linhas.map((l) => l.dbvId)).toEqual([ana.id])
      expect(saida.ignorados.map((i) => i.nome).sort()).toEqual(['Duda Melo', 'Rui Paz', 'Zé Inativo'])
      expect(await prismaDeTeste().presencaClasseBiblica.count({ where: { encontroId: encontro.id } })).toBe(1)
    })

    it('grupo sem ninguém na data registra a chamada sem linhas', async () => {
      const { clube, adm, edicao, encontro } = await cenario()
      const tigres = await criarUnidade({ clubeId: clube.id, nome: 'Tigres' })
      const rute = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Rute', unidadeIds: [tigres.id] })
      const lista = corpo<Chamada>(await api.get(urlChamada(encontro.id, rute.id), adm.autorizacao).expect(200))
      expect(lista.unidades).toEqual([])
      const saida = corpo<Saida>(await api.put(urlEnvio(encontro.id, rute.id), adm.autorizacao, envio([])).expect(200))
      expect(saida).toMatchObject({ linhas: [], presentes: 0, participaram: 0 })
      expect(await prismaDeTeste().chamadaClasseBiblica.count({ where: { encontroId: encontro.id, grupoId: rute.id } })).toBe(1)
      expect(corpo<Chamada>(await api.get(urlChamada(encontro.id, rute.id), adm.autorizacao).expect(200)).registrada).toBe(true)
    })

    it('critério inativo não lança', async () => {
      const { clube, adm, encontro, daniel, ana } = await cenario()
      await prismaDeTeste().$transaction((tx) => garantirCriterios(tx, clube.id))
      await prismaDeTeste().criterioRanking.updateMany({ where: { clubeId: clube.id, gatilho: 'CLASSE_BIBLICA_PRESENCA' }, data: { ativo: false } })
      await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: true }])).expect(200)
      expect((await lancamentos(clube.id)).map((p) => p.pontos)).toEqual([5])
    })

    it('garante os critérios antes de pontuar', async () => {
      const { clube, adm, encontro, daniel, ana } = await cenario()
      await prismaDeTeste().criterioRanking.deleteMany({ where: { clubeId: clube.id, gatilho: { in: ['CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO'] } } })
      await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: false }])).expect(200)
      expect((await lancamentos(clube.id)).map((p) => p.pontos)).toEqual([10])
    })
  })

  describe('grupo e unidade do dia (regras 8 e 14)', () => {
    /** Chamada do Daniel em hoje−7 com Ana, Bia e Rui (Águias) e Caio (Leões); depois Águias passa para o Ester. */
    async function aguiasMudaDeGrupo() {
      const base = await cenario()
      const { clube, adm, edicao, daniel, ester, aguias, ana, bia, rui, caio } = base
      const passado = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(-7) })
      await api.put(urlEnvio(passado.id, daniel.id), adm.autorizacao, envio([
        { dbvId: ana.id, presente: true, participou: true },
        { dbvId: bia.id, presente: false, participou: false },
        { dbvId: rui.id, presente: true, participou: false },
        { dbvId: caio.id, presente: true, participou: false },
      ])).expect(200)
      await prismaDeTeste().grupoUnidadeClasseBiblica.deleteMany({ where: { grupoId: daniel.id, unidadeId: aguias.id } })
      await prismaDeTeste().grupoUnidadeClasseBiblica.create({ data: { clubeId: clube.id, edicaoId: edicao.id, grupoId: ester.id, unidadeId: aguias.id } })
      return { ...base, passado }
    }
    const porUnidade = (chamada: Chamada) => chamada.unidades.map((u) => [u.nome, u.desbravadores.map((d) => [d.nome, d.presente])])

    it('a chamada passada do Daniel continua com os de Águias e as marcas; a do Ester não os lista', async () => {
      const { adm, passado, daniel, ester } = await aguiasMudaDeGrupo()
      const doDaniel = corpo<Chamada>(await api.get(urlChamada(passado.id, daniel.id), adm.autorizacao).expect(200))
      expect(porUnidade(doDaniel)).toEqual([
        ['Águias', [['Ana Lima', true], ['Bia Souza', false], ['Rui Paz', true]]],
        ['Leões', [['Caio Reis', true]]],
      ])
      const doEster = corpo<Chamada>(await api.get(urlChamada(passado.id, ester.id), adm.autorizacao).expect(200))
      expect(porUnidade(doEster)).toEqual([['Gaviões', [['Duda Melo', true]]]])
    })

    it('encontro sem linha segue a composição nova', async () => {
      const { adm, encontro, daniel, ester } = await aguiasMudaDeGrupo()
      const doEster = corpo<Chamada>(await api.get(urlChamada(encontro.id, ester.id), adm.autorizacao).expect(200))
      expect(doEster.unidades.map((u) => u.nome)).toEqual(['Águias', 'Gaviões'])
      const doDaniel = corpo<Chamada>(await api.get(urlChamada(encontro.id, daniel.id), adm.autorizacao).expect(200))
      expect(doDaniel.unidades.map((u) => u.nome)).toEqual(['Leões'])
    })

    it('corrigir a do Daniel funciona e mantém grupo e unidade; enviar pelo Ester ignora quem já tem linha', async () => {
      const { adm, passado, daniel, ester, aguias, ana } = await aguiasMudaDeGrupo()
      const lista = corpo<Chamada>(await api.get(urlChamada(passado.id, daniel.id), adm.autorizacao).expect(200))
      const versao = lista.unidades[0]?.desbravadores[0]?.versao ?? null
      const corrigida = corpo<Saida>(
        await api.put(urlEnvio(passado.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: false, participou: false, versaoVista: versao }])).expect(200),
      )
      expect(corrigida.conflitos).toEqual([])
      expect(corrigida.ignorados).toEqual([])
      const peloEster = corpo<Saida>(
        await api.put(urlEnvio(passado.id, ester.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: true }])).expect(200),
      )
      expect(peloEster.ignorados).toEqual([{ dbvId: ana.id, nome: 'Ana Lima' }])
      const linha = await prismaDeTeste().presencaClasseBiblica.findUniqueOrThrow({ where: { encontroId_dbvId: { encontroId: passado.id, dbvId: ana.id } } })
      expect(linha).toMatchObject({ grupoId: daniel.id, unidadeId: aguias.id, presente: false, participou: false })
    })
  })

  describe('recusas contra o estado do servidor (regra 12)', () => {
    it('encontro cancelado: recusa com o texto e nada é gravado', async () => {
      const { clube, adm, edicao, daniel, ana } = await cenario()
      const cancelado = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(-7), cancelado: true })
      const erro = corpo<Erro>(
        await api.put(urlEnvio(cancelado.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: false }])).expect(422),
      )
      expect(erro.mensagem).toBe(`O encontro de ${diaEMes(dia(-7))} foi cancelado; a chamada não foi registrada.`)
      expect(await prismaDeTeste().chamadaClasseBiblica.count({ where: { encontroId: cancelado.id } })).toBe(0)
      expect(await prismaDeTeste().presencaClasseBiblica.count({ where: { encontroId: cancelado.id } })).toBe(0)
    })

    it('remarcado para data que ainda não chegou: recusa com as duas datas', async () => {
      const { adm, encontro, daniel, ana } = await cenario()
      await prismaDeTeste().encontroClasseBiblica.update({
        where: { id: encontro.id },
        data: { data: new Date(`${dia(6)}T00:00:00Z`), dataOriginal: new Date(`${dia(0)}T00:00:00Z`) },
      })
      const erro = corpo<Erro>(
        await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: false }])).expect(422),
      )
      expect(erro.mensagem).toBe(
        `O encontro de ${diaEMes(dia(0))} foi remarcado para ${diaEMes(dia(6))}; a chamada só pode ser feita a partir desse dia.`,
      )
      expect(await prismaDeTeste().chamadaClasseBiblica.count({ where: { encontroId: encontro.id } })).toBe(0)
    })

    it('encontro que ainda não chegou é recusado', async () => {
      const { clube, adm, edicao, daniel } = await cenario()
      const futuro = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(7) })
      await api.put(urlEnvio(futuro.id, daniel.id), adm.autorizacao, envio([])).expect(422)
    })

    it('remarcado para data que já chegou: aceita pelo encontro', async () => {
      const { clube, adm, encontro, daniel, ana } = await cenario()
      await prismaDeTeste().encontroClasseBiblica.update({
        where: { id: encontro.id },
        data: { dataOriginal: new Date(`${dia(5)}T00:00:00Z`) },
      })
      await api.put(urlEnvio(encontro.id, daniel.id), adm.autorizacao, envio([{ dbvId: ana.id, presente: true, participou: false }])).expect(200)
      expect(await prismaDeTeste().presencaClasseBiblica.count({ where: { clubeId: clube.id, encontroId: encontro.id } })).toBe(1)
    })
  })

  describe('escopo (regra 9)', () => {
    it('Conselheiro vê só os desbravadores das unidades dele; grupo fora responde 404; linha de fora volta em ignorados', async () => {
      const { clube, encontro, daniel, ester, aguias, ana, bia, noah, caio } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await api.get(urlChamada(encontro.id, daniel.id), conselheiro.autorizacao).expect(403)
      await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)

      const lista = corpo<Chamada>(await api.get(urlChamada(encontro.id, daniel.id), conselheiro.autorizacao).expect(200))
      expect(lista.unidades.map((u) => [u.nome, u.desbravadores.map((d) => d.dbvId)])).toEqual([['Águias', [ana.id, bia.id, noah.id]]])
      await api.get(urlChamada(encontro.id, ester.id), conselheiro.autorizacao).expect(404)
      await api.put(urlEnvio(encontro.id, ester.id), conselheiro.autorizacao, envio([])).expect(404)

      const saida = corpo<Saida>(
        await api
          .put(urlEnvio(encontro.id, daniel.id), conselheiro.autorizacao, envio([
            { dbvId: ana.id, presente: true, participou: false },
            { dbvId: caio.id, presente: true, participou: false },
          ]))
          .expect(200),
      )
      expect(saida.linhas.map((l) => l.dbvId)).toEqual([ana.id])
      expect(saida.ignorados).toEqual([{ dbvId: caio.id, nome: 'Caio Reis' }])
    })

    it('Conselheiro alcança quem estava numa unidade dele na data do encontro, na lista e no envio', async () => {
      const { clube, edicao, daniel, aguias, rui } = await cenario()
      const passado = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: dia(-7) })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)
      const lista = corpo<Chamada>(await api.get(urlChamada(passado.id, daniel.id), conselheiro.autorizacao).expect(200))
      expect(lista.unidades.flatMap((u) => u.desbravadores.map((d) => d.dbvId))).toContain(rui.id)
      const saida = corpo<Saida>(
        await api.put(urlEnvio(passado.id, daniel.id), conselheiro.autorizacao, envio([{ dbvId: rui.id, presente: true, participou: false }])).expect(200),
      )
      expect(saida.ignorados).toEqual([])
      expect(saida.linhas.map((l) => l.dbvId)).toEqual([rui.id])
    })

    it('Instrutor vê só os CURSANDO numa classe dele no ano corrente', async () => {
      const { clube, encontro, daniel, ana, bia } = await cenario()
      const classe = await criarClasseDoClube(clube.id)
      await criarMatricula({ clubeId: clube.id, dbvId: ana.id, classeId: classe.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: bia.id, classeId: classe.id, anoClube: anoCorrente() - 1 })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
      await ajustarPermissao(instrutor.vinculo.id, 'classebiblica.chamada', true)
      const lista = corpo<Chamada>(await api.get(urlChamada(encontro.id, daniel.id), instrutor.autorizacao).expect(200))
      expect(lista.unidades.flatMap((u) => u.desbravadores.map((d) => d.dbvId))).toEqual([ana.id])
    })
  })
})
