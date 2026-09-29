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
      it('passa com o OR exato e com clubeId string', () => {
        expect(() =>
          verificarEscopo(modelo, operacao, argumentos(operacao, { OR: OR_EXATO, id: 'x' })),
        ).not.toThrow()
        expect(() =>
          verificarEscopo(modelo, operacao, argumentos(operacao, { clubeId: CLUBE })),
        ).not.toThrow()
      })

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
