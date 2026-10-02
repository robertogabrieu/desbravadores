import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Diálogo fechado em `onSettled:` some também quando a ação falha, e o erro não aparece para ninguém.
// Fechar vai no `onSuccess`; no erro, o diálogo fica aberto com a mensagem.
const MODULOS = resolve(__dirname, '../modulos')

function arquivosDeCodigo(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosDeCodigo(caminho)
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : []
  })
}

describe('diálogo fecha só no sucesso', () => {
  it('nenhum módulo usa onSettled: para fechar o que pediu confirmação', () => {
    const ofensores = arquivosDeCodigo(MODULOS)
      .filter((caminho) => /\bonSettled\s*:/.test(readFileSync(caminho, 'utf8')))
      .map((caminho) => relative(MODULOS, caminho))
    expect(ofensores).toEqual([])
  })
})
