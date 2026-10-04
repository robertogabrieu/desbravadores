import { hojeNoFuso } from '@desbravadores/shared'
import { Check, ChevronDown, Circle } from 'lucide-react'
import { useState } from 'react'
import { ErroDaApi } from '../../api/cliente'
import type { ProgressoDbv } from '../../api/progresso'
import { useDesmarcarRequisito, useMarcarRequisito, useProgressoDbv } from '../../api/progresso'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { CampoData } from '../../ui/CampoData'
import { Cartao } from '../../ui/Cartao'
import { Confirmacao } from '../../ui/Confirmacao'
import { Esqueleto } from '../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { cn } from '../../ui/cn'

type Matricula = ProgressoDbv['matriculas'][number]
type Secao = Matricula['secoes'][number]
type Requisito = Secao['requisitos'][number]

const hojeLocal = (): string => hojeNoFuso(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date())

/** "2030-09-27" vira "27/09/2030". */
const formatarData = (data: string): string => data.split('-').reverse().join('/')

function mensagemDoErro(erro: unknown): string {
  return erro instanceof ErroDaApi ? erro.erro.mensagem : 'Não foi possível concluir agora. Tente de novo.'
}

const RAIO = 34
const CIRCUNFERENCIA = 2 * Math.PI * RAIO

