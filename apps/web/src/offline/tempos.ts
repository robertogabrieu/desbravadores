/** Tempos do motor offline. Objeto mutável só para os testes encurtarem as esperas. */
const PADRAO = {
  /** Espera entre tentativas de um item que falhou por rede/servidor: 5 s, 15 s, 60 s, 5 min. */
  backoffMs: [5_000, 15_000, 60_000, 300_000],
  /** Segunda tentativa do refresh na abertura (a tolerância de 30 s do refresh da Fase 0 vale). */
  novaTentativaAberturaMs: 5_000,
  /** Intervalo de nova tentativa de refresh em modo sem conexão, com a aba visível. */
  recuperacaoMs: 30_000,
}

export const tempos = { ...PADRAO }

export const restaurarTempos = (): void => {
  Object.assign(tempos, { ...PADRAO, backoffMs: [...PADRAO.backoffMs] })
}

export const MAXIMO_DE_TENTATIVAS_SERVIDOR = 10
export const VALIDADE_DO_MODO_SEM_CONEXAO_MS = 7 * 24 * 3_600_000
export const VALIDADE_DO_PACOTE_MS = 15 * 60_000
export const VALIDADE_DO_ENVIADO_MS = 24 * 3_600_000
export const VALIDADE_DO_ITEM_DE_OUTRA_PESSOA_MS = 30 * 24 * 3_600_000
export const LIMITE_DE_ESPACO_BYTES = 100 * 1024 * 1024
