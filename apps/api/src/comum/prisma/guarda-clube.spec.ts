import { randomUUID } from 'node:crypto'
import {
  ErroEscopoClube,
  MODELOS_DE_CLUBE,
  MODELOS_MISTOS,
  relacoesDoClient,
  verificarEscopo,
} from './guarda-clube'
import { PrismaSistema } from './prisma-sistema'

const CLUBE = randomUUID()
const OUTRO_CLUBE = randomUUID()

const OPERACOES_COM_WHERE = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
  'count',
  'aggregate',
  'groupBy',
] as const

function argumentos(operacao: string, where: unknown): Record<string, unknown> {
  const args: Record<string, unknown> = where === undefined ? {} : { where }
  if (operacao === 'upsert') {
    args['create'] = { clubeId: CLUBE }
    args['update'] = {}
  }
  return args
}

const OPERACOES_DE_LEITURA: string[] = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]

const WHERES_RECUSADOS: [string, unknown][] = [
  ['sem where', undefined],
  ['where vazio', {}],
  ['clubeId undefined', { clubeId: undefined }],
  ['clubeId null', { clubeId: null }],
  ['clubeId com {in}', { clubeId: { in: [CLUBE] } }],
  ['clubeId com {not}', { clubeId: { not: CLUBE } }],
  ['clubeId que nao e UUID', { clubeId: 'meu-clube' }],
  ['so um AND sem clubeId', { AND: [{ nome: 'x' }] }],
  ['clubeId so dentro de um OR', { OR: [{ clubeId: CLUBE }] }],
  ['clubeId so dentro de um NOT', { NOT: { clubeId: CLUBE } }],
]

const WHERES_ACEITOS: [string, unknown][] = [
  ['clubeId no topo', { clubeId: CLUBE, id: 'x' }],
  ['clubeId dentro de um AND (lista)', { AND: [{ nome: 'x' }, { clubeId: CLUBE }] }],
  ['clubeId dentro de um AND (objeto)', { AND: { clubeId: CLUBE } }],
  ['chave composta clubeId_*', { clubeId_id: { clubeId: CLUBE, id: 'x' } }],
]

describe('guarda de clube: modelos de clube', () => {
  it('a lista de modelos de clube e a do SPEC 5.1', () => {
    expect([...MODELOS_DE_CLUBE].sort()).toEqual(
      [
        'ClasseClube',
        'CriterioRanking',
        'Desbravador',
        'MatriculaClasse',
        'MembroUnidade',
        'RequisitoAjuste',
        'Unidade',
        'Vinculo',
        'VinculoUnidade',
      ].sort(),
    )
    expect([...MODELOS_MISTOS].sort()).toEqual(['Classe', 'Especialidade'])
  })

  describe.each([...MODELOS_DE_CLUBE])('%s', (modelo) => {
    describe.each([...OPERACOES_COM_WHERE])('%s', (operacao) => {
      it.each(WHERES_RECUSADOS)('lanca com %s', (_titulo, where) => {
        expect(() => verificarEscopo(modelo, operacao, argumentos(operacao, where))).toThrow(
          ErroEscopoClube,
        )
      })

      it.each(WHERES_ACEITOS)('passa com %s', (_titulo, where) => {
        expect(() => verificarEscopo(modelo, operacao, argumentos(operacao, where))).not.toThrow()
      })
    })

    it('lanca ao chamar sem args', () => {
      expect(() => verificarEscopo(modelo, 'findMany', undefined)).toThrow(ErroEscopoClube)
    })

    it('upsert lanca quando o create nao traz o clubeId', () => {
      expect(() =>
        verificarEscopo(modelo, 'upsert', { where: { clubeId: CLUBE }, create: {}, update: {} }),
      ).toThrow(ErroEscopoClube)
    })

    it('create exige data.clubeId string UUID', () => {
      expect(() => verificarEscopo(modelo, 'create', { data: {} })).toThrow(ErroEscopoClube)
      expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: undefined } })).toThrow(
        ErroEscopoClube,
      )
      expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: null } })).toThrow(
        ErroEscopoClube,
      )
      expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: 'x' } })).toThrow(
        ErroEscopoClube,
      )
      expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: CLUBE } })).not.toThrow()
    })

    it.each(['createMany', 'createManyAndReturn'])(
      '%s confere item a item, em lista ou objeto',
      (operacao) => {
        const bom = { clubeId: CLUBE }
        expect(() => verificarEscopo(modelo, operacao, { data: [bom, bom] })).not.toThrow()
        expect(() => verificarEscopo(modelo, operacao, { data: bom })).not.toThrow()
        expect(() => verificarEscopo(modelo, operacao, { data: [bom, {}] })).toThrow(
          ErroEscopoClube,
        )
        expect(() => verificarEscopo(modelo, operacao, { data: [bom, { clubeId: 'x' }] })).toThrow(
          ErroEscopoClube,
        )
      },
    )
  })
})

