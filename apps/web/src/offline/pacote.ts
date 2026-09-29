import { PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { requisitar } from '../api/cliente'
import { banco } from './banco'
import { limpezaDeDados } from './estado'
import { VALIDADE_DO_PACOTE_MS } from './tempos'

type Pacote = z.infer<typeof PacoteSaida>

/**
 * Baixa o pacote do domingo (SPEC §4.2); só regrava quando a `versao` mudou.
 * Se os dados do usuário foram limpos enquanto o download andava (sair, refresh recusado), não grava: E18.
 */
export async function baixarPacote(usuarioId: string, vinculoId: string): Promise<void> {
  const epoca = limpezaDeDados.epoca
  const novo = await requisitar('/api/sync/pacote', PacoteSaida)
  const chave: [string, string] = [usuarioId, vinculoId]
  const atual = await banco.pacotes.get(chave)
  if (epoca !== limpezaDeDados.epoca) return
  if (atual?.pacote.versao === novo.versao) {
    await banco.pacotes.update(chave, { baixadoEm: Date.now() })
    return
  }
  await banco.pacotes.put({ usuarioId, vinculoId, pacote: novo, baixadoEm: Date.now() })
}

/** Na abertura: baixa se não há pacote guardado ou ele tem mais de 15 min. Falha não derruba a abertura. */
export async function baixarPacoteSeVelho(usuarioId: string, vinculoId: string): Promise<void> {
  try {
    const atual = await banco.pacotes.get([usuarioId, vinculoId])
    if (atual && Date.now() - atual.baixadoEm < VALIDADE_DO_PACOTE_MS) return
    await baixarPacote(usuarioId, vinculoId)
  } catch {
    // Sem pacote novo o app segue com o guardado.
  }
}

/** Ao voltar a conexão: baixa sempre, sem a janela de 15 min (que vale só na abertura). Falha não derruba nada. */
export async function baixarPacoteAoVoltarConexao(usuarioId: string, vinculoId: string): Promise<void> {
  try {
    await baixarPacote(usuarioId, vinculoId)
  } catch {
    // Sem pacote novo o app segue com o guardado.
  }
}

export async function lerPacote(usuarioId: string, vinculoId: string): Promise<Pacote | null> {
  const registro = await banco.pacotes.get([usuarioId, vinculoId])
  return registro?.pacote ?? null
}
