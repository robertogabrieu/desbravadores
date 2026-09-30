import { Check, ChevronLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { hojeDoClube } from '../../api/desbravadores'
import type { AreaEspecialidades, EspecialidadesDoDbv } from '../../api/especialidades-dbv'
import { useCatalogoEspecialidades, useDesmarcarEspecialidade, useEspecialidadesDoDbv, useMarcarEspecialidade } from '../../api/especialidades-dbv'
import { useProgressoClasse } from '../../api/progresso'
import { useConexao } from '../../offline'
import { Avatar } from '../../ui/Avatar'
import { Campo } from '../../ui/Campo'
import { CampoData } from '../../ui/CampoData'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { cn } from '../../ui/cn'
import { ChipsDeClasse, useClasseEscolhida } from '../progresso/ChipsDeClasse'
import { diaEMesCurto, semAcento } from '../progresso/formatos'

type Concluida = EspecialidadesDoDbv['concluidas'][number]
type Alvo = { id: string; nome: string }

const MENSAGEM_PADRAO = 'Não foi possível concluir agora. Tente de novo.'
const mensagemDe = (erro: Error | null): string => (erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_PADRAO)

function filtrarAreas(areas: AreaEspecialidades[], busca: string): AreaEspecialidades[] {
  const termo = semAcento(busca.trim())
  if (termo === '') return areas
  return areas
    .map((area) => ({ ...area, especialidades: area.especialidades.filter((esp) => semAcento(esp.nome).includes(termo)) }))
    .filter((area) => area.especialidades.length > 0)
}

function ItemEspecialidade({ nome, concluida, aoToque }: { nome: string; concluida: Concluida | undefined; aoToque: () => void }) {
  const travada = concluida !== undefined && !concluida.podeDesmarcar
  return (
    <button
      type="button"
      aria-pressed={concluida !== undefined}
      disabled={travada}
      onClick={aoToque}
      className="flex min-h-[var(--touch-min)] w-full items-center gap-3 rounded-botao px-2 py-2 text-left hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca disabled:cursor-default"
    >
      <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center rounded-controle border-2', concluida ? 'border-marca bg-marca text-white' : 'border-borda text-transparent')}>
        <Check className="size-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-semibold text-texto">{nome}</span>
        <span className="text-sm text-texto-2">
          {concluida ? `Concluída em ${diaEMesCurto(concluida.concluidaEm)} · marcada por ${concluida.marcadoPor}` : 'Toque para marcar como concluída'}
        </span>
      </span>
    </button>
  )
}

function ListaDoDbv({ dbv }: { dbv: Alvo }) {
  const catalogo = useCatalogoEspecialidades()
  const doDbv = useEspecialidadesDoDbv(dbv.id)
  const marcar = useMarcarEspecialidade(dbv.id)
  const desmarcar = useDesmarcarEspecialidade(dbv.id)
  const [busca, definirBusca] = useState('')
  const [aMarcar, definirAMarcar] = useState<Alvo | null>(null)
  const [aDesmarcar, definirADesmarcar] = useState<Alvo | null>(null)
  const [data, definirData] = useState(hojeDoClube())
  const areas = useMemo(() => filtrarAreas(catalogo.data ?? [], busca), [catalogo.data, busca])

  if (doDbv.isPending || catalogo.isPending) return <Carregando rotulo="Carregando especialidades" />
  if (doDbv.isError) {
    if (doDbv.error instanceof ErroDaApi && doDbv.error.status === 404) {
      return <EstadoVazio titulo="Desbravador não encontrado" descricao="Ele não está entre os desbravadores das suas classes." />
    }
    return <ErroDeCarga erro={doDbv.error} aoTentarDeNovo={() => void doDbv.refetch()} />
  }
  if (catalogo.isError) return <ErroDeCarga erro={catalogo.error} aoTentarDeNovo={() => void catalogo.refetch()} />

  const concluidas = new Map(doDbv.data.concluidas.map((c) => [c.especialidadeId, c]))
  const fecharMarcar = () => {
    definirAMarcar(null)
    marcar.reset()
  }
  const confirmarMarcar = () => {
    if (!aMarcar) return
    marcar.mutate({ especialidadeId: aMarcar.id, concluidoEm: data }, { onSuccess: fecharMarcar })
  }
  const confirmarDesmarcar = () => {
    if (!aDesmarcar) return
    desmarcar.mutate(aDesmarcar.id, { onSettled: () => definirADesmarcar(null) })
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-titulo text-lg font-bold text-texto">{dbv.nome}</span>
        <span className="text-sm text-texto-2">{`${concluidas.size} concluídas`}</span>
      </div>
      <Campo rotulo="Buscar especialidade" type="search" value={busca} onChange={(e) => definirBusca(e.target.value)} placeholder="Buscar especialidade" />
      {areas.length === 0 && <EstadoVazio titulo="Nenhuma especialidade encontrada." />}
      {areas.map((area) => (
        <section key={area.id} className="flex flex-col gap-1">
          <h2 className="font-titulo text-base font-bold text-texto">{area.nome}</h2>
          {area.especialidades.map((esp) => (
            <ItemEspecialidade
              key={esp.id}
              nome={esp.nome}
              concluida={concluidas.get(esp.id)}
              aoToque={() => (concluidas.has(esp.id) ? definirADesmarcar(esp) : (definirData(hojeDoClube()), definirAMarcar(esp)))}
            />
          ))}
        </section>
      ))}
      <Confirmacao aberta={aMarcar !== null} titulo="Marcar como concluída" rotuloConfirmar="Marcar" aoConfirmar={confirmarMarcar} aoCancelar={fecharMarcar}>
        <div className="flex flex-col gap-3">
          <p>{aMarcar?.nome}</p>
          <CampoData rotulo="Data de conclusão" value={data} max={hojeDoClube()} onChange={(e) => definirData(e.target.value)} />
          {marcar.isError && <p role="alert" className="text-sm font-medium text-perigo">{mensagemDe(marcar.error)}</p>}
        </div>
      </Confirmacao>
      <Confirmacao aberta={aDesmarcar !== null} titulo="Desmarcar especialidade?" rotuloConfirmar="Desmarcar" perigo aoConfirmar={confirmarDesmarcar} aoCancelar={() => definirADesmarcar(null)}>
        {`${aDesmarcar?.nome ?? ''} deixa de constar como concluída por ${dbv.nome}.`}
      </Confirmacao>
    </>
  )
}

export function TelaEspecialidades() {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const { classes, classeId, escolher } = useClasseEscolhida()
  const [consulta, definirConsulta] = useSearchParams()
  const dbvId = consulta.get('dbv')
  const progresso = useProgressoClasse(classeId, online)
  const [buscaDbv, definirBuscaDbv] = useState('')

  const escolherDbv = (id: string) => definirConsulta({ classe: classeId, dbv: id }, { replace: true })
  const desbravadores = (progresso.data?.itens ?? []).filter((item) => semAcento(item.nome).includes(semAcento(buscaDbv.trim())))
  const escolhido = progresso.data?.itens.find((item) => item.dbvId === dbvId)
  const alvo: Alvo | null = dbvId ? { id: dbvId, nome: escolhido?.nome ?? '' } : null

  let corpo
  if (!online) corpo = <DisponivelComInternet />
  else if (classes.length === 0) corpo = <EstadoVazio titulo="Você ainda não tem classes." descricao="O Adm do clube as atribui." />
  else if (progresso.isPending) corpo = <Carregando rotulo="Carregando especialidades" />
  else if (progresso.isError) corpo = <ErroDeCarga erro={progresso.error} aoTentarDeNovo={() => void progresso.refetch()} />
  else if (progresso.data.itens.length === 0) corpo = <EstadoVazio titulo="Nenhum desbravador cursando esta classe." />
  else {
    corpo = (
      <>
        <div className="flex flex-col gap-2">
          <Campo rotulo="Buscar desbravador" type="search" value={buscaDbv} onChange={(e) => definirBuscaDbv(e.target.value)} placeholder="Buscar desbravador" />
          <div role="group" aria-label="Desbravador" className="flex gap-3 overflow-x-auto pb-1">
            {desbravadores.map((item) => (
              <button
                key={item.dbvId}
                type="button"
                aria-pressed={item.dbvId === dbvId}
                aria-label={item.nome}
                onClick={() => escolherDbv(item.dbvId)}
                className={cn('flex min-h-[var(--touch-min)] w-20 shrink-0 flex-col items-center gap-1 rounded-botao p-1 focus-visible:outline-2 focus-visible:outline-marca', item.dbvId === dbvId && 'bg-marca-suave')}
              >
                <Avatar nome={item.nome} className="size-12" />
                <span aria-hidden className={cn('w-full truncate text-center text-xs', item.dbvId === dbvId ? 'font-extrabold text-texto' : 'font-semibold text-texto-2')}>{item.nome.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
        {alvo ? <ListaDoDbv key={alvo.id} dbv={alvo} /> : <EstadoVazio titulo="Escolha um desbravador" descricao="Toque num nome acima para ver as especialidades dele." />}
      </>
    )
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Link to="/inicio" aria-label="Voltar" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <h1 className="font-titulo text-2xl font-extrabold text-texto">Especialidades</h1>
      </header>
      <ChipsDeClasse classes={classes} ativaId={classeId} aoEscolher={escolher} />
      {corpo}
    </main>
  )
}
