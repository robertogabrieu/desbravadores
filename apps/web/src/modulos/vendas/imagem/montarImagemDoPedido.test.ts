import { totalDoPedido } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import { criarFormaDinheiro, criarFormaPix, criarFormaSeteMe, criarPedido, criarVenda } from '../../../testes/handlers/vendas'
import { montarImagemDoPedido, quebrarTexto } from './montarImagemDoPedido'
import type { BlocoDaImagem } from './montarImagemDoPedido'

const VENDA = criarVenda(1, { nome: 'Lasanhas — 2ª edição', formas: [criarFormaPix(), criarFormaSeteMe(), criarFormaDinheiro()] })
const ITENS = [
  { produtoId: 'a', nome: 'Lasanha de carne', nomeCurto: 'Carne', quantidade: 2, precoGravado: 3000 },
  { produtoId: 'b', nome: 'Lasanha de frango', nomeCurto: 'Frango', quantidade: 1, precoGravado: 2500 },
  { produtoId: 'c', nome: 'Lasanha de PVT', nomeCurto: 'PVT', quantidade: 0, precoGravado: 2500 },
]

const ids = (blocos: BlocoDaImagem[]) => blocos.map((bloco) => bloco.id)
const textos = (blocos: BlocoDaImagem[]) => blocos.flatMap((bloco) => [bloco.titulo ?? '', ...bloco.linhas.flatMap((linha) => [linha.texto, linha.valor ?? ''])]).filter(Boolean)
const bloco = (blocos: BlocoDaImagem[], id: BlocoDaImagem['id']) => blocos.find((candidato) => candidato.id === id)

