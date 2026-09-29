import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import { acessosDeclarados } from './decorators/acesso'
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
