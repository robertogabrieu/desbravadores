interface ResumoMailpit {
  messages: { ID: string }[]
}
interface MensagemMailpit {
  Text: string
}

/** Espera o e-mail para `destinatario` chegar ao Mailpit e devolve o caminho `/convite/<token>` dele. */
export async function caminhoDoConvite(destinatario: string, limiteMs = 15_000): Promise<string> {
  const base = process.env['MAILPIT_URL'] ?? 'http://localhost:8026'
  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    const busca = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)
    const { messages } = (await busca.json()) as ResumoMailpit
    const primeira = messages[0]
    if (primeira) {
      const resposta = await fetch(`${base}/api/v1/message/${primeira.ID}`)
      const { Text } = (await resposta.json()) as MensagemMailpit
      const achado = /\/convite\/[A-Za-z0-9_-]+/.exec(Text)
      if (achado) return achado[0]
    }
    await new Promise((resolver) => setTimeout(resolver, 300))
  }
  throw new Error(`Nenhum convite para ${destinatario} chegou ao Mailpit`)
}
