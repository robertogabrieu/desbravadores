import type { ChamadaCBEnvio, PacoteClasseBiblica } from '@desbravadores/shared'
import type { z } from 'zod'
import type { ChamadaCB } from '../../../api/classe-biblica'

type PacoteCB = z.infer<typeof PacoteClasseBiblica>
export type EnvioCB = z.infer<typeof ChamadaCBEnvio>

export interface Marca {
  presente: boolean
  participou: boolean
}
export type Marcas = Record<string, Marca>

export interface Totais {
  presentes: number
  faltas: number
  participaram: number
}

/**
 * A chamada como o aparelho a tem: cada desbravador na unidade em que estava na data
 * (`inicio <= data` e `fim` nulo ou depois dela), com o que já foi gravado por cima.
 * O pacote não traz o início da edição, então "Entrou nas … em" só vem da leitura da API.
 */
export function chamadaDoPacote(pacote: PacoteCB, encontroId: string, grupoId: string): ChamadaCB | null {
  const encontro = pacote.encontros.find((e) => e.id === encontroId)
  const grupo = pacote.grupos.find((g) => g.id === grupoId && g.encontroIds.includes(encontroId))
  if (!encontro || !grupo) return null
  const gravadas = new Map(pacote.presencas.filter((p) => p.encontroId === encontroId).map((p) => [p.dbvId, p]))
  const naData = (membro: { inicio: string; fim: string | null }) =>
    membro.inicio <= encontro.data && (membro.fim === null || membro.fim > encontro.data)
  const unidades = grupo.unidades.map((unidade) => ({
    id: unidade.id,
    nome: unidade.nome,
    desbravadores: unidade.membros.filter(naData).map((membro) => {
      const gravada = gravadas.get(membro.dbvId)
      return {
        dbvId: membro.dbvId,
        nome: membro.nome,
        entrouEm: null,
        presente: gravada?.presente ?? true,
        participou: gravada?.participou ?? false,
        versao: gravada?.versao ?? null,
      }
    }),
  }))
  // Unidade sem ninguém na data (os membros dela valem em outro encontro) sai da lista; se todas ficam vazias,
  // continuam todas, para o aviso de grupo vazio dizer quais eram.
  const comAlguem = unidades.filter((unidade) => unidade.desbravadores.length > 0)
  return {
    encontro,
    grupo: { id: grupo.id, nome: grupo.nome },
    unidades: comAlguem.length > 0 ? comAlguem : unidades,
    registrada: pacote.chamadasRegistradas.some((c) => c.encontroId === encontroId && c.grupoId === grupoId),
  }
}

/** Sem linha gravada, todos começam presentes; com linha, vale a gravada (corrigir é marcar de novo). */
export function marcasIniciais(chamada: ChamadaCB): Marcas {
  const marcas: Marcas = {}
  for (const unidade of chamada.unidades) {
    for (const dbv of unidade.desbravadores) marcas[dbv.dbvId] = { presente: dbv.presente, participou: dbv.presente && dbv.participou }
  }
  return marcas
}

/** As linhas guardadas na fila, da mais antiga para a mais nova, por cima da base; quem não está na lista fica fora. */
export function aplicarFila(base: Marcas, filas: EnvioCB['linhas'][]): Marcas {
  const marcas = { ...base }
  for (const linhas of filas) {
    for (const linha of linhas) {
      if (linha.dbvId in marcas) marcas[linha.dbvId] = { presente: linha.presente, participou: linha.presente && linha.participou }
    }
  }
  return marcas
}

/** Quem passa a faltar perde a participação: ela só vale para presente. */
export function alternarPresenca(marcas: Marcas, dbvId: string): Marcas {
  const atual = marcas[dbvId]
  if (!atual) return marcas
  return { ...marcas, [dbvId]: { presente: !atual.presente, participou: false } }
}

export function alternarParticipacao(marcas: Marcas, dbvId: string): Marcas {
  const atual = marcas[dbvId]
  if (!atual?.presente) return marcas
  return { ...marcas, [dbvId]: { ...atual, participou: !atual.participou } }
}

export function totais(marcas: Marcas): Totais {
  const lista = Object.values(marcas)
  const presentes = lista.filter((m) => m.presente).length
  return { presentes, faltas: lista.length - presentes, participaram: lista.filter((m) => m.presente && m.participou).length }
}

const contar = (quantidade: number, singular: string, plural: string): string => `${quantidade} ${quantidade === 1 ? singular : plural}`

function partesDosTotais({ presentes, faltas, participaram }: Totais): [string, string, string] {
  return [
    contar(presentes, 'presente', 'presentes'),
    contar(faltas, 'falta', 'faltas'),
    `${participaram} ${participaram === 1 ? 'participou' : 'participaram'} ativamente`,
  ]
}

/** "29 presentes · 2 faltas · 4 participaram ativamente" */
export function textoDosTotais(t: Totais): string {
  return partesDosTotais(t).join(' · ')
}

/** "29 presentes, 2 faltas e 4 participaram ativamente" */
export function fraseDosTotais(t: Totais): string {
  const [presentes, faltas, participaram] = partesDosTotais(t)
  return `${presentes}, ${faltas} e ${participaram}`
}

export function montarEnvio(chamada: ChamadaCB, marcas: Marcas, envioId: string): EnvioCB {
  const linhas = chamada.unidades.flatMap((unidade) =>
    unidade.desbravadores.map((dbv) => {
      const marca = marcas[dbv.dbvId] ?? { presente: true, participou: false }
      return { dbvId: dbv.dbvId, presente: marca.presente, participou: marca.presente && marca.participou, versaoVista: dbv.versao }
    }),
  )
  return { envioId, linhas }
}
