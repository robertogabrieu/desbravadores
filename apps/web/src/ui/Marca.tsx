import { NOME_SISTEMA } from '@desbravadores/shared'
import { cn } from './cn'

interface Propriedades {
  /** Classes do nome, para escondê-lo onde não cabe (o emblema fica). O nome quebra linha em vez de ser cortado. */
  classeDoNome?: string
  className?: string
}

/** Emblema oficial dos Desbravadores ao lado do nome do app, nos cabeçalhos; o nome vem de `NOME_SISTEMA`. */
export function Marca({ classeDoNome, className }: Propriedades) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <img src="/emblema.png" alt="Emblema dos Desbravadores" className="h-8 w-auto shrink-0" />
      <span className={cn('font-titulo text-lg leading-tight font-bold', classeDoNome)}>{NOME_SISTEMA}</span>
    </span>
  )
}
