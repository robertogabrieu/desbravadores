import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { servidor } from '../testes/servidor'
import { criarSessao, criarVinculo } from '../testes/handlers/sessao'
import {
  ErroDaApi,
  configurarCliente,
  lerTokenAcesso,
  renovarSessao,
  requisitar,
  requisitarSemResposta,
} from './cliente'

const Coisa = z.object({ ok: z.boolean() })

/** /api/coisa responde 401 até receber o token "novo"; o refresh entrega esse token. */
function registrarRotaComRefresh() {
  const contagem = { refresh: 0, coisa: 0 }
  servidor.use(
    http.post('/api/auth/refresh', async () => {
      contagem.refresh += 1
      await new Promise((resolver) => setTimeout(resolver, 20))
      return HttpResponse.json({ ...criarSessao([criarVinculo('ADM')]), accessToken: 'novo' })
    }),
    http.get('/api/coisa', ({ request }) => {
      contagem.coisa += 1
      if (request.headers.get('Authorization') === 'Bearer novo') return HttpResponse.json({ ok: true })
      return HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })
    }),
  )
  return contagem
}

describe('cliente da API', () => {
  it('em 401 faz um refresh e repete a requisição uma vez', async () => {
    const contagem = registrarRotaComRefresh()

    await expect(requisitar('/api/coisa', Coisa)).resolves.toEqual({ ok: true })

    expect(contagem).toEqual({ refresh: 1, coisa: 2 })
  })

  it('dois 401 simultâneos esperam o mesmo refresh', async () => {
    const contagem = registrarRotaComRefresh()

    const resultados = await Promise.all([requisitar('/api/coisa', Coisa), requisitar('/api/coisa', Coisa)])

    expect(resultados).toEqual([{ ok: true }, { ok: true }])
    expect(contagem.refresh).toBe(1)
    expect(contagem.coisa).toBe(4)
  })

  it('não repete de novo se a repetição também dá 401, e avisa que a sessão acabou', async () => {
    let coisa = 0
    let refresh = 0
    const sessaoPerdida = vi.fn()
    configurarCliente({ aoSessaoPerdida: sessaoPerdida })
    servidor.use(
      http.post('/api/auth/refresh', () => {
        refresh += 1
        return HttpResponse.json(criarSessao([criarVinculo('ADM')]))
      }),
      http.get('/api/coisa', () => {
        coisa += 1
        return HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })
      }),
    )

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ status: 401, erro: { codigo: 'NAO_AUTENTICADO' } })

    expect({ coisa, refresh }).toEqual({ coisa: 2, refresh: 1 })
    expect(sessaoPerdida).toHaveBeenCalledTimes(1)
  })

  it('refresh recusado com 401 derruba a sessão e não repete a requisição', async () => {
    let coisa = 0
    const sessaoPerdida = vi.fn()
    configurarCliente({ aoSessaoPerdida: sessaoPerdida })
    servidor.use(
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'sem sessão' }, { status: 401 }),
      ),
      http.get('/api/coisa', () => {
        coisa += 1
        return HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })
      }),
    )

    await expect(requisitar('/api/coisa', Coisa)).rejects.toBeInstanceOf(ErroDaApi)

    expect(coisa).toBe(1)
    expect(sessaoPerdida).toHaveBeenCalledTimes(1)
  })

  it('401 de rota de autenticação (login errado) não dispara refresh', async () => {
    let refresh = 0
    servidor.use(
      http.post('/api/auth/refresh', () => {
        refresh += 1
        return HttpResponse.json(criarSessao([criarVinculo('ADM')]))
      }),
      http.post('/api/auth/login', () =>
        HttpResponse.json({ codigo: 'CREDENCIAIS', mensagem: 'E-mail ou senha incorretos' }, { status: 401 }),
      ),
    )

    await expect(requisitar('/api/auth/login', Coisa, { metodo: 'POST', corpo: {} })).rejects.toMatchObject({
      erro: { codigo: 'CREDENCIAIS' },
    })
    expect(refresh).toBe(0)
  })

  it('403 VINCULO_INATIVO leva a /papel', async () => {
    const navegar = vi.fn()
    configurarCliente({ navegar })
    servidor.use(
      http.get('/api/coisa', () =>
        HttpResponse.json({ codigo: 'VINCULO_INATIVO', mensagem: 'Vínculo desativado' }, { status: 403 }),
      ),
    )

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ status: 403, erro: { codigo: 'VINCULO_INATIVO' } })

    expect(navegar).toHaveBeenCalledWith('/papel')
  })

  it('outro 403 não navega e o erro carrega os campos', async () => {
    const navegar = vi.fn()
    configurarCliente({ navegar })
    servidor.use(
      http.get('/api/coisa', () =>
        HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Confira', campos: { nome: 'Obrigatório' } }, { status: 400 }),
      ),
    )

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ erro: { campos: { nome: 'Obrigatório' } } })
    expect(navegar).not.toHaveBeenCalled()
  })

  it('resposta sem corpo JSON vira erro genérico tipado', async () => {
    servidor.use(http.get('/api/coisa', () => new HttpResponse('<html>bad gateway</html>', { status: 502 })))

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ status: 502, erro: { codigo: 'ERRO_INTERNO' } })
  })

  it('o token de acesso fica só em memória, nunca no armazenamento do navegador', async () => {
    const gravarLocal = vi.spyOn(Storage.prototype, 'setItem')
    servidor.use(
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ ...criarSessao([criarVinculo('ADM')]), accessToken: 'segredo' }),
      ),
    )

    await renovarSessao()

    expect(lerTokenAcesso()).toBe('segredo')
    expect(gravarLocal).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    gravarLocal.mockRestore()
  })

  it('envia o token no cabeçalho e o corpo como JSON', async () => {
    let cabecalho: string | null = null
    let corpo: unknown = null
    servidor.use(
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ ...criarSessao([criarVinculo('ADM')]), accessToken: 'abc' }),
      ),
      http.post('/api/coisa', async ({ request }) => {
        cabecalho = request.headers.get('Authorization')
        corpo = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renovarSessao()

    await requisitar('/api/coisa', Coisa, { metodo: 'POST', corpo: { nome: 'x' } })

    expect(cabecalho).toBe('Bearer abc')
    expect(corpo).toEqual({ nome: 'x' })
  })

  it('sair-de-todos exige token: com o token vencido renova e repete uma vez', async () => {
    let tentativas = 0
    let refresh = 0
    servidor.use(
      http.post('/api/auth/refresh', () => {
        refresh += 1
        return HttpResponse.json({ ...criarSessao([criarVinculo('ADM')]), accessToken: 'novo' })
      }),
      http.post('/api/auth/sair-de-todos', ({ request }) => {
        tentativas += 1
        if (request.headers.get('Authorization') === 'Bearer novo') return new HttpResponse(null, { status: 204 })
        return HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })
      }),
    )

    await requisitarSemResposta('/api/auth/sair-de-todos', { metodo: 'POST' })

    expect({ tentativas, refresh }).toEqual({ tentativas: 2, refresh: 1 })
  })
})
