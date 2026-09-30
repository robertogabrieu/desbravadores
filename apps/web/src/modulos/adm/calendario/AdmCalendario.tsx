import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { hojeDoClube } from '../../../api/desbravadores'
import { useCalendario, useExcluirEvento } from '../../../api/calendario'
import type { AulaAfetada, EventoCalendario } from '../../../api/calendario'
import { useConfiguracaoClube } from '../../../api/clube'
import { useConexao } from '../../../offline'
import { Abas } from '../../../ui/Abas'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Esqueleto } from '../../../ui/Esqueleto'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { cn } from '../../../ui/cn'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { lerErroDaApi } from '../desbravadores/erros'
import { DIAS_DA_SEMANA, MESES, MESES_CURTOS, chaveDoDia, dataBrasileira, diaEMes, diasDaGrade, eventosDoDia, eventosDoMes } from './datas'
import { FormularioEvento } from './FormularioEvento'
import { COR_DA_REUNIAO, CORES_DO_TIPO, ROTULOS_DO_TIPO } from './tipos'

type Painel = { tipo: 'novo' } | { tipo: 'editar'; evento: EventoCalendario } | null

const ABAS_DE_MES = MESES_CURTOS.map((rotulo, indice) => ({ id: String(indice), rotulo }))
const MAXIMO_POR_DIA = 2

/** "Isto afeta 2 aulas (Amigo 18/10, Pioneiro 19/10). Os instrutores foram avisados." */
export function textoDasAulasAfetadas(aulas: AulaAfetada[]): string {
  const lista = aulas.map((aula) => `${aula.classe.nome} ${diaEMes(aula.data)}`).join(', ')
  return `Isto afeta ${aulas.length} ${aulas.length === 1 ? 'aula' : 'aulas'} (${lista}). Os instrutores foram avisados.`
}

const periodo = (evento: EventoCalendario): string =>
  evento.inicio === evento.fim ? dataBrasileira(evento.inicio) : `${dataBrasileira(evento.inicio)} a ${dataBrasileira(evento.fim)}`

