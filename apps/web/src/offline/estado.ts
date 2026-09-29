import type { QueryClient } from '@tanstack/react-query'

export interface SessaoMotor {
  usuarioId: string
  vinculoId: string
  queryClient: QueryClient
}

/** Estado compartilhado entre o motor, a fila e a visão da tela. */
export const estadoOffline: {
  sessao: SessaoMotor | null
  pausadaPorSessao: boolean
  descartadosDeOutraPessoa: number
  /** "Tentar enviar agora": uma passada mesmo em modo sem conexão. */
  forcarPassada: boolean
} = { sessao: null, pausadaPorSessao: false, descartadosDeOutraPessoa: 0, forcarPassada: false }

/** Sobe a cada limpeza de dados do usuário: quem começou um download antes dela não pode gravar depois (E18). */
export const limpezaDeDados = { epoca: 0 }

let pendente = false
let despertar: (() => void) | null = null

/** Acorda o motor; se ele estiver ocupado, a próxima espera termina na hora. */
export function acordarMotor(): void {
  pendente = true
  despertar?.()
}

export function consumirSinal(): void {
  pendente = false
}

/** Espera até `ate` (epoch ms) ou até alguém acordar o motor. `null` = só acorda por sinal. */
export function dormir(ate: number | null): Promise<void> {
  if (pendente) return Promise.resolve()
  return new Promise<void>((resolver) => {
    const temporizador = ate === null ? undefined : setTimeout(terminar, Math.max(0, ate - Date.now()))
    function terminar() {
      clearTimeout(temporizador)
      despertar = null
      resolver()
    }
    despertar = terminar
  })
}

export function reiniciarEstado(): void {
  estadoOffline.sessao = null
  estadoOffline.pausadaPorSessao = false
  estadoOffline.descartadosDeOutraPessoa = 0
  estadoOffline.forcarPassada = false
  pendente = false
  despertar?.()
}