function Anel({ percentual, rotulo, tamanho, className }: { percentual: number; rotulo: string; tamanho: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 84 84" role="img" aria-label={rotulo} className={className}>
      <circle cx="42" cy="42" r={RAIO} fill="none" strokeWidth="10" className="stroke-marca-suave" />
      <circle
        cx="42"
        cy="42"
        r={RAIO}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(CIRCUNFERENCIA * percentual) / 100} ${CIRCUNFERENCIA}`}
        transform="rotate(-90 42 42)"
        className="stroke-marca"
      />
      <text x="42" y="48" textAnchor="middle" fontSize="20" fontWeight="800" className="fill-texto">
        {percentual}%
      </text>
    </svg>
  )
}

interface DaLinha {
  requisito: Requisito
  dbvId: string
  minimo: string
  compacta: boolean
}

/** Círculo de 44px no início da linha da versão compacta: botão quando pode marcar, só ícone quando não pode. */
function CirculoDoRequisito({ concluido, codigo, podeMarcar, aoTocar }: { concluido: boolean; codigo: string; podeMarcar: boolean; aoTocar: () => void }) {
  const icone = concluido ? (
    <span className="flex size-7 items-center justify-center rounded-full bg-sucesso text-white">
      <Check aria-hidden className="size-4" strokeWidth={3} />
    </span>
  ) : (
    <span className="size-7 rounded-full border-2 border-texto-3" />
  )
  if (!podeMarcar)
    return (
      <span aria-hidden className="flex size-[var(--touch-min)] shrink-0 items-center justify-center">
        {icone}
      </span>
    )
  return (
    <button
      type="button"
      onClick={aoTocar}
      aria-label={concluido ? `Desmarcar ${codigo}` : `Marcar ${codigo} como feito`}
      className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-marca"
    >
      {icone}
    </button>
  )
}

function LinhaDoRequisito({ requisito, dbvId, minimo, compacta }: DaLinha) {
  const marcar = useMarcarRequisito()
  const desmarcar = useDesmarcarRequisito()
  const [marcando, setMarcando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [data, setData] = useState(hojeLocal)
  const [erro, setErro] = useState<string | null>(null)
  const concluido = requisito.concluidoEm !== null

  const confirmarMarcacao = () => {
    setErro(null)
    marcar.mutate(
      { dbvId, requisitoId: requisito.id, concluidoEm: data },
      { onSuccess: () => setMarcando(false), onError: (e) => setErro(mensagemDoErro(e)) },
    )
  }

  const confirmarDesmarcacao = () => {
    setErro(null)
    setConfirmando(false)
    desmarcar.mutate({ dbvId, requisitoId: requisito.id }, { onError: (e) => setErro(mensagemDoErro(e)) })
  }

  return (
    <li className="flex flex-col gap-2 border-t border-borda py-3 first:border-t-0">
      <div className={cn('flex gap-3', compacta ? 'items-center' : 'items-start')}>
        {compacta ? (
          <CirculoDoRequisito
            concluido={concluido}
            codigo={requisito.codigo}
            podeMarcar={requisito.podeMarcar}
            aoTocar={() => (concluido ? setConfirmando(true) : setMarcando(true))}
          />
        ) : concluido ? (
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-sucesso" />
        ) : (
          <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-texto-3" />
        )}
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-base text-texto">
            <span className="font-semibold">{requisito.codigo}</span> {requisito.texto}
          </span>
          <span className="text-sm text-texto-2">{concluido ? `Concluído em ${formatarData(requisito.concluidoEm ?? '')}` : 'Ainda não concluído'}</span>
        </div>
      </div>

      {requisito.podeMarcar && !compacta && !marcando && (
        <div className="pl-8">
          {concluido ? (
            <Botao variante="secundario" onClick={() => setConfirmando(true)} aria-label={`Desmarcar ${requisito.codigo}`}>
              Desmarcar
            </Botao>
          ) : (
            <Botao onClick={() => setMarcando(true)} aria-label={`Marcar ${requisito.codigo}`}>
              Marcar como feito
            </Botao>
          )}
        </div>
      )}

      {marcando && (
        <div className={cn('flex flex-col gap-2', compacta ? 'pl-14' : 'pl-8')}>
          <CampoData rotulo="Data de conclusão" value={data} min={minimo} max={hojeLocal()} onChange={(e) => setData(e.target.value)} />
          <div className="flex gap-2">
            <Botao onClick={confirmarMarcacao} carregando={marcar.isPending} disabled={data === ''}>
              Confirmar
            </Botao>
            <Botao variante="secundario" onClick={() => setMarcando(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className={cn('text-sm font-medium text-perigo', compacta ? 'pl-14' : 'pl-8')}>
          {erro}
        </p>
      )}

      <Confirmacao
        aberta={confirmando}
        titulo="Desmarcar requisito?"
        rotuloConfirmar="Desmarcar"
        perigo
        aoConfirmar={confirmarDesmarcacao}
        aoCancelar={() => setConfirmando(false)}
      >
        O requisito {requisito.codigo} volta a ficar pendente e os pontos dele são estornados.
      </Confirmacao>
    </li>
  )
}

function SecaoDoCaderno({ secao, dbvId, minimo, abertaDeInicio, compacta }: { secao: Secao; dbvId: string; minimo: string; abertaDeInicio: boolean; compacta: boolean }) {
  const [aberta, setAberta] = useState(abertaDeInicio)
  const completa = secao.total > 0 && secao.concluidos >= secao.total
  const percentual = secao.total === 0 ? 0 : Math.round((secao.concluidos / secao.total) * 100)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta(!aberta)}
        className="flex min-h-[var(--touch-min)] w-full flex-col gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-marca"
      >
        <span className="flex w-full items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-texto">{secao.nome}</span>
          <span className="flex items-center gap-2 text-texto-2">
            {compacta ? `${secao.concluidos} de ${secao.total}` : `${secao.concluidos}/${secao.total}`}
            {!compacta && <span className="font-semibold text-marca">{aberta ? 'Esconder requisitos' : 'Ver requisitos'}</span>}
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', aberta && 'rotate-180')} />
          </span>
        </span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-suave">
          <span data-testid={`barra-${secao.codigo}`} data-completa={completa} className={cn('block h-full rounded-full', completa ? 'bg-sucesso' : 'bg-texto-3')} style={{ width: `${percentual}%` }} />
        </span>
      </button>
      {aberta && (
        <ul aria-label={`Requisitos de ${secao.nome}`} className="flex flex-col">
          {secao.requisitos.map((requisito) => (
            <LinhaDoRequisito key={requisito.id} requisito={requisito} dbvId={dbvId} minimo={minimo} compacta={compacta} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Conteudo({ progresso, dbvId, compacta }: { progresso: ProgressoDbv; dbvId: string; compacta: boolean }) {
  const regular = progresso.matriculas.find((m) => m.classe.tipo === 'REGULAR')
  const avancada = progresso.matriculas.find((m) => m.classe.tipo === 'AVANCADA')
  const principal = regular ?? avancada
  if (!principal) return <EstadoVazio titulo="Sem classe neste ano" descricao="Quando houver matrícula, o progresso aparece aqui." />

  const pronto = regular !== undefined && regular.percentual >= 100
  const primeiraIncompleta = principal.secoes.find((secao) => secao.concluidos < secao.total)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Anel percentual={principal.percentual} tamanho={84} rotulo={`${principal.percentual}% da classe ${principal.classe.nome} concluída`} />
        <div className="flex flex-col gap-1">
          <h2 className="font-titulo text-lg font-bold text-texto">Classe {principal.classe.nome}</h2>
          <span className="text-sm text-texto-2">
            {principal.concluidos} de {principal.total} requisitos concluídos
          </span>
          {pronto && <span className="w-fit rounded-full bg-sucesso px-3 py-1 text-sm font-bold text-white">Pronto para investidura</span>}
        </div>
      </div>

      {regular && avancada && (
        <div className="flex items-center gap-3">
          <Anel percentual={avancada.percentual} tamanho={52} rotulo={`${avancada.percentual}% da avançada ${avancada.classe.nome} concluída`} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-texto">Avançada recomendada</span>
            <span className="text-sm text-texto-2">{avancada.classe.nome}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {principal.secoes.map((secao) => (
          <SecaoDoCaderno
            key={secao.codigo}
            secao={secao}
            dbvId={dbvId}
            minimo={`${principal.anoClube}-01-01`}
            abertaDeInicio={secao.codigo === primeiraIncompleta?.codigo}
            compacta={compacta}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Progresso do DBV no perfil (F7/F8/F12): não é offline — sem conexão, só esta seção pede internet.
 * `compacta` é a versão da ficha do Adm no celular: marca e desmarca pelo círculo de 44px no início da linha e conta as seções como "c de t".
 */
export function SecaoProgresso({ dbvId, compacta = false }: { dbvId: string; compacta?: boolean }) {
  const consulta = useProgressoDbv(dbvId)
  const { modo } = useConexao()

  let corpo
  if (consulta.data) corpo = <Conteudo progresso={consulta.data} dbvId={dbvId} compacta={compacta} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando o progresso">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-10" />
      </Carregando>
    )

  return <Cartao>{corpo}</Cartao>
}