describe('guarda de clube: modelos mistos', () => {
  const OR_EXATO = [{ clubeId: null }, { clubeId: CLUBE }]

  describe.each([...MODELOS_MISTOS])('%s', (modelo) => {
    describe.each([...OPERACOES_COM_WHERE])('%s', (operacao) => {
      it('passa com clubeId string', () => {
        expect(() =>
          verificarEscopo(modelo, operacao, argumentos(operacao, { clubeId: CLUBE })),
        ).not.toThrow()
      })

      if (OPERACOES_DE_LEITURA.includes(operacao)) {
        it('leitura passa com o OR exato', () => {
          expect(() =>
            verificarEscopo(modelo, operacao, argumentos(operacao, { OR: OR_EXATO, id: 'x' })),
          ).not.toThrow()
        })
      } else {
        it('escrita lanca com o OR exato (exige clubeId no where)', () => {
          expect(() =>
            verificarEscopo(modelo, operacao, argumentos(operacao, { OR: OR_EXATO, id: 'x' })),
          ).toThrow(ErroEscopoClube)
        })
      }

      it.each([
        ['sem escopo', undefined],
        ['OR so com o clube', { OR: [{ clubeId: CLUBE }] }],
        ['OR so com null', { OR: [{ clubeId: null }] }],
        ['OR com {in}', { OR: [{ clubeId: null }, { clubeId: { in: [CLUBE] } }] }],
        ['OR com um terceiro item', { OR: [{ clubeId: null }, { clubeId: CLUBE }, { id: 'x' }] }],
        ['OR com dois clubes', { OR: [{ clubeId: CLUBE }, { clubeId: OUTRO_CLUBE }] }],
        ['OR fora de ordem', { OR: [{ clubeId: CLUBE }, { clubeId: null }] }],
        ['clubeId null sozinho', { clubeId: null }],
        ['OR dentro de um AND', { AND: [{ OR: OR_EXATO }] }],
      ])('lanca com %s', (_titulo, where) => {
        expect(() => verificarEscopo(modelo, operacao, argumentos(operacao, where))).toThrow(
          ErroEscopoClube,
        )
      })
    })

    it('create exige clubeId string UUID', () => {
      expect(() => verificarEscopo(modelo, 'create', { data: {} })).toThrow(ErroEscopoClube)
      expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: CLUBE } })).not.toThrow()
    })
  })
})

describe('guarda de clube: fora do escopo da guarda e escrita aninhada', () => {
  const relacoes = relacoesDoClient(new PrismaSistema())

  it.each(['Usuario', 'Clube', 'TokenUsoUnico', 'RefreshToken', 'Requisito', 'Mestrado'])(
    '%s nao e vigiado',
    (modelo) => {
      expect(() => verificarEscopo(modelo, 'findMany', {})).not.toThrow()
      expect(() => verificarEscopo(modelo, 'create', { data: { nome: 'x' } })).not.toThrow()
    },
  )

  it('recusa escrita aninhada de modelo de clube, no pai de clube ou global', () => {
    expect(() =>
      verificarEscopo('Desbravador', 'create', {
        data: { clubeId: CLUBE, membros: { create: { clubeId: CLUBE } } },
      }, relacoes),
    ).toThrow(ErroEscopoClube)
    expect(() =>
      verificarEscopo('Usuario', 'create', { data: { vinculos: { create: { clubeId: CLUBE } } } }, relacoes),
    ).toThrow(ErroEscopoClube)
    expect(() =>
      verificarEscopo('Unidade', 'update', {
        where: { clubeId: CLUBE },
        data: { membros: { deleteMany: {} } },
      }, relacoes),
    ).toThrow(ErroEscopoClube)
  })

  it('aceita connect e escrita aninhada de modelo que nao e de clube', () => {
    expect(() =>
      verificarEscopo('Desbravador', 'create', {
        data: { clubeId: CLUBE, usuario: { connect: { id: 'x' } } },
      }, relacoes),
    ).not.toThrow()
    expect(() =>
      verificarEscopo('Usuario', 'create', { data: { tokens: { create: { finalidade: 'CONVITE' } } } }, relacoes),
    ).not.toThrow()
  })
})

