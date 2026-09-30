import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useConexao } from '../../../offline'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'

interface Propriedades<T> {
  consulta: UseQueryResult<T>
  /** Lido por leitores de tela enquanto carrega. */
  rotuloDeCarga: string
  children: (dados: T) => ReactNode
}

/** Os estados de uma leitura: dado, sem conexão, erro e carregando (o vazio é de quem recebe o dado). */
export function CorpoDaConsulta<T>({ consulta, rotuloDeCarga, children }: Propriedades<T>) {
  const { modo } = useConexao()
  if (consulta.data !== undefined) return <>{children(consulta.data)}</>
  if (modo === 'SEM_CONEXAO') return <DisponivelComInternet />
  if (consulta.isError) return <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  return <Carregando rotulo={rotuloDeCarga} />
}
