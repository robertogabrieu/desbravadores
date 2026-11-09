import { describe, expect, it, vi } from 'vitest'
import { compartilharImagem, nomeDoArquivoDoPedido, podeCompartilhar } from './compartilhar'

const arquivo = new File(['x'], 'pedido-3.png', { type: 'image/png' })

describe('podeCompartilhar', () => {
  it('é verdadeiro quando o aparelho aceita compartilhar o arquivo', () => {
    const canShare = vi.fn(() => true)
    expect(podeCompartilhar(arquivo, { canShare })).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files: [arquivo] })
  })

  it('é falso quando o aparelho recusa o arquivo', () => {
    expect(podeCompartilhar(arquivo, { canShare: () => false })).toBe(false)
  })

  it('é falso quando o navegador não tem canShare', () => {
    expect(podeCompartilhar(arquivo, {})).toBe(false)
  })
})

describe('compartilharImagem', () => {
  it('abre o menu do aparelho com o arquivo e o título', async () => {
    const share = vi.fn(() => Promise.resolve())
    await compartilharImagem(arquivo, 'Pedido nº 3', { canShare: () => true, share })
    expect(share).toHaveBeenCalledWith({ files: [arquivo], title: 'Pedido nº 3' })
  })

  it('fechar o menu sem escolher não é erro', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('cancelado', 'AbortError')))
    await expect(compartilharImagem(arquivo, 'Pedido nº 3', { canShare: () => true, share })).resolves.toBeUndefined()
  })

  it('outra falha continua sendo falha', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('negado', 'NotAllowedError')))
    await expect(compartilharImagem(arquivo, 'Pedido nº 3', { canShare: () => true, share })).rejects.toThrow('negado')
  })
})

describe('nomeDoArquivoDoPedido', () => {
  it('monta pedido-<n>-<comprador>.png com o comprador em nome seguro', () => {
    expect(nomeDoArquivoDoPedido(3, 'Marlene Prado')).toBe('pedido-3-marlene-prado.png')
    expect(nomeDoArquivoDoPedido(12, 'João D’Ávila / Silva')).toBe('pedido-12-joao-d-avila-silva.png')
  })

  it('sem letra aproveitável no comprador fica só o número', () => {
    expect(nomeDoArquivoDoPedido(7, '???')).toBe('pedido-7.png')
  })

  it('limita o tamanho do nome', () => {
    expect(nomeDoArquivoDoPedido(1, 'a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
