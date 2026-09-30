import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErroDaApi } from '../../api/cliente'
import { useConexao } from '../../offline'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../inicio/estados'

interface PropriedadesEstado {
  consulta: UseQueryResult<unknown, Error>
  rotuloCarga: string
}

/** O que a tela mostra enquanto não há dado: sem conexão, erro (rede vira "Disponível quando houver internet") ou carregando. */
export function EstadoDaConsulta({ consulta, rotuloCarga }: PropriedadesEstado) {
  const { modo } = useConexao()
  if (modo === 'SEM_CONEXAO') return <DisponivelComInternet />
  if (consulta.isError) {
    if (consulta.error instanceof ErroDaApi && consulta.error.classe === 'REDE') return <DisponivelComInternet />
    return <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  }
  return <Carregando rotulo={rotuloCarga} />
}

interface Propriedades<T> extends PropriedadesEstado {
  consulta: UseQueryResult<T, Error>
  children: (dados: T) => ReactNode
}

/** Dado guardado da consulta, ou o estado que explica por que ainda não há. */
export function ResultadoConsulta<T>({ consulta, rotuloCarga, children }: Propriedades<T>) {
  if (consulta.data !== undefined) return <>{children(consulta.data)}</>
  return <EstadoDaConsulta consulta={consulta} rotuloCarga={rotuloCarga} />
}
