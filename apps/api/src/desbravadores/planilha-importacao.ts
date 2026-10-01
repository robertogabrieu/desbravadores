import { Readable } from 'node:stream'
import { crc32, inflateRawSync } from 'node:zlib'
import { LIMITE_LINHAS_IMPORTACAO } from '@desbravadores/shared'
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

export interface PlanilhaLida {
  /** Cabeçalho e até `LIMITE_LINHAS_IMPORTACAO` linhas de dados; as seguintes só entram na contagem. */
  linhas: LinhaLida[]
  /** Linhas não vazias depois do cabeçalho, contadas até o fim da planilha. */
  totalDeDados: number
}

/** Colunas além desta não são lidas: o modelo tem 9, e uma célula perdida na coluna 16384 viraria 16 mil por linha. */
const MAXIMO_DE_COLUNAS = 50

/** Um .xlsx de 500 linhas reais descompactado fica muito abaixo disto. */
const TETO_DESCOMPACTADO_EM_BYTES = 30 * 1024 * 1024

const MENSAGEM_GRANDE_DEMAIS = 'A planilha é grande demais para importar.'
const MENSAGEM_ILEGIVEL = 'Não foi possível ler a planilha. Salve como .xlsx e envie de novo.'

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

function dataCivilValida(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null
  return data.toISOString().slice(0, 10)
}

/**
 * `dd/mm/aaaa`, `aaaa-mm-dd` ou célula formatada como data → "AAAA-MM-DD"; `null` se ilegível.
 * Número solto não é data: lido como dia serial, "2015" viraria 07/07/1905. O exceljs monta a célula
 * de data em UTC, e por isso ela é lida em UTC — o fuso do servidor não tira um dia.
 */
