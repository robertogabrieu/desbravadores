import { hojeNoFuso } from '@desbravadores/shared'
import { CalendarDays, ClipboardCheck, Folder, MessageSquare, Medal, BarChart3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInicioInstrutor } from '../../api/instrutor'
import type { ClasseDoInstrutor, InicioInstrutor } from '../../api/instrutor'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Esqueleto } from '../../ui/Esqueleto'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { corDaClasse } from '../classes/cores'
import { TRACO, formatarDataCurta, formatarHorario } from '../cronograma/formatos'

interface Atalho {
  rotulo: string
  icone: LucideIcon
  /** `classeId` só vem quando o instrutor tem uma única classe; com várias, o atalho leva à tela que deixa escolher. */
  para: (classeId: string | undefined) => string
}

const comClasse = (caminho: string) => (classeId: string | undefined) => (classeId ? `${caminho}?classe=${classeId}` : caminho)

const ATALHOS: Atalho[] = [
  { rotulo: 'Cronograma', icone: CalendarDays, para: comClasse('/cronograma') },
  { rotulo: 'Registrar aula', icone: ClipboardCheck, para: comClasse('/aulas/nova') },
  { rotulo: 'Materiais', icone: Folder, para: (classeId) => (classeId ? `/classes/${classeId}/materiais` : '/classes') },
  { rotulo: 'Observações', icone: MessageSquare, para: comClasse('/observacoes') },
  { rotulo: 'Progresso', icone: BarChart3, para: (classeId) => (classeId ? `/classes/${classeId}/progresso` : '/classes') },
  { rotulo: 'Especialidades', icone: Medal, para: comClasse('/especialidades') },
]

const LINK_PRIMARIO =
  'flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

const ehAgrupada = (classe: ClasseDoInstrutor): boolean => classe.classe.trilha === 'AGRUPADAS'

/** Data de hoje na tela do instrutor quando não há aula planejada para carregar a data. */
const hojeLocal = (): string => hojeNoFuso(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date())

function CartaoProximaAula({ item }: { item: ClasseDoInstrutor }) {
  const { classe, proximaAula, aulaHoje, aulaHojeRegistrada, totalDbvs } = item
  const dataDaAula = proximaAula?.data ?? hojeLocal()
  return (
    <section aria-label={`Próxima aula de ${classe.nome}`} className="flex flex-col overflow-hidden rounded-cartao border border-borda bg-superficie">
      <div className="h-1.5" style={corDaClasse(classe.corToken)} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={corDaClasse(classe.corToken)}>
            {classe.nome}
          </span>
          {proximaAula && (
            <span className="text-sm font-semibold text-texto-2">
              Próxima aula · {formatarDataCurta(proximaAula.data)}
              {proximaAula.horario && ` · ${formatarHorario(proximaAula.horario)}`}
            </span>
          )}
        </div>
        {proximaAula ? (
          <div className="flex flex-col gap-1">
            <span className="font-titulo text-xl font-bold text-texto">{proximaAula.titulo ?? 'Aula sem título'}</span>
            <span className="text-base text-texto-2">
              {proximaAula.totalRequisitos} requisitos planejados · {totalDbvs} desbravadores
            </span>
          </div>
        ) : (
          <span className="text-base text-texto-2">Nenhuma aula publicada ainda</span>
        )}
        {aulaHoje && aulaHojeRegistrada && (
          <span className="flex items-center gap-2 text-base font-semibold text-sucesso">
            <ClipboardCheck aria-hidden className="size-5" />
            Aula de hoje registrada
          </span>
        )}
        {aulaHoje && !aulaHojeRegistrada && (
          <Link to={`/aulas/nova?classe=${classe.id}&data=${dataDaAula}`} className={LINK_PRIMARIO}>
            Registrar aula
          </Link>
        )}
      </div>
    </section>
  )
}

function LinhaDaClasse({ item }: { item: ClasseDoInstrutor }) {
  const { classe, totalDbvs, progressoMedio } = item
  return (
    <Link to={`/classes/${classe.id}/progresso`} className="flex flex-col gap-2 rounded-cartao border border-borda bg-superficie p-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-3 rounded-full" style={corDaClasse(classe.corToken)} />
        <span className="flex-1 text-base font-bold text-texto">{classe.nome}</span>
        <span className="text-sm text-texto-2">{totalDbvs} DBVs</span>
        <span className="font-bold text-texto">{progressoMedio === null ? TRACO : `${progressoMedio}%`}</span>
      </div>
      {progressoMedio !== null && <BarraProgresso valor={progressoMedio} rotulo={`Progresso médio de ${classe.nome}`} />}
    </Link>
  )
}

