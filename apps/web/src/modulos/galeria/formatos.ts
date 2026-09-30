/** "2030-09-20" vira "20/09". */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

export const contarFotos = (total: number): string => `${total} ${total === 1 ? 'foto' : 'fotos'}`

/** "Thiago" ou "Thiago e mais 2"; vazio quando ninguém enviou. */
export function quemEnviou(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  return `${nomes[0]} e mais ${nomes.length - 1}`
}
