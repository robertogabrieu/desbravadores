import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// O Tailwind 4 tirou o cursor de mãozinha dos botões; o tema devolve para tudo que é clicável.
const tema = readFileSync(resolve(__dirname, '../ui/tema.css'), 'utf8')

function seletoresCom(declaracao: string): string {
  const regra = new RegExp(`([^{}]+)\\{[^}]*${declaracao}[^}]*\\}`).exec(tema)
  return regra?.[1] ?? ''
}

describe('tema.css: cursor dos elementos clicáveis', () => {
  it('mãozinha em botão, papel de botão, seleção, resumo e caixa de marcação', () => {
    const seletores = seletoresCom('cursor: pointer')
    for (const alvo of ['button', '[role="button"]', 'select', 'summary', 'input[type="checkbox"]', 'input[type="radio"]']) {
      expect(seletores).toContain(alvo)
    }
  })

  it('o desabilitado mostra que não aceita clique', () => {
    const seletores = seletoresCom('cursor: not-allowed')
    expect(seletores).toContain(':disabled')
    expect(seletores).toContain('[aria-disabled="true"]')
  })
})