function ListaDeClasses({ titulo, itens, discreto = false }: { titulo: string; itens: ClasseDoInstrutor[]; discreto?: boolean }) {
  if (itens.length === 0) return null
  return (
    <section aria-label={titulo} className={discreto ? 'flex flex-col gap-2 opacity-90' : 'flex flex-col gap-2'}>
      <div className="flex items-center justify-between">
        <h2 className={discreto ? 'text-base font-semibold text-texto-2' : 'font-titulo text-lg font-bold text-texto'}>{titulo}</h2>
        {!discreto && (
          <Link to="/classes" className="flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca">
            Ver todas
          </Link>
        )}
      </div>
      {itens.map((item) => (
        <LinhaDaClasse key={item.classe.id} item={item} />
      ))}
    </section>
  )
}

function AlertaDeFaltas({ alertas }: { alertas: InicioInstrutor['alertaFaltas'] }) {
  return (
    <>
      {alertas
        .filter((alerta) => alerta.dbvs.length > 0)
        .map((alerta) => (
          <FaixaAviso key={alerta.classe.id}>
            {alerta.dbvs.length} desbravadores faltaram às duas últimas aulas de {alerta.classe.nome}: {alerta.dbvs.map((dbv) => dbv.nome).join(', ')}.
          </FaixaAviso>
        ))}
    </>
  )
}

function Atalhos({ classeUnica }: { classeUnica: string | undefined }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-titulo text-lg font-bold text-texto">Atalhos</h2>
      <div className="grid grid-cols-3 gap-2">
        {ATALHOS.map(({ rotulo, para, icone: Icone }) => (
          <Link
            key={rotulo}
            to={para(classeUnica)}
            className="flex min-h-[var(--touch-min)] flex-col items-center justify-center gap-2 rounded-cartao border border-borda bg-superficie p-3 text-center text-sm font-bold text-texto"
          >
            <Icone aria-hidden className="size-6 text-marca" />
            {rotulo}
          </Link>
        ))}
      </div>
    </section>
  )
}

function Conteudo({ dados }: { dados: InicioInstrutor }) {
  if (dados.classes.length === 0) {
    return <EstadoVazio titulo="Você ainda não tem classes. O Adm do clube as atribui." />
  }
  const individuais = dados.classes.filter((item) => !ehAgrupada(item))
  const agrupadas = dados.classes.filter(ehAgrupada)
  return (
    <>
      {individuais.map((item) => (
        <CartaoProximaAula key={item.classe.id} item={item} />
      ))}
      <ListaDeClasses titulo="Minhas classes" itens={individuais} />
      <ListaDeClasses titulo="Agrupadas" itens={agrupadas} discreto />
      <AlertaDeFaltas alertas={dados.alertaFaltas} />
      <Atalhos classeUnica={dados.classes.length === 1 ? dados.classes[0].classe.id : undefined} />
    </>
  )
}

/** Início do instrutor (I1): próxima aula por classe, progresso, alerta de faltas e atalhos. */
export function TelaInicioInstrutor() {
  const { eu, papel, vinculoAtivo } = useSessao()
  const consulta = useInicioInstrutor()
  const { modo } = useConexao()
  if (!eu || !papel || !vinculoAtivo) return null

  const titulo = eu.usuario.genero === 'F' ? 'Instrutora' : 'Instrutor'
  const nomesDasClasses = vinculoAtivo.classes.map((classe) => classe.nome).join(' e ')

  let corpo
  if (consulta.data) corpo = <Conteudo dados={consulta.data} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else {
    corpo = (
      <Carregando rotulo="Carregando o início">
        <Esqueleto className="h-40" />
        <Esqueleto className="h-24" />
        <Esqueleto className="h-24" />
      </Carregando>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">{nomesDasClasses ? `${titulo} · ${nomesDasClasses}` : titulo}</span>
        <h1 className="font-titulo text-2xl font-bold text-texto">Olá, {eu.usuario.nome.split(' ')[0]}</h1>
        <h2 className="sr-only">Início do instrutor</h2>
      </header>
      {corpo}
    </div>
  )
}

