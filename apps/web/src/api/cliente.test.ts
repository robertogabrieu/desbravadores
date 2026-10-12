import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('@sentry/react', async (original) => ({
  ...(await original<typeof import('@sentry/react')>()),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

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

  it('refresh recusado com 403 (ErroApi) também derruba a sessão, como o 401', async () => {
    const sessaoPerdida = vi.fn()
    configurarCliente({ aoSessaoPerdida: sessaoPerdida })
    servidor.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ codigo: 'SEM_PERMISSAO', mensagem: 'negado' }, { status: 403 })),
      http.get('/api/coisa', () => HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })),
    )

    await expect(requisitar('/api/coisa', Coisa)).rejects.toBeInstanceOf(ErroDaApi)

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

  it('avisa que o servidor respondeu em qualquer 2xx, e não em falha de rede nem em 4xx', async () => {
    const aoServidorRespondeu = vi.fn()
    configurarCliente({ aoServidorRespondeu })
    servidor.use(
      http.get('/api/rede', () => HttpResponse.error()),
      http.get('/api/recusa', () => HttpResponse.json({ codigo: 'PROIBIDO', mensagem: 'não' }, { status: 403 })),
      http.get('/api/coisa', () => HttpResponse.json({ ok: true })),
    )

    await requisitar('/api/rede', Coisa).catch(() => undefined)
    await requisitar('/api/recusa', Coisa).catch(() => undefined)
    expect(aoServidorRespondeu).not.toHaveBeenCalled()

    await requisitar('/api/coisa', Coisa)
    expect(aoServidorRespondeu).toHaveBeenCalledTimes(1)
  })
})

