import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { servidor } from '../testes/servidor'
import { criarEu, criarVinculo } from '../testes/handlers/sessao'
import { banco } from './banco'
import { definirConexao } from './conexao'
import { dependencias } from './dependencias'
import { enfileirar, itensDaChave, registrarTipo, useFila } from './index'
import type { ItemFila, TipoFila } from './index'
import { limparFilaDeAbertura } from './limpeza'
import { aguardarMotorPronto, iniciarMotor } from './motor'
import { tempos } from './tempos'

const USUARIO = 'usuario-1'
const VINCULO = 'vinculo-1'
const saidaOk = z.object({ ok: z.literal(true) })

interface Carga {
  valor: string
}

const tipoFalso: TipoFila<Carga, typeof saidaOk> = {
  tipo: 'FALSO',
  rotulo: (carga) => `Falso ${carga.valor}`,
  detalhe: (carga) => `detalhe ${carga.valor}`,
  fundir: (_anterior, novo) => novo,
  enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
  saida: saidaOk,
}

const respostaOk = () => HttpResponse.json({ ok: true })
const recusa = (status: number, codigo = 'REGRA') => HttpResponse.json({ codigo, mensagem: `mensagem ${status}` }, { status })

function iniciar(modo: 'ONLINE' | 'SEM_CONEXAO' = 'ONLINE') {
  definirConexao(modo)
  iniciarMotor({ usuarioId: USUARIO, vinculoId: VINCULO, queryClient: new QueryClient() })
}

const pedirCarga = (chave: string, valor = 'a', extra: { dependeDe?: string } = {}) =>
  enfileirar<Carga>({ tipo: 'FALSO', chave, payload: { valor }, ...extra })

const ler = async (id: string): Promise<ItemFila | undefined> => await banco.fila.get(id)

async function semear(parcial: Partial<ItemFila>): Promise<ItemFila> {
  const item: ItemFila = {
    id: crypto.randomUUID(),
    versaoPayload: 1,
    usuarioId: USUARIO,
    vinculoId: VINCULO,
    tipo: 'FALSO',
    chave: 'c',
    rotulo: 'r',
    detalhe: 'd',
    payload: { valor: 'a' },
    estado: 'NA_FILA',
    progresso: 0,
    tentativas: 0,
    proximaTentativaEm: null,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
    ...parcial,
  }
  await banco.fila.put(item)
  return item
}

