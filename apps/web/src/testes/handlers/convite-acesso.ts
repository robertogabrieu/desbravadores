import { HttpResponse, http } from 'msw'
import type { ConviteAcesso, ConvitePublico, SituacaoAcesso } from '../../api/convite-acesso'
import { erroDaApi } from './auth'
import { criarSessao, criarVinculo, uuid } from './sessao'
import type { Sessao } from '../../api/cliente'

export const TOKEN_CONVITE_ACESSO = 'token-do-convite-de-acesso-com-mais-de-vinte'
export const LINK_CONVITE = `https://app.exemplo.org/acesso/${TOKEN_CONVITE_ACESSO}`

export function criarConviteAcesso(parcial: Partial<ConviteAcesso> = {}): ConviteAcesso {
  return {
    link: LINK_CONVITE,
    expiraEm: '2026-10-07T15:00:00.000Z',
    papel: 'CONSELHEIRO',
    unidades: [{ id: uuid(201), nome: 'Águias' }],
    classes: [],
    ...parcial,
  }
}

const caminho = '/api/desbravadores/:id/convite-acesso'

/** GET da situação: o estado muda quando a tela gera ou cancela, como no servidor. */
export function handlersConviteAcesso(
  inicial: SituacaoAcesso = { convite: null, conta: null },
  registro: { gerados: unknown[]; cancelados: number } = { gerados: [], cancelados: 0 },
) {
  let situacao = inicial
  return [
    http.get(caminho, () => HttpResponse.json(situacao)),
    http.post(caminho, async ({ request }) => {
      const entrada = (await request.json()) as { papel: 'CONSELHEIRO' | 'INSTRUTOR'; unidadeIds?: string[]; classeIds?: string[] }
      registro.gerados.push(entrada)
      const convite = criarConviteAcesso(
        entrada.papel === 'INSTRUTOR'
          ? { papel: 'INSTRUTOR', unidades: [], classes: [{ id: uuid(101), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' }] }
          : {},
      )
      situacao = { convite: { ...convite, link: null }, conta: null }
      return HttpResponse.json(convite, { status: 201 })
    }),
    http.delete(caminho, () => {
      registro.cancelados += 1
      situacao = { convite: null, conta: null }
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}

export function criarConvitePublico(parcial: Partial<ConvitePublico> = {}): ConvitePublico {
  return { clube: 'Clube Órion', nome: 'Paulo Henrique Souza', sexo: 'M', papel: 'CONSELHEIRO', unidades: [{ id: uuid(201), nome: 'Águias' }], classes: [], ...parcial }
}

export const handlerConvitePublico = (convite: ConvitePublico = criarConvitePublico()) =>
  http.get('/api/acesso/:token', () => HttpResponse.json(convite))

export const handlerConvitePublicoVencido = () =>
  http.get('/api/acesso/:token', () => erroDaApi(410, 'TOKEN_INVALIDO', 'Este convite não vale mais.'))

/** Aceite: com `senhaDaConta`, o e-mail já tem conta e só essa senha passa (senão 409 CONTA_EXISTENTE). */
export function handlerAceitarConviteAcesso(recebidos: unknown[] = [], senhaDaConta?: string, sessao: Sessao = criarSessao([criarVinculo('CONSELHEIRO')])) {
  return http.post('/api/acesso/:token', async ({ request }) => {
    const corpo = (await request.json()) as { email: string; senha: string }
    recebidos.push(corpo)
    if (senhaDaConta !== undefined && corpo.senha !== senhaDaConta) {
      return erroDaApi(409, 'CONTA_EXISTENTE', 'Este e-mail já tem conta.')
    }
    return HttpResponse.json(sessao)
  })
}

/** Aceite recusado pela situação da conta (convidada sem senha ou desativada): o código decide o texto da tela. */
export const handlerAceitarConviteAcessoRecusado = (status: number, codigo: string) =>
  http.post('/api/acesso/:token', () => erroDaApi(status, codigo, 'Detalhe que a tela não mostra'))
