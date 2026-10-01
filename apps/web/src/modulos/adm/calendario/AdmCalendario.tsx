import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hojeDoClube } from '../../../api/desbravadores'
import { useCalendario } from '../../../api/calendario'
import type { EventoCalendario } from '../../../api/calendario'
import { useConfiguracaoClube } from '../../../api/clube'
import { useConexao } from '../../../offline'
import { Abas } from '../../../ui/Abas'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Esqueleto } from '../../../ui/Esqueleto'
import { cn } from '../../../ui/cn'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'
import {
  DIAS_DA_SEMANA,
  MESES,
  MESES_CURTOS,
  chaveDoDia,
  chaveDoMes,
  dataBrasileira,
  diasDaGrade,
  eventosDoDia,
  eventosDoMes,
  mesDoEndereco,
} from './datas'
import { COR_DA_REUNIAO, CORES_DO_TIPO, ROTULOS_DO_TIPO } from './tipos'

const ABAS_DE_MES = MESES_CURTOS.map((rotulo, indice) => ({ id: String(indice), rotulo }))
const MAXIMO_POR_DIA = 2

const periodo = (evento: EventoCalendario): string =>
  evento.inicio === evento.fim
    ? dataBrasileira(evento.inicio)
    : `${dataBrasileira(evento.inicio)} a ${dataBrasileira(evento.fim)}`

const fichaDoEvento = (evento: EventoCalendario): string => `/adm/calendario/eventos/${evento.id}`

