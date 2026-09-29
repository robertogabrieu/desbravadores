const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function nomePublico(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeiro = partes[0] ?? ''
  const sobrenomes = partes.slice(1).filter((parte) => !PARTICULAS.has(parte.toLowerCase()))
  const ultimo = sobrenomes[sobrenomes.length - 1]
  if (!ultimo) return primeiro
  return `${primeiro} ${ultimo.charAt(0).toUpperCase()}.`
}
