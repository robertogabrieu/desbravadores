import { useSyncExternalStore } from 'react'

/** Verdadeiro enquanto a janela é mais estreita que `pixels` (acompanha redimensionamento). */
export function useLarguraMenorQue(pixels: number): boolean {
  const consulta = `(max-width: ${pixels - 0.02}px)`
  return useSyncExternalStore(
    (aoMudar) => {
      const lista = window.matchMedia(consulta)
      lista.addEventListener('change', aoMudar)
      return () => lista.removeEventListener('change', aoMudar)
    },
    () => window.matchMedia(consulta).matches,
  )
}
