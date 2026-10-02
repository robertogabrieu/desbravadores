import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Link com cara de linha ou cartão precisa mostrar que abre: no celular não há hover para avisar.
// Quem resolve isso são ui/LinhaQueNavega e ui/LinkDeFicha; um <Link> com classe de cartão ou de
// linha clicável escrito à mão em src/modulos volta a esconder a navegação.
const MODULOS = resolve(__dirname, '../modulos')

interface Abertura {
  linha: number
  tag: string
  envolveCartao: boolean
}

/** Cada `<Link ...>` do arquivo, até o `>` que fecha a abertura (o `=>` dentro de chaves não conta). */
function aberturasDeLink(fonte: string): Abertura[] {
  const aberturas: Abertura[] = []
  const inicio = /<Link[\s>]/g
  for (let achado = inicio.exec(fonte); achado; achado = inicio.exec(fonte)) {
    let profundidade = 0
    let aspas: string | null = null
    let fim = achado.index + 5
    for (; fim < fonte.length; fim++) {
      const caractere = fonte[fim]
      if (aspas) {
        if (caractere === aspas) aspas = null
      } else if (caractere === '{') profundidade++
      else if (caractere === '}') profundidade--
      else if (profundidade === 0 && (caractere === '"' || caractere === "'")) aspas = caractere
      else if (profundidade === 0 && caractere === '>') break
    }
    aberturas.push({
      linha: fonte.slice(0, achado.index).split('\n').length,
      tag: fonte.slice(achado.index, fim + 1),
      envolveCartao: /^\s*<Cartao\b/.test(fonte.slice(fim + 1)),
    })
  }
  return aberturas
}

/** `className={estilo}` com `const estilo = '...'` no mesmo arquivo conta como a própria classe. */
function classesDa(abertura: Abertura, fonte: string): string {
  const variavel = /className=\{(\w+)\}/.exec(abertura.tag)?.[1]
  const definicao = variavel ? new RegExp(`const ${variavel}\\b[^=]*=\\s*(.+)`).exec(fonte)?.[1] : undefined
  return `${abertura.tag} ${definicao ?? ''}`
}

function temCaraDeLinhaOuCartao(abertura: Abertura, fonte: string): boolean {
  if (abertura.envolveCartao) return true
  const classes = classesDa(abertura, fonte)
  if (classes.includes('rounded-cartao') || classes.includes('after:inset-0')) return true
  // Linha clicável: canto de botão e fundo no hover, mas com o conteúdo alinhado como lista, não centrado como botão.
  const centradoComoBotao = classes.includes('justify-center') && !classes.includes('flex-col')
  return classes.includes('rounded-botao') && classes.includes('hover:bg-superficie-suave') && !centradoComoBotao
}

function arquivosTsx(pasta: string): string[] {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((caminho) => caminho.endsWith('.tsx') && !caminho.includes('.test.'))
    .map((caminho) => join(pasta, caminho))
}

describe('links com cara de linha ou cartão', () => {
  it('o detector pega cartão, linha clicável, link esticado e classe em variável, e deixa passar botão e link de texto', () => {
    const fonte = [
      '<Link to="/a" className="block rounded-cartao border">x</Link>',
      '<Link to="/b" onClick={() => abrir()} className="flex rounded-botao px-2 hover:bg-superficie-suave">x</Link>',
      '<Link to="/c" className="font-bold after:absolute after:inset-0">x</Link>',
      '<Link to="/d">',
      '  <Cartao>x</Cartao>',
      '</Link>',
      "const estiloLinha = 'flex rounded-cartao border p-3'",
      '<Link to="/e" className={estiloLinha}>x</Link>',
      '<Link to="/f" className={estiloDoBotao()}>Novo</Link>',
      '<Link to="/g" className="text-marca underline">Ver</Link>',
      '<Link to="/h" className="flex items-center justify-center rounded-botao bg-fundo hover:bg-superficie-suave">Materiais</Link>',
    ].join('\n')
    const marcados = aberturasDeLink(fonte)
      .filter((abertura) => temCaraDeLinhaOuCartao(abertura, fonte))
      .map((abertura) => abertura.linha)
    expect(marcados).toEqual([1, 2, 3, 4, 8])
  })

  it('nenhum <Link> com classe de cartão ou de linha clicável fora de ui/LinhaQueNavega e ui/LinkDeFicha', () => {
    const violacoes: string[] = []
    for (const arquivo of arquivosTsx(MODULOS)) {
      const nome = relative(MODULOS, arquivo).split('\\').join('/')
      const fonte = readFileSync(arquivo, 'utf8')
      for (const abertura of aberturasDeLink(fonte)) {
        if (temCaraDeLinhaOuCartao(abertura, fonte)) violacoes.push(`${nome}:${abertura.linha}`)
      }
    }
    expect(violacoes).toEqual([])
  })
})
