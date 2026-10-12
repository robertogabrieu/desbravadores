import { Shirt } from 'lucide-react'
import type { PacoteGuardado } from '../../offline'
import { cn } from '../../ui/cn'
import { horaCurta } from '../adm/formatos'
import { diaDaSemana } from '../classe-biblica/formatos'

export type EventoDoPacote = NonNullable<PacoteGuardado['pacote']>['calendario'][number]
type Uniforme = NonNullable<EventoDoPacote['uniforme']>

const ROTULO_DO_UNIFORME: Record<Uniforme, string> = { GALA: 'Uniforme de gala', CAMPO: 'Uniforme de campo' }
const QUAL_UNIFORME: Record<Uniforme, string> = { GALA: 'de gala', CAMPO: 'de campo' }

/** Gala: contorno cheio na cor do evento especial; campo: contorno tracejado e cor neutra. Nunca só pela cor. */
const ESTILO_DO_UNIFORME: Record<Uniforme, string> = {
  GALA: 'border-solid border-[var(--cal-especial-fg)] text-[var(--cal-especial-fg)]',
  CAMPO: 'border-dashed border-borda-controle text-texto',
}

/** Do que ainda vai acontecer (termina hoje ou depois), por início; a Classe Bíblica tem as telas dela. */
export function eventosAVir(eventos: EventoDoPacote[], hoje: string): EventoDoPacote[] {
  return eventos
    .filter((evento) => evento.tipo !== 'CLASSE_BIBLICA' && evento.fim >= hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome))
}

export function UniformeDoEvento({ uniforme }: { uniforme: Uniforme }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 self-start rounded-full border-2 bg-superficie px-3 py-0.5 text-base font-bold',
        ESTILO_DO_UNIFORME[uniforme],
      )}
    >
      <Shirt aria-hidden className="size-[18px] shrink-0" />
      {ROTULO_DO_UNIFORME[uniforme]}
    </span>
  )
}

/** "Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala." Só o que vale; nada valendo, nenhuma frase. */
export function frasePontos(evento: EventoDoPacote): string | null {
  const porIr = evento.pontosParticipacao ?? 0
  const pelaRoupa = evento.pontosUniforme ?? 0
  const pelaRoupaDita = evento.uniforme ? `${pelaRoupa} pelo uniforme ${QUAL_UNIFORME[evento.uniforme]}` : null
  const partes: string[] = []
  if (porIr > 0) partes.push(`${porIr} por ir`)
  if (pelaRoupa > 0 && pelaRoupaDita) partes.push(porIr > 0 ? `mais ${pelaRoupaDita}` : pelaRoupaDita)
  return partes.length > 0 ? `Vale pontos no ranking: ${partes.join(', ')}.` : null
}

const primeiraMaiuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

/** "19h · Salão da igreja"; em evento de vários dias o horário vem com o dia da semana de início: "Sexta, 18h · Sítio". */
export function horarioELocal(evento: EventoDoPacote): string {
  const horario = evento.horario ? horaCurta(evento.horario) : null
  const horarioComDia = horario && evento.fim !== evento.inicio ? `${primeiraMaiuscula(diaDaSemana(evento.inicio))}, ${horario}` : horario
  return [horarioComDia, evento.local].filter(Boolean).join(' · ')
}
