const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function nomePublico(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeiro = partes[0] ?? ''
  const sobrenomes = partes.slice(1).filter((parte) => !PARTICULAS.has(parte.toLowerCase()))
  const ultimo = sobrenomes[sobrenomes.length - 1]
  if (!ultimo) return primeiro
  return `${primeiro} ${ultimo.charAt(0).toUpperCase()}.`
}

const SUFIXOS = new Set(['filho', 'filha', 'júnior', 'junior', 'jr.', 'neto', 'neta', 'sobrinho', 'sobrinha', 'segundo', 'terceiro'])

/** Primeiro nome e último sobrenome, sem partículas; um sufixo de família (Filho, Júnior…) vem junto do sobrenome. */
export function primeiroEUltimoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeiro = partes[0] ?? ''
  const sobrenomes = partes.slice(1).filter((parte) => !PARTICULAS.has(parte.toLowerCase()))
  const ultimo = sobrenomes[sobrenomes.length - 1]
  if (!ultimo) return primeiro
  const penultimo = sobrenomes[sobrenomes.length - 2]
  const comSufixo = SUFIXOS.has(ultimo.toLowerCase()) && penultimo
  return [primeiro, comSufixo ? penultimo : undefined, ultimo].filter(Boolean).join(' ')
}
