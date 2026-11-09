import { quebrarTexto } from './montarImagemDoPedido'
import type { BlocoDaImagem, LinhaDaImagem, TomDaLinha } from './montarImagemDoPedido'

/** Largura do PNG: a que o WhatsApp mostra sem reduzir. A altura cresce com o texto. */
export const LARGURA_DA_IMAGEM = 1080
const MARGEM = 64
const ESPACO_ENTRE_BLOCOS = 40
const ESPACO_DO_ROTULO = 14
const FOLGA_DO_VALOR = 24
const ESPERA_DAS_FONTES_MS = 2500

interface Cores {
  marca: string
  marcaSuave: string
  creme: string
  texto: string
  textoSecundario: string
  borda: string
  superficie: string
  sucesso: string
  alerta: string
  alertaFundo: string
}

interface Familias {
  titulo: string
  corpo: string
}

type Medidor = (fonte: string, texto: string) => number

type Operacao =
  | { tipo: 'retangulo'; x: number; y: number; largura: number; altura: number; cor: string; raio: number }
  | { tipo: 'texto'; x: number; y: number; texto: string; fonte: string; cor: string; alinhar: CanvasTextAlign }

export interface Disposicao {
  altura: number
  operacoes: Operacao[]
}

/** Lê do tema da página: o estilo da imagem sai dos mesmos tokens das telas. */
function lerDoTema(): { cores: Cores; familias: Familias } {
  const estilo = getComputedStyle(document.documentElement)
  const ler = (nome: string, padrao: string): string => estilo.getPropertyValue(nome).trim() || padrao
  return {
    cores: {
      marca: ler('--color-primary', '#000000'),
      marcaSuave: ler('--color-primary-soft', '#eeeeee'),
      creme: ler('--color-accent', '#eeeeee'),
      texto: ler('--color-text', '#000000'),
      textoSecundario: ler('--color-text-secondary', '#444444'),
      borda: ler('--color-border', '#cccccc'),
      superficie: ler('--color-surface', '#ffffff'),
      sucesso: ler('--color-success', '#000000'),
      alerta: ler('--color-warning', '#000000'),
      alertaFundo: ler('--color-warning-bg', '#eeeeee'),
    },
    familias: { titulo: ler('--font-display', 'system-ui, sans-serif'), corpo: ler('--font-body', 'system-ui, sans-serif') },
  }
}

