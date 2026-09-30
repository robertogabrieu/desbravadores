import { open, type FileHandle } from 'node:fs/promises'
import { FORMATOS_MATERIAL } from '@desbravadores/shared'

export type ExtensaoDeMaterial = keyof typeof FORMATOS_MATERIAL

const ASSINATURA_PDF = '%PDF-'
const ASSINATURA_ENTRADA_LOCAL = 0x04034b50
const ASSINATURA_ENTRADA_DIRETORIO = 0x02014b50
const ASSINATURA_FIM_DIRETORIO = 0x06054b50
const TAMANHO_FIM_DIRETORIO = 22
const MAIOR_COMENTARIO_ZIP = 0xffff
const MAIOR_DIRETORIO_ZIP = 4 * 1024 * 1024
const TAMANHO_CABECALHO_LOCAL = 30
const MAIOR_MIMETYPE = 128
const SEM_COMPRESSAO = 0

const PREFIXO_OOXML: Partial<Record<ExtensaoDeMaterial, string>> = { pptx: 'ppt/', docx: 'word/' }

export function ehExtensaoDeMaterial(ext: string): ext is ExtensaoDeMaterial {
  return Object.hasOwn(FORMATOS_MATERIAL, ext)
}

async function ler(arquivo: FileHandle, posicao: number, tamanho: number): Promise<Buffer> {
  const buffer = Buffer.alloc(tamanho)
  const { bytesRead } = await arquivo.read(buffer, 0, tamanho, posicao)
  return buffer.subarray(0, bytesRead)
}

interface EntradaZip {
  nome: string
  metodo: number
  tamanhoGravado: number
  posicaoLocal: number
}

/** Lê só o diretório central do ZIP (fim do arquivo), nunca o conteúdo: o container tem 384 MB. */
async function entradasDoZip(arquivo: FileHandle, tamanhoDoArquivo: number): Promise<EntradaZip[]> {
  const cabeca = await ler(arquivo, 0, 4)
  if (cabeca.length < 4 || cabeca.readUInt32LE(0) !== ASSINATURA_ENTRADA_LOCAL) return []

  const tamanhoDaCauda = Math.min(tamanhoDoArquivo, TAMANHO_FIM_DIRETORIO + MAIOR_COMENTARIO_ZIP)
  const cauda = await ler(arquivo, tamanhoDoArquivo - tamanhoDaCauda, tamanhoDaCauda)
  let fim = -1
  for (let i = cauda.length - TAMANHO_FIM_DIRETORIO; i >= 0; i--) {
    if (cauda.readUInt32LE(i) === ASSINATURA_FIM_DIRETORIO) {
      fim = i
      break
    }
  }
  if (fim < 0) return []

  const tamanhoDoDiretorio = cauda.readUInt32LE(fim + 12)
  const posicaoDoDiretorio = cauda.readUInt32LE(fim + 16)
  if (tamanhoDoDiretorio > MAIOR_DIRETORIO_ZIP || posicaoDoDiretorio + tamanhoDoDiretorio > tamanhoDoArquivo) return []

  const diretorio = await ler(arquivo, posicaoDoDiretorio, tamanhoDoDiretorio)
  const entradas: EntradaZip[] = []
  let cursor = 0
  while (cursor + 46 <= diretorio.length && diretorio.readUInt32LE(cursor) === ASSINATURA_ENTRADA_DIRETORIO) {
    const tamanhoDoNome = diretorio.readUInt16LE(cursor + 28)
    const tamanhoDoExtra = diretorio.readUInt16LE(cursor + 30)
    const tamanhoDoComentario = diretorio.readUInt16LE(cursor + 32)
    entradas.push({
      nome: diretorio.toString('utf8', cursor + 46, cursor + 46 + tamanhoDoNome),
      metodo: diretorio.readUInt16LE(cursor + 10),
      tamanhoGravado: diretorio.readUInt32LE(cursor + 20),
      posicaoLocal: diretorio.readUInt32LE(cursor + 42),
    })
    cursor += 46 + tamanhoDoNome + tamanhoDoExtra + tamanhoDoComentario
  }
  return entradas
}

async function mimetypeDoOdf(arquivo: FileHandle, entrada: EntradaZip): Promise<string | null> {
  if (entrada.metodo !== SEM_COMPRESSAO || entrada.tamanhoGravado > MAIOR_MIMETYPE) return null
  const local = await ler(arquivo, entrada.posicaoLocal, TAMANHO_CABECALHO_LOCAL)
  if (local.length < TAMANHO_CABECALHO_LOCAL || local.readUInt32LE(0) !== ASSINATURA_ENTRADA_LOCAL) return null
  const inicio = entrada.posicaoLocal + TAMANHO_CABECALHO_LOCAL + local.readUInt16LE(26) + local.readUInt16LE(28)
  return (await ler(arquivo, inicio, entrada.tamanhoGravado)).toString('utf8').trim()
}

/**
 * O conteúdo, pelos bytes, é o formato que a extensão diz? Extensão e `Content-Type` do cliente
 * não provam nada: PDF começa com `%PDF-`; PPTX/DOCX são ZIP com entrada `ppt/`/`word/`; ODP/ODT
 * são ZIP cuja entrada `mimetype` traz o mime ODF.
 */
export async function conteudoConfereComExtensao(caminho: string, ext: ExtensaoDeMaterial): Promise<boolean> {
  const arquivo = await open(caminho, 'r')
  try {
    if (ext === 'pdf') return (await ler(arquivo, 0, ASSINATURA_PDF.length)).toString('latin1') === ASSINATURA_PDF

    const { size } = await arquivo.stat()
    const entradas = await entradasDoZip(arquivo, size)
    const prefixo = PREFIXO_OOXML[ext]
    if (prefixo) return entradas.some((entrada) => entrada.nome.startsWith(prefixo))

    const mimetype = entradas.find((entrada) => entrada.nome === 'mimetype')
    return mimetype !== undefined && (await mimetypeDoOdf(arquivo, mimetype)) === FORMATOS_MATERIAL[ext].mime
  } finally {
    await arquivo.close()
  }
}
