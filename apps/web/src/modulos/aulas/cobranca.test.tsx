import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemFila, ModoConexao, PacoteGuardado } from '../../offline'
import { ContextoDaSessao } from '../../sessao/useSessao'
import type { ContextoSessao } from '../../sessao/useSessao'
import { CLASSE_COMPANHEIRO, criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarCronograma, handlerCronograma } from '../../testes/handlers/cronograma'
import { criarPacote, criarPacoteInstrutor, handlerPacote } from '../../testes/handlers/offline'
import { criarEu, criarVinculo, uuid } from '../../testes/handlers/sessao'
import { servidor } from '../../testes/servidor'
import { TelaRegistroAula } from './TelaRegistroAula'

const estado = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  podeMarcar: true,
  pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
  itens: [] as ItemFila[],
  enfileirar: vi.fn<(entrada: unknown) => Promise<string>>(() => Promise.resolve('id')),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))
vi.mock('../../offline', () => ({
  useConexao: () => ({ modo: estado.modo }),
  usePacote: () => estado.pacote,
  useFila: () => ({ avisos: { instalarNaTelaInicial: false } }),
  itensDaChave: () => Promise.resolve(estado.itens),
  lerRascunho: () => Promise.resolve(null),
  gravarRascunho: () => Promise.resolve(),
  apagarRascunho: () => Promise.resolve(),
  enfileirar: estado.enfileirar,
  registrarTipo: vi.fn(),
}))

const ANA = uuid(301)
const BRUNO = uuid(302)
const CARLA = uuid(303)
const R1 = uuid(11)
const R2 = uuid(12)
const R3 = uuid(13)
const ESP = uuid(21)
const REGISTRO_DA_FILA = uuid(777)
const DATA = '2030-10-04'
const TAREFA = { id: uuid(600), registroAulaId: uuid(710), data: '2030-09-27', encerrada: false, itens: [{ requisitoId: R1 }, { requisitoId: R2 }, { especialidadeId: ESP }] }
const CATALOGO = [{ id: ESP, nome: 'Arte de Contar Histórias', area: 'Atividades missionárias e comunitárias' }]

const membro = (dbvId: string, nome: string, concluidos: string[] = []) => ({
  dbvId, nome, nomePublico: nome, sexo: 'F' as const, idade: 11, classeAtual: null, autorizacaoImagem: true, tipo: 'DBV' as const, concluidos, voce: false,
  conclusoes: concluidos.map((requisitoId) => ({ requisitoId, concluidoEm: '2030-09-20', registroAulaId: null })),
  especialidades: [],
})
const requisito = (id: string, codigo: string) => ({ id, codigo, texto: `Texto de ${codigo}`, campo: false, secaoCodigo: 'DE' })

function classe(parcial: Parameters<typeof criarClasseInstrutor>[0] = {}) {
  return criarClasseInstrutor({
    membros: [membro(ANA, 'Ana Beatriz Souza'), membro(BRUNO, 'Bruno Lima', [R1]), membro(CARLA, 'Carla Mendes')],
    requisitos: [requisito(R1, 'I.3'), requisito(R2, 'II.4'), requisito(R3, 'III.1')],
    tarefas: [TAREFA],
    ...parcial,
  })
}

function guardar(classes = [classe()], catalogo: typeof CATALOGO | null = CATALOGO) {
  const instrutor = criarPacoteInstrutor({ classes, pontosRequisito: { pontos: 5, ativo: true }, pontosEspecialidade: { pontos: 10, ativo: true }, especialidades: catalogo ?? undefined })
  estado.pacote = { pacote: criarPacote({ instrutor }), carregando: false, baixadoEm: Date.parse('2030-10-05T12:05:00.000Z') }
}

