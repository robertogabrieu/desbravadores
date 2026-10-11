import { cn } from '../../ui/cn'

export const MARCAS_DO_MEDIDOR = 4

/** "Vazia", "1 requisito", "3 requisitos" e, de 4 para cima, "4 requisitos · cheia". */
export function textoDaOcupacao(quantidade: number): string {
  if (quantidade === 0) return 'Vazia'
  const texto = quantidade === 1 ? '1 requisito' : `${quantidade} requisitos`
  return quantidade >= MARCAS_DO_MEDIDOR ? `${texto} · cheia` : texto
}

/** Quatro marcas que enchem com os requisitos da data; cheia muda de cor, mas o texto diz o mesmo. */
export function MedidorDeOcupacao({ quantidade, className }: { quantidade: number; className?: string }) {
  const cheia = quantidade >= MARCAS_DO_MEDIDOR
  return (
    <span data-ocupacao={cheia ? 'cheia' : 'normal'} className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: MARCAS_DO_MEDIDOR }, (_, indice) => (
          <span key={indice} className={cn('h-2 w-4 rounded-sm', indice < quantidade ? (cheia ? 'bg-alerta' : 'bg-marca') : 'bg-trilho')} />
        ))}
      </span>
      <span className={cn('text-sm font-semibold', cheia ? 'text-alerta' : 'text-texto-2')}>{textoDaOcupacao(quantidade)}</span>
    </span>
  )
}
