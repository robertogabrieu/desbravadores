/** Congela só o `Date` no instante dado (o relógio segue andando); timers e microtarefas ficam reais. */
export function congelarRelogio(instante: string): void {
  jest.useFakeTimers({
    now: new Date(instante),
    advanceTimers: true,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
}

export function descongelarRelogio(): void {
  jest.useRealTimers()
}
