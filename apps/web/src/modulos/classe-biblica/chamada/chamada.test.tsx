import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { HttpResponse, http } from 'msw'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chavesClasseBiblica } from '../../../api/classe-biblica'
import type { ItemFila, ModoConexao, PacoteGuardado } from '../../../offline'
import type { PayloadChamadaCB } from '../../../offline/tipos/classe-biblica'
import { ContextoDaSessao } from '../../../sessao/useSessao'
import type { ContextoSessao } from '../../../sessao/useSessao'
import {
  EDICAO_CB_ID,
  ENCONTRO_CB_ID,
  GRUPO_DANIEL_ID,
  GRUPO_ESTER_ID,
  UNIDADES_CB,
  criarChamadaCB,
  criarPacoteClasseBiblica,
  handlersClasseBiblica,
} from '../../../testes/handlers/classe-biblica'
import { criarPacote } from '../../../testes/handlers/offline'
import { servidor } from '../../../testes/servidor'
import { TelaChamadaCB } from './TelaChamadaCB'

const estado = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
  itens: [] as ItemFila[],
  ouvintes: new Set<() => void>(),
  enfileirar: vi.fn<(entrada: { tipo: string; chave: string; payload: unknown }) => Promise<string>>(() => Promise.resolve('id')),
  aviso: { success: vi.fn(), warning: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: estado.aviso }))
vi.mock('../../../offline', () => ({
  useConexao: () => ({
    modo: useSyncExternalStore(
      (ouvinte) => {
        estado.ouvintes.add(ouvinte)
        return () => estado.ouvintes.delete(ouvinte)
      },
      () => estado.modo,
    ),
  }),
  usePacote: () => estado.pacote,
  enfileirar: estado.enfileirar,
  itensDaChave: () => Promise.resolve(estado.itens),
  registrarTipo: vi.fn(),
}))

const ROTA_ADM = `/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_DANIEL_ID}/chamada`
const ROTA_CONSELHEIRO = `/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_DANIEL_ID}/chamada`

function guardar(classeBiblica = criarPacoteClasseBiblica()) {
  estado.pacote = { pacote: criarPacote({ classeBiblica }), carregando: false, baixadoEm: Date.now() }
}

function montar(rota = ROTA_ADM, permissoes = ['classebiblica.chamada', 'classebiblica.gerenciar'], consultas = novoCliente()) {
  const sessao = { situacao: 'autenticada', pode: (p: string) => permissoes.includes(p) } as unknown as ContextoSessao
  const roteador = createMemoryRouter(
    [
      { path: '/adm/classe-biblica/encontros/:id/grupos/:grupoId/chamada', element: <TelaChamadaCB /> },
      { path: '/classe-biblica/encontros/:id/grupos/:grupoId/chamada', element: <TelaChamadaCB /> },
      { path: '/adm/classe-biblica/:id', element: <p>Painel da edição</p> },
      { path: '/inicio', element: <p>Início</p> },
    ],
    { initialEntries: [rota] },
  )
  const Envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={consultas}>
      <ContextoDaSessao.Provider value={sessao}>{children}</ContextoDaSessao.Provider>
    </QueryClientProvider>
  )
  render(<RouterProvider router={roteador} />, { wrapper: Envoltorio })
  return roteador
}

function novoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** A chamada do fixture com Enzo já gravado como falta. */
function chamadaComEnzoFaltando() {
  const chamada = criarChamadaCB()
  return {
    ...chamada,
    unidades: chamada.unidades.map((unidade) => ({
      ...unidade,
      desbravadores: unidade.desbravadores.map((dbv) =>
        dbv.nome === 'Enzo Barros' ? { ...dbv, presente: false, versao: '2026-10-11T15:00:00.000Z' } : dbv,
      ),
    })),
  }
}

