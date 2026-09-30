import { describe, expect, it, vi } from 'vitest'
import { ErroFormatoFoto, LADO_MAXIMO, QUALIDADE_JPEG, calcularDimensoes, reduzirFoto } from './reducao'
import type { AmbienteReducao, ImagemDecodificada } from './reducao'

const arquivo = new File(['x'.repeat(10)], 'foto.png', { type: 'image/png' })

function ambiente(largura: number, altura: number) {
  const fechar = vi.fn()
  const imagem: ImagemDecodificada = { largura, altura, fechar }
  const saida = new Blob(['jpeg'], { type: 'image/jpeg' })
  const decodificar = vi.fn<AmbienteReducao['decodificar']>(() => Promise.resolve(imagem))
  const codificar = vi.fn<AmbienteReducao['codificar']>(() => Promise.resolve(saida))
  return { ambiente: { decodificar, codificar } satisfies AmbienteReducao, fechar, saida, decodificar, codificar, imagem }
}

describe('calcularDimensoes', () => {
  it('reduz o lado maior a 1600 mantendo a proporção', () => {
    expect(calcularDimensoes(4000, 3000)).toEqual({ largura: 1600, altura: 1200 })
    expect(calcularDimensoes(3000, 4000)).toEqual({ largura: 1200, altura: 1600 })
  })

  it('não amplia foto que já cabe', () => {
    expect(calcularDimensoes(800, 600)).toEqual({ largura: 800, altura: 600 })
    expect(calcularDimensoes(1600, 1600)).toEqual({ largura: 1600, altura: 1600 })
  })

  it('nunca devolve lado zero', () => {
    expect(calcularDimensoes(16000, 2)).toEqual({ largura: 1600, altura: 1 })
  })
})

describe('reduzirFoto', () => {
  it('decodifica, redimensiona pelo lado maior e codifica em JPEG 0,8', async () => {
    const { ambiente: a, decodificar, codificar, imagem, saida, fechar } = ambiente(4000, 3000)
    const resultado = await reduzirFoto(arquivo, a)
    expect(resultado).toBe(saida)
    expect(decodificar).toHaveBeenCalledWith(arquivo)
    expect(codificar).toHaveBeenCalledWith(imagem, 1600, 1200, 0.8)
    expect(LADO_MAXIMO).toBe(1600)
    expect(QUALIDADE_JPEG).toBe(0.8)
    expect(fechar).toHaveBeenCalledTimes(1)
  })

  it('falha de decodificação recusa com "Formato de foto não aceito"', async () => {
    const { ambiente: a, codificar, decodificar } = ambiente(10, 10)
    decodificar.mockRejectedValue(new Error('HEIC'))
    const promessa = reduzirFoto(arquivo, a)
    await expect(promessa).rejects.toBeInstanceOf(ErroFormatoFoto)
    await expect(promessa).rejects.toThrow('Formato de foto não aceito')
    expect(codificar).not.toHaveBeenCalled()
  })

  it('falha ao codificar também recusa e libera a imagem', async () => {
    const { ambiente: a, fechar, codificar } = ambiente(10, 10)
    codificar.mockRejectedValue(new Error('sem canvas'))
    await expect(reduzirFoto(arquivo, a)).rejects.toBeInstanceOf(ErroFormatoFoto)
    expect(fechar).toHaveBeenCalledTimes(1)
  })
})