beforeEach(() => {
  tempos.backoffMs = [1, 1, 1, 1]
  registrarTipo(tipoFalso)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fila: envio', () => {
  it('grava o item, pede storage.persist na primeira gravação e o motor envia', async () => {
    const persistir = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { value: { persist: persistir }, configurable: true })
    servidor.use(http.put('/api/falso', respostaOk))
    iniciar()

    const id = await pedirCarga('k1', 'x')

    await waitFor(async () => expect((await ler(id))?.estado).toBe('ENVIADO'))
    const item = await ler(id)
    expect(item).toMatchObject({ usuarioId: USUARIO, vinculoId: VINCULO, rotulo: 'Falso x', detalhe: 'detalhe x', progresso: 100 })
    expect(item?.enviadoEm).toBeTypeOf('number')
    expect(persistir).toHaveBeenCalledTimes(1)
  })

  it('envia um por vez, na ordem de criação', async () => {
    const ordem: string[] = []
    let emVoo = 0
    let maximo = 0
    servidor.use(
      http.put('/api/falso', async ({ request }) => {
        emVoo += 1
        maximo = Math.max(maximo, emVoo)
        ordem.push(((await request.json()) as Carga).valor)
        await new Promise((resolver) => setTimeout(resolver, 15))
        emVoo -= 1
        return respostaOk()
      }),
    )
    definirConexao('SEM_CONEXAO')
    iniciar('SEM_CONEXAO')
    const ids = [await pedirCarga('k1', 'primeiro'), await pedirCarga('k2', 'segundo'), await pedirCarga('k3', 'terceiro')]

    definirConexao('ONLINE')

    await waitFor(async () => expect((await ler(ids[2] ?? ''))?.estado).toBe('ENVIADO'))
    expect(ordem).toEqual(['primeiro', 'segundo', 'terceiro'])
    expect(maximo).toBe(1)
  })

  it('substituição por chave: mesma chave funde no mesmo item e volta a NA_FILA', async () => {
    registrarTipo<Carga, typeof saidaOk>({ ...tipoFalso, fundir: (anterior, novo) => ({ valor: `${anterior.valor}+${novo.valor}` }) })
    iniciar('SEM_CONEXAO')

    const primeiro = await pedirCarga('mesma', 'a')
    await banco.fila.update(primeiro, { estado: 'ERRO', erro: { codigo: 'REGRA', mensagem: 'x' }, tentativas: 3 })
    const segundo = await pedirCarga('mesma', 'b')

    expect(segundo).toBe(primeiro)
    expect(await banco.fila.count()).toBe(1)
    expect(await ler(primeiro)).toMatchObject({ estado: 'NA_FILA', tentativas: 0, payload: { valor: 'a+b' }, rotulo: 'Falso a+b' })
    expect((await ler(primeiro))?.erro).toBeUndefined()
  })

  it('chave em ENVIANDO: cria outro item, que só roda depois', async () => {
    iniciar('SEM_CONEXAO')
    await aguardarMotorPronto()
    const primeiro = await semear({ chave: 'mesma', estado: 'ENVIANDO' })

    const segundo = await pedirCarga('mesma', 'novo')

    expect(segundo).not.toBe(primeiro.id)
    expect(await banco.fila.count()).toBe(2)
    expect((await itensDaChave('mesma')).map((i) => i.estado)).toEqual(['ENVIANDO', 'NA_FILA'])
  })

  it('ENVIANDO preso volta a NA_FILA ao pegar a trava e é enviado', async () => {
    const preso = await semear({ estado: 'ENVIANDO' })
    servidor.use(http.put('/api/falso', respostaOk))

    iniciar()

    await waitFor(async () => expect((await ler(preso.id))?.estado).toBe('ENVIADO'))
  })

  it('depois do sucesso roda aoEnviar com a saída e acesso aos seguintes da chave', async () => {
    const vistos: string[] = []
    registrarTipo<Carga, typeof saidaOk>({
      ...tipoFalso,
      aoEnviar: async (saida, ctx) => {
        const seguintes = await ctx.seguintesDaChave()
        vistos.push(`${String(saida.ok)}:${seguintes.length}`)
        for (const seguinte of seguintes) await ctx.atualizarPayload(seguinte.id, { valor: 'atualizado' })
      },
    })
    servidor.use(http.put('/api/falso', respostaOk))
    iniciar('SEM_CONEXAO')
    const primeiro = await pedirCarga('mesma', 'a')
    const seguinte = await semear({ chave: 'mesma', criadoEm: Date.now() + 10, estado: 'ERRO' })

    definirConexao('ONLINE')

    await waitFor(async () => expect((await ler(primeiro))?.estado).toBe('ENVIADO'))
    expect(vistos).toEqual(['true:1'])
    await waitFor(async () => expect((await ler(seguinte.id))?.payload).toEqual({ valor: 'atualizado' }))
  })
})

describe('fila: falhas', () => {
  it('200 fora do contrato não conta como envio: continua na fila com espera', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return HttpResponse.json({ ok: false })
      }),
    )
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(() => expect(chamadas).toBeGreaterThanOrEqual(3))
    const item = await ler(id)
    expect(item?.estado === 'NA_FILA' || item?.estado === 'ENVIANDO').toBe(true)
    expect(item?.enviadoEm).toBeUndefined()
  })

  it('rede sem limite: passa de 10 tentativas e continua na fila', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return HttpResponse.error()
      }),
    )
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(() => expect(chamadas).toBeGreaterThanOrEqual(12), { timeout: 4000 })
    expect((await ler(id))?.estado).not.toBe('ERRO')
  })

  it('backoff usa a escala configurada: 5 s, 15 s, 60 s, 5 min', async () => {
    tempos.backoffMs = [5000, 15000, 60000, 300000]
    servidor.use(http.put('/api/falso', () => HttpResponse.error()))
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(async () => expect((await ler(id))?.tentativas).toBe(1))
    const item = await ler(id)
    expect(item?.estado).toBe('NA_FILA')
    expect((item?.proximaTentativaEm ?? 0) - Date.now()).toBeGreaterThan(3000)
  })

  it('5xx vira ERRO na 10ª tentativa', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return recusa(503, 'ERRO_INTERNO')
      }),
    )
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(async () => expect((await ler(id))?.estado).toBe('ERRO'), { timeout: 4000 })
    expect(chamadas).toBe(10)
    expect((await ler(id))?.tentativas).toBe(10)
  })

  it('429 também tem o limite de 10', async () => {
    tempos.backoffMs = [40]
    servidor.use(http.put('/api/falso', () => recusa(429)))
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(async () => expect((await ler(id))?.tentativas).toBeGreaterThanOrEqual(2))
    expect((await ler(id))?.estado).not.toBe('ERRO')
  })

  it('outro 4xx vira ERRO com a mensagem da API, sem repetir', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return recusa(422, 'REGRA')
      }),
    )
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(async () => expect((await ler(id))?.estado).toBe('ERRO'))
    expect((await ler(id))?.erro).toEqual({ codigo: 'REGRA', mensagem: 'mensagem 422' })
    expect(chamadas).toBe(1)
  })

  it('4xx com HTML de portal é rede: fica na fila, não vira ERRO', async () => {
    servidor.use(http.put('/api/falso', () => new HttpResponse('<html>portal</html>', { status: 403, headers: { 'Content-Type': 'text/html' } })))
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(async () => expect((await ler(id))?.tentativas).toBeGreaterThanOrEqual(2))
    expect((await ler(id))?.estado).not.toBe('ERRO')
  })

  it('401: tenta um refresh, falhando pausa o motor com o aviso e não insiste', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return recusa(401, 'NAO_AUTENTICADO')
      }),
      http.post('/api/auth/refresh', () => recusa(401, 'NAO_AUTENTICADO')),
    )
    const { result } = renderHook(() => useFila())
    iniciar()

    const id = await pedirCarga('k')

    await waitFor(() => expect(result.current.avisos.pausadaPorSessao).toBe(true))
    expect((await ler(id))?.estado).toBe('NA_FILA')
    await new Promise((resolver) => setTimeout(resolver, 30))
    expect(chamadas).toBe(1)
  })

  it('"Tentar de novo" devolve o ERRO à fila e zera as tentativas', async () => {
    servidor.use(http.put('/api/falso', () => recusa(422)))
    const { result } = renderHook(() => useFila())
    iniciar()
    const id = await pedirCarga('k')
    await waitFor(async () => expect((await ler(id))?.estado).toBe('ERRO'))
    servidor.use(http.put('/api/falso', respostaOk))

    await waitFor(() => expect(result.current.contagem.erros).toBe(1))
    await result.current.tentarDeNovo(id)

    await waitFor(async () => expect((await ler(id))?.estado).toBe('ENVIADO'))
  })
})

