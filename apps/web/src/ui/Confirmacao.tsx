import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Botao } from './Botao'

interface Propriedades {
  aberta: boolean
  titulo: string
  /** Texto do botão que confirma (o verbo da ação: "Sair", "Descartar"). */
  rotuloConfirmar: string
  aoConfirmar: () => void
  aoCancelar: () => void
  /** Botão de confirmação em vermelho, para ação que apaga. */
  perigo?: boolean
  children: ReactNode
}

/** Painel de confirmação centrado; Esc e o fundo cancelam. */
export function Confirmacao({ aberta, titulo, rotuloConfirmar, aoConfirmar, aoCancelar, perigo = false, children }: Propriedades) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta) return
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoCancelar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberta, aoCancelar])

  if (!aberta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div data-testid="fundo-da-confirmacao" className="absolute inset-0 bg-texto/40" onClick={aoCancelar} />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-t-folha bg-superficie p-5 shadow-xl outline-none sm:rounded-folha"
      >
        <h2 id={idTitulo} className="text-xl font-bold text-texto">
          {titulo}
        </h2>
        <div className="text-base text-texto-2">{children}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar}>
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </div>
  )
}