export function AdmCalendario() {
  const { ler, mudar } = useFiltrosNaUrl()
  const { ano, mes } = mesDoEndereco(ler('mes'), hojeDoClube())
  const estadoDeVolta = useEstadoDeVolta()
  const calendario = useCalendario(ano)
  const configuracao = useConfiguracaoClube()
  const { modo } = useConexao()

  const eventos = calendario.data?.eventos ?? []
  const diasDeReuniao = new Set(calendario.data?.diasDeReuniao ?? [])
  const eventosDesteMes = eventosDoMes(eventos, ano, mes)
  const horaDaReuniao = configuracao.data?.horaReuniao

  /** Anda de mês em mês; passar de dezembro ou de janeiro vira o ano. */
  function andarMeses(passo: number) {
    const total = ano * 12 + mes + passo
    mudar({ mes: chaveDoMes(Math.floor(total / 12), ((total % 12) + 12) % 12) })
  }

  let corpo: ReactNode
  if (calendario.data) {
    corpo = (
      <>
        <Cartao className="flex flex-col gap-3">
          <ul
            aria-label="Legenda"
            className="flex flex-wrap gap-3 text-sm font-semibold text-texto-3"
          >
            <li className={cn('rounded-full px-2.5 py-0.5', COR_DA_REUNIAO)}>Reunião regular</li>
            {Object.entries(ROTULOS_DO_TIPO).map(([tipo, rotulo]) => (
              <li
                key={tipo}
                className={cn(
                  'rounded-full px-2.5 py-0.5',
                  CORES_DO_TIPO[tipo as keyof typeof CORES_DO_TIPO],
                )}
              >
                {rotulo}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-7 gap-1 text-center text-sm font-extrabold text-texto-2">
            {DIAS_DA_SEMANA.map((dia) => (
              <span key={dia}>{dia}</span>
            ))}
          </div>
          <div
            role="group"
            aria-label={`${MESES[mes]} de ${ano}`}
            className="grid grid-cols-7 gap-1"
          >
            {diasDaGrade(ano, mes).map((dia, posicao) => (
              <CelulaDoDia
                key={posicao}
                dia={dia}
                data={dia === null ? null : chaveDoDia(ano, mes, dia)}
                eventos={eventos}
                ehReuniao={dia !== null && diasDeReuniao.has(chaveDoDia(ano, mes, dia))}
                horaDaReuniao={horaDaReuniao}
                estadoDeVolta={estadoDeVolta}
              />
            ))}
          </div>
        </Cartao>
        {eventosDesteMes.length === 0 ? (
          <EstadoVazio
            titulo={`Nenhum evento em ${MESES[mes]}`}
            descricao="Cadastre feriados, acampamentos e dias sem reunião para que o cronograma das classes os respeite."
          />
        ) : (
          <ul aria-label={`Eventos de ${MESES[mes]}`} className="flex flex-col gap-2">
            {eventosDesteMes.map((evento) => (
              <li key={evento.id}>
                <Cartao className="relative flex flex-col gap-0.5">
                  <Link
                    to={fichaDoEvento(evento)}
                    state={estadoDeVolta}
                    className="text-base font-bold text-texto after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-marca"
                  >
                    {evento.nome}
                  </Link>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-texto-2">
                      {ROTULOS_DO_TIPO[evento.tipo]} · {periodo(evento)}
                      {evento.horario && ` · ${evento.horario}`}
                      {evento.local && ` · ${evento.local}`}
                    </span>
                  </div>
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (calendario.isError)
    corpo = <ErroDeCarga erro={calendario.error} aoTentarDeNovo={() => void calendario.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando o calendário">
        <Esqueleto className="h-96" />
      </Carregando>
    )

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-texto-2">
            Base para todos os cronogramas de classe
          </p>
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Calendário do clube</h1>
        </div>
        <Link to={`/adm/calendario/eventos/novo?data=${chaveDoDia(ano, mes, 1)}`} state={estadoDeVolta} className={estiloDoBotao()}>
          <Plus aria-hidden className="size-5" />
          Novo evento
        </Link>
      </header>

      {/* A faixa é atalho para saltar meses no computador; no celular, as setas bastam e a faixa não cabe. */}
      <div className="hidden sm:block">
        <Abas
          rotulo="Mês"
          abas={ABAS_DE_MES}
          ativa={String(mes)}
          aoMudar={(id) => mudar({ mes: chaveDoMes(ano, Number(id)) })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Botao variante="secundario" aria-label="Mês anterior" onClick={() => andarMeses(-1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </Botao>
        <h2 className="min-w-44 flex-1 text-center text-lg font-extrabold text-texto sm:flex-none">
          {MESES[mes]} de {ano}
        </h2>
        <Botao variante="secundario" aria-label="Próximo mês" onClick={() => andarMeses(1)}>
          <ChevronRight aria-hidden className="size-5" />
        </Botao>
      </div>

      {corpo}
    </div>
  )
}

interface PropriedadesDaCelula {
  dia: number | null
  data: string | null
  eventos: EventoCalendario[]
  ehReuniao: boolean
  horaDaReuniao: string | undefined
  estadoDeVolta: { voltarPara?: string }
}

function CelulaDoDia({
  dia,
  data,
  eventos,
  ehReuniao,
  horaDaReuniao,
  estadoDeVolta,
}: PropriedadesDaCelula) {
  if (dia === null || data === null)
    return <div aria-hidden className="min-h-24 rounded-controle bg-superficie-suave/50" />
  const doDia = eventosDoDia(eventos, data)
  // No celular a célula tem ~45 px: a reunião pinta o número do dia e cada evento vira uma faixa da cor
  // do tipo; o nome completo está na lista de eventos abaixo da grade.
  return (
    <div className="flex min-h-16 flex-col gap-1 rounded-controle border border-divisor p-1 sm:min-h-24 sm:p-1.5">
      <span
        className={cn(
          'w-fit rounded-controle text-sm font-bold text-texto max-sm:px-1',
          ehReuniao && 'max-sm:bg-[var(--cal-reuniao-bg)] max-sm:text-[var(--cal-reuniao-fg)]',
        )}
      >
        {dia}
      </span>
      {ehReuniao && (
        <span
          className={cn(
            'truncate rounded-controle px-1.5 py-0.5 text-sm font-semibold max-sm:sr-only',
            COR_DA_REUNIAO,
          )}
        >
          {horaDaReuniao ? `Reunião ${horaDaReuniao}` : 'Reunião'}
        </span>
      )}
      {doDia.slice(0, MAXIMO_POR_DIA).map((evento) => (
        <Link
          key={evento.id}
          to={fichaDoEvento(evento)}
          state={estadoDeVolta}
          className={cn(
            'truncate rounded-controle px-1.5 py-0.5 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-marca max-sm:h-2 max-sm:p-0',
            CORES_DO_TIPO[evento.tipo],
          )}
        >
          <span className="max-sm:sr-only">{evento.nome}</span>
        </Link>
      ))}
      {doDia.length > MAXIMO_POR_DIA && (
        <span className="text-sm font-semibold text-texto-2">+{doDia.length - MAXIMO_POR_DIA}</span>
      )}
    </div>
  )
}