describe('fila: dependência e descarte', () => {
  it('dependente espera, mostra o motivo e não é enviado enquanto a dependência não está ENVIADA', async () => {
    let chamadas = 0
    servidor.use(
      http.put('/api/falso', () => {
        chamadas += 1
        return recusa(422)
      }),
    )
    const { result } = renderHook(() => useFila())
    iniciar()
    const pai = await pedirCarga('pai')
    const filho = await pedirCarga('filho', 'f', { dependeDe: 'pai' })

    await waitFor(async () => expect((await ler(pai))?.estado).toBe('ERRO'))
    await new Promise((resolver) => setTimeout(resolver, 30))

    expect(chamadas).toBe(1)
    expect((await ler(filho))?.estado).toBe('NA_FILA')
    await waitFor(() => expect(result.current.itens.find((i) => i.id === filho)?.esperandoDependencia).toBe(true))
    expect(result.current.itens.find((i) => i.id === pai)?.esperandoDependencia).toBe(false)
    expect(result.current.dependentes(pai).map((i) => i.id)).toEqual([filho])
  })

  it('descartar com dependentes: apaga o item e marca os dependentes ERRO "A chamada foi descartada"', async () => {
    const { result } = renderHook(() => useFila())
    iniciar('SEM_CONEXAO')
    const pai = await pedirCarga('pai')
    const filho = await pedirCarga('filho', 'f', { dependeDe: 'pai' })
    await waitFor(() => expect(result.current.itens).toHaveLength(2))

    await result.current.descartar(pai)

    expect(await ler(pai)).toBeUndefined()
    expect((await ler(filho))?.estado).toBe('ERRO')
    expect((await ler(filho))?.erro?.mensagem).toBe('A chamada foi descartada')
    await waitFor(() => expect(result.current.contagem).toEqual({ pendentes: 0, erros: 1 }))
  })
})

