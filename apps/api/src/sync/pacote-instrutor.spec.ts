import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarDbv,
  criarMatricula,
  criarRegistroAula,
  criarRequisitoConcluido,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  publicarCronograma,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo } from '../../test/p6'

type Pacote = z.infer<typeof PacoteSaida>

const DIA = 86_400_000

function dia(deslocamento: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() + deslocamento * DIA))
}

describe('GET /api/sync/pacote do instrutor (F11)', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function baixar(autorizacao: string): Promise<Pacote> {
    const resposta = await api.get('/api/sync/pacote', autorizacao)
    expect(resposta.status).toBe(200)
    return PacoteSaida.parse(corpo<unknown>(resposta))
  }

  async function cenario() {
    const clube = await criarClube()
    const classe = await classeOficial('Amigo')
    const outra = await classeOficial('Companheiro')
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
    const lider = await criarDbv({ clubeId: clube.id, nome: 'Carla Lider', tipo: 'LIDER' })
    const diretoria = await criarDbv({ clubeId: clube.id, nome: 'Dora Diretoria', tipo: 'DIRETORIA' })
    for (const dbv of [bia, ana, lider, diretoria]) {
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
    }
    const requisitos = await prismaDeTeste().requisito.findMany({
      where: { secao: { classeId: classe.id }, ativo: true },
      orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
      take: 3,
      select: { id: true },
    })
    return { clube, classe, outra, instrutor, ana, bia, lider, requisitos: requisitos.map((r) => r.id) }
  }

  it('traz classes do vinculo, membros CURSANDO por nome com concluidos, requisitos, aulas publicadas e registros recentes', async () => {
    const c = await cenario()
    const [r1, r2, r3] = c.requisitos
    const desistiu = await criarDbv({ clubeId: c.clube.id, nome: 'Desistiu' })
    await criarMatricula({ clubeId: c.clube.id, dbvId: desistiu.id, classeId: c.classe.id, anoClube: anoCorrente(), status: 'DESISTIU' })
    const deOutraClasse = await criarDbv({ clubeId: c.clube.id, nome: 'Outra Classe' })
    await criarMatricula({ clubeId: c.clube.id, dbvId: deOutraClasse.id, classeId: c.outra.id, anoClube: anoCorrente() })
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: c.clube.id, requisitoId: r3 ?? '', ativo: false } })
    await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: c.clube.id, requisitoId: r1 ?? '', campo: true } })

    const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
    const cronograma = await criarCronograma({
      clubeId: c.clube.id,
      classeId: c.classe.id,
      aulas: [
        { data: dia(3), requisitoIds: [r2 ?? '', r1 ?? ''] },
        { data: dia(20), requisitoIds: [] },
        { data: dia(-2), requisitoIds: [] },
      ],
    })
    await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: adm.usuario.id })
    // aula colocada no vivo depois da publicacao nao entra
    await prismaDeTeste().aulaPlanejada.create({ data: { clubeId: c.clube.id, cronogramaId: cronograma.id, data: new Date(`${dia(5)}T00:00:00Z`) } })

    const recente = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: dia(-1), presencas: [{ dbvId: c.ana.id, presente: false }] })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: r2 ?? '', concluidoEm: '2026-02-10' })
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: r1 ?? '', concluidoEm: dia(-1), registroAulaId: recente.id })
    const removida = await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.bia.id, requisitoId: r2 ?? '' })
    await prismaDeTeste().requisitoConcluido.update({ where: { id: removida.id }, data: { removidoEm: new Date() } })
    await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: dia(-31), presencas: [{ dbvId: c.ana.id }] })

    const pacote = await baixar(c.instrutor.autorizacao)
    const instrutor = pacote.instrutor
    expect(instrutor).not.toBeNull()
    expect(instrutor?.classes.map((x) => x.classe.id)).toEqual([c.classe.id])
    const classe = instrutor?.classes[0]
    expect(classe?.membros.map((m) => [m.nome, m.tipo])).toEqual([['Ana Souza', 'DBV'], ['Bia Lima', 'DBV'], ['Carla Lider', 'LIDER'], ['Dora Diretoria', 'DIRETORIA']])
    expect(classe?.membros[0]?.concluidos.sort()).toEqual([r1, r2].sort())
    expect(classe?.membros[1]?.concluidos).toEqual([])
    const ordenadas = [...(classe?.membros[0]?.conclusoes ?? [])].sort((a, b) => a.requisitoId.localeCompare(b.requisitoId))
    expect(classe?.membros[0]?.conclusoes).toEqual(ordenadas)
    expect(ordenadas).toEqual(
      [
        { requisitoId: r2, concluidoEm: '2026-02-10', registroAulaId: null },
        { requisitoId: r1, concluidoEm: dia(-1), registroAulaId: recente.id },
      ].sort((a, b) => (a.requisitoId ?? '').localeCompare(b.requisitoId ?? '')),
    )
    expect(classe?.membros[1]?.conclusoes).toEqual([])
    const ids = classe?.requisitos.map((r) => r.id) ?? []
    expect(ids).toContain(r1)
    expect(ids).not.toContain(r3)
    expect(classe?.requisitos.find((r) => r.id === r1)?.campo).toBe(true)
    expect(classe?.aulasProximas.map((a) => a.data)).toEqual([dia(3)])
    expect(classe?.aulasProximas[0]?.aulaPlanejadaId).toBe(cronograma.aulas[0]?.id)
    expect(classe?.aulasProximas[0]?.requisitoIds.sort()).toEqual([r1, r2].sort())
    expect(classe?.registrosRecentes.map((r) => r.id)).toEqual([recente.id])
    expect(classe?.registrosRecentes[0]?.presencas).toEqual([{ dbvId: c.ana.id, presente: false, versao: expect.any(String) as string }])
    expect(instrutor?.pontosRequisito).toEqual({ pontos: 4, ativo: true })
    expect(pacote.unidades).toEqual([])
  })

  it('a versao muda quando o conteudo novo muda e e estavel quando nada muda', async () => {
    const c = await cenario()
    const a = await baixar(c.instrutor.autorizacao)
    const b = await baixar(c.instrutor.autorizacao)
    expect(b.versao).toBe(a.versao)
    await criarRequisitoConcluido({ clubeId: c.clube.id, dbvId: c.ana.id, requisitoId: c.requisitos[0] ?? '' })
    const depois = await baixar(c.instrutor.autorizacao)
    expect(depois.versao).not.toBe(a.versao)
    await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: dia(-1), presencas: [{ dbvId: c.ana.id }] })
    expect((await baixar(c.instrutor.autorizacao)).versao).not.toBe(depois.versao)
  })

  it('so a classe do vinculo entra e o outro clube nao vaza', async () => {
    const c = await cenario()
    const outroClube = await criarClube()
    const estranho = await criarDbv({ clubeId: outroClube.id, nome: 'Estranho' })
    await criarMatricula({ clubeId: outroClube.id, dbvId: estranho.id, classeId: c.classe.id, anoClube: anoCorrente() })
    await criarRegistroAula({ clubeId: outroClube.id, classeId: c.classe.id, data: dia(-1), presencas: [{ dbvId: estranho.id }] })
    const pacote = await baixar(c.instrutor.autorizacao)
    const classe = pacote.instrutor?.classes[0]
    expect(classe?.membros.map((m) => m.dbvId)).not.toContain(estranho.id)
    expect(classe?.registrosRecentes).toEqual([])
  })

  it('conselheiro e Adm ficam como antes: instrutor nulo', async () => {
    const c = await cenario()
    const unidade = await criarUnidade({ clubeId: c.clube.id })
    const conselheiro = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
    expect((await baixar(conselheiro.autorizacao)).instrutor).toBeNull()
    expect((await baixar(adm.autorizacao)).instrutor).toBeNull()
  })
})
