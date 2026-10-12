import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Selo } from '../../../ui/Selo'
import { ICONE_DA_ESCOLHA, ROTULOS_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

export interface VoltaAEscolha {
  para: string
  estado?: unknown
}

interface Propriedades {
  tipo: TipoDeEvento
  /** Para onde "Trocar tipo" leva: a escolha, com a data e o estado de volta que a trouxeram. */
  trocar: VoltaAEscolha
  /** Há algo preenchido no formulário: trocar de tipo pergunta antes de descartar. */
  preenchido: boolean
}

/** O tipo escolhido no topo do formulário, com a saída de volta para a escolha. */
export function SeloDoTipo({ tipo, trocar, preenchido }: Propriedades) {
  const navegar = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const Icone = ICONE_DA_ESCOLHA[tipo]

  function aoTrocar(evento: MouseEvent<HTMLAnchorElement>) {
    if (!preenchido) return
    evento.preventDefault()
    setConfirmando(true)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Selo data-testid="selo-do-tipo" className="text-base">
        <Icone aria-hidden className="size-4" />
        {ROTULOS_DO_TIPO[tipo]}
      </Selo>
      <Link
        to={trocar.para}
        state={trocar.estado}
        replace
        onClick={aoTrocar}
        className="inline-flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-marca"
      >
        Trocar tipo
      </Link>
      <Confirmacao
        aberta={confirmando}
        titulo="Trocar o tipo do evento?"
        rotuloConfirmar="Trocar e descartar"
        rotuloCancelar="Continuar preenchendo"
        perigo
        aoConfirmar={() => {
          setConfirmando(false)
          void navegar(trocar.para, { replace: true, state: trocar.estado })
        }}
        aoCancelar={() => setConfirmando(false)}
      >
        O que você já preencheu neste formulário será descartado.
      </Confirmacao>
    </div>
  )
}
