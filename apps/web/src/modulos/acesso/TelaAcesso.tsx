import type { ReactNode } from 'react'

interface Propriedades {
  titulo: string
  subtitulo?: string
  children: ReactNode
}

/** Moldura das telas de acesso: marca do app no topo e conteúdo numa coluna de até 480 px. */
export function TelaAcesso({ titulo, subtitulo, children }: Propriedades) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-6 bg-fundo px-5 py-8">
      <header className="flex flex-col gap-3">
        <img src="/emblema.png" alt="Emblema dos Desbravadores" className="h-20 w-auto self-start" />
        <h1 className="font-titulo text-2xl font-bold text-texto">{titulo}</h1>
        {subtitulo && <p className="text-base text-texto-2">{subtitulo}</p>}
      </header>
      {children}
    </main>
  )
}
