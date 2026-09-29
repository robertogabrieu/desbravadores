/** Aviso entre abas do mesmo aparelho (SPEC §4.3): só uma tem o motor; as outras precisam vê-lo trabalhar e acordá-lo. */
export interface AvisoDeAba {
  /** A aba dona da trava deve acordar o motor. */
  acordar: boolean
  /** "Tentar enviar agora": uma passada mesmo em modo sem conexão. */
  forcar: boolean
}

const NOME_DO_CANAL = 'fila'

let canal: BroadcastChannel | null = null

const ehAviso = (dado: unknown): dado is AvisoDeAba =>
  typeof dado === 'object' && dado !== null && 'acordar' in dado && 'forcar' in dado

/** Abre o canal e escuta as outras abas até `desligarAbas`; só avisa enquanto ligado. Sem `BroadcastChannel` no navegador, não escuta nada. */
export function ligarAbas(aoReceber: (aviso: AvisoDeAba) => void): void {
  if (typeof BroadcastChannel === 'undefined') return
  canal ??= new BroadcastChannel(NOME_DO_CANAL)
  canal.onmessage = (evento: MessageEvent<unknown>) => {
    if (ehAviso(evento.data)) aoReceber(evento.data)
  }
}

export function desligarAbas(): void {
  canal?.close()
  canal = null
}

export function avisarOutrasAbas(aviso: Partial<AvisoDeAba> = {}): void {
  try {
    canal?.postMessage({ acordar: false, forcar: false, ...aviso })
  } catch {
    // Canal fechado no meio de um desligamento: a outra aba relê na próxima mudança.
  }
}