const primeiraFamilia = (pilha: string): string => (pilha.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')

/** Espera as duas fontes da marca; se falharem ou demorarem, o desenho segue com a fonte padrão do aparelho. */
async function esperarAsFontes(familias: Familias): Promise<void> {
  if (!('fonts' in document)) return
  const carregar = Promise.all([
    document.fonts.load(`700 32px "${primeiraFamilia(familias.titulo)}"`),
    document.fonts.load(`400 30px "${primeiraFamilia(familias.corpo)}"`),
    document.fonts.load(`700 30px "${primeiraFamilia(familias.corpo)}"`),
  ])
  const limite = new Promise<void>((resolver) => setTimeout(resolver, ESPERA_DAS_FONTES_MS))
  try {
    await Promise.race([carregar, limite])
  } catch {
    // Sem as fontes da marca a imagem sai com a padrão.
  }
}

interface EstiloDaLinha {
  fonte: string
  cor: string
  altura: number
}

function estiloDaLinha(linha: LinhaDaImagem, cores: Cores, familias: Familias): EstiloDaLinha {
  switch (linha.enfase) {
    case 'titulo':
      return { fonte: `700 46px ${familias.titulo}`, cor: cores.texto, altura: 58 }
    case 'total':
      return { fonte: `800 56px ${familias.titulo}`, cor: cores.texto, altura: 68 }
    case 'forte':
      return { fonte: `700 32px ${familias.corpo}`, cor: cores.texto, altura: 44 }
    case 'suave':
      return { fonte: `400 28px ${familias.corpo}`, cor: cores.textoSecundario, altura: 40 }
    case 'selo':
      return { fonte: `700 30px ${familias.corpo}`, cor: cores.texto, altura: 44 }
    default:
      return { fonte: `400 32px ${familias.corpo}`, cor: cores.texto, altura: 46 }
  }
}

function coresDoSelo(tom: TomDaLinha | undefined, cores: Cores): { fundo: string; texto: string } {
  if (tom === 'sucesso') return { fundo: cores.marcaSuave, texto: cores.sucesso }
  if (tom === 'alerta') return { fundo: cores.alertaFundo, texto: cores.alerta }
  return { fundo: cores.marcaSuave, texto: cores.textoSecundario }
}

/**
 * Dá posição a cada texto e retângulo da imagem. É aqui que a altura nasce: texto longo quebra por
 * largura e empurra o que vem depois. Não toca em canvas, só em `medir`.
 */
export function dispor(blocos: BlocoDaImagem[], medir: Medidor, cores: Cores, familias: Familias): Disposicao {
  const operacoes: Operacao[] = []
  const larguraUtil = LARGURA_DA_IMAGEM - 2 * MARGEM
  let y = 0

  const texto = (x: number, baseline: number, conteudo: string, fonte: string, cor: string, alinhar: CanvasTextAlign = 'left') =>
    operacoes.push({ tipo: 'texto', x, y: baseline, texto: conteudo, fonte, cor, alinhar })

  blocos.forEach((bloco, indice) => {
    const topo = y
    const comFundo = bloco.id === 'venda' || bloco.id === 'instrucoes'
    const fundo: Operacao | null =
      comFundo ? { tipo: 'retangulo', x: 0, y: topo, largura: LARGURA_DA_IMAGEM, altura: 0, cor: bloco.id === 'venda' ? cores.marca : cores.creme, raio: 0 } : null
    if (fundo) operacoes.push(fundo)
    else if (indice > 0 && bloco.id !== 'rodape' && blocos[indice - 1]?.id !== 'venda') operacoes.push({ tipo: 'retangulo', x: MARGEM, y: topo, largura: larguraUtil, altura: 2, cor: cores.borda, raio: 0 })

    y += ESPACO_ENTRE_BLOCOS
    if (bloco.titulo) {
      const fonte = `700 26px ${familias.corpo}`
      texto(MARGEM, y + 26, bloco.titulo.toUpperCase(), fonte, cores.textoSecundario)
      y += 26 + ESPACO_DO_ROTULO
    }

    for (const linha of bloco.linhas) {
      const estilo = estiloDaLinha(linha, cores, familias)
      const corDaLinha = bloco.id === 'venda' ? cores.superficie : estilo.cor
      const larguraDoValor = linha.valor ? medir(estilo.fonte, linha.valor) + FOLGA_DO_VALOR : 0

      if (linha.enfase === 'selo') {
        const { fundo: corDoFundo, texto: corDoTexto } = coresDoSelo(linha.tom, cores)
        const largura = medir(estilo.fonte, linha.texto) + 48
        operacoes.push({ tipo: 'retangulo', x: MARGEM, y, largura, altura: 56, cor: corDoFundo, raio: 28 })
        texto(MARGEM + 24, y + 38, linha.texto, estilo.fonte, corDoTexto)
        y += 56
        continue
      }

      const alinhar: CanvasTextAlign = bloco.id === 'rodape' ? 'center' : 'left'
      const x = alinhar === 'center' ? LARGURA_DA_IMAGEM / 2 : MARGEM
      const linhas = quebrarTexto(linha.texto, larguraUtil - larguraDoValor, (trecho) => medir(estilo.fonte, trecho))
      linhas.forEach((parte, posicao) => {
        texto(x, y + estilo.altura * 0.75, parte, estilo.fonte, corDaLinha, alinhar)
        if (linha.valor && posicao === 0) texto(LARGURA_DA_IMAGEM - MARGEM, y + estilo.altura * 0.75, linha.valor, estilo.fonte, corDaLinha, 'right')
        y += estilo.altura
      })
    }

    y += ESPACO_ENTRE_BLOCOS
    if (fundo?.tipo === 'retangulo') fundo.altura = y - topo
  })

  return { altura: y, operacoes }
}

function desenhar(contexto: CanvasRenderingContext2D, disposicao: Disposicao, cores: Cores): void {
  contexto.fillStyle = cores.superficie
  contexto.fillRect(0, 0, LARGURA_DA_IMAGEM, disposicao.altura)
  for (const operacao of disposicao.operacoes) {
    contexto.fillStyle = operacao.cor
    if (operacao.tipo === 'retangulo') {
      contexto.beginPath()
      contexto.roundRect(operacao.x, operacao.y, operacao.largura, operacao.altura, operacao.raio)
      contexto.fill()
    } else {
      contexto.font = operacao.fonte
      contexto.textAlign = operacao.alinhar
      contexto.fillText(operacao.texto, operacao.x, operacao.y)
    }
  }
}

/** Desenha o conteúdo do pedido em canvas e devolve o PNG. Só roda no navegador: o conteúdo em si é testado em `montarImagemDoPedido`. */
export async function desenharImagem(blocos: BlocoDaImagem[]): Promise<Blob> {
  const { cores, familias } = lerDoTema()
  await esperarAsFontes(familias)

  const folha = document.createElement('canvas')
  const medidor = folha.getContext('2d')
  if (!medidor) throw new Error('Sem canvas')
  const disposicao = dispor(
    blocos,
    (fonte, trecho) => {
      medidor.font = fonte
      return medidor.measureText(trecho).width
    },
    cores,
    familias,
  )

  folha.width = LARGURA_DA_IMAGEM
  folha.height = Math.ceil(disposicao.altura)
  const contexto = folha.getContext('2d')
  if (!contexto) throw new Error('Sem canvas')
  desenhar(contexto, disposicao, cores)
  return new Promise<Blob>((resolver, rejeitar) => {
    folha.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('Sem imagem'))), 'image/png')
  })
}
