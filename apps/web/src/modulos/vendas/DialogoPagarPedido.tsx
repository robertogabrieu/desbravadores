import { FORMAS_DO_PEDIDO, rotuloDaForma } from '@desbravadores/shared'
import type { FormaDoPedido, TipoDeFormaDaVenda } from '@desbravadores/shared'
import { useState } from 'react'
import type { Venda } from '../../api/vendas'
import { Confirmacao } from '../../ui/Confirmacao'
import { EscolhaUnica } from '../../ui/EscolhaUnica'
import type { OpcaoDaEscolha } from '../../ui/EscolhaUnica'

/** Os tipos de forma que a venda aceita hoje. */
export const formasAceitasPela = (venda: Pick<Venda, 'formas'>): TipoDeFormaDaVenda[] => venda.formas.filter((forma) => forma.ativo).map((forma) => forma.tipo)

/** As formas aceitas mais "Misto", que não é cadastrado na venda: o comprador combina as que ela aceita. */
export const opcoesDeForma = (aceitas: readonly TipoDeFormaDaVenda[]): OpcaoDaEscolha<FormaDoPedido>[] =>
  FORMAS_DO_PEDIDO.filter((forma) => forma === 'MISTO' || aceitas.includes(forma)).map((forma) => ({ valor: forma, rotulo: rotuloDaForma(forma) }))

interface Propriedades {
  aberto: boolean
  /** Formas que a venda aceita (`formasAceitasPela`); "Misto" entra sozinho. */
  formas: readonly TipoDeFormaDaVenda[]
  /** Chamado só com uma forma escolhida; fechar o diálogo depois de gravar é de quem o abriu. */
  aoConfirmar: (forma: FormaDoPedido) => void
  aoCancelar: () => void
  ocupado?: boolean
  /** Falha da gravação; o diálogo continua aberto. */
  erro?: string | null
}

function EscolherForma({ formas, aoConfirmar, aoCancelar, ocupado, erro }: Omit<Propriedades, 'aberto'>) {
  const [forma, setForma] = useState<FormaDoPedido | null>(null)
  return (
    <Confirmacao
      aberta
      titulo="Como o pedido foi pago?"
      rotuloConfirmar="Marcar como pago"
      rotuloCancelar="Voltar"
      confirmarDesabilitado={forma === null}
      ocupada={ocupado}
      erro={erro}
      aoConfirmar={() => forma && aoConfirmar(forma)}
      aoCancelar={aoCancelar}
    >
      <EscolhaUnica legenda="Forma de pagamento" opcoes={opcoesDeForma(formas)} valor={forma} aoEscolher={setForma} />
    </Confirmacao>
  )
}

/** Pergunta a forma ao marcar o pedido como pago. Fechado, não guarda a escolha anterior. */
export function DialogoPagarPedido({ aberto, ...resto }: Propriedades) {
  return aberto ? <EscolherForma {...resto} /> : null
}
