export const colador = new Intl.Collator('pt-BR')

/** Minusculas e sem acento, para busca por nome. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Coluna `@db.Date` (meia-noite UTC) -> "AAAA-MM-DD". */
export function paraDataCivil(data: Date): string {
  return data.toISOString().slice(0, 10)
}

/** "AAAA-MM-DD" -> valor para coluna `@db.Date`. */
export function daDataCivil(data: string): Date {
  return new Date(`${data}T00:00:00Z`)
}

export function paginar<T>(itens: readonly T[], pagina: number, porPagina: number): T[] {
  return itens.slice((pagina - 1) * porPagina, pagina * porPagina)
}
