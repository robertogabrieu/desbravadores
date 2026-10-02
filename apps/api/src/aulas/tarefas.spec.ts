import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { AulaEnvioSaida, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import type request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  admCriarEspecialidadeClube,
  admCriarRequisitoAjuste,
  classeOficial,
  configurarClube,
  criarAcesso,
  criarClube,
  criarDbv,
  criarEspecialidadeConcluida,
  criarMatricula,
  criarRegistroAula,
  criarTarefa,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { ajustarPermissao, anoCorrente, clienteHttp, corpo } from '../../test/p6'

type Saida = z.infer<typeof AulaEnvioSaida>
type Item = { requisitoId: string } | { especialidadeId: string }

const DIA = 86_400_000
const AVISO_OUTRA_CLASSE = 'Uma tarefa que não é desta classe ficou como estava.'

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

interface Dados {
  uuid?: string
  envioId?: string
  data?: string
  presencas?: { dbvId: string; presente?: boolean }[]
  marcados?: { dbvId: string; requisitoId: string }[]
  desmarcados?: { dbvId: string; requisitoId: string }[]
  tarefaId?: string | null
  acrescentar?: Item[]
  retirar?: Item[]
  entregues?: { dbvId: string; especialidadeId: string }[]
  desfeitas?: { dbvId: string; especialidadeId: string }[]
  encerrar?: string[]
  autorizacao?: string
  feitaEm?: Date
}

describe('PUT /api/sync/aulas/:uuid com tarefa para casa', () => {
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
    const prisma = prismaDeTeste()
    const clube = await criarClube()
    const classe = await classeOficial('Amigo')
    const outra = await classeOficial('Companheiro')
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const segundo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Lider Fulano', tipo: 'LIDER', usuarioId: instrutor.usuario.id })
    for (const dbv of [ana, bia, lider]) {
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
    }
    const requisitosDe = async (classeId: string) =>
      (
        await prisma.requisito.findMany({
          where: { secao: { classeId }, ativo: true },
          orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
          take: 3,
          select: { id: true },
        })
      ).map((r) => r.id)
    const [r1 = '', r2 = '', r3 = ''] = await requisitosDe(classe.id)
    const [deOutraClasse = ''] = await requisitosDe(outra.id)
    const oficiais = await prisma.especialidade.findMany({ where: { clubeId: null, ativa: true }, take: 3, select: { id: true } })
    const [e1 = '', e2 = '', e3 = ''] = oficiais.map((e) => e.id)

    const enviar = (dados: Dados = {}): request.Test =>
      api.put(`/api/sync/aulas/${dados.uuid ?? randomUUID()}`, dados.autorizacao ?? instrutor.autorizacao, {
        versaoPayload: 1,
        envioId: dados.envioId ?? randomUUID(),
        classeId: classe.id,
        data: dados.data ?? diasAtras(0),
        feitaNoAparelhoEm: (dados.feitaEm ?? new Date()).toISOString(),
        aulaPlanejadaId: null,
        presencas: (dados.presencas ?? [{ dbvId: ana.id }, { dbvId: bia.id }]).map((p) => ({ presente: true, versaoVista: null, ...p })),
        requisitosMarcados: dados.marcados ?? [],
        requisitosDesmarcados: dados.desmarcados ?? [],
        tarefaId: dados.tarefaId ?? null,
        tarefaItensAcrescentados: dados.acrescentar ?? [],
        tarefaItensRetirados: dados.retirar ?? [],
        especialidadesMarcadas: dados.entregues ?? [],
        especialidadesDesmarcadas: dados.desfeitas ?? [],
        tarefasEncerradas: dados.encerrar ?? [],
      })
    const ok = async (req: request.Test): Promise<Saida> => {
      const resposta = await req
      expect(resposta.status).toBe(200)
      return AulaEnvioSaida.parse(corpo<unknown>(resposta))
    }
    const itensAtivos = (tarefaId: string) => prisma.tarefaItem.findMany({ where: { clubeId: clube.id, tarefaId, removidoEm: null } })
    const especialidadesAtivas = (dbvId: string) =>
      prisma.especialidadeConcluida.findMany({ where: { clubeId: clube.id, dbvId, removidoEm: null } })
    const lancamentosDeEspecialidade = (dbvId: string, estornado = false) =>
      prisma.lancamentoPontos.findMany({
        where: { clubeId: clube.id, dbvId, origemTipo: 'ESPECIALIDADE', estornadoEm: estornado ? { not: null } : null },
      })
    return {
      clube, classe, outra, instrutor, segundo, adm, ana, bia, lider, r1, r2, r3, deOutraClasse, e1, e2, e3,
      enviar, ok, itensAtivos, especialidadesAtivas, lancamentosDeEspecialidade,
    }
  }

  /** Registro de hoje que passa a tarefa com os itens dados; devolve o id da tarefa. */
  async function passar(c: Awaited<ReturnType<typeof cenario>>, itens: Item[], dados: Dados = {}) {
    const tarefaId = randomUUID()
    const uuid = randomUUID()
    const saida = await c.ok(c.enviar({ uuid, tarefaId, acrescentar: itens, ...dados }))
    return { tarefaId, uuid, saida }
  }

  it('passar cria a tarefa com o id do aparelho, o ano do clube e os itens ativos', async () => {
    const c = await cenario()
    const { tarefaId, uuid, saida } = await passar(c, [{ requisitoId: c.r1 }, { especialidadeId: c.e1 }])
    expect(saida.tarefaId).toBe(tarefaId)
    expect(saida.tarefaItensSemEfeito).toEqual([])
    expect(saida.especialidadesSemEfeito).toEqual([])
    const tarefa = await prismaDeTeste().tarefaCasa.findUniqueOrThrow({ where: { id: tarefaId } })
    expect(tarefa).toMatchObject({
      clubeId: c.clube.id, classeId: c.classe.id, registroAulaId: uuid, anoClube: anoCorrente(),
      criadaPorId: c.instrutor.usuario.id, encerradaEm: null,
    })
    const itens = await c.itensAtivos(tarefaId)
    expect(itens.map((i) => i.requisitoId ?? i.especialidadeId).sort()).toEqual([c.r1, c.e1].sort())
    expect(itens.every((i) => i.criadoPorId === c.instrutor.usuario.id)).toBe(true)
  })

  it('reenviar o mesmo envioId nao duplica e a saida traz o mesmo tarefaId', async () => {
    const c = await cenario()
    const envioId = randomUUID()
    const tarefaId = randomUUID()
    const uuid = randomUUID()
    const primeira = await c.ok(c.enviar({ uuid, envioId, tarefaId, acrescentar: [{ requisitoId: c.r1 }] }))
    const segunda = await c.ok(c.enviar({ uuid, envioId, tarefaId, acrescentar: [{ requisitoId: c.r1 }] }))
    expect(segunda.tarefaId).toBe(tarefaId)
    expect(segunda).toEqual({ ...primeira, tarefaItensSemEfeito: [], especialidadesSemEfeito: [] })
    expect(await prismaDeTeste().tarefaCasa.count({ where: { clubeId: c.clube.id } })).toBe(1)
    expect(await prismaDeTeste().tarefaItem.count({ where: { clubeId: c.clube.id } })).toBe(1)
  })

  it('segundo id de tarefa no mesmo registro e fundido na existente', async () => {
    const c = await cenario()
    const { tarefaId, uuid } = await passar(c, [{ requisitoId: c.r1 }])
    const saida = await c.ok(c.enviar({ uuid, tarefaId: randomUUID(), acrescentar: [{ requisitoId: c.r2 }] }))
    expect(saida.tarefaId).toBe(tarefaId)
    expect(await prismaDeTeste().tarefaCasa.count({ where: { clubeId: c.clube.id } })).toBe(1)
    expect((await c.itensAtivos(tarefaId)).map((i) => i.requisitoId).sort()).toEqual([c.r1, c.r2].sort())
  })

  it('retirar marca removidoEm e quem retirou; acrescentar o que existe ou retirar o que nao existe nao muda nada nem avisa', async () => {
    const c = await cenario()
    const { tarefaId, uuid } = await passar(c, [{ requisitoId: c.r1 }, { requisitoId: c.r2 }])
    const saida = await c.ok(c.enviar({ uuid, tarefaId, retirar: [{ requisitoId: c.r1 }, { requisitoId: c.r3 }], acrescentar: [{ requisitoId: c.r2 }] }))
    expect(saida.tarefaItensSemEfeito).toEqual([])
    const todas = await prismaDeTeste().tarefaItem.findMany({ where: { clubeId: c.clube.id, tarefaId } })
    expect(todas).toHaveLength(2)
    const retirado = todas.find((i) => i.requisitoId === c.r1)
    expect(retirado?.removidoEm).not.toBeNull()
    expect(retirado?.removidoPorId).toBe(c.instrutor.usuario.id)
    expect(todas.find((i) => i.requisitoId === c.r2)?.removidoEm).toBeNull()
  })

  it('requisito de outra classe ou inativo pelo ajuste do clube volta como ITEM_INVALIDO', async () => {
    const c = await cenario()
    await admCriarRequisitoAjuste({ clubeId: c.clube.id, requisitoId: c.r3, ativo: false })
    const { tarefaId, saida } = await passar(c, [{ requisitoId: c.deOutraClasse }, { requisitoId: c.r3 }, { requisitoId: c.r1 }])
    expect(saida.tarefaItensSemEfeito).toEqual([
      { item: { requisitoId: c.deOutraClasse }, motivo: 'ITEM_INVALIDO' },
      { item: { requisitoId: c.r3 }, motivo: 'ITEM_INVALIDO' },
    ])
    expect((await c.itensAtivos(tarefaId)).map((i) => i.requisitoId)).toEqual([c.r1])
  })

  it('especialidade inativa ou de outro clube: ITEM_INVALIDO; item em tarefa aberta da classe: JA_EM_TAREFA; sem requisito.marcar: SEM_PERMISSAO', async () => {
    const c = await cenario()
    const inativa = await prismaDeTeste().especialidade.create({
      data: { clubeId: c.clube.id, origem: 'CLUBE', areaId: (await prismaDeTeste().areaEspecialidade.findFirstOrThrow()).id, nome: 'Inativa', ativa: false },
    })
    const doOutroClube = await admCriarEspecialidadeClube({ clubeId: (await criarClube()).id })
    const primeira = await passar(c, [{ requisitoId: c.r1 }, { especialidadeId: c.e1 }])
    const { tarefaId, saida } = await passar(c, [
      { especialidadeId: inativa.id }, { especialidadeId: doOutroClube.id }, { requisitoId: c.r1 }, { especialidadeId: c.e1 }, { especialidadeId: c.e2 },
    ], { data: diasAtras(3), autorizacao: c.segundo.autorizacao })
    expect(saida.tarefaItensSemEfeito).toEqual([
      { item: { especialidadeId: inativa.id }, motivo: 'ITEM_INVALIDO' },
      { item: { especialidadeId: doOutroClube.id }, motivo: 'ITEM_INVALIDO' },
      { item: { requisitoId: c.r1 }, motivo: 'JA_EM_TAREFA' },
      { item: { especialidadeId: c.e1 }, motivo: 'JA_EM_TAREFA' },
    ])
    expect((await c.itensAtivos(tarefaId)).map((i) => i.especialidadeId)).toEqual([c.e2])
    expect((await c.itensAtivos(primeira.tarefaId)).map((i) => i.requisitoId ?? i.especialidadeId).sort()).toEqual([c.r1, c.e1].sort())

    await ajustarPermissao(c.segundo.vinculo.id, 'requisito.marcar', false)
    const semPermissao = await passar(c, [{ especialidadeId: c.e3 }, { requisitoId: c.r2 }], { data: diasAtras(4), autorizacao: c.segundo.autorizacao })
    expect(semPermissao.saida.tarefaItensSemEfeito).toEqual([{ item: { especialidadeId: c.e3 }, motivo: 'SEM_PERMISSAO' }])
    expect((await c.itensAtivos(semPermissao.tarefaId)).map((i) => i.requisitoId)).toEqual([c.r2])
  })

  it('tarefa aberta de outro ano do clube nao barra o item: JA_EM_TAREFA vale so no ano do registro', async () => {
    const c = await cenario()
    const registroVelho = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(400) })
    await criarTarefa({ clubeId: c.clube.id, classeId: c.classe.id, registroAulaId: registroVelho.id, anoClube: anoCorrente() - 1, itens: [{ requisitoId: c.r1 }] })
    const { tarefaId, saida } = await passar(c, [{ requisitoId: c.r1 }])
    expect(saida.tarefaItensSemEfeito).toEqual([])
    expect((await c.itensAtivos(tarefaId)).map((i) => i.requisitoId)).toEqual([c.r1])
  })

  it('acrescentar item na tarefa ja encerrada do proprio registro volta como ITEM_INVALIDO', async () => {
    const c = await cenario()
    const { tarefaId, uuid } = await passar(c, [{ requisitoId: c.r1 }])
    await c.ok(c.enviar({ uuid, encerrar: [tarefaId] }))
    const saida = await c.ok(c.enviar({ uuid, acrescentar: [{ requisitoId: c.r2 }] }))
    expect(saida.tarefaItensSemEfeito).toEqual([{ item: { requisitoId: c.r2 }, motivo: 'ITEM_INVALIDO' }])
    expect((await c.itensAtivos(tarefaId)).map((i) => i.requisitoId)).toEqual([c.r1])
  })

  it('so itens recusados nao criam a tarefa; com ao menos um gravado ela e criada', async () => {
    const c = await cenario()
    const recusado = await passar(c, [{ requisitoId: c.deOutraClasse }])
    expect(recusado.saida.tarefaItensSemEfeito).toEqual([{ item: { requisitoId: c.deOutraClasse }, motivo: 'ITEM_INVALIDO' }])
    expect(await prismaDeTeste().tarefaCasa.count({ where: { clubeId: c.clube.id } })).toBe(0)

    const { tarefaId } = await passar(c, [{ requisitoId: c.deOutraClasse }, { requisitoId: c.r1 }], { data: diasAtras(1) })
    expect((await c.itensAtivos(tarefaId)).map((i) => i.requisitoId)).toEqual([c.r1])
  })

  it('CHECK do banco: item com requisito e especialidade, ou com nenhum dos dois, e rejeitado', async () => {
    const c = await cenario()
    const registro = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(1) })
    const tarefa = await criarTarefa({ clubeId: c.clube.id, classeId: c.classe.id, registroAulaId: registro.id })
    const base = { clubeId: c.clube.id, tarefaId: tarefa.id, criadoPorId: c.instrutor.usuario.id }
    await expect(prismaDeTeste().tarefaItem.create({ data: { ...base, requisitoId: c.r1, especialidadeId: c.e1 } })).rejects.toThrow()
    await expect(prismaDeTeste().tarefaItem.create({ data: base })).rejects.toThrow()
  })

  it('cobrar requisito marca com o registro da cobranca e da os pontos de requisito', async () => {
    const c = await cenario()
    await passar(c, [{ requisitoId: c.r1 }], { data: diasAtras(5) })
    const cobranca = randomUUID()
    const saida = await c.ok(c.enviar({ uuid: cobranca, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }] }))
    const concluidos = await prismaDeTeste().requisitoConcluido.findMany({ where: { clubeId: c.clube.id, dbvId: c.ana.id, removidoEm: null } })
    expect(concluidos).toHaveLength(1)
    expect(concluidos[0]).toMatchObject({ requisitoId: c.r1, registroAulaId: cobranca })
    expect(saida.totalPontos).toBe(4)
    expect(saida.tarefaId).toBeNull()
  })

  it('cobrar especialidade conclui na data do registro, lanca pontos de ESPECIALIDADE e soma no totalPontos', async () => {
    const c = await cenario()
    const criterio = await criterioPorGatilho(c.clube.id, 'ESPECIALIDADE')
    const cobranca = randomUUID()
    const saida = await c.ok(c.enviar({
      uuid: cobranca, data: diasAtras(2), marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }], entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }],
    }))
    expect(saida.especialidadesSemEfeito).toEqual([])
    const [conclusao] = await c.especialidadesAtivas(c.ana.id)
    expect(conclusao).toMatchObject({ especialidadeId: c.e1, registroAulaId: cobranca, marcadoPorId: c.instrutor.usuario.id })
    expect(conclusao?.concluidaEm.toISOString().slice(0, 10)).toBe(diasAtras(2))
    const pontos = await c.lancamentosDeEspecialidade(c.ana.id)
    expect(pontos.map((l) => [l.pontos, l.origemId])).toEqual([[criterio.pontos, `${c.ana.id}:${c.e1}`]])
    expect(saida.totalPontos).toBe(4 + criterio.pontos)
  })

  it('especialidade ja concluida nao move a data; propria ficha e sem requisito.marcar voltam como aviso', async () => {
    const c = await cenario()
    await criarEspecialidadeConcluida({ clubeId: c.clube.id, dbvId: c.ana.id, especialidadeId: c.e1, concluidaEm: diasAtras(40) })
    const saida = await c.ok(c.enviar({
      presencas: [{ dbvId: c.ana.id }, { dbvId: c.lider.id }],
      marcados: [{ dbvId: c.lider.id, requisitoId: c.r1 }],
      entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }, { dbvId: c.lider.id, especialidadeId: c.e2 }],
    }))
    expect(saida.especialidadesSemEfeito).toEqual([
      { dbvId: c.ana.id, especialidadeId: c.e1, motivo: 'JA_CONCLUIDA', concluidaEm: diasAtras(40) },
      { dbvId: c.lider.id, especialidadeId: c.e2, motivo: 'PROPRIA_FICHA', concluidaEm: null },
    ])
    expect(saida.requisitosSemEfeito).toEqual([{ dbvId: c.lider.id, requisitoId: c.r1, motivo: 'PROPRIA_FICHA', concluidoEm: null }])
    const [conclusao] = await c.especialidadesAtivas(c.ana.id)
    expect(conclusao?.concluidaEm.toISOString().slice(0, 10)).toBe(diasAtras(40))
    expect(conclusao?.registroAulaId).toBeNull()
    expect(await c.especialidadesAtivas(c.lider.id)).toEqual([])

    await ajustarPermissao(c.segundo.vinculo.id, 'requisito.marcar', false)
    const semPermissao = await c.ok(c.enviar({ autorizacao: c.segundo.autorizacao, data: diasAtras(1), entregues: [{ dbvId: c.bia.id, especialidadeId: c.e2 }] }))
    expect(semPermissao.especialidadesSemEfeito).toEqual([{ dbvId: c.bia.id, especialidadeId: c.e2, motivo: 'SEM_PERMISSAO', concluidaEm: null }])
    expect(await c.especialidadesAtivas(c.bia.id)).toEqual([])
  })

  it('especialidade invalida (inativa) volta como ESPECIALIDADE_INVALIDA', async () => {
    const c = await cenario()
    const inativa = await prismaDeTeste().especialidade.create({
      data: { clubeId: c.clube.id, origem: 'CLUBE', areaId: (await prismaDeTeste().areaEspecialidade.findFirstOrThrow()).id, nome: 'Inativa 2', ativa: false },
    })
    const saida = await c.ok(c.enviar({ entregues: [{ dbvId: c.ana.id, especialidadeId: inativa.id }] }))
    expect(saida.especialidadesSemEfeito).toEqual([{ dbvId: c.ana.id, especialidadeId: inativa.id, motivo: 'ESPECIALIDADE_INVALIDA', concluidaEm: null }])
  })

  it('data do registro fora do ano do clube e aceita para a especialidade', async () => {
    const c = await cenario()
    const hoje = diasAtras(0)
    await configurarClube({ clubeId: c.clube.id, inicioAnoClube: hoje.slice(5) })
    const anterior = anoCorrente() - 1
    await prismaDeTeste().matriculaClasse.updateMany({ where: { clubeId: c.clube.id }, data: { anoClube: anterior } })
    const saida = await c.ok(c.enviar({ data: diasAtras(5), entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }] }))
    expect(saida.especialidadesSemEfeito).toEqual([])
    const [conclusao] = await c.especialidadesAtivas(c.ana.id)
    expect(conclusao?.concluidaEm.toISOString().slice(0, 10)).toBe(diasAtras(5))
  })

  it('ausente gravado, mesmo sem constar no envio de correcao, volta como AUSENTE para requisito e especialidade', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    await c.ok(c.enviar({ uuid, presencas: [{ dbvId: c.ana.id }, { dbvId: c.bia.id, presente: false }] }))
    const saida = await c.ok(c.enviar({
      uuid, presencas: [], marcados: [{ dbvId: c.bia.id, requisitoId: c.r1 }], entregues: [{ dbvId: c.bia.id, especialidadeId: c.e1 }],
    }))
    expect(saida.requisitosSemEfeito).toEqual([{ dbvId: c.bia.id, requisitoId: c.r1, motivo: 'AUSENTE', concluidoEm: null }])
    expect(saida.especialidadesSemEfeito).toEqual([{ dbvId: c.bia.id, especialidadeId: c.e1, motivo: 'AUSENTE', concluidaEm: null }])
    expect(await c.especialidadesAtivas(c.bia.id)).toEqual([])
  })

  it('desfazer tira so a conclusao deste registro e estorna pontos; a de outra origem fica', async () => {
    const c = await cenario()
    const uuid = randomUUID()
    await c.ok(c.enviar({
      uuid, marcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }],
      entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }, { dbvId: c.bia.id, especialidadeId: c.e2 }],
    }))
    await criarEspecialidadeConcluida({ clubeId: c.clube.id, dbvId: c.bia.id, especialidadeId: c.e3 })
    const saida = await c.ok(c.enviar({
      uuid, presencas: [],
      desmarcados: [{ dbvId: c.ana.id, requisitoId: c.r1 }],
      desfeitas: [{ dbvId: c.ana.id, especialidadeId: c.e1 }, { dbvId: c.bia.id, especialidadeId: c.e3 }],
    }))
    expect(saida.totalPontos).toBe((await criterioPorGatilho(c.clube.id, 'ESPECIALIDADE')).pontos)
    expect(await c.especialidadesAtivas(c.ana.id)).toEqual([])
    expect((await c.lancamentosDeEspecialidade(c.ana.id, true)).length).toBe(1)
    expect((await c.especialidadesAtivas(c.bia.id)).map((e) => e.especialidadeId).sort()).toEqual([c.e2, c.e3].sort())
    expect(await prismaDeTeste().requisitoConcluido.count({ where: { clubeId: c.clube.id, dbvId: c.ana.id, removidoEm: null } })).toBe(0)
  })

  it('encerrar fecha a tarefa da classe e mantem as entregas; tarefa de outra classe ou clube fica intacta com aviso', async () => {
    const c = await cenario()
    const { tarefaId } = await passar(c, [{ especialidadeId: c.e1 }], { data: diasAtras(6) })
    const doOutroClube = await cenario()
    const registroAlheio = await criarRegistroAula({ clubeId: doOutroClube.clube.id, classeId: doOutroClube.classe.id, data: diasAtras(1) })
    const alheia = await criarTarefa({ clubeId: doOutroClube.clube.id, classeId: doOutroClube.classe.id, registroAulaId: registroAlheio.id })
    const registroDaOutra = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.outra.id, data: diasAtras(1) })
    const daOutraClasse = await criarTarefa({ clubeId: c.clube.id, classeId: c.outra.id, registroAulaId: registroDaOutra.id })

    const saida = await c.ok(c.enviar({
      entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }], encerrar: [tarefaId, alheia.id, daOutraClasse.id],
    }))
    expect(saida.avisos).toEqual([AVISO_OUTRA_CLASSE])
    const encerrada = await prismaDeTeste().tarefaCasa.findUniqueOrThrow({ where: { id: tarefaId } })
    expect(encerrada.encerradaEm).not.toBeNull()
    expect(encerrada.encerradaPorId).toBe(c.instrutor.usuario.id)
    for (const id of [alheia.id, daOutraClasse.id]) {
      expect((await prismaDeTeste().tarefaCasa.findUniqueOrThrow({ where: { id } })).encerradaEm).toBeNull()
    }
    expect(await c.especialidadesAtivas(c.ana.id)).toHaveLength(1)

    const sozinha = await c.ok(c.enviar({ data: diasAtras(1), encerrar: [tarefaId] }))
    expect(sozinha.avisos).toEqual([])
  })

  it('envio recusado por prazo nao grava nada da tarefa, nem o encerramento', async () => {
    const c = await cenario()
    const { tarefaId } = await passar(c, [{ requisitoId: c.r1 }], { data: diasAtras(10) })
    const velho = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(45), presencas: [{ dbvId: c.ana.id }] })
    const resposta = await c.enviar({
      uuid: velho.id, data: diasAtras(45), tarefaId: randomUUID(), acrescentar: [{ requisitoId: c.r2 }],
      entregues: [{ dbvId: c.ana.id, especialidadeId: c.e1 }], encerrar: [tarefaId],
    })
    expect(resposta.status).toBe(422)
    expect(await prismaDeTeste().tarefaCasa.count({ where: { clubeId: c.clube.id } })).toBe(1)
    expect((await prismaDeTeste().tarefaCasa.findUniqueOrThrow({ where: { id: tarefaId } })).encerradaEm).toBeNull()
    expect(await c.especialidadesAtivas(c.ana.id)).toEqual([])
  })
})