function montar() {
  const vinculo = criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_COMPANHEIRO] })
  const eu = criarEu([vinculo], vinculo.id)
  const sessao = { situacao: 'autenticada', eu, vinculoAtivo: vinculo, papel: 'INSTRUTOR', vinculos: [vinculo], pode: (permissao: string) => permissao !== 'requisito.marcar' || estado.podeMarcar } as unknown as ContextoSessao
  const roteador = createMemoryRouter([{ path: '/aulas/nova', element: <TelaRegistroAula /> }, { path: '/inicio', element: <p>Início</p> }], {
    initialEntries: [`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${DATA}`],
  })
  const Envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContextoDaSessao.Provider value={sessao}>{children}</ContextoDaSessao.Provider>
    </QueryClientProvider>
  )
  render(<RouterProvider router={roteador} />, { wrapper: Envoltorio })
}

/** O que já está na fila para este registro: entra por baixo do que a pessoa faz agora. */
function naFila(corpo: Record<string, unknown>) {
  estado.itens = [
    {
      estado: 'NA_FILA',
      criadoEm: 1,
      payload: { registroAulaId: REGISTRO_DA_FILA, corpo: { versaoPayload: 1, envioId: uuid(9), classeId: CLASSE_COMPANHEIRO.id, data: DATA, feitaNoAparelhoEm: '2030-10-04T12:00:00.000Z', aulaPlanejadaId: null, presencas: [], requisitosMarcados: [], requisitosDesmarcados: [], ...corpo } },
    } as unknown as ItemFila,
  ]
}

const bloco = (titulo = 'Cobrar tarefa de 27/09') => within(screen.getByRole('region', { name: titulo }))
const entregou = (item: string, nome: string) => screen.getByRole('button', { name: `Entregou: ${item} · ${nome}` })
const desfazer = (nome: string) => screen.getByRole('button', { name: `Entregue em 04/10 · ${nome} · desfazer` })
const presenca = (nome: string) => within(screen.getByRole('listitem', { name: nome })).getByRole('button', { name: new RegExp(`^${nome}`) })
const salvar = () => screen.getByRole('button', { name: /^Salvar classe/ })
const esperar = () => screen.findByRole('listitem', { name: 'Ana Beatriz Souza' })
const corpoEnviado = () => (estado.enfileirar.mock.calls[0]?.[0] as { payload: { corpo: Record<string, unknown[]> } }).payload.corpo
const salvarEPegar = async () => {
  await userEvent.click(salvar())
  await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
  return corpoEnviado()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-10-05T12:10:00.000Z') })
  estado.modo = 'ONLINE'
  estado.podeMarcar = true
  estado.itens = []
  estado.enfileirar.mockClear()
  guardar()
  servidor.use(handlerCronograma(criarCronograma({ aulas: [] })), handlerPacote(criarPacote(), { total: 0 }))
})
afterEach(() => vi.useRealTimers())

