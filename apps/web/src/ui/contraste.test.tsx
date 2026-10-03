import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Botao } from './Botao'
import { Campo } from './Campo'
import { Cartao } from './Cartao'

const PASTA_SRC = join(__dirname, '..')
const TOKENS = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

function cor(token: string): string {
  const achado = TOKENS.match(new RegExp(`--${token}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!achado?.[1]) throw new Error(`token --${token} sem cor hexadecimal em tokens.css`)
  return achado[1]
}

function luminancia(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((inicio) => {
    const canal = parseInt(hex.slice(inicio, inicio + 2), 16) / 255
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste da WCAG 2 entre dois tokens de tokens.css. */
function razao(frente: string, fundo: string): number {
  const a = luminancia(cor(frente))
  const b = luminancia(cor(fundo))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('contraste dos tokens', () => {
  it.each(['color-surface', 'color-bg', 'color-surface-muted'])('contorno de controle tem 3:1 sobre %s', (fundo) => {
    expect(razao('color-border-control', fundo)).toBeGreaterThanOrEqual(3)
  })

  it.each(['color-primary-soft', 'color-surface'])('texto de sucesso tem 4,5:1 sobre %s', (fundo) => {
    expect(razao('color-success', fundo)).toBeGreaterThanOrEqual(4.5)
  })

  it('campo e cartão usam o contorno de controle, não a borda decorativa', () => {
    render(
      <>
        <Campo rotulo="Nome" />
        <Cartao data-testid="cartao" />
      </>,
    )
    expect(document.querySelector('input')?.className).toContain('border-borda-controle')
    expect(document.querySelector('[data-testid="cartao"]')?.className).toContain('border-borda-controle')
  })

  it('botão secundário usa o contorno de controle', () => {
    render(<Botao variante="secundario">Voltar</Botao>)
    expect(document.querySelector('button')?.className).toContain('border-borda-controle')
  })

  // Grade de frequência: P e A são marcas cheias; F e J, marcas vazadas com contorno. Cheia contra vazada
  // (o fundo branco) e cada contorno contra o fundo precisam de 3:1 — a letra é que separa P de A e F de J.
  it.each(['color-primary', 'color-warning', 'color-danger', 'color-border-control'])('marca da frequência em %s tem 3:1 sobre o branco', (token) => {
    expect(razao(token, 'color-surface')).toBeGreaterThanOrEqual(3)
  })

  it.each(['color-primary', 'color-warning'])('letra branca na marca cheia %s tem 4,5:1', (token) => {
    expect(razao(token, 'color-surface')).toBeGreaterThanOrEqual(4.5)
  })
})

function arquivosTsx(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho)
    return nome.endsWith('.tsx') && !nome.endsWith('.test.tsx') ? [caminho] : []
  })
}

describe('tamanho de letra', () => {
  it('nenhuma letra fixa abaixo de 12 px', () => {
    const abaixo = arquivosTsx(PASTA_SRC)
      .map((caminho) => relative(PASTA_SRC, caminho).split('\\').join('/'))
      .flatMap((caminho) =>
        [...readFileSync(join(PASTA_SRC, caminho), 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
          .filter((achado) => Number(achado[1]) < 12)
          .map((achado) => `${caminho}: ${achado[0]}`),
      )
    expect(abaixo).toEqual([])
  })
})

// Contorno de caixa (cartão, menu, tabela, marcador) precisa de 3:1: usa `border-borda-controle`.
// A borda clara `border-borda` só serve de divisória — linha de um lado só (`border-t`, `border-b`…).
// Exceções ainda não migradas, contadas por arquivo: corrigir uma delas exige tirá-la daqui.
const CONTORNO_CLARO_PENDENTE: Record<string, number> = {
  'modulos/especialidades/TelaEspecialidades.tsx': 1,
  'modulos/cronograma/TelaCronograma.tsx': 1,
  'modulos/aulas/FormularioAula.tsx': 3,
  'modulos/adm/classes/DetalheDaClasse.tsx': 1,
  'modulos/reunioes/detalhe/DetalheReuniao.tsx': 1,
  'modulos/reunioes/detalhe/PartesDaReuniao.tsx': 1,
  'modulos/reunioes/chamada/FormularioChamada.tsx': 2,
}

function ehContornoClaro(linha: string): boolean {
  const bordaClara = /\bborder-borda(?![\w-])/.test(linha)
  const divisoria = /\bborder-[btlrxyse](?![a-z])|\bdivide-/.test(linha)
  return bordaClara && !divisoria
}

describe('contorno de caixa', () => {
  it('borda clara só como divisória, nunca contornando a caixa inteira', () => {
    const contornos: Record<string, number> = {}
    for (const caminho of arquivosTsx(PASTA_SRC)) {
      const relativo = relative(PASTA_SRC, caminho).split('\\').join('/')
      if (!relativo.startsWith('modulos/') && !relativo.startsWith('ui/')) continue
      const total = readFileSync(caminho, 'utf8').split('\n').filter(ehContornoClaro).length
      if (total > 0) contornos[relativo] = total
    }
    expect(contornos).toEqual(CONTORNO_CLARO_PENDENTE)
  })
})
