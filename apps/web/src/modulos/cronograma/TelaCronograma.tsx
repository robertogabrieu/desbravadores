import { Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { useCronograma } from '../../api/cronograma'
import type { AulaDoCronograma, Cronograma } from '../../api/cronograma'
import { usePedirLiberacao } from '../../api/instrutor'
import { useClasses } from '../../api/leitura'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Chip } from '../../ui/Chip'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Esqueleto } from '../../ui/Esqueleto'
import { cn } from '../../ui/cn'
import { RegistrarAulaDeHoje } from '../aulas/RegistroSemConexao'
import { corDaClasse } from '../classes/cores'
import { formatarHorario } from './formatos'

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

type Situacao = AulaDoCronograma['situacao'] | 'EXTRA'

const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  DADA: 'Dada',
  HOJE: 'Hoje',
  PLANEJADA: 'Planejada',
  NAO_REGISTRADA: 'Sem registro',
  CONFLITO: 'Conflito',
  EXTRA: 'Fora do cronograma',
}

const ESTILO_DA_ETIQUETA: Record<Situacao, string> = {
  DADA: 'bg-marca-suave text-marca',
  HOJE: 'bg-marca text-white',
  PLANEJADA: 'bg-fundo text-texto-2',
  NAO_REGISTRADA: 'bg-alerta-fundo text-alerta',
  CONFLITO: 'bg-perigo text-white',
  EXTRA: 'bg-marca-suave text-marca',
}

const LINK_ACAO =
  'flex min-h-[var(--touch-min)] items-center justify-center rounded-botao px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

const situacaoDaAula = (aula: AulaDoCronograma): Situacao => (aula.origem === 'EXTRA' ? 'EXTRA' : aula.situacao)

function AcaoDaAula({ aula, classeId }: { aula: AulaDoCronograma; classeId: string }) {
  const registrar = aula.situacao === 'NAO_REGISTRADA' || aula.situacao === 'HOJE'
  if (registrar) {
    return (
      <Link to={`/aulas/nova?classe=${classeId}&data=${aula.data}`} className={cn(LINK_ACAO, 'bg-marca text-white hover:bg-marca-escura')}>
        Registrar
      </Link>
    )
  }
  if (aula.registroAulaId) {
    return (
      <Link to={`/aulas/${aula.registroAulaId}/editar`} className={cn(LINK_ACAO, 'border border-borda bg-superficie text-texto')}>
        Ver registro
      </Link>
    )
  }
  return null
}

