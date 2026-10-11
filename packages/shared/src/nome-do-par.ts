/** Nome do cronograma/aula do par: "<regular> + <avançada>"; sem avançada, o da regular. */
export function nomeDoPar(regular: string, avancada: string | null | undefined): string {
  return avancada ? `${regular} + ${avancada}` : regular
}
