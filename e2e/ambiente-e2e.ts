import { createServer } from 'node:net'

/** Pede ao sistema uma porta livre e a devolve na hora (a janela para colisão é de milissegundos). */
export function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer()
    servidor.once('error', rejeitar)
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address()
      const porta = typeof endereco === 'object' && endereco ? endereco.port : 0
      servidor.close(() => resolver(porta))
    })
  })
}

export async function esperarResposta(url: string, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs
  let ultimoErro = 'sem resposta'
  while (Date.now() < fim) {
    try {
      const resposta = await fetch(url)
      if (resposta.ok) return
      ultimoErro = `HTTP ${resposta.status}`
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro)
    }
    await new Promise((resolver) => setTimeout(resolver, 300))
  }
  throw new Error(`${url} nao respondeu em ${limiteMs} ms (${ultimoErro})`)
}
