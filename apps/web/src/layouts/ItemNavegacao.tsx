import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

export interface ItemDeNavegacao {
  rotulo: string
  icone: LucideIcon
  /** Sem `para`, o item ainda não existe na fase: aparece desabilitado com "em breve". */
  para?: string
  /** Só acende na própria rota, não nas de baixo: `/adm` é o começo de todas as rotas do Adm. */
  exato?: boolean
}

interface Propriedades {
  item: ItemDeNavegacao
  /** `barra`: coluna de ícone sobre rótulo (celular); `lateral`: linha (Adm). */
  layout: 'barra' | 'lateral'
  /** Chamado ao escolher o item: a gaveta do Adm no celular fecha por aqui. */
  aoEscolher?: () => void
}

const BASE = {
  barra: 'flex min-h-[var(--touch-min)] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold',
  lateral: 'flex min-h-[var(--touch-min)] shrink-0 items-center gap-3 rounded-botao px-3 text-base font-semibold',
}

export function ItemNavegacao({ item, layout, aoEscolher }: Propriedades) {
  const Icone = item.icone
  const conteudo = (
    <>
      <Icone aria-hidden className="size-5" />
      <span>{item.rotulo}</span>
    </>
  )

  if (!item.para) {
    return (
      <span aria-disabled="true" className={cn(BASE[layout], 'cursor-not-allowed opacity-60')}>
        {conteudo}
        <span className="rounded-full bg-trilho px-2 py-0.5 text-[11px] font-semibold text-texto-3">em breve</span>
      </span>
    )
  }

  return (
    <NavLink
      to={item.para}
      end={item.exato}
      onClick={aoEscolher}
      className={({ isActive }) =>
        cn(BASE[layout], isActive ? (layout === 'barra' ? 'text-marca' : 'bg-marca-escura text-white') : layout === 'barra' ? 'text-texto-2' : 'text-sobre-marca hover:bg-marca-escura')
      }
    >
      {conteudo}
    </NavLink>
  )
}
