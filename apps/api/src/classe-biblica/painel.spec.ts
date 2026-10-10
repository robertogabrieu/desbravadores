import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { ErroApi, FrequenciaGrupoSaida, GrupoCB, PainelSaida } from '@desbravadores/shared'
import request from 'supertest'
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
import { contarPorDbv, edicoesNoPeriodo, encontrosFeitos } from './frequencia'

type Painel = z.infer<typeof PainelSaida>
type Frequencia = z.infer<typeof FrequenciaGrupoSaida>
type Grupo = z.infer<typeof GrupoCB>
type Erro = z.infer<typeof ErroApi>

const BASE = '/api/classe-biblica'
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

describe('classe bíblica: painel, frequência e material', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  /**
   * Daniel (Águias e Leões, com material) e Ester (Gaviões). Ana e Bia em Águias, Caio em Leões, Duda em Gaviões.
   * Encontros: 16/08 e 23/08 feitos, 30/08 cancelado (com uma linha que não pode contar), 10/01/2027 por vir.
   */
  async function cenario() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
    const leoes = await criarUnidade({ clubeId: clube.id, nome: 'Leões' })
    const gavioes = await criarUnidade({ clubeId: clube.id, nome: 'Gaviões' })
    const tigres = await criarUnidade({ clubeId: clube.id, nome: 'Tigres' })
    const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 2026', inicio: '2026-08-16', fim: '2027-12-12' })
    const daniel = await criarGrupoCB({
      clubeId: clube.id, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id, leoes.id],
      material: { titulo: 'Lições', url: 'https://exemplo.org/licoes' },
    })
    const ester = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [gavioes.id] })
    const membro = async (nome: string, unidadeId: string) => {
      const dbv = await criarDbv({ clubeId: clube.id, nome })
      await criarMembro({ dbvId: dbv.id, unidadeId, inicio: '2026-02-01' })
      return dbv
    }
    const ana = await membro('Ana Lima', aguias.id)
    const bia = await membro('Bia Souza', aguias.id)
    const caio = await membro('Caio Reis', leoes.id)
    const duda = await membro('Duda Melo', gavioes.id)
    const e1 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-08-16' })
    const e2 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-08-23' })
    const e3 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-08-30', cancelado: true })
    const e4 = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2027-01-10' })
    const c = clube.id
    await criarChamadaCB({ clubeId: c, encontroId: e1.id, grupoId: daniel.id, linhas: [
      { dbvId: ana.id, unidadeId: aguias.id, participou: true },
      { dbvId: bia.id, unidadeId: aguias.id, presente: false },
      { dbvId: caio.id, unidadeId: leoes.id },
    ] })
    await criarChamadaCB({ clubeId: c, encontroId: e2.id, grupoId: daniel.id, linhas: [
      { dbvId: ana.id, unidadeId: aguias.id },
      { dbvId: bia.id, unidadeId: aguias.id, presente: false },
      { dbvId: caio.id, unidadeId: leoes.id, presente: false },
    ] })
    await criarChamadaCB({ clubeId: c, encontroId: e3.id, grupoId: daniel.id, linhas: [{ dbvId: bia.id, unidadeId: aguias.id }] })
    await criarChamadaCB({ clubeId: c, encontroId: e1.id, grupoId: ester.id, linhas: [{ dbvId: duda.id, unidadeId: gavioes.id }] })
    return { clube, adm, aguias, leoes, gavioes, tigres, edicao, daniel, ester, ana, bia, caio, duda, e1, e2, e3, e4 }
  }

  describe('painel', () => {
    it('o Adm vê todos os grupos com as contas, o material e a lista de encontros', async () => {
      const { adm, edicao, daniel, ester, e1, e2, e3, e4 } = await cenario()
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, adm.autorizacao).expect(200))
      expect(painel).toMatchObject({ podeGerenciar: true, podeFazerChamada: true })
      expect(painel.edicao).toMatchObject({ id: edicao.id, nome: 'CB 2026', situacao: 'EM_ANDAMENTO' })
      expect(painel.grupos.map((g) => g.id)).toEqual([daniel.id, ester.id])
      const [gDaniel] = painel.grupos
      expect(gDaniel).toMatchObject({
        nome: 'Daniel',
        material: { titulo: 'Lições', tipo: 'LINK', url: 'https://exemplo.org/licoes', bytes: null },
        encontrosFeitos: 2,
        encontrosPorVir: 1,
        frequenciaMedia: 50,
        abaixoDaMetade: 1,
        proximoEncontro: { id: e4.id, data: '2027-01-10', cancelado: false, temChamada: false },
      })
      expect(gDaniel?.unidades.map((u) => [u.nome, u.dbvs])).toEqual([['Águias', 2], ['Leões', 1]])
      expect(gDaniel?.encontros.map((e) => e.id)).toEqual([e3.id, e2.id, e1.id])
      expect(gDaniel?.encontros[0]).toMatchObject({ cancelado: true, motivo: 'chuva forte' })
      expect(gDaniel?.encontros[2]).toMatchObject({ temChamada: true, chamada: { presentes: 2, total: 3, participaram: 1 } })
      expect(painel.grupos[1]).toMatchObject({ nome: 'Ester', material: null, encontrosFeitos: 1, frequenciaMedia: 100 })
    })

    it('quem só tem a chamada vê só os grupos e os desbravadores do escopo', async () => {
      const { clube, aguias, edicao, daniel, ester, e1 } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, conselheiro.autorizacao).expect(200))
      expect(painel).toMatchObject({ podeGerenciar: false, podeFazerChamada: true })
      expect(painel.grupos.map((g) => g.id)).toEqual([daniel.id])
      const encontro = painel.grupos[0]?.encontros.find((e) => e.id === e1.id)
      expect(encontro?.chamada).toEqual({ presentes: 1, total: 2, participaram: 1 })

      const freq = corpo<Frequencia>(await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, conselheiro.autorizacao).expect(200))
      expect(freq.itens.map((i) => i.nome)).toEqual(['Bia Souza', 'Ana Lima'])
      await api.get(`${BASE}/grupos/${ester.id}/frequencia`, conselheiro.autorizacao).expect(404)
    })

    it('instrutor vê o grupo dos desbravadores CURSANDO numa classe dele, e só eles', async () => {
      const { clube, edicao, daniel, caio } = await cenario()
      const classe = await criarClasseDoClube(clube.id)
      await criarMatricula({ clubeId: clube.id, dbvId: caio.id, classeId: classe.id, anoClube: anoCorrente() })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
      await ajustarPermissao(instrutor.vinculo.id, 'classebiblica.chamada', true)
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, instrutor.autorizacao).expect(200))
      expect(painel.grupos.map((g) => g.id)).toEqual([daniel.id])
      const freq = corpo<Frequencia>(await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, instrutor.autorizacao).expect(200))
      expect(freq.itens.map((i) => i.nome)).toEqual(['Caio Reis'])
    })

    it('conselheiro sem grupo no escopo recebe 404; sem a permissão, 403; outro clube, 404', async () => {
      const { clube, tigres, aguias, edicao, daniel } = await cenario()
      const semGrupo = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [tigres.id] })
      await ajustarPermissao(semGrupo.vinculo.id, 'classebiblica.chamada', true)
      await api.get(`${BASE}/edicoes/${edicao.id}`, semGrupo.autorizacao).expect(404)
      await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, semGrupo.autorizacao).expect(404)

      const semPermissao = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await api.get(`${BASE}/edicoes/${edicao.id}`, semPermissao.autorizacao).expect(403)
      await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, semPermissao.autorizacao).expect(403)

      const outro = await criarClube()
      const outroAdm = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      await api.get(`${BASE}/edicoes/${edicao.id}`, outroAdm.autorizacao).expect(404)
      await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, outroAdm.autorizacao).expect(404)
    })
  })

  describe('unidade que troca de grupo (D31)', () => {
    /**
     * Daniel com Águias, Leões e Gaviões; Ester com Tigres. Em 12/10 Águias sai do Daniel e entra no Ester.
     * Chamadas do Daniel em 04/10, 11/10 e 18/10; do Ester em 18/10. Ana está em Águias, Caio em Leões.
     */
    async function troca() {
      const prisma = prismaDeTeste()
      const clube = await criarClube()
      const c = clube.id
      const adm = await criarAcesso({ clubeId: c, papel: 'ADM' })
      const [aguias, leoes, gavioes, tigres] = await Promise.all(
        ['Águias', 'Leões', 'Gaviões', 'Tigres'].map((nome) => criarUnidade({ clubeId: c, nome })),
      )
      if (!aguias || !leoes || !gavioes || !tigres) throw new Error('unidades')
      const edicao = await criarEdicaoCB({ clubeId: c, terminada: true, nome: 'CB 2026', inicio: '2026-08-16', fim: '2027-12-12' })
      const daniel = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Grupo Daniel', unidadeIds: [leoes.id, gavioes.id] })
      const ester = await criarGrupoCB({ clubeId: c, edicaoId: edicao.id, nome: 'Grupo Ester', unidadeIds: [tigres.id] })
      const dia = (data: string) => new Date(`${data}T00:00:00Z`)
      await prisma.grupoUnidadeClasseBiblica.createMany({ data: [
        { clubeId: c, edicaoId: edicao.id, grupoId: daniel.id, unidadeId: aguias.id, inicio: dia('2026-08-16'), fim: dia('2026-10-12') },
        { clubeId: c, edicaoId: edicao.id, grupoId: ester.id, unidadeId: aguias.id, inicio: dia('2026-10-12') },
      ] })
      const ana = await criarDbv({ clubeId: c, nome: 'Ana Lima' })
      await criarMembro({ dbvId: ana.id, unidadeId: aguias.id, inicio: '2026-02-01' })
      const caio = await criarDbv({ clubeId: c, nome: 'Caio Reis' })
      await criarMembro({ dbvId: caio.id, unidadeId: leoes.id, inicio: '2026-02-01' })
      const encontros: Awaited<ReturnType<typeof criarEncontroCB>>[] = []
      for (const data of ['2026-10-04', '2026-10-11', '2026-10-18']) {
        const encontro = await criarEncontroCB({ clubeId: c, edicaoId: edicao.id, data })
        const linhas = data < '2026-10-12' ? [{ dbvId: ana.id, unidadeId: aguias.id }, { dbvId: caio.id, unidadeId: leoes.id }] : [{ dbvId: caio.id, unidadeId: leoes.id }]
        await criarChamadaCB({ clubeId: c, encontroId: encontro.id, grupoId: daniel.id, linhas })
        encontros.push(encontro)
      }
      const ultimo = encontros[2]
      if (ultimo) await criarChamadaCB({ clubeId: c, encontroId: ultimo.id, grupoId: ester.id, linhas: [{ dbvId: ana.id, unidadeId: aguias.id }] })
      return { clube, adm, aguias, leoes, edicao, daniel, ester }
    }
    const porData = (grupo: Painel['grupos'][number] | undefined) => grupo?.encontros.map((e) => [e.data, e.unidades])

    it('critério 49: cada encontro diz as unidades do dia e a troca aparece nos dois grupos', async () => {
      const { adm, edicao } = await troca()
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, adm.autorizacao).expect(200))
      const [daniel, ester] = painel.grupos
      expect(porData(daniel)).toEqual([
        ['2026-10-18', ['Gaviões', 'Leões']],
        ['2026-10-11', ['Águias', 'Gaviões', 'Leões']],
        ['2026-10-04', ['Águias', 'Gaviões', 'Leões']],
      ])
      expect(daniel?.mudancas).toEqual([{ data: '2026-10-12', unidade: 'Águias', tipo: 'SAIU', outroGrupo: 'Grupo Ester' }])
      const doEster = (data: string) => ester?.encontros.find((e) => e.data === data)?.unidades
      expect([doEster('2026-10-18'), doEster('2026-10-04')]).toEqual([['Águias', 'Tigres'], ['Tigres']])
      expect(ester?.mudancas).toEqual([{ data: '2026-10-12', unidade: 'Águias', tipo: 'ENTROU', outroGrupo: 'Grupo Daniel' }])
      expect(daniel?.unidades.map((u) => u.nome)).toEqual(['Gaviões', 'Leões'])
    })

    it('para quem só tem a chamada, as unidades e as trocas saem cortadas pelo escopo', async () => {
      const { clube, edicao, aguias, leoes, daniel } = await troca()
      const deLeoes = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [leoes.id] })
      await ajustarPermissao(deLeoes.vinculo.id, 'classebiblica.chamada', true)
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, deLeoes.autorizacao).expect(200))
      expect(painel.grupos.map((g) => g.id)).toEqual([daniel.id])
      expect(porData(painel.grupos[0])?.map(([, unidades]) => unidades)).toEqual([['Leões'], ['Leões'], ['Leões']])
      expect(painel.grupos[0]?.mudancas).toEqual([])
      expect(painel.grupos[0]?.encontros[2]?.chamada).toMatchObject({ total: 1 })

      const deAguias = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await ajustarPermissao(deAguias.vinculo.id, 'classebiblica.chamada', true)
      const doAguias = corpo<Painel>(await api.get(`${BASE}/edicoes/${edicao.id}`, deAguias.autorizacao).expect(200))
      expect(porData(doAguias.grupos[0])?.map(([, unidades]) => unidades)).toEqual([[], ['Águias'], ['Águias']])
      expect(doAguias.grupos[0]?.mudancas).toEqual([{ data: '2026-10-12', unidade: 'Águias', tipo: 'SAIU', outroGrupo: 'Grupo Ester' }])
      expect(doAguias.grupos[0]?.encontros[2]?.chamada).toMatchObject({ total: 1 })
    })
  })

  describe('frequência', () => {
    it('X de Y por desbravador do grupo, do menor para o maior, sem o encontro cancelado', async () => {
      const { adm, daniel } = await cenario()
      const freq = corpo<Frequencia>(await api.get(`${BASE}/grupos/${daniel.id}/frequencia`, adm.autorizacao).expect(200))
      expect(freq.grupo).toEqual({ id: daniel.id, nome: 'Daniel' })
      expect(freq.itens.map((i) => [i.nome, i.unidade, i.presencas, i.encontros, i.participacoes])).toEqual([
        ['Bia Souza', 'Águias', 0, 2, 0],
        ['Caio Reis', 'Leões', 1, 2, 0],
        ['Ana Lima', 'Águias', 2, 2, 1],
      ])
    })

    it('contarPorDbv conta só as linhas gravadas e leva o grupo da mais recente', async () => {
      const { clube, edicao, aguias, ester, ana, bia, duda } = await cenario()
      const novo = await criarEncontroCB({ clubeId: clube.id, edicaoId: edicao.id, data: '2026-09-06' })
      await criarChamadaCB({ clubeId: clube.id, encontroId: novo.id, grupoId: ester.id, linhas: [{ dbvId: ana.id, unidadeId: aguias.id }] })
      const prisma = prismaDeTeste()
      const contagem = await contarPorDbv(prisma, clube.id, edicao.id)
      expect(contagem.get(ana.id)).toEqual({ encontros: 3, presencas: 3, participacoes: 1, grupoId: ester.id, grupoNome: 'Ester' })
      expect(contagem.get(bia.id)).toMatchObject({ encontros: 2, presencas: 0 })
      expect(contagem.get(duda.id)).toMatchObject({ encontros: 1, presencas: 1 })
      const filtrada = await contarPorDbv(prisma, clube.id, edicao.id, [duda.id])
      expect([...filtrada.keys()]).toEqual([duda.id])
      expect(await encontrosFeitos(prisma, clube.id, edicao.id)).toBe(3)
      expect(await encontrosFeitos(prisma, clube.id, edicao.id, ester.id)).toBe(2)

      const outroClube = await criarClube()
      expect((await contarPorDbv(prisma, outroClube.id, edicao.id)).size).toBe(0)
    })

    it('edicoesNoPeriodo traz só as terminadas que cruzam o período, da mais recente', async () => {
      const clube = await criarClube()
      const antiga = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'A', inicio: '2026-02-01', fim: '2026-06-28' })
      const recente = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'B', inicio: '2026-08-02', fim: '2026-12-13' })
      await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'C', inicio: '2027-03-07', fim: '2027-06-27' })
      await criarEdicaoCB({ clubeId: clube.id, nome: 'rascunho', inicio: '2026-03-01', fim: '2026-05-31' })
      const achadas = await edicoesNoPeriodo(prismaDeTeste(), clube.id, '2026-02-01', '2027-01-31')
      expect(achadas).toEqual([
        { id: recente.id, nome: 'B', inicio: '2026-08-02', fim: '2026-12-13' },
        { id: antiga.id, nome: 'A', inicio: '2026-02-01', fim: '2026-06-28' },
      ])
    })
  })

  describe('material', () => {
    function enviar(auth: string, grupoId: string, arquivo: Buffer, nome = 'estudo.pdf'): request.Test {
      return request(servidor())
        .post(`${BASE}/grupos/${grupoId}/material/arquivo`)
        .set('Authorization', auth)
        .field('dados', JSON.stringify({ titulo: 'Estudo ilustrado' }))
        .attach('arquivo', arquivo, { filename: nome })
    }

    it('anexa PDF por URL assinada e troca, guardando o arquivo antigo', async () => {
      const { clube, adm, ester } = await cenario()
      const primeiro = corpo<Grupo>(await enviar(adm.autorizacao, ester.id, PDF).expect(201))
      expect(primeiro.material).toMatchObject({ titulo: 'Estudo ilustrado', tipo: 'PDF', bytes: PDF.length })
      expect(primeiro.material?.url).toMatch(/\S/)
      const antes = await prismaDeTeste().grupoClasseBiblica.findUniqueOrThrow({ where: { id: ester.id } })

      await enviar(adm.autorizacao, ester.id, PDF, 'outro.pdf').expect(201)
      const depois = await prismaDeTeste().grupoClasseBiblica.findUniqueOrThrow({ where: { id: ester.id } })
      expect(depois.materialArquivoId).not.toBe(antes.materialArquivoId)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id } })).toBe(2)

      await enviar(adm.autorizacao, ester.id, Buffer.from('nao e pdf'), 'falso.pdf').expect(422)
    })

    it('link https substitui o arquivo; sem https é recusado', async () => {
      const { adm, ester } = await cenario()
      await enviar(adm.autorizacao, ester.id, PDF).expect(201)
      const grupo = corpo<Grupo>(
        await api.post(`${BASE}/grupos/${ester.id}/material/link`, adm.autorizacao, { titulo: 'Site', url: 'https://exemplo.org/a' }).expect(201),
      )
      expect(grupo.material).toEqual({ titulo: 'Site', tipo: 'LINK', url: 'https://exemplo.org/a', bytes: null })
      const linha = await prismaDeTeste().grupoClasseBiblica.findUniqueOrThrow({ where: { id: ester.id } })
      expect(linha.materialArquivoId).toBeNull()
      const recusa = await api.post(`${BASE}/grupos/${ester.id}/material/link`, adm.autorizacao, { titulo: 'Site', url: 'http://exemplo.org' }).expect(400)
      expect(corpo<Erro>(recusa).campos).toEqual({ url: 'Use um link https://' })
    })

    it('PDF de 25 MB é recusado', async () => {
      const { adm, ester } = await cenario()
      const grande = Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024)])
      await enviar(adm.autorizacao, ester.id, grande).expect(422)
      const linha = await prismaDeTeste().grupoClasseBiblica.findUniqueOrThrow({ where: { id: ester.id } })
      expect(linha.materialArquivoId).toBeNull()
    })

    it('sem gerenciar, 403; grupo de outro clube, 404', async () => {
      const { clube, aguias, daniel } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
      await ajustarPermissao(conselheiro.vinculo.id, 'classebiblica.chamada', true)
      await enviar(conselheiro.autorizacao, daniel.id, PDF).expect(403)
      await api.post(`${BASE}/grupos/${daniel.id}/material/link`, conselheiro.autorizacao, { titulo: 'x', url: 'https://a.org' }).expect(403)
      const outro = await criarClube()
      const outroAdm = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      await enviar(outroAdm.autorizacao, daniel.id, PDF).expect(404)
      await api.post(`${BASE}/grupos/${daniel.id}/material/link`, outroAdm.autorizacao, { titulo: 'x', url: 'https://a.org' }).expect(404)
    })
  })
})
