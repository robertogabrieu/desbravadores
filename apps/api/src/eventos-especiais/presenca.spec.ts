import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { ConclusaoSaida, PresencaDoEventoResposta, PresencaDoEventoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarEvento,
  criarMembro,
  criarPresencaEvento,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Lista = z.infer<typeof PresencaDoEventoSaida>
type Marcada = z.infer<typeof PresencaDoEventoResposta>
type Conclusao = z.infer<typeof ConclusaoSaida>

/** Hoje, para todos os testes: 05/10/2026 (meio-dia em São Paulo). */
const AGORA = '2026-10-05T15:00:00Z'
const DIA_DO_EVENTO = '2026-10-03'
const DIA_FUTURO = '2026-10-09'

describe('lista de presença do evento especial', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  beforeEach(() => congelarRelogio(AGORA))
  afterEach(() => descongelarRelogio())

  async function cenario(opcoes: { inicio?: string; participacao?: number; uniforme?: number; concluidaEm?: Date } = {}) {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const evento = await criarEvento({
      clubeId: clube.id,
      tipo: 'EVENTO_ESPECIAL',
      inicio: opcoes.inicio ?? DIA_DO_EVENTO,
      uniforme: 'GALA',
      pontosParticipacao: opcoes.participacao ?? 20,
      pontosUniforme: opcoes.uniforme ?? 10,
      listaConcluidaEm: opcoes.concluidaEm,
    })
    return { clube, adm, evento, url: `/api/calendario/eventos/${evento.id}/presenca` }
  }

  async function dbvNaUnidade(clubeId: string, unidadeId: string | null, nome: string) {
    const dbv = await criarDbv({ clubeId, nome })
    if (unidadeId) await criarMembro({ dbvId: dbv.id, unidadeId, inicio: '2026-02-01' })
    return dbv
  }

  /** Três DBVs na mesma unidade, para os casos que não dependem da separação por unidade. */
  async function comTresDbvs(opcoes: Parameters<typeof cenario>[0] = {}) {
    const base = await cenario(opcoes)
    const unidade = await criarUnidade({ clubeId: base.clube.id, nome: 'Alfa' })
    const ana = await dbvNaUnidade(base.clube.id, unidade.id, 'Ana Costa')
    const bia = await dbvNaUnidade(base.clube.id, unidade.id, 'Bia Souza')
    const caio = await dbvNaUnidade(base.clube.id, unidade.id, 'Caio Alves')
    return { ...base, unidade, ana, bia, caio }
  }

  const ler = async (url: string, autorizacao: string) => corpo<Lista>(await api.get(url, autorizacao).expect(200))
  const marcar = (url: string, autorizacao: string, marcas: object[]) => api.put(url, autorizacao, { marcas })
  const linhasGravadas = (eventoId: string) =>
    prismaDeTeste().presencaEventoEspecial.findMany({ where: { eventoId }, orderBy: { dbvId: 'asc' } })
  const lancamentosDo = (clubeId: string) => prismaDeTeste().lancamentoPontos.findMany({ where: { clubeId }, include: { criterio: true } })

  describe('GET: quem está na lista', () => {
    it('agrupa por unidade em ordem alfabética, com "Sem unidade" por último, e ninguém marcado', async () => {
      const { clube, adm, url } = await cenario()
      const zulu = await criarUnidade({ clubeId: clube.id, nome: 'Zulu' })
      const alfa = await criarUnidade({ clubeId: clube.id, nome: 'Alfa' })
      const dbvZ = await dbvNaUnidade(clube.id, zulu.id, 'Zeca Zulu')
      const dbvA2 = await dbvNaUnidade(clube.id, alfa.id, 'Beto Alfa')
      const dbvA1 = await dbvNaUnidade(clube.id, alfa.id, 'Abel Alfa')
      const solto = await dbvNaUnidade(clube.id, null, 'Solto Sozinho')

      const lista = await ler(url, adm.autorizacao)

      expect(lista.unidades.map((u) => [u.unidadeId, u.nome])).toEqual([
        [alfa.id, 'Alfa'],
        [zulu.id, 'Zulu'],
        [null, 'Sem unidade'],
      ])
      expect(lista.unidades.map((u) => u.linhas.map((l) => l.dbvId))).toEqual([[dbvA1.id, dbvA2.id], [dbvZ.id], [solto.id]])
      expect(lista.unidades[0]?.linhas[0]).toEqual({ dbvId: dbvA1.id, nome: 'Abel Alfa', foi: false, comUniforme: false })
      expect(lista.resumo).toEqual({ foram: 0, uniformizados: 0, total: 4 })
      expect(lista.aberta).toBe(true)
      expect(lista.listaConcluidaEm).toBeNull()
    })

    it('mostra as marcas já gravadas e conta quem foi e quem foi de gala', async () => {
      const { clube, adm, evento, url, ana, bia } = await comTresDbvs()
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: ana.id, foi: true, comUniforme: true })
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: bia.id, foi: true })

      const lista = await ler(url, adm.autorizacao)

      expect(lista.unidades[0]?.linhas.map((l) => [l.nome, l.foi, l.comUniforme])).toEqual([
        ['Ana Costa', true, true],
        ['Bia Souza', true, false],
        ['Caio Alves', false, false],
      ])
      expect(lista.resumo).toEqual({ foram: 2, uniformizados: 1, total: 3 })
    })

    it('só entra quem está no ranking do mês e já era do clube no dia: sem inativo, sem Líder, sem quem entrou depois', async () => {
      const { clube, adm, url, unidade, ana } = await comTresDbvs()
      const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Inativo')
      await prismaDeTeste().desbravador.update({ where: { id: inativo.id }, data: { ativo: false } })
      const lider = await criarDbv({ clubeId: clube.id, nome: 'Lider', tipo: 'LIDER' })
      const diretoria = await criarDbv({ clubeId: clube.id, nome: 'Diretoria Pura', tipo: 'DIRETORIA' })
      const tardio = await dbvNaUnidade(clube.id, unidade.id, 'Tardio')
      await prismaDeTeste().desbravador.update({ where: { id: tardio.id }, data: { entradaEm: new Date('2026-10-04T00:00:00Z') } })
      const noDia = await dbvNaUnidade(clube.id, unidade.id, 'No Dia')
      await prismaDeTeste().desbravador.update({ where: { id: noDia.id }, data: { entradaEm: new Date(`${DIA_DO_EVENTO}T00:00:00Z`) } })

      const lista = await ler(url, adm.autorizacao)

      const ids = lista.unidades.flatMap((u) => u.linhas.map((l) => l.dbvId))
      expect(ids).toContain(ana.id)
      expect(ids).toContain(noDia.id)
      expect(ids).not.toContain(inativo.id)
      expect(ids).not.toContain(lider.id)
      expect(ids).not.toContain(diretoria.id)
      expect(ids).not.toContain(tardio.id)
      expect(lista.resumo.total).toBe(4)
    })

    it('a Diretoria que veio de DBV aparece na unidade anterior, não na que tem hoje', async () => {
      const { clube, adm, url, unidade } = await comTresDbvs()
      const outra = await criarUnidade({ clubeId: clube.id, nome: 'Omega' })
      const diretoria = await dbvNaUnidade(clube.id, outra.id, 'Dani Diretoria')
      await prismaDeTeste().desbravador.update({
        where: { id: diretoria.id },
        data: { tipo: 'DIRETORIA', diretoriaVeioDeDbv: true, diretoriaDesde: new Date('2026-11-02T00:00:00Z'), diretoriaUnidadeAnteriorId: unidade.id },
      })

      const lista = await ler(url, adm.autorizacao)

      expect(lista.unidades.map((u) => u.nome)).toEqual(['Alfa'])
      expect(lista.unidades[0]?.linhas.map((l) => l.nome)).toContain('Dani Diretoria')
    })

    it('linha guardada de quem saiu do ranking não entra na lista nem na conta', async () => {
      const { clube, adm, evento, url, ana, unidade } = await comTresDbvs()
      const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Inativo')
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: inativo.id, foi: true, comUniforme: true })
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: ana.id, foi: true })
      await prismaDeTeste().desbravador.update({ where: { id: inativo.id }, data: { ativo: false } })

      const lista = await ler(url, adm.autorizacao)

      expect(lista.resumo).toEqual({ foram: 1, uniformizados: 0, total: 3 })
      expect(lista.unidades.flatMap((u) => u.linhas.map((l) => l.dbvId))).not.toContain(inativo.id)
    })

    it('antes do dia do evento a lista não está aberta; no dia, está', async () => {
      const futuro = await comTresDbvs({ inicio: DIA_FUTURO })
      const hoje = await comTresDbvs({ inicio: '2026-10-05' })

      expect((await ler(futuro.url, futuro.adm.autorizacao)).aberta).toBe(false)
      expect((await ler(hoje.url, hoje.adm.autorizacao)).aberta).toBe(true)
    })

    it('o dia vale no fuso do clube: 01:00 UTC de 06/10 ainda é 05/10 em São Paulo', async () => {
      descongelarRelogio()
      congelarRelogio('2026-10-06T01:00:00Z')
      const { adm, url } = await cenario({ inicio: '2026-10-06' })

      expect((await ler(url, adm.autorizacao)).aberta).toBe(false)
    })

    it('mostra o carimbo de lista concluída', async () => {
      const concluidaEm = new Date('2026-10-04T13:00:00Z')
      const { adm, url } = await comTresDbvs({ concluidaEm })

      expect((await ler(url, adm.autorizacao)).listaConcluidaEm).toBe(concluidaEm.toISOString())
    })
  })

  describe('quem pode e o que existe', () => {
    it('conselheiro e instrutor recebem 403 nas três rotas, antes de qualquer 404', async () => {
      const { clube, url } = await comTresDbvs()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const inexistente = `/api/calendario/eventos/${randomUUID()}/presenca`

      for (const acesso of [conselheiro, instrutor]) {
        for (const alvo of [url, inexistente]) {
          expect((await api.get(alvo, acesso.autorizacao)).status).toBe(403)
          expect((await marcar(alvo, acesso.autorizacao, [{ dbvId: randomUUID(), foi: true }])).status).toBe(403)
          expect((await api.post(`${alvo}/concluir`, acesso.autorizacao, { foram: 0, uniformizados: 0 })).status).toBe(403)
        }
      }
    })

    it('sem login, 401', async () => {
      const { url } = await cenario()
      expect((await api.get(url, '')).status).toBe(401)
    })

    it('evento apagado, de outro tipo ou que não existe: 404 nas três rotas', async () => {
      const { clube, adm } = await cenario()
      const apagado = await criarEvento({ clubeId: clube.id, tipo: 'EVENTO_ESPECIAL', inicio: DIA_DO_EVENTO, uniforme: 'GALA', pontosParticipacao: 1, pontosUniforme: 1 })
      await prismaDeTeste().eventoCalendario.update({ where: { id: apagado.id }, data: { removidoEm: new Date() } })
      const outroTipo = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: DIA_DO_EVENTO })

      for (const id of [apagado.id, outroTipo.id, randomUUID()]) {
        const alvo = `/api/calendario/eventos/${id}/presenca`
        expect((await api.get(alvo, adm.autorizacao)).status).toBe(404)
        expect((await marcar(alvo, adm.autorizacao, [{ dbvId: randomUUID(), foi: true }])).status).toBe(404)
        expect((await api.post(`${alvo}/concluir`, adm.autorizacao, { foram: 0, uniformizados: 0 })).status).toBe(404)
      }
    })

    it('id malformado: 400 de validação', async () => {
      const { adm } = await cenario()
      const resposta = await api.get('/api/calendario/eventos/nao-e-uuid/presenca', adm.autorizacao)
      expect(resposta.status).toBe(400)
      expect(corpo<{ codigo: string }>(resposta).codigo).toBe('VALIDACAO')
    })

    testarIsolamento({
      titulo: 'GET /calendario/eventos/:id/presenca',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const alvo = await criarEvento({ clubeId: clubeB.id, tipo: 'EVENTO_ESPECIAL', inicio: DIA_DO_EVENTO, uniforme: 'GALA', pontosParticipacao: 1, pontosUniforme: 1 })
        return { metodo: 'get', caminho: `/api/calendario/eventos/${alvo.id}/presenca` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PUT /calendario/eventos/:id/presenca',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const alvo = await criarEvento({ clubeId: clubeB.id, tipo: 'EVENTO_ESPECIAL', inicio: DIA_DO_EVENTO, uniforme: 'GALA', pontosParticipacao: 1, pontosUniforme: 1 })
        const dbv = await criarDbv({ clubeId: clubeB.id })
        return {
          metodo: 'put',
          caminho: `/api/calendario/eventos/${alvo.id}/presenca`,
          corpo: { marcas: [{ dbvId: dbv.id, foi: true }] },
          conferirIntacto: async () => expect(await linhasGravadas(alvo.id)).toHaveLength(0),
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /calendario/eventos/:id/presenca/concluir',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const alvo = await criarEvento({ clubeId: clubeB.id, tipo: 'EVENTO_ESPECIAL', inicio: DIA_DO_EVENTO, uniforme: 'GALA', pontosParticipacao: 1, pontosUniforme: 1 })
        return {
          metodo: 'post',
          caminho: `/api/calendario/eventos/${alvo.id}/presenca/concluir`,
          corpo: { foram: 0, uniformizados: 0 },
          conferirIntacto: async () => {
            const depois = await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: alvo.id } })
            expect(depois.listaConcluidaEm).toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })

  describe('PUT: marcas', () => {
    it('grava foi e comUniforme e devolve as linhas autoritativas das pessoas tocadas, o resumo e os avisos', async () => {
      const { adm, evento, url, ana, bia } = await comTresDbvs()

      const resposta = await marcar(url, adm.autorizacao, [
        { dbvId: ana.id, foi: true, comUniforme: true },
        { dbvId: bia.id, foi: true },
      ])

      expect(resposta.status).toBe(200)
      const saida = corpo<Marcada>(resposta)
      expect(saida.linhas.map((l) => [l.nome, l.foi, l.comUniforme])).toEqual([
        ['Ana Costa', true, true],
        ['Bia Souza', true, false],
      ])
      expect(saida.resumo).toEqual({ foram: 2, uniformizados: 1, total: 3 })
      expect(saida.avisos).toEqual([])
      expect(saida.listaConcluidaEm).toBeNull()
      const gravadas = await linhasGravadas(evento.id)
      expect(gravadas.map((g) => [g.dbvId, g.foi, g.comUniforme]).sort()).toEqual([[ana.id, true, true], [bia.id, true, false]].sort())
    })

    it('uma marca de uniforme sozinha vale para quem já foi, e comUniforme omitido não mexe no uniforme', async () => {
      const { adm, evento, url, ana } = await comTresDbvs()
      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true }]).expect(200)

      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, comUniforme: true }]).expect(200)
      expect((await linhasGravadas(evento.id))[0]).toMatchObject({ foi: true, comUniforme: true })

      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true }]).expect(200)
      expect((await linhasGravadas(evento.id))[0]).toMatchObject({ foi: true, comUniforme: true })
    })

    it('recusa comUniforme para quem não foi, sem gravar nada', async () => {
      const { adm, evento, url, ana, bia } = await comTresDbvs()

      const semFoi = await marcar(url, adm.autorizacao, [{ dbvId: ana.id, comUniforme: true }])
      const comFoiFalso = await marcar(url, adm.autorizacao, [{ dbvId: bia.id, foi: false, comUniforme: true }])

      expect(semFoi.status).toBe(400)
      expect(corpo<{ codigo: string }>(semFoi).codigo).toBe('VALIDACAO')
      expect(comFoiFalso.status).toBe(400)
      expect(await linhasGravadas(evento.id)).toHaveLength(0)
    })

    it('recusa corpo sem marcas, marca sem foi nem comUniforme e dbvId malformado', async () => {
      const { adm, url, ana } = await comTresDbvs()

      expect((await marcar(url, adm.autorizacao, [])).status).toBe(400)
      expect((await marcar(url, adm.autorizacao, [{ dbvId: ana.id }])).status).toBe(400)
      expect((await marcar(url, adm.autorizacao, [{ dbvId: 'x', foi: true }])).status).toBe(400)
    })

    it('desmarcar quem foi mantém a linha, com foi falso e o uniforme zerado', async () => {
      const { clube, adm, evento, url, ana } = await comTresDbvs()
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: ana.id, foi: true, comUniforme: true })

      const resposta = await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: false }])

      expect(resposta.status).toBe(200)
      expect(corpo<Marcada>(resposta).linhas).toEqual([{ dbvId: ana.id, nome: 'Ana Costa', foi: false, comUniforme: false }])
      expect(await linhasGravadas(evento.id)).toEqual([expect.objectContaining({ dbvId: ana.id, foi: false, comUniforme: false })])
    })

    it('o lote é tudo ou nada: uma marca inválida derruba as outras', async () => {
      const { adm, evento, url, ana, bia } = await comTresDbvs()

      const resposta = await marcar(url, adm.autorizacao, [
        { dbvId: ana.id, foi: true },
        { dbvId: bia.id, comUniforme: true },
      ])

      expect(resposta.status).toBe(400)
      expect(await linhasGravadas(evento.id)).toHaveLength(0)
    })

    it('antes do dia do evento a gravação é recusada', async () => {
      const { adm, evento, url, ana } = await comTresDbvs({ inicio: DIA_FUTURO })

      const resposta = await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true }])

      expect(resposta.status).toBe(422)
      expect(corpo<{ codigo: string }>(resposta).codigo).toBe('REGRA')
      expect(await linhasGravadas(evento.id)).toHaveLength(0)
    })

    it('aviso só para quem existe no clube e está fora da lista; id desconhecido ou de outro clube é ignorado, sem eco de nome', async () => {
      const { clube, adm, evento, url, ana, unidade } = await comTresDbvs()
      const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Ivo Inativo')
      await prismaDeTeste().desbravador.update({ where: { id: inativo.id }, data: { ativo: false } })
      const doOutroClube = await criarDbv({ clubeId: (await criarClube()).id, nome: 'Estranho Secreto' })

      const resposta = await marcar(url, adm.autorizacao, [
        { dbvId: ana.id, foi: true },
        { dbvId: inativo.id, foi: true },
        { dbvId: doOutroClube.id, foi: true },
        { dbvId: randomUUID(), foi: true },
      ])

      expect(resposta.status).toBe(200)
      const saida = corpo<Marcada>(resposta)
      expect(saida.avisos).toHaveLength(1)
      expect(saida.avisos[0]).toContain('Ivo Inativo')
      expect(JSON.stringify(saida)).not.toContain('Estranho')
      expect(saida.resumo).toEqual({ foram: 1, uniformizados: 0, total: 3 })
      const gravadas = await linhasGravadas(evento.id)
      expect(gravadas.map((g) => g.dbvId).sort()).toEqual([ana.id, inativo.id].sort())
    })

    it('com a lista ainda não concluída, nenhum lançamento de pontos é criado', async () => {
      const { clube, adm, url, ana, bia } = await comTresDbvs()

      await marcar(url, adm.autorizacao, [
        { dbvId: ana.id, foi: true, comUniforme: true },
        { dbvId: bia.id, foi: true },
      ]).expect(200)

      expect(await lancamentosDo(clube.id)).toHaveLength(0)
    })

    it('dois toques ao mesmo tempo na mesma pessoa terminam com uma marca só e sem esgotar o pool de conexões', async () => {
      const { adm, evento, url, ana } = await comTresDbvs()

      const respostas = await Promise.all(
        Array.from({ length: 14 }, (_, i) => marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: i % 2 === 0 }])),
      )

      expect(respostas.map((r) => r.status)).toEqual(Array(14).fill(200))
      const gravadas = await linhasGravadas(evento.id)
      expect(gravadas).toHaveLength(1)
      const ultima = (await ler(url, adm.autorizacao)).unidades[0]?.linhas.find((l) => l.dbvId === ana.id)
      expect(ultima).toMatchObject({ foi: gravadas[0]?.foi, comUniforme: false })
    }, 60_000)
  })

  describe('POST concluir', () => {
    const concluir = (url: string, autorizacao: string, totais: { foram: number; uniformizados: number }) =>
      api.post(`${url}/concluir`, autorizacao, totais)

    async function comMarcas(opcoes: Parameters<typeof cenario>[0] = {}) {
      const base = await comTresDbvs(opcoes)
      await marcar(base.url, base.adm.autorizacao, [
        { dbvId: base.ana.id, foi: true, comUniforme: true },
        { dbvId: base.bia.id, foi: true },
      ]).expect(200)
      return base
    }

    it('recusa quando os totais que o Adm viu divergem dos do servidor, e nada é concluído', async () => {
      const { clube, adm, evento, url } = await comMarcas()

      const resposta = await concluir(url, adm.autorizacao, { foram: 3, uniformizados: 1 })

      expect(resposta.status).toBe(422)
      expect(corpo<{ codigo: string; mensagem: string }>(resposta)).toMatchObject({ codigo: 'REGRA' })
      expect(corpo<{ mensagem: string }>(resposta).mensagem).toContain('A lista mudou')
      expect((await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: evento.id } })).listaConcluidaEm).toBeNull()
      expect(await lancamentosDo(clube.id)).toHaveLength(0)
    })

    it('recusa concluir antes do dia do evento', async () => {
      const { adm, url } = await comTresDbvs({ inicio: DIA_FUTURO })

      const resposta = await concluir(url, adm.autorizacao, { foram: 0, uniformizados: 0 })

      expect(resposta.status).toBe(422)
      expect(corpo<{ codigo: string }>(resposta).codigo).toBe('REGRA')
    })

    it('lança participação para quem foi e uniforme para quem foi de gala, com o valor do evento, na data de início', async () => {
      const { clube, adm, evento, url, ana, bia, caio } = await comMarcas()

      const resposta = await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 })

      expect(resposta.status).toBe(200)
      const saida = corpo<Conclusao>(resposta)
      expect(saida).toMatchObject({ foram: 2, uniformizados: 1, avisos: [] })
      const lancamentos = await lancamentosDo(clube.id)
      expect(lancamentos.map((l) => [l.dbvId, l.pontos, l.criterio?.gatilho]).sort()).toEqual(
        [
          [ana.id, 20, 'EVENTO_ESPECIAL_PARTICIPACAO'],
          [ana.id, 10, 'EVENTO_ESPECIAL_UNIFORME'],
          [bia.id, 20, 'EVENTO_ESPECIAL_PARTICIPACAO'],
        ].sort(),
      )
      for (const l of lancamentos) {
        expect(l).toMatchObject({ origemTipo: 'EVENTO_ESPECIAL', estornadoEm: null })
        expect(l.origemId).toBe(`${evento.id}:${l.dbvId}`)
        expect(l.data.toISOString().slice(0, 10)).toBe(DIA_DO_EVENTO)
      }
      expect(lancamentos.map((l) => l.dbvId)).not.toContain(caio.id)
      const depois = await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: evento.id } })
      expect(depois.listaConcluidaEm?.toISOString()).toBe(saida.listaConcluidaEm)
    })

    it('cria os dois critérios sob demanda, uma vez, no clube que já existia', async () => {
      const { clube, adm, url } = await comMarcas()
      const gatilhos = { in: ['EVENTO_ESPECIAL_PARTICIPACAO', 'EVENTO_ESPECIAL_UNIFORME'] as ('EVENTO_ESPECIAL_PARTICIPACAO' | 'EVENTO_ESPECIAL_UNIFORME')[] }
      expect(await prismaDeTeste().criterioRanking.count({ where: { clubeId: clube.id, gatilho: gatilhos } })).toBe(0)

      await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200)
      await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200)

      expect(await prismaDeTeste().criterioRanking.count({ where: { clubeId: clube.id, gatilho: gatilhos } })).toBe(2)
    })

    it('valor 0 não gera lançamento, e concluir sem ninguém conclui sem lançar nada', async () => {
      const semUniforme = await comMarcas({ uniforme: 0 })
      const vazio = await comTresDbvs()

      await concluir(semUniforme.url, semUniforme.adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200)
      const resposta = await concluir(vazio.url, vazio.adm.autorizacao, { foram: 0, uniformizados: 0 })

      expect((await lancamentosDo(semUniforme.clube.id)).map((l) => l.pontos)).toEqual([20, 20])
      expect(resposta.status).toBe(200)
      expect(corpo<Conclusao>(resposta).listaConcluidaEm).toEqual(expect.any(String))
      expect(await lancamentosDo(vazio.clube.id)).toHaveLength(0)
    })

    it('só o roster pontua: linha guardada de quem saiu do ranking vira aviso e não entra na conta', async () => {
      const { clube, adm, evento, url, unidade } = await comMarcas()
      const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Ivo Inativo')
      await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: inativo.id, foi: true, comUniforme: true })
      await prismaDeTeste().desbravador.update({ where: { id: inativo.id }, data: { ativo: false } })

      const resposta = await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 })

      expect(resposta.status).toBe(200)
      const saida = corpo<Conclusao>(resposta)
      expect(saida.avisos).toHaveLength(1)
      expect(saida.avisos[0]).toContain('Ivo Inativo')
      expect((await lancamentosDo(clube.id)).map((l) => l.dbvId)).not.toContain(inativo.id)
    })

    it('concluir de novo não duplica pontos nem regrava o carimbo', async () => {
      const { clube, adm, evento, url } = await comMarcas()
      const primeira = corpo<Conclusao>(await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200))

      const segunda = corpo<Conclusao>(await concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200))

      expect(segunda.listaConcluidaEm).toBe(primeira.listaConcluidaEm)
      expect(await lancamentosDo(clube.id)).toHaveLength(3)
      const depois = await prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id: evento.id } })
      expect(depois.listaConcluidaEm?.toISOString()).toBe(primeira.listaConcluidaEm)
    })

    it('duas conclusões ao mesmo tempo lançam uma vez só', async () => {
      const { clube, adm, url } = await comMarcas()

      const respostas = await Promise.all([1, 2, 3].map(() => concluir(url, adm.autorizacao, { foram: 2, uniformizados: 1 })))

      expect(respostas.map((r) => r.status)).toEqual([200, 200, 200])
      expect(await lancamentosDo(clube.id)).toHaveLength(3)
    })
  })

  describe('depois de concluída', () => {
    async function concluida() {
      const base = await comTresDbvs()
      await marcar(base.url, base.adm.autorizacao, [
        { dbvId: base.ana.id, foi: true, comUniforme: true },
        { dbvId: base.bia.id, foi: true },
      ]).expect(200)
      await api.post(`${base.url}/concluir`, base.adm.autorizacao, { foram: 2, uniformizados: 1 }).expect(200)
      return base
    }
    const ativosDe = async (clubeId: string, dbvId: string) =>
      (await lancamentosDo(clubeId)).filter((l) => l.dbvId === dbvId && l.estornadoEm === null).map((l) => l.pontos).sort()
    const atividadesDo = (clubeId: string) => prismaDeTeste().atividade.findMany({ where: { clubeId }, orderBy: { criadaEm: 'asc' } })

    it('tirar o uniforme de quem foi estorna só os pontos do uniforme, na hora, e grava a alteração em Atividade', async () => {
      const { clube, adm, evento, url, ana } = await concluida()
      expect(await atividadesDo(clube.id)).toHaveLength(0)

      const resposta = await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true, comUniforme: false }])

      expect(resposta.status).toBe(200)
      expect(corpo<Marcada>(resposta).listaConcluidaEm).toEqual(expect.any(String))
      expect(await ativosDe(clube.id, ana.id)).toEqual([20])
      expect((await linhasGravadas(evento.id)).find((g) => g.dbvId === ana.id)).toMatchObject({ foi: true, comUniforme: false })
      const atividades = await atividadesDo(clube.id)
      expect(atividades).toHaveLength(1)
      expect(atividades[0]?.descricao).toContain('Ana Costa')
      expect(atividades[0]?.link).toBe(`/adm/calendario/eventos/${evento.id}`)
    })

    it('tirar quem foi estorna tudo dela e mantém a linha; voltar a marcar lança de novo', async () => {
      const { clube, adm, evento, url, ana } = await concluida()

      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: false }]).expect(200)
      expect(await ativosDe(clube.id, ana.id)).toEqual([])
      expect((await linhasGravadas(evento.id)).find((g) => g.dbvId === ana.id)).toMatchObject({ foi: false, comUniforme: false })

      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true }]).expect(200)
      expect(await ativosDe(clube.id, ana.id)).toEqual([20])
      expect(await atividadesDo(clube.id)).toHaveLength(2)
    })

    it('marcar alguém que faltava lança os pontos dele na hora', async () => {
      const { clube, adm, url, caio } = await concluida()

      await marcar(url, adm.autorizacao, [{ dbvId: caio.id, foi: true, comUniforme: true }]).expect(200)

      expect(await ativosDe(clube.id, caio.id)).toEqual([10, 20])
    })

    it('marca repetida, sem mudança, não mexe em pontos nem grava Atividade', async () => {
      const { clube, adm, url, ana } = await concluida()
      const antes = await lancamentosDo(clube.id)

      await marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: true, comUniforme: true }]).expect(200)

      expect(await lancamentosDo(clube.id)).toEqual(antes)
      expect(await atividadesDo(clube.id)).toHaveLength(0)
    })

    it('quem está fora da lista pode ter a linha guardada, mas não pontua', async () => {
      const { clube, adm, url, unidade } = await concluida()
      const inativo = await dbvNaUnidade(clube.id, unidade.id, 'Ivo Inativo')
      await prismaDeTeste().desbravador.update({ where: { id: inativo.id }, data: { ativo: false } })

      const resposta = await marcar(url, adm.autorizacao, [{ dbvId: inativo.id, foi: true }])

      expect(resposta.status).toBe(200)
      expect(corpo<Marcada>(resposta).avisos).toHaveLength(1)
      expect(await ativosDe(clube.id, inativo.id)).toEqual([])
    })

    it('o lote é tudo ou nada também nos pontos: uma marca inválida não deixa a outra estornar nada', async () => {
      const { clube, adm, url, ana, bia } = await concluida()
      const antes = await lancamentosDo(clube.id)

      const resposta = await marcar(url, adm.autorizacao, [
        { dbvId: ana.id, foi: false },
        { dbvId: bia.id, foi: false, comUniforme: true },
      ])

      expect(resposta.status).toBe(400)
      expect(await lancamentosDo(clube.id)).toEqual(antes)
      expect(await atividadesDo(clube.id)).toHaveLength(0)
    })

    it('vários toques ao mesmo tempo depois de concluída deixam os pontos coerentes com a última marca', async () => {
      const { clube, adm, evento, url, ana } = await concluida()

      const respostas = await Promise.all(
        Array.from({ length: 14 }, (_, i) => marcar(url, adm.autorizacao, [{ dbvId: ana.id, foi: i % 2 === 0, comUniforme: false }])),
      )

      expect(respostas.map((r) => r.status)).toEqual(Array(14).fill(200))
      const marca = (await linhasGravadas(evento.id)).find((g) => g.dbvId === ana.id)
      expect(await ativosDe(clube.id, ana.id)).toEqual(marca?.foi ? [20] : [])
    }, 60_000)
  })
})
