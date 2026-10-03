import { banco } from './banco'
import { limpezaDeDados } from './estado'
import { lerUltimaIdentidade } from './identidade'
import { VALIDADE_DO_ENVIADO_MS, VALIDADE_DO_ITEM_DE_OUTRA_PESSOA_MS } from './tempos'
import type { LimparDadosDoUsuario } from './tipos'

/**
 * Passo 1 da abertura (SPEC §4.1): apaga ENVIADO com mais de 24 h e itens de outra pessoa com mais de 30 dias.
 * "Outra pessoa" = quem não é o dono da identidade guardada. Devolve quantos itens de outra pessoa saíram.
 */
export async function limparFilaDeAbertura(agora = Date.now()): Promise<{ descartadosDeOutraPessoa: number }> {
  const guardada = await lerUltimaIdentidade()
  const itens = await banco.fila.toArray()
  const enviadosVencidos = itens.filter((item) => item.estado === 'ENVIADO' && (item.enviadoEm ?? item.atualizadoEm) < agora - VALIDADE_DO_ENVIADO_MS)
  const vencidosIds = new Set(enviadosVencidos.map((item) => item.id))
  const deOutraPessoa = itens.filter(
    (item) => !vencidosIds.has(item.id) && item.usuarioId !== guardada?.usuarioId && item.criadoEm < agora - VALIDADE_DO_ITEM_DE_OUTRA_PESSOA_MS,
  )
  await banco.fila.bulkDelete([...vencidosIds, ...deOutraPessoa.map((item) => item.id)])
  return { descartadosDeOutraPessoa: deOutraPessoa.length }
}

/** Apaga do aparelho pacote, identidade e rascunhos do usuário. A fila fica: ela sobe quando a pessoa voltar. */
export const limparDadosDoUsuario: LimparDadosDoUsuario = async (usuarioId) => {
  limpezaDeDados.epoca += 1
  try {
    await banco.transaction('rw', banco.sessoes, banco.pacotes, banco.rascunhos, async () => {
      await banco.sessoes.delete(usuarioId)
      await banco.pacotes.where('[usuarioId+vinculoId]').between([usuarioId, ''], [usuarioId, '￿']).delete()
      await banco.rascunhos.where('[usuarioId+chave]').between([usuarioId, ''], [usuarioId, '￿']).delete()
    })
  } finally {
    limpezaDeDados.epoca += 1
  }
}

/** Quem perdeu o acesso durante o uso: saem a identidade (o app não reabre sem internet como ele) e os dados
 *  do clube (pacote); download em andamento não regrava (época). Ficam os rascunhos e a fila — o que a própria
 *  pessoa preencheu —, porque o papel pode voltar. */
export async function limparAoPerderOAcesso(usuarioId: string): Promise<void> {
  limpezaDeDados.epoca += 1
  try {
    await banco.transaction('rw', banco.sessoes, banco.pacotes, async () => {
      await banco.sessoes.delete(usuarioId)
      await banco.pacotes.where('[usuarioId+vinculoId]').between([usuarioId, ''], [usuarioId, '\uffff']).delete()
    })
  } finally {
    limpezaDeDados.epoca += 1
  }
}
