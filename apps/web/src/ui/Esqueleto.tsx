import type { HTMLAttributes } from 'react'
import { cn } from './cn'

/** Bloco cinza pulsante que ocupa o lugar do conteúdo enquanto ele carrega. */
export function Esqueleto({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-botao bg-trilho', className)} {...resto} />
}
