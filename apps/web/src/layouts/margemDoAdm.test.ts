import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PASTA_SRC = join(__dirname, '..')

// Telas fora de modulos/adm que também abrem dentro do LayoutAdm.
const TELAS_COMPARTILHADAS = ['modulos/ranking/Ranking.tsx', 'modulos/notificacoes/Notificacoes.tsx', 'modulos/cronograma-montagem/MontagemAdm.tsx']

function arquivosTsx(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho)
    return nome.endsWith('.tsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

/**
 * Contêiner de página: `div`/`main`/`section` sem cara de caixa (sem borda, fundo ou canto
 * arredondado). Se ele tem padding lateral, soma-se à margem que o LayoutAdm já dá.
 */
function margemLateralPropria(linha: string): boolean {
  const classes = linha.match(/<(?:div|main|section)\b[^>]*className="([^"]*)"/)?.[1]
  if (!classes) return false
  if (/\b(rounded|border|bg)-/.test(classes)) return false
  if (classes.includes('in-data-[layout=adm]:px-0')) return false
  return /(^|\s)(p|px|pl|pr|ps|pe)-\d/.test(classes)
}

describe('margem lateral das telas do Adm', () => {
  it('nenhuma tela dá margem lateral própria: quem dá é o LayoutAdm', () => {
    const caminhos = [...arquivosTsx(join(PASTA_SRC, 'modulos/adm')), ...TELAS_COMPARTILHADAS.map((tela) => join(PASTA_SRC, tela))]
    const comMargem = caminhos.flatMap((caminho) =>
      readFileSync(caminho, 'utf8')
        .split('\n')
        .map((linha, indice) => ({ linha, indice }))
        .filter(({ linha }) => margemLateralPropria(linha))
        .map(({ indice }) => `${relative(PASTA_SRC, caminho).split('\\').join('/')}:${indice + 1}`),
    )
    expect(comMargem).toEqual([])
  })

  it('o detector pega a margem de página e ignora caixa e tela compartilhada', () => {
    expect(margemLateralPropria('<div className="flex flex-col gap-5 p-4">')).toBe(true)
    expect(margemLateralPropria('<main className="flex flex-col gap-4 px-6">')).toBe(true)
    expect(margemLateralPropria('<div className="flex flex-col gap-5 py-4">')).toBe(false)
    expect(margemLateralPropria('<div className="rounded-cartao border bg-superficie p-4">')).toBe(false)
    expect(margemLateralPropria('<section className="flex p-4 in-data-[layout=adm]:px-0">')).toBe(false)
  })
})
