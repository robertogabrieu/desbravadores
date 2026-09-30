import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { HttpResponse, http } from 'msw'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemFila, ModoConexao, PacoteGuardado } from '../../../offline'
import { ContextoDaSessao } from '../../../sessao/useSessao'
import type { ContextoSessao } from '../../../sessao/useSessao'
import { criarDetalheReuniao, handlerReuniao, handlerReuniaoRecusada } from '../../../testes/handlers/chamada'
import { criarResumo } from '../../../testes/handlers/reunioes'
import { criarPacote } from '../../../testes/handlers/offline'
import { criarEu, criarVinculo, uuid } from '../../../testes/handlers/sessao'
import { servidor } from '../../../testes/servidor'
import { TelaChamada } from './TelaChamada'

const estado = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
  itens: [] as ItemFila[],
  instalar: false,
  rascunhos: new Map<string, unknown>(),
  ouvintes: new Set<() => void>(),
  enfileirar: vi.fn<(entrada: unknown) => Promise<string>>(() => Promise.resolve('id')),
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
  useFila: () => ({ avisos: { instalarNaTelaInicial: estado.instalar } }),
  itensDaChave: () => Promise.resolve(estado.itens),
  lerRascunho: (_: string, chave: string) => Promise.resolve(estado.rascunhos.get(chave) ?? null),
  gravarRascunho: (_: string, chave: string, valor: unknown) => {
    estado.rascunhos.set(chave, valor)
    return Promise.resolve()
  },
  apagarRascunho: (_: string, chave: string) => {
    estado.rascunhos.delete(chave)
    return Promise.resolve()
  },
  enfileirar: estado.enfileirar,
  registrarTipo: vi.fn(),
}))

const AGUIAS = { id: uuid(201), nome: 'Águias' }
const LEOES = { id: uuid(202), nome: 'Leões' }
const ANA = uuid(301)
const BRUNO = uuid(302)
const CARLA = uuid(303)
const HOJE = '2030-03-15'

const membro = (dbvId: string, nome: string) => ({
  dbvId, nome, nomePublico: nome, sexo: 'F' as const, idade: 11, classeAtual: null, autorizacaoImagem: true,
})
const criterio = (gatilho: 'PRESENCA' | 'PONTUALIDADE' | 'UNIFORME' | 'BIBLIA' | 'LICAO', pontos: number, ativo = true) => ({
  gatilho, nome: gatilho, pontos, ativo,
})

function pacote(parcial: Parameters<typeof criarPacote>[0] = {}) {
  return criarPacote({
    criterios: [criterio('PRESENCA', 10), criterio('PONTUALIDADE', 5), criterio('UNIFORME', 5), criterio('BIBLIA', 3), criterio('LICAO', 2, false)],
    unidades: [{ ...AGUIAS, membros: [membro(ANA, 'Ana Clara'), membro(BRUNO, 'Bruno Lima'), membro(CARLA, 'Carla Dias')] }],
    ...parcial,
  })
}

function guardar(p = pacote(), baixadoEm: number | null = Date.parse('2030-03-15T12:05:00.000Z')) {
  estado.pacote = { pacote: p, carregando: false, baixadoEm }
}

function montar(rota: string, unidades = [AGUIAS]) {
  const vinculo = criarVinculo('CONSELHEIRO', 1, { unidades })
  const eu = criarEu([vinculo], vinculo.id)
  const sessao = { situacao: 'autenticada', eu, vinculoAtivo: vinculo, papel: 'CONSELHEIRO', vinculos: [vinculo] } as unknown as ContextoSessao
  const roteador = createMemoryRouter(
    [
      { path: '/reunioes/nova', element: <TelaChamada /> },
      { path: '/reunioes/:id/editar', element: <TelaChamada /> },
      { path: '/reunioes', element: <p>Histórico</p> },
    ],
    { initialEntries: [rota] },
  )
  const Envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContextoDaSessao.Provider value={sessao}>{children}</ContextoDaSessao.Provider>
    </QueryClientProvider>
  )
  render(<RouterProvider router={roteador} />, { wrapper: Envoltorio })
  return roteador
}

