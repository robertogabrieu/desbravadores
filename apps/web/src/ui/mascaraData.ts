const TAMANHO_DOS_BLOCOS = [2, 2, 4]

/** Põe as barras de DD/MM/AAAA conforme a pessoa digita; "/" digitado fecha o bloco, completando com zero ("1/" → "01/"). */
export function mascararData(texto: string): string {
  const blocos = ['']
  for (const caractere of texto) {
    const ultimo = blocos.length - 1
    if (/\d/.test(caractere)) {
      if (blocos[ultimo]!.length === TAMANHO_DOS_BLOCOS[ultimo]) {
        if (ultimo === 2) continue
        blocos.push('')
      }
      blocos[blocos.length - 1] += caractere
    } else if (caractere === '/' && ultimo < 2 && blocos[ultimo] !== '') {
      if (blocos[ultimo]!.length === 1) blocos[ultimo] = `0${blocos[ultimo]}`
      blocos.push('')
    }
  }
  return blocos.join('/')
}

/** `DD/MM/AAAA` → `AAAA-MM-DD`; `null` se incompleto ou se o dia não existe no calendário (31/02). */
export function textoParaIso(texto: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
  if (!partes) return null
  const [dia, mes, ano] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const data = new Date(ano, mes - 1, dia)
  const existe = data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia
  return existe && ano >= 1000 ? `${partes[3]}-${partes[2]}-${partes[1]}` : null
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`; texto vazio se o valor não for uma data ISO. */
export function isoParaTexto(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : ''
}

/** `AAAA-MM-DD` → Date à meia-noite local (sem o desvio de fuso do `new Date(iso)`); `undefined` se inválido. */
export function isoParaData(iso: string | undefined): Date | undefined {
  if (!iso || textoParaIso(isoParaTexto(iso)) === null) return undefined
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return new Date(ano!, mes! - 1, dia)
}

/** Date local → `AAAA-MM-DD`. */
export function dataParaIso(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${String(data.getFullYear()).padStart(4, '0')}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
}
