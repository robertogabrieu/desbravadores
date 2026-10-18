import { guardarSenhaDoConvite, lerAparelho, recusaDoConviteVale } from './aparelho'
import { aparelhoPermitePasskey } from './navegador'

export const ROTA_DO_CONVITE = '/digital/convite'

/** Aparelho que entende passkey, ainda sem a marca e sem um "Agora não" recente. */
export const deveOferecerPasskey = (): boolean =>
  aparelhoPermitePasskey() && !lerAparelho().passkey && !recusaDoConviteVale()

/**
 * Para onde ir logo depois de uma senha digitada (login ou aceite de convite de acesso): ao convite, que
 * leva a senha em memória, ou direto à raiz. Login por passkey nunca passa por aqui.
 */
export function destinoAposSenha(senha: string): string {
  if (!deveOferecerPasskey()) return '/'
  guardarSenhaDoConvite(senha)
  return ROTA_DO_CONVITE
}
