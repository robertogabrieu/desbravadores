/** Encerra cada processo e o grupo que ele abriu (o `npx` deixa o vite como filho). */
export function derrubarProcessos(pids: string | undefined): void {
  for (const texto of (pids ?? '').split(',')) {
    const pid = Number(texto)
    if (!pid) continue
    for (const alvo of [-pid, pid]) {
      try {
        process.kill(alvo, 'SIGTERM')
      } catch {
        // ja terminou
      }
    }
  }
}
