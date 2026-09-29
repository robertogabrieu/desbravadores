/** jsdom não tem `matchMedia`. Este simula só `(max-width: Npx)` e `(min-width: Npx)`. */
export function simularLargura(pixels: number): void {
  window.matchMedia = (consulta: string): MediaQueryList => {
    const limite = Number(/(\d+(?:\.\d+)?)px/.exec(consulta)?.[1] ?? 0)
    const combina = consulta.includes('max-width') ? pixels <= limite : pixels >= limite
    return {
      matches: combina,
      media: consulta,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }
}
