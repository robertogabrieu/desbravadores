import { cn } from './cn'

interface Propriedades {
  ligado: boolean
  /** Recebe o valor novo (o contrário do atual). */
  aoAlternar: (ligado: boolean) => void
  /** Id do rótulo visível que dá o nome ao interruptor. */
  idRotulo: string
  /** Id do texto que descreve o estado (ex.: "padrão" / "alterado"). */
  idDescricao?: string
  disabled?: boolean
}

/** Liga/desliga acessível: o nome vem do rótulo visível (idRotulo); "padrão"/"alterado" é a descrição. Alvo de 44 px. */
export function Interruptor({ ligado, aoAlternar, idRotulo, idDescricao, disabled }: Propriedades) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-labelledby={idRotulo}
      aria-describedby={idDescricao}
      disabled={disabled}
      onClick={() => aoAlternar(!ligado)}
      className="relative inline-flex h-[var(--touch-min)] w-14 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:opacity-50"
    >
      <span aria-hidden className={cn('h-7 w-[3.25rem] rounded-full border border-borda-controle transition-colors', ligado ? 'bg-marca' : 'bg-borda-controle')} />
      <span
        aria-hidden
        className={cn('absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-superficie transition-[left]', ligado ? 'left-[1.875rem]' : 'left-1.5')}
      />
    </button>
  )
}
