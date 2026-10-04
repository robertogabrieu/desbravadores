import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Botao } from '../../ui/Botao'

interface Propriedades {
  nomeDaClasse: string
  /** Requisitos ainda sem data: acima de zero, a confirmação avisa que dá para colocá-los depois. */
  semData: number
  ocupada: boolean
  /** Faixa de erro da publicação (409, 422), dentro do diálogo para não ficar escondida atrás dele. */
  aviso?: ReactNode
  aoPublicar: () => void
  aoContinuar: () => void
}

const FOCAVEIS = 'button:not([disabled])'

/** Tab no último volta ao primeiro, e Shift+Tab no primeiro vai ao último: o foco não sai do diálogo. */
function prenderTab(evento: KeyboardEvent, painel: HTMLElement) {
  const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)]
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  if (!primeiro || !ultimo) return
  const ativo = document.activeElement
  if (evento.shiftKey && (ativo === primeiro || ativo === painel)) {
    evento.preventDefault()
    ultimo.focus()
  } else if (!evento.shiftKey && ativo === ultimo) {
    evento.preventDefault()
    primeiro.focus()
  }
}

/**
 * Antes de publicar (celular e computador): diz o que acontece com os instrutores e com o que falta.
 * Não usa ui/Confirmacao porque ela só sabe dizer "Cancelar", e aqui a saída é "Continuar montando".
 */
export function ConfirmarPublicacao({ nomeDaClasse, semData, ocupada, aviso, aoPublicar, aoContinuar }: Propriedades) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)
  const continuar = useRef(aoContinuar)

  useEffect(() => {
    continuar.current = aoContinuar
  }, [aoContinuar])

  useEffect(() => {
    const quemAbriu = document.activeElement instanceof HTMLElement ? document.activeElement : null
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') continuar.current()
      if (evento.key === 'Tab' && painel.current) prenderTab(evento, painel.current)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      if (quemAbriu?.isConnected) quemAbriu.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-texto/40" onClick={aoContinuar} />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-t-folha bg-superficie p-5 shadow-xl outline-none sm:rounded-folha"
      >
        <h2 id={idTitulo} className="text-xl font-bold text-texto">
          Publicar o cronograma de {nomeDaClasse}?
        </h2>
        <div className="flex flex-col gap-2 text-base text-texto-2">
          <p>Os instrutores da classe recebem um aviso e passam a ver as datas.</p>
          {semData > 0 && (
            <p>
              <strong className="text-texto">{semData === 1 ? '1 requisito ainda está sem data.' : `${semData} requisitos ainda estão sem data.`}</strong>{' '}
              Você pode colocá-los depois.
            </p>
          )}
          <p>Se você mudar algo depois, o cronograma volta a Rascunho até ser publicado de novo.</p>
        </div>
        {aviso}
        <div className="flex flex-col gap-2">
          <Botao largura="total" carregando={ocupada} onClick={aoPublicar}>
            Publicar cronograma
          </Botao>
          <Botao largura="total" variante="secundario" onClick={aoContinuar}>
            Continuar montando
          </Botao>
        </div>
      </div>
    </div>
  )
}
