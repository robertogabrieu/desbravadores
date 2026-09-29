import { HttpResponse, http } from 'msw'
import type { Sessao } from '../../api/cliente'

export const TOKEN_VALIDO = 'token-de-uso-unico-com-mais-de-vinte-caracteres'

export const erroDaApi = (status: number, codigo: string, mensagem: string) =>
  HttpResponse.json({ codigo, mensagem }, { status })

/** Login aceito: devolve a sessão dada e guarda o corpo recebido em `recebidos`. */
export function handlerLogin(sessao: Sessao, recebidos: unknown[] = []) {
  return http.post('/api/auth/login', async ({ request }) => {
    recebidos.push(await request.json())
    return HttpResponse.json(sessao)
  })
}

export const handlerLoginRecusado = (status = 401, codigo = 'CREDENCIAIS') =>
  http.post('/api/auth/login', () => erroDaApi(status, codigo, 'Detalhe que a tela não mostra'))

export function handlerAceitarConvite(sessao: Sessao, recebidos: unknown[] = []) {
  return http.post('/api/auth/convite/aceitar', async ({ request }) => {
    recebidos.push(await request.json())
    return HttpResponse.json(sessao)
  })
}

/** 410: convite usado/vencido; 400: token cortado, recusado já pelo formato. */
export const handlerConviteVencido = (status = 410) =>
  http.post('/api/auth/convite/aceitar', () =>
    status === 410 ? erroDaApi(410, 'TOKEN_INVALIDO', 'Convite vencido') : erroDaApi(400, 'VALIDACAO', 'Requisição inválida.'),
  )

export function handlerEsqueci(recebidos: unknown[] = []) {
  return http.post('/api/auth/senha/esqueci', async ({ request }) => {
    recebidos.push(await request.json())
    return new HttpResponse(null, { status: 204 })
  })
}

export function handlerRedefinir(recebidos: unknown[] = []) {
  return http.post('/api/auth/senha/redefinir', async ({ request }) => {
    recebidos.push(await request.json())
    return new HttpResponse(null, { status: 204 })
  })
}

export const handlerRedefinirVencido = (status = 410) =>
  http.post('/api/auth/senha/redefinir', () =>
    status === 410 ? erroDaApi(410, 'TOKEN_INVALIDO', 'Link vencido') : erroDaApi(400, 'VALIDACAO', 'Requisição inválida.'),
  )

export const handlerEsqueciRecusado = (status: number, codigo: string, mensagem: string) =>
  http.post('/api/auth/senha/esqueci', () => erroDaApi(status, codigo, mensagem))

export const handlerEsqueciSemRede = () => http.post('/api/auth/senha/esqueci', () => HttpResponse.error())

export const handlerPapelAtivoRecusado = () =>
  http.post('/api/auth/papel-ativo', () => erroDaApi(403, 'VINCULO_INATIVO', 'Vínculo inativo'))

export function handlerPapelAtivo(sessao: Sessao, recebidos: unknown[] = []) {
  return http.post('/api/auth/papel-ativo', async ({ request }) => {
    recebidos.push(await request.json())
    return HttpResponse.json(sessao)
  })
}