describe('guarda de clube: escrita aninhada em qualquer profundidade', () => {
  const relacoes = relacoesDoClient(new PrismaSistema())
  const vinculoDoOutroClube = { create: { clubeId: OUTRO_CLUBE, papel: 'ADM' } }

  it('recusa clube alcancado atraves de modelo global (Desbravador > Usuario > Vinculo)', () => {
    expect(() =>
      verificarEscopo(
        'Desbravador',
        'update',
        { where: { clubeId: CLUBE, id: 'x' }, data: { usuario: { update: { vinculos: vinculoDoOutroClube } } } },
        relacoes,
      ),
    ).toThrow(ErroEscopoClube)
  })

  it('recusa atraves de filhos sem clubeId (Classe > SecaoRequisito > Requisito > RequisitoAjuste)', () => {
    expect(() =>
      verificarEscopo(
        'Classe',
        'update',
        {
          where: { clubeId: CLUBE },
          data: {
            secoes: {
              update: {
                where: { id: 'x' },
                data: { requisitos: { update: { where: { id: 'y' }, data: { ajustes: vinculoDoOutroClube } } } },
              },
            },
          },
        },
        relacoes,
      ),
    ).toThrow(ErroEscopoClube)
  })

  it('recusa em create dentro de connectOrCreate e upsert aninhados', () => {
    expect(() =>
      verificarEscopo(
        'Usuario',
        'update',
        { where: { id: 'x' }, data: { desbravadores: { upsert: { where: { id: 'y' }, create: {}, update: {} } } } },
        relacoes,
      ),
    ).toThrow(ErroEscopoClube)
    expect(() =>
      verificarEscopo(
        'Usuario',
        'update',
        { where: { id: 'x' }, data: { vinculos: { connectOrCreate: { where: { id: 'y' }, create: {} } } } },
        relacoes,
      ),
    ).toThrow(ErroEscopoClube)
  })

  it.each(['set', 'connect', 'disconnect'])('recusa %s aninhado que alcanca modelo de clube', (operacao) => {
    expect(() =>
      verificarEscopo('Usuario', 'update', { where: { id: 'x' }, data: { vinculos: { [operacao]: [{ id: 'y' }] } } }, relacoes),
    ).toThrow(ErroEscopoClube)
  })

  it('aceita aninhado que so alcanca modelos fora da guarda', () => {
    expect(() =>
      verificarEscopo(
        'Usuario',
        'update',
        { where: { id: 'x' }, data: { tokens: { create: { finalidade: 'SENHA' } }, refreshTokens: { deleteMany: {} } } },
        relacoes,
      ),
    ).not.toThrow()
  })
})

