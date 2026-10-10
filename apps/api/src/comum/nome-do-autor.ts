import type { STATUS_USUARIO } from '@desbravadores/shared'

type StatusUsuario = (typeof STATUS_USUARIO)[number]

/**
 * Nome de quem lancou, como aparece fora do R1 (mural, "marcado por"): o usuario de substituicao,
 * criado com o nome digitado no link, leva "(substituto)"; membro aparece so com o nome.
 */
export function nomeDoAutor(autor: { nome: string; status: StatusUsuario }): string {
  return autor.status === 'SUBSTITUTO' ? `${autor.nome} (substituto)` : autor.nome
}
