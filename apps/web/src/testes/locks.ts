/**
 * jsdom não implementa Web Locks. Em produção o cliente exige `navigator.locks`; nos testes este
 * substituto serializa os pedidos de mesmo nome, que é o que o navegador garante entre abas.
 */
export function instalarLocksDeTeste(): void {
  const filas = new Map<string, Promise<unknown>>()

  const request = (nome: string, chamada: () => Promise<unknown>): Promise<unknown> => {
    const anterior = filas.get(nome) ?? Promise.resolve()
    const atual = anterior.catch(() => undefined).then(chamada)
    filas.set(nome, atual)
    return atual
  }

  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
}
