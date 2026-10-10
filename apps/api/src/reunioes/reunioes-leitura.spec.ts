import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import {
  GradeFrequenciaSaida,
  hojeNoFuso,
  MembroSaida,
  ReuniaoDetalhe,
  ReuniaoResumo,
} from '@desbravadores/shared'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarAlbum,
  criarClube,
  criarDbv,
  criarFoto,
  criarLancamento,
  criarMembro,
  criarReuniao,
  criarSubstituicao,
  criarUnidade,
  criarUsuarioDeSubstituicao,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

const DIA = 86_400_000

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

describe('leituras de reunioes, grade e membros', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    const caio = await criarDbv({ clubeId: clube.id, nome: 'Caio Reis' })
    for (const dbv of [ana, bia, caio]) await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
    return { clube, unidade, acesso, ana, bia, caio }
  }

  describe('GET /api/reunioes', () => {
    it('lista o mes da unidade, da mais recente a mais antiga, com contagens e percentual arredondado', async () => {
      const c = await cenario()
      const mes = diasAtras(0).slice(0, 7)
      const outraData = `${mes}-01`
      const hoje = diasAtras(0)
      const primeira = await criarReuniao({
        unidadeId: c.unidade.id,
        data: outraData,
        horario: '08:00',
        chamada: [
          { dbvId: c.ana.id, situacao: 'PRESENTE', uniforme: true, biblia: true },
          { dbvId: c.bia.id, situacao: 'ATRASADO', uniforme: true },
          { dbvId: c.caio.id, situacao: 'FALTA' },
        ],
      })
      const outraUnidade = await criarUnidade({ clubeId: c.clube.id })
      await criarReuniao({ unidadeId: outraUnidade.id, data: outraData })
      await criarReuniao({ unidadeId: c.unidade.id, data: '2020-01-05', chamada: [{ dbvId: c.ana.id }] })
      const vazia = hoje === outraData ? null : await criarReuniao({ unidadeId: c.unidade.id, data: hoje, horario: '09:30' })

      const resposta = await api.get(`/api/reunioes?unidadeId=${c.unidade.id}&mes=${mes}`, c.acesso.autorizacao)
      expect(resposta.status).toBe(200)
      const lista = ReuniaoResumo.array().parse(corpo<unknown>(resposta))
      const doPrimeiro = lista.find((r) => r.id === primeira.id)
      expect(doPrimeiro).toEqual({
        id: primeira.id, data: outraData, horario: '08:00',
        presentes: 2, total: 3, atrasos: 1, uniformes: 2, biblias: 1, percentual: 67, alterada: false,
      })
      if (vazia) {
        expect(lista.map((r) => r.id)).toEqual([vazia.id, primeira.id])
        expect(lista[0]).toMatchObject({ total: 0, percentual: null, presentes: 0 })
      } else {
        expect(lista).toHaveLength(1)
      }
    })

    it('alterada e verdadeiro quando ha ChamadaAlteracao', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(0), chamada: [{ dbvId: c.ana.id }] })
      await prismaDeTeste().chamadaAlteracao.create({
        data: { clubeId: c.clube.id, reuniaoId: reuniao.id, dbvId: c.ana.id, antes: { situacao: 'FALTA' }, depois: { situacao: 'PRESENTE' }, origem: 'EDICAO', alteradaPorId: c.acesso.usuario.id },
      })
      const resposta = await api.get(`/api/reunioes?unidadeId=${c.unidade.id}&mes=${diasAtras(0).slice(0, 7)}`, c.acesso.autorizacao)
      expect(ReuniaoResumo.array().parse(corpo<unknown>(resposta))[0]?.alterada).toBe(true)
    })

    it('escopo: Adm le qualquer unidade, conselheiro so as suas (404), instrutor 403; filtro invalido 400', async () => {
      const c = await cenario()
      const outra = await criarUnidade({ clubeId: c.clube.id })
      const mes = diasAtras(0).slice(0, 7)
      const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const instrutor = await criarAcesso({ clubeId: c.clube.id, papel: 'INSTRUTOR' })
      expect((await api.get(`/api/reunioes?unidadeId=${outra.id}&mes=${mes}`, adm.autorizacao)).status).toBe(200)
      const alheia = await api.get(`/api/reunioes?unidadeId=${outra.id}&mes=${mes}`, c.acesso.autorizacao)
      expect(alheia.status).toBe(404)
      expect(alheia.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      expect((await api.get(`/api/reunioes?unidadeId=${c.unidade.id}&mes=${mes}`, instrutor.autorizacao)).status).toBe(403)
      expect((await api.get('/api/reunioes?unidadeId=x&mes=2026-13', c.acesso.autorizacao)).status).toBe(400)
    })
  })

  describe('GET /api/reunioes/:id', () => {
    it('detalhe: cabecalho, chamada por nome com pontos, totais, registradaPor e sem album', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({
        unidadeId: c.unidade.id, data: diasAtras(2), horario: '15:00', local: 'Igreja', observacoes: 'Obs',
        registradaPorId: c.acesso.usuario.id,
        chamada: [
          { dbvId: c.bia.id, situacao: 'ATRASADO', uniforme: true },
          { dbvId: c.ana.id, situacao: 'PRESENTE', biblia: true },
          { dbvId: c.caio.id, situacao: 'FALTA' },
        ],
      })
      await criarLancamento({ clubeId: c.clube.id, dbvId: c.ana.id, pontos: 15, data: diasAtras(2), origemTipo: 'CHAMADA', origemId: `${reuniao.id}:${c.ana.id}` })
      await criarLancamento({ clubeId: c.clube.id, dbvId: c.ana.id, pontos: 9, data: diasAtras(2), origemTipo: 'CHAMADA', origemId: `${reuniao.id}:${c.ana.id}`, estornado: true })
      await criarLancamento({ clubeId: c.clube.id, dbvId: c.caio.id, pontos: -4, data: diasAtras(2), origemTipo: 'CHAMADA', origemId: `${reuniao.id}:${c.caio.id}` })

      const resposta = await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)
      expect(resposta.status).toBe(200)
      const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(resposta))
      expect(detalhe).toMatchObject({
        id: reuniao.id, unidade: { id: c.unidade.id, nome: c.unidade.nome }, data: diasAtras(2), horario: '15:00',
        local: 'Igreja', observacoes: 'Obs', registradaPor: { nome: c.acesso.usuario.nome }, alterada: null, album: null, podeEditar: true,
        totais: { presentes: 2, total: 3, atrasos: 1, uniformes: 1, biblias: 1, pontos: 11 },
      })
      expect(detalhe.cabecalhoVersao).toBe(reuniao.cabecalhoVersao.toISOString())
      expect(detalhe.chamada.map((l) => [l.nome, l.pontos])).toEqual([['Ana Souza', 15], ['Bia Lima', 0], ['Caio Reis', -4]])
      expect(detalhe.chamada[0]).toMatchObject({ dbvId: c.ana.id, nomePublico: 'Ana', situacao: 'PRESENTE', biblia: true })
    })

    it('alterada traz o ultimo autor e se algum foi conflito de sincronizacao', async () => {
      const c = await cenario()
      const outro = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(1), chamada: [{ dbvId: c.ana.id }] })
      const base = { clubeId: c.clube.id, reuniaoId: reuniao.id, dbvId: c.ana.id, antes: {}, depois: {} }
      await prismaDeTeste().chamadaAlteracao.create({ data: { ...base, origem: 'CONFLITO_SYNC', alteradaPorId: c.acesso.usuario.id, alteradaEm: new Date(Date.now() - 5000) } })
      await prismaDeTeste().chamadaAlteracao.create({ data: { ...base, origem: 'EDICAO', alteradaPorId: outro.usuario.id } })
      const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)))
      expect(detalhe.alterada).toMatchObject({ por: outro.usuario.nome, conflito: true })
    })

    it('album: total de fotos ativas e ate 4 miniaturas por URL assinada', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(1), chamada: [{ dbvId: c.ana.id }] })
      const album = await criarAlbum({ unidadeId: c.unidade.id, data: diasAtras(1), reuniaoId: reuniao.id })
      for (let i = 0; i < 5; i++) await criarFoto({ albumId: album.id })
      await criarFoto({ albumId: album.id, removida: true })
      const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)))
      expect(detalhe.album).toMatchObject({ id: album.id, totalFotos: 5 })
      expect(detalhe.album?.miniaturas).toHaveLength(4)
      for (const url of detalhe.album?.miniaturas ?? []) expect(url).toMatch(/^\/api\/arquivos\/[0-9a-f-]{36}\?c=.+&v=miniatura&exp=\d+&sig=.+/)
    })

    it('podeEditar: conselheiro so ate 30 dias depois da data; Adm sempre', async () => {
      const c = await cenario()
      const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const velha = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(45), chamada: [{ dbvId: c.ana.id }] })
      const doConselheiro = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${velha.id}`, c.acesso.autorizacao)))
      const doAdm = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${velha.id}`, adm.autorizacao)))
      expect(doConselheiro.podeEditar).toBe(false)
      expect(doAdm.podeEditar).toBe(true)
      const limite = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(30) })
      const noLimite = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${limite.id}`, c.acesso.autorizacao)))
      expect(noLimite.podeEditar).toBe(true)
    })

    it('404: inexistente, de unidade fora do escopo do conselheiro; 403 instrutor; 400 id malformado', async () => {
      const c = await cenario()
      const outra = await criarUnidade({ clubeId: c.clube.id })
      const alheia = await criarReuniao({ unidadeId: outra.id, data: diasAtras(1) })
      const instrutor = await criarAcesso({ clubeId: c.clube.id, papel: 'INSTRUTOR' })
      const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      expect((await api.get(`/api/reunioes/${alheia.id}`, c.acesso.autorizacao)).status).toBe(404)
      expect((await api.get(`/api/reunioes/${randomUUID()}`, c.acesso.autorizacao)).status).toBe(404)
      expect((await api.get(`/api/reunioes/${alheia.id}`, instrutor.autorizacao)).status).toBe(403)
      expect((await api.get(`/api/reunioes/${alheia.id}`, adm.autorizacao)).status).toBe(200)
      expect((await api.get('/api/reunioes/abc', c.acesso.autorizacao)).status).toBe(400)
    })

    describe('substituicao (R1)', () => {
      async function nomeDeQuemGerou(criadoPorId: string): Promise<string> {
        return (await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: criadoPorId } })).nome
      }

      it('chamada lancada pelo usuario de substituicao: autor sem marca, semConta, geradoPor e lancou', async () => {
        const c = await cenario()
        const substituto = await criarUsuarioDeSubstituicao({ nome: 'Joana Visitante' })
        const substituicao = await criarSubstituicao({ clubeId: c.clube.id, tipo: 'CHAMADA', unidadeId: c.unidade.id, substitutoId: substituto.id })
        const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(0), registradaPorId: substituto.id, chamada: [{ dbvId: c.ana.id }] })
        await prismaDeTeste().reuniao.update({ where: { id: reuniao.id }, data: { substituicaoId: substituicao.id } })

        const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)))
        expect(detalhe.substituicao).toEqual({
          autor: 'Joana Visitante',
          semConta: true,
          geradoPor: await nomeDeQuemGerou(substituicao.criadoPorId),
          lancou: true,
        })
      })

      it('titular lancou e o substituto membro alterou: lancou falso e semConta falso', async () => {
        const c = await cenario()
        const membro = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO' })
        const substituicao = await criarSubstituicao({ clubeId: c.clube.id, tipo: 'CHAMADA', unidadeId: c.unidade.id, substitutoId: membro.usuario.id })
        const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(0), registradaPorId: c.acesso.usuario.id, chamada: [{ dbvId: c.ana.id }] })
        await prismaDeTeste().reuniao.update({ where: { id: reuniao.id }, data: { substituicaoId: substituicao.id } })

        const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)))
        expect(detalhe.substituicao).toEqual({
          autor: membro.usuario.nome,
          semConta: false,
          geradoPor: await nomeDeQuemGerou(substituicao.criadoPorId),
          lancou: false,
        })
      })

      it('sem substituicao e null; substituicao de outro clube nao se liga a reuniao', async () => {
        const c = await cenario()
        const reuniao = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(0), registradaPorId: c.acesso.usuario.id })
        const outro = await cenario()
        const alheia = await criarSubstituicao({ clubeId: outro.clube.id, tipo: 'CHAMADA', unidadeId: outro.unidade.id })

        await expect(
          prismaDeTeste().reuniao.update({ where: { id: reuniao.id }, data: { substituicaoId: alheia.id } }),
        ).rejects.toThrow()
        const detalhe = ReuniaoDetalhe.parse(corpo<unknown>(await api.get(`/api/reunioes/${reuniao.id}`, c.acesso.autorizacao)))
        expect(detalhe.substituicao).toBeNull()
      })
    })
  })

  describe('GET /api/unidades/:id/frequencia', () => {
    it('grade das ultimas N reunioes (da mais antiga a mais recente), marcas P/A/F/J, null sem linha e percentual', async () => {
      const c = await cenario()
      const r1 = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(21), chamada: [{ dbvId: c.ana.id, situacao: 'PRESENTE' }, { dbvId: c.bia.id, situacao: 'FALTA' }] })
      const r2 = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(14), chamada: [{ dbvId: c.ana.id, situacao: 'ATRASADO' }, { dbvId: c.bia.id, situacao: 'FALTA_JUSTIFICADA' }] })
      const r3 = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(7), chamada: [{ dbvId: c.ana.id, situacao: 'FALTA' }, { dbvId: c.bia.id, situacao: 'PRESENTE' }] })
      const antiga = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(60), chamada: [{ dbvId: c.ana.id }] })
      const inativo = await criarDbv({ clubeId: c.clube.id, nome: 'Zeca Inativo', ativo: false })
      await criarMembro({ dbvId: inativo.id, unidadeId: c.unidade.id, inicio: '2026-01-01' })

      const resposta = await api.get(`/api/unidades/${c.unidade.id}/frequencia?ultimas=3`, c.acesso.autorizacao)
      expect(resposta.status).toBe(200)
      const grade = GradeFrequenciaSaida.parse(corpo<unknown>(resposta))
      expect(grade.reunioes.map((r) => r.id)).toEqual([r1.id, r2.id, r3.id])
      expect(grade.reunioes.map((r) => r.id)).not.toContain(antiga.id)
      expect(grade.linhas.map((l) => l.nome)).toEqual(['Ana Souza', 'Bia Lima', 'Caio Reis'])
      expect(grade.linhas[0]).toMatchObject({ dbvId: c.ana.id, marcas: ['P', 'A', 'F'], percentual: 67 })
      expect(grade.linhas[1]).toMatchObject({ marcas: ['F', 'J', 'P'], percentual: 33 })
      expect(grade.linhas[2]).toMatchObject({ marcas: [null, null, null], percentual: null })
    })

    it('padrao de 8 reunioes; ultimas fora de 1..20 da 400', async () => {
      const c = await cenario()
      for (let i = 0; i < 10; i++) await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(i * 7 + 1), chamada: [{ dbvId: c.ana.id }] })
      const grade = GradeFrequenciaSaida.parse(corpo<unknown>(await api.get(`/api/unidades/${c.unidade.id}/frequencia`, c.acesso.autorizacao)))
      expect(grade.reunioes).toHaveLength(8)
      expect((await api.get(`/api/unidades/${c.unidade.id}/frequencia?ultimas=21`, c.acesso.autorizacao)).status).toBe(400)
    })

    it('escopo: Adm qualquer unidade; conselheiro de outra 404; instrutor 403', async () => {
      const c = await cenario()
      const outra = await criarUnidade({ clubeId: c.clube.id })
      const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
      const instrutor = await criarAcesso({ clubeId: c.clube.id, papel: 'INSTRUTOR' })
      expect((await api.get(`/api/unidades/${outra.id}/frequencia`, adm.autorizacao)).status).toBe(200)
      expect((await api.get(`/api/unidades/${outra.id}/frequencia`, c.acesso.autorizacao)).status).toBe(404)
      expect((await api.get(`/api/unidades/${c.unidade.id}/frequencia`, instrutor.autorizacao)).status).toBe(403)
    })
  })

  describe('GET /api/unidades/:id/membros: frequencia do mes corrente (E13)', () => {
    it('arredonda sobre as linhas do mes corrente; sem linha no mes fica null', async () => {
      const c = await cenario()
      await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(0), chamada: [{ dbvId: c.ana.id, situacao: 'PRESENTE' }, { dbvId: c.bia.id, situacao: 'FALTA' }] })
      // mes passado nao entra: se entrasse, Ana cairia para 50%
      await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(40), chamada: [{ dbvId: c.ana.id, situacao: 'FALTA' }] })
      const resposta = await api.get(`/api/unidades/${c.unidade.id}/membros`, c.acesso.autorizacao)
      expect(resposta.status).toBe(200)
      const membros = MembroSaida.array().parse(corpo<unknown>(resposta))
      const porNome = (nome: string) => membros.find((m) => m.nome === nome)?.frequencia
      expect(porNome('Ana Souza')).toBe(100)
      expect(porNome('Bia Lima')).toBe(0)
      expect(porNome('Caio Reis')).toBeNull()
    })
  })
})
