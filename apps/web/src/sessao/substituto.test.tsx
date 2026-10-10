import { Entrada } from '@desbravadores/shared'
import * as Sentry from '@sentry/react'
import type { ErrorEvent } from '@sentry/react'
import { act, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { RouteObject } from 'react-router-dom'
import { requisitar } from '../api/cliente'
import { enfileirar, registrarTipo, useConexao } from '../offline'
import type { ItemFila, TipoFila } from '../offline'
import { banco } from '../offline/banco'
import { gravarIdentidade, lerUltimaIdentidade } from '../offline/identidade'
import { tempos } from '../offline/tempos'
import { agoraDoServidor, reiniciarRelogio } from '../substituicao/relogio'
import { criarEu, criarVinculo, uuid } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { servidor } from '../testes/servidor'
import { ProvedorSessaoSubstituto, useSubstituicao } from './ProvedorSessaoSubstituto'
import { useSessao } from './useSessao'

/** O cliente já foi carregado pelo setup antes de qualquer `vi.mock`: o Sentry de verdade, com o envio cortado no `beforeSend`. */
function ouvirSentry(): ErrorEvent[] {
  const eventos: ErrorEvent[] = []
  Sentry.init({
    dsn: 'https://chave@o0.ingest.sentry.io/0',
    defaultIntegrations: false,
    beforeSend: (evento) => {
      eventos.push(evento)
      return null
    },
  })
  return eventos
}

const TOKEN = 'token-do-link'
const ENDERECO = `/substituto/${TOKEN}`
const SUBSTITUICAO = uuid(950)
const UNIDADE = uuid(30)
const CLUBE = uuid(900)
const AGORA_DO_SERVIDOR = '2026-10-11T13:00:00.000Z'

function criarEntrada(parcial: Partial<z.infer<typeof Entrada>['identidade']> = {}): z.infer<typeof Entrada> {
  return {
    credencial: 'credencial-da-substituicao',
    segredo: 'segredo-do-aparelho',
    identidade: {
      substituicaoId: SUBSTITUICAO,
      nome: 'Carlos Lima',
      tipo: 'CHAMADA',
      alvoId: UNIDADE,
      alvoNome: 'Unidade Águia',
      clubeId: CLUBE,
      data: '2026-10-11',
      fimEm: '2026-10-11T15:00:00.000Z',
      fimEnvioEm: '2026-10-12T03:00:00.000Z',
      ...parcial,
    },
    agora: AGORA_DO_SERVIDOR,
  }
}

const linkAberto = () => ({
  estado: 'ABERTO',
  tipo: 'CHAMADA',
  alvo: { nome: 'Unidade Águia' },
  data: '2026-10-11',
  inicioEm: '2026-10-11T12:00:00.000Z',
  fimEm: '2026-10-11T15:00:00.000Z',
  fimEnvioEm: '2026-10-12T03:00:00.000Z',
  agora: AGORA_DO_SERVIDOR,
  conta: null,
  identificado: true,
})

interface Contagem {
  refresh: number
  eu: number
}

/** Refresh e /api/eu respondem como a conta do membro, mas contam: na rota do substituto ninguém pode chamá-los. */
function handlersDaContaQueContam(contagem: Contagem) {
  const vinculo = criarVinculo('CONSELHEIRO', 1)
  return [
    http.post('/api/auth/refresh', () => {
      contagem.refresh += 1
      return HttpResponse.json({ accessToken: 'token-do-membro', expiraEm: '2030-01-01T00:00:00.000Z', vinculoAtivoId: vinculo.id, vinculos: [vinculo] })
    }),
    http.get('/api/eu', () => {
      contagem.eu += 1
      return HttpResponse.json(criarEu([vinculo]))
    }),
  ]
}

function Sonda() {
  const sessao = useSessao()
  const substituicao = useSubstituicao()
  const { modo } = useConexao()
  return (
    <dl>
      <dd data-testid="situacao">{sessao.situacao}</dd>
      <dd data-testid="usuario">{sessao.eu?.usuario.id}</dd>
      <dd data-testid="nome">{sessao.eu?.usuario.nome}</dd>
      <dd data-testid="vinculo-do-eu">{sessao.eu?.vinculoAtivo?.id}</dd>
      <dd data-testid="vinculo-do-topo">{sessao.vinculoAtivo?.id}</dd>
      <dd data-testid="papel">{sessao.papel}</dd>
      <dd data-testid="clube">{sessao.vinculoAtivo?.clube.id}</dd>
      <dd data-testid="unidades">{sessao.vinculoAtivo?.unidades.map((u) => `${u.id}:${u.nome}`).join(',')}</dd>
      <dd data-testid="classes">{sessao.vinculoAtivo?.classes.map((c) => `${c.id}:${c.nome}`).join(',')}</dd>
      <dd data-testid="marca-requisito">{String(sessao.pode('requisito.marcar'))}</dd>
      <dd data-testid="encerrada">{String(substituicao?.encerrada)}</dd>
      <dd data-testid="conexao">{modo}</dd>
    </dl>
  )
}

function SondaDoPai() {
  const { situacao } = useSessao()
  return <p data-testid="situacao-do-pai">{situacao}</p>
}

const rotasDoSubstituto = (entrada = criarEntrada()): RouteObject[] => [
  {
    path: '/substituto/:token',
    element: (
      <>
        <SondaDoPai />
        <ProvedorSessaoSubstituto entrada={entrada} token={TOKEN}>
          <Sonda />
        </ProvedorSessaoSubstituto>
      </>
    ),
  },
]

const montarSubstituto = (entrada = criarEntrada()) => renderizarRotas(rotasDoSubstituto(entrada), ENDERECO, { enderecoDoNavegador: ENDERECO })

const saidaOk = z.object({ ok: z.literal(true) })
const tipoFalso: TipoFila<{ valor: string }, typeof saidaOk> = {
  tipo: 'FALSO',
  rotulo: (carga) => `Falso ${carga.valor}`,
  detalhe: (carga) => carga.valor,
  fundir: (_anterior, novo) => novo,
  enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
  saida: saidaOk,
}

beforeEach(() => {
  tempos.backoffMs = [1, 1, 1, 1]
  tempos.recuperacaoMs = 60_000
  registrarTipo(tipoFalso)
})

afterEach(async () => {
  await Sentry.close()
  window.history.pushState({}, '', '/')
  reiniciarRelogio()
  vi.restoreAllMocks()
})

describe('ProvedorSessao na rota do substituto', () => {
  it('fica anônimo e não chama refresh nem /api/eu', async () => {
    const contagem: Contagem = { refresh: 0, eu: 0 }
    servidor.use(...handlersDaContaQueContam(contagem))
    montarSubstituto()
    expect(await screen.findByTestId('situacao')).toHaveTextContent('autenticada')
    expect(screen.getByTestId('situacao-do-pai')).toHaveTextContent('anonima')
    // Dá tempo a qualquer efeito de boot que tivesse escapado.
    await act(async () => await new Promise((resolver) => setTimeout(resolver, 50)))
    expect(contagem).toEqual({ refresh: 0, eu: 0 })
  })

  it('fora da rota do substituto segue abrindo a sessão normalmente', async () => {
    const contagem: Contagem = { refresh: 0, eu: 0 }
    servidor.use(...handlersDaContaQueContam(contagem))
    renderizarRotas([{ path: '/', element: <SondaDoPai /> }], '/')
    await waitFor(() => expect(screen.getByTestId('situacao-do-pai')).toHaveTextContent('autenticada'))
    expect(contagem.refresh).toBe(1)
    expect(contagem.eu).toBe(1)
  })
})

describe('ProvedorSessaoSubstituto: a sessão sintética', () => {
  it('link de unidade: eu e vínculo com o id da substituição, papel de conselheiro, vínculo também no topo', async () => {
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))
    expect(screen.getByTestId('usuario')).toHaveTextContent(SUBSTITUICAO)
    expect(screen.getByTestId('nome')).toHaveTextContent('Carlos Lima')
    expect(screen.getByTestId('vinculo-do-eu')).toHaveTextContent(SUBSTITUICAO)
    expect(screen.getByTestId('vinculo-do-topo')).toHaveTextContent(SUBSTITUICAO)
    expect(screen.getByTestId('papel')).toHaveTextContent('CONSELHEIRO')
    expect(screen.getByTestId('clube')).toHaveTextContent(CLUBE)
    expect(screen.getByTestId('unidades')).toHaveTextContent(`${UNIDADE}:Unidade Águia`)
    expect(screen.getByTestId('classes')).toBeEmptyDOMElement()
    expect(screen.getByTestId('marca-requisito')).toHaveTextContent('false')
  })

  it('link de classe: papel de instrutor, a classe do link e as permissões padrão do instrutor', async () => {
    const classe = uuid(40)
    montarSubstituto(criarEntrada({ tipo: 'CLASSE', alvoId: classe, alvoNome: 'Amigo' }))
    await waitFor(() => expect(screen.getByTestId('papel')).toHaveTextContent('INSTRUTOR'))
    expect(screen.getByTestId('classes')).toHaveTextContent(`${classe}:Amigo`)
    expect(screen.getByTestId('unidades')).toBeEmptyDOMElement()
    expect(screen.getByTestId('marca-requisito')).toHaveTextContent('true')
  })
})

