import { AgendaPublicaSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import { ErroDaApi, erroDeResposta } from '../../api/cliente'

const MENSAGEM_DE_REDE = 'Não foi possível carregar a agenda.'

/**
 * Chamada sem sessão: o cliente do app manda `Authorization` e tenta renovar a sessão em 401, o que
 * mexeria na sessão de um pai que também usa o app. Aqui o pedido sai anônimo, sempre.
 */
export async function buscarAgendaPublica(slug: string): Promise<AgendaPublicaSaida> {
  let resposta: Response
  try {
    resposta = await fetch(`/api/agenda-publica/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
  } catch {
    throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_DE_REDE }, 'REDE')
  }
  const corpo: unknown = await resposta.json().catch(() => undefined)
  if (!resposta.ok) throw erroDeResposta(resposta.status, corpo)
  const lido = AgendaPublicaSaida.safeParse(corpo)
  // 2xx fora do contrato é dado inválido do servidor, não falta de internet: erro sem a faixa "Sem conexão".
  if (!lido.success) throw new ErroDaApi(resposta.status, { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_DE_REDE }, 'SERVIDOR')
  return lido.data
}

export const useAgendaPublica = (slug: string) =>
  useQuery({ queryKey: ['agenda-publica', slug], queryFn: () => buscarAgendaPublica(slug) })
