import ExcelJS from 'exceljs'
import { ErroApp } from '../comum/erros'
import { semAcento } from './apoio'

/** Valor de uma célula depois de lido: texto, número, data (célula de data do Excel) ou vazio. */
export type Celula = string | number | Date | null

export type CampoDaPlanilha =
  | 'nome'
  | 'nascimento'
  | 'sexo'
  | 'unidade'
  | 'classe'
  | 'responsavelNome'
  | 'responsavelTelefone'
  | 'responsavelEmail'
  | 'entradaEm'

export interface LinhaLida {
  /** Número da linha na planilha (a do cabeçalho é a primeira não vazia). */
  numero: number
  celulas: Celula[]
}

export const CABECALHO_DO_MODELO = [
  'Nome',
  'Data de nascimento',
  'Sexo',
  'Unidade',
  'Classe',
  'Responsável',
  'Telefone',
  'E-mail',
  'Entrada no clube',
]

export const COLUNAS_OBRIGATORIAS: { campo: CampoDaPlanilha; titulo: string }[] = [
  { campo: 'nome', titulo: 'Nome' },
  { campo: 'nascimento', titulo: 'Data de nascimento' },
  { campo: 'sexo', titulo: 'Sexo' },
]

/**
 * Trechos que reconhecem cada coluna, na ordem em que são testados: "Nome do responsável" e
 * "Telefone do responsável" precisam cair no responsável antes de "nome" pegar tudo.
 */
const TRECHOS_POR_CAMPO: [CampoDaPlanilha, string[]][] = [
  ['responsavelEmail', ['e-mail', 'email']],
  ['responsavelTelefone', ['telefone', 'celular', 'fone']],
  ['nascimento', ['nascimento']],
  ['entradaEm', ['entrada']],
  ['responsavelNome', ['responsavel']],
  ['unidade', ['unidade']],
  ['classe', ['classe']],
  ['sexo', ['sexo']],
  ['nome', ['nome']],
]

const normalizar = (texto: string): string => semAcento(texto).trim().replace(/\s+/g, ' ')

/** Coluna de cada campo reconhecido no cabeçalho; a primeira que casa fica com o campo. */
export function mapearCabecalho(cabecalho: Celula[]): Map<CampoDaPlanilha, number> {
  const mapa = new Map<CampoDaPlanilha, number>()
  cabecalho.forEach((celula, coluna) => {
    const titulo = normalizar(textoDaCelula(celula))
    if (!titulo) return
    const casado = TRECHOS_POR_CAMPO.find(([, trechos]) => trechos.some((trecho) => titulo.includes(trecho)))
    if (casado && !mapa.has(casado[0])) mapa.set(casado[0], coluna)
  })
  return mapa
}

export function textoDaCelula(celula: Celula): string {
  if (celula === null) return ''
  if (celula instanceof Date) return celula.toISOString().slice(0, 10)
  return String(celula).trim()
}

const DIA_EM_MS = 86_400_000
const BASE_DO_EXCEL = Date.UTC(1899, 11, 30)

function dataCivilValida(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null
  return data.toISOString().slice(0, 10)
}

/** `dd/mm/aaaa`, `aaaa-mm-dd`, célula de data ou número serial do Excel → "AAAA-MM-DD"; `null` se ilegível. */
export function converterData(celula: Celula): string | null {
  if (celula instanceof Date) return Number.isNaN(celula.getTime()) ? null : celula.toISOString().slice(0, 10)
  if (typeof celula === 'number') {
    if (!Number.isFinite(celula) || celula < 1) return null
    return new Date(BASE_DO_EXCEL + Math.floor(celula) * DIA_EM_MS).toISOString().slice(0, 10)
  }
  const texto = textoDaCelula(celula)
  const brasileira = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto)
  if (brasileira) return dataCivilValida(Number(brasileira[3]), Number(brasileira[2]), Number(brasileira[1]))
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (iso) return dataCivilValida(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  return null
}

const SEXO_POR_TEXTO: Record<string, 'M' | 'F'> = { m: 'M', masculino: 'M', f: 'F', feminino: 'F' }

export function converterSexo(celula: Celula): 'M' | 'F' | null {
  return SEXO_POR_TEXTO[normalizar(textoDaCelula(celula))] ?? null
}