const linha = (nome: string) => within(screen.getByRole('listitem', { name: nome }))
const botaoSalvar = () => screen.getByRole('button', { name: /^Salvar chamada/ })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${HOJE}T12:10:00.000Z`) })
  estado.modo = 'ONLINE'
  estado.itens = []
  estado.instalar = false
  estado.rascunhos.clear()
  estado.enfileirar.mockClear()
  estado.aviso.success.mockClear()
  guardar()
  servidor.use(http.get('/api/reunioes', () => HttpResponse.json([])))
})
afterEach(() => vi.useRealTimers())

describe('Chamada nova', () => {
  it('começa sem marcação, com data de hoje, horário padrão e Salvar desabilitado', async () => {
    montar('/reunioes/nova')
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveValue(HOJE)
    expect(screen.getByLabelText('Horário')).toHaveValue('09:00')
    expect(botaoSalvar()).toBeDisabled()
    expect(screen.getByText('Marque os 3 que faltam')).toBeInTheDocument()
    expect(screen.getByText('Lista atualizada hoje às 09:05')).toBeInTheDocument()
  })

  it('segue desabilitado enquanto sobra alguém sem marca e habilita quando todos têm', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Ana Clara' })).getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Bruno Lima' })).getByRole('button', { name: /Bruno Lima/ }))
    expect(botaoSalvar()).toBeDisabled()
    expect(screen.getByText('Marque o 1 que falta')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Carla Dias' })).getByRole('button', { name: /Carla Dias/ }))
    expect(botaoSalvar()).toBeEnabled()
  })

  it('mostra chips só para o presente, calcula pontos provisórios e o resumo', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(linha('Ana Clara').queryByRole('button', { name: 'Uniforme' })).not.toBeInTheDocument()
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Uniforme' }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Bíblia' }))
    expect(linha('Ana Clara').queryByRole('button', { name: 'Lição' })).not.toBeInTheDocument()
    // PRESENCA 10 + PONTUALIDADE 5 + UNIFORME 5 + BIBLIA 3
    expect(screen.getByText('23 pts')).toBeInTheDocument()
    expect(screen.getByText('provisório')).toBeInTheDocument()
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Atrasou' }))
    // sem a pontualidade
    expect(screen.getByText('18 pts')).toBeInTheDocument()
    expect(screen.getByText('1/3 presentes')).toBeInTheDocument()
    expect(screen.getByText('1 atrasos')).toBeInTheDocument()
    expect(screen.getByText('1 uniformes')).toBeInTheDocument()
    expect(screen.getByText('1 Bíblias')).toBeInTheDocument()
  })

  it('mostra Lição quando o critério está ativo', async () => {
    guardar(pacote({ criterios: [criterio('PRESENCA', 10), criterio('LICAO', 2)] }))
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    expect(linha('Ana Clara').getByRole('button', { name: 'Lição' })).toBeInTheDocument()
  })

  it('ausentar limpa os chips e oferece Justificada', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Uniforme' }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    expect(linha('Ana Clara').queryByRole('button', { name: 'Uniforme' })).not.toBeInTheDocument()
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Justificada' }))
    expect(linha('Ana Clara').getByRole('button', { name: 'Justificada' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Justificada' }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    expect(linha('Ana Clara').getByRole('button', { name: 'Uniforme' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('salva: enfileira todos os membros com o cabeçalho, apaga o rascunho e volta ao histórico', async () => {
    const roteador = montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Bruno Lima').getByRole('button', { name: /Bruno Lima/ }))
    await userEvent.click(linha('Bruno Lima').getByRole('button', { name: /Bruno Lima/ }))
    await userEvent.click(linha('Carla Dias').getByRole('button', { name: /Carla Dias/ }))
    await userEvent.type(screen.getByLabelText('Local'), 'Sala 2')
    await userEvent.click(botaoSalvar())

    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const entrada = estado.enfileirar.mock.calls[0]?.[0] as { tipo: string; chave: string; payload: Record<string, unknown> & { corpo: Record<string, unknown> } }
    expect(entrada.tipo).toBe('REUNIAO')
    expect(entrada.chave).toBe(`${AGUIAS.id}:${HOJE}`)
    expect(entrada.payload).toMatchObject({ correcao: false, unidadeNome: 'Águias', pontosProvisorios: 30 })
    expect(entrada.payload.corpo).toMatchObject({
      unidadeId: AGUIAS.id,
      data: HOJE,
      cabecalho: { horario: '09:00', local: 'Sala 2', observacoes: null, versaoVista: null },
    })
    expect(entrada.payload.corpo['linhas']).toHaveLength(3)
    expect(entrada.payload.corpo['linhas']).toContainEqual(expect.objectContaining({ dbvId: BRUNO, situacao: 'FALTA', versaoVista: null }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/reunioes'))
    expect(estado.aviso.success).toHaveBeenCalledWith('Chamada salva', expect.anything())
    expect(estado.rascunhos.size).toBe(0)
  })

  it('a data aceita de hoje menos 30 dias até hoje; fora disso não deixa salvar', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    const data = screen.getByLabelText('Data')
    expect(data).toHaveAttribute('min', '2030-02-13')
    expect(data).toHaveAttribute('max', HOJE)
    await userEvent.clear(data)
    await userEvent.type(data, '2030-01-01')
    expect(screen.getByText(/Escolha uma data entre 13\/02 e hoje/)).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara')).not.toBeInTheDocument()
  })

  it('com 2 unidades mostra o seletor e troca a lista', async () => {
    guardar(pacote({ unidades: [{ ...AGUIAS, membros: [membro(ANA, 'Ana Clara')] }, { ...LEOES, membros: [membro(uuid(304), 'Davi Nunes')] }] }))
    montar('/reunioes/nova', [AGUIAS, LEOES])
    await screen.findByText('Ana Clara')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Unidade' }), LEOES.id)
    expect(await screen.findByText('Davi Nunes')).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara')).not.toBeInTheDocument()
  })

  it('com 1 unidade não mostra o seletor', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(screen.queryByRole('combobox', { name: 'Unidade' })).not.toBeInTheDocument()
  })
})

describe('Rascunho', () => {
  it('cada toque grava o rascunho e ele sobrevive a recarregar a tela', async () => {
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: 'Uniforme' }))
    await waitFor(() => expect(estado.rascunhos.has(`${AGUIAS.id}:${HOJE}`)).toBe(true))
    document.body.innerHTML = ''
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(linha('Ana Clara').getByRole('button', { name: 'Uniforme' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Marque os 2 que faltam')).toBeInTheDocument()
  })

  it('a chamada guardada na fila aparece por cima da base, e o rascunho por cima da fila', async () => {
    const corpo = (situacao: 'PRESENTE' | 'FALTA') => ({ dbvId: ANA, situacao, uniforme: false, biblia: false, licao: false, versaoVista: null })
    estado.itens = [
      {
        estado: 'NA_FILA', criadoEm: 1,
        payload: {
          reuniaoId: uuid(710), correcao: false, unidadeNome: 'Águias',
          corpo: {
            versaoPayload: 1, envioId: uuid(1), unidadeId: AGUIAS.id, data: HOJE, feitaNoAparelhoEm: '2030-03-15T12:00:00.000Z',
            cabecalho: { horario: '08:30', local: null, observacoes: null, versaoVista: null },
            linhas: [corpo('PRESENTE'), { ...corpo('FALTA'), dbvId: BRUNO }, { ...corpo('FALTA'), dbvId: CARLA }],
          },
        },
      } as unknown as ItemFila,
      { estado: 'ENVIADO', criadoEm: 2, payload: {} } as unknown as ItemFila,
    ]
    estado.rascunhos.set(`${AGUIAS.id}:${HOJE}`, {
      marcas: { [CARLA]: { situacao: 'PRESENTE', uniforme: false, biblia: false, licao: false } },
      cabecalho: null,
    })
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(screen.getByLabelText('Horário')).toHaveValue('08:30')
    expect(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ })).toHaveAttribute('aria-pressed', 'true')
    expect(linha('Bruno Lima').getByRole('button', { name: /Bruno Lima/ })).toHaveAttribute('aria-pressed', 'false')
    expect(linha('Carla Dias').getByRole('button', { name: /Carla Dias/ })).toHaveAttribute('aria-pressed', 'true')
    expect(botaoSalvar()).toBeEnabled()
  })
})

describe('Edição', () => {
  const detalhe = criarDetalheReuniao({
    id: uuid(700),
    data: '2030-03-10',
    horario: '09:00',
    cabecalhoVersao: '2030-03-10T12:00:00.000Z',
    chamada: [ANA, BRUNO, CARLA].map((dbvId, i) => ({
      dbvId, nome: ['Ana Clara', 'Bruno Lima', 'Carla Dias'][i] ?? '', nomePublico: 'x',
      situacao: 'PRESENTE' as const, uniforme: false, biblia: false, licao: false,
      versao: `2030-03-10T12:0${i}:00.000Z`, pontos: 15,
    })),
  })

  it('trava a data, carrega as marcas do servidor e não exige marcar todos', async () => {
    servidor.use(handlerReuniao(detalhe))
    montar(`/reunioes/${detalhe.id}/editar`)
    await screen.findByText('Ana Clara')
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument()
    expect(screen.getByText(/10\/03/)).toBeInTheDocument()
    expect(linha('Bruno Lima').getByRole('button', { name: /Bruno Lima/ })).toHaveAttribute('aria-pressed', 'true')
    expect(botaoSalvar()).toBeDisabled()
  })

  it('envia só a linha tocada, com a versão vista, e o cabeçalho nulo se não foi tocado', async () => {
    servidor.use(handlerReuniao(detalhe))
    montar(`/reunioes/${detalhe.id}/editar`)
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Bruno Lima').getByRole('button', { name: 'Uniforme' }))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { chave, payload } = estado.enfileirar.mock.calls[0]?.[0] as { chave: string; payload: { reuniaoId: string; correcao: boolean; corpo: { cabecalho: unknown; linhas: unknown[] } } }
    expect(chave).toBe(`${AGUIAS.id}:2030-03-10`)
    expect(payload).toMatchObject({ reuniaoId: detalhe.id, correcao: true })
    expect(payload.corpo.cabecalho).toBeNull()
    expect(payload.corpo.linhas).toEqual([
      { dbvId: BRUNO, situacao: 'PRESENTE', uniforme: true, biblia: false, licao: false, versaoVista: '2030-03-10T12:01:00.000Z' },
    ])
  })

  it('chamada nova online: reunião de hoje só no servidor abre como correção, com as versões do servidor', async () => {
    const doServidor = criarDetalheReuniao({
      id: uuid(720),
      data: HOJE,
      cabecalhoVersao: '2030-03-15T12:00:00.000Z',
      chamada: [ANA, BRUNO, CARLA].map((dbvId, i) => ({
        dbvId, nome: ['Ana Clara', 'Bruno Lima', 'Carla Dias'][i] ?? '', nomePublico: 'x',
        situacao: 'PRESENTE' as const, uniforme: false, biblia: false, licao: false,
        versao: `2030-03-15T12:0${i}:00.000Z`, pontos: 15,
      })),
    })
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([criarResumo({ id: doServidor.id, data: HOJE })])), handlerReuniao(doServidor))
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(linha('Bruno Lima').getByRole('button', { name: /Bruno Lima/ })).toHaveAttribute('aria-pressed', 'true')
    expect(botaoSalvar()).toBeDisabled()
    await userEvent.click(linha('Bruno Lima').getByRole('button', { name: 'Uniforme' }))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { payload } = estado.enfileirar.mock.calls[0]?.[0] as { payload: { reuniaoId: string; correcao: boolean; corpo: { linhas: unknown[] } } }
    expect(payload).toMatchObject({ reuniaoId: doServidor.id, correcao: true })
    expect(payload.corpo.linhas).toEqual([
      { dbvId: BRUNO, situacao: 'PRESENTE', uniforme: true, biblia: false, licao: false, versaoVista: '2030-03-15T12:01:00.000Z' },
    ])
  })

  it('a base fica fixa: a conexão cair no meio não vira chamada nova nem apaga a marcação', async () => {
    const doServidor = criarDetalheReuniao({
      id: uuid(720),
      data: HOJE,
      chamada: [ANA, BRUNO, CARLA].map((dbvId, i) => ({
        dbvId, nome: ['Ana Clara', 'Bruno Lima', 'Carla Dias'][i] ?? '', nomePublico: 'x',
        situacao: 'PRESENTE' as const, uniforme: false, biblia: false, licao: false,
        versao: `2030-03-15T12:0${i}:00.000Z`, pontos: 15,
      })),
    })
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([criarResumo({ id: doServidor.id, data: HOJE })])), handlerReuniao(doServidor))
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Bruno Lima').getByRole('button', { name: 'Uniforme' }))
    act(() => {
      estado.modo = 'SEM_CONEXAO'
      estado.ouvintes.forEach((ouvinte) => ouvinte())
    })
    expect(linha('Bruno Lima').getByRole('button', { name: 'Uniforme' })).toHaveAttribute('aria-pressed', 'true')
    expect(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { payload } = estado.enfileirar.mock.calls[0]?.[0] as { payload: { reuniaoId: string; correcao: boolean; corpo: { linhas: unknown[] } } }
    expect(payload).toMatchObject({ reuniaoId: doServidor.id, correcao: true })
    expect(payload.corpo.linhas).toEqual([
      { dbvId: BRUNO, situacao: 'PRESENTE', uniforme: true, biblia: false, licao: false, versaoVista: '2030-03-15T12:01:00.000Z' },
    ])
  })

  it('chamada nova online sem reunião no servidor nem no pacote segue como chamada nova', async () => {
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([])))
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(screen.getByText('Marque os 3 que faltam')).toBeInTheDocument()
  })

  it('tocar no cabeçalho envia o cabeçalho com a versão vista', async () => {
    servidor.use(handlerReuniao(detalhe))
    montar(`/reunioes/${detalhe.id}/editar`)
    await screen.findByText('Ana Clara')
    await userEvent.type(screen.getByLabelText('Observações'), 'Chuva')
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { payload } = estado.enfileirar.mock.calls[0]?.[0] as { payload: { corpo: { cabecalho: unknown; linhas: unknown[] } } }
    expect(payload.corpo.cabecalho).toEqual({ horario: '09:00', local: null, observacoes: 'Chuva', versaoVista: detalhe.cabecalhoVersao })
    expect(payload.corpo.linhas).toHaveLength(1)
  })
})

describe('Os quatro estados', () => {
  it('carregando: mostra o esqueleto enquanto o pacote é lido', () => {
    estado.pacote = { pacote: null, carregando: true, baixadoEm: null }
    montar('/reunioes/nova')
    expect(screen.getByRole('status', { name: 'Carregando a chamada' })).toBeInTheDocument()
  })

  it('carregando: edição espera o servidor', async () => {
    servidor.use(handlerReuniao(criarDetalheReuniao()))
    montar(`/reunioes/${uuid(700)}/editar`)
    expect(screen.getByRole('status', { name: 'Carregando a chamada' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Registro de reunião' })
  })

  it('vazio: sem unidade, explica e leva de volta às reuniões', () => {
    guardar(pacote({ unidades: [] }))
    montar('/reunioes/nova')
    expect(screen.getByText('Você ainda não tem unidade para registrar chamada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar às reuniões' })).toHaveAttribute('href', '/reunioes')
  })

  it('vazio: unidade sem desbravadores', () => {
    guardar(pacote({ unidades: [{ ...AGUIAS, membros: [] }] }))
    montar('/reunioes/nova')
    expect(screen.getByText('Nenhum desbravador nesta unidade')).toBeInTheDocument()
  })

  it('erro: mostra a mensagem da API e Tentar de novo refaz a leitura', async () => {
    const id = uuid(700)
    servidor.use(handlerReuniaoRecusada(id, 403, 'Você não pode ver esta reunião.'))
    montar(`/reunioes/${id}/editar`)
    expect(await screen.findByText('Você não pode ver esta reunião.')).toBeInTheDocument()
    servidor.use(handlerReuniao(criarDetalheReuniao({ id })))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Registro de reunião' })).toBeInTheDocument()
  })

  it('sem conexão: a nova funciona igual, com a faixa e o aviso de instalar (iPhone)', async () => {
    estado.modo = 'SEM_CONEXAO'
    estado.instalar = true
    montar('/reunioes/nova')
    await screen.findByText('Ana Clara')
    expect(screen.getByText(/Sem conexão\. A chamada fica guardada no aparelho/)).toBeInTheDocument()
    expect(screen.getByText('Instale o app na tela inicial para não perder chamadas guardadas')).toBeInTheDocument()
    await userEvent.click(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ }))
    expect(linha('Ana Clara').getByRole('button', { name: 'Uniforme' })).toBeInTheDocument()
  })

  it('sem conexão: edição lê a reunião do pacote, sem chamar a API', async () => {
    estado.modo = 'SEM_CONEXAO'
    const id = uuid(720)
    guardar(pacote({
      reunioesRecentes: [{
        id, unidadeId: AGUIAS.id, data: '2030-03-12', horario: '10:00', local: 'Salão', observacoes: null,
        cabecalhoVersao: '2030-03-12T12:00:00.000Z',
        chamada: [{ dbvId: ANA, situacao: 'FALTA', uniforme: false, biblia: false, licao: false, versao: '2030-03-12T12:00:00.000Z' }],
      }],
    }))
    montar(`/reunioes/${id}/editar`)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(screen.getByLabelText('Horário')).toHaveValue('10:00')
    expect(linha('Ana Clara').getByRole('button', { name: /Ana Clara/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sem conexão e sem pacote: diz que só abre com internet', () => {
    estado.modo = 'SEM_CONEXAO'
    estado.pacote = { pacote: null, carregando: false, baixadoEm: null }
    montar('/reunioes/nova')
    expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
