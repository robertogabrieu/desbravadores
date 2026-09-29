import { cn } from './cn'

export type ClasseDoAvatar = 'amigo' | 'companheiro' | 'pesquisador' | 'pioneiro' | 'excursionista' | 'guia'

const CORES: Record<ClasseDoAvatar, string> = {
  amigo: 'bg-amigo',
  companheiro: 'bg-companheiro',
  pesquisador: 'bg-pesquisador',
  pioneiro: 'bg-pioneiro',
  excursionista: 'bg-excursionista',
  guia: 'bg-guia',
}

interface Propriedades {
  nome: string
  /** Sem classe, usa a cor da marca. */
  classe?: ClasseDoAvatar
  className?: string
}

function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return '?'
  const primeira = palavras[0].charAt(0)
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1].charAt(0) : ''
  return (primeira + ultima).toUpperCase()
}

/** Círculo com as iniciais, na cor da classe do desbravador. */
export function Avatar({ nome, classe, className }: Propriedades) {
  return (
    <span
      title={nome}
      className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', classe ? CORES[classe] : 'bg-marca', className)}
    >
      {iniciais(nome)}
    </span>
  )
}
