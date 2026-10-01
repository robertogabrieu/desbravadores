import { NOME_SISTEMA } from '@desbravadores/shared'
import { cn } from './cn'

interface Propriedades {
  /** `sm`: cabeçalhos; `lg`: telas de acesso. */
  tamanho?: 'sm' | 'lg'
  /** Classes do nome, para escondê-lo onde não cabe (o emblema fica). O nome quebra linha em vez de ser cortado. */
  classeDoNome?: string
  className?: string
}

/** Emblema oficial dos Desbravadores ao lado do nome do app; o nome vem de `NOME_SISTEMA`. */
export function Marca({ tamanho = 'sm', classeDoNome, className }: Propriedades) {
  return (
    <span
      className={cn('flex min-w-0 items-center', tamanho === 'lg' ? 'gap-3' : 'gap-2', className)}
    >
      <img
        src="/emblema.png"
        alt="Emblema dos Desbravadores"
        className={cn('w-auto shrink-0', tamanho === 'lg' ? 'h-16' : 'h-8')}
      />
      <span
        className={cn(
          'font-titulo leading-tight font-bold',
          tamanho === 'lg' ? 'text-2xl' : 'text-lg',
          classeDoNome,
        )}
      >
        {NOME_SISTEMA}
      </span>
    </span>
  )
}