describe('critério 9: a conta do membro no aparelho fica como estava', () => {
  it('identidade, papel ativo, papéis, fila e dados da conta seguem iguais, sem gravar a identidade da substituição', async () => {
    const vinculos = [criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]
    const euDoMembro = criarEu(vinculos, vinculos[1]?.id)
    await gravarIdentidade(euDoMembro, Date.now())
    const itemDoMembro: ItemFila = {
      id: crypto.randomUUID(),
      versaoPayload: 1,
      usuarioId: euDoMembro.usuario.id,
      vinculoId: vinculos[1]?.id ?? '',
      tipo: 'FALSO',
      chave: 'do-membro',
      rotulo: 'r',
      detalhe: 'd',
      payload: { valor: 'membro' },
      estado: 'NA_FILA',
      progresso: 0,
      tentativas: 0,
      proximaTentativaEm: null,
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    }
    await banco.fila.put(itemDoMembro)
    await banco.rascunhos.put({ usuarioId: euDoMembro.usuario.id, chave: 'rascunho-do-membro', valor: { a: 1 }, atualizadoEm: Date.now() })

    const contagem: Contagem = { refresh: 0, eu: 0 }
    const enviados: unknown[] = []
    servidor.use(
      ...handlersDaContaQueContam(contagem),
      http.put('/api/falso', async ({ request }) => {
        enviados.push(await request.json())
        return HttpResponse.json({ ok: true })
      }),
    )
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))
    await act(async () => {
      await enfileirar({ tipo: 'FALSO', chave: 'do-substituto', payload: { valor: 'substituto' } })
    })
    await waitFor(() => expect(enviados).toEqual([{ valor: 'substituto' }]))

    const guardada = await lerUltimaIdentidade()
    expect(guardada?.usuarioId).toBe(euDoMembro.usuario.id)
    expect(guardada?.eu.vinculoAtivo?.id).toBe(vinculos[1]?.id)
    expect(guardada?.eu.vinculos).toEqual(vinculos)
    expect(await banco.sessoes.get(SUBSTITUICAO)).toBeUndefined()
    expect(await banco.fila.get(itemDoMembro.id)).toEqual(itemDoMembro)
    expect(await banco.rascunhos.get([euDoMembro.usuario.id, 'rascunho-do-membro'])).toBeDefined()
    const doSubstituto = await banco.fila.where('chave').equals('do-substituto').first()
    expect(doSubstituto).toMatchObject({ usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO })
    expect(contagem).toEqual({ refresh: 0, eu: 0 })
  })
})

