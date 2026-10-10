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
  'Reuniao',
  'Chamada',
  'ChamadaAlteracao',
  'LancamentoPontos',
  'Arquivo',
  'Album',
  'Foto',
  'PedidoAoAdm',
  'EnvioProcessado',
  'EventoCalendario',
  'Cronograma',
  'CronogramaPublicacao',
  'AulaPlanejada',
  'AulaRequisito',
  'RegistroAula',
  'PresencaAula',
  'EnvioAulaProcessado',
  'RequisitoConcluido',
  'EspecialidadeConcluida',
  'Observacao',
  'Material',
  'Notificacao',
  'Atividade',
  'ConviteAcesso',
  'TarefaCasa',
  'TarefaItem',
  'EdicaoClasseBiblica',
  'GrupoClasseBiblica',
  'GrupoUnidadeClasseBiblica',
  'EncontroClasseBiblica',
  'ChamadaClasseBiblica',
  'PresencaClasseBiblica',
  'EnvioClasseBiblicaProcessado',
] as const

/** Modelos que podem ser oficiais (`clubeId` nulo) ou de um clube. */
export const MODELOS_MISTOS = ['Classe', 'Especialidade'] as const

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const OPERACOES_DE_CRIACAO = ['create', 'createMany', 'createManyAndReturn']

const OPERACOES_DE_LEITURA = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]

const OPERACOES_DE_ATUALIZACAO = ['update', 'updateMany', 'updateManyAndReturn']

const ESCRITAS_ANINHADAS = [
  'create',
  'createMany',
  'connectOrCreate',
  'upsert',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'set',
  'connect',
  'disconnect',
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
function clubeDoWhere(where: unknown): string | undefined {
  if (!ehObjeto(where)) return undefined
  if (ehUuid(where['clubeId'])) return where['clubeId']
  for (const [chave, valor] of Object.entries(where)) {
    if (chave.startsWith('clubeId_') && ehObjeto(valor) && ehUuid(valor['clubeId'])) return valor['clubeId']
  }
  const and = where['AND']
  const filhos = Array.isArray(and) ? and : and === undefined ? [] : [and]
  for (const filho of filhos) {
    const clube = clubeDoWhere(filho)
    if (clube) return clube
  }
  return undefined
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

/**
 * Escrita aninhada que alcanca modelo de clube, em qualquer profundidade e atravessando
 * modelos globais e filhos: proibida (SPEC 6.3).
 */
function verificarEscritaAninhada(modelo: string, operacao: string, data: unknown, relacoes: Relacoes): void {
  const camposDoModelo = relacoes.get(modelo)
  for (const item of itensDeData(data)) {
    if (!ehObjeto(item) || !camposDoModelo) continue
    for (const [campo, valor] of Object.entries(item)) {
      const filho = camposDoModelo.get(campo)
      if (!filho || !ehObjeto(valor)) continue
      for (const [escrita, carga] of Object.entries(valor)) {
        if (!ESCRITAS_ANINHADAS.includes(escrita)) continue
        if (ehModeloDeClube(filho) || ehModeloMisto(filho)) {
          throw new ErroEscopoClube(
            modelo,
            operacao,
            `escreve ${filho} por ${campo}; crie em separado, dentro da transacao`,
          )
        }
        for (const parte of itensDeData(carga)) {
          if (!ehObjeto(parte)) continue
          for (const dados of [parte, parte['data'], parte['create'], parte['update']]) {
            verificarEscritaAninhada(filho, operacao, dados, relacoes)
          }
        }
      }
    }
  }
}

/** O clube so entra pelo campo `clubeId`; a relacao `clube` (connect/disconnect) contornaria a conferencia. */
function proibirRelacaoClube(modelo: string, operacao: string, data: unknown): void {
  for (const item of itensDeData(data)) {
    if (ehObjeto(item) && item['clube'] !== undefined) {
      throw new ErroEscopoClube(modelo, operacao, 'nao pode escrever a relacao `clube`; use data.clubeId')
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

/** `data.clubeId`, quando informado, nao pode levar a linha para outro clube. */
function exigirMesmoClube(modelo: string, operacao: string, data: unknown, clube: string): void {
  if (!ehObjeto(data) || data['clubeId'] === undefined) return
  const informado = data['clubeId']
  const valor = ehObjeto(informado) && 'set' in informado ? informado['set'] : informado
  if (valor !== clube) {
    throw new ErroEscopoClube(modelo, operacao, 'data.clubeId diferente do clubeId do where')
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

  for (const campo of ['data', 'create', 'update']) {
    proibirRelacaoClube(modelo, operacao, argumentos[campo])
  }

  if (OPERACOES_DE_CRIACAO.includes(operacao)) {
    exigirClubeNosItens(modelo, operacao, argumentos['data'])
    return
  }

  const where = argumentos['where']
  // O OR de oficial-ou-do-clube so serve para ler; escrever exige o clube como nos modelos de clube.
  const leitura = OPERACOES_DE_LEITURA.includes(operacao)
  const clube = clubeDoWhere(where)
  if (!clube && !(misto && leitura && ehOrOficialOuDoClube(where))) {
    const aceito = misto && leitura ? 'clubeId string UUID ou OR [{clubeId: null}, {clubeId}]' : 'clubeId string UUID'
    throw new ErroEscopoClube(modelo, operacao, `precisa de ${aceito} no where`)
  }
  if (!clube) return
  if (OPERACOES_DE_ATUALIZACAO.includes(operacao)) exigirMesmoClube(modelo, operacao, argumentos['data'], clube)
  if (operacao === 'upsert') {
    exigirClubeNosItens(modelo, operacao, argumentos['create'])
    exigirMesmoClube(modelo, operacao, argumentos['create'], clube)
    exigirMesmoClube(modelo, operacao, argumentos['update'], clube)
  }
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
