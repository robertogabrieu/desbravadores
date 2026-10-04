import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hojeDoClube } from '../../../api/desbravadores'
import { useCalendario } from '../../../api/calendario'
import type { EventoCalendario } from '../../../api/calendario'
import { useConfiguracaoClube } from '../../../api/clube'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { useConexao } from '../../../offline'
import { Abas } from '../../../ui/Abas'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Esqueleto } from '../../../ui/Esqueleto'
import { cn } from '../../../ui/cn'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { horaCurta } from '../formatos'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'
import { CartaoDoEvento, GradeDoCelular, LegendaRecolhida, PainelDoDia, diaEscolhidoDoMes, fichaDoEvento } from './CalendarioDoCelular'
import { DIAS_DA_SEMANA, MESES, MESES_CURTOS, chaveDoDia, chaveDoMes, diasDaGrade, eventosDoDia, eventosDoMes, mesDoEndereco } from './datas'
import { COR_DA_REUNIAO, CORES_DO_TIPO, ICONE_DO_TIPO, ROTULOS_DO_TIPO } from './tipos'

const ABAS_DE_MES = MESES_CURTOS.map((rotulo, indice) => ({ id: String(indice), rotulo }))
const MAXIMO_POR_DIA = 2

export function AdmCalendario() {
  const { ler, mudar } = useFiltrosNaUrl()
  const hoje = hojeDoClube()
  const { ano, mes } = mesDoEndereco(ler('mes'), hoje)
  const estadoDeVolta = useEstadoDeVolta()
  const calendario = useCalendario(ano)
  const configuracao = useConfiguracaoClube()
  const { modo } = useConexao()
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)

  const eventos = calendario.data?.eventos ?? []
  const diasDeReuniao = new Set(calendario.data?.diasDeReuniao ?? [])
  const eventosDesteMes = eventosDoMes(eventos, ano, mes)
  const horaDaReuniao = configuracao.data?.horaReuniao
  const diaEscolhido = diaEscolhidoDoMes(ler('dia'), ano, mes, hoje, eventosDesteMes, diasDeReuniao)

  /** Trocar de mês esquece o dia escolhido: o novo mês abre no dia padrão dele. */
  const irParaMes = (novoAno: number, novoMes: number) => mudar({ mes: chaveDoMes(novoAno, novoMes), dia: '' })

  /** Anda de mês em mês; passar de dezembro ou de janeiro vira o ano. */
  function andarMeses(passo: number) {
    const total = ano * 12 + mes + passo
    irParaMes(Math.floor(total / 12), ((total % 12) + 12) % 12)
  }

  let corpo: ReactNode
  if (calendario.data) {
    const legenda = (
      <ul aria-label="Legenda" className="flex flex-wrap gap-3 text-sm font-semibold text-texto-3">
        <li className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5', COR_DA_REUNIAO)}>
          <MarcaDeReuniao />
          {horaDaReuniao ? `Reunião regular · ${horaCurta(horaDaReuniao)}` : 'Reunião regular'}
        </li>
        {Object.entries(ROTULOS_DO_TIPO).map(([tipo, rotulo]) => {
          const tipoDoEvento = tipo as keyof typeof CORES_DO_TIPO
          const Icone = ICONE_DO_TIPO[tipoDoEvento]
          return (
            <li key={tipo} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5', CORES_DO_TIPO[tipoDoEvento])}>
              {Icone && <Icone aria-hidden className="size-3.5" />}
              {rotulo}
            </li>
          )
        })}
      </ul>
    )
    corpo = (
      <>
        {celular ? (
          <>
            <Cartao className="flex flex-col gap-3">
              <GradeDoCelular
                ano={ano}
                mes={mes}
                eventos={eventosDesteMes}
                diasDeReuniao={diasDeReuniao}
                hoje={hoje}
                escolhido={diaEscolhido}
                aoEscolher={(data) => mudar({ dia: data })}
              />
              <LegendaRecolhida>{legenda}</LegendaRecolhida>
            </Cartao>
            <PainelDoDia
              data={diaEscolhido}
              eventos={eventosDesteMes}
              ehReuniao={diasDeReuniao.has(diaEscolhido)}
              horaDaReuniao={horaDaReuniao}
              estadoDeVolta={estadoDeVolta}
            />
          </>
        ) : (
          <Cartao className="flex flex-col gap-3">
            {legenda}
            <div className="grid grid-cols-7 gap-1 text-center text-sm font-extrabold text-texto-2">
              {DIAS_DA_SEMANA.map((dia) => (
                <span key={dia}>{dia}</span>
              ))}
            </div>
            <div role="group" aria-label={`${MESES[mes]} de ${ano}`} className="grid grid-cols-7 gap-1">
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
        )}
        {eventosDesteMes.length === 0 ? (
          <EstadoVazio
            titulo={`Nenhum evento em ${MESES[mes]}`}
            descricao="Cadastre feriados, férias, acampamentos, dias sem reunião e reuniões extras para que o cronograma das classes os respeite."
          />
        ) : (
          <ul aria-label={`Eventos de ${MESES[mes]}`} className="flex flex-col gap-2">
            {eventosDesteMes.map((evento) => (
              <li key={evento.id}>
                <CartaoDoEvento evento={evento} estadoDeVolta={estadoDeVolta} />
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
    <div className="flex flex-col gap-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-texto-2">
            Base para todos os cronogramas de classe
          </p>
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Calendário do clube</h1>
        </div>
        <Link
          to={`/adm/calendario/eventos/novo?data=${chaveDoDia(ano, mes, 1)}`}
          state={estadoDeVolta}
          className={estiloDoBotao()}
        >
          <Plus aria-hidden className="size-5" />
          Novo evento
        </Link>
      </header>

      {/* A faixa é atalho para saltar meses no computador; no celular, as setas bastam e a faixa não cabe. */}
      {!celular && (
        <Abas
          rotulo="Mês"
          abas={ABAS_DE_MES}
          ativa={String(mes)}
          aoMudar={(id) => irParaMes(ano, Number(id))}
        />
      )}
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

/** Célula do computador: reunião e eventos em texto, cada evento um link para a ficha. */
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
  const extra = doDia.find((evento) => evento.tipo === 'REUNIAO_EXTRA')
  const horaDaExtra = extra?.horario ?? horaDaReuniao
  return (
    <div className="flex min-h-24 flex-col gap-1 rounded-controle border border-divisor p-1.5">
      <span className="w-fit text-sm font-bold text-texto">{dia}</span>
      {extra && (
        <span
          className={cn(
            'flex items-center gap-1 truncate rounded-controle px-1.5 py-0.5 text-sm font-semibold',
            CORES_DO_TIPO['REUNIAO_EXTRA'],
          )}
        >
          <CalendarPlus aria-hidden className="size-3.5 shrink-0" />
          {[
            extra.temReuniao ? 'Reunião extra' : 'Classe extra',
            horaDaExtra && horaCurta(horaDaExtra),
          ]
            .filter(Boolean)
            .join(' ')}
        </span>
      )}
      {ehReuniao && !extra?.temReuniao && (
        <span className={cn('truncate rounded-controle px-1.5 py-0.5 text-sm font-semibold', COR_DA_REUNIAO)}>
          {horaDaReuniao ? `Reunião ${horaDaReuniao}` : 'Reunião'}
        </span>
      )}
      {doDia.slice(0, MAXIMO_POR_DIA).map((evento) => {
        const Icone = ICONE_DO_TIPO[evento.tipo]
        return (
          <Link
            key={evento.id}
            to={fichaDoEvento(evento)}
            state={estadoDeVolta}
            className={cn(
              'truncate rounded-controle px-1.5 py-0.5 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-marca',
              CORES_DO_TIPO[evento.tipo],
            )}
          >
            {Icone && <Icone aria-hidden className="mr-1 inline size-3.5" />}
            {evento.nome}
          </Link>
        )
      })}
      {doDia.length > MAXIMO_POR_DIA && (
        <span className="text-sm font-semibold text-texto-2">+{doDia.length - MAXIMO_POR_DIA}</span>
      )}
    </div>
  )
}

/** Marca da reunião que não depende só da cor: o mesmo ícone na legenda e no dia. */
function MarcaDeReuniao({ className }: { className?: string }) {
  return <Users aria-hidden data-marca="reuniao" className={cn('size-3.5 shrink-0', className)} />
}
