import { describe, expect, it } from 'vitest'
import {
  FormaPagamentoVendaEntrada,
  PagarPedidoEntrada,
  PedidoEdicao,
  PedidoEntrada,
  PedidosQuery,
  VendaEntrada,
} from './vendas'

const U1 = '0190a0a0-0000-7000-8000-000000000001'
const P1 = '0190a0a0-0000-7000-8000-000000000002'
const P2 = '0190a0a0-0000-7000-8000-000000000003'

const vendaValida = {
  nome: 'Lasanha',
  taxaEntrega: 500,
  produtos: [{ nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3000 }],
  formas: [{ tipo: 'DINHEIRO' }],
}
const pedidoValido = { comprador: 'Maria', itens: [{ produtoId: P1, quantidade: 1 }] }

const mensagens = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues.map((i) => i.message) ?? []

describe('VendaEntrada', () => {
  it('aceita a venda mínima e normaliza os opcionais para nulo', () => {
    const venda = VendaEntrada.parse(vendaValida)
    expect(venda).toMatchObject({ retiradaData: null, retiradaHorario: null, retiradaLocal: null, instrucoes: null })
  })
  it('exige ao menos um produto', () => {
    expect(mensagens(VendaEntrada.safeParse({ ...vendaValida, produtos: [] }))).toContain('Cadastre ao menos um produto.')
  })
  it('exige ao menos uma forma de pagamento', () => {
    expect(mensagens(VendaEntrada.safeParse({ ...vendaValida, formas: [] }))).toContain('Escolha ao menos uma forma de pagamento.')
  })
  it('recusa a mesma forma duas vezes', () => {
    expect(VendaEntrada.safeParse({ ...vendaValida, formas: [{ tipo: 'DINHEIRO' }, { tipo: 'DINHEIRO' }] }).success).toBe(false)
  })
  it('preço: bordas 1 e 999.999 passam; 0 e 1.000.000 não; centavo fracionado não', () => {
    const comPreco = (preco: number) => VendaEntrada.safeParse({ ...vendaValida, produtos: [{ nome: 'a', nomeCurto: 'a', preco }] }).success
    expect(comPreco(1)).toBe(true)
    expect(comPreco(999_999)).toBe(true)
    expect(comPreco(0)).toBe(false)
    expect(comPreco(1_000_000)).toBe(false)
    expect(comPreco(10.5)).toBe(false)
  })
  it('taxa: bordas 0 e 99.999 passam; -1 e 100.000 não', () => {
    const comTaxa = (taxaEntrega: number) => VendaEntrada.safeParse({ ...vendaValida, taxaEntrega }).success
    expect(comTaxa(0)).toBe(true)
    expect(comTaxa(99_999)).toBe(true)
    expect(comTaxa(-1)).toBe(false)
    expect(comTaxa(100_000)).toBe(false)
  })
  it('exige nome da venda e do produto', () => {
    expect(VendaEntrada.safeParse({ ...vendaValida, nome: '  ' }).success).toBe(false)
    expect(VendaEntrada.safeParse({ ...vendaValida, produtos: [{ nome: '', nomeCurto: 'a', preco: 100 }] }).success).toBe(false)
  })
  it('produto e forma com id são existentes; sem id são novos', () => {
    const venda = VendaEntrada.parse({
      ...vendaValida,
      produtos: [{ id: P1, nome: 'a', nomeCurto: 'a', preco: 100 }, { nome: 'b', nomeCurto: 'b', preco: 100 }],
    })
    expect(venda.produtos.map((p) => p.id)).toEqual([P1, undefined])
  })
  it('aceita data de retirada civil e recusa lixo', () => {
    expect(VendaEntrada.safeParse({ ...vendaValida, retiradaData: '2026-11-20' }).success).toBe(true)
    expect(VendaEntrada.safeParse({ ...vendaValida, retiradaData: '20/11/2026' }).success).toBe(false)
  })
})

describe('FormaPagamentoVendaEntrada (união por tipo)', () => {
  it('PIX exige chave e favorecido', () => {
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'PIX', chave: 'a@b.c', favorecido: 'Clube' }).success).toBe(true)
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'PIX', chave: 'a@b.c' }).success).toBe(false)
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'PIX', favorecido: 'Clube' }).success).toBe(false)
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'PIX' }).success).toBe(false)
  })
  it('SETE_ME exige orientação', () => {
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'SETE_ME', orientacao: 'Ofertas > Desbravadores' }).success).toBe(true)
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'SETE_ME' }).success).toBe(false)
  })
  it('DINHEIRO não exige nada', () => {
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'DINHEIRO' }).success).toBe(true)
  })
  it('tipo desconhecido é recusado', () => {
    expect(FormaPagamentoVendaEntrada.safeParse({ tipo: 'CARTAO' }).success).toBe(false)
  })
})

