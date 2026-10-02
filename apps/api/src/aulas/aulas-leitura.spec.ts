import type { INestApplication } from '@nestjs/common'
import { AulaDetalhe, AulaResumo, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarDbv,
  criarRegistroAula,
  criarTarefa,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

const DIA = 86_400_000

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

describe('leitura de aulas', () => {
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
    const classe = await classeOficial('Amigo')
    const outra = await classeOficial('Companheiro')
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    const requisitos = await prismaDeTeste().requisito.findMany({
      where: { secao: { classeId: classe.id }, ativo: true },
      orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
      take: 3,
      select: { id: true },
    })
    return { clube, classe, outra, instrutor, adm, conselheiro, ana, bia, requisitos: requisitos.map((r) => r.id) }
  }

  it('lista as aulas da classe da mais recente a mais antiga, com presentes, total e requisitos', async () => {
    const c = await cenario()
    const velha = await criarRegistroAula({
      clubeId: c.clube.id,
      classeId: c.classe.id,
      data: diasAtras(10),
      presencas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id, presente: false }],
      concluidos: [{ dbvId: c.ana.id, requisitoId: c.requisitos[0] ?? '' }],
    })
    const nova = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(2), presencas: [{ dbvId: c.ana.id }] })
    const resposta = await api.get(`/api/classes/${c.classe.id}/aulas`, c.instrutor.autorizacao)
    expect(resposta.status).toBe(200)
    const aulas = (corpo<unknown[]>(resposta)).map((a) => AulaResumo.parse(a))
    expect(aulas).toEqual([
      { id: nova.id, data: diasAtras(2), presentes: 1, total: 1, requisitosConcluidos: 0 },
      { id: velha.id, data: diasAtras(10), presentes: 1, total: 2, requisitosConcluidos: 1 },
    ])
  })

  it('escopo: outra classe 404 para instrutor, conselheiro 403, Adm qualquer, e aula de outro clube nao aparece', async () => {
    const c = await cenario()
    const doOutroClube = await cenario()
    await criarRegistroAula({ clubeId: doOutroClube.clube.id, classeId: c.classe.id, data: diasAtras(1) })
    expect((await api.get(`/api/classes/${c.outra.id}/aulas`, c.instrutor.autorizacao)).status).toBe(404)
    expect((await api.get(`/api/classes/${c.classe.id}/aulas`, c.conselheiro.autorizacao)).status).toBe(403)
    const adm = await api.get(`/api/classes/${c.outra.id}/aulas`, c.adm.autorizacao)
    expect(adm.status).toBe(200)
    const propria = await api.get(`/api/classes/${c.classe.id}/aulas`, c.instrutor.autorizacao)
    expect(corpo<unknown[]>(propria)).toEqual([])
  })

  it('detalhe: presencas com nome, requisitos planejados e marcados, quem registrou e podeEditar', async () => {
    const c = await cenario()
    const [r1, r2, r3] = c.requisitos
    const cronograma = await criarCronograma({ clubeId: c.clube.id, classeId: c.classe.id, aulas: [{ data: diasAtras(1), requisitoIds: [r1 ?? '', r2 ?? ''] }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: c.adm.usuario.id })
    const registro = await criarRegistroAula({
      clubeId: c.clube.id,
      classeId: c.classe.id,
      data: diasAtras(1),
      presencas: [{ dbvId: c.bia.id, presente: false }, { dbvId: c.ana.id }],
      concluidos: [{ dbvId: c.ana.id, requisitoId: r3 ?? '' }],
    })
    const resposta = await api.get(`/api/aulas/${registro.id}`, c.instrutor.autorizacao)
    expect(resposta.status).toBe(200)
    const detalhe: z.infer<typeof AulaDetalhe> = AulaDetalhe.parse(corpo<unknown>(resposta))
    expect(detalhe).toMatchObject({ id: registro.id, data: diasAtras(1), aulaPlanejadaId: cronograma.aulas[0]?.id, podeEditar: true })
    expect(detalhe.classe.id).toBe(c.classe.id)
    expect(detalhe.presencas.map((p) => [p.nome, p.presente])).toEqual([['Ana Souza', true], ['Bia Lima', false]])
    expect(detalhe.requisitosDaAula.map((r) => r.id).sort()).toEqual([r1, r2, r3].sort())
    expect(detalhe.concluidosNaAula).toEqual([{ dbvId: c.ana.id, requisitoId: r3 }])
  })

  it('detalhe: requisito marcado so por cobranca de tarefa anterior fica fora de requisitosDaAula, salvo se planejado para a data', async () => {
    const c = await cenario()
    const [r1 = '', r2 = '', r3 = ''] = c.requisitos
    const origem = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(10), presencas: [{ dbvId: c.ana.id }] })
    await criarTarefa({ clubeId: c.clube.id, classeId: c.classe.id, registroAulaId: origem.id, itens: [{ requisitoId: r1 }, { requisitoId: r2 }] })
    const cronograma = await criarCronograma({ clubeId: c.clube.id, classeId: c.classe.id, aulas: [{ data: diasAtras(1), requisitoIds: [r2] }] })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: c.adm.usuario.id })
    const cobranca = await criarRegistroAula({
      clubeId: c.clube.id,
      classeId: c.classe.id,
      data: diasAtras(1),
      presencas: [{ dbvId: c.ana.id }],
      concluidos: [{ dbvId: c.ana.id, requisitoId: r1 }, { dbvId: c.ana.id, requisitoId: r2 }, { dbvId: c.ana.id, requisitoId: r3 }],
    })
    const resposta = await api.get(`/api/aulas/${cobranca.id}`, c.instrutor.autorizacao)
    const detalhe = AulaDetalhe.parse(corpo<unknown>(resposta))
    expect(detalhe.requisitosDaAula.map((r) => r.id).sort()).toEqual([r2, r3].sort())
    expect(detalhe.concluidosNaAula).toHaveLength(3)

    const daOrigem = AulaDetalhe.parse(corpo<unknown>(await api.get(`/api/aulas/${origem.id}`, c.instrutor.autorizacao)))
    expect(daOrigem.requisitosDaAula).toEqual([])
  })

  it('detalhe: podeEditar falso para o instrutor depois do prazo e verdadeiro para o Adm; escopo 404 e 403', async () => {
    const c = await cenario()
    const velha = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(45), presencas: [{ dbvId: c.ana.id }] })
    const doInstrutor = AulaDetalhe.parse(corpo<unknown>(await api.get(`/api/aulas/${velha.id}`, c.instrutor.autorizacao)))
    const doAdm = AulaDetalhe.parse(corpo<unknown>(await api.get(`/api/aulas/${velha.id}`, c.adm.autorizacao)))
    expect(doInstrutor.podeEditar).toBe(false)
    expect(doAdm.podeEditar).toBe(true)
    expect((await api.get(`/api/aulas/${velha.id}`, c.conselheiro.autorizacao)).status).toBe(403)

    const deOutraClasse = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.outra.id, data: diasAtras(1) })
    expect((await api.get(`/api/aulas/${deOutraClasse.id}`, c.instrutor.autorizacao)).status).toBe(404)
    const doOutroClube = await cenario()
    expect((await api.get(`/api/aulas/${velha.id}`, doOutroClube.adm.autorizacao)).status).toBe(404)
    expect((await api.get(`/api/aulas/${velha.id}`, doOutroClube.instrutor.autorizacao)).status).toBe(404)
  })
})
