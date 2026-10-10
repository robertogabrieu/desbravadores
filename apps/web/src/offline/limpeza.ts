import { z } from 'zod'
import { banco } from './banco'
import { limpezaDeDados } from './estado'
import { lerUltimaIdentidade } from './identidade'
import { VALIDADE_DO_ENVIADO_MS, VALIDADE_DO_ITEM_DE_OUTRA_PESSOA_MS } from './tempos'
import type { LimparDadosDoUsuario } from './tipos'

/** Substituições que já deixaram dados neste aparelho, com o fim do envio de cada uma. */
const CHAVE_DAS_SUBSTITUICOES = 'substituicoes-locais'
const SubstituicoesLocais = z.array(z.object({ id: z.string(), fimEnvioEm: z.string() }))
export type SubstituicaoLocal = z.infer<typeof SubstituicoesLocais>[number]

function lerSubstituicoesLocais(): SubstituicaoLocal[] {
  try {
    const lidas = SubstituicoesLocais.safeParse(JSON.parse(localStorage.getItem(CHAVE_DAS_SUBSTITUICOES) ?? '[]'))
    return lidas.success ? lidas.data : []
  } catch {
    return []
  }
}

function gravarSubstituicoesLocais(lista: SubstituicaoLocal[]): void {
  try {
    localStorage.setItem(CHAVE_DAS_SUBSTITUICOES, JSON.stringify(lista))
  } catch {
    // Sem localStorage (modo privado cheio): a limpeza de abertura não acha esta substituição; a de S6 ainda vale.
  }
}

/** Anota a substituição aberta neste aparelho, para a limpeza de abertura apagá-la depois do fim do envio. */
export function registrarSubstituicaoLocal(local: SubstituicaoLocal): void {
  const outras = lerSubstituicoesLocais().filter((guardada) => guardada.id !== local.id)
  gravarSubstituicoesLocais([...outras, local])
}

/** Apaga fila, pacote e rascunhos de uma substituição (S6, CANCELADO, fim do envio): o pacote traz dados de menores. */
export async function limparDadosDaSubstituicao(substituicaoId: string): Promise<void> {
  limpezaDeDados.epoca += 1
  try {
    await banco.transaction('rw', banco.fila, banco.pacotes, banco.rascunhos, async () => {
      await banco.fila.where('[usuarioId+estado]').between([substituicaoId, ''], [substituicaoId, '\uffff']).delete()
      await banco.pacotes.where('[usuarioId+vinculoId]').between([substituicaoId, ''], [substituicaoId, '\uffff']).delete()
      await banco.rascunhos.where('[usuarioId+chave]').between([substituicaoId, ''], [substituicaoId, '\uffff']).delete()
    })
  } finally {
    limpezaDeDados.epoca += 1
  }
  gravarSubstituicoesLocais(lerSubstituicoesLocais().filter((guardada) => guardada.id !== substituicaoId))
}

/**
 * Apaga os dados das substituições cujo fim do envio já passou. `exceto` fica de fora: é o link aberto na tela,
 * que limpa os próprios dados depois de contar o que se perdeu.
 */
export async function limparSubstituicoesVencidas(agora = Date.now(), exceto: string | null = null): Promise<void> {
  const vencidas = lerSubstituicoesLocais().filter((guardada) => guardada.id !== exceto && Date.parse(guardada.fimEnvioEm) <= agora)
  for (const vencida of vencidas) await limparDadosDaSubstituicao(vencida.id)
}

/**
 * Passo 1 da abertura (SPEC §4.1): apaga ENVIADO com mais de 24 h e itens de outra pessoa com mais de 30 dias.
 * "Outra pessoa" = quem não é o dono da identidade guardada. Antes, saem os dados das substituições cujo fim do envio já passou.
 * Devolve quantos itens de outra pessoa saíram.
 */
export async function limparFilaDeAbertura(agora = Date.now()): Promise<{ descartadosDeOutraPessoa: number }> {
  await limparSubstituicoesVencidas(agora)
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
