import { ChevronLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProgressoClasse } from '../../api/progresso'
import type { ProgressoClasse } from '../../api/progresso'
import { useClasses } from '../../api/leitura'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Abas } from '../../ui/Abas'
import { Cartao } from '../../ui/Cartao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { cn } from '../../ui/cn'
import { ChipsDeClasse } from './ChipsDeClasse'

/** O padrão de `ConfiguracaoClube.limiarProgressoAlerta`; nenhum contrato da API entrega o valor do clube ainda. */
export const LIMIAR_PROGRESSO_ALERTA = 40

type Item = ProgressoClasse['itens'][number]

function LinhaDoDbv({ item }: { item: Item }) {
  const abaixo = item.percentual < LIMIAR_PROGRESSO_ALERTA
  return (
    <li>
      <Link to={`/dbv/${item.dbvId}`} className="flex min-h-[var(--touch-min)] flex-col gap-2 rounded-cartao border border-borda bg-superficie p-3 focus-visible:outline-2 focus-visible:outline-marca">
        <div className="flex items-baseline gap-3">
          <span className="flex flex-1 items-baseline gap-2 text-base font-semibold text-texto">
            {item.nome}
            {item.voce && <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs font-bold text-texto">você</span>}
          </span>
          <span className="text-sm text-texto-2">{`faltam ${item.faltam} req.`}</span>
          <span data-abaixo={abaixo} className={cn('w-12 text-right text-base font-extrabold', abaixo ? 'text-alerta' : 'text-texto')}>{`${item.percentual}%`}</span>
        </div>
        <div aria-hidden className="h-2 overflow-hidden rounded-full bg-trilho">
          <div className={cn('h-full rounded-full', abaixo ? 'bg-alerta' : 'bg-marca')} style={{ width: `${Math.min(100, item.percentual)}%` }} />
        </div>
      </Link>
    </li>
  )
}

export function TelaProgressoClasse() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { modo } = useConexao()
  const { vinculoAtivo } = useSessao()
  const online = modo === 'ONLINE'
  const progresso = useProgressoClasse(id, online)
  const catalogo = useClasses()

  const classesDoVinculo = vinculoAtivo?.classes ?? []
  const idsDoVinculo = new Set(classesDoVinculo.map((classe) => classe.id))
  const catalogoDeClasses = catalogo.data ?? []
  const atual = catalogoDeClasses.find((classe) => classe.id === id)
  const regularDaAvancada = (classeId: string) => catalogoDeClasses.find((classe) => classe.id === classeId)?.classeBaseId ?? null
  const chips = classesDoVinculo.filter((classe) => {
    const base = classe.tipo === 'AVANCADA' ? regularDaAvancada(classe.id) : null
    return base === null || !idsDoVinculo.has(base)
  })
  const parDaTrilha =
    atual?.tipo === 'AVANCADA'
      ? catalogoDeClasses.find((classe) => classe.id === atual.classeBaseId)
      : catalogoDeClasses.find((classe) => classe.classeBaseId === id && classe.tipo === 'AVANCADA')
  const regular = atual?.tipo === 'AVANCADA' ? parDaTrilha : atual
  const avancada = atual?.tipo === 'AVANCADA' ? atual : parDaTrilha
  const alternador = regular && avancada && idsDoVinculo.has(regular.id) && idsDoVinculo.has(avancada.id)
  const chipAtivo = atual?.tipo === 'AVANCADA' && idsDoVinculo.has(atual.classeBaseId ?? '') ? atual.classeBaseId ?? id : id

  const irParaClasse = (classeId: string): void => {
    void navegar(`/classes/${classeId}/progresso`, { replace: true })
  }

  let corpo
  if (!online) corpo = <DisponivelComInternet />
  else if (progresso.isPending) corpo = <Carregando rotulo="Carregando progresso" />
  else if (progresso.isError) corpo = <ErroDeCarga erro={progresso.error} aoTentarDeNovo={() => void progresso.refetch()} />
  else {
    const dados = progresso.data
    const ehAvancada = dados.classe.tipo === 'AVANCADA'
    corpo = (
      <>
        <Cartao className="flex flex-col gap-3 text-white" style={{ background: `var(${dados.classe.corToken})`, borderColor: 'transparent' }}>
          <div className="flex items-end gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold opacity-90">Média da turma</span>
              <span className="font-titulo text-4xl font-extrabold">{dados.media === null ? '—' : `${dados.media}%`}</span>
            </div>
            <span className="pb-1 text-sm font-semibold">{`${dados.itens.length} DBVs · ${dados.totalRequisitos} requisitos`}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
            <span>{ehAvancada ? `${dados.concluiramAvancada} concluíram a avançada` : `${dados.prontos} prontos p/ investidura`}</span>
            <span>{`${dados.abaixoDoLimiar} abaixo de ${LIMIAR_PROGRESSO_ALERTA}%`}</span>
          </div>
        </Cartao>
        {dados.itens.length === 0 ? (
          <EstadoVazio titulo="Nenhum desbravador cursando esta classe." />
        ) : (
          <ul className="flex flex-col gap-2">
            {dados.itens.map((item) => (
              <LinhaDoDbv key={item.dbvId} item={item} />
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Link to="/classes" aria-label="Voltar" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <h1 className="font-titulo text-2xl font-extrabold text-texto">Progresso da classe</h1>
      </header>
      <ChipsDeClasse classes={chips} ativaId={chipAtivo} aoEscolher={irParaClasse} />
      {alternador && (
        <Abas
          rotulo="Trilha"
          abas={[{ id: 'REGULAR', rotulo: 'Regular' }, { id: 'AVANCADA', rotulo: 'Avançada' }]}
          ativa={atual?.tipo === 'AVANCADA' ? 'AVANCADA' : 'REGULAR'}
          aoMudar={(trilha) => irParaClasse((trilha === 'AVANCADA' ? avancada : regular)?.id ?? id)}
        />
      )}
      {corpo}
    </main>
  )
}
