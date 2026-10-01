import { z } from 'zod'
import { Sexo, type TipoUnidade } from '../enums'
import { Aviso, DataCivil, Email } from './comum'

export const LIMITE_LINHAS_IMPORTACAO = 500
export const LIMITE_BYTES_IMPORTACAO = 3 * 1024 * 1024
export const MENSAGEM_PLANILHA_GRANDE = 'A planilha precisa ter até 3 MB.'
export const MENSAGEM_JA_EXISTE_NO_CLUBE = 'Já existe no clube um desbravador com este nome e nascimento.'
export const mensagemRepetidaNaPlanilha = (linha: number): string => `Esta pessoa já aparece na linha ${linha} da planilha.`

export const CampoDaLinhaImportada = z.enum([
  'nome',
  'nascimento',
  'sexo',
  'unidadeId',
  'classeId',
  'responsavelNome',
  'responsavelTelefone',
  'responsavelEmail',
  'entradaEm',
])

/** Erro de uma linha, preso ao campo que o causa; `campo` nulo quando é da linha inteira (a pessoa repetida). */
export const ErroDeCampo = z.object({ campo: CampoDaLinhaImportada.nullable(), mensagem: z.string() })

/**
 * Uma pessoa da planilha, já convertida. Os campos que a tela edita chegam soltos (texto) de
 * propósito: a confirmação devolve o erro por linha, em vez de recusar o pedido inteiro.
 */
export const LinhaImportada = z.object({
  linha: z.number().int().min(1),
  nome: z.string(),
  nascimento: z.string(), // "AAAA-MM-DD"; vazio quando a planilha não trouxe data legível
  sexo: Sexo.or(z.literal('')),
  unidadeId: z.string().nullable(),
  classeId: z.string().nullable(),
  responsavelNome: z.string().nullable(),
  responsavelTelefone: z.string().nullable(),
  responsavelEmail: z.string().nullable(),
  entradaEm: z.string(),
})

export const LinhaDaPrevia = LinhaImportada.extend({
  erros: z.array(ErroDeCampo),
  avisos: z.array(Aviso),
  duplicado: z.boolean(),
})

export const PreviaImportacao = z.object({
  colunasFaltando: z.array(z.string()),
  linhas: z.array(LinhaDaPrevia),
})

/**
 * Linha enviada na confirmação. `importarMesmoRepetido` é o Adm dizendo que viu o aviso de pessoa
 * repetida e quer importar assim mesmo; sem ele, a repetida recusa a confirmação inteira.
 */
export const LinhaConfirmada = LinhaImportada.extend({ importarMesmoRepetido: z.boolean() })

export const ImportacaoEntrada = z.object({
  linhas: z.array(LinhaConfirmada).min(1).max(LIMITE_LINHAS_IMPORTACAO),
})

export const ImportacaoSaida = z.object({ importados: z.number().int() })

export const ErroDeLinha = z.object({ linha: z.number().int(), mensagens: z.array(ErroDeCampo) })

/** Corpo do 422 da confirmação: nada foi gravado, e cada linha diz o que corrigir. */
export const ImportacaoRecusada = z.object({
  codigo: z.literal('REGRA'),
  mensagem: z.string(),
  erros: z.array(ErroDeLinha),
})

export const AVISOS_IMPORTACAO = {
  duplicado: 'AVISO_DUPLICADO',
  unidadeInexistente: 'AVISO_UNIDADE_INEXISTENTE',
  classeInexistente: 'AVISO_CLASSE_INEXISTENTE',
  classeSugerida: 'AVISO_CLASSE_SUGERIDA',
  sexoUnidade: 'AVISO_SEXO_UNIDADE',
} as const

type CamposDaLinha = Omit<z.infer<typeof LinhaImportada>, 'linha' | 'unidadeId' | 'classeId'>
type CampoDaLinha = z.infer<typeof CampoDaLinhaImportada>

/**
 * Erros de forma de uma linha, por campo — a mesma regra na prévia, na confirmação e na tela que
 * edita a célula. Existência de unidade e classe é do servidor.
 */
export function errosDaLinhaImportada(linha: CamposDaLinha): Partial<Record<keyof CamposDaLinha, string>> {
  const erros: Partial<Record<keyof CamposDaLinha, string>> = {}
  const nome = linha.nome.trim()
  if (nome.length < 2 || nome.length > 120) erros.nome = 'O nome precisa ter de 2 a 120 letras.'
  if (!DataCivil.safeParse(linha.nascimento).success) erros.nascimento = 'Informe a data de nascimento.'
  if (linha.sexo === '') erros.sexo = 'Informe o sexo (M ou F).'
  if (!DataCivil.safeParse(linha.entradaEm).success) erros.entradaEm = 'Informe a data de entrada no clube.'
  if ((linha.responsavelNome ?? '').trim().length > 120) erros.responsavelNome = 'O nome do responsável passa de 120 letras.'
  if ((linha.responsavelTelefone ?? '').trim().length > 30) erros.responsavelTelefone = 'O telefone passa de 30 caracteres.'
  const email = (linha.responsavelEmail ?? '').trim()
  if (email && !Email.safeParse(email).success) erros.responsavelEmail = `E-mail inválido: ${email}`
  return erros
}

/** Aviso do cadastro (e da importação) quando a unidade é de um sexo só e a pessoa é do outro. */
export function avisoDeSexoDaUnidade(
  unidade: { nome: string; tipo: z.infer<typeof TipoUnidade> },
  sexo: z.infer<typeof Sexo>,
): z.infer<typeof Aviso> | undefined {
  if (unidade.tipo === 'MASCULINA' && sexo === 'F') {
    return { codigo: AVISOS_IMPORTACAO.sexoUnidade, mensagem: `A unidade ${unidade.nome} é masculina.` }
  }
  if (unidade.tipo === 'FEMININA' && sexo === 'M') {
    return { codigo: AVISOS_IMPORTACAO.sexoUnidade, mensagem: `A unidade ${unidade.nome} é feminina.` }
  }
  return undefined
}

/** Erros por campo em lista, na ordem das colunas. */
export function errosEmLista(erros: Partial<Record<CampoDaLinha, string>>): z.infer<typeof ErroDeCampo>[] {
  return CampoDaLinhaImportada.options.flatMap((campo) => {
    const mensagem = erros[campo]
    return mensagem === undefined ? [] : [{ campo, mensagem }]
  })
}
