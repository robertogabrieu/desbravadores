import { FORMAS_DO_PEDIDO, rotuloDaForma } from '@desbravadores/shared'
import type { FormaDoPedido, TipoDeFormaDaVenda } from '@desbravadores/shared'
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Venda } from '../../api/vendas'
import { CampoArquivo } from '../../ui/CampoArquivo'
import { Confirmacao } from '../../ui/Confirmacao'
import { EscolhaUnica } from '../../ui/EscolhaUnica'
import type { OpcaoDaEscolha } from '../../ui/EscolhaUnica'
import { ErroDeComprovante, FORMATOS_ACEITOS_NO_COMPROVANTE, prepararComprovante } from './comprovante'

/** Os tipos de forma que a venda aceita hoje. */
export const formasAceitasPela = (venda: Pick<Venda, 'formas'>): TipoDeFormaDaVenda[] => venda.formas.filter((forma) => forma.ativo).map((forma) => forma.tipo)

/** As formas aceitas mais "Misto", que não é cadastrado na venda: o comprador combina as que ela aceita. */
export const opcoesDeForma = (aceitas: readonly TipoDeFormaDaVenda[]): OpcaoDaEscolha<FormaDoPedido>[] =>
  FORMAS_DO_PEDIDO.filter((forma) => forma === 'MISTO' || aceitas.includes(forma)).map((forma) => ({ valor: forma, rotulo: rotuloDaForma(forma) }))

interface Propriedades {
  aberto: boolean
  /** Formas que a venda aceita (`formasAceitasPela`); "Misto" entra sozinho. */
  formas: readonly TipoDeFormaDaVenda[]
  /** Chamado só com uma forma escolhida, e o comprovante já pronto para enviar (ou nenhum); fechar o diálogo depois de gravar é de quem o abriu. */
  aoConfirmar: (forma: FormaDoPedido, comprovante: File | null) => void
  aoCancelar: () => void
  ocupado?: boolean
  /** Falha da gravação; o diálogo continua aberto. */
  erro?: string | null
}

function EscolherForma({ formas, aoConfirmar, aoCancelar, ocupado, erro }: Omit<Propriedades, 'aberto'>) {
  const [forma, setForma] = useState<FormaDoPedido | null>(null)
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [erroDoComprovante, setErroDoComprovante] = useState<string | undefined>()
  const [preparando, setPreparando] = useState(false)

  /** Foto é reduzida antes de entrar aqui; arquivo recusado não fica guardado. */
  async function escolherComprovante(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0] ?? null
    setComprovante(null)
    setErroDoComprovante(undefined)
    if (!escolhido) return
    setPreparando(true)
    try {
      setComprovante(await prepararComprovante(escolhido))
    } catch (falha) {
      setErroDoComprovante(falha instanceof ErroDeComprovante ? falha.message : 'Não foi possível preparar o arquivo. Tente outro.')
    } finally {
      setPreparando(false)
    }
  }

  return (
    <Confirmacao
      aberta
      titulo="Como o pedido foi pago?"
      rotuloConfirmar="Marcar como pago"
      rotuloCancelar="Voltar"
      confirmarDesabilitado={forma === null || preparando}
      ocupada={ocupado}
      erro={erro}
      aoConfirmar={() => forma && aoConfirmar(forma, comprovante)}
      aoCancelar={aoCancelar}
    >
      <div className="flex flex-col gap-4">
        <EscolhaUnica legenda="Forma de pagamento" opcoes={opcoesDeForma(formas)} valor={forma} aoEscolher={setForma} />
        <CampoArquivo
          rotulo="Comprovante (opcional)"
          ajuda="Foto ou PDF do comprovante de pagamento. Pode ficar para depois."
          accept={FORMATOS_ACEITOS_NO_COMPROVANTE}
          erro={erroDoComprovante}
          disabled={ocupado}
          onChange={(evento) => void escolherComprovante(evento)}
        />
      </div>
    </Confirmacao>
  )
}

/** Pergunta a forma ao marcar o pedido como pago. Fechado, não guarda a escolha anterior. */
export function DialogoPagarPedido({ aberto, ...resto }: Propriedades) {
  return aberto ? <EscolherForma {...resto} /> : null
}