describe('critério 14: offline guarda na fila e sobe ao voltar a conexão, sem recarregar', () => {
  it('falha de rede vira sem conexão; a volta é confirmada sondando o link e o item sobe com a credencial', async () => {
    let rede = false
    const autorizacoes: (string | null)[] = []
    let sondagens = 0
    servidor.use(
      http.put('/api/falso', ({ request }) => {
        if (!rede) return HttpResponse.error()
        autorizacoes.push(request.headers.get('Authorization'))
        return HttpResponse.json({ ok: true })
      }),
      http.get(`/api/auth/substituicao/${TOKEN}`, () => {
        sondagens += 1
        return HttpResponse.json(linkAberto())
      }),
    )
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))

    let id = ''
    await act(async () => {
      id = await enfileirar({ tipo: 'FALSO', chave: 'chamada-1', payload: { valor: 'x' } })
    })
    await waitFor(() => expect(screen.getByTestId('conexao')).toHaveTextContent('SEM_CONEXAO'))
    expect((await banco.fila.get(id))?.estado).toBe('NA_FILA')

    rede = true
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(screen.getByTestId('conexao')).toHaveTextContent('ONLINE'))
    await waitFor(async () => expect((await banco.fila.get(id))?.estado).toBe('ENVIADO'))
    expect(sondagens).toBeGreaterThan(0)
    expect(autorizacoes).toEqual(['Bearer credencial-da-substituicao'])
  })

  it('o evento offline do navegador já vale como sem conexão', async () => {
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('conexao')).toHaveTextContent('ONLINE'))
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('conexao')).toHaveTextContent('SEM_CONEXAO')
  })
})

