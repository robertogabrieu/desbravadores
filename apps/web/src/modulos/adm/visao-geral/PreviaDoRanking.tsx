import { useId } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRankingUnidades } from '../../../api/ranking'
import { Cartao } from '../../../ui/Cartao'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'

const LINHAS_DA_PREVIA = 5

const formatarPontos = (media: number): string => `${media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`

/** As cinco primeiras unidades do mês; carregando e erro ficam dentro do cartão, sem esconder o resto da tela. */
export function PreviaDoRanking({ mes }: { mes: string }) {
  const idDoTitulo = useId()
  const consulta = useRankingUnidades(undefined)

  let corpo: ReactNode
  if (consulta.data) {
    const primeiras = consulta.data.slice(0, LINHAS_DA_PREVIA)
    const semPontos = primeiras.every(({ mediaPontos }) => mediaPontos === 0)
    corpo = semPontos ? (
      <p className="text-base text-texto-2">Ainda não há pontos neste mês.</p>
    ) : (
      <ol className="flex flex-col">
        {primeiras.map(({ posicao, unidade, mediaPontos }) => (
          <li key={unidade.id} className="flex min-h-[var(--touch-min)] items-center gap-3 border-b border-divisor last:border-b-0">
            <span className="w-6 text-base font-bold text-texto-2">{posicao}</span>
            <span className="flex-1 text-base font-semibold text-texto">{unidade.nome}</span>
            <span className="text-base font-bold text-texto">{formatarPontos(mediaPontos)}</span>
          </li>
        ))}
      </ol>
    )
  } else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando o ranking" />

  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col gap-3">
      <h2 id={idDoTitulo} className="font-titulo text-lg font-bold text-texto">
        Ranking das unidades
      </h2>
      <Cartao className="flex flex-col gap-3">
        <span className="text-sm text-texto-2">{`Média de pontos por desbravador · ${mes}`}</span>
        {corpo}
        <Link to="/ranking" className="inline-flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca underline">
          Ver ranking completo
        </Link>
      </Cartao>
    </section>
  )
}
