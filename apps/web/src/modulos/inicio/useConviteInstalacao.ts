import { useCallback, useEffect, useState } from 'react'

const CHAVE_IOS_VISTO = 'convite-instalacao-ios-visto'

/** O evento não está no lib.dom: só o Chromium o dispara. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
}

const ehEventoInstalacao = (evento: Event): evento is EventoInstalacao => 'prompt' in evento

const ehIphone = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent)

/** O Safari marca `standalone` no app já instalado; nele não há o que ensinar. */
const jaInstalado = (): boolean => 'standalone' in navigator && navigator.standalone === true

export interface ConviteInstalacao {
  /** Chama o diálogo de instalação do navegador; nulo enquanto ele não oferecer. */
  instalar: (() => Promise<void>) | null
  /** As instruções do iPhone valem só na primeira visita. */
  mostrarInstrucoesIphone: boolean
  dispensarInstrucoesIphone: () => void
}

export function useConviteInstalacao(): ConviteInstalacao {
  const [evento, definirEvento] = useState<EventoInstalacao | null>(null)
  const [mostrarIphone, definirMostrarIphone] = useState(
    () => ehIphone() && !jaInstalado() && localStorage.getItem(CHAVE_IOS_VISTO) === null,
  )

  useEffect(() => {
    const aoOferecer = (novo: Event): void => {
      novo.preventDefault()
      if (ehEventoInstalacao(novo)) definirEvento(novo)
    }
    window.addEventListener('beforeinstallprompt', aoOferecer)
    return () => window.removeEventListener('beforeinstallprompt', aoOferecer)
  }, [])

  useEffect(() => {
    if (mostrarIphone) localStorage.setItem(CHAVE_IOS_VISTO, '1')
  }, [mostrarIphone])

  const instalar = useCallback(async (): Promise<void> => {
    await evento?.prompt()
    definirEvento(null)
  }, [evento])

  return {
    instalar: evento ? instalar : null,
    mostrarInstrucoesIphone: mostrarIphone,
    dispensarInstrucoesIphone: () => definirMostrarIphone(false),
  }
}
