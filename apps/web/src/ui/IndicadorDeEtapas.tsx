import { cn } from './cn'

interface Propriedades {
  /** Nomes de todas as etapas, na ordem; o total exibido é sempre o tamanho desta lista. */
  etapas: string[]
  /** Etapa atual, a partir de 1. */
  atual: number
}

function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

/** "Etapa 2 de 3 — Grupos · depois: Datas", com uma faixa por etapa; a barra conta as etapas já concluídas. */
export function IndicadorDeEtapas({ etapas, atual }: Propriedades) {
  const total = etapas.length
  const posicao = Math.min(total, Math.max(1, atual))
  const onde = `Etapa ${posicao} de ${total} — ${etapas[posicao - 1]}`
  const proximas = etapas.slice(posicao)
  const depois = proximas.length > 0 ? ` · depois: ${juntar(proximas)}` : ' · última etapa'
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-texto">{`${onde}${depois}`}</p>
      <div
        role="progressbar"
        aria-label={`Etapa ${posicao} de ${total}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={posicao - 1}
        aria-valuetext={onde}
        className="flex gap-1.5"
      >
        {etapas.map((nome, indice) => (
          <span key={nome} className={cn('h-1.5 flex-1 rounded-full', indice < posicao ? 'bg-marca' : 'bg-marca-suave')} />
        ))}
      </div>
    </div>
  )
}