describe('diagnóstico de falha de rede no Sentry', () => {
  // O setup global já importou o cliente com o Sentry de verdade: o módulo é recarregado para pegar o mock.
  let requisitar: typeof import('./cliente').requisitar
  let requisitarCru: typeof import('./cliente').requisitarCru
  let ErroDaApi: typeof import('./cliente').ErroDaApi
  let captureMessage: typeof import('@sentry/react').captureMessage
  const enviado = () => vi.mocked(captureMessage)
  const extra = (n = 0): Record<string, unknown> => {
    const opcoes = enviado().mock.calls[n]?.[1]
    return typeof opcoes === 'object' && opcoes !== null && 'extra' in opcoes ? (opcoes.extra as Record<string, unknown>) : {}
  }

  beforeEach(async () => {
    vi.resetModules()
    ;({ requisitar, requisitarCru, ErroDaApi } = await import('./cliente'))
    ;({ captureMessage } = await import('@sentry/react'))
  })
  afterEach(() => vi.restoreAllMocks())

  it('fetch que lança: registra origem, erro do fetch e navigator.onLine, sem query string', async () => {
    servidor.use(http.get('/api/coisa', () => HttpResponse.error()))

    await expect(requisitar('/api/coisa?busca=ana', Coisa)).rejects.toMatchObject({ classe: 'REDE', status: 0 })

    expect(enviado()).toHaveBeenCalledTimes(1)
    expect(enviado().mock.calls[0]?.[1]).toMatchObject({ level: 'warning', fingerprint: ['falha-de-rede', '/api/coisa', 'fetch-lancou'] })
    expect(extra()).toMatchObject({
      metodo: 'GET',
      caminho: '/api/coisa',
      status: 0,
      origem: 'fetch-lancou',
      erroDoFetch: { name: 'TypeError' },
      online: navigator.onLine,
    })
  })

  it('4xx sem corpo padrão e não-JSON: leva content-type e só os primeiros 200 caracteres', async () => {
    servidor.use(http.post('/api/coisa', () => new HttpResponse('<html>' + 'x'.repeat(500), { status: 403, headers: { 'Content-Type': 'text/html' } })))

    await expect(requisitar('/api/coisa', Coisa, { metodo: 'POST' })).rejects.toMatchObject({ classe: 'REDE', status: 403 })

    const dados = extra()
    expect(dados).toMatchObject({ metodo: 'POST', status: 403, origem: 'erro-sem-corpo-padrao', contentType: 'text/html' })
    expect(String(dados['corpoInicial'])).toHaveLength(200)
  })

  it('erro com corpo padrão (recusa) não é registrado', async () => {
    servidor.use(http.get('/api/coisa', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'x' }, { status: 404 })))

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ classe: 'RECUSA' })

    expect(enviado()).not.toHaveBeenCalled()
  })

  it('fora do contrato: envia caminho e código dos issues do zod, nunca o corpo', async () => {
    servidor.use(http.get('/api/coisa', () => HttpResponse.json({ itens: [{ capaUrl: 7 }], nome: 'Maria Silva' })))
    const Itens = z.object({ itens: z.array(z.object({ capaUrl: z.string() })) })

    await expect(requisitar('/api/coisa', Itens)).rejects.toMatchObject({ classe: 'REDE', status: 200 })

    const dados = extra()
    expect(dados).toMatchObject({ origem: 'fora-do-contrato', contentType: 'application/json', issues: ['itens.0.capaUrl: invalid_type'] })
    expect(dados['corpoInicial']).toBeUndefined()
    expect(JSON.stringify(enviado().mock.calls)).not.toContain('Maria')
  })

  it('fora do contrato com resposta não-JSON (requisitarCru): leva o início do corpo', async () => {
    servidor.use(http.get('/api/coisa', () => new HttpResponse('<html>portal</html>', { headers: { 'Content-Type': 'text/html' } })))

    await expect(requisitarCru('/api/coisa')).rejects.toMatchObject({ classe: 'REDE' })

    expect(extra()).toMatchObject({ origem: 'fora-do-contrato', corpoInicial: '<html>portal</html>' })
  })

  it('troca uuid e número no caminho por :id', async () => {
    servidor.use(http.get('/api/membros/:id/fotos/:foto', () => HttpResponse.error()))

    await expect(requisitar('/api/membros/0190b2c4-7d3e-7a11-9c55-1f2e3d4c5b6a/fotos/42', Coisa)).rejects.toBeInstanceOf(ErroDaApi)

    expect(extra()['caminho']).toBe('/api/membros/:id/fotos/:id')
  })

  it('envia 1 vez por caminho+origem a cada 10 minutos', async () => {
    servidor.use(http.get('/api/coisa', () => HttpResponse.error()), http.get('/api/outra', () => HttpResponse.error()))
    const agora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    await requisitar('/api/coisa', Coisa).catch(() => undefined)
    await requisitar('/api/coisa?x=1', Coisa).catch(() => undefined)
    expect(enviado()).toHaveBeenCalledTimes(1)

    await requisitar('/api/outra', Coisa).catch(() => undefined)
    expect(enviado()).toHaveBeenCalledTimes(2)

    agora.mockReturnValue(1_000_000 + 10 * 60 * 1000)
    await requisitar('/api/coisa', Coisa).catch(() => undefined)
    expect(enviado()).toHaveBeenCalledTimes(3)
  })
  it('tokens de acesso e substituição nunca aparecem na mensagem, no fingerprint nem nos extras', async () => {
    const token = 'abc_DEF-1234567890abcdefghijklmnopqrstuvwxyz'
    expect(token.length).toBeGreaterThanOrEqual(43)
    servidor.use(http.get('/api/acesso/:t', () => HttpResponse.error()), http.post('/api/auth/substituicao/:t', () => HttpResponse.error()))

    await requisitar(`/api/acesso/${token}`, Coisa).catch(() => undefined)
    await requisitar(`/api/auth/substituicao/${token}`, Coisa, { metodo: 'POST' }).catch(() => undefined)

    expect(enviado()).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(enviado().mock.calls)).not.toContain(token)
    expect(extra(0)['caminho']).toBe('/api/acesso/:token')
    expect(extra(1)['caminho']).toBe('/api/auth/substituicao/:token')
  })

  it('segmento longo de token fora das rotas conhecidas vira :token', async () => {
    const token = 'Zz9_-Zz9_-Zz9_-Zz9_-Zz9'
    servidor.use(http.get('/api/outra/:t/x', () => HttpResponse.error()))

    await requisitar(`/api/outra/${token}/x`, Coisa).catch(() => undefined)

    expect(extra()['caminho']).toBe('/api/outra/:token/x')
  })

  it('offline de verdade (navigator.onLine false) não registra fetch que lançou', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    servidor.use(http.get('/api/coisa', () => HttpResponse.error()))

    await expect(requisitar('/api/coisa', Coisa)).rejects.toMatchObject({ classe: 'REDE', status: 0 })

    expect(enviado()).not.toHaveBeenCalled()
  })

  it('issues do zod: chave de z.record com dado pessoal vira *', async () => {
    servidor.use(http.get('/api/coisa', () => HttpResponse.json({ porNome: { 'Maria Silva': 7 } })))
    const Mapa = z.object({ porNome: z.record(z.string(), z.string()) })

    await expect(requisitar('/api/coisa', Mapa)).rejects.toMatchObject({ classe: 'REDE' })

    expect(extra()['issues']).toEqual(['porNome.*: invalid_type'])
    expect(JSON.stringify(enviado().mock.calls)).not.toContain('Maria')
  })

})
