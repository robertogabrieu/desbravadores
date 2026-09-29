import { useSyncExternalStore } from 'react'
import type { ModoConexao, ModoSessao, UseConexao, UseModoSessao } from './tipos'

interface Estado {
  conexao: ModoConexao
  expirada: boolean
}

let estado: Estado = { conexao: 'ONLINE', expirada: false }
const ouvintes = new Set<() => void>()

const emitir = (): void => {
  for (const ouvinte of ouvintes) ouvinte()
}

const assinar = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export const assinarConexao = assinar
export const lerConexao = (): ModoConexao => estado.conexao

export function definirConexao(conexao: ModoConexao): void {
  if (estado.conexao === conexao) return
  estado = { ...estado, conexao }
  emitir()
}

export function definirExpirada(expirada: boolean): void {
  if (estado.expirada === expirada) return
  estado = { ...estado, expirada }
  emitir()
}

export function reiniciarConexao(): void {
  estado = { conexao: 'ONLINE', expirada: false }
  emitir()
}

/** Decidido pela última resposta real da API (o provedor da sessão atualiza), nunca só por `navigator.onLine`. */
export const useConexao: UseConexao = () => {
  const modo = useSyncExternalStore(assinar, () => estado.conexao)
  return { modo }
}

export const useModoSessao: UseModoSessao = (): ModoSessao => {
  const snapshot = useSyncExternalStore(assinar, () => estado)
  return snapshot.expirada ? 'EXPIRADA' : snapshot.conexao
}
