import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { cn } from './cn'

/** Nome de pessoa com o ícone de abrir a ficha ao lado; para usar dentro de um link que já envolve a linha. */
export function NomeDaFicha({ nome, className }: { nome: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {nome}
      <ExternalLink aria-hidden data-sinal="abre-ficha" className="size-4 shrink-0 text-marca" />
    </span>
  )
}

interface Propriedades extends Omit<LinkProps, 'children'> {
  nome: string
}

/** Nome de pessoa que abre a ficha ou o perfil dela; o nome acessível continua sendo só o nome. */
export function LinkDeFicha({ nome, className, ...resto }: Propriedades) {
  return (
    <Link className={cn('w-fit font-semibold text-marca underline-offset-2 hover:underline', className)} {...resto}>
      <NomeDaFicha nome={nome} />
    </Link>
  )
}
