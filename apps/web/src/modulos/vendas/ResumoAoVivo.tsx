import { totalDoPedido } from '@desbravadores/shared'
import type { ItemParaTotal } from '@desbravadores/shared'
import { Check } from 'lucide-react'
import { useId } from 'react'
import { Cartao } from '../../ui/Cartao'
import { Selo } from '../../ui/Selo'
import { formatarReais } from './formatos'

export interface LinhaDoResumo extends ItemParaTotal {
  produtoId: string
  nomeCurto: string
}

interface Propriedades {
  itens: readonly LinhaDoResumo[]
  entrega: boolean
  /** A taxa que vale para este pedido; não é somada quando for retirada. */
  taxaEntrega: number
  /** "Pago · Pix": a situação de pagamento, quando já pago. */
  pago?: string | null
}

/** O valor do pedido enquanto se preenche: só quem tem quantidade entra, e o total sai de `totalDoPedido`. */
export function ResumoAoVivo({ itens, entrega, taxaEntrega, pago }: Propriedades) {
  const idTitulo = useId()
  const escolhidos = itens.filter((item) => item.quantidade > 0)
  const taxa = entrega ? taxaEntrega : 0
  return (
    <aside aria-labelledby={idTitulo}>
      <Cartao className="sticky top-4 flex flex-col gap-3 p-5">
        <h2 id={idTitulo} className="font-titulo text-lg font-bold text-texto">
          Resumo do pedido
        </h2>
        {escolhidos.length === 0 && <p className="text-base text-texto-2">Nenhum item ainda.</p>}
        {escolhidos.map((item) => (
          <div key={item.produtoId} className="flex items-center justify-between gap-3 text-base text-texto">
            <span>
              {item.quantidade} {item.nomeCurto}
            </span>
            <span className="tabular-nums">{formatarReais(item.quantidade * item.precoGravado)}</span>
          </div>
        ))}
        {entrega && (
          <div className="flex items-center justify-between gap-3 text-base text-texto">
            <span>Entrega</span>
            <span className="tabular-nums">{formatarReais(taxa)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-divisor pt-3">
          <b className="text-base text-texto">Total</b>
          <output aria-label="Total do pedido" className="font-titulo text-3xl font-extrabold text-texto tabular-nums">
            {formatarReais(totalDoPedido(escolhidos, taxa))}
          </output>
        </div>
        {pago && (
          <Selo tom="sucesso" className="self-start">
            <Check aria-hidden className="size-4" />
            {pago}
          </Selo>
        )}
      </Cartao>
    </aside>
  )
}