describe('respostas 401 no modo substituição', () => {
  it('NAO_AUTENTICADO é defeito: não encerra, não chama o refresh e vai ao Sentry como erro', async () => {
    const contagem: Contagem = { refresh: 0, eu: 0 }
    servidor.use(
      ...handlersDaContaQueContam(contagem),
      http.get('/api/fora-da-tabela', () => HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sem sessão' }, { status: 401 })),
    )
    const eventos = ouvirSentry()
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))
    await act(async () => {
      await expect(requisitar('/api/fora-da-tabela', z.unknown())).rejects.toMatchObject({ status: 401 })
    })
    expect(contagem.refresh).toBe(0)
    expect(screen.getByTestId('encerrada')).toHaveTextContent('false')
    await waitFor(() => expect(eventos).toHaveLength(1))
    expect(eventos[0]?.level).toBe('error')
  })

  it('SUBSTITUICAO_ENCERRADA leva ao estado encerrado, sem refresh', async () => {
    const contagem: Contagem = { refresh: 0, eu: 0 }
    servidor.use(
      ...handlersDaContaQueContam(contagem),
      http.get('/api/reunioes/x', () => HttpResponse.json({ codigo: 'SUBSTITUICAO_ENCERRADA', mensagem: 'Encerrado' }, { status: 401 })),
    )
    const eventos = ouvirSentry()
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('encerrada')).toHaveTextContent('false'))
    await act(async () => {
      await expect(requisitar('/api/reunioes/x', z.unknown())).rejects.toMatchObject({ status: 401 })
    })
    expect(screen.getByTestId('encerrada')).toHaveTextContent('true')
    expect(contagem.refresh).toBe(0)
    expect(eventos).toEqual([])
  })

  it('as rotas públicas do link não chamam o refresh nem fora do modo substituição', async () => {
    const contagem: Contagem = { refresh: 0, eu: 0 }
    servidor.use(
      ...handlersDaContaQueContam(contagem),
      http.get(`/api/auth/substituicao/${TOKEN}`, () => HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'x' }, { status: 401 })),
    )
    await expect(requisitar(`/api/auth/substituicao/${TOKEN}`, z.unknown())).rejects.toMatchObject({ status: 401 })
    expect(contagem.refresh).toBe(0)
  })
})

describe('critério 15 (provedor): a substituição fica registrada para a limpeza de abertura', () => {
  it('guarda o id e o fim do envio no aparelho', async () => {
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))
    const guardadas: unknown = JSON.parse(localStorage.getItem('substituicoes-locais') ?? '[]')
    expect(guardadas).toEqual([{ id: SUBSTITUICAO, fimEnvioEm: '2026-10-12T03:00:00.000Z' }])
  })
})

describe('critério 16: relógio do aparelho adiantado em 2 horas', () => {
  it('o agora do servidor vem da Entrada, não do relógio do aparelho', async () => {
    const servidorMs = Date.parse(AGORA_DO_SERVIDOR)
    vi.spyOn(Date, 'now').mockReturnValue(servidorMs + 2 * 60 * 60 * 1000)
    montarSubstituto()
    await waitFor(() => expect(screen.getByTestId('situacao')).toHaveTextContent('autenticada'))
    expect(agoraDoServidor()).toBe(servidorMs)
  })
})
