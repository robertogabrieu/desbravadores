import { Confirmacao } from '../../ui/Confirmacao'

interface Propriedades {
  aberto: boolean
  codigo: string
  comprador: string
  /** Fechar o diálogo depois de gravar é de quem o abriu. */
  aoConfirmar: () => void
  aoCancelar: () => void
  ocupado?: boolean
  /** Falha da gravação; o diálogo continua aberto. */
  erro?: string | null
}

/** Confirma Cancelar pedido: o pedido sai dos totais, mas não é apagado e pode ser reativado. */
export function DialogoCancelarPedido({ aberto, codigo, comprador, aoConfirmar, aoCancelar, ocupado, erro }: Propriedades) {
  return (
    <Confirmacao
      aberta={aberto}
      titulo={`Cancelar o pedido ${codigo}?`}
      rotuloConfirmar="Cancelar pedido"
      rotuloCancelar="Voltar"
      perigo
      ocupada={ocupado}
      erro={erro}
      aoConfirmar={aoConfirmar}
      aoCancelar={aoCancelar}
    >
      O pedido de {comprador} deixa de contar nos números da venda. Ele sai da lista principal e fica na aba "Cancelados", de onde você pode reativá-lo depois.
    </Confirmacao>
  )
}
