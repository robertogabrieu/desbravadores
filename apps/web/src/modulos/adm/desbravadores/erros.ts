import type { z } from 'zod'
import { ErroDaApi } from '../../../api/cliente'

export const MENSAGEM_GENERICA = 'Não foi possível concluir agora. Tente de novo.'

const MENSAGENS_DE_CAMPO: Record<string, string> = {
  nome: 'Informe o nome completo',
  nomePublico: 'O nome público precisa ter de 2 a 40 letras',
  nascimento: 'Informe a data de nascimento',
  sexo: 'Escolha o sexo',
  entradaEm: 'Informe a data de entrada no clube',
  responsavelEmail: 'E-mail do responsável inválido',
  responsavelNome: 'Nome do responsável longo demais',
  responsavelTelefone: 'Telefone do responsável longo demais',
}

/** Erros por campo a partir do que o contrato recusou, com texto em português. */
export function errosDoContrato(problemas: z.core.$ZodIssue[]): Record<string, string> {
  const erros: Record<string, string> = {}
  for (const problema of problemas) {
    const campo = String(problema.path[0] ?? '')
    if (campo && !(campo in erros)) erros[campo] = MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo'
  }
  return erros
}

export interface ErroDeFormulario {
  campos: Record<string, string>
  geral: string | null
}

/** 400 com `campos` cai nos campos; qualquer outro erro vira a mensagem geral do painel. */
export function lerErroDaApi(erro: unknown): ErroDeFormulario {
  if (erro instanceof ErroDaApi) {
    const campos = erro.erro.campos
    if (campos && Object.keys(campos).length > 0) return { campos, geral: null }
    return { campos: {}, geral: erro.erro.mensagem }
  }
  return { campos: {}, geral: MENSAGEM_GENERICA }
}
