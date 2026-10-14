import { hojeNoFuso } from '@desbravadores/shared'
import type { ReactNode } from 'react'
import { useConfiguracaoClube } from '../../../api/clube'
import { useVisaoGeral } from '../../../api/visao-geral'
import type { VisaoGeral as Visao } from '../../../api/visao-geral'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { useConexao } from '../../../offline'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { cn } from '../../../ui/cn'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { diaDaSemanaEDoMes, MESES } from '../calendario/datas'
import { FUSO_PADRAO_DO_CLUBE } from '../formatos'
import { Atalhos } from './Atalhos'
import { Pendencias } from './Pendencias'
import { PreviaDoRanking } from './PreviaDoRanking'
import { ProximoEvento } from './ProximoEvento'

const nomeDoMes = (data: string): string => (MESES[Number(data.slice(5, 7)) - 1] ?? '').toLowerCase()

/** Computador: evento e pendências à esquerda, ranking à direita. Celular: uma coluna, na mesma ordem. */
function Conteudo({ visao, celular, hoje }: { visao: Visao; celular: boolean; hoje: string }) {
  return (
    <>
      <Atalhos visao={visao} celular={celular} />
      <div className={cn('gap-5', celular ? 'flex flex-col' : 'grid grid-cols-2 items-start')}>
        <div className="flex flex-col gap-5">
          <ProximoEvento evento={visao.proximoEvento} hoje={hoje} />
          <Pendencias visao={visao} />
        </div>
        <PreviaDoRanking mes={nomeDoMes(hoje)} />
      </div>
    </>
  )
}

export function VisaoGeral() {
  const consulta = useVisaoGeral()
  const configuracao = useConfiguracaoClube()
  const { modo } = useConexao()
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const hoje = hojeNoFuso(configuracao.data?.fuso ?? FUSO_PADRAO_DO_CLUBE, new Date())

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo visao={consulta.data} celular={celular} hoje={hoje} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando a visão geral" />

  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-titulo text-2xl font-bold text-texto">Visão geral</h1>
        <p className="text-base text-texto-2">{diaDaSemanaEDoMes(hoje)}</p>
      </header>
      {corpo}
    </div>
  )
}
