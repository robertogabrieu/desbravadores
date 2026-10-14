import { useState } from 'react'
import { cn } from '../../ui/cn'
import { MESES, DIAS_DA_SEMANA, chaveDoDia, diasDaGrade } from '../adm/calendario/datas'
import { abreviacaoDoCompromisso, compromissoDoDia, familiaDoCompromisso, rotuloDoCompromisso } from './compromissos'
import type { Compromisso, Familia, MesDoCalendario } from './compromissos'

const COR_DA_FAMILIA: Record<Familia, string> = {
  reuniao: 'bg-[var(--cal-reuniao-bg)] text-[var(--cal-reuniao-fg)]',
  acamp: 'bg-[var(--cal-acamp-bg)] text-[var(--cal-acamp-fg)]',
  evento: 'bg-[var(--cal-evento-bg)] text-[var(--cal-evento-fg)]',
  sem: 'bg-[var(--cal-sem-bg)] text-[var(--cal-sem-fg)]',
}

const LEGENDA: { familia: Familia; rotulo: string }[] = [
  { familia: 'reuniao', rotulo: 'Reunião' },
  { familia: 'acamp', rotulo: 'Acampamento' },
  { familia: 'evento', rotulo: 'Evento' },
  { familia: 'sem', rotulo: 'Sem reunião' },
]

const ESTILO_DO_BOTAO =
  'min-h-[var(--touch-min)] min-w-[var(--touch-min)] rounded-botao border border-borda-controle bg-superficie px-4 text-base font-semibold text-texto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:opacity-45'

interface Propriedades {
  compromissos: Compromisso[]
  hoje: string
  /** Os meses da janela, em ordem: o calendário não sai deles. */
  meses: MesDoCalendario[]
}

/** Um mês por vez; cada dia com compromisso escreve a abreviação, a cor só reforça. */
export function CalendarioPublico({ compromissos, hoje, meses }: Propriedades) {
  const [indice, definirIndice] = useState(0)
  const { ano, mes } = meses[indice]
  const diasDoMes = diasDaGrade(ano, mes)

  return (
    <div className="rounded-cartao border border-borda bg-superficie p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" disabled={indice === 0} onClick={() => definirIndice(indice - 1)} className={ESTILO_DO_BOTAO}>
          ← Anterior
        </button>
        <h3 aria-live="polite" className="text-xl font-bold">{`${MESES[mes]} de ${ano}`}</h3>
        <button
          type="button"
          aria-label="Próximo mês"
          disabled={indice === meses.length - 1}
          onClick={() => definirIndice(indice + 1)}
          className={ESTILO_DO_BOTAO}
        >
          Próximo →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_DA_SEMANA.map((dia) => (
          <div key={dia} aria-hidden className="py-1 text-center text-sm font-semibold text-texto-2">
            {dia.toLowerCase()}
          </div>
        ))}
        {diasDoMes.map((dia, posicao) => (dia === null ? <div key={`vazio-${posicao}`} /> : <Dia key={dia} data={chaveDoDia(ano, mes, dia)} numero={dia} hoje={hoje} compromissos={compromissos} />))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-divisor pt-4 text-sm text-texto-2">
        {LEGENDA.map(({ familia, rotulo }) => (
          <span key={familia} className="inline-flex items-center gap-1.5">
            <i aria-hidden className={cn('inline-block size-4 rounded border border-borda', COR_DA_FAMILIA[familia])} />
            {rotulo}
          </span>
        ))}
      </div>
    </div>
  )
}

function Dia({ data, numero, hoje, compromissos }: { data: string; numero: number; hoje: string; compromissos: Compromisso[] }) {
  const compromisso = compromissoDoDia(compromissos, data)
  const ehHoje = data === hoje
  const nome = [String(numero), compromisso ? rotuloDoCompromisso(compromisso) : null, ehHoje ? 'hoje' : null].filter(Boolean).join(', ')

  return (
    <div
      role="img"
      aria-label={nome}
      className={cn(
        'flex min-h-[46px] flex-col gap-0.5 rounded-controle p-1 text-sm min-[421px]:min-h-[52px]',
        compromisso ? COR_DA_FAMILIA[familiaDoCompromisso(compromisso)] : 'bg-superficie-suave',
      )}
    >
      <span className={cn('font-semibold', ehHoje && 'grid size-6 place-items-center rounded-full bg-marca text-superficie')}>{numero}</span>
      {compromisso && <small className="text-[11px] leading-tight font-bold break-words">{abreviacaoDoCompromisso(compromisso)}</small>}
    </div>
  )
}
