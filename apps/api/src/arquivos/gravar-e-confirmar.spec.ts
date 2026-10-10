import type { Armazenamento } from './armazenamento'
import { gravarEConfirmar } from './gravar-e-confirmar'

function armazenamentoFalso() {
  const gravar = jest.fn().mockResolvedValue(undefined)
  const gravarDeArquivo = jest.fn().mockResolvedValue(undefined)
  const armazenamento: Armazenamento = { gravar, gravarDeArquivo, abrir: jest.fn(), remover: jest.fn().mockResolvedValue(undefined) }
  return { armazenamento, gravar, gravarDeArquivo }
}

const BYTES = Buffer.from('conteudo')
const DESTINOS = [
  { caminho: 'a/pdf.pdf', origem: '/tmp/envio' },
  { caminho: 'a/capa.jpg', origem: BYTES },
]

const falhandoCom = (erro: Error) => (): Promise<string> => Promise.reject<string>(erro)

const caminhosApagados = (apagar: jest.Mock): unknown[] => apagar.mock.calls.map(([caminho]) => caminho as unknown).sort()

describe('gravarEConfirmar', () => {
  it('grava cada destino pelo meio certo (string move o temporario, Buffer grava), confirma e devolve o resultado', async () => {
    const { armazenamento, gravar, gravarDeArquivo } = armazenamentoFalso()
    const apagar = jest.fn().mockResolvedValue(undefined)
    const confirmar = jest.fn().mockResolvedValue('feito')

    const resultado = await gravarEConfirmar(armazenamento, DESTINOS, confirmar, apagar)

    expect(resultado).toBe('feito')
    expect(gravarDeArquivo).toHaveBeenCalledWith('a/pdf.pdf', '/tmp/envio')
    expect(gravar).toHaveBeenCalledWith('a/capa.jpg', BYTES)
    expect(confirmar).toHaveBeenCalledTimes(1)
    expect(apagar).not.toHaveBeenCalled()
  })

  it('confirmacao que falha apaga todos os destinos e relanca o mesmo erro', async () => {
    const { armazenamento } = armazenamentoFalso()
    const apagar = jest.fn().mockResolvedValue(undefined)
    const erro = new Error('a transacao caiu')

    await expect(gravarEConfirmar(armazenamento, DESTINOS, falhandoCom(erro), apagar)).rejects.toBe(erro)

    expect(caminhosApagados(apagar)).toEqual(['a/capa.jpg', 'a/pdf.pdf'])
  })

  it('gravacao que falha no meio nao confirma, apaga todos os destinos (inclusive o que ja foi gravado) e relanca', async () => {
    const { armazenamento, gravar } = armazenamentoFalso()
    const erro = new Error('disco cheio')
    gravar.mockRejectedValueOnce(erro)
    const apagar = jest.fn().mockResolvedValue(undefined)
    const confirmar = jest.fn().mockResolvedValue('nunca')

    await expect(gravarEConfirmar(armazenamento, DESTINOS, confirmar, apagar)).rejects.toBe(erro)

    expect(confirmar).not.toHaveBeenCalled()
    expect(caminhosApagados(apagar)).toEqual(['a/capa.jpg', 'a/pdf.pdf'])
  })

  it('se apagar um destino falha, os outros ainda sao apagados e o erro que sobe e o original', async () => {
    const { armazenamento } = armazenamentoFalso()
    const original = new Error('a transacao caiu')
    const apagar = jest.fn().mockRejectedValueOnce(new Error('disco travado')).mockResolvedValue(undefined)

    await expect(gravarEConfirmar(armazenamento, DESTINOS, falhandoCom(original), apagar)).rejects.toBe(original)

    expect(apagar).toHaveBeenCalledTimes(2)
  })
})
