import { Prisma } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'
import { paraDataCivil } from '../desbravadores/apoio'
import type { RelogioDoClube } from '../desbravadores/escopo.service'

/** "AAAA-MM-DD" -> "dd/mm", como a tela mostra as datas de conclusao. */
export function diaEMes(dataCivil: string): string {
  const [, mes, dia] = dataCivil.split('-')
  return `${dia}/${mes}`
}

/** F8: a conclusao cai entre o inicio do ano do clube corrente e hoje. */
export function exigirDataDoAnoCorrente(relogio: RelogioDoClube, data: string): void {
  const inicio = `${relogio.anoClube}-${relogio.inicioAnoClube}`
  if (data < inicio || data > relogio.hoje) {
    throw new ErroApp('REGRA', `A data precisa estar entre ${diaEMes(inicio)} e ${diaEMes(relogio.hoje)}.`)
  }
}

export function jaConcluido(data: Date): ErroApp {
  return new ErroApp('CONFLITO', `Já concluído em ${diaEMes(paraDataCivil(data))}.`)
}

/** Corrida de duas marcacoes: o indice parcial de "conclusao ativa" recusa a segunda. */
export function ehViolacaoUnica(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}