export function AdmCalendario() {
  const hoje = hojeDoClube()
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)) - 1)
  const [painel, setPainel] = useState<Painel>(null)
  const [excluindo, setExcluindo] = useState<EventoCalendario | null>(null)
  const [aulasAfetadas, setAulasAfetadas] = useState<AulaAfetada[]>([])
  const [erroDeExclusao, setErroDeExclusao] = useState<string | null>(null)
  const calendario = useCalendario(ano)
  const configuracao = useConfiguracaoClube()
  const excluir = useExcluirEvento()
  const { modo } = useConexao()
  const fecharPainel = useCallback(() => setPainel(null), [])

  const eventos = calendario.data?.eventos ?? []
  const diasDeReuniao = new Set(calendario.data?.diasDeReuniao ?? [])
  const eventosDesteMes = eventosDoMes(eventos, ano, mes)
  const horaDaReuniao = configuracao.data?.horaReuniao

  function abrirPainel(novo: Painel) {
    setAulasAfetadas([])
    setErroDeExclusao(null)
    setPainel(novo)
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setErroDeExclusao(null)
    try {
      await excluir.mutateAsync(excluindo.id)
      setPainel(null)
    } catch (falha) {
      setErroDeExclusao(lerErroDaApi(falha).geral)
    }
    setExcluindo(null)
  }

  let corpo: ReactNode
  if (calendario.data) {
    corpo = (
      <>
        <Cartao className="flex flex-col gap-3">
          <ul aria-label="Legenda" className="flex flex-wrap gap-3 text-sm font-semibold text-texto-3">
            <li className={cn('rounded-full px-2.5 py-0.5', COR_DA_REUNIAO)}>Reunião regular</li>
            {Object.entries(ROTULOS_DO_TIPO).map(([tipo, rotulo]) => (
              <li key={tipo} className={cn('rounded-full px-2.5 py-0.5', CORES_DO_TIPO[tipo as keyof typeof CORES_DO_TIPO])}>
                {rotulo}
              </li>
            ))}
          </ul>
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
                aoEscolher={(evento) => abrirPainel({ tipo: 'editar', evento })}
              />
            ))}
          </div>
        </Cartao>
        {eventosDesteMes.length === 0 ? (
          <EstadoVazio titulo={`Nenhum evento em ${MESES[mes]}`} descricao="Cadastre feriados, acampamentos e dias sem reunião para que o cronograma das classes os respeite." />
        ) : (
          <ul aria-label={`Eventos de ${MESES[mes]}`} className="flex flex-col gap-2">
            {eventosDesteMes.map((evento) => (
              <li key={evento.id}>
                <Cartao className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-bold text-texto">{evento.nome}</span>
                    <span className="text-sm text-texto-2">
                      {ROTULOS_DO_TIPO[evento.tipo]} · {periodo(evento)}
                      {evento.horario && ` · ${evento.horario}`}
                      {evento.local && ` · ${evento.local}`}
                    </span>
                  </div>
                  <Botao variante="texto" aria-label={`Editar ${evento.nome}`} onClick={() => abrirPainel({ tipo: 'editar', evento })}>
                    Editar
                  </Botao>
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (calendario.isError) corpo = <ErroDeCarga erro={calendario.error} aoTentarDeNovo={() => void calendario.refetch()} />
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
          <p className="text-sm font-semibold text-texto-2">Base para todos os cronogramas de classe</p>
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Calendário do clube</h1>
        </div>
        <Botao onClick={() => abrirPainel({ tipo: 'novo' })}>
          <Plus aria-hidden className="size-5" />
          Novo evento
        </Botao>
      </header>

      {aulasAfetadas.length > 0 && <FaixaAviso>{textoDasAulasAfetadas(aulasAfetadas)}</FaixaAviso>}
      {erroDeExclusao && (
        <p role="alert" className="text-base font-medium text-perigo">
          {erroDeExclusao}
        </p>
      )}

      <Abas rotulo="Mês" abas={ABAS_DE_MES} ativa={String(mes)} aoMudar={(id) => setMes(Number(id))} />
      <div className="flex items-center gap-2">
        <Botao variante="secundario" aria-label="Ano anterior" onClick={() => setAno(ano - 1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </Botao>
        <h2 className="min-w-44 text-center text-lg font-extrabold text-texto">
          {MESES[mes]} de {ano}
        </h2>
        <Botao variante="secundario" aria-label="Próximo ano" onClick={() => setAno(ano + 1)}>
          <ChevronRight aria-hidden className="size-5" />
        </Botao>
      </div>

      {corpo}

      <FolhaLateral aberta={painel !== null} titulo={painel?.tipo === 'editar' ? `Editar ${painel.evento.nome}` : 'Novo evento no calendário'} aoFechar={fecharPainel}>
        {painel && (
          <FormularioEvento
            key={painel.tipo === 'editar' ? painel.evento.id : 'novo'}
            evento={painel.tipo === 'editar' ? painel.evento : undefined}
            dataInicial={chaveDoDia(ano, mes, 1)}
            aoGravar={(gravado) => {
              setAulasAfetadas(gravado.aulasAfetadas)
              fecharPainel()
            }}
            aoCancelar={fecharPainel}
            aoExcluir={painel.tipo === 'editar' ? () => setExcluindo(painel.evento) : undefined}
          />
        )}
      </FolhaLateral>
      <Confirmacao
        aberta={excluindo !== null}
        titulo={`Excluir ${excluindo?.nome ?? ''}?`}
        rotuloConfirmar="Excluir"
        perigo
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setExcluindo(null)}
      >
        O evento sai do calendário do clube.
      </Confirmacao>
    </div>
  )
}

interface PropriedadesDaCelula {
  dia: number | null
  data: string | null
  eventos: EventoCalendario[]
  ehReuniao: boolean
  horaDaReuniao: string | undefined
  aoEscolher: (evento: EventoCalendario) => void
}

function CelulaDoDia({ dia, data, eventos, ehReuniao, horaDaReuniao, aoEscolher }: PropriedadesDaCelula) {
  if (dia === null || data === null) return <div aria-hidden className="min-h-24 rounded-controle bg-superficie-suave/50" />
  const doDia = eventosDoDia(eventos, data)
  return (
    <div className="flex min-h-24 flex-col gap-1 rounded-controle border border-divisor p-1.5">
      <span className="text-sm font-bold text-texto">{dia}</span>
      {ehReuniao && <span className={cn('truncate rounded-controle px-1.5 py-0.5 text-sm font-semibold', COR_DA_REUNIAO)}>{horaDaReuniao ? `Reunião ${horaDaReuniao}` : 'Reunião'}</span>}
      {doDia.slice(0, MAXIMO_POR_DIA).map((evento) => (
        <button
          key={evento.id}
          type="button"
          onClick={() => aoEscolher(evento)}
          className={cn('truncate rounded-controle px-1.5 py-0.5 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-marca', CORES_DO_TIPO[evento.tipo])}
        >
          {evento.nome}
        </button>
      ))}
      {doDia.length > MAXIMO_POR_DIA && <span className="text-sm font-semibold text-texto-2">+{doDia.length - MAXIMO_POR_DIA}</span>}
    </div>
  )
}
