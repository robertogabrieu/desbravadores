import { rotuloDaSituacao, situacaoDoPedido } from '@desbravadores/shared'
import type { FormaPagamentoVendaSaida } from '@desbravadores/shared'
import type { Pedido, Venda } from '../../../api/vendas'
import { dataDaRetirada, formatarReaisComCentavos } from '../formatos'

export type TomDaLinha = 'sucesso' | 'alerta' | 'neutro'

/** `titulo` e `forte` mudam só o peso da letra; `total` é o valor que o comprador procura; `selo` é a etiqueta de situação. */
export type EnfaseDaLinha = 'normal' | 'forte' | 'suave' | 'titulo' | 'total' | 'selo'

export interface LinhaDaImagem {
  texto: string
  /** Valor alinhado à direita; ausente quando a linha é só texto. */
  valor?: string
  enfase?: EnfaseDaLinha
  tom?: TomDaLinha
}

export type IdDoBloco = 'venda' | 'pedido' | 'itens' | 'situacao' | 'pagar' | 'local' | 'instrucoes' | 'rodape'

export interface BlocoDaImagem {
  id: IdDoBloco
  titulo: string | null
  linhas: LinhaDaImagem[]
}

const AGRADECIMENTO = 'Obrigado por apoiar o nosso clube!'

function linhasDaForma(forma: FormaPagamentoVendaSaida): LinhaDaImagem[] {
  if (forma.tipo === 'PIX') return [{ texto: `Pix · chave ${forma.chave}`, enfase: 'forte' }, { texto: `Favorecido: ${forma.favorecido}`, enfase: 'suave' }]
  if (forma.tipo === 'SETE_ME') return [{ texto: `7me · ${forma.orientacao}`, enfase: 'forte' }]
  return [{ texto: 'Dinheiro', enfase: 'forte' }]
}

function blocoDosItens(pedido: Pedido): BlocoDaImagem {
  const itens = pedido.itens
    .filter((item) => item.quantidade > 0)
    .map<LinhaDaImagem>((item) => ({ texto: `${item.quantidade} × ${item.nome}`, valor: formatarReaisComCentavos(item.quantidade * item.precoGravado) }))
  const taxa: LinhaDaImagem[] = pedido.taxaEntrega > 0 ? [{ texto: 'Entrega', valor: formatarReaisComCentavos(pedido.taxaEntrega) }] : []
  return { id: 'itens', titulo: null, linhas: [...itens, ...taxa, { texto: 'Total', valor: formatarReaisComCentavos(pedido.total), enfase: 'total' }] }
}

function blocoDoLocal(venda: Venda, pedido: Pedido): BlocoDaImagem | null {
  if (pedido.entrega) return pedido.endereco ? { id: 'local', titulo: 'Entrega', linhas: [{ texto: pedido.endereco, enfase: 'forte' }] } : null
  const quando = [venda.retiradaData ? dataDaRetirada(venda.retiradaData) : null, venda.retiradaHorario].filter(Boolean).join(' · ')
  const linhas: LinhaDaImagem[] = []
  if (quando) linhas.push({ texto: quando, enfase: 'forte' })
  if (venda.retiradaLocal) linhas.push({ texto: venda.retiradaLocal })
  return linhas.length > 0 ? { id: 'local', titulo: 'Retirada', linhas } : null
}

/**
 * O conteúdo da imagem do pedido, na ordem em que ele é desenhado. Preço e taxa vêm do que está gravado
 * no pedido e o total é o que o servidor calculou com `totalDoPedido`; nada de uso interno entra.
 */
export function montarImagemDoPedido(venda: Venda, pedido: Pedido, nomeDoClube: string): BlocoDaImagem[] {
  const situacao = situacaoDoPedido(pedido)
  const tom: TomDaLinha = situacao === 'PAGO' ? 'sucesso' : situacao === 'A_PAGAR' ? 'alerta' : 'neutro'
  const instrucoes = venda.instrucoes?.trim()
  const formasAtivas = venda.formas.filter((forma) => forma.ativo)

  const blocos: (BlocoDaImagem | null)[] = [
    { id: 'venda', titulo: null, linhas: [{ texto: venda.nome, enfase: 'titulo' }, ...(nomeDoClube ? [{ texto: `Clube ${nomeDoClube}`, enfase: 'suave' as const }] : [])] },
    { id: 'pedido', titulo: null, linhas: [{ texto: `Pedido nº ${pedido.numero} — ${pedido.comprador}`, enfase: 'titulo' }] },
    blocoDosItens(pedido),
    { id: 'situacao', titulo: null, linhas: [{ texto: rotuloDaSituacao(situacao, pedido.forma), enfase: 'selo', tom }] },
    situacao === 'A_PAGAR' && formasAtivas.length > 0 ? { id: 'pagar', titulo: 'Como pagar', linhas: formasAtivas.flatMap(linhasDaForma) } : null,
    blocoDoLocal(venda, pedido),
    instrucoes ? { id: 'instrucoes', titulo: 'Instruções', linhas: [{ texto: instrucoes }] } : null,
    { id: 'rodape', titulo: null, linhas: [{ texto: AGRADECIMENTO, enfase: 'suave' }] },
  ]
  return blocos.filter((bloco): bloco is BlocoDaImagem => bloco !== null)
}

/** Parte `texto` em linhas que cabem em `largura`, pelas palavras; a palavra que sozinha não cabe é partida. `medir` devolve a largura de um trecho. */
export function quebrarTexto(texto: string, largura: number, medir: (trecho: string) => number): string[] {
  return texto.split('\n').flatMap((paragrafo) => {
    const linhas: string[] = []
    let atual = ''
    const fechar = () => {
      if (atual !== '') linhas.push(atual)
      atual = ''
    }
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const candidata = atual === '' ? palavra : `${atual} ${palavra}`
      if (medir(candidata) <= largura) {
        atual = candidata
        continue
      }
      fechar()
      let resto = palavra
      while (medir(resto) > largura && resto.length > 1) {
        let corte = resto.length - 1
        while (corte > 1 && medir(resto.slice(0, corte)) > largura) corte -= 1
        linhas.push(resto.slice(0, corte))
        resto = resto.slice(corte)
      }
      atual = resto
    }
    fechar()
    return linhas.length > 0 ? linhas : ['']
  })
}
