import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useConfiguracaoClube } from '../../../api/clube'
import { useVisaoGeral } from '../../../api/visao-geral'
import type { VisaoGeral as Visao } from '../../../api/visao-geral'
import { useConexao } from '../../../offline'
import { BarraProgresso } from '../../../ui/BarraProgresso'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { cn } from '../../../ui/cn'

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`
const sinal = (n: number): string => (n > 0 ? `+${n}` : String(n))
const formatarInstante = (iso: string): string => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <Cartao role="group" aria-label={titulo} className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-texto-2">{titulo}</span>
      <span className="font-titulo text-3xl font-extrabold text-texto">{valor}</span>
      <span className="text-sm text-texto-2">{detalhe}</span>
    </Cartao>
  )
}

function Indicadores({ visao }: { visao: Visao }) {
  const { frequenciaMes, variacaoFrequencia } = visao
  const detalheFrequencia =
    variacaoFrequencia === null ? 'Sem mês anterior para comparar' : `${sinal(variacaoFrequencia)} pts vs. mês anterior`
  return (
    <section aria-label="Números do clube" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Indicador titulo="Desbravadores" valor={String(visao.dbvsAtivos)} detalhe={`${sinal(visao.variacaoTrimestre)} no trimestre`} />
      <Indicador titulo="Unidades" valor={String(visao.unidades)} detalhe="ativas no clube" />
      <Indicador titulo="Instrutores" valor={String(visao.instrutores)} detalhe={plural(visao.classesCobertas, 'classe coberta', 'classes cobertas')} />
      <Indicador titulo="Frequência do mês" valor={frequenciaMes === null ? '—' : `${frequenciaMes}%`} detalhe={frequenciaMes === null ? 'Nenhuma reunião registrada no mês' : detalheFrequencia} />
      <Indicador
        titulo="Especialidades no ano"
        valor={String(visao.especialidadesAno)}
        detalhe={`${visao.especialidadesPorDbv.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por DBV`}
      />
    </section>
  )
}

function ProgressoPorClasse({ visao }: { visao: Visao }) {
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Progresso por classe</h2>
      {visao.progressoClasses.length === 0 && <p className="text-base text-texto-2">Nenhuma classe ativa no clube.</p>}
      <ul className="flex flex-col gap-3">
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
            <Link to={`/adm/cronogramas?classe=${item.classe.id}`} aria-label={`Revisar cronograma de ${item.classe.nome}`} className="text-base font-semibold text-marca underline">
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

/** `limiar` ausente (configuração ainda carregando ou com erro): nenhuma unidade recebe destaque. */
function UnidadesDoClube({ visao, limiar }: { visao: Visao; limiar: number | undefined }) {
  return (
    <section aria-label="Unidades" className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Unidades</h2>
      {visao.unidadesResumo.length === 0 && <p className="text-base text-texto-2">Nenhuma unidade ativa.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visao.unidadesResumo.map((unidade) => {
          const abaixo = limiar !== undefined && unidade.frequenciaMes !== null && unidade.frequenciaMes < limiar
          return (
            <Link key={unidade.id} to="/adm/unidades" aria-label={unidade.nome} className="block rounded-cartao focus-visible:outline-2 focus-visible:outline-marca">
              <Cartao className="flex flex-col gap-1">
                <span className="font-titulo text-lg font-bold text-texto">{unidade.nome}</span>
                <span className="text-sm text-texto-2">{unidade.conselheiros.length === 0 ? 'Sem conselheiro' : unidade.conselheiros.join(', ')}</span>
                <span className="flex justify-between text-base text-texto">
                  <span>{plural(unidade.totalDbvs, 'DBV', 'DBVs')}</span>
                  <span className={cn('font-extrabold', abaixo && 'text-perigo')} data-abaixo-do-limiar={abaixo}>
                    {unidade.frequenciaMes === null ? '—' : `${unidade.frequenciaMes}%`}
                  </span>
                </span>
              </Cartao>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Conteudo({ visao }: { visao: Visao }) {
  const configuracao = useConfiguracaoClube()
  if (visao.dbvsAtivos === 0 && visao.unidadesResumo.length === 0) {
    return (
      <EstadoVazio
        titulo="O clube ainda não tem desbravadores"
        descricao="Cadastre o primeiro desbravador para ver os números do clube aqui."
        acao={
          <Link to="/adm/desbravadores" className="text-base font-semibold text-marca underline">
            Cadastrar desbravador
          </Link>
        }
      />
    )
  }
  return (
    <>
      <Indicadores visao={visao} />
      <CronogramasAguardando visao={visao} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressoPorClasse visao={visao} />
        <AtividadeRecente visao={visao} />
      </div>
      <UnidadesDoClube visao={visao} limiar={configuracao.data?.limiarFrequenciaAlerta} />
    </>
  )
}

export function VisaoGeral() {
  const consulta = useVisaoGeral()
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo visao={consulta.data} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando a visão geral" />

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-titulo text-2xl font-bold text-texto">Visão geral do clube</h1>
        <Link to="/adm/desbravadores" className="inline-flex min-h-[var(--touch-min)] items-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura">
          <Plus aria-hidden className="size-5" />
          Novo desbravador
        </Link>
      </header>
      {corpo}
    </div>
  )
}
