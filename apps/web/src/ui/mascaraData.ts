const DATA_ISO_COLADA = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/

/** O que a máscara de um campo define; `editarComMascara` faz o resto. */
export interface Mascara {
  separador: string
  maxDigitos: number
  /** Quantos dígitos já digitados deixam o bloco atual com 1 dígito, pronto para o separador completar com zero. */
  fimDeBlocoComUmDigito: number[]
  formatar: (digitos: string, apagando: boolean) => string
}

const soDigitos = (texto: string): string => texto.replace(/\D/g, '')

/**
 * Aplica a máscara a uma edição: formata só pelos dígitos, completa com zero apenas quando o separador acabou de ser digitado
 * ao fim de um bloco de 1 dígito, e devolve o cursor logo depois do mesmo dígito em que estava.
 */
export function editarComMascara(mascara: Mascara, bruto: string, cursorBruto: number, inputType = '', dado: string | null = null) {
  const apagando = inputType.startsWith('delete')
  const digitando = inputType === 'insertText'
  let digitos = soDigitos(bruto)
  let digitosAntesDoCursor = soDigitos(bruto.slice(0, cursorBruto)).length
  let completouComZero = false

  if (digitando && dado === mascara.separador && bruto[cursorBruto - 1] === mascara.separador) {
    const antes = soDigitos(bruto.slice(0, cursorBruto - 1))
    const depois = soDigitos(bruto.slice(cursorBruto))
    if (depois === '' && mascara.fimDeBlocoComUmDigito.includes(antes.length)) {
      digitos = `${antes.slice(0, -1)}0${antes.slice(-1)}`
      digitosAntesDoCursor = digitos.length
      completouComZero = true
    }
  }

  digitos = digitos.slice(0, mascara.maxDigitos)
  let texto = mascara.formatar(digitos, apagando)
  if (completouComZero && !texto.endsWith(mascara.separador)) texto += mascara.separador

  const quantos = Math.min(digitosAntesDoCursor, digitos.length)
  let cursor = 0
  for (let vistos = 0; cursor < texto.length && vistos < quantos; cursor++) {
    if (/\d/.test(texto[cursor])) vistos++
  }
  if (digitando && quantos > 0 && texto[cursor] === mascara.separador) cursor++
  return { texto, cursor }
}

/** Dígitos (até 8) em DD/MM/AAAA; nunca completa com zero. */
function formatarData(digitos: string): string {
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/')
}

const MASCARA_DATA: Mascara = { separador: '/', maxDigitos: 8, fimDeBlocoComUmDigito: [1, 3], formatar: formatarData }

/** Põe as barras de DD/MM/AAAA pelos dígitos do texto; reconhece `AAAA-MM-DD` colado. Nunca completa com zero. */
export function mascararData(texto: string): string {
  const iso = DATA_ISO_COLADA.exec(texto)
  return formatarData(soDigitos(iso ? `${iso[3]}${iso[2]}${iso[1]}` : texto).slice(0, 8))
}

/** Edição de um campo de data: texto mascarado e posição do cursor. "/" digitada após 1 dígito de dia ou mês completa com zero. */
export function editarData(bruto: string, cursorBruto: number, inputType = '', dado: string | null = null) {
  const iso = DATA_ISO_COLADA.exec(bruto)
  if (iso) {
    const texto = `${iso[3]}/${iso[2]}/${iso[1]}`
    return { texto, cursor: texto.length }
  }
  return editarComMascara(MASCARA_DATA, bruto, cursorBruto, inputType, dado)
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
  return new Date(ano, mes - 1, dia)
}

/** Date local → `AAAA-MM-DD`. */
export function dataParaIso(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${String(data.getFullYear()).padStart(4, '0')}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
}
