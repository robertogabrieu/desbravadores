import { idade } from '../datas'

/** A classe do ano é a da idade completada até este dia ("MM-DD") do ano do clube. */
export const DIA_DE_CORTE_DA_CLASSE = '06-30'

/** Faz 11 no 1º semestre → começa o ano do clube em Companheiro; no 2º, ainda é Amigo naquele ano. */
export function idadeDaClasse(nascimento: string, anoClube: number): number {
  return idade(nascimento, `${anoClube}-${DIA_DE_CORTE_DA_CLASSE}`)
}
