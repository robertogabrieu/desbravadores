import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { hojeDoClube } from '../../../api/desbravadores'
import { LIMIAR_FREQUENCIA_ALERTA, useGradeFrequencia, useReunioes } from '../../../api/reunioes'
import { useConexao, useFila } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { Abas } from '../../../ui/Abas'
import { Botao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Esqueleto } from '../../../ui/Esqueleto'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { Selecao } from '../../../ui/Selecao'
import { cn } from '../../../ui/cn'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { diaEMes, nomeDoMes, somarMeses } from './datas'
import { chaveDaReuniao, reunioesDaFila } from './reunioesDaFila'
import type { LinhaHistorico } from './reunioesDaFila'

const ABAS = [
  { id: 'reuniao', rotulo: 'Por reunião' },
  { id: 'dbv', rotulo: 'Por DBV' },
]

const MARCAS: Record<string, { texto: string; classe: string }> = {
  P: { texto: 'presente', classe: 'bg-marca' },
  A: { texto: 'atraso', classe: 'bg-alerta' },
  F: { texto: 'falta', classe: 'bg-divisor' },
  J: { texto: 'falta justificada', classe: 'bg-borda' },
}

const corDoPercentual = (percentual: number | null): string => (percentual !== null && percentual < LIMIAR_FREQUENCIA_ALERTA ? 'text-perigo' : 'text-marca')

