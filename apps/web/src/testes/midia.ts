const ouvintes = new Set<EventListenerOrEventListenerObject>()

/**
 * jsdom não tem `matchMedia`. Este simula só `(max-width: Npx)` e `(min-width: Npx)`, e avisa quem
 * assina `change` quando a largura muda (para testar a tela girando).
 */
export function simularLargura(pixels: number): void {
  window.matchMedia = (consulta: string): MediaQueryList => {
    const limite = Number(/(\d+(?:\.\d+)?)px/.exec(consulta)?.[1] ?? 0)
    const combina = consulta.includes('max-width') ? pixels <= limite : pixels >= limite
    return {
      matches: combina,
      media: consulta,
      onchange: null,
      addEventListener: (_tipo: string, ouvinte: EventListenerOrEventListenerObject) => {
        ouvintes.add(ouvinte)
      },
      removeEventListener: (_tipo: string, ouvinte: EventListenerOrEventListenerObject) => {
        ouvintes.delete(ouvinte)
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }
  for (const ouvinte of [...ouvintes]) {
    const evento = new Event('change')
    if (typeof ouvinte === 'function') ouvinte(evento)
    else ouvinte.handleEvent(evento)
  }
}
