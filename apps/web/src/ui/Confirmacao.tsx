import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Botao } from './Botao'

interface Propriedades {
  aberta: boolean
  titulo: string
  /** Texto do botão que confirma (o verbo da ação: "Sair", "Descartar"). */
  rotuloConfirmar: string
  /** Texto do botão que sai sem fazer nada; o padrão é "Cancelar". */
  rotuloCancelar?: string
  aoConfirmar: () => void
  aoCancelar: () => void
  /** A ação está correndo: o botão de confirmar gira e não aceita um segundo clique. */
  ocupada?: boolean
  /** Botão de confirmação em vermelho, para ação que apaga. */
  perigo?: boolean
  /** Mensagem de falha da ação; o diálogo continua aberto para tentar de novo ou cancelar. */
  erro?: string | null
  children: ReactNode
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tab no último volta ao primeiro, e Shift+Tab no primeiro vai ao último: o foco não sai do diálogo. */
function prenderTab(evento: KeyboardEvent, painel: HTMLElement) {
  const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)]
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  if (!primeiro || !ultimo) return
  const ativo = document.activeElement
  const foraDoCiclo = ativo === painel || !painel.contains(ativo)
  if (evento.shiftKey && (ativo === primeiro || foraDoCiclo)) {
    evento.preventDefault()
    ultimo.focus()
  } else if (!evento.shiftKey && (ativo === ultimo || foraDoCiclo)) {
    evento.preventDefault()
    primeiro.focus()
  }
}

/** Painel de confirmação centrado; Esc e o fundo cancelam, o Tab fica preso nele e o foco volta a quem o abriu. */
export function Confirmacao({
  aberta,
  titulo,
  rotuloConfirmar,
  rotuloCancelar = 'Cancelar',
  aoConfirmar,
  aoCancelar,
  ocupada = false,
  perigo = false,
  erro,
  children,
}: Propriedades) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)
  const cancelar = useRef(aoCancelar)

  useEffect(() => {
    cancelar.current = aoCancelar
  }, [aoCancelar])

  useEffect(() => {
    if (!aberta) return
    const quemAbriu = document.activeElement instanceof HTMLElement ? document.activeElement : null
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cancelar.current()
      if (evento.key === 'Tab' && painel.current) prenderTab(evento, painel.current)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      if (quemAbriu?.isConnected) quemAbriu.focus()
    }
  }, [aberta])

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
        {erro && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao variante="secundario" onClick={aoCancelar}>
            {rotuloCancelar}
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} carregando={ocupada} onClick={aoConfirmar}>
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </div>
  )
}