export function converterData(celula: Celula): string | null {
  if (celula instanceof Date) return Number.isNaN(celula.getTime()) ? null : celula.toISOString().slice(0, 10)
  if (typeof celula === 'number') return null
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

/** Guarda o cabeçalho e as linhas até o limite, e só conta as que passam dele. */
function coletorDeLinhas() {
  const linhas: LinhaLida[] = []
  let naoVazias = 0
  return {
    adicionar(numero: number, celulas: Celula[]): void {
      if (!celulas.some((celula) => textoDaCelula(celula) !== '')) return
      naoVazias++
      if (linhas.length <= LIMITE_LINHAS_IMPORTACAO) linhas.push({ numero, celulas })
    },
    resultado: (): PlanilhaLida => ({ linhas, totalDeDados: Math.max(naoVazias - 1, 0) }),
  }
}

const ASSINATURA_DO_FIM_DO_DIRETORIO = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const ASSINATURA_DA_ENTRADA_DO_DIRETORIO = 0x02014b50
const ASSINATURA_DO_CABECALHO_LOCAL = 0x04034b50
const ASSINATURA_DO_DESCRITOR = 0x08074b50
const TAMANHO_ZIP64 = 0xffffffff
const COMPRESSAO_NENHUMA = 0
const COMPRESSAO_DEFLATE = 8
const FLAG_DESCRITOR_DEPOIS_DOS_DADOS = 0x08
const FLAG_NOME_EM_UTF8 = 0x800
const VERSAO_DO_ZIP = 20

/**
 * Entradas que o exceljs precisa ter lido antes de chegar às abas. No .xlsx que o próprio exceljs grava,
 * `xl/workbook.xml` vem por último; remontado sem compressão, a leitura em fluxo às vezes chega ao fim
 * sem ter montado a pasta e falha em "reading 'sheets'". Na frente, as abas já são lidas com tudo pronto.
 */
const LIDAS_ANTES_DAS_ABAS = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml']

interface EntradaDoZip {
  flags: number
  metodo: number
  compactado: number
  inicioLocal: number
  nome: Buffer
}

/** Entrada já descompactada e contada, pronta para entrar no .xlsx remontado. */
interface EntradaConferida {
  nome: Buffer
  flags: number
  conteudo: Buffer
}

/** Entradas do diretório central; recusa assim que o tamanho descompactado declarado passa do teto. */
function entradasDoDiretorio(zip: Buffer): { entradas: EntradaDoZip[]; inicioDoDiretorio: number } {
  const fim = zip.lastIndexOf(ASSINATURA_DO_FIM_DO_DIRETORIO)
  if (fim === -1 || fim + 22 > zip.length) throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
  const quantidade = zip.readUInt16LE(fim + 10)
  const inicioDoDiretorio = zip.readUInt32LE(fim + 16)
  const entradas: EntradaDoZip[] = []
  let declarado = 0
  let posicao = inicioDoDiretorio
  for (let i = 0; i < quantidade; i++) {
    if (posicao + 46 > zip.length || zip.readUInt32LE(posicao) !== ASSINATURA_DA_ENTRADA_DO_DIRETORIO) {
      throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
    }
    const compactado = zip.readUInt32LE(posicao + 20)
    const descompactado = zip.readUInt32LE(posicao + 24)
    declarado += descompactado
    if (compactado === TAMANHO_ZIP64 || descompactado === TAMANHO_ZIP64 || declarado > TETO_DESCOMPACTADO_EM_BYTES) {
      throw new ErroApp('REGRA', MENSAGEM_GRANDE_DEMAIS)
    }
    const tamanhoDoNome = zip.readUInt16LE(posicao + 28)
    entradas.push({
      flags: zip.readUInt16LE(posicao + 8),
      metodo: zip.readUInt16LE(posicao + 10),
      compactado,
      inicioLocal: zip.readUInt32LE(posicao + 42),
      nome: zip.subarray(posicao + 46, posicao + 46 + tamanhoDoNome),
    })
    posicao += 46 + tamanhoDoNome + zip.readUInt16LE(posicao + 30) + zip.readUInt16LE(posicao + 32)
  }
  return { entradas, inicioDoDiretorio }
}

/** Pelo `code`, não por `instanceof RangeError`: o erro do zlib nasce em outro realm quando roda no jest. */
function passouDoLimiteDeSaida(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === 'ERR_BUFFER_TOO_LARGE'
}

/**
 * Recusa o .xlsx que descompactado passa do teto, antes de o exceljs abrir: 3 MB bem comprimidos viram
 * gigabytes. O tamanho declarado pode mentir, então cada entrada é de fato descomprimida, guiada pelo
 * diretório central, com o que resta do teto como limite de saída. O que volta é o conteúdo contado,
 * e só ele chega ao exceljs (ver `montarZipSemCompressao`).
 */
function descompactarConferindo(zip: Buffer): EntradaConferida[] {
  const { entradas, inicioDoDiretorio } = entradasDoDiretorio(zip)
  const conferidas: EntradaConferida[] = []
  let esperado = 0
  let descompactado = 0
  for (const { flags, metodo, compactado, inicioLocal, nome } of [...entradas].sort((a, b) => a.inicioLocal - b.inicioLocal)) {
    if (inicioLocal !== esperado || inicioLocal + 30 > zip.length || zip.readUInt32LE(inicioLocal) !== ASSINATURA_DO_CABECALHO_LOCAL) {
      throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
    }
    const inicioDosDados = inicioLocal + 30 + zip.readUInt16LE(inicioLocal + 26) + zip.readUInt16LE(inicioLocal + 28)
    const fimDosDados = inicioDosDados + compactado
    if (fimDosDados > zip.length) throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
    const dados = zip.subarray(inicioDosDados, fimDosDados)
    let conteudo: Buffer
    if (metodo === COMPRESSAO_NENHUMA) {
      conteudo = dados
    } else if (metodo === COMPRESSAO_DEFLATE) {
      try {
        conteudo = inflateRawSync(dados, { maxOutputLength: TETO_DESCOMPACTADO_EM_BYTES - descompactado + 1 })
      } catch (erro) {
        throw new ErroApp('REGRA', passouDoLimiteDeSaida(erro) ? MENSAGEM_GRANDE_DEMAIS : MENSAGEM_ILEGIVEL)
      }
    } else {
      throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
    }
    descompactado += conteudo.length
    if (descompactado > TETO_DESCOMPACTADO_EM_BYTES) throw new ErroApp('REGRA', MENSAGEM_GRANDE_DEMAIS)
    conferidas.push({ nome, flags, conteudo })
    const temDescritor = (flags & FLAG_DESCRITOR_DEPOIS_DOS_DADOS) !== 0
    const descritorAssinado = temDescritor && fimDosDados + 4 <= zip.length && zip.readUInt32LE(fimDosDados) === ASSINATURA_DO_DESCRITOR
    esperado = fimDosDados + (temDescritor ? (descritorAssinado ? 16 : 12) : 0)
  }
  if (esperado !== inicioDoDiretorio) throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
  return conferidas
}

/**
 * Zip novo, sem compressão, com exatamente as entradas e os bytes conferidos. O exceljs lê o zip em
 * sequência pelos cabeçalhos locais, que no arquivo enviado podem contradizer o diretório central
 * (outro método, outro tamanho, entrada escondida); aqui eles são escritos a partir do que foi contado.
 * `sort` é estável: fora as de `LIDAS_ANTES_DAS_ABAS`, as entradas mantêm a ordem do arquivo.
 */
function montarZipSemCompressao(entradas: EntradaConferida[]): Buffer {
  const posicaoNaLeitura = ({ nome }: EntradaConferida): number => {
    const posicao = LIDAS_ANTES_DAS_ABAS.indexOf(nome.toString('utf8'))
    return posicao === -1 ? LIDAS_ANTES_DAS_ABAS.length : posicao
  }
  const naOrdemDeLeitura = [...entradas].sort((a, b) => posicaoNaLeitura(a) - posicaoNaLeitura(b))
  const locais: Buffer[] = []
  const diretorio: Buffer[] = []
  let deslocamento = 0
  for (const { nome, flags, conteudo } of naOrdemDeLeitura) {
    const crc = crc32(conteudo)
    const flagsDoNome = flags & FLAG_NOME_EM_UTF8
    const local = Buffer.alloc(30)
    local.writeUInt32LE(ASSINATURA_DO_CABECALHO_LOCAL, 0)
    local.writeUInt16LE(VERSAO_DO_ZIP, 4)
    local.writeUInt16LE(flagsDoNome, 6)
    local.writeUInt16LE(COMPRESSAO_NENHUMA, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(conteudo.length, 18)
    local.writeUInt32LE(conteudo.length, 22)
    local.writeUInt16LE(nome.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(ASSINATURA_DA_ENTRADA_DO_DIRETORIO, 0)
    central.writeUInt16LE(VERSAO_DO_ZIP, 4)
    central.writeUInt16LE(VERSAO_DO_ZIP, 6)
    central.writeUInt16LE(flagsDoNome, 8)
    central.writeUInt16LE(COMPRESSAO_NENHUMA, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(conteudo.length, 20)
    central.writeUInt32LE(conteudo.length, 24)
    central.writeUInt16LE(nome.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    locais.push(local, nome, conteudo)
    diretorio.push(central, nome)
    deslocamento += local.length + nome.length + conteudo.length
  }
  const tamanhoDoDiretorio = diretorio.reduce((soma, parte) => soma + parte.length, 0)
  const fim = Buffer.alloc(22)
  ASSINATURA_DO_FIM_DO_DIRETORIO.copy(fim, 0)
  fim.writeUInt16LE(entradas.length, 8)
  fim.writeUInt16LE(entradas.length, 10)
  fim.writeUInt32LE(tamanhoDoDiretorio, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...locais, ...diretorio, fim])
}

const LIVRO = 'xl/workbook.xml'

/**
 * O exceljs só reconhece a pasta em datas de 1904 (Mac) quando o `workbook.xml` grava `date1904="1"`;
 * gravado como `true`, que o formato também admite, as datas sairiam 4 anos e 1 dia antes.
 */
function comDatasDe1904Reconhecidas(entradas: EntradaConferida[]): EntradaConferida[] {
  return entradas.map((entrada) => {
    if (entrada.nome.toString('utf8') !== LIVRO) return entrada
    const livro = entrada.conteudo.toString('utf8')
    const normalizado = livro.replace(/(<(?:\w+:)?workbookPr\b[^>]*\bdate1904=)(["'])true\2/, (_, inicio: string, aspas: string) => `${inicio}${aspas}1${aspas}`)
    return normalizado === livro ? entrada : { ...entrada, conteudo: Buffer.from(normalizado, 'utf8') }
  })
}

function celulasDaLinhaDoExcel(linha: ExcelJS.Row): Celula[] {
  const celulas: Celula[] = []
  const ultima = Math.min(linha.cellCount, MAXIMO_DE_COLUNAS)
  for (let coluna = 1; coluna <= ultima; coluna++) celulas.push(valorDaCelulaDoExcel(linha.getCell(coluna).value))
  return celulas
}

/** Lê a primeira aba em fluxo, sem montar a pasta inteira na memória. */
async function lerXlsx(conteudo: Buffer): Promise<PlanilhaLida> {
  const conferido = montarZipSemCompressao(comDatasDe1904Reconhecidas(descompactarConferindo(conteudo)))
  const coletor = coletorDeLinhas()
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(conferido), {
    worksheets: 'emit',
    sharedStrings: 'cache',
    styles: 'cache',
    hyperlinks: 'ignore',
    entries: 'ignore',
  })
  let primeiraAba = true
  try {
    for await (const aba of leitor) {
      // Das abas seguintes, começar e parar a leitura fecha o arquivo temporário que o exceljs abriu para elas.
      for await (const linha of aba) {
        if (!primeiraAba) break
        coletor.adicionar(linha.number, celulasDaLinhaDoExcel(linha))
      }
      primeiraAba = false
    }
  } catch {
    throw new ErroApp('REGRA', MENSAGEM_ILEGIVEL)
  }
  return coletor.resultado()
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
      if (celulas.length === MAXIMO_DE_COLUNAS) return celulas
      atual = ''
    } else {
      atual += caractere
    }
  }
  celulas.push(atual)
  return celulas
}

function lerCsv(conteudo: Buffer): PlanilhaLida {
  const texto = conteudo.toString('utf8').replace(/^\uFEFF/, '')
  const brutas = texto.split(/\r?\n/)
  const primeira = brutas.find((linha) => linha.trim() !== '') ?? ''
  const separador = primeira.split(';').length >= primeira.split(',').length ? ';' : ','
  const coletor = coletorDeLinhas()
  brutas.forEach((linha, indice) => {
    if (linha.trim() !== '') coletor.adicionar(indice + 1, separarLinhaCsv(linha, separador).map((c) => c.trim() || null))
  })
  return coletor.resultado()
}

/** Linhas não vazias da primeira aba (ou do CSV), com o número que têm na planilha. */
export async function lerPlanilha(conteudo: Buffer, nomeDoArquivo: string): Promise<PlanilhaLida> {
  const extensao = nomeDoArquivo.toLowerCase().split('.').pop()
  if (extensao === 'xlsx') return lerXlsx(conteudo)
  if (extensao === 'csv') return lerCsv(conteudo)
  throw new ErroApp('REGRA', 'Envie a planilha em .xlsx ou .csv.')
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
