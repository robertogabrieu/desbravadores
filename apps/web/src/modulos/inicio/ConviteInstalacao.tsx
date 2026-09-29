import { Download } from 'lucide-react'
import { Botao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { useConviteInstalacao } from './useConviteInstalacao'

export function ConviteInstalacao() {
  const { instalar, mostrarInstrucoesIphone, dispensarInstrucoesIphone } = useConviteInstalacao()

  if (mostrarInstrucoesIphone) {
    return (
      <Cartao className="flex flex-col gap-2">
        <h2 className="font-titulo text-lg font-bold text-texto">Instale o app no iPhone</h2>
        <p className="text-base text-texto">Compartilhar → Adicionar à Tela de Início.</p>
        <p className="text-base text-texto">Depois de instalar, entre de novo pelo ícone: o app instalado não guarda a sessão do Safari.</p>
        <Botao variante="secundario" onClick={dispensarInstrucoesIphone}>
          Entendi
        </Botao>
      </Cartao>
    )
  }

  if (instalar) {
    return (
      <Botao variante="secundario" largura="total" onClick={() => void instalar()}>
        <Download aria-hidden className="size-4" />
        Instalar app
      </Botao>
    )
  }

  return null
}
