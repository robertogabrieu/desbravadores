import { useState } from 'react'
import type { ReactNode } from 'react'
import { Campo } from './Campo'
import { Confirmacao } from './Confirmacao'

interface Propriedades {
  aberta: boolean
  titulo: string
  rotuloConfirmar: string
  /** O texto exato que a pessoa precisa digitar para liberar o botão; espaços nas pontas e maiúsculas não contam. */
  textoEsperado: string
  /** O pedido que antecede o texto esperado, sem os dois-pontos finais; ex.: "Para confirmar, digite o nome da edição". */
  pedido: string
  aoConfirmar: () => void
  aoCancelar: () => void
  ocupada?: boolean
  erro?: string | null
  /** O que será perdido, em palavras da tela; o pedido para digitar vem logo depois. */
  children: ReactNode
}

const normalizar = (texto: string): string => texto.trim().toLocaleLowerCase('pt-BR')

/** Confirmação de ação que não se desfaz: o botão vermelho só libera depois de digitar o nome do que será apagado. */
export function ConfirmacaoDigitada({ aberta, titulo, rotuloConfirmar, textoEsperado, pedido, aoConfirmar, aoCancelar, ocupada, erro, children }: Propriedades) {
  const [digitado, setDigitado] = useState('')
  const liberado = normalizar(digitado) === normalizar(textoEsperado)

  const cancelar = () => {
    setDigitado('')
    aoCancelar()
  }

  return (
    <Confirmacao
      aberta={aberta}
      titulo={titulo}
      rotuloConfirmar={rotuloConfirmar}
      perigo
      ocupada={ocupada}
      erro={erro}
      confirmarDesabilitado={!liberado}
      aoConfirmar={aoConfirmar}
      aoCancelar={cancelar}
    >
      <div className="flex flex-col gap-3">
        <p>{children}</p>
        <p>
          {pedido}: <strong className="text-texto">{textoEsperado}</strong>
        </p>
        <Campo rotulo="Nome para confirmar" value={digitado} onChange={(evento) => setDigitado(evento.target.value)} autoComplete="off" />
      </div>
    </Confirmacao>
  )
}
