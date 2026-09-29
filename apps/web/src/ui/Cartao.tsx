import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export function Cartao({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-cartao border border-borda bg-superficie p-4', className)} {...resto} />
}
