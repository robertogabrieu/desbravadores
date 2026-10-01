/** Quem completa esta idade até 30/06 do ano civil é da Diretoria o ano inteiro, desde janeiro. */
export const IDADE_DA_DIRETORIA = 16

/** Último nascimento ("AAAA-MM-DD") que entra na Diretoria pela idade no ano civil de `hoje`. */
export function nascimentoLimiteDaDiretoria(hoje: string): string {
  return `${Number(hoje.slice(0, 4)) - IDADE_DA_DIRETORIA}-06-30`
}

/** `hoje` é a data civil no fuso do clube: é ela que decide em que ano estamos. */
export function diretoriaPelaIdade(nascimento: string, hoje: string): boolean {
  return nascimento <= nascimentoLimiteDaDiretoria(hoje)
}
