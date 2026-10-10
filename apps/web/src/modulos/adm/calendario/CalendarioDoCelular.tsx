import { ChevronDown, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { EventoCalendario } from '../../../api/calendario'
import { estiloDoBotao } from '../../../ui/Botao'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { cn } from '../../../ui/cn'
import { horaCurta, juntarNomes } from '../formatos'
import type { EstadoDaFicha } from '../navegacao'
import { DIAS_DA_SEMANA, MESES, chaveDoDia, chaveDoMes, diaDaSemanaEDoMes, diaDoMesPorExtenso, diasDaGrade, eventosDoDia, periodoCurto, ultimoDiaDoMes } from './datas'
import { ICONE_DO_TIPO, PONTO_DA_REUNIAO, PONTO_DO_TIPO, ROTULOS_DO_TIPO, textoDoCancelamento } from './tipos'

const MAXIMO_DE_PONTOS = 3

export const fichaDoEvento = (evento: EventoCalendario): string => `/adm/calendario/eventos/${evento.id}`

/** Cartão de um evento que abre a ficha dele; o mesmo na lista do mês e no painel do dia. */
export function CartaoDoEvento({ evento, estadoDeVolta }: { evento: EventoCalendario; estadoDeVolta: EstadoDaFicha }) {
  const encontro = evento.classeBiblica
  const Icone = ICONE_DO_TIPO[evento.tipo]
  return (
    <LinhaQueNavega to={fichaDoEvento(evento)} state={estadoDeVolta} forma="cartao">
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-base font-bold text-texto">
          {encontro && Icone && <Icone aria-hidden className="size-4 shrink-0 text-[var(--cal-evento-fg)]" />}
          {encontro?.cancelado ? <s>{evento.nome}</s> : evento.nome}
        </span>
        <span className="text-sm text-texto-2">
          {ROTULOS_DO_TIPO[evento.tipo]} · {periodoCurto(evento.inicio, evento.fim)}
          {evento.horario && ` · ${horaCurta(evento.horario)}`}
          {evento.local && ` · ${evento.local}`}
          {encontro && encontro.grupos.length > 0 && ` · ${juntarNomes(encontro.grupos)}`}
        </span>
        {encontro?.cancelado && <span className="text-sm font-semibold text-texto">{textoDoCancelamento(encontro.motivo)}</span>}
      </span>
    </LinhaQueNavega>
  )
}

interface Marca {
  chave: string
  rotulo: string
  ponto: string
}

/** O que o dia tem, sem repetir tipo: a reunião regular (se a extra não a substitui) e cada tipo de evento. */
function marcasDoDia(doDia: EventoCalendario[], ehReuniao: boolean): Marca[] {
  const extraComReuniao = doDia.some((evento) => evento.tipo === 'REUNIAO_EXTRA' && evento.temReuniao)
  const marcas: Marca[] = ehReuniao && !extraComReuniao ? [{ chave: 'REUNIAO', rotulo: 'reunião regular', ponto: PONTO_DA_REUNIAO }] : []
  for (const tipo of new Set(doDia.map((evento) => evento.tipo)))
    marcas.push({ chave: tipo, rotulo: ROTULOS_DO_TIPO[tipo].toLowerCase(), ponto: PONTO_DO_TIPO[tipo] })
  return marcas
}

/** O dia do endereço, se for deste mês; senão hoje, se for deste mês; senão o primeiro dia com evento ou reunião regular; senão o dia 1. */
export function diaEscolhidoDoMes(
  valor: string,
  ano: number,
  mes: number,
  hoje: string,
  eventos: EventoCalendario[],
  diasDeReuniao: ReadonlySet<string>,
): string {
  const ultimo = ultimoDiaDoMes(ano, mes)
  const doMes = (data: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(data) && data.startsWith(`${chaveDoMes(ano, mes)}-`) && Number(data.slice(8, 10)) >= 1 && Number(data.slice(8, 10)) <= ultimo
  if (doMes(valor)) return valor
  if (doMes(hoje)) return hoje
  const datas = Array.from({ length: ultimo }, (_, i) => chaveDoDia(ano, mes, i + 1))
  return datas.find((data) => diasDeReuniao.has(data) || eventosDoDia(eventos, data).length > 0) ?? chaveDoDia(ano, mes, 1)
}

interface PropriedadesDaGrade {
  ano: number
  mes: number
  eventos: EventoCalendario[]
  diasDeReuniao: Set<string>
  hoje: string
  escolhido: string
  aoEscolher: (data: string) => void
}

/** Grade do mês no celular: cada dia é um botão com o número e um ponto por tipo; o que eles querem dizer está no nome do botão. */
export function GradeDoCelular({ ano, mes, eventos, diasDeReuniao, hoje, escolhido, aoEscolher }: PropriedadesDaGrade) {
  return (
    <>
      <div aria-hidden className="grid grid-cols-7 gap-0.5 text-center text-sm font-extrabold text-texto-2">
        {DIAS_DA_SEMANA.map((dia) => (
          <span key={dia}>{dia}</span>
        ))}
      </div>
      <div role="group" aria-label={`${MESES[mes]} de ${ano}`} className="grid grid-cols-7 gap-0.5">
        {diasDaGrade(ano, mes).map((dia, posicao) => {
          if (dia === null) return <span key={posicao} aria-hidden />
          const data = chaveDoDia(ano, mes, dia)
          const marcas = marcasDoDia(eventosDoDia(eventos, data), diasDeReuniao.has(data))
          const ehHoje = data === hoje
          const ehEscolhido = data === escolhido
          const nome = `${diaDoMesPorExtenso(data)}${ehHoje ? ', hoje' : ''}${marcas.length > 0 ? `: ${juntarNomes(marcas.map((marca) => marca.rotulo))}` : ''}`
          return (
            <button
              key={posicao}
              type="button"
              aria-label={nome}
              aria-pressed={ehEscolhido}
              onClick={() => aoEscolher(data)}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-controle text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
                ehEscolhido ? 'bg-marca text-sobre-marca' : 'bg-superficie text-texto',
                ehHoje && 'border-2 border-marca font-extrabold',
              )}
            >
              <span aria-hidden>{dia}</span>
              <span aria-hidden className="flex h-2 items-center gap-1">
                {marcas.slice(0, MAXIMO_DE_PONTOS).map((marca) => (
                  <span key={marca.chave} data-ponto className={cn('size-2 rounded-full ring-1 ring-superficie', marca.ponto)} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

interface PropriedadesDoPainel {
  data: string
  eventos: EventoCalendario[]
  ehReuniao: boolean
  horaDaReuniao: string | undefined
  estadoDeVolta: EstadoDaFicha
}

/** O que há no dia escolhido; sem nada, o atalho para marcar um evento nele. */
export function PainelDoDia({ data, eventos, ehReuniao, horaDaReuniao, estadoDeVolta }: PropriedadesDoPainel) {
  const idDoTitulo = useId()
  const doDia = eventosDoDia(eventos, data)
  const temReuniaoRegular = ehReuniao && !doDia.some((evento) => evento.tipo === 'REUNIAO_EXTRA' && evento.temReuniao)
  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col gap-2">
      <h3 id={idDoTitulo} className="text-lg font-extrabold text-texto">
        {diaDaSemanaEDoMes(data)}
      </h3>
      {!temReuniaoRegular && doDia.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-base text-texto-2">Nada marcado neste dia.</p>
          <Link to={`/adm/calendario/eventos/novo?data=${data}`} state={estadoDeVolta} className={estiloDoBotao({ variante: 'secundario' })}>
            <Plus aria-hidden className="size-5" />
            Novo evento neste dia
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {temReuniaoRegular && (
            <li className="flex items-center gap-3 rounded-cartao border border-divisor bg-superficie p-4">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', PONTO_DA_REUNIAO)} />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-texto">Reunião regular</span>
                {horaDaReuniao && <span className="text-sm text-texto-2">{horaCurta(horaDaReuniao)}</span>}
              </span>
            </li>
          )}
          {doDia.map((evento) => (
            <li key={evento.id}>
              <CartaoDoEvento evento={evento} estadoDeVolta={estadoDeVolta} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** No celular a legenda fica atrás de um botão: ela ocupa a altura de uma tela e só é lida uma vez. */
export function LegendaRecolhida({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false)
  const idDaLegenda = useId()
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idDaLegenda}
        onClick={() => setAberta((atual) => !atual)}
        className="flex min-h-[var(--touch-min)] w-fit items-center gap-1.5 rounded-botao px-2 text-base font-semibold text-marca hover:bg-marca-suave focus-visible:outline-2 focus-visible:outline-marca"
      >
        O que cada cor quer dizer
        <ChevronDown aria-hidden className={cn('size-5 transition-transform', aberta && 'rotate-180')} />
      </button>
      <div id={idDaLegenda} hidden={!aberta}>
        {aberta && children}
      </div>
    </div>
  )
}
