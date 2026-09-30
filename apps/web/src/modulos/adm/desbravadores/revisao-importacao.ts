import { AVISOS_IMPORTACAO, avisoDeSexoDaUnidade, errosDaLinhaImportada } from '@desbravadores/shared'
import type { ErrosPorLinha, LinhaDaPreviaImportacao, LinhaParaImportar } from '../../../api/importacao'

export interface LinhaEmRevisao extends LinhaDaPreviaImportacao {
  marcada: boolean
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

/** Linha com erro não entra; duplicada chega desmarcada para o Adm decidir. */
export function paraRevisao(linhas: LinhaDaPreviaImportacao[]): LinhaEmRevisao[] {
  return linhas.map((linha) => ({ ...linha, marcada: linha.erros.length === 0 && !linha.duplicado }))
}

/** Troca o valor da célula e refaz a validação só daquela linha. */
export function editarCelula<C extends CampoEditavel>(
  linha: LinhaEmRevisao,
  campo: C,
  valor: LinhaParaImportar[C],
  unidades: UnidadeParaAviso[],
): LinhaEmRevisao {
  const editada = { ...linha, [campo]: valor }
  const erros = Object.values(errosDaLinhaImportada(editada))
  const descartados: readonly string[] = AVISOS_DO_CAMPO[campo] ?? []
  const avisos = editada.avisos.filter((aviso) => !descartados.includes(aviso.codigo))
  if (campo === 'unidadeId' || campo === 'sexo') {
    const unidade = unidades.find((item) => item.id === editada.unidadeId)
    const avisoDeSexo = unidade && editada.sexo ? avisoDeSexoDaUnidade(unidade, editada.sexo) : undefined
    if (avisoDeSexo) avisos.push(avisoDeSexo)
  }
  const corrigida = linha.erros.length > 0 && erros.length === 0 && !linha.duplicado
  return { ...editada, erros, avisos, marcada: erros.length > 0 ? false : corrigida || linha.marcada }
}

/** A confirmação recusada devolve os erros por linha: eles entram na grade e desmarcam a linha. */
export function aplicarRecusa(linhas: LinhaEmRevisao[], erros: ErrosPorLinha): LinhaEmRevisao[] {
  const porLinha = new Map(erros.map((erro) => [erro.linha, erro.mensagens]))
  return linhas.map((linha) => {
    const mensagens = porLinha.get(linha.linha)
    return mensagens ? { ...linha, erros: mensagens, marcada: false } : linha
  })
}

export function contar(linhas: LinhaEmRevisao[]) {
  const comErro = linhas.filter((linha) => linha.erros.length > 0).length
  const comAviso = linhas.filter((linha) => linha.erros.length === 0 && linha.avisos.length > 0).length
  return { prontas: linhas.length - comErro - comAviso, comAviso, comErro }
}

export function paraEnvio({ linha, nome, nascimento, sexo, unidadeId, classeId, responsavelNome, responsavelTelefone, responsavelEmail, entradaEm }: LinhaEmRevisao): LinhaParaImportar {
  return { linha, nome, nascimento, sexo, unidadeId, classeId, responsavelNome, responsavelTelefone, responsavelEmail, entradaEm }
}
