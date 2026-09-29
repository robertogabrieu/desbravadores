import { Prisma } from '../../generated/prisma/client.js'

/** Modelos cuja linha e de um clube (SPEC 5.1): todo acesso exige o `clubeId`. */
export const MODELOS_DE_CLUBE = [
  'Vinculo',
  'VinculoUnidade',
  'Desbravador',
  'Unidade',
  'MembroUnidade',
  'MatriculaClasse',
  'CriterioRanking',
  'ClasseClube',
  'RequisitoAjuste',
] as const

/** Modelos que podem ser oficiais (`clubeId` nulo) ou de um clube. */
export const MODELOS_MISTOS = ['Classe', 'Especialidade'] as const

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const OPERACOES_DE_CRIACAO = ['create', 'createMany', 'createManyAndReturn']

const ESCRITAS_ANINHADAS = [
  'create',
  'createMany',
  'connectOrCreate',
  'upsert',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]

export class ErroEscopoClube extends Error {
  constructor(modelo: string, operacao: string, motivo: string) {
    super(`Acesso sem escopo de clube: ${modelo}.${operacao}() ${motivo}`)
    this.name = 'ErroEscopoClube'
  }
}

type Objeto = Record<string, unknown>

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && REGEX_UUID.test(valor)
}

function ehModeloDeClube(modelo: string): boolean {
  return (MODELOS_DE_CLUBE as readonly string[]).includes(modelo)
}

function ehModeloMisto(modelo: string): boolean {
  return (MODELOS_MISTOS as readonly string[]).includes(modelo)
}

/** `clubeId` string UUID no topo do where, numa chave composta `clubeId_*` ou dentro de um `AND`. */
function temClubeNoWhere(where: unknown): boolean {
  if (!ehObjeto(where)) return false
  if (ehUuid(where['clubeId'])) return true
  for (const [chave, valor] of Object.entries(where)) {
    if (chave.startsWith('clubeId_') && ehObjeto(valor) && ehUuid(valor['clubeId'])) return true
  }
  const and = where['AND']
  const filhos = Array.isArray(and) ? and : and === undefined ? [] : [and]
  return filhos.some(temClubeNoWhere)
}

/** Exatamente `OR: [{ clubeId: null }, { clubeId: <uuid> }]`. */
function ehOrOficialOuDoClube(where: unknown): boolean {
  if (!ehObjeto(where)) return false
  const or = where['OR']
  if (!Array.isArray(or) || or.length !== 2) return false
  const [oficial, doClube] = or as unknown[]
  return (
    ehObjeto(oficial) &&
    Object.keys(oficial).length === 1 &&
    oficial['clubeId'] === null &&
    ehObjeto(doClube) &&
    Object.keys(doClube).length === 1 &&
    ehUuid(doClube['clubeId'])
  )
}

function itensDeData(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data]
}

/** Por modelo, o nome de cada campo de relacao e o modelo que ele alcanca. */
export type Relacoes = ReadonlyMap<string, ReadonlyMap<string, string>>

interface ModeloEmTempoDeExecucao {
  fields: { name: string; kind: string; type: string }[]
}

/** Le as relacoes do modelo de dados que o proprio client carrega (`_runtimeDataModel`). */
export function relacoesDoClient(client: object): Relacoes {
  const { _runtimeDataModel: dados } = client as {
    _runtimeDataModel?: { models?: Record<string, ModeloEmTempoDeExecucao> }
  }
  if (!dados?.models) throw new Error('Client do Prisma sem modelo de dados: rode `prisma generate`')
  const relacoes = new Map<string, Map<string, string>>()
  for (const [modelo, definicao] of Object.entries(dados.models)) {
    const campos = new Map<string, string>()
    for (const campo of definicao.fields) {
      if (campo.kind === 'object') campos.set(campo.name, campo.type)
    }
    relacoes.set(modelo, campos)
  }
  return relacoes
}

/** Escrita aninhada que cria, altera ou apaga linha de modelo de clube: proibida (SPEC 6.3). */
function verificarEscritaAninhada(modelo: string, operacao: string, data: unknown, relacoes: Relacoes): void {
  const camposDoModelo = relacoes.get(modelo)
  for (const item of itensDeData(data)) {
    if (!ehObjeto(item) || !camposDoModelo) continue
    for (const [campo, valor] of Object.entries(item)) {
      const filho = camposDoModelo.get(campo)
      if (!filho || !ehObjeto(valor)) continue
      const escreve = Object.keys(valor).some((chave) => ESCRITAS_ANINHADAS.includes(chave))
      if (escreve && (ehModeloDeClube(filho) || ehModeloMisto(filho))) {
        throw new ErroEscopoClube(
          modelo,
          operacao,
          `escreve ${filho} por ${campo}; crie em separado, dentro da transacao`,
        )
      }
    }
  }
}

function exigirClubeNosItens(modelo: string, operacao: string, data: unknown): void {
  for (const item of itensDeData(data)) {
    if (!ehObjeto(item) || !ehUuid(item['clubeId'])) {
      throw new ErroEscopoClube(modelo, operacao, 'precisa de data.clubeId como string UUID')
    }
  }
}

/**
 * Confere se a operacao esta escopada a um clube; lanca `ErroEscopoClube` se nao.
 * Nao preenche nada: quem chama informa o clube.
 */
export function verificarEscopo(
  modelo: string,
  operacao: string,
  args: unknown,
  relacoes: Relacoes = new Map(),
): void {
  const argumentos = ehObjeto(args) ? args : {}
  for (const campo of ['data', 'create', 'update']) {
    verificarEscritaAninhada(modelo, operacao, argumentos[campo], relacoes)
  }

  const deClube = ehModeloDeClube(modelo)
  const misto = ehModeloMisto(modelo)
  if (!deClube && !misto) return

  if (OPERACOES_DE_CRIACAO.includes(operacao)) {
    exigirClubeNosItens(modelo, operacao, argumentos['data'])
    return
  }

  const where = argumentos['where']
  const escopado = temClubeNoWhere(where) || (misto && ehOrOficialOuDoClube(where))
  if (!escopado) {
    const aceito = misto ? 'clubeId string UUID ou OR [{clubeId: null}, {clubeId}]' : 'clubeId string UUID'
    throw new ErroEscopoClube(modelo, operacao, `precisa de ${aceito} no where`)
  }
  if (operacao === 'upsert') exigirClubeNosItens(modelo, operacao, argumentos['create'])
}

export const guardaClube = Prisma.defineExtension((client) => {
  const relacoes = relacoesDoClient(client)
  return client.$extends({
    name: 'guarda-clube',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          verificarEscopo(model, operation, args, relacoes)
          return query(args)
        },
      },
    },
  })
})
