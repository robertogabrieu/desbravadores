import { CalendarClock, Plus, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useConfiguracaoClube } from '../../../api/clube'
import { useVisaoGeral } from '../../../api/visao-geral'
import type { VisaoGeral as Visao } from '../../../api/visao-geral'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { useConexao } from '../../../offline'
import { BarraProgresso } from '../../../ui/BarraProgresso'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { cn } from '../../../ui/cn'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { useEstadoDeVolta } from '../navegacao'

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`
const sinal = (n: number): string => (n > 0 ? `+${n}` : String(n))
const formatarInstante = (iso: string): string => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const formatarDiaMes = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <Cartao role="group" aria-label={titulo} className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-texto-2">{titulo}</span>
      <span className="font-titulo text-3xl font-extrabold text-texto">{valor}</span>
      <span className="text-sm text-texto-2">{detalhe}</span>
    </Cartao>
  )
}

function Indicadores({ visao, celular }: { visao: Visao; celular: boolean }) {
  const { frequenciaMes, variacaoFrequencia } = visao
  const detalheFrequencia =
    variacaoFrequencia === null ? 'Sem mês anterior para comparar' : `${sinal(variacaoFrequencia)} pts vs. mês anterior`
  return (
    <section aria-label="Números do clube" className="flex flex-col gap-3">
      {celular && <h2 className="font-titulo text-lg font-bold text-texto">Números do clube</h2>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador titulo="Desbravadores" valor={String(visao.dbvsAtivos)} detalhe={`${sinal(visao.variacaoTrimestre)} no trimestre`} />
        <Indicador titulo="Unidades" valor={String(visao.unidades)} detalhe="ativas no clube" />
        <Indicador titulo="Instrutores" valor={String(visao.instrutores)} detalhe={plural(visao.classesCobertas, 'classe coberta', 'classes cobertas')} />
        <Indicador titulo="Frequência do mês" valor={frequenciaMes === null ? '—' : `${frequenciaMes}%`} detalhe={frequenciaMes === null ? 'Nenhuma reunião registrada no mês' : detalheFrequencia} />
        <Indicador
          titulo="Especialidades no ano"
          valor={String(visao.especialidadesAno)}
          detalhe={`${visao.especialidadesPorDbv.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por DBV`}
        />
      </div>
    </section>
  )
}

/** `recolhido`: começa fechado atrás de um botão (no celular, para não empurrar as unidades e a atividade para longe). */
function ProgressoPorClasse({ visao, recolhido }: { visao: Visao; recolhido: boolean }) {
  const [aberto, setAberto] = useState(!recolhido)
  const idDaLista = useId()
  const total = visao.progressoClasses.length
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Progresso por classe</h2>
      {total === 0 && <p className="text-base text-texto-2">Nenhuma classe ativa no clube.</p>}
      {recolhido && total > 0 && (
        <Botao variante="secundario" largura="total" aria-expanded={aberto} aria-controls={idDaLista} onClick={() => setAberto(!aberto)}>
          {aberto ? 'Esconder o progresso' : total === 1 ? 'Ver progresso da classe' : `Ver progresso das ${total} classes`}
        </Botao>
      )}
      <ul id={idDaLista} hidden={!aberto} className="flex flex-col gap-3">
        {visao.progressoClasses.map(({ classe, media, totalDbvs, instrutores }) => (
          <li key={classe.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: `var(${classe.corToken})` }} />
              <span className="flex-1 text-base font-semibold text-texto">{classe.nome}</span>
              <span className="text-base font-bold text-texto">{media === null ? 'Sem dados' : `${media}%`}</span>
            </div>
            <BarraProgresso valor={media ?? 0} rotulo={`Progresso médio de ${classe.nome}`} />
            <span className="text-sm text-texto-2">
              {plural(totalDbvs, 'DBV', 'DBVs')} · {instrutores.length === 0 ? 'Sem instrutor' : instrutores.join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function CronogramasAguardando({ visao }: { visao: Visao }) {
  if (visao.cronogramasEnviados.length === 0) return null
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Cronogramas aguardando publicação</h2>
      <ul className="flex flex-col gap-2">
        {visao.cronogramasEnviados.map((item) => (
          <li key={item.cronogramaId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base text-texto">
              <strong>{item.classe.nome}</strong> · enviado por {item.enviadoPor} em {formatarInstante(item.enviadoEm)}
            </span>
            <Link to={caminhoDaRevisao(item.classe.id)} aria-label={`Revisar cronograma de ${item.classe.nome}`} className="text-base font-semibold text-marca underline">
              Revisar e publicar
            </Link>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function AtividadeRecente({ visao }: { visao: Visao }) {
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Atividade recente</h2>
      {visao.atividades.length === 0 && <p className="text-base text-texto-2">Nada registrado por enquanto.</p>}
      <ul className="flex flex-col gap-3">
        {visao.atividades.map((atividade) => (
          <li key={atividade.id} className="flex flex-col">
            {atividade.link ? (
              <Link to={atividade.link} className="text-base text-texto underline">
                {atividade.descricao}
              </Link>
            ) : (
              <span className="text-base text-texto">{atividade.descricao}</span>
            )}
            <span className="text-sm text-texto-2">{formatarInstante(atividade.criadaEm)}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

const NOVO_DESBRAVADOR = '/adm/desbravadores/novo'
const ESTILO_NOVO_DESBRAVADOR =
  'inline-flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura'

function NovoDesbravador({ className }: { className?: string }) {
  const estadoDeVolta = useEstadoDeVolta()
  return (
    <Link to={NOVO_DESBRAVADOR} state={estadoDeVolta} className={cn(ESTILO_NOVO_DESBRAVADOR, className)}>
      <Plus aria-hidden className="size-5" />
      Novo desbravador
    </Link>
  )
}

const caminhoDaRevisao = (classeId: string): string => `/adm/cronogramas?classe=${classeId}`

/** `limiar` ausente (configuração ainda carregando ou com erro): nenhuma unidade fica abaixo. */
function estaAbaixoDoLimiar(unidade: Visao['unidadesResumo'][number], limiar: number | undefined): limiar is number {
  return limiar !== undefined && unidade.frequenciaMes !== null && unidade.frequenciaMes < limiar
}

/** No celular, o que pede ação do Adm sobe para logo abaixo do título; sem nada pendente, a seção não existe. */
function PrecisaDeAtencao({ visao, limiar }: { visao: Visao; limiar: number | undefined }) {
  const unidadesAbaixo = visao.unidadesResumo.filter((unidade) => estaAbaixoDoLimiar(unidade, limiar))
  const total = unidadesAbaixo.length + visao.cronogramasEnviados.length
  if (total === 0) return null
  return (
    <section aria-label={`Precisa de atenção · ${total}`} className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Precisa de atenção · {total}</h2>
      <ul className="flex flex-col gap-2">
        {unidadesAbaixo.map((unidade) => (
          <li key={unidade.id}>
            <LinhaQueNavega to={`/adm/unidades/${unidade.id}`} forma="cartao">
              <span className="flex items-center gap-3">
                <TriangleAlert aria-hidden className="size-5 shrink-0 text-perigo" />
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-texto">{unidade.nome}</span>
                  <span className="text-sm text-texto-2">{`Frequência ${unidade.frequenciaMes}% · abaixo do limite de ${limiar}%`}</span>
                </span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
        {visao.cronogramasEnviados.map((item) => (
          <li key={item.cronogramaId}>
            <LinhaQueNavega to={caminhoDaRevisao(item.classe.id)} forma="cartao">
              <span className="flex items-center gap-3">
                <CalendarClock aria-hidden className="size-5 shrink-0 text-alerta" />
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-semibold text-texto">{`Cronograma de ${item.classe.nome} para publicar`}</span>
                  <span className="text-sm text-texto-2">{`Enviado por ${item.enviadoPor} em ${formatarDiaMes(item.enviadoEm)}`}</span>
                </span>
                <span className="text-base font-semibold text-marca">Revisar</span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** O leitor de tela ouve o que o cartão mostra: nome, contagem e frequência, e o aviso de que está abaixo do limite. */
function nomeDoCartaoDaUnidade(unidade: Visao['unidadesResumo'][number], abaixo: boolean): string {
  const frequencia = unidade.frequenciaMes === null ? 'sem frequência no mês' : `frequência do mês ${unidade.frequenciaMes}%`
  return `${unidade.nome} · ${plural(unidade.totalDbvs, 'DBV', 'DBVs')} · ${frequencia}${abaixo ? ', abaixo do limite' : ''}`
}

/** `limiar` ausente (configuração ainda carregando ou com erro): nenhuma unidade recebe destaque. O aviso vai em texto, não só na cor. */
function UnidadesDoClube({ visao, limiar }: { visao: Visao; limiar: number | undefined }) {
  return (
    <section aria-label="Unidades" className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Unidades</h2>
      {visao.unidadesResumo.length === 0 && <p className="text-base text-texto-2">Nenhuma unidade ativa.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visao.unidadesResumo.map((unidade) => {
          const abaixo = estaAbaixoDoLimiar(unidade, limiar)
          return (
            <LinhaQueNavega key={unidade.id} to={`/adm/unidades/${unidade.id}`} aria-label={nomeDoCartaoDaUnidade(unidade, abaixo)} forma="cartao">
              <span className="flex flex-col gap-1">
                <span className="font-titulo text-lg font-bold text-texto">{unidade.nome}</span>
                <span className="text-sm text-texto-2">{unidade.conselheiros.length === 0 ? 'Sem conselheiro' : unidade.conselheiros.join(', ')}</span>
                <span className="flex justify-between text-base text-texto">
                  <span>{plural(unidade.totalDbvs, 'DBV', 'DBVs')}</span>
                  <span className={cn('font-extrabold', abaixo && 'text-perigo')} data-abaixo-do-limiar={abaixo}>
                    {unidade.frequenciaMes === null ? '—' : `${unidade.frequenciaMes}%`}
                  </span>
                </span>
                {abaixo && (
                  <span className="flex items-center justify-end gap-1 text-sm font-semibold text-perigo">
                    <TriangleAlert aria-hidden className="size-4 shrink-0" />
                    {`abaixo de ${limiar}%`}
                  </span>
                )}
              </span>
            </LinhaQueNavega>
          )
        })}
      </div>
    </section>
  )
}

function Conteudo({ visao, celular }: { visao: Visao; celular: boolean }) {
  const configuracao = useConfiguracaoClube()
  const estadoDeVolta = useEstadoDeVolta()
  if (visao.dbvsAtivos === 0 && visao.unidadesResumo.length === 0) {
    return (
      <EstadoVazio
        titulo="O clube ainda não tem desbravadores"
        descricao="Cadastre o primeiro desbravador para ver os números do clube aqui."
        acao={
          <Link to={NOVO_DESBRAVADOR} state={estadoDeVolta} className="text-base font-semibold text-marca underline">
            Cadastrar desbravador
          </Link>
        }
      />
    )
  }
  const limiar = configuracao.data?.limiarFrequenciaAlerta
  if (celular) {
    return (
      <>
        <PrecisaDeAtencao visao={visao} limiar={limiar} />
        <Indicadores visao={visao} celular />
        <NovoDesbravador className="w-full" />
        <UnidadesDoClube visao={visao} limiar={limiar} />
        <ProgressoPorClasse visao={visao} recolhido />
        <AtividadeRecente visao={visao} />
      </>
    )
  }
  return (
    <>
      <Indicadores visao={visao} celular={false} />
      <CronogramasAguardando visao={visao} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressoPorClasse visao={visao} recolhido={false} />
        <AtividadeRecente visao={visao} />
      </div>
      <UnidadesDoClube visao={visao} limiar={limiar} />
    </>
  )
}

export function VisaoGeral() {
  const consulta = useVisaoGeral()
  const { modo } = useConexao()
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo visao={consulta.data} celular={celular} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando a visão geral" />

  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-titulo text-2xl font-bold text-texto">Visão geral do clube</h1>
        {/* No celular, com o painel carregado, o botão desce para depois dos números: o topo fica para o que precisa de atenção. */}
        {!(celular && consulta.data) && <NovoDesbravador />}
      </header>
      {corpo}
    </div>
  )
}