const linha = (nome: string) => within(screen.getByRole('listitem', { name: nome }))
const tocarNome = (nome: string) => userEvent.click(linha(nome).getByRole('button', { name: new RegExp(nome) }))
const participou = (nome: string) => linha(nome).getByRole('button', { name: /Participou ativamente/ })
const rodape = () => within(screen.getByRole('region', { name: 'Salvar a chamada' }))
const ultimoPayload = () => estado.enfileirar.mock.calls.at(-1)?.[0] as { tipo: string; chave: string; payload: PayloadChamadaCB }

beforeEach(() => {
  estado.modo = 'ONLINE'
  estado.itens = []
  estado.enfileirar.mockClear()
  estado.aviso.success.mockClear()
  guardar()
  servidor.use(...handlersClasseBiblica())
})

describe('Chamada com conexão', () => {
  it('lista por unidade, todos presentes, Noah com a data em que entrou; só a primeira unidade aberta', async () => {
    montar()
    expect(await screen.findByText('Grupo Daniel · domingo 11/10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chamada da Classe Bíblica' })).toBeInTheDocument()
    expect(screen.getByText('Cada desbravador aparece na unidade em que estava em 11/10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Águias · 10' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Leões · 10' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Gaviões · 11' })).toHaveAttribute('aria-expanded', 'false')
    expect(linha('Ana Clara Souza').getByRole('button', { name: /Ana Clara Souza/ })).toHaveAttribute('aria-pressed', 'true')
    expect(linha('Ana Clara Souza').getByText('Presente')).toBeInTheDocument()
    expect(linha('Noah Campos').getByText('Entrou nas Águias em 01/10')).toBeInTheDocument()
    expect(rodape().getByText('31 presentes · 0 faltas · 0 participaram ativamente')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leões · 10' }))
    expect(screen.getByRole('listitem', { name: 'Leão 1' })).toBeInTheDocument()
  })

  it('tocar no nome alterna Faltou e trava a participação; tocar de novo volta a Presente', async () => {
    montar()
    await screen.findByText('Enzo Barros')
    await userEvent.click(participou('Enzo Barros'))
    expect(participou('Enzo Barros')).toHaveAttribute('aria-pressed', 'true')
    await tocarNome('Enzo Barros')
    expect(linha('Enzo Barros').getByText('Faltou')).toBeInTheDocument()
    const travado = linha('Enzo Barros').getByRole('button', { name: 'Participou ativamente: indisponível porque Enzo faltou' })
    expect(travado).toBeDisabled()
    expect(travado).toHaveAttribute('aria-pressed', 'false')
    await tocarNome('Enzo Barros')
    expect(linha('Enzo Barros').getByText('Presente')).toBeInTheDocument()
    expect(participou('Enzo Barros')).toBeEnabled()
    expect(participou('Enzo Barros')).toHaveAttribute('aria-pressed', 'false')
  })

  it('o rodapé conta ao vivo e Salvar põe na fila com envioId novo', async () => {
    montar()
    await screen.findByText('Enzo Barros')
    await tocarNome('Enzo Barros')
    await tocarNome('Pedro Henrique Lima')
    for (const nome of ['Ana Clara Souza', 'Davi Carvalho', 'Gabriel Nunes', 'Isabela Martins']) await userEvent.click(participou(nome))
    expect(rodape().getByText('29 presentes · 2 faltas · 4 participaram ativamente')).toBeInTheDocument()
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { tipo, chave, payload } = ultimoPayload()
    expect(tipo).toBe('CLASSE_BIBLICA')
    expect(chave).toBe(`classe-biblica:${ENCONTRO_CB_ID}:${GRUPO_DANIEL_ID}`)
    expect(payload).toMatchObject({ encontroId: ENCONTRO_CB_ID, grupoId: GRUPO_DANIEL_ID, grupoNome: 'Grupo Daniel', data: '2026-10-11' })
    expect(payload.corpo.linhas).toHaveLength(31)
    expect(payload.corpo.linhas.filter((l) => !l.presente)).toHaveLength(2)
    expect(payload.corpo.envioId).toMatch(/^[0-9a-f-]{36}$/)
    expect(estado.aviso.success).toHaveBeenCalled()
  })

  it('salvar duas vezes gera dois envioIds diferentes', async () => {
    montar(ROTA_CONSELHEIRO, ['classebiblica.chamada'])
    await screen.findByText('Enzo Barros')
    estado.modo = 'SEM_CONEXAO'
    act(() => estado.ouvintes.forEach((ouvinte) => ouvinte()))
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(2))
    const [primeiro, segundo] = estado.enfileirar.mock.calls.map(([e]) => (e.payload as PayloadChamadaCB).corpo.envioId)
    expect(primeiro).not.toBe(segundo)
  })

  it('a lista recortada do escopo mostra só o que veio', async () => {
    const chamada = criarChamadaCB()
    servidor.use(...handlersClasseBiblica({ chamada: { ...chamada, unidades: chamada.unidades.slice(0, 1) } }))
    montar(ROTA_CONSELHEIRO, ['classebiblica.chamada'])
    expect(await screen.findByRole('button', { name: 'Águias · 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Leões/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gaviões/ })).not.toBeInTheDocument()
  })

  it('erro do servidor mostra a mensagem dele', async () => {
    servidor.use(
      http.get('/api/classe-biblica/encontros/:id/grupos/:grupoId/chamada', () =>
        HttpResponse.json({ codigo: 'REGRA', mensagem: 'A chamada só pode ser feita a partir de 11/10.' }, { status: 422 }),
      ),
    )
    montar()
    expect(await screen.findByText('A chamada só pode ser feita a partir de 11/10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('404 fora do escopo mostra a mensagem do servidor, mesmo com a chamada no pacote', async () => {
    servidor.use(
      http.get('/api/classe-biblica/encontros/:id/grupos/:grupoId/chamada', () =>
        HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Chamada não encontrada.' }, { status: 404 }),
      ),
    )
    montar()
    expect(await screen.findByText('Chamada não encontrada.')).toBeInTheDocument()
  })

  it('não monta as marcas da leitura guardada: espera a do servidor', async () => {
    const consultas = novoCliente()
    consultas.setQueryData(chavesClasseBiblica.chamada(ENCONTRO_CB_ID, GRUPO_DANIEL_ID), criarChamadaCB(), { updatedAt: Date.now() - 60_000 })
    servidor.use(...handlersClasseBiblica({ chamada: chamadaComEnzoFaltando() }))
    montar(ROTA_ADM, undefined, consultas)
    await screen.findByText('Enzo Barros')
    expect(linha('Enzo Barros').getByText('Faltou')).toBeInTheDocument()
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const enzo = ultimoPayload().payload.corpo.linhas.find((l) => l.versaoVista !== null)
    expect(enzo).toMatchObject({ presente: false, versaoVista: '2026-10-11T15:00:00.000Z' })
  })

  it('falha de rede cai para o pacote', async () => {
    servidor.use(http.get('/api/classe-biblica/encontros/:id/grupos/:grupoId/chamada', () => HttpResponse.error()))
    montar()
    expect(await screen.findByText('Enzo Barros')).toBeInTheDocument()
  })
})

describe('Voltar', () => {
  it('quem gerencia volta à edição', async () => {
    const roteador = montar()
    await screen.findByText('Enzo Barros')
    await userEvent.click(screen.getByRole('link', { name: /2026 · 2º semestre/ }))
    expect(roteador.state.location.pathname).toBe(`/adm/classe-biblica/${EDICAO_CB_ID}`)
  })

  it('quem só faz a chamada volta ao início', async () => {
    const roteador = montar(ROTA_CONSELHEIRO, ['classebiblica.chamada'])
    await screen.findByText('Enzo Barros')
    await userEvent.click(screen.getByRole('link', { name: /Início/ }))
    expect(roteador.state.location.pathname).toBe('/inicio')
  })
})

describe('Sem conexão', () => {
  beforeEach(() => {
    estado.modo = 'SEM_CONEXAO'
  })

  it('lê do pacote e, ao salvar, mostra "Chamada guardada no aparelho" com os totais', async () => {
    montar()
    expect(await screen.findByText('Sem conexão. A chamada fica guardada no aparelho e é enviada quando a internet voltar.')).toBeInTheDocument()
    await tocarNome('Enzo Barros')
    await userEvent.click(participou('Ana Clara Souza'))
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    expect(await screen.findByRole('heading', { name: 'Chamada guardada no aparelho' })).toBeInTheDocument()
    expect(
      screen.getByText('30 presentes, 1 falta e 1 participou ativamente. Ela vai ser enviada sozinha quando a internet voltar — não precisa fazer de novo.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar à edição' })).toHaveAttribute('href', `/adm/classe-biblica/${EDICAO_CB_ID}`)
    expect(ultimoPayload().payload.corpo.linhas).toHaveLength(31)
  })

  it('a conexão volta no meio: a chamada do pacote continua na tela com os toques', async () => {
    let responder = () => {}
    servidor.use(
      http.get('/api/classe-biblica/encontros/:id/grupos/:grupoId/chamada', async () => {
        await new Promise<void>((resolver) => {
          responder = resolver
        })
        return HttpResponse.json(chamadaComEnzoFaltando())
      }),
    )
    montar()
    await screen.findByText('Pedro Henrique Lima')
    await tocarNome('Pedro Henrique Lima')
    estado.modo = 'ONLINE'
    act(() => estado.ouvintes.forEach((ouvinte) => ouvinte()))
    expect(screen.queryByRole('status', { name: 'Carregando a chamada' })).not.toBeInTheDocument()
    expect(linha('Pedro Henrique Lima').getByText('Faltou')).toBeInTheDocument()
    await act(async () => {
      responder()
      await new Promise((resolver) => setTimeout(resolver, 20))
    })
    expect(linha('Pedro Henrique Lima').getByText('Faltou')).toBeInTheDocument()
    expect(rodape().getByText('30 presentes · 1 falta · 0 participaram ativamente')).toBeInTheDocument()
  })

  it('sem a chamada no pacote: "Esta chamada ainda não está no aparelho"', async () => {
    guardar(criarPacoteClasseBiblica({ grupos: [] }))
    montar()
    expect(await screen.findByText('Esta chamada ainda não está no aparelho')).toBeInTheDocument()
    expect(screen.getByText('Abra o app uma vez com internet antes do encontro. A partir daí a chamada funciona mesmo sem sinal.')).toBeInTheDocument()
  })

  it('pacote sem Classe Bíblica também diz que a chamada não está no aparelho', async () => {
    estado.pacote = { pacote: criarPacote(), carregando: false, baixadoEm: Date.now() }
    montar()
    expect(await screen.findByText('Esta chamada ainda não está no aparelho')).toBeInTheDocument()
  })

  it('enquanto lê o aparelho, mostra carregando', () => {
    estado.pacote = { pacote: null, carregando: true, baixadoEm: null }
    montar()
    expect(screen.getByRole('status', { name: 'Carregando a chamada' })).toBeInTheDocument()
  })
})

describe('Grupo vazio', () => {
  function semNinguem() {
    const pacote = criarPacoteClasseBiblica()
    const ester = pacote.grupos[1]
    if (ester) ester.unidades = ester.unidades.map((u) => ({ ...u, membros: [] }))
    guardar(pacote)
  }

  it('mostra quem não tinha ninguém e registra a chamada sem linhas', async () => {
    estado.modo = 'SEM_CONEXAO'
    semNinguem()
    montar(`/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_ESTER_ID}/chamada`)
    expect(await screen.findByText('Nenhum desbravador no Grupo Ester em 11/10')).toBeInTheDocument()
    expect(screen.getByText(`${UNIDADES_CB.falcoes.nome} e ${UNIDADES_CB.panteras.nome} não tinham desbravadores nesta data. Para pôr alguém, abra a unidade e acrescente.`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar à edição' })).toHaveAttribute('href', `/adm/classe-biblica/${EDICAO_CB_ID}`)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar a chamada sem ninguém' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(ultimoPayload().payload.corpo.linhas).toEqual([])
    expect(ultimoPayload().payload.grupoNome).toBe('Grupo Ester')
  })

  it('pela API, grupo sem ninguém mostra o mesmo vazio', async () => {
    servidor.use(...handlersClasseBiblica({ chamada: criarChamadaCB({ grupo: { id: GRUPO_ESTER_ID, nome: 'Grupo Ester' }, unidades: [] }) }))
    montar(`/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_ESTER_ID}/chamada`, ['classebiblica.chamada'])
    expect(await screen.findByText('Nenhum desbravador no Grupo Ester em 11/10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/inicio')
  })
})

describe('Chamada que ainda está na fila', () => {
  const ENZO = criarChamadaCB().unidades[0]?.desbravadores[2]?.dbvId ?? ''
  const ANA = criarChamadaCB().unidades[0]?.desbravadores[0]?.dbvId ?? ''
  const guardadoEm = new Date(2026, 9, 11, 14, 31).getTime()

  function naFila(estadoDoItem: ItemFila['estado'], linhas: PayloadChamadaCB['corpo']['linhas']): ItemFila {
    const payload: PayloadChamadaCB = { encontroId: ENCONTRO_CB_ID, grupoId: GRUPO_DANIEL_ID, grupoNome: 'Grupo Daniel', data: '2026-10-11', corpo: { envioId: crypto.randomUUID(), linhas } }
    return { id: crypto.randomUUID(), tipo: 'CLASSE_BIBLICA', chave: `classe-biblica:${ENCONTRO_CB_ID}:${GRUPO_DANIEL_ID}`, estado: estadoDoItem, payload, criadoEm: guardadoEm, atualizadoEm: guardadoEm } as ItemFila
  }

  it('parte do que foi guardado no aparelho e mostra a hora', async () => {
    estado.itens = [naFila('NA_FILA', [
      { dbvId: ENZO, presente: false, participou: false, versaoVista: null },
      { dbvId: ANA, presente: true, participou: true, versaoVista: null },
    ])]
    montar()
    expect(await screen.findByText('Guardado no aparelho às 14:31.')).toBeInTheDocument()
    expect(linha('Enzo Barros').getByText('Faltou')).toBeInTheDocument()
    expect(participou('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'true')
    expect(rodape().getByText('30 presentes · 1 falta · 1 participou ativamente')).toBeInTheDocument()
  })

  it('item com erro também vale; item já enviado não', async () => {
    estado.itens = [
      naFila('ENVIADO', [{ dbvId: ANA, presente: false, participou: false, versaoVista: null }]),
      naFila('ERRO', [{ dbvId: ENZO, presente: false, participou: false, versaoVista: null }]),
    ]
    montar()
    expect(await screen.findByText('Guardado no aparelho às 14:31.')).toBeInTheDocument()
    expect(linha('Enzo Barros').getByText('Faltou')).toBeInTheDocument()
    expect(linha('Ana Clara Souza').getByText('Presente')).toBeInTheDocument()
  })

  it('sem item na fila não mostra a hora; salvar sem conexão passa a mostrar', async () => {
    estado.modo = 'SEM_CONEXAO'
    montar()
    await screen.findByText('Enzo Barros')
    expect(screen.queryByText(/Guardado no aparelho às/)).not.toBeInTheDocument()
    await userEvent.click(rodape().getByRole('button', { name: 'Salvar chamada' }))
    expect(await rodape().findByText(/^Guardado no aparelho às \d{2}:\d{2}\.$/)).toBeInTheDocument()
  })
})