describe('guarda de clube: o data nao troca o clube', () => {
  it.each([...MODELOS_DE_CLUBE, ...MODELOS_MISTOS])('%s: update e updateMany', (modelo) => {
    for (const operacao of ['update', 'updateMany']) {
      const where = { clubeId: CLUBE }
      expect(() => verificarEscopo(modelo, operacao, { where, data: { clubeId: OUTRO_CLUBE } })).toThrow(ErroEscopoClube)
      expect(() => verificarEscopo(modelo, operacao, { where, data: { clubeId: { set: OUTRO_CLUBE } } })).toThrow(
        ErroEscopoClube,
      )
      expect(() => verificarEscopo(modelo, operacao, { where, data: { clubeId: null } })).toThrow(ErroEscopoClube)
      expect(() => verificarEscopo(modelo, operacao, { where, data: { clubeId: CLUBE } })).not.toThrow()
      expect(() => verificarEscopo(modelo, operacao, { where, data: { clubeId: undefined } })).not.toThrow()
      expect(() => verificarEscopo(modelo, operacao, { where, data: {} })).not.toThrow()
    }
  })

  it.each([...MODELOS_DE_CLUBE, ...MODELOS_MISTOS])('%s: upsert confere create e update contra o where', (modelo) => {
    const where = { clubeId: CLUBE }
    expect(() => verificarEscopo(modelo, 'upsert', { where, create: { clubeId: OUTRO_CLUBE }, update: {} })).toThrow(
      ErroEscopoClube,
    )
    expect(() => verificarEscopo(modelo, 'upsert', { where, create: { clubeId: CLUBE }, update: { clubeId: OUTRO_CLUBE } })).toThrow(
      ErroEscopoClube,
    )
    expect(() => verificarEscopo(modelo, 'upsert', { where, create: { clubeId: CLUBE }, update: { clubeId: CLUBE } })).not.toThrow()
  })

  it('compara com o clube do where mesmo na chave composta ou dentro do AND', () => {
    expect(() =>
      verificarEscopo('Desbravador', 'update', {
        where: { clubeId_id: { clubeId: CLUBE, id: 'x' } },
        data: { clubeId: OUTRO_CLUBE },
      }),
    ).toThrow(ErroEscopoClube)
    expect(() =>
      verificarEscopo('Desbravador', 'updateMany', { where: { AND: [{ clubeId: CLUBE }] }, data: { clubeId: OUTRO_CLUBE } }),
    ).toThrow(ErroEscopoClube)
  })
})

describe('guarda de clube: a relacao `clube` no data e proibida', () => {
  const ligarAoOutro = { clube: { connect: { id: OUTRO_CLUBE } } }
  const desligar = { clube: { disconnect: true } }

  it.each(['Vinculo', 'Desbravador'])('%s: connect para outro clube em update, updateMany e upsert', (modelo) => {
    const where = { clubeId: CLUBE }
    expect(() => verificarEscopo(modelo, 'update', { where, data: ligarAoOutro })).toThrow(ErroEscopoClube)
    expect(() => verificarEscopo(modelo, 'updateMany', { where, data: ligarAoOutro })).toThrow(ErroEscopoClube)
    expect(() => verificarEscopo(modelo, 'upsert', { where, create: { clubeId: CLUBE }, update: ligarAoOutro })).toThrow(
      ErroEscopoClube,
    )
    expect(() =>
      verificarEscopo(modelo, 'upsert', { where, create: { clubeId: CLUBE, ...ligarAoOutro }, update: {} }),
    ).toThrow(ErroEscopoClube)
  })

  it.each(['Classe', 'Especialidade'])('%s: disconnect (virar oficial) em update e upsert', (modelo) => {
    const where = { clubeId: CLUBE }
    expect(() => verificarEscopo(modelo, 'update', { where, data: desligar })).toThrow(ErroEscopoClube)
    expect(() => verificarEscopo(modelo, 'upsert', { where, create: { clubeId: CLUBE }, update: desligar })).toThrow(
      ErroEscopoClube,
    )
  })

  it.each([...MODELOS_DE_CLUBE, ...MODELOS_MISTOS])('%s: connect no create e no createMany', (modelo) => {
    expect(() => verificarEscopo(modelo, 'create', { data: { clubeId: CLUBE, ...ligarAoOutro } })).toThrow(ErroEscopoClube)
    expect(() => verificarEscopo(modelo, 'createMany', { data: [{ clubeId: CLUBE, ...ligarAoOutro }] })).toThrow(
      ErroEscopoClube,
    )
  })

  it('modelos fora da guarda continuam livres para usar a relacao `clube`', () => {
    expect(() => verificarEscopo('Usuario', 'update', { where: { id: 'x' }, data: ligarAoOutro })).not.toThrow()
  })
})
