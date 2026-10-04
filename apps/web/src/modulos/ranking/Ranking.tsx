import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ItemRanking } from '../../api/ranking'
import { useRanking, useRankingUnidades } from '../../api/ranking'
import { useConexao } from '../../offline'
import { Abas } from '../../ui/Abas'
import { Avatar } from '../../ui/Avatar'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Esqueleto } from '../../ui/Esqueleto'
import { LinhaQueNavega } from '../../ui/LinhaQueNavega'
import { NomeDaFicha } from '../../ui/LinkDeFicha'
import { Selecao } from '../../ui/Selecao'
import { cn } from '../../ui/cn'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { nomeDoMes } from '../reunioes/historico/datas'
import { classeDoAvatar } from './classeDoAvatar'

const ABAS = [{ id: 'mes', rotulo: 'Mês' }]

/** Soma `passo` meses a um `AAAA-MM`. */
function deslocarMes(mes: string, passo: number): string {
  const [ano, numero] = mes.split('-').map(Number)
  const total = ano * 12 + (numero - 1) + passo
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * Nome comprido quebra em até 2 linhas em vez de virar reticências. O nome com ícone de ficha vira
 * texto corrido para a quebra contar as linhas dele, e o ícone segue a última palavra.
 */
const QUEBRA_EM_DUAS_LINHAS = 'line-clamp-2 break-words'
const NOME_EM_TEXTO_CORRIDO = 'inline [&>svg]:ml-1.5 [&>svg]:inline [&>svg]:align-[-0.125em]'

const descricaoDoItem = (item: ItemRanking): string =>
  [item.unidade?.nome, item.classe?.nome].filter(Boolean).join(' · ')

interface PropriedadesComPerfil {
  item: ItemRanking
  /** Arranjo do conteúdo dentro do cartão (pódio em coluna, classificação em linha). */
  className: string
  children: (nome: ReactNode) => ReactNode
}

/** Cartão do participante: abre o perfil, com o ícone de ficha ao lado do nome, só quando quem pede pode abri-lo. */
function ComPerfil({ item, className, children }: PropriedadesComPerfil) {
  if (!item.abrePerfil) {
    return (
      <div className="rounded-cartao border border-borda-controle bg-superficie p-3">
        <div className={className}>{children(item.nome)}</div>
      </div>
    )
  }
  return (
    <LinhaQueNavega to={`/dbv/${item.dbvId}`} forma="cartao" sinal="ficha" className="p-3">
      <div className={className}>{children(<NomeDaFicha nome={item.nome} className={NOME_EM_TEXTO_CORRIDO} />)}</div>
    </LinhaQueNavega>
  )
}

function Podio({ itens }: { itens: ItemRanking[] }) {
  const primeiros = itens.slice(0, 3)
  const ordemVisual = [primeiros[1], primeiros[0], primeiros[2]].filter((item): item is ItemRanking => item !== undefined)
  return (
    <ol aria-label="Pódio" className="grid grid-cols-3 items-end gap-2">
      {ordemVisual.map((item) => (
        <li key={item.dbvId}>
          <ComPerfil item={item} className={cn('flex flex-col items-center gap-1 text-center', item.posicao === 1 && 'pb-3')}>
            {(nome) => (
              <>
                <Avatar nome={item.nome} classe={classeDoAvatar(item.classe?.corToken)} />
                <span className={cn('max-w-full text-sm font-semibold text-texto', QUEBRA_EM_DUAS_LINHAS)}>{nome}</span>
                <span className="font-titulo text-lg font-extrabold text-marca">{item.posicao}º</span>
                <span className="text-sm text-texto-2">{item.pontos} pts</span>
              </>
            )}
          </ComPerfil>
        </li>
      ))}
    </ol>
  )
}

function Classificacao({ itens }: { itens: ItemRanking[] }) {
  return (
    <ol aria-label="Classificação" className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item.dbvId}>
          <ComPerfil item={item} className="flex min-h-[var(--touch-min)] items-center gap-3">
            {(nome) => (
              <>
                <span className="w-6 text-center font-titulo font-bold text-texto-2">{item.posicao}</span>
                <Avatar nome={item.nome} classe={classeDoAvatar(item.classe?.corToken)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('font-semibold text-texto', QUEBRA_EM_DUAS_LINHAS)}>{nome}</span>
                  <span className={cn('text-sm text-texto-2', QUEBRA_EM_DUAS_LINHAS)}>{descricaoDoItem(item)}</span>
                </span>
                <span className="shrink-0 font-semibold text-texto">{item.pontos} pts</span>
              </>
            )}
          </ComPerfil>
        </li>
      ))}
    </ol>
  )
}

