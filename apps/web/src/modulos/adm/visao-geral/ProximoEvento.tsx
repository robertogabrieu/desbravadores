import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { VisaoGeral } from '../../../api/visao-geral'
import { Cartao } from '../../../ui/Cartao'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { Selo } from '../../../ui/Selo'
import { diaDaSemanaEDoMes, MESES_CURTOS } from '../calendario/datas'
import { ROTULOS_DO_TIPO } from '../calendario/tipos'
import { horaCurta } from '../formatos'
import { useEstadoDeVolta } from '../navegacao'

type Evento = NonNullable<VisaoGeral['proximoEvento']>

const primeiraMinuscula = (texto: string): string => texto.charAt(0).toLowerCase() + texto.slice(1)

/** "Sábado, 17 de outubro"; no dia, "Hoje, sábado, 17 de outubro"; em andamento por vários dias, "Até domingo, 15 de novembro". */
function dataDoEvento(evento: Evento, hoje: string): string {
  if (evento.inicio > hoje) return diaDaSemanaEDoMes(evento.inicio)
  if (evento.fim > evento.inicio) return `Até ${primeiraMinuscula(diaDaSemanaEDoMes(evento.fim))}`
  return `Hoje, ${primeiraMinuscula(diaDaSemanaEDoMes(evento.inicio))}`
}

/** "Sábado, 17 de outubro · 19h · Salão": o horário e o local só entram quando existem. */
const quandoEOnde = (evento: Evento, hoje: string): string =>
  [dataDoEvento(evento, hoje), evento.horario ? horaCurta(evento.horario) : null, evento.local].filter(Boolean).join(' · ')

function CartaoDoEvento({ evento, hoje }: { evento: Evento; hoje: string }) {
  const estadoDeVolta = useEstadoDeVolta()
  const mes = MESES_CURTOS[Number(evento.inicio.slice(5, 7)) - 1] ?? ''
  return (
    <LinhaQueNavega to={`/adm/calendario/eventos/${evento.id}`} state={estadoDeVolta} forma="cartao">
      <span className="flex items-center gap-4">
        <span aria-hidden className="flex size-16 shrink-0 flex-col items-center justify-center rounded-botao bg-marca-suave text-marca">
          <span className="text-sm font-bold uppercase">{mes}</span>
          <span className="font-titulo text-2xl font-extrabold">{Number(evento.inicio.slice(8, 10))}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <Selo>{ROTULOS_DO_TIPO[evento.tipo]}</Selo>
          <span className="font-titulo text-lg font-bold text-texto">{evento.nome}</span>
          <span className="text-base text-texto-2">{quandoEOnde(evento, hoje)}</span>
        </span>
        <span className="hidden text-base font-semibold text-marca lg:inline">Abrir calendário</span>
      </span>
    </LinhaQueNavega>
  )
}

/** O primeiro evento à frente; sem nenhum, o bloco diz isso e leva ao calendário. */
export function ProximoEvento({ evento, hoje }: { evento: VisaoGeral['proximoEvento']; hoje: string }) {
  const idDoTitulo = useId()
  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col gap-3">
      <h2 id={idDoTitulo} className="font-titulo text-lg font-bold text-texto">
        Próximo evento
      </h2>
      {evento ? (
        <CartaoDoEvento evento={evento} hoje={hoje} />
      ) : (
        <Cartao className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-texto-2">Nenhum evento marcado à frente.</p>
          <Link to="/adm/calendario" className="inline-flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca underline">
            Abrir calendário
          </Link>
        </Cartao>
      )}
    </section>
  )
}
