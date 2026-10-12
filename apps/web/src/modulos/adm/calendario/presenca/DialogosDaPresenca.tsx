import { TriangleAlert } from 'lucide-react'
import { Botao } from '../../../../ui/Botao'
import { Confirmacao } from '../../../../ui/Confirmacao'
import type { NomeDoUniforme } from './LinhaDeMarca'

const pontos = (quantos: number): string => (quantos === 1 ? '1 ponto' : `${quantos} pontos`)

/** O valor do evento: o que cada coisa dá, e em que mês do ranking isso está. */
export interface ValoresDoEvento {
  pontosParticipacao: number
  pontosUniforme: number
  uniforme: NomeDoUniforme
  /** "outubro": o mês do ranking onde os pontos do evento estão. */
  mes: string
}

export type PedidoDeTirada = { tipo: 'pessoa' | 'uniforme'; dbvId: string; nome: string; comUniforme: boolean }

/** Quantos pontos saem do ranking com a tirada; zero significa que não há o que confirmar. */
export function pontosQueSaem(pedido: Pick<PedidoDeTirada, 'tipo' | 'comUniforme'>, valores: ValoresDoEvento): number {
  const doUniforme = pedido.comUniforme ? valores.pontosUniforme : 0
  return pedido.tipo === 'uniforme' ? doUniforme : valores.pontosParticipacao + doUniforme
}

function frasesDaTirada(pedido: PedidoDeTirada, valores: ValoresDoEvento): { titulo: string; corpo: string; manter: string } {
  const { nome } = pedido
  const { mes, uniforme } = valores
  const total = pontosQueSaem(pedido, valores)
  if (pedido.tipo === 'uniforme') {
    const ficam = valores.pontosParticipacao > 0 ? ` Os ${valores.pontosParticipacao} de ir ao evento ficam.` : ''
    return {
      titulo: `Tirar o uniforme de ${uniforme} de ${nome}?`,
      corpo: `${nome} perde ${pontos(total)} do ranking de ${mes}.${ficam} Você pode marcar de novo depois.`,
      manter: 'Manter o uniforme',
    }
  }
  const partes = [
    valores.pontosParticipacao > 0 ? `${valores.pontosParticipacao} de ir ao evento` : null,
    pedido.comUniforme && valores.pontosUniforme > 0 ? `${valores.pontosUniforme} de ${uniforme}` : null,
  ].filter((parte) => parte !== null)
  const detalhe = partes.length === 2 ? `: ${partes.join(' e ')}` : ''
  return {
    titulo: `Tirar ${nome} da lista?`,
    corpo: `${nome} perde ${pontos(total)} do ranking de ${mes}${detalhe}. Você pode marcar de novo depois.`,
    manter: 'Manter na lista',
  }
}

interface PropriedadesDaTirada {
  pedido: PedidoDeTirada | null
  valores: ValoresDoEvento
  aoManter: () => void
  aoTirar: (pedido: PedidoDeTirada) => void
}

/**
 * Corrigir a lista depois de concluída tira pontos do ranking. O botão de cor é o seguro ("Manter"): Esc, o fundo e
 * "Cancelar" nunca tiram nada; tirar é o botão do corpo, em perigo.
 */
export function ConfirmarTirada({ pedido, valores, aoManter, aoTirar }: PropriedadesDaTirada) {
  const frases = pedido ? frasesDaTirada(pedido, valores) : null
  return (
    <Confirmacao aberta={pedido !== null} titulo={frases?.titulo ?? ''} rotuloConfirmar={frases?.manter ?? ''} aoConfirmar={aoManter} aoCancelar={aoManter}>
      <div className="flex flex-col gap-3">
        <p>{frases?.corpo}</p>
        <Botao variante="secundario" largura="total" className="text-perigo" onClick={() => pedido && aoTirar(pedido)}>
          Tirar os pontos
        </Botao>
      </div>
    </Confirmacao>
  )
}

interface PropriedadesDaConclusaoVazia {
  aberta: boolean
  ocupada: boolean
  aoVoltar: () => void
  aoConcluir: () => void
}

export function ConfirmarConclusaoSemNinguem({ aberta, ocupada, aoVoltar, aoConcluir }: PropriedadesDaConclusaoVazia) {
  return (
    <Confirmacao
      aberta={aberta}
      titulo="Concluir sem ninguém?"
      rotuloConfirmar="Concluir sem ninguém"
      rotuloCancelar="Voltar à lista"
      ocupada={ocupada}
      aoConfirmar={aoConcluir}
      aoCancelar={aoVoltar}
    >
      Nenhum desbravador foi marcado. O evento fica sem pontos para todos. Você pode voltar e marcar quem foi.
    </Confirmacao>
  )
}

/** O servidor recusou porque outro Adm mexeu na lista: o texto é o dele, e "Ver a lista" traz os números novos. */
export function AvisoDeListaMudou({ mensagem, aoVerALista }: { mensagem: string; aoVerALista: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-botao bg-alerta-fundo px-4 py-3">
      <p className="flex items-start gap-2 text-base font-medium text-alerta">
        <TriangleAlert aria-hidden className="mt-1 size-4 shrink-0" />
        <span>{mensagem}</span>
      </p>
      <Botao variante="secundario" onClick={aoVerALista}>
        Ver a lista
      </Botao>
    </div>
  )
}
