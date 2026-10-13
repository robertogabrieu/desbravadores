import { CircleUserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

/** Atalho do cabeçalho para a página "Minha conta": o texto fica sempre visível, para quem não reconhece só o ícone. */
export function BotaoMinhaConta({ sobreMarca = false }: { sobreMarca?: boolean }) {
  return (
    <NavLink
      to="/conta"
      aria-label="Minha conta"
      className={({ isActive }) =>
        cn(
          'flex min-h-[var(--touch-min)] shrink-0 items-center gap-2 rounded-full px-3 text-base font-semibold',
          sobreMarca ? 'text-white hover:bg-marca-escura' : 'text-texto hover:bg-superficie-suave',
          isActive && (sobreMarca ? 'bg-marca-escura' : 'bg-superficie-suave'),
        )
      }
    >
      <CircleUserRound aria-hidden className="size-6" />
      <span>Conta</span>
    </NavLink>
  )
}