/** Chave do duplicado: nome sem acento, caixa e espaços extras, mais o nascimento. */
export function chaveDePessoa(nome: string, nascimento: string): string {
  return `${normalizar(nome)}|${nascimento}`
}

export function nomeNormalizado(nome: string): string {
  return normalizar(nome)
}

function valorSimples(valor: unknown): Celula {
  if (typeof valor === 'string' || typeof valor === 'number' || valor instanceof Date) return valor
  if (typeof valor === 'boolean') return String(valor)
  return null
}

/** Fórmula vale pelo resultado; texto rico e hiperlink, pelo texto. */
function valorDaCelulaDoExcel(valor: ExcelJS.CellValue): Celula {
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) return valorSimples(valor)
  if ('result' in valor) return valorSimples(valor.result)
  if ('richText' in valor) return valor.richText.map((parte) => parte.text).join('')
  if ('text' in valor) return valorSimples(valor.text)
  return null
}

async function lerXlsx(conteudo: Buffer): Promise<LinhaLida[]> {
  const pasta = new ExcelJS.Workbook()
  try {
    await pasta.xlsx.load(new Uint8Array(conteudo).buffer)
  } catch {
    throw new ErroApp('REGRA', 'Não foi possível ler a planilha. Salve como .xlsx e envie de novo.')
  }
  const planilha = pasta.worksheets[0]
  if (!planilha) return []
  const linhas: LinhaLida[] = []
  planilha.eachRow({ includeEmpty: false }, (linha, numero) => {
    const celulas: Celula[] = []
    for (let coluna = 1; coluna <= linha.cellCount; coluna++) celulas.push(valorDaCelulaDoExcel(linha.getCell(coluna).value))
    linhas.push({ numero, celulas })
  })
  return linhas
}

/** Uma linha de CSV com aspas (`""` dentro de aspas é uma aspa). */
function separarLinhaCsv(linha: string, separador: string): string[] {
  const celulas: string[] = []
  let atual = ''
  let entreAspas = false
  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i]
    if (entreAspas) {
      if (caractere === '"' && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else if (caractere === '"') {
        entreAspas = false
      } else {
        atual += caractere
      }
    } else if (caractere === '"') {
      entreAspas = true
    } else if (caractere === separador) {
      celulas.push(atual)
      atual = ''
    } else {
      atual += caractere
    }
  }
  celulas.push(atual)
  return celulas
}

function lerCsv(conteudo: Buffer): LinhaLida[] {
  const texto = conteudo.toString('utf8').replace(/^\uFEFF/, '')
  const brutas = texto.split(/\r?\n/)
  const primeira = brutas.find((linha) => linha.trim() !== '') ?? ''
  const separador = primeira.split(';').length >= primeira.split(',').length ? ';' : ','
  return brutas.flatMap((linha, indice) =>
    linha.trim() === '' ? [] : [{ numero: indice + 1, celulas: separarLinhaCsv(linha, separador).map((c) => c.trim() || null) }],
  )
}

/** Linhas não vazias da primeira aba (ou do CSV), com o número que têm na planilha. */
export async function lerPlanilha(conteudo: Buffer, nomeDoArquivo: string): Promise<LinhaLida[]> {
  const extensao = nomeDoArquivo.toLowerCase().split('.').pop()
  const linhas = extensao === 'xlsx' ? await lerXlsx(conteudo) : extensao === 'csv' ? lerCsv(conteudo) : null
  if (!linhas) throw new ErroApp('REGRA', 'Envie a planilha em .xlsx ou .csv.')
  return linhas.filter((linha) => linha.celulas.some((celula) => textoDaCelula(celula) !== ''))
}

/** `.xlsx` do modelo: o cabeçalho que a importação reconhece e uma linha de exemplo. */
export async function gerarModelo(): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook()
  const planilha = pasta.addWorksheet('Desbravadores')
  planilha.addRow(CABECALHO_DO_MODELO)
  planilha.addRow(['Maria da Silva', '10/03/2015', 'F', 'Águias', 'Amigo', 'Joana da Silva', '(11) 99999-0000', 'joana@exemplo.com', ''])
  planilha.getRow(1).font = { bold: true }
  planilha.columns.forEach((coluna) => {
    coluna.width = 22
  })
  return Buffer.from(await pasta.xlsx.writeBuffer())
}
