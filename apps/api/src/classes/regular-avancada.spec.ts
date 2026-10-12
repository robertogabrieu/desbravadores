import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, type ClasseDetalheSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  credencialDeSubstituicao,
  criarMatricula,
  criarSubstituicao,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Detalhe = z.infer<typeof ClasseDetalheSaida>
type Usuario = { vinculos: { papel: string; classes: { id: string }[] }[] }

describe('regular e avançada andam juntas', () => {
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
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const alvo = (await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })).usuario
    const regular = await classeOficial('Amigo')
    const avancada = await prismaDeTeste().classe.findFirstOrThrow({
      where: { tipo: 'AVANCADA', classeBaseId: regular.id, clubeId: null },
      select: { id: true, nome: true },
    })
    return { clube, adm, alvo, regular, avancada }
  }

  const ordenar = (ids: string[]) => [...ids].sort()
  const classesDoInstrutor = (saida: Usuario) => ordenar(saida.vinculos.find((v) => v.papel === 'INSTRUTOR')?.classes.map((c) => c.id) ?? [])

  describe('delegação de instrutor', () => {
    it('marcar só a regular grava as duas', async () => {
      const { adm, alvo, regular, avancada } = await cenario()
      const saida = corpo<Usuario>(
        await api.post(`/api/usuarios/${alvo.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [regular.id] }).expect(201),
      )
      expect(classesDoInstrutor(saida)).toEqual(ordenar([regular.id, avancada.id]))
    })

    it('marcar só a avançada grava as duas', async () => {
      const { clube, adm, alvo, regular, avancada } = await cenario()
      const vinculo = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const saida = corpo<Usuario>(await api.put(`/api/vinculos/${vinculo.id}`, adm.autorizacao, { classeIds: [avancada.id] }).expect(200))
      expect(classesDoInstrutor(saida)).toEqual(ordenar([regular.id, avancada.id]))
    })

    it('o PUT que tira a regular tira a avançada', async () => {
      const { clube, adm, alvo, regular, avancada } = await cenario()
      const guia = await classeOficial('Guia')
      const vinculo = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id, avancada.id] })
      const saida = corpo<Usuario>(await api.put(`/api/vinculos/${vinculo.id}`, adm.autorizacao, { classeIds: [guia.id] }).expect(200))
      const avancadaDoGuia = await prismaDeTeste().classe.findFirstOrThrow({ where: { tipo: 'AVANCADA', classeBaseId: guia.id }, select: { id: true } })
      expect(classesDoInstrutor(saida)).toEqual(ordenar([guia.id, avancadaDoGuia.id]))
      expect(await prismaDeTeste().vinculoClasse.count({ where: { vinculoId: vinculo.id, classeId: { in: [regular.id, avancada.id] } } })).toBe(0)
    })

    it('classe agrupada não ganha par', async () => {
      const { adm, alvo } = await cenario()
      const agrupada = await prismaDeTeste().classe.findFirstOrThrow({
        where: { trilha: 'AGRUPADAS', tipo: 'REGULAR', clubeId: null },
        select: { id: true },
      })
      const saida = corpo<Usuario>(
        await api.post(`/api/usuarios/${alvo.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [agrupada.id] }).expect(201),
      )
      expect(classesDoInstrutor(saida)).toEqual([agrupada.id])
    })
  })

  describe('quem monta', () => {
    it('na regular, propaga para a avançada pareada do mesmo clube e não mexe em "ativa" nem em outro clube', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      const outro = await criarClube()
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)

      const daAvancada = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
      expect(daAvancada).toMatchObject({ quemMontaCronograma: 'INSTRUTOR', ativa: true })
      const doOutro = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: outro.id, classeId: avancada.id } } })
      expect(doOutro.quemMontaCronograma).toBe('ADM')
    })

    it('avançada sem par (desativada no clube) guarda o próprio "quem monta": a regular não repassa', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)

      const daAvancada = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
      expect(daAvancada).toMatchObject({ quemMontaCronograma: 'ADM', ativa: false })
    })

    it('na avançada, responde 400 com a mensagem e não grava', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      const resposta = await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(400)
      expect(JSON.stringify(resposta.body)).toContain('Altere em Amigo: a avançada segue a regular.')
      expect(regular.id).toBeDefined()
      const linha = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
      expect(linha.quemMontaCronograma).toBe('ADM')
    })
  })

  describe('GET /classes/:id', () => {
    it('da avançada traz o resumo da regular; da regular, regular nulo', async () => {
      const { clube, adm, alvo, regular, avancada } = await cenario()
      const instrutor = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id] })
      expect(instrutor.id).toBeDefined()
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)
      const dbv = await criarDbv({ clubeId: clube.id })
      const desistente = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: regular.id, anoClube: anoCorrente() })
      await criarMatricula({ clubeId: clube.id, dbvId: desistente.id, classeId: regular.id, anoClube: anoCorrente(), status: 'DESISTIU' })

      const detalhe = corpo<Detalhe>(await api.get(`/api/classes/${avancada.id}`, adm.autorizacao).expect(200))
      expect(detalhe.regular).toEqual({
        id: regular.id,
        nome: 'Amigo',
        instrutores: [alvo.nome],
        quemMontaCronograma: 'INSTRUTOR',
        totalAlunos: 1,
      })
      const daRegular = corpo<Detalhe>(await api.get(`/api/classes/${regular.id}`, adm.autorizacao).expect(200))
      expect(daRegular.regular).toBeNull()
    })

    it('classe de outro clube continua 404', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      const classe = await criarClasseDoClube(outro.id)
      await api.get(`/api/classes/${classe.id}`, adm.autorizacao).expect(404)
    })
  })

  describe('GET /classes: quem é o par', () => {
    type Item = { id: string; avancadaPareadaId: string | null; regularDoParId: string | null }
    const pares = async (autorizacao: string) =>
      new Map(corpo<Item[]>(await api.get('/api/classes', autorizacao).expect(200)).map((item) => [item.id, item]))

    it('a regular traz a avançada de menor ordem e a avançada traz a regular; a segunda avançada fica sem par', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      const oficial = await prismaDeTeste().classe.findUniqueOrThrow({ where: { id: avancada.id } })
      const segunda = await prismaDeTeste().classe.create({
        data: { clubeId: clube.id, origem: 'CLUBE', nome: 'Avançada extra', tipo: 'AVANCADA', trilha: 'INDIVIDUAL', classeBaseId: regular.id, ordem: oficial.ordem + 100 },
      })
      const lista = await pares(adm.autorizacao)
      expect(lista.get(regular.id)).toMatchObject({ avancadaPareadaId: avancada.id, regularDoParId: null })
      expect(lista.get(avancada.id)).toMatchObject({ avancadaPareadaId: null, regularDoParId: regular.id })
      expect(lista.get(segunda.id)).toMatchObject({ avancadaPareadaId: null, regularDoParId: null })
      const detalhe = corpo<Item>(await api.get(`/api/classes/${avancada.id}`, adm.autorizacao).expect(200))
      expect(detalhe).toMatchObject({ regularDoParId: regular.id, avancadaPareadaId: null })
    })

    it('com a avançada desativada no clube, nenhuma das duas tem par', async () => {
      const { adm, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const lista = await pares(adm.autorizacao)
      expect(lista.get(regular.id)?.avancadaPareadaId).toBeNull()
      expect(lista.get(avancada.id)?.regularDoParId).toBeNull()
    })
  })

  describe('ativar uma classe completa o vínculo do par', () => {
    it('reativar a avançada dá a avançada a quem só tinha a regular; reativar a regular dá a regular a quem só tinha a avançada', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const soRegular = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id] })
      const ligadas = async (vinculoId: string) =>
        ordenar((await prismaDeTeste().vinculoClasse.findMany({ where: { vinculoId } })).map((ligacao) => ligacao.classeId))
      expect(await ligadas(soRegular.vinculo.id)).toEqual([regular.id])
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: true }).expect(200)
      expect(await ligadas(soRegular.vinculo.id)).toEqual(ordenar([regular.id, avancada.id]))
      await api.get(`/api/classes/${avancada.id}/progresso`, soRegular.autorizacao).expect(200)

      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const soAvancada = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [avancada.id] })
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: true }).expect(200)
      expect(await ligadas(soAvancada.vinculo.id)).toEqual(ordenar([regular.id, avancada.id]))
    })
  })

  describe('ao formar o par, a avançada passa a seguir a regular em quem monta', () => {
    const quemMonta = async (clubeId: string, classeId: string) =>
      (await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId, classeId } } })).quemMontaCronograma

    it('reativar a avançada com a regular em ADM e a avançada em INSTRUTOR iguala a avançada a ADM', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)
      expect(await quemMonta(clube.id, regular.id)).toBe('ADM')
      expect(await quemMonta(clube.id, avancada.id)).toBe('INSTRUTOR')
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: true }).expect(200)
      expect(await quemMonta(clube.id, avancada.id)).toBe('ADM')
    })

    it('reativar a regular iguala a avançada pareada à regular, que está em INSTRUTOR', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: false }).expect(200)
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)
      await prismaDeTeste().classeClube.update({
        where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } },
        data: { quemMontaCronograma: 'ADM' },
      })
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: true }).expect(200)
      expect(await quemMonta(clube.id, avancada.id)).toBe('INSTRUTOR')
    })
  })

  describe('par ativo', () => {
    it('vínculo na avançada com a regular desativada no clube não puxa a regular', async () => {
      const { clube, adm, alvo, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const saida = corpo<Usuario>(
        await api.post(`/api/usuarios/${alvo.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [avancada.id] }).expect(201),
      )
      expect(clube.id).toBeDefined()
      expect(classesDoInstrutor(saida)).toEqual([avancada.id])
    })

    it('avançada desativada no clube não é acrescentada ao marcar a regular', async () => {
      const { adm, alvo, regular, avancada } = await cenario()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const saida = corpo<Usuario>(
        await api.post(`/api/usuarios/${alvo.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [regular.id] }).expect(201),
      )
      expect(classesDoInstrutor(saida)).toEqual([regular.id])
    })

    it('instrutor com o par gravado lê o cronograma publicado e o progresso da avançada; com só a regular gravada, 404 (o escopo confia no vínculo)', async () => {
      const { clube, regular, avancada } = await cenario()
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id, avancada.id] })
      await api.get(`/api/classes/${avancada.id}/cronograma`, instrutor.autorizacao).expect(200)
      await api.get(`/api/classes/${avancada.id}/progresso`, instrutor.autorizacao).expect(200)
      const soRegular = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id] })
      await api.get(`/api/classes/${avancada.id}/progresso`, soRegular.autorizacao).expect(404)
    })

    it('sessão de substituição da regular não alcança a avançada pareada (404); o instrutor titular continua alcançando', async () => {
      const { clube, regular, avancada } = await cenario()
      const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CLASSE', classeId: regular.id })
      const { autorizacao } = credencialDeSubstituicao(substituicao)
      await api.get(`/api/classes/${regular.id}/aulas`, autorizacao).expect(200)
      await api.get(`/api/classes/${regular.id}/cronograma`, autorizacao).expect(200)
      await api.get(`/api/classes/${avancada.id}/aulas`, autorizacao).expect(404)
      await api.get(`/api/classes/${avancada.id}/cronograma`, autorizacao).expect(404)
      await api
        .put(`/api/sync/aulas/${randomUUID()}`, autorizacao, {
          versaoPayload: 1,
          envioId: randomUUID(),
          classeId: avancada.id,
          data: hojeNoFuso('America/Sao_Paulo', new Date()),
          feitaNoAparelhoEm: new Date().toISOString(),
          aulaPlanejadaId: null,
          presencas: [],
          requisitosMarcados: [],
          requisitosDesmarcados: [],
        })
        .expect(404)

      const titular = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id, avancada.id] })
      await api.get(`/api/classes/${avancada.id}/aulas`, titular.autorizacao).expect(200)
    })
  })

  describe('quem monta com o par inativo', () => {
    it('regular inativa no clube: a avançada edita o próprio "quem monta"; com o par ativo, segue 400', async () => {
      const { adm, regular, avancada } = await cenario()
      const bloqueado = await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(400)
      expect(corpo<{ mensagem: string }>(bloqueado).mensagem).toContain('a avançada segue a regular')

      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { ativa: false }).expect(200)
      const editada = corpo<Detalhe>(await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200))
      expect(editada.quemMontaCronograma).toBe('INSTRUTOR')
      expect(editada.regular).toBeNull()
    })
  })
})
