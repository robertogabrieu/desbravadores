import { idade } from '../datas'

/** Dia ("MM-DD") que decide a idade do ano: a da classe (ano do clube) e a da Diretoria (ano civil). */
export const DIA_DE_CORTE_DO_ANO = '06-30'

/** Faz 11 no 1º semestre → começa o ano do clube em Companheiro; no 2º, ainda é Amigo naquele ano. */
export function idadeDaClasse(nascimento: string, anoClube: number): number {
  return idade(nascimento, `${anoClube}-${DIA_DE_CORTE_DO_ANO}`)
}
