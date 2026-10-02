import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { cn } from './cn'

const FORMAS = {
  linha: 'min-h-[var(--touch-min)] rounded-botao px-2 py-2',
  cartao: 'rounded-cartao border border-borda bg-superficie p-4',
}

interface Propriedades extends LinkProps {
  /** `linha` dentro de uma lista; `cartao` solto numa grade ou pilha. */
  forma?: keyof typeof FORMAS
  /** `ficha`: o que abre é a ficha de uma pessoa; o sinal é o ícone ao lado do nome (`NomeDaFicha`), não a seta. */
  sinal?: 'seta' | 'ficha'
}

/** Linha ou cartão inteiro que navega, com a seta à direita sempre à vista: no celular não há hover para avisar. */
export function LinhaQueNavega({ forma = 'linha', sinal = 'seta', className, children, ...resto }: Propriedades) {
  return (
    <Link
      className={cn(
        'flex items-center gap-3 text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca',
        FORMAS[forma],
        className,
      )}
      {...resto}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {sinal === 'seta' && <ChevronRight aria-hidden data-sinal="navega" className="size-5 shrink-0 text-texto-2" />}
    </Link>
  )
}
