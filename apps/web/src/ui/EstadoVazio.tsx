import type { ReactNode } from 'react'

interface Propriedades {
  titulo: string
  descricao?: string
  /** Botão ou link com o próximo passo. */
  acao?: ReactNode
}

export function EstadoVazio({ titulo, descricao, acao }: Propriedades) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <h2 className="font-titulo text-lg font-bold text-texto">{titulo}</h2>
      {descricao && <p className="max-w-sm text-base text-texto-2">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