function plural(quantidade: number, singular: string, pluralizado: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralizado}`
}

function PrimeiraChamada() {
  return (
    <EstadoVazio
      titulo="Nenhuma chamada ainda."
      acao={
        <Link to="/reunioes/nova" className="inline-flex min-h-[var(--touch-min)] items-center rounded-botao bg-marca px-5 text-base font-semibold text-white">
          Fazer a primeira chamada
        </Link>
      }
    />
  )
}

function Carregando({ rotulo }: { rotulo: string }) {
  return (
    <div role="status" aria-label={rotulo} className="flex flex-col gap-2">
      <Esqueleto className="h-16" />
      <Esqueleto className="h-16" />
      <Esqueleto className="h-16" />
    </div>
  )
}

function ConteudoLinha({ linha }: { linha: LinhaHistorico }) {
  const { dia, mes } = diaEMes(linha.data)
  return (
    <>
      <span className="flex w-12 shrink-0 flex-col items-center leading-tight">
        <span className="font-titulo text-xl font-extrabold">{dia}</span>
        <span className="text-xs font-bold text-texto-2">{mes}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{`${linha.presentes}/${linha.total} presentes`}</span>
        <span className="flex flex-wrap gap-x-3 text-sm text-texto-2">
          <span>{plural(linha.atrasos, 'atraso', 'atrasos')}</span>
          <span>{`${linha.uniformes} uniforme`}</span>
          {linha.alterada && <span>alterada</span>}
          {linha.naoEnviado && <span className="font-bold text-alerta">não enviado</span>}
        </span>
      </span>
      <span className={cn('text-base font-extrabold', corDoPercentual(linha.percentual))}>{linha.percentual === null ? '—' : `${linha.percentual}%`}</span>
    </>
  )
}

const estiloLinha = 'flex items-center gap-3 rounded-cartao border border-borda bg-superficie p-3'

function PorReuniao({ unidadeId, mes }: { unidadeId: string; mes: string }) {
  const servidor = useReunioes(unidadeId, mes)
  const { itens } = useFila()
  const daFila = reunioesDaFila(itens, unidadeId, mes)
  const chavesNaFila = new Set(daFila.map((linha) => linha.chave))

  const doServidor: LinhaHistorico[] = (servidor.data ?? []).map((r) => ({
    chave: chaveDaReuniao(unidadeId, r.data),
    id: r.id,
    data: r.data,
    presentes: r.presentes,
    total: r.total,
    atrasos: r.atrasos,
    uniformes: r.uniformes,
    percentual: r.percentual,
    alterada: r.alterada,
    naoEnviado: chavesNaFila.has(chaveDaReuniao(unidadeId, r.data)),
  }))
  const chavesNoServidor = new Set(doServidor.map((linha) => linha.chave))
  const linhas = [...doServidor, ...daFila.filter((linha) => !chavesNoServidor.has(linha.chave))].sort((a, b) => b.data.localeCompare(a.data))

  if (servidor.isPending) return <Carregando rotulo="Carregando reuniões" />
  if (servidor.isError && linhas.length === 0) return <ErroDeCarga erro={servidor.error} aoTentarDeNovo={() => void servidor.refetch()} />
  if (linhas.length === 0) return <PrimeiraChamada />

  return (
    <ul className="flex flex-col gap-2">
      {linhas.map((linha) => (
        <li key={linha.chave}>
          {linha.id ? (
            <Link to={`/reunioes/${linha.id}`} className={estiloLinha}>
              <ConteudoLinha linha={linha} />
            </Link>
          ) : (
            <div className={estiloLinha}>
              <ConteudoLinha linha={linha} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function PorDbv({ unidadeId }: { unidadeId: string }) {
  const grade = useGradeFrequencia(unidadeId)
  if (grade.isPending) return <Carregando rotulo="Carregando frequência" />
  if (grade.isError) return <ErroDeCarga erro={grade.error} aoTentarDeNovo={() => void grade.refetch()} />
  if (grade.data.reunioes.length === 0) return <PrimeiraChamada />

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-texto-2">Últimas 8 reuniões</p>
      <ul className="flex flex-col gap-2">
        {grade.data.linhas.map((linha) => (
          <li key={linha.dbvId} className={estiloLinha}>
            <span className="min-w-0 flex-1 truncate font-semibold">{linha.nome}</span>
            <span className="flex gap-1">
              {linha.marcas.map((marca, indice) => {
                const definicao = marca === null ? null : MARCAS[marca]
                return (
                  <span key={grade.data.reunioes[indice]?.id ?? indice} className={cn('h-5 w-3 rounded-sm', definicao?.classe ?? 'border border-divisor')}>
                    <span className="sr-only">{definicao?.texto ?? 'sem registro'}</span>
                  </span>
                )
              })}
            </span>
            <span className={cn('w-12 text-right text-base font-extrabold', corDoPercentual(linha.percentual))}>{linha.percentual === null ? '—' : `${linha.percentual}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HistoricoReunioes() {
  const { vinculoAtivo } = useSessao()
  const { modo } = useConexao()
  const unidades = [...(vinculoAtivo?.unidades ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [aba, setAba] = useState('reuniao')
  const mesCorrente = hojeDoClube().slice(0, 7)
  const [mes, setMes] = useState(mesCorrente)
  const unidade = unidades.find((u) => u.id === escolhida) ?? unidades[0]

  if (!unidade) return <EstadoVazio titulo="Você ainda não tem unidade" descricao="Avise o Adm para ligar você a uma unidade." />

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-texto-2">{`Unidade ${unidade.nome}`}</span>
          <h1 className="font-titulo text-2xl font-extrabold">Reuniões</h1>
        </div>
        <Link to="/reunioes/nova" className="inline-flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-botao bg-marca px-4 text-base font-semibold text-white">
          <Plus aria-hidden className="size-5" />
          Nova
        </Link>
      </header>
      {modo === 'SEM_CONEXAO' && <FaixaAviso>Sem conexão. Mostrando o que este aparelho já tem.</FaixaAviso>}
      {unidades.length > 1 && (
        <Selecao rotulo="Unidade" value={unidade.id} onChange={(evento) => setEscolhida(evento.target.value)}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      )}
      <Abas rotulo="Visão" abas={ABAS} ativa={aba} aoMudar={setAba} />
      {aba === 'reuniao' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Botao variante="secundario" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
              <ChevronLeft aria-hidden className="size-5" />
            </Botao>
            <span className="font-semibold">{nomeDoMes(mes)}</span>
            <Botao variante="secundario" aria-label="Próximo mês" disabled={mes >= mesCorrente} onClick={() => setMes(somarMeses(mes, 1))}>
              <ChevronRight aria-hidden className="size-5" />
            </Botao>
          </div>
          <PorReuniao unidadeId={unidade.id} mes={mes} />
        </>
      ) : (
        <PorDbv unidadeId={unidade.id} />
      )}
    </main>
  )
}