describe('montarImagemDoPedido', () => {
  it('põe o nome do clube logo abaixo do nome da venda, no cabeçalho', () => {
    const venda = bloco(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS }), 'Aurora'), 'venda')
    expect(venda?.linhas.map((linha) => linha.texto)).toEqual(['Lasanhas — 2ª edição', 'Clube Aurora'])
  })

  it('sem nome de clube o cabeçalho traz só a venda', () => {
    expect(bloco(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS }), ''), 'venda')?.linhas).toHaveLength(1)
  })

  it('põe os blocos na ordem da imagem: venda, pedido, itens, situação, como pagar, retirada, instruções', () => {
    const blocos = montarImagemDoPedido(VENDA, criarPedido(45, { comprador: 'Marlene Prado', itens: ITENS }), 'Aurora')
    expect(ids(blocos)).toEqual(['venda', 'pedido', 'itens', 'situacao', 'pagar', 'local', 'instrucoes', 'rodape'])
    expect(bloco(blocos, 'venda')?.linhas[0]?.texto).toBe('Lasanhas — 2ª edição')
    expect(bloco(blocos, 'pedido')?.linhas[0]?.texto).toBe('Pedido nº 45 — Marlene Prado')
  })

  it('lista os itens com quantidade e valor e deixa de fora o item com quantidade zero', () => {
    const itens = bloco(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS }), 'Aurora'), 'itens')?.linhas
    expect(itens?.slice(0, 2)).toEqual([
      { texto: '2 × Lasanha de carne', valor: 'R$ 60,00' },
      { texto: '1 × Lasanha de frango', valor: 'R$ 25,00' },
    ])
    expect(textos(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS }), 'Aurora')).join('|')).not.toContain('PVT')
  })

  it('mostra a taxa só quando o pedido tem taxa gravada', () => {
    const sem = bloco(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS }), 'Aurora'), 'itens')?.linhas.map((linha) => linha.texto)
    const com = bloco(montarImagemDoPedido(VENDA, criarPedido(1, { itens: ITENS, entrega: true, endereco: 'Rua A, 1', taxaEntrega: 500 }), 'Aurora'), 'itens')?.linhas
    expect(sem).not.toContain('Entrega')
    expect(com?.find((linha) => linha.texto === 'Entrega')?.valor).toBe('R$ 5,00')
  })

  it('o total é o de totalDoPedido com os preços gravados, não os da venda (paridade)', () => {
    const pedido = criarPedido(1, { itens: ITENS, entrega: true, endereco: 'Rua A, 1', taxaEntrega: 750 })
    const total = bloco(montarImagemDoPedido(VENDA, pedido, 'Aurora'), 'itens')?.linhas.find((linha) => linha.texto === 'Total')
    expect(total?.valor).toBe('R$ 92,50')
    expect(pedido.total).toBe(totalDoPedido(ITENS, 750))
    expect(VENDA.produtos[0]?.preco).toBe(2500)
  })

  it('pendente mostra "Como pagar" com os dados das formas ativas; a forma desativada fica de fora', () => {
    const venda = criarVenda(1, { formas: [criarFormaPix(), criarFormaSeteMe({ ativo: false }), criarFormaDinheiro()] })
    const pagar = bloco(montarImagemDoPedido(venda, criarPedido(1), 'Aurora'), 'pagar')
    expect(pagar?.titulo).toBe('Como pagar')
    const conteudo = pagar?.linhas.map((linha) => linha.texto).join('|') ?? ''
    expect(conteudo).toContain('00.000.000/0001-00')
    expect(conteudo).toContain('Clube Teste')
    expect(conteudo).toContain('Dinheiro')
    expect(conteudo).not.toContain('Outras ofertas')
  })

  it('mostra a orientação do 7me quando a forma está ativa', () => {
    const pagar = bloco(montarImagemDoPedido(VENDA, criarPedido(1), 'Aurora'), 'pagar')
    expect(pagar?.linhas.map((linha) => linha.texto).join('|')).toContain('Ofertas > Outras ofertas > Desbravadores')
  })

  it('pago não mostra "Como pagar" e mostra só "Pago · forma"', () => {
    const blocos = montarImagemDoPedido(VENDA, criarPedido(1, { pago: true, forma: 'PIX' }), 'Aurora')
    expect(bloco(blocos, 'pagar')).toBeUndefined()
    expect(textos(blocos)).not.toContain('Como pagar')
    expect(bloco(blocos, 'situacao')?.linhas[0]).toMatchObject({ texto: 'Pago · Pix', tom: 'sucesso' })
  })

  it('pendente leva a situação "A pagar"', () => {
    expect(bloco(montarImagemDoPedido(VENDA, criarPedido(1), 'Aurora'), 'situacao')?.linhas[0]).toMatchObject({ texto: 'A pagar', tom: 'alerta' })
  })

  it('pedido cancelado não pede pagamento', () => {
    const blocos = montarImagemDoPedido(VENDA, criarPedido(1, { canceladoEm: '2026-10-25T12:00:00.000Z' }), 'Aurora')
    expect(bloco(blocos, 'pagar')).toBeUndefined()
    expect(bloco(blocos, 'situacao')?.linhas[0]?.texto).toBe('Cancelado')
  })

  it('retirada mostra data, horário e local da venda', () => {
    const local = bloco(montarImagemDoPedido(VENDA, criarPedido(1), 'Aurora'), 'local')
    expect(local?.titulo).toBe('Retirada')
    expect(local?.linhas.map((linha) => linha.texto)).toEqual(['Sábado, 14/11 · 9h às 12h', 'Salão da igreja'])
  })

  it('retirada omite o que a venda não informou e some sem nada informado', () => {
    const parcial = criarVenda(1, { retiradaData: null, retiradaHorario: null, retiradaLocal: 'Salão da igreja' })
    expect(bloco(montarImagemDoPedido(parcial, criarPedido(1), 'Aurora'), 'local')?.linhas.map((linha) => linha.texto)).toEqual(['Salão da igreja'])
    const vazia = criarVenda(1, { retiradaData: null, retiradaHorario: null, retiradaLocal: null })
    expect(bloco(montarImagemDoPedido(vazia, criarPedido(1), 'Aurora'), 'local')).toBeUndefined()
  })

  it('entrega mostra o endereço do pedido e não a retirada da venda', () => {
    const local = bloco(montarImagemDoPedido(VENDA, criarPedido(1, { entrega: true, endereco: 'Rua das Acácias, 120, ap. 32', taxaEntrega: 500 }), 'Aurora'), 'local')
    expect(local?.titulo).toBe('Entrega')
    expect(local?.linhas.map((linha) => linha.texto)).toEqual(['Rua das Acácias, 120, ap. 32'])
  })

  it('instruções entram só quando a venda tem', () => {
    expect(bloco(montarImagemDoPedido(VENDA, criarPedido(1), 'Aurora'), 'instrucoes')?.linhas[0]?.texto).toBe('Guarde na geladeira.')
    expect(bloco(montarImagemDoPedido(criarVenda(1, { instrucoes: null }), criarPedido(1), 'Aurora'), 'instrucoes')).toBeUndefined()
    expect(bloco(montarImagemDoPedido(criarVenda(1, { instrucoes: '  ' }), criarPedido(1), 'Aurora'), 'instrucoes')).toBeUndefined()
  })

  it('texto longo continua inteiro no conteúdo: quem quebra é o desenho', () => {
    const longo = 'Guarde na geladeira. '.repeat(40).trim()
    expect(bloco(montarImagemDoPedido(criarVenda(1, { instrucoes: longo }), criarPedido(1), 'Aurora'), 'instrucoes')?.linhas[0]?.texto).toBe(longo)
  })

  it('não leva nada de uso interno: vendedor, unidade e observação', () => {
    const pedido = criarPedido(1, { vendedor: 'Giovana', unidadeNome: 'Tigresas', observacao: 'sem queijo' })
    const tudo = textos(montarImagemDoPedido(VENDA, pedido, 'Aurora')).join('|')
    for (const interno of ['Giovana', 'Tigresas', 'sem queijo']) expect(tudo).not.toContain(interno)
  })
})

describe('quebrarTexto', () => {
  const medir = (texto: string) => texto.length * 10

  it('mantém numa linha o que cabe', () => {
    expect(quebrarTexto('oi tudo bem', 200, medir)).toEqual(['oi tudo bem'])
  })

  it('quebra nas palavras pela largura, e mais largura de texto dá mais linhas', () => {
    expect(quebrarTexto('aaa bbb ccc ddd', 70, medir)).toEqual(['aaa bbb', 'ccc ddd'])
    expect(quebrarTexto('aaa bbb ccc ddd', 40, medir)).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])
  })

  it('parte a palavra que sozinha não cabe', () => {
    expect(quebrarTexto('abcdefghij', 40, medir)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('respeita as quebras de linha do texto', () => {
    expect(quebrarTexto('um\ndois', 500, medir)).toEqual(['um', 'dois'])
  })

  it('texto vazio dá uma linha vazia', () => {
    expect(quebrarTexto('', 100, medir)).toEqual([''])
  })
})
