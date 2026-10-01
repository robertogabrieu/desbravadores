import { ErroDaApi } from '../../api/cliente'

export const MENSAGEM_LOGIN_RECUSADO = 'E-mail ou senha incorretos'
export const MENSAGEM_ESQUECI = 'Se o e-mail estiver cadastrado, enviamos um link.'
export const MENSAGEM_CONVITE_VENCIDO = 'Este convite não vale mais. Peça um novo ao Adm do clube.'
export const MENSAGEM_CONTA_PENDENTE =
  'Este e-mail já recebeu um convite por e-mail e ainda não criou a senha. Use o link desse e-mail ou peça ao Adm para reenviá-lo.'
export const MENSAGEM_CONTA_INATIVA = 'Esta conta está desativada. Fale com o Adm do clube.'
export const MENSAGEM_LINK_VENCIDO = 'Este link não vale mais. Peça um novo.'

/** 410 (usado/vencido) e 400 (token cortado, recusado pelo formato) são o mesmo caso para quem usa. */
export const tokenRecusado = (erro: unknown): boolean =>
  erro instanceof ErroDaApi && (erro.status === 410 || erro.status === 400)

/** Texto do erro de uma tela de token: `textoRecusado` quando o token não vale, senão a mensagem da API. */
export function mensagemDeToken(erro: unknown, textoRecusado: string): string {
  if (tokenRecusado(erro)) return textoRecusado
  if (erro instanceof ErroDaApi) return erro.message
  return 'Não foi possível concluir agora. Tente de novo.'
}
