import { describe, expect, it } from 'vitest'
import { dispor, LARGURA_DA_IMAGEM } from './desenharImagem'
import type { BlocoDaImagem } from './montarImagemDoPedido'

const CORES = { marca: '#1', marcaSuave: '#2', creme: '#3', texto: '#4', textoSecundario: '#5', borda: '#6', superficie: '#7', sucesso: '#8', alerta: '#9', alertaFundo: '#a' }
const FAMILIAS = { titulo: 'titulo', corpo: 'corpo' }
const medir = (_fonte: string, texto: string) => texto.length * 20

const comInstrucoes = (texto: string): BlocoDaImagem[] => [
  { id: 'venda', titulo: null, linhas: [{ texto: 'Venda', enfase: 'titulo' }] },
  { id: 'instrucoes', titulo: 'Instruções', linhas: [{ texto }] },
]

describe('dispor', () => {
  it('texto longo quebra por largura e aumenta a altura da imagem', () => {
    const curta = dispor(comInstrucoes('Guarde na geladeira.'), medir, CORES, FAMILIAS)
    const longa = dispor(comInstrucoes('Guarde na geladeira. '.repeat(20)), medir, CORES, FAMILIAS)
    expect(longa.altura).toBeGreaterThan(curta.altura)
  })

  it('nenhum texto passa da largura da imagem', () => {
    const { operacoes } = dispor(comInstrucoes('palavra '.repeat(60)), medir, CORES, FAMILIAS)
    for (const operacao of operacoes) {
      if (operacao.tipo === 'texto') expect(operacao.x + medir('', operacao.texto)).toBeLessThanOrEqual(LARGURA_DA_IMAGEM)
    }
  })
})
