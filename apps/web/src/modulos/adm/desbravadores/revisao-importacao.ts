import { AVISOS_IMPORTACAO, avisoDeSexoDaUnidade, errosDaLinhaImportada, errosEmLista } from '@desbravadores/shared'
import type { ErroDaLinha, ErrosPorLinha, LinhaDaPreviaImportacao, LinhaParaConfirmar, LinhaParaImportar } from '../../../api/importacao'

export interface LinhaEmRevisao extends LinhaDaPreviaImportacao {
  marcada: boolean
  /**
   * Erros da última confirmação recusada. Ficam à parte dos `erros`, que a tela refaz a cada edição:
   * cada um só some quando o Adm mexe no campo dele.
   */
  errosDoServidor: ErroDaLinha[]
}

export type CampoEditavel = Exclude<keyof LinhaParaImportar, 'linha'>

interface UnidadeParaAviso {
  id: string
  nome: string
  tipo: 'MISTA' | 'MASCULINA' | 'FEMININA'
}

/** Avisos que perdem o sentido quando o Adm mexe no campo: a escolha dele substitui a da planilha. */
const AVISOS_DO_CAMPO: Partial<Record<CampoEditavel, string[]>> = {
  unidadeId: [AVISOS_IMPORTACAO.unidadeInexistente, AVISOS_IMPORTACAO.sexoUnidade],
  classeId: [AVISOS_IMPORTACAO.classeInexistente, AVISOS_IMPORTACAO.classeSugerida],
  sexo: [AVISOS_IMPORTACAO.sexoUnidade],
}

/** Campo a que cada aviso da prévia se refere; `null` quando é da linha inteira. */
export const CAMPO_DO_AVISO: Partial<Record<string, CampoEditavel | null>> = {
  [AVISOS_IMPORTACAO.duplicado]: null,
  [AVISOS_IMPORTACAO.unidadeInexistente]: 'unidadeId',
  [AVISOS_IMPORTACAO.sexoUnidade]: 'unidadeId',
  [AVISOS_IMPORTACAO.classeInexistente]: 'classeId',
  [AVISOS_IMPORTACAO.classeSugerida]: 'classeId',
}

/** Editar estes campos muda quem a pessoa é: o erro de pessoa repetida deixa de valer. */
const CAMPOS_DA_PESSOA: readonly CampoEditavel[] = ['nome', 'nascimento']

/** Linha com erro não entra; duplicada chega desmarcada para o Adm decidir. */
export function paraRevisao(linhas: LinhaDaPreviaImportacao[]): LinhaEmRevisao[] {
  return linhas.map((linha) => ({ ...linha, errosDoServidor: [], marcada: linha.erros.length === 0 && !linha.duplicado }))
}

/** Todos os erros da linha, os da tela e os da última recusa. */
export const todosOsErros = (linha: LinhaEmRevisao): ErroDaLinha[] => [...linha.erros, ...linha.errosDoServidor]

/** Erro de campo impede marcar a linha; o de linha inteira (pessoa repetida) não: marcar é importar assim mesmo. */
export const bloqueada = (linha: Pick<LinhaEmRevisao, 'erros' | 'errosDoServidor'>): boolean =>
  linha.erros.length > 0 || linha.errosDoServidor.some((erro) => erro.campo !== null)

/** Troca o valor da célula e refaz a validação só daquela linha. */
export function editarCelula<C extends CampoEditavel>(
  linha: LinhaEmRevisao,
  campo: C,
  valor: LinhaParaImportar[C],
  unidades: UnidadeParaAviso[],
): LinhaEmRevisao {
  const editada = { ...linha, [campo]: valor }
  const erros = errosEmLista(errosDaLinhaImportada(editada))
  const errosDoServidor = linha.errosDoServidor.filter(
    (erro) => erro.campo !== campo && !(erro.campo === null && CAMPOS_DA_PESSOA.includes(campo)),
  )
  const descartados: readonly string[] = AVISOS_DO_CAMPO[campo] ?? []
  const avisos = editada.avisos.filter((aviso) => !descartados.includes(aviso.codigo))
  if (campo === 'unidadeId' || campo === 'sexo') {
    const unidade = unidades.find((item) => item.id === editada.unidadeId)
    const avisoDeSexo = unidade && editada.sexo ? avisoDeSexoDaUnidade(unidade, editada.sexo) : undefined
    if (avisoDeSexo) avisos.push(avisoDeSexo)
  }
  const agoraBloqueada = bloqueada({ erros, errosDoServidor })
  const corrigida = bloqueada(linha) && !agoraBloqueada && !linha.duplicado
  return { ...editada, erros, errosDoServidor, avisos, marcada: agoraBloqueada ? false : corrigida || linha.marcada }
}

/** Marcar ou desmarcar é a resposta do Adm ao erro de linha inteira: ele some. */
export function marcarLinha(linha: LinhaEmRevisao, marcada: boolean): LinhaEmRevisao {
  return { ...linha, marcada, errosDoServidor: linha.errosDoServidor.filter((erro) => erro.campo !== null) }
}

/**
 * A confirmação recusada devolve os erros por linha: eles entram na grade e desmarcam a linha. O erro
 * de linha inteira é o de pessoa repetida, e a linha passa a contar como duplicada — marcá-la de novo
 * é importar assim mesmo.
 */
export function aplicarRecusa(linhas: LinhaEmRevisao[], erros: ErrosPorLinha): LinhaEmRevisao[] {
  const porLinha = new Map(erros.map((erro) => [erro.linha, erro.mensagens]))
  return linhas.map((linha) => {
    const mensagens = porLinha.get(linha.linha)
    if (!mensagens) return linha
    const repetida = mensagens.some((mensagem) => mensagem.campo === null)
    return { ...linha, errosDoServidor: mensagens, duplicado: linha.duplicado || repetida, marcada: false }
  })
}

export function contar(linhas: LinhaEmRevisao[]) {
  const comErro = linhas.filter((linha) => todosOsErros(linha).length > 0).length
  const comAviso = linhas.filter((linha) => todosOsErros(linha).length === 0 && linha.avisos.length > 0).length
  return { prontas: linhas.length - comErro - comAviso, comAviso, comErro }
}

/** Só as linhas marcadas vão; a duplicada marcada leva a marca de que o Adm quis importar assim mesmo. */
export function paraEnvio({
  linha,
  nome,
  nascimento,
  sexo,
  unidadeId,
  classeId,
  responsavelNome,
  responsavelTelefone,
  responsavelEmail,
  entradaEm,
  duplicado,
}: LinhaEmRevisao): LinhaParaConfirmar {
  return {
    linha,
    nome,
    nascimento,
    sexo,
    unidadeId,
    classeId,
    responsavelNome,
    responsavelTelefone,
    responsavelEmail,
    entradaEm,
    importarMesmoRepetido: duplicado,
  }
}
