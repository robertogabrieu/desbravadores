import type { INestApplication } from '@nestjs/common'
import type { ClasseDetalheSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
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
    it('na regular, propaga para a avançada do mesmo clube e não mexe em "ativa" nem em outro clube', async () => {
      const { clube, adm, regular, avancada } = await cenario()
      const outro = await criarClube()
      await api.patch(`/api/classes/${avancada.id}`, adm.autorizacao, { ativa: false }).expect(200)
      await api.patch(`/api/classes/${regular.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)

      const daAvancada = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
      expect(daAvancada).toMatchObject({ quemMontaCronograma: 'INSTRUTOR', ativa: false })
      const doOutro = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: outro.id, classeId: avancada.id } } })
      expect(doOutro.quemMontaCronograma).toBe('ADM')
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
})