describe('Cobrar a tarefa no registro', () => {
  it('só entram tarefas com data anterior à do registro', async () => {
    guardar([classe({ tarefas: [{ ...TAREFA, data: DATA }, { ...TAREFA, id: uuid(601), registroAulaId: uuid(711), data: '2030-10-11' }] })])
    montar()
    await esperar()
    expect(screen.queryByText(/^Cobrar tarefa de/)).not.toBeInTheDocument()
  })

  it('a mais recente aberta aparece; as outras ficam recolhidas atrás de "+N tarefas anteriores"', async () => {
    const outra = (n: number, data: string) => ({ ...TAREFA, id: uuid(600 + n), registroAulaId: uuid(710 + n), data })
    guardar([classe({ tarefas: [outra(1, '2030-09-13'), TAREFA, outra(2, '2030-09-06')] })])
    montar()
    await esperar()
    expect(screen.getByRole('heading', { name: 'Cobrar tarefa de 27/09' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tarefa de 13/09' })).not.toBeInTheDocument()
    const mais = screen.getByRole('button', { name: '+2 tarefas anteriores' })
    expect(mais).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(mais)
    expect(screen.getByRole('heading', { name: 'Tarefa de 13/09' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tarefa de 06/09' })).toBeInTheDocument()
  })

  it('uma só tarefa anterior no singular', async () => {
    guardar([classe({ tarefas: [TAREFA, { ...TAREFA, id: uuid(601), registroAulaId: uuid(711), data: '2030-09-13' }] })])
    montar()
    await esperar()
    expect(screen.getByRole('button', { name: '+1 tarefa anterior' })).toBeInTheDocument()
  })

  it('aberta que ninguém mais deve sai do bloco e o requisito dela volta à grade; a com devedores fica como principal', async () => {
    const quitada = { ...TAREFA, id: uuid(601), registroAulaId: uuid(711), data: '2030-10-01', itens: [{ requisitoId: R3 }] }
    const feitoPorTodos = [membro(ANA, 'Ana Beatriz Souza', [R3]), membro(BRUNO, 'Bruno Lima', [R1, R3]), membro(CARLA, 'Carla Mendes', [R3])]
    guardar([classe({ tarefas: [quitada, TAREFA], membros: feitoPorTodos, aulasProximas: [{ aulaPlanejadaId: uuid(50), data: DATA, horario: '09:00', titulo: 'Aula', requisitoIds: [R3] }] })])
    montar()
    await esperar()
    expect(screen.getByRole('heading', { name: 'Cobrar tarefa de 27/09' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^\+1 tarefa anterior/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cobrar tarefa de 01/10' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^III.1 · Ana/ })).toBeInTheDocument()
  })

  it('chips com o nome curto trocam o item, e o nome inteiro do escolhido aparece abaixo', async () => {
    montar()
    await esperar()
    const chips = bloco().getByRole('group', { name: 'Itens da tarefa' })
    expect(within(chips).getAllByRole('button').map((c) => c.textContent)).toEqual(['I.3', 'II.4', 'Arte de Contar Hi…'])
    expect(bloco().getByText('I.3 · Texto de I.3')).toBeInTheDocument()
    expect(bloco().getByRole('list', { name: 'Quem deve I.3' })).toBeInTheDocument()
    await userEvent.click(within(chips).getByRole('button', { name: 'Arte de Contar Histórias' }))
    expect(bloco().getByText('Arte de Contar Histórias')).toBeInTheDocument()
    expect(bloco().getByRole('list', { name: 'Quem deve Arte de Contar Histórias' })).toBeInTheDocument()
    expect(bloco().queryByText('I.3 · Texto de I.3')).not.toBeInTheDocument()
  })

  it('lista quem deve o item (quem já concluiu antes sai) e a linha não some ao marcar', async () => {
    montar()
    await esperar()
    const lista = bloco().getByRole('list', { name: 'Quem deve I.3' })
    expect(within(lista).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringContaining('Ana Beatriz Souza'), expect.stringContaining('Carla Mendes')])
    await userEvent.click(entregou('I.3', 'Ana Beatriz Souza'))
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista).getByText('Entregue')).toBeInTheDocument()
  })

  it('Entregou vira Entregue com Desfazer, e desfazer volta ao botão', async () => {
    montar()
    await esperar()
    await userEvent.click(entregou('I.3', 'Ana Beatriz Souza'))
    expect(screen.queryByRole('button', { name: 'Entregou: I.3 · Ana Beatriz Souza' })).not.toBeInTheDocument()
    await userEvent.click(desfazer('Ana Beatriz Souza'))
    expect(entregou('I.3', 'Ana Beatriz Souza')).toBeEnabled()
  })

  it('quem está ausente acima tem "Entregou" desabilitado e "Faltou hoje"', async () => {
    montar()
    await esperar()
    await userEvent.click(presenca('Carla Mendes'))
    const botao = screen.getByRole('button', { name: 'Entregou: I.3 · Carla Mendes · faltou hoje' })
    expect(botao).toBeDisabled()
    expect(botao).toHaveTextContent('Faltou hoje')
    await userEvent.click(presenca('Carla Mendes'))
    expect(entregou('I.3', 'Carla Mendes')).toBeEnabled()
  })

  it('marcar ausente depois desfaz a entrega já gravada neste registro, de requisito e de especialidade', async () => {
    naFila({ requisitosMarcados: [{ dbvId: ANA, requisitoId: R1 }], especialidadesMarcadas: [{ dbvId: ANA, especialidadeId: ESP }] })
    montar()
    await esperar()
    expect(desfazer('Ana Beatriz Souza')).toBeInTheDocument()
    await userEvent.click(presenca('Ana Beatriz Souza'))
    expect(screen.getByRole('button', { name: 'Entregou: I.3 · Ana Beatriz Souza · faltou hoje' })).toBeDisabled()
    await userEvent.click(bloco().getByRole('button', { name: 'Arte de Contar Histórias' }))
    expect(screen.getByRole('button', { name: 'Entregou: Arte de Contar Histórias · Ana Beatriz Souza · faltou hoje' })).toBeDisabled()
    const corpo = await salvarEPegar()
    expect(corpo.requisitosDesmarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
    expect(corpo.especialidadesDesmarcadas).toEqual([{ dbvId: ANA, especialidadeId: ESP }])
  })

  it('o envio leva as entregas de requisito e de especialidade', async () => {
    montar()
    await esperar()
    await userEvent.click(entregou('I.3', 'Ana Beatriz Souza'))
    await userEvent.click(bloco().getByRole('button', { name: 'Arte de Contar Histórias' }))
    await userEvent.click(entregou('Arte de Contar Histórias', 'Carla Mendes'))
    const corpo = await salvarEPegar()
    expect(corpo.requisitosMarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
    expect(corpo.especialidadesMarcadas).toEqual([{ dbvId: CARLA, especialidadeId: ESP }])
  })

  it('"Encerrar tarefa" pede confirmação; depois mostra "Será encerrada ao salvar" com Desfazer, e o envio leva o id', async () => {
    montar()
    await esperar()
    await userEvent.click(bloco().getByRole('button', { name: 'Encerrar tarefa' }))
    expect(bloco().getByText('Encerrar a tarefa de 27/09? Quem não entregou deixa de aparecer para cobrar. O que já foi entregue continua registrado.')).toBeInTheDocument()
    await userEvent.click(bloco().getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText(/^Encerrar a tarefa de 27\/09/)).not.toBeInTheDocument()
    await userEvent.click(bloco().getByRole('button', { name: 'Encerrar tarefa' }))
    await userEvent.click(bloco().getByRole('button', { name: 'Encerrar' }))
    expect(bloco().getByText('Será encerrada ao salvar')).toBeInTheDocument()
    expect(bloco().queryByRole('button', { name: 'Encerrar tarefa' })).not.toBeInTheDocument()
    await userEvent.click(bloco().getByRole('button', { name: 'Desfazer' }))
    expect(bloco().getByRole('button', { name: 'Encerrar tarefa' })).toBeInTheDocument()
    await userEvent.click(bloco().getByRole('button', { name: 'Encerrar tarefa' }))
    await userEvent.click(bloco().getByRole('button', { name: 'Encerrar' }))
    expect((await salvarEPegar()).tarefasEncerradas).toEqual([TAREFA.id])
  })

  it('tarefa encerrada com entrega neste registro aparece, só com quem entregou e sem "Encerrar tarefa"', async () => {
    guardar([classe({ tarefas: [{ ...TAREFA, encerrada: true }] })])
    naFila({ requisitosMarcados: [{ dbvId: ANA, requisitoId: R1 }] })
    montar()
    await esperar()
    const lista = bloco().getByRole('list', { name: 'Quem deve I.3' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    expect(desfazer('Ana Beatriz Souza')).toBeInTheDocument()
    expect(bloco().queryByRole('button', { name: 'Encerrar tarefa' })).not.toBeInTheDocument()
  })

  it('tarefa encerrada sem entrega aqui não aparece', async () => {
    guardar([classe({ tarefas: [{ ...TAREFA, encerrada: true }] })])
    montar()
    await esperar()
    expect(screen.queryByText(/^Cobrar tarefa de/)).not.toBeInTheDocument()
  })

  it('sem requisito.marcar os chips de especialidade não aparecem', async () => {
    estado.podeMarcar = false
    montar()
    await esperar()
    const chips = bloco().getByRole('group', { name: 'Itens da tarefa' })
    expect(within(chips).getAllByRole('button').map((c) => c.textContent)).toEqual(['I.3', 'II.4'])
  })

  it('pacote antigo, sem tarefas, mostra o registro sem o bloco', async () => {
    guardar([{ ...classe(), tarefas: undefined } as unknown as ReturnType<typeof classe>])
    montar()
    await esperar()
    expect(screen.queryByRole('group', { name: 'Itens da tarefa' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Requisitos desta classe' })).toBeInTheDocument()
  })

  describe('requisito da cobrança não se repete na grade nem em "O que falta fazer"', () => {
    const PLANEJADA = uuid(50)
    const comPlanejado = (requisitoIds: string[]) => classe({ aulasProximas: [{ aulaPlanejadaId: PLANEJADA, data: DATA, horario: '09:00', titulo: 'Aula', requisitoIds }] })
    const naGrade = (codigo: string) => screen.queryByRole('button', { name: new RegExp(`^${codigo} · Ana`) })

    it('fora da grade, de "O que falta fazer" e do "+ Requisito"; o planejado para a data fica', async () => {
      guardar([comPlanejado([R2, R3])])
      montar()
      await esperar()
      expect(naGrade('I.3')).not.toBeInTheDocument()
      expect(naGrade('II.4')).toBeInTheDocument()
      expect(naGrade('III.1')).toBeInTheDocument()
      const falta = within(screen.getByRole('heading', { name: 'O que falta fazer' }).closest('section') as HTMLElement)
      expect(falta.queryByText('I.3')).not.toBeInTheDocument()
      expect(falta.getByText('III.1')).toBeInTheDocument()
      expect(screen.queryByText('Texto de I.3')).not.toBeInTheDocument()
    })

    it('a prévia de pontos não conta duas vezes o requisito planejado que também está na cobrança', async () => {
      guardar([comPlanejado([R2])])
      montar()
      await esperar()
      await userEvent.click(naGrade('II.4') as HTMLElement)
      expect(screen.getByText('5 pts')).toBeInTheDocument()
    })

    it('o "+ Requisito" de "Requisitos desta classe" não oferece o item da cobrança', async () => {
      guardar([comPlanejado([R3])])
      montar()
      await esperar()
      const daClasse = within(screen.getByRole('region', { name: 'Requisitos desta classe' }))
      expect(daClasse.queryByLabelText('+ Requisito')).not.toBeInTheDocument()
    })
  })

  it('o bloco fica entre a presença e "Requisitos desta classe", sem grade e sem elemento preso', async () => {
    montar()
    await esperar()
    const secao = screen.getByRole('region', { name: 'Cobrar tarefa de 27/09' })
    const antes = screen.getByRole('region', { name: 'Presença e requisitos' })
    const depois = screen.getByRole('heading', { name: 'Requisitos desta classe' })
    expect(antes.compareDocumentPosition(secao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(secao.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(secao).queryByRole('table')).not.toBeInTheDocument()
    expect(within(secao).queryByRole('grid')).not.toBeInTheDocument()
    const classes = [secao, ...secao.querySelectorAll('*')].map((no) => no.getAttribute('class') ?? '').join(' ')
    expect(classes).not.toMatch(/\b(fixed|sticky)\b|overflow-x/)
  })

  it('a prévia de pontos soma os de especialidade entregues e os do requisito da cobrança', async () => {
    montar()
    await esperar()
    await userEvent.click(entregou('I.3', 'Ana Beatriz Souza'))
    expect(screen.getByText('5 pts')).toBeInTheDocument()
    await userEvent.click(bloco().getByRole('button', { name: 'Arte de Contar Histórias' }))
    await userEvent.click(entregou('Arte de Contar Histórias', 'Ana Beatriz Souza'))
    await userEvent.click(entregou('Arte de Contar Histórias', 'Carla Mendes'))
    expect(screen.getByText('25 pts')).toBeInTheDocument()
  })

  it('sem o catálogo e com a especialidade na tarefa, o chip dela some em vez de mostrar um nome vazio', async () => {
    guardar([classe()], null)
    montar()
    await esperar()
    const chips = bloco().getByRole('group', { name: 'Itens da tarefa' })
    expect(within(chips).getAllByRole('button').map((c) => c.textContent)).toEqual(['I.3', 'II.4'])
  })
})
