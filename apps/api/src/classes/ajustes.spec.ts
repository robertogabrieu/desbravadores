import type { INestApplication } from '@nestjs/common'
import type { ClasseDetalheSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  admCriarRequisitoAjuste,
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo } from '../../test/p6'

type Detalhe = z.infer<typeof ClasseDetalheSaida>

describe('A5: ajustes de classe e requisito', () => {
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
    const amigo = await classeOficial('Amigo')
    const detalhe = corpo<Detalhe>(await api.get(`/api/classes/${amigo.id}`, adm.autorizacao).expect(200))
    const requisito = detalhe.secoes.flatMap((s) => s.requisitos).find((r) => r.ativo && !r.campo)
    if (!requisito) throw new Error('classe sem requisito ativo e nao-campo')
    return { clube, adm, amigo, detalhe, requisito }
  }

  const todos = (d: Detalhe) => d.secoes.flatMap((s) => s.requisitos)

  it('GET /classes/:id traz oficial e ajustado, refletindo o ajuste do clube (ativo, campo e total)', async () => {
    const { clube, adm, amigo, detalhe, requisito } = await cenario()
    const outro = todos(detalhe).filter((r) => r.ativo && r.id !== requisito.id)[0]
    await admCriarRequisitoAjuste({ clubeId: clube.id, requisitoId: requisito.id, ativo: false })
    await admCriarRequisitoAjuste({ clubeId: clube.id, requisitoId: outro.id, campo: !outro.campo })

    const depois = corpo<Detalhe>(await api.get(`/api/classes/${amigo.id}`, adm.autorizacao).expect(200))
    const desligado = todos(depois).find((r) => r.id === requisito.id)
    expect(desligado).toMatchObject({ ativo: false, ajustado: true, oficial: { ativo: true, campo: false } })
    const trocado = todos(depois).find((r) => r.id === outro.id)
    expect(trocado).toMatchObject({ campo: !outro.campo, ajustado: true, oficial: { ativo: true, campo: outro.campo } })
    const intacto = todos(depois).find((r) => r.id !== requisito.id && r.id !== outro.id && r.ativo)
    expect(intacto).toMatchObject({ ajustado: false })
    expect(depois.totalRequisitos).toBe(detalhe.totalRequisitos - 1)
  })

  it('PATCH /requisitos/:id/ajuste grava; null volta ao oficial e apaga o ajuste', async () => {
    const { clube, adm, amigo, requisito } = await cenario()
    const desligado = corpo<Detalhe>(await api.patch(`/api/requisitos/${requisito.id}/ajuste`, adm.autorizacao, { ativo: false, campo: true }).expect(200))
    expect(desligado.id).toBe(amigo.id)
    expect(todos(desligado).find((r) => r.id === requisito.id)).toMatchObject({ ativo: false, campo: true, ajustado: true })

    const volta = corpo<Detalhe>(await api.patch(`/api/requisitos/${requisito.id}/ajuste`, adm.autorizacao, { ativo: null, campo: null }).expect(200))
    expect(todos(volta).find((r) => r.id === requisito.id)).toMatchObject({ ativo: true, campo: false, ajustado: false })
    expect(await prismaDeTeste().requisitoAjuste.count({ where: { clubeId: clube.id, requisitoId: requisito.id } })).toBe(0)
  })

  it('PATCH /requisitos/:id/ajuste: requisito inexistente → 404; nao-Adm → 403', async () => {
    const { clube, requisito } = await cenario()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await api.patch('/api/requisitos/019d0000-0000-7000-8000-000000000000/ajuste', adm.autorizacao, { ativo: false }).expect(404)
    await api.patch(`/api/requisitos/${requisito.id}/ajuste`, conselheiro.autorizacao, { ativo: false }).expect(403)
  })

  it('PATCH /classes/:id: ativa e quem monta; classe sem ClasseClube ganha a linha', async () => {
    const { clube, adm, amigo } = await cenario()
    const saida = corpo<Detalhe>(await api.patch(`/api/classes/${amigo.id}`, adm.autorizacao, { ativa: false, quemMontaCronograma: 'INSTRUTOR' }).expect(200))
    expect(saida).toMatchObject({ ativa: false, quemMontaCronograma: 'INSTRUTOR' })
    const gravada = await prismaDeTeste().classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: amigo.id } } })
    expect(gravada).toMatchObject({ ativa: false, quemMontaCronograma: 'INSTRUTOR' })
  })

  it('PATCH /classes/:id: desativar com matricula CURSANDO → 422; sem CURSANDO (ou so investida) passa', async () => {
    const { clube, adm, amigo } = await cenario()
    const dbv = await criarDbv({ clubeId: clube.id })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente(), status: 'CURSANDO' })
    const resposta = await api.patch(`/api/classes/${amigo.id}`, adm.autorizacao, { ativa: false }).expect(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA' })
    // so mudar quem monta continua permitido
    await api.patch(`/api/classes/${amigo.id}`, adm.autorizacao, { quemMontaCronograma: 'INSTRUTOR' }).expect(200)

    await prismaDeTeste().matriculaClasse.updateMany({ where: { clubeId: clube.id }, data: { status: 'INVESTIDA' } })
    await api.patch(`/api/classes/${amigo.id}`, adm.autorizacao, { ativa: false }).expect(200)
  })

  it('PATCH /classes/:id: matricula CURSANDO de OUTRO clube nao bloqueia', async () => {
    const { adm, amigo } = await cenario()
    const outro = await criarClube()
    const dbv = await criarDbv({ clubeId: outro.id })
    await criarMatricula({ clubeId: outro.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })
    await api.patch(`/api/classes/${amigo.id}`, adm.autorizacao, { ativa: false }).expect(200)
  })

  it('PATCH /classes/:id: nao-Adm → 403; classe inexistente → 404', async () => {
    const { clube, adm, amigo } = await cenario()
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    await api.patch(`/api/classes/${amigo.id}`, instrutor.autorizacao, { ativa: false }).expect(403)
    await api.patch('/api/classes/019d0000-0000-7000-8000-000000000000', adm.autorizacao, { ativa: false }).expect(404)
  })

  testarIsolamento({
    titulo: 'PATCH /classes/:id (classe do outro clube)',
    app: () => app,
    papel: 'ADM',
    esperado: { tipo: 'NAO_ENCONTRADO' },
    semear: async (clubeB) => {
      const classe = await prismaDeTeste().classe.create({
        data: { clubeId: clubeB.id, origem: 'CLUBE', nome: 'Classe do B', tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 999 },
      })
      return { metodo: 'patch', caminho: `/api/classes/${classe.id}`, corpo: { quemMontaCronograma: 'INSTRUTOR' } }
    },
  })
})
