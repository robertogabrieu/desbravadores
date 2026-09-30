import type { ParDeClasses } from './classes'
import { cn } from '../../ui/cn'

interface Propriedades {
  par: ParDeClasses
  /** Id da classe (regular ou avançada) que está aberta. */
  atualId: string
  aoMudar: (classeId: string) => void
}

/** Alternador Regular / Avançada da mesma classe. */
export function AlternadorDeClasse({ par, atualId, aoMudar }: Propriedades) {
  const opcoes = [
    { classe: par.regular, rotulo: 'Regular' },
    { classe: par.avancada, rotulo: 'Avançada' },
  ]
  return (
    <div role="radiogroup" aria-label="Tipo da classe" className="flex gap-1 rounded-botao bg-trilho p-1">
      {opcoes.map(({ classe, rotulo }) => {
        const marcada = classe.id === atualId
        return (
          <button
            key={classe.id}
            type="button"
            role="radio"
            aria-checked={marcada}
            onClick={() => aoMudar(classe.id)}
            className={cn(
              'min-h-[var(--touch-min)] flex-1 rounded-controle px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-marca',
              marcada ? 'bg-superficie text-marca shadow-[var(--shadow-segment)]' : 'text-texto-2',
            )}
          >
            {rotulo}
          </button>
        )
      })}
    </div>
  )
}
