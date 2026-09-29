import type { INestApplication } from '@nestjs/common'
import type { AreaComEspecialidades } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo } from '../../test/p6'

type Areas = z.infer<typeof AreaComEspecialidades>[]

describe('GET /especialidades', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('9 areas por ordem e 514 especialidades oficiais, itens por nome; qualquer papel logado', async () => {
    const clube = await criarClube()
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const areas = corpo<Areas>(await api.get('/api/especialidades', instrutor.autorizacao).expect(200))
    expect(areas).toHaveLength(9)
    expect(areas.map((a) => a.ordem)).toEqual([...areas.map((a) => a.ordem)].sort((a, b) => a - b))
    expect(areas.flatMap((a) => a.especialidades)).toHaveLength(514)
    for (const area of areas) {
      const nomes = area.especialidades.map((e) => e.nome)
      expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    }
  })

  it('inclui as do proprio clube, esconde as de outro clube e as inativas', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow({ orderBy: { ordem: 'asc' } })
    const prisma = prismaDeTeste()
    const propria = await prisma.especialidade.create({ data: { clubeId: clube.id, origem: 'CLUBE', areaId: area.id, nome: 'Propria do clube' } })
    const alheia = await prisma.especialidade.create({ data: { clubeId: outro.id, origem: 'CLUBE', areaId: area.id, nome: 'Alheia' } })
    const inativa = await prisma.especialidade.create({ data: { clubeId: clube.id, origem: 'CLUBE', areaId: area.id, nome: 'Inativa', ativa: false } })
    const ids = corpo<Areas>(await api.get('/api/especialidades', adm.autorizacao).expect(200)).flatMap((a) => a.especialidades.map((e) => e.id))
    expect(ids).toContain(propria.id)
    expect(ids).not.toContain(alheia.id)
    expect(ids).not.toContain(inativa.id)
  })

  it('filtra por area e por busca sem acento e sem caixa (areas vazias somem)', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const prisma = prismaDeTeste()
    const areas = await prisma.areaEspecialidade.findMany({ orderBy: { ordem: 'asc' } })
    const segunda = areas[1]
    const porArea = corpo<Areas>(await api.get(`/api/especialidades?areaId=${segunda.id}`, adm.autorizacao).expect(200))
    expect(porArea.map((a) => a.id)).toEqual([segunda.id])
    await prisma.especialidade.create({ data: { clubeId: clube.id, origem: 'CLUBE', areaId: areas[0].id, nome: 'Fotografia Aérea Ç' } })
    const busca = corpo<Areas>(await api.get('/api/especialidades?busca=AEREA%20c', adm.autorizacao).expect(200))
    expect(busca.map((a) => a.id)).toEqual([areas[0].id])
    expect(busca[0]?.especialidades.map((e) => e.nome)).toEqual(['Fotografia Aérea Ç'])
  })

  describe('isolamento entre clubes', () => {
    testarIsolamento({
      titulo: 'GET /especialidades (lista)',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow()
        const especialidade = await prismaDeTeste().especialidade.create({
          data: { clubeId: clube.id, origem: 'CLUBE', areaId: area.id, nome: 'Somente do B' },
        })
        return { metodo: 'get', caminho: '/api/especialidades', idsDoOutroClube: [especialidade.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })
  })
})