/** Ranking do mês (T1 parcial): Trimestre e Ano ainda não existem. */
export function Ranking() {
  const [mes, setMes] = useState<string>()
  const [unidadeId, setUnidadeId] = useState<string>()
  const [mesCorrente, setMesCorrente] = useState<string>()
  const consulta = useRanking(mes, unidadeId)
  const unidades = useRankingUnidades(undefined)
  const { modo } = useConexao()
  const mesExibido = consulta.data?.mes

  useEffect(() => {
    if (mes === undefined && mesExibido !== undefined) setMesCorrente(mesExibido)
  }, [mes, mesExibido])

  const opcoesDeUnidade = unidades.data?.map((linha) => linha.unidade) ?? []
  const naoPodeAvancar = mesExibido === undefined || mesCorrente === undefined || mesExibido >= mesCorrente

  let corpo: ReactNode
  if (consulta.data) {
    corpo =
      consulta.data.itens.length === 0 ? (
        <EstadoVazio titulo="Ainda não há pontos neste mês." />
      ) : (
        <>
          <Podio itens={consulta.data.itens} />
          <Classificacao itens={consulta.data.itens.slice(3)} />
        </>
      )
  } else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando o ranking">
        <Esqueleto className="h-32" />
        <Esqueleto className="h-14" />
        <Esqueleto className="h-14" />
      </Carregando>
    )

  return (
    <div className="flex flex-col gap-4 p-4 in-data-[layout=adm]:p-0">
      <h1 className="font-titulo text-2xl font-extrabold text-texto">Ranking</h1>
      <div className="flex flex-col gap-2">
        <Abas rotulo="Período" abas={ABAS} ativa="mes" aoMudar={() => undefined} />
        <div className="flex gap-2 text-sm text-texto-2">
          {['Trimestre', 'Ano'].map((periodo) => (
            <button key={periodo} type="button" disabled className="flex min-h-[var(--touch-min)] flex-1 items-center justify-center gap-2 disabled:opacity-60">
              {periodo}
              <span className="rounded-full bg-trilho px-2 py-0.5 text-xs font-semibold text-texto-3">em breve</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          disabled={mesExibido === undefined}
          onClick={() => mesExibido !== undefined && setMes(deslocarMes(mesExibido, -1))}
          className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca disabled:opacity-40"
        >
          <ChevronLeft aria-hidden className="size-6" />
        </button>
        <span className="font-semibold text-texto">{mesExibido ? nomeDoMes(mesExibido) : ''}</span>
        <button
          type="button"
          aria-label="Mês seguinte"
          disabled={naoPodeAvancar}
          onClick={() => mesExibido !== undefined && setMes(deslocarMes(mesExibido, 1))}
          className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca disabled:opacity-40"
        >
          <ChevronRight aria-hidden className="size-6" />
        </button>
      </div>

      {opcoesDeUnidade.length >= 2 && (
        <div className="sm:max-w-xs">
          <Selecao
            rotulo="Unidade"
            value={unidadeId ?? ''}
            onChange={(evento) => setUnidadeId(evento.target.value || undefined)}
          >
            <option value="">Todas as unidades</option>
            {opcoesDeUnidade.map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome}
              </option>
            ))}
          </Selecao>
        </div>
      )}

      {corpo}
    </div>
  )
}