describe('fila: fusão de chamada (tipo que imita REUNIAO)', () => {
  interface Linha {
    dbvId: string
    marca: string
  }
  interface Chamada {
    envioId: string
    linhas: Linha[]
    cabecalho?: { horario: string }
  }
  const saida = z.object({ ok: z.literal(true) })
  const tipoChamada: TipoFila<Chamada, typeof saida> = {
    tipo: 'CHAMADA_FALSA',
    rotulo: () => 'Chamada',
    detalhe: (chamada) => `${chamada.linhas.length} membros`,
    fundir: (anterior, novo) => {
      const porDbv = new Map(anterior.linhas.map((linha) => [linha.dbvId, linha]))
      for (const linha of novo.linhas) porDbv.set(linha.dbvId, linha)
      return { envioId: novo.envioId, linhas: [...porDbv.values()], cabecalho: novo.cabecalho ?? anterior.cabecalho }
    },
    enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
    saida,
  }

  it('correção sobre chamada nova ainda não enviada mantém todos os membros e o horário', async () => {
    registrarTipo(tipoChamada)
    iniciar('SEM_CONEXAO')
    const chave = 'unidade-1:2030-01-06'

    const id = await enfileirar<Chamada>({
      tipo: 'CHAMADA_FALSA',
      chave,
      payload: {
        envioId: 'envio-1',
        linhas: [
          { dbvId: 'a', marca: 'PRESENTE' },
          { dbvId: 'b', marca: 'PRESENTE' },
          { dbvId: 'c', marca: 'FALTA' },
        ],
        cabecalho: { horario: '09:30' },
      },
    })
    const segundoId = await enfileirar<Chamada>({ tipo: 'CHAMADA_FALSA', chave, payload: { envioId: 'envio-2', linhas: [{ dbvId: 'b', marca: 'FALTA' }] } })

    expect(segundoId).toBe(id)
    expect((await ler(id))?.payload).toEqual({
      envioId: 'envio-2',
      linhas: [
        { dbvId: 'a', marca: 'PRESENTE' },
        { dbvId: 'b', marca: 'FALTA' },
        { dbvId: 'c', marca: 'FALTA' },
      ],
      cabecalho: { horario: '09:30' },
    })
  })
})

describe('fila: arquivo por XHR', () => {
  it('reporta progresso ao item e à chamada do tipo, e envia o multipart', async () => {
    const progressos: number[] = []
    const enviados: Array<{ metodo: string; url: string; campos: string[] }> = []
    class XhrFalso {
      upload: { onprogress: ((evento: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      ontimeout: (() => void) | null = null
      status = 0
      responseText = ''
      private metodo = ''
      private url = ''
      open(metodo: string, url: string) {
        this.metodo = metodo
        this.url = url
      }
      setRequestHeader() {}
      send(corpo: FormData) {
        enviados.push({ metodo: this.metodo, url: this.url, campos: [...corpo.keys()] })
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
        this.status = 200
        this.responseText = JSON.stringify({ ok: true })
        this.onload?.()
      }
    }
    vi.spyOn(dependencias, 'criarXhr').mockImplementation(() => new XhrFalso() as unknown as XMLHttpRequest)
    registrarTipo<Carga, typeof saidaOk>({
      ...tipoFalso,
      tipo: 'ARQUIVO_FALSO',
      enviar: (_item, ctx) =>
        ctx.enviarArquivo(
          '/api/arquivo',
          { metodo: 'POST', campos: { dados: '{}' }, campoArquivo: 'arquivo', arquivo: new Blob(['x']), nomeArquivo: 'x.jpg' },
          (percentual) => progressos.push(percentual),
        ),
    })
    iniciar()

    const id = await enfileirar<Carga>({ tipo: 'ARQUIVO_FALSO', chave: 'foto:1', payload: { valor: 'f' } })

    await waitFor(async () => expect((await ler(id))?.estado).toBe('ENVIADO'))
    expect(progressos).toContain(50)
    expect(enviados).toEqual([{ metodo: 'POST', url: '/api/arquivo', campos: ['dados', 'arquivo'] }])
  })
})

describe('limpeza da abertura', () => {
  const HORA = 3_600_000
  const DIA = 24 * HORA

  it('apaga ENVIADO com mais de 24 h e itens de outra pessoa com mais de 30 dias, e conta os descartados', async () => {
    const agora = Date.now()
    const dono = criarEu([criarVinculo('ADM')])
    await banco.sessoes.put({ usuarioId: dono.usuario.id, eu: dono, ultimoContatoEm: agora })
    const enviadoAntigo = await semear({ estado: 'ENVIADO', enviadoEm: agora - 25 * HORA })
    const enviadoRecente = await semear({ estado: 'ENVIADO', enviadoEm: agora - 2 * HORA })
    const outroAntigo = await semear({ usuarioId: 'outro', criadoEm: agora - 31 * DIA })
    const outroRecente = await semear({ usuarioId: 'outro', criadoEm: agora - 5 * DIA })
    const meuAntigo = await semear({ usuarioId: dono.usuario.id, criadoEm: agora - 40 * DIA })

    const resultado = await limparFilaDeAbertura(agora)

    expect(resultado.descartadosDeOutraPessoa).toBe(1)
    const restantes = (await banco.fila.toArray()).map((i) => i.id).sort()
    expect(restantes).toEqual([enviadoRecente.id, outroRecente.id, meuAntigo.id].sort())
    expect(restantes).not.toContain(enviadoAntigo.id)
    expect(restantes).not.toContain(outroAntigo.id)
  })
})
