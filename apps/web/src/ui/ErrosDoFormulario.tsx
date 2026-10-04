import { CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

/**
 * O que conta como campo com erro: o controle que o `Campo`/`Selecao` marca com `aria-invalid`, ou o
 * grupo (fieldset) que o formulário marca com `data-com-erro`, porque `aria-invalid` não vale em grupo.
 */
const SELETOR_DE_ERRO = '[aria-invalid="true"], [data-com-erro]'

export interface Pendencia {
  id: string
  rotulo: string
}

function rotuloDe(elemento: HTMLElement): string {
  if (elemento instanceof HTMLFieldSetElement) return elemento.querySelector('legend')?.textContent?.trim() ?? ''
  if (elemento instanceof HTMLInputElement || elemento instanceof HTMLSelectElement || elemento instanceof HTMLTextAreaElement) {
    return elemento.labels?.[0]?.textContent?.trim() ?? ''
  }
  return elemento.getAttribute('aria-label') ?? ''
}

/** Foca o campo (num grupo, o primeiro controle dele) e o traz para o meio da tela, longe do rodapé fixo. */
export function focarCampo(elemento: HTMLElement): void {
  const alvo = elemento instanceof HTMLFieldSetElement ? (elemento.querySelector<HTMLElement>('input, select, textarea, button') ?? elemento) : elemento
  alvo.focus({ preventScroll: true })
  // jsdom não implementa scrollIntoView.
  if (typeof elemento.scrollIntoView === 'function') elemento.scrollIntoView({ block: 'center' })
}

/**
 * Leva quem salvou com erro até ele: a cada novo `erros`, lê no formulário os campos marcados,
 * foca o primeiro e devolve a lista para o `ResumoDosErros`. Serve a qualquer formulário com
 * `Campo`/`Selecao`, sem que ele precise saber o id de cada campo.
 */
export function useErrosAVista(erros: Record<string, string>) {
  const formulario = useRef<HTMLFormElement>(null)
  const [pendencias, setPendencias] = useState<Pendencia[]>([])

  useEffect(() => {
    const marcados = [...(formulario.current?.querySelectorAll<HTMLElement>(SELETOR_DE_ERRO) ?? [])]
    setPendencias(marcados.flatMap((elemento) => (elemento.id ? [{ id: elemento.id, rotulo: rotuloDe(elemento) }] : [])))
    const primeiro = marcados[0]
    if (primeiro) focarCampo(primeiro)
  }, [erros])

  return { formulario, pendencias }
}

const tituloDoResumo = (quantas: number): string =>
  quantas === 1 ? 'Revise 1 campo para salvar' : `Revise ${quantas} campos para salvar`

/**
 * O topo do formulário que falhou: quantos campos rever e um link para cada um. Não é alerta: o foco
 * já vai ao primeiro campo, que anuncia o próprio erro, e dois anúncios juntos se atropelam.
 */
export function ResumoDosErros({ pendencias }: { pendencias: Pendencia[] }) {
  const idTitulo = useId()
  if (pendencias.length === 0) return null

  const irAoCampo = (evento: MouseEvent<HTMLAnchorElement>, id: string) => {
    evento.preventDefault()
    const campo = document.getElementById(id)
    if (campo) focarCampo(campo)
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-1 rounded-botao border-2 border-perigo bg-superficie px-4 py-3">
      <p id={idTitulo} className="flex items-center gap-2 text-base font-semibold text-perigo">
        <CircleAlert aria-hidden className="size-5 shrink-0" />
        {tituloDoResumo(pendencias.length)}
      </p>
      <ul className="flex list-disc flex-col pl-7">
        {pendencias.map(({ id, rotulo }) => (
          <li key={id}>
            <a href={`#${id}`} onClick={(evento) => irAoCampo(evento, id)} className="inline-flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca underline">
              {rotulo}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
