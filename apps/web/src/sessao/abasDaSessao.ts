/** Aviso entre abas do mesmo aparelho sobre a sessão: o token é por aba, o cookie de refresh é de todas. */
export interface AvisoDeSessao {
  tipo: 'PAPEL_TROCADO'
  vinculoId: string
}

const NOME_DO_CANAL = 'sessao'

let canal: BroadcastChannel | null = null

const ehAviso = (dado: unknown): dado is AvisoDeSessao =>
  typeof dado === 'object' && dado !== null && 'tipo' in dado && dado.tipo === 'PAPEL_TROCADO' && 'vinculoId' in dado && typeof dado.vinculoId === 'string'

/** Escuta as outras abas até a função devolvida ser chamada. Sem `BroadcastChannel` no navegador, não escuta nada. */
export function ouvirOutrasAbas(aoReceber: (aviso: AvisoDeSessao) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined
  const aberto = new BroadcastChannel(NOME_DO_CANAL)
  aberto.onmessage = (evento: MessageEvent<unknown>) => {
    if (ehAviso(evento.data)) aoReceber(evento.data)
  }
  canal = aberto
  return () => {
    aberto.close()
    if (canal === aberto) canal = null
  }
}

/** Esta aba trocou de papel: as outras precisam renovar a sessão antes de mandar mais nada. */
export function avisarTrocaDePapel(vinculoId: string): void {
  const aviso: AvisoDeSessao = { tipo: 'PAPEL_TROCADO', vinculoId }
  try {
    canal?.postMessage(aviso)
  } catch {
    // Canal fechado no meio de um desligamento: a outra aba se acerta na próxima renovação.
  }
}
