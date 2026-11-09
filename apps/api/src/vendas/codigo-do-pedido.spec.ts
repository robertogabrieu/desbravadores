import { ALFABETO_DO_CODIGO, codigoLivreDoPedido, sortearCodigoDoPedido, TENTATIVAS_DO_CODIGO } from './codigo-do-pedido'

type Banco = Parameters<typeof codigoLivreDoPedido>[0]

/** Banco falso: só responde "já existe" para os códigos da lista. */
function bancoComUsados(usados: string[]) {
  const findFirst = jest.fn(({ where }: { where: { codigo: string } }) => Promise.resolve(usados.includes(where.codigo) ? { id: 'x' } : null))
  return { banco: { pedidoVenda: { findFirst } } as unknown as Banco, findFirst }
}

describe('código do pedido', () => {
  it('sorteia 6 caracteres do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 200; i += 1) {
      const codigo = sortearCodigoDoPedido()
      expect(codigo).toHaveLength(6)
      for (const letra of codigo) expect(ALFABETO_DO_CODIGO).toContain(letra)
    }
    expect(ALFABETO_DO_CODIGO).not.toMatch(/[IO01]/)
  })

  it('colisão: sorteia de novo e consulta sempre dentro da venda do clube', async () => {
    const { banco, findFirst } = bancoComUsados(['AAAAAA', 'BBBBBB'])
    const fila = ['AAAAAA', 'BBBBBB', 'CCCCCC']
    const codigo = await codigoLivreDoPedido(banco, 'clube-1', 'venda-1', () => fila.shift() ?? 'ZZZZZZ')
    expect(codigo).toBe('CCCCCC')
    expect(findFirst).toHaveBeenCalledTimes(3)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { clubeId: 'clube-1', vendaId: 'venda-1', codigo: 'AAAAAA' } }))
  })

  it('desiste depois de poucas tentativas', async () => {
    const { banco, findFirst } = bancoComUsados(['AAAAAA'])
    await expect(codigoLivreDoPedido(banco, 'c', 'v', () => 'AAAAAA')).rejects.toThrow('código livre')
    expect(findFirst).toHaveBeenCalledTimes(TENTATIVAS_DO_CODIGO)
  })
})
