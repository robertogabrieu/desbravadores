import { hojeNoFuso } from '@desbravadores/shared'
import { Clock } from 'lucide-react'
import { useConexao, usePacote } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Carregando } from '../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { Selo } from '../../ui/Selo'
import { diaDoMesPorExtenso, diaEMes, diaDaSemanaEDoMes, dosDiasDeReuniao, DIAS_DA_SEMANA, MESES, MESES_CURTOS, diaDaSemana } from '../adm/calendario/datas'
import { CORES_DO_TIPO, ICONE_DO_TIPO, ROTULOS_DO_TIPO } from '../adm/calendario/tipos'
import { horaCurta } from '../adm/formatos'
import { eventosAVir, frasePontos, horarioELocal, UniformeDoEvento } from './eventoDoPacote'
import type { EventoDoPacote } from './eventoDoPacote'

interface Mes {
  chave: string
  titulo: string
  eventos: EventoDoPacote[]
}

/** Agrupa por mês; o que já começou e ainda não terminou fica no mês de hoje. */
function agruparPorMes(eventos: EventoDoPacote[], hoje: string): Mes[] {
  const meses: Mes[] = []
  for (const evento of eventos) {
    const chave = (evento.inicio > hoje ? evento.inicio : hoje).slice(0, 7)
    const existente = meses.find((mes) => mes.chave === chave)
    if (existente) existente.eventos.push(evento)
    else meses.push({ chave, titulo: `${MESES[Number(chave.slice(5, 7)) - 1] ?? ''} de ${chave.slice(0, 4)}`, eventos: [evento] })
  }
  return meses
}

/** "SEG 12 OUT"; em evento de vários dias do mesmo mês, "SEX–DOM 13–15 NOV". */
function BlocoDaData({ evento }: { evento: EventoDoPacote }) {
  const umDia = evento.fim === evento.inicio
  const mesmoMes = evento.inicio.slice(0, 7) === evento.fim.slice(0, 7)
  const dia = (data: string): string => String(Number(data.slice(8, 10)))
  const semana = (data: string): string => DIAS_DA_SEMANA[diaDaSemana(data)] ?? ''
  const periodo = !umDia && mesmoMes
  return (
    <div aria-hidden className="flex w-14 shrink-0 flex-col items-center justify-center rounded-botao bg-marca-tinta px-1 py-2 text-center">
      <span className="text-xs font-bold text-texto-2">{periodo ? `${semana(evento.inicio)}–${semana(evento.fim)}` : semana(evento.inicio)}</span>
      <span className="font-titulo text-xl font-extrabold text-texto">{periodo ? `${dia(evento.inicio)}–${dia(evento.fim)}` : dia(evento.inicio)}</span>
      <span className="text-xs font-bold text-texto-2">{(MESES_CURTOS[Number(evento.inicio.slice(5, 7)) - 1] ?? '').toUpperCase()}</span>
    </div>
  )
}

function detalheDoEvento(evento: EventoDoPacote, diaReuniao: number): string {
  if (evento.tipo === 'FERIAS') return `Até ${diaDoMesPorExtenso(evento.fim)} · sem reunião ${dosDiasDeReuniao(diaReuniao).nos}`
  const detalhe = horarioELocal(evento)
  if (detalhe) return detalhe
  return evento.tipo === 'FERIADO' ? 'Dia inteiro' : ''
}

function EventoDaLista({ evento, diaReuniao }: { evento: EventoDoPacote; diaReuniao: number }) {
  const Icone = ICONE_DO_TIPO[evento.tipo]
  const detalhe = detalheDoEvento(evento, diaReuniao)
  const pontos = frasePontos(evento)
  return (
    <article aria-label={evento.nome} className="flex gap-4 rounded-cartao border border-borda-controle bg-superficie p-4">
      <BlocoDaData evento={evento} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="sr-only">{diaDaSemanaEDoMes(evento.inicio)}</span>
        <span className="text-base font-bold break-words text-texto">{evento.nome}</span>
        <span className="flex flex-wrap gap-2">
          <Selo className={CORES_DO_TIPO[evento.tipo]}>
            {Icone && <Icone aria-hidden className="size-4" />}
            {ROTULOS_DO_TIPO[evento.tipo]}
          </Selo>
          {evento.tipo === 'EVENTO_ESPECIAL' && evento.uniforme && <UniformeDoEvento uniforme={evento.uniforme} />}
        </span>
        {detalhe && (
          <span className="flex items-center gap-2 text-base text-texto-2">
            <Clock aria-hidden className="size-[18px] shrink-0" />
            {detalhe}
          </span>
        )}
        {pontos && <p className="text-base text-texto">{pontos}</p>}
      </div>
    </article>
  )
}

/** O calendário do clube para quem só lê (conselheiro e instrutor): o pacote guardado, sem escrita e sem estado de erro. */
export function CalendarioDeLeitura() {
  const { papel } = useSessao()
  const { modo } = useConexao()
  const { pacote, carregando, baixadoEm } = usePacote()

  const atualizadoEm = pacote && baixadoEm !== null ? diaEMes(hojeNoFuso(pacote.clube.fuso, new Date(baixadoEm))) : null
  const hoje = pacote ? hojeNoFuso(pacote.clube.fuso, new Date()) : ''
  // Pacote guardado antes do calendário não traz o campo.
  const meses = pacote ? agruparPorMes(eventosAVir(pacote.calendario ?? [], hoje), hoje) : []

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-titulo text-2xl font-extrabold text-texto">Calendário do clube</h1>
        <p className="text-base text-texto-2">
          Os eventos do clube que ainda vão acontecer. Quem cadastra é o Adm do clube.
          {papel === 'INSTRUTOR' && ' As datas das suas classes estão em Cronograma.'}
        </p>
        {pacote && (
          <p className="text-sm text-texto-3">
            Reunião regular: {dosDiasDeReuniao(pacote.clube.diaReuniao).nos.replace(/^n[oa]s /, '')}, {horaCurta(pacote.clube.horaReuniao)}
            {atualizadoEm && ` · dados deste aparelho, de ${atualizadoEm}`}
          </p>
        )}
      </header>
      {carregando && <Carregando rotulo="Carregando o calendário" />}
      {!carregando && !pacote && (
        <EstadoVazio titulo="Disponível quando houver internet" descricao="Conecte-se uma vez para guardar o calendário neste aparelho." />
      )}
      {!carregando && pacote && modo === 'SEM_CONEXAO' && atualizadoEm && <FaixaAviso>Sem internet. Você vê o calendário de {atualizadoEm}.</FaixaAviso>}
      {!carregando && pacote && meses.length === 0 && (
        <EstadoVazio
          titulo="Nenhum evento nos dados deste aparelho"
          descricao={`${atualizadoEm ? `Atualizados em ${atualizadoEm}. ` : ''}Quem cadastra os eventos é o Adm do clube; quando houver um, ele aparece nesta lista.`}
        />
      )}
      {!carregando &&
        pacote &&
        meses.map((mes) => (
          <section key={mes.chave} aria-labelledby={`mes-${mes.chave}`} className="flex flex-col gap-2">
            <h2 id={`mes-${mes.chave}`} className="font-titulo text-lg font-bold text-texto">
              {mes.titulo}
            </h2>
            <ul className="flex flex-col gap-2">
              {mes.eventos.map((evento) => (
                <li key={`${evento.inicio}-${evento.nome}`}>
                  <EventoDaLista evento={evento} diaReuniao={pacote.clube.diaReuniao} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
