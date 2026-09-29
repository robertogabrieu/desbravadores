export function variavel(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variavel de ambiente ${nome} ausente`)
  return valor
}