function CartaoDaAula({ aula, classeId }: { aula: AulaDoCronograma; classeId: string }) {
  const situacao = situacaoDaAula(aula)
  const [, mes, dia] = aula.data.split('-')
  const detalhe = [aula.horario && formatarHorario(aula.horario), aula.local].filter(Boolean).join(' · ')
  return (
    <li className="flex gap-3">
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className={cn('flex size-12 flex-col items-center justify-center rounded-botao', aula.situacao === 'HOJE' ? 'bg-marca text-white' : 'bg-superficie text-texto')}>
          <span className="font-titulo text-lg font-extrabold leading-none">{dia}</span>
          <span className="text-[10px] font-bold">{MESES[Number(mes) - 1]}</span>
        </span>
        <span aria-hidden className="my-1 w-0.5 grow bg-borda" />
      </div>
      <article
        aria-label={`Classe de ${aula.data}`}
        className={cn(
          'mb-3 flex grow flex-col gap-2 rounded-cartao border-2 bg-superficie p-3',
          aula.situacao === 'CONFLITO' ? 'border-perigo' : aula.situacao === 'HOJE' ? 'border-marca' : 'border-superficie',
          aula.situacao === 'DADA' && 'opacity-75',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-extrabold', ESTILO_DA_ETIQUETA[situacao])}>{ROTULO_DA_SITUACAO[situacao]}</span>
          {detalhe && <span className="text-xs text-texto-2">{detalhe}</span>}
        </div>
        <span className="text-base font-bold text-texto">{aula.titulo ?? 'Classe sem título'}</span>
        {aula.requisitos.length > 0 && (
          <ul className="flex flex-col gap-1 pl-4 text-sm text-texto-2">
            {aula.requisitos.map((requisito) => (
              <li key={requisito.id} className="list-disc">
                <span className="font-semibold">{requisito.codigo}</span> · {requisito.texto}
                {requisito.campo && <span className="ml-2 rounded-full bg-acampamento-fundo px-2 py-0.5 text-xs font-bold">CAMPO</span>}
              </li>
            ))}
          </ul>
        )}
        <AcaoDaAula aula={aula} classeId={classeId} />
      </article>
    </li>
  )
}

/** Só aparece para quem não monta e ainda não tem publicação; o Adm é avisado só quando a classe é dele. */
function PedirParaMontar({ classeId }: { classeId: string }) {
  const classes = useClasses()
  const pedido = usePedirLiberacao()
  if (classes.data?.find((classe) => classe.id === classeId)?.quemMontaCronograma !== 'ADM') return null
  if (pedido.isSuccess) return <p role="status" className="text-base font-semibold text-sucesso">Pedido enviado ao Adm do clube.</p>
  return (
    <div className="flex flex-col items-center gap-2">
      <Botao carregando={pedido.isPending} onClick={() => pedido.mutate(classeId)}>
        Pedir para eu montar
      </Botao>
      {pedido.isError && (
        <p role="alert" className="text-base font-semibold text-perigo">
          {pedido.error instanceof ErroDaApi ? pedido.error.erro.mensagem : 'Não foi possível enviar o pedido. Tente de novo.'}
        </p>
      )}
    </div>
  )
}

function BotaoMontar({ classeId }: { classeId: string }) {
  return (
    <Link to={`/cronograma/montar?classe=${classeId}`} className={cn(LINK_ACAO, 'gap-2 bg-marca text-white hover:bg-marca-escura')}>
      <Plus aria-hidden className="size-5" />
      Montar cronograma
    </Link>
  )
}

function LinhaDoTempo({ dados, classeId }: { dados: Cronograma; classeId: string }) {
  if (dados.aulas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <EstadoVazio
          titulo={dados.status === null ? 'O cronograma ainda não foi publicado.' : 'Nenhuma classe neste cronograma.'}
        />
        {!dados.podeMontar && dados.status === null && <PedirParaMontar classeId={classeId} />}
      </div>
    )
  }
  return (
    <ol className="flex flex-col">
      {dados.aulas.map((aula) => (
        <CartaoDaAula key={aula.id ?? `extra-${aula.data}`} aula={aula} classeId={classeId} />
      ))}
    </ol>
  )
}

function ClasseNaoEncontrada() {
  return (
    <EstadoVazio
      titulo="Classe não encontrada"
      descricao="Essa classe não existe ou não é uma das suas."
      acao={
        <Link to="/classes" className="inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline">
          Ver minhas classes
        </Link>
      }
    />
  )
}

function CorpoDoCronograma({ classeId }: { classeId: string }) {
  const consulta = useCronograma(classeId)
  const { modo } = useConexao()
  if (consulta.data) {
    return (
      <>
        <LinhaDoTempo dados={consulta.data} classeId={classeId} />
        {consulta.data.podeMontar && <BotaoMontar classeId={classeId} />}
      </>
    )
  }
  if (consulta.error instanceof ErroDaApi && consulta.error.status === 404) return <ClasseNaoEncontrada />
  if (modo === 'SEM_CONEXAO') {
    return (
      <>
        <DisponivelComInternet />
        <RegistrarAulaDeHoje classeId={classeId} />
      </>
    )
  }
  if (consulta.isError) return <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  return (
    <Carregando rotulo="Carregando o cronograma">
      <Esqueleto className="h-28" />
      <Esqueleto className="h-28" />
      <Esqueleto className="h-28" />
    </Carregando>
  )
}

/** Cronograma (I3) em leitura: linha do tempo da classe escolhida, com as situações de cada aula. */
export function TelaCronograma() {
  const { vinculoAtivo } = useSessao()
  const [parametros, definirParametros] = useSearchParams()
  if (!vinculoAtivo) return null

  const classes = vinculoAtivo.classes
  const pedida = parametros.get('classe')
  const classeAtual = pedida ? classes.find((classe) => classe.id === pedida) : classes[0]

  let corpo
  if (classes.length === 0) corpo = <EstadoVazio titulo="Você ainda não tem classes. O Adm do clube as atribui." />
  else if (!classeAtual) corpo = <ClasseNaoEncontrada />
  else corpo = <CorpoDoCronograma classeId={classeAtual.id} />

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">Planejamento de classe</span>
        <h1 className="font-titulo text-2xl font-bold text-texto">Cronograma</h1>
      </header>
      {classes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Classe">
          {classes.map((classe) => (
            <Chip key={classe.id} selecionado={classe.id === classeAtual?.id} aoAlternar={() => definirParametros({ classe: classe.id })} className="gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={corDaClasse(classe.corToken)} />
              {classe.nome}
            </Chip>
          ))}
        </div>
      )}
      {corpo}
    </div>
  )
}