describe('PedidoEntrada', () => {
  it('aceita retirada simples, pendente, com defaults', () => {
    expect(PedidoEntrada.parse(pedidoValido)).toMatchObject({
      vendedor: null, unidadeId: null, daDiretoria: false, entrega: false, endereco: null, observacao: null, pago: false, forma: null,
    })
  })
  it('entrega sem endereço', () => {
    expect(mensagens(PedidoEntrada.safeParse({ ...pedidoValido, entrega: true }))).toContain('Informe o endereço da entrega.')
    expect(mensagens(PedidoEntrada.safeParse({ ...pedidoValido, entrega: true, endereco: '  ' }))).toContain('Informe o endereço da entrega.')
  })
  it('entrega com endereço passa', () => {
    expect(PedidoEntrada.safeParse({ ...pedidoValido, entrega: true, endereco: 'Rua A, 1' }).success).toBe(true)
  })
  it('retirada com endereço é recusada', () => {
    expect(PedidoEntrada.safeParse({ ...pedidoValido, endereco: 'Rua A, 1' }).success).toBe(false)
  })
  it('todas as quantidades zero: "Escolha ao menos uma unidade."', () => {
    expect(mensagens(PedidoEntrada.safeParse({ ...pedidoValido, itens: [{ produtoId: P1, quantidade: 0 }] }))).toContain('Escolha ao menos uma unidade.')
    expect(mensagens(PedidoEntrada.safeParse({ ...pedidoValido, itens: [] }))).toContain('Escolha ao menos uma unidade.')
  })
  it('basta uma unidade entre itens zerados', () => {
    const itens = [{ produtoId: P1, quantidade: 0 }, { produtoId: P2, quantidade: 1 }]
    expect(PedidoEntrada.safeParse({ ...pedidoValido, itens }).success).toBe(true)
  })
  it('quantidade: 999 passa; 1000 e -1 não', () => {
    const com = (quantidade: number) => PedidoEntrada.safeParse({ ...pedidoValido, itens: [{ produtoId: P1, quantidade }] }).success
    expect(com(999)).toBe(true)
    expect(com(1000)).toBe(false)
    expect(com(-1)).toBe(false)
  })
  it('produto repetido é recusado', () => {
    const itens = [{ produtoId: P1, quantidade: 1 }, { produtoId: P1, quantidade: 2 }]
    expect(PedidoEntrada.safeParse({ ...pedidoValido, itens }).success).toBe(false)
  })
  it('Diretoria e unidade são exclusivas', () => {
    expect(PedidoEntrada.safeParse({ ...pedidoValido, daDiretoria: true, unidadeId: U1 }).success).toBe(false)
    expect(PedidoEntrada.safeParse({ ...pedidoValido, daDiretoria: true }).success).toBe(true)
    expect(PedidoEntrada.safeParse({ ...pedidoValido, unidadeId: U1 }).success).toBe(true)
  })
  it('forma sem pago é recusada; com pago passa; MISTO vale', () => {
    expect(PedidoEntrada.safeParse({ ...pedidoValido, forma: 'PIX' }).success).toBe(false)
    expect(PedidoEntrada.safeParse({ ...pedidoValido, pago: true, forma: 'PIX' }).success).toBe(true)
    expect(PedidoEntrada.safeParse({ ...pedidoValido, pago: true, forma: 'MISTO' }).success).toBe(true)
    expect(PedidoEntrada.safeParse({ ...pedidoValido, pago: true, forma: 'CARTAO' }).success).toBe(false)
  })
  it('comprador é obrigatório; vendedor é opcional', () => {
    expect(PedidoEntrada.safeParse({ ...pedidoValido, comprador: ' ' }).success).toBe(false)
    expect(PedidoEntrada.parse({ ...pedidoValido, vendedor: 'João' }).vendedor).toBe('João')
  })
})

describe('PedidoEdicao', () => {
  it('aplica as mesmas regras de endereço e unidades, sem pago nem forma', () => {
    expect(mensagens(PedidoEdicao.safeParse({ ...pedidoValido, entrega: true }))).toContain('Informe o endereço da entrega.')
    expect(PedidoEdicao.safeParse(pedidoValido).success).toBe(true)
    expect(Object.keys(PedidoEdicao.parse({ ...pedidoValido, pago: true, forma: 'PIX' }))).not.toContain('pago')
  })
})

describe('PagarPedidoEntrada e PedidosQuery', () => {
  it('pagar exige forma válida', () => {
    expect(PagarPedidoEntrada.safeParse({ forma: 'SETE_ME' }).success).toBe(true)
    expect(PagarPedidoEntrada.safeParse({}).success).toBe(false)
  })
  it('query: defaults TODOS e página 1; coage texto da URL', () => {
    expect(PedidosQuery.parse({})).toEqual({ filtro: 'TODOS', pagina: 1 })
    expect(PedidosQuery.parse({ filtro: 'A_PAGAR', pagina: '3', busca: ' ana ' })).toEqual({ filtro: 'A_PAGAR', pagina: 3, busca: 'ana' })
  })
  it('query recusa filtro desconhecido e página 0', () => {
    expect(PedidosQuery.safeParse({ filtro: 'X' }).success).toBe(false)
    expect(PedidosQuery.safeParse({ pagina: '0' }).success).toBe(false)
  })
})
