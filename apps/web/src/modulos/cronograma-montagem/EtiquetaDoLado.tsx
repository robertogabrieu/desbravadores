import { cn } from '../../ui/cn'
import { ROTULO_DO_LADO } from './vista'
import type { RequisitoComLado } from './vista'

/**
 * "Regular" ou "Avançada", escrita: a da avançada tem borda tracejada, para não depender da cor.
 * Requisito de avançada fora do par leva também o nome da classe dele.
 */
export function EtiquetaDoLado({ requisito, className }: { requisito: Pick<RequisitoComLado, 'lado' | 'nomeDaClasse'>; className?: string }) {
  const { lado, nomeDaClasse } = requisito
  return (
    <span
      data-lado={lado}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-bold text-texto-2',
        lado === 'AVANCADA' ? 'border-dashed border-texto-2' : 'border-solid border-divisor',
        className,
      )}
    >
      {nomeDaClasse ? `${ROTULO_DO_LADO[lado]} · ${nomeDaClasse}` : ROTULO_DO_LADO[lado]}
    </span>
  )
}
