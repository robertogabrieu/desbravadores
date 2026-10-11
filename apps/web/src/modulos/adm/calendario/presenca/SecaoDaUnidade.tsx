import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../../../ui/cn'
import type { NomeDoUniforme } from './LinhaDeMarca'

interface Propriedades {
  nome: string
  foram: number
  uniformizados: number
  total: number
  uniforme: NomeDoUniforme
  aberta: boolean
  /** Com a busca ligada a seção fica aberta e o cabeçalho deixa de ser botão: não haveria o que alternar. */
  fixa: boolean
  aoAlternar: () => void
  children: ReactNode
}

/** Um capítulo da lista: o nome da unidade, quantos foram e de gala, e as linhas quando aberto. */
export function SecaoDaUnidade({ nome, foram, uniformizados, total, uniforme, aberta, fixa, aoAlternar, children }: Propriedades) {
  const titulo = (
    <>
      <span className="flex min-w-0 flex-col text-left">
        <span className="font-titulo text-lg font-bold text-texto">{nome}</span>
        <span className="text-sm text-texto-2">{`${foram} de ${total} foram · ${uniformizados} de ${uniforme}`}</span>
      </span>
      {!fixa && <ChevronDown aria-hidden className={cn('size-5 shrink-0 text-texto-2 transition-transform motion-reduce:transition-none', aberta && 'rotate-180')} />}
    </>
  )

  return (
    <section aria-label={nome} className="flex flex-col gap-2 rounded-cartao border border-borda bg-superficie p-2">
      {fixa ? (
        <div className="flex min-h-[var(--touch-min)] items-center justify-between gap-2 px-2">{titulo}</div>
      ) : (
        <button
          type="button"
          aria-expanded={aberta}
          onClick={aoAlternar}
          className="flex min-h-[var(--touch-min)] items-center justify-between gap-2 rounded-botao px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        >
          {titulo}
        </button>
      )}
      {(fixa || aberta) && children}
    </section>
  )
}
