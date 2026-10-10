import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import { ACEITA_SUBSTITUTO, acessosDeclarados } from './decorators/acesso'
import { listarRotas } from '../../test/rotas'

describe('varredura de rotas (SPEC D24)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
  })

  it('a varredura enxerga as rotas registradas', () => {
    const rotas = listarRotas(app).map((r) => `${r.metodo} ${r.caminho}`)
    expect(rotas).toContain('GET /api/saude')
  })

  it('toda rota registrada declara exatamente um de @Publica, @Autenticado, @Logado ou @Pode', () => {
    const sem = listarRotas(app)
      .filter((rota) => acessosDeclarados(rota.handler, rota.controlador).length !== 1)
      .map((rota) => `${rota.metodo} ${rota.caminho}`)
    expect(sem).toEqual([])
  })

  it('exatamente as rotas da tabela aceitam a credencial de substituicao (criterio 18)', () => {
    const marcada = (alvo: object): boolean => Reflect.getMetadata(ACEITA_SUBSTITUTO, alvo) === true
    const aceitam = listarRotas(app)
      .filter((rota) => marcada(rota.handler) || marcada(rota.controlador))
      .map((rota) => `${rota.metodo} ${rota.caminho}`)
      .sort()
    expect(aceitam).toEqual(
      [
        'GET /api/sync/pacote',
        'PUT /api/sync/reunioes/:uuid',
        'GET /api/reunioes',
        'GET /api/reunioes/:id',
        'PUT /api/sync/aulas/:uuid',
        'GET /api/classes/:id/aulas',
        'GET /api/aulas/:id',
        'GET /api/classes/:id/cronograma',
      ].sort(),
    )
  })

  it('detecta rota sem declaracao e rota com duas', async () => {
    const { RotasDeTesteModule } = await import('../../test/rotas-de-teste')
    const comExtras = await criarAppDeTeste({ extras: [RotasDeTesteModule] })
    try {
      const contagens = new Map(
        listarRotas(comExtras).map((rota) => [
          `${rota.metodo} ${rota.caminho}`,
          acessosDeclarados(rota.handler, rota.controlador).length,
        ]),
      )
      expect(contagens.get('GET /api/_teste/sem-declaracao')).toBe(0)
      expect(contagens.get('GET /api/_teste/declaracao-dupla')).toBe(2)
      expect(contagens.get('GET /api/_teste/logado')).toBe(1)
    } finally {
      await comExtras.close()
    }
  })
})
