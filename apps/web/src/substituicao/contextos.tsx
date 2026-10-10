import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

/** Link de volta dos estados vazios da tela. */
export interface Volta {
  caminho: string
  rotulo: string
}

/** Para onde as telas de chamada e de registro da classe levam. O padrão é o app do membro. */
export interface Destinos {
  depoisDeSalvarChamada: string
  depoisDeSalvarRegistroDaClasse: string
  voltarDaChamada: Volta
  voltarDoRegistroDaClasse: Volta
  registroDaClasse: (classeId: string) => string
}

export const DESTINOS_DE_HOJE: Destinos = {
  depoisDeSalvarChamada: '/reunioes',
  depoisDeSalvarRegistroDaClasse: '/inicio',
  voltarDaChamada: { caminho: '/reunioes', rotulo: 'Voltar às reuniões' },
  voltarDoRegistroDaClasse: { caminho: '/inicio', rotulo: 'Voltar ao Início' },
  registroDaClasse: (classeId) => `/aulas/nova?classe=${classeId}`,
}

const ContextoDeDestinos = createContext<Destinos>(DESTINOS_DE_HOJE)

/** Troca só os destinos dados; o resto continua o de hoje. */
export function ProvedorDeDestinos({ destinos, children }: { destinos: Partial<Destinos>; children: ReactNode }) {
  const valor = useMemo(() => ({ ...DESTINOS_DE_HOJE, ...destinos }), [destinos])
  return <ContextoDeDestinos.Provider value={valor}>{children}</ContextoDeDestinos.Provider>
}

export const useDestinos = (): Destinos => useContext(ContextoDeDestinos)

/**
 * O que a tela não deixa escolher: a data e a unidade (chamada) ou a classe (registro da classe).
 * Sem alvo fixo (`null`, o padrão), a tela oferece os seletores de hoje.
 */
export interface AlvoFixo {
  data: string
  unidadeId?: string
  classeId?: string
}

const ContextoDeAlvoFixo = createContext<AlvoFixo | null>(null)

export function ProvedorDeAlvoFixo({ alvo, children }: { alvo: AlvoFixo; children: ReactNode }) {
  return <ContextoDeAlvoFixo.Provider value={alvo}>{children}</ContextoDeAlvoFixo.Provider>
}

export const useAlvoFixo = (): AlvoFixo | null => useContext(ContextoDeAlvoFixo)
