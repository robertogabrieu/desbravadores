import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemFila, ModoConexao, PacoteGuardado } from '../../offline'
import { ContextoDaSessao } from '../../sessao/useSessao'
import type { ContextoSessao } from '../../sessao/useSessao'
import { CLASSE_COMPANHEIRO, criarClasseInstrutor, criarDetalheAula, criarResumoAula, handlerAula, handlerAulas, handlerErroAula } from '../../testes/handlers/aulas'
import { criarAulaDoCronograma, criarCronograma, handlerCronograma } from '../../testes/handlers/cronograma'
import { criarPacote, criarPacoteInstrutor, criarPacoteInstrutorAntigo, handlerPacote } from '../../testes/handlers/offline'
import { criarEu, criarVinculo, uuid } from '../../testes/handlers/sessao'
import { servidor } from '../../testes/servidor'
import { ProvedorDeAlvoFixo, ProvedorDeDestinos } from '../../substituicao/contextos'
import { ClassesSemConexao } from './RegistroSemConexao'
import { TelaRegistroAula } from './TelaRegistroAula'

const estado = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  podeMarcar: true,
  pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
  itens: [] as ItemFila[],
  rascunhos: new Map<string, unknown>(),
  enfileirar: vi.fn<(entrada: unknown) => Promise<string>>(() => Promise.resolve('id')),
  aviso: { success: vi.fn(), warning: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: estado.aviso }))
vi.mock('../../offline', () => ({
  useConexao: () => ({ modo: estado.modo }),
  usePacote: () => estado.pacote,
  useFila: () => ({ avisos: { instalarNaTelaInicial: false } }),
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

const pacoteBaixado = { total: 0 }
const ANA = uuid(301)
const BRUNO = uuid(302)
const LIA = uuid(303)
const R1 = uuid(11)
const R2 = uuid(12)
const R3 = uuid(13)
const PLANEJADA = uuid(50)
const HOJE = '2030-03-15'
const DATA = '2030-03-10'

const membro = (dbvId: string, nome: string, tipo: 'DBV' | 'LIDER' = 'DBV', concluidos: string[] = [], conclusoes?: { requisitoId: string; concluidoEm: string; registroAulaId: string | null }[], voce = false) => ({
  dbvId, nome, nomePublico: nome, sexo: 'F' as const, idade: 11, classeAtual: null, autorizacaoImagem: true, tipo, concluidos, voce,
  conclusoes: conclusoes ?? concluidos.map((requisitoId) => ({ requisitoId, concluidoEm: '2030-02-20', registroAulaId: null })),
  especialidades: [],
})
type Catalogo = { id: string; nome: string; area: string }[]
const requisito = (id: string, codigo: string) => ({ id, codigo, texto: `Texto de ${codigo}`, campo: false, secaoCodigo: 'DE' })

function classe(parcial: Parameters<typeof criarClasseInstrutor>[0] = {}) {
  return criarClasseInstrutor({
    membros: [membro(ANA, 'Ana Clara'), membro(BRUNO, 'Bruno Lima', 'DBV', [R2]), membro(LIA, 'Lia Dias', 'LIDER')],
    requisitos: [requisito(R1, 'R1'), requisito(R2, 'R2'), requisito(R3, 'R3')],
    aulasProximas: [{ aulaPlanejadaId: PLANEJADA, data: HOJE, horario: '09:00', titulo: 'Aula', requisitoIds: [R1, R2] }],
    ...parcial,
  })
}

function guardar(classes = [classe()], pontos = { pontos: 5, ativo: true }, catalogo: Catalogo = []) {
  estado.pacote = {
    pacote: criarPacote({ instrutor: criarPacoteInstrutor({ classes, pontosRequisito: pontos, especialidades: catalogo }) }),
    carregando: false,
    baixadoEm: Date.parse('2030-03-15T12:05:00.000Z'),
  }
}

function montar(rota: string, envolver = (filho: ReactNode): ReactNode => filho) {
  const vinculo = criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_COMPANHEIRO] })
  const eu = criarEu([vinculo], vinculo.id)
  const sessao = { situacao: 'autenticada', eu, vinculoAtivo: vinculo, papel: 'INSTRUTOR', vinculos: [vinculo], pode: (permissao: string) => permissao !== 'requisito.marcar' || estado.podeMarcar } as unknown as ContextoSessao
  const roteador = createMemoryRouter(
    [
      { path: '/aulas/nova', element: <TelaRegistroAula /> },
      { path: '/aulas/:id/editar', element: <TelaRegistroAula /> },
      { path: '/inicio', element: <p>Início</p> },
      { path: '*', element: <p>Outro destino</p> },
    ],
    { initialEntries: [rota] },
  )
  const Envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContextoDaSessao.Provider value={sessao}>{envolver(children)}</ContextoDaSessao.Provider>
    </QueryClientProvider>
  )
  render(<RouterProvider router={roteador} />, { wrapper: Envoltorio })
  return roteador
}

const NOVA = `/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${DATA}`
const linha = (nome: string) => within(screen.getByRole('listitem', { name: nome }))
const presenca = (nome: string) => linha(nome).getByRole('button', { name: new RegExp(`^${nome}`) })
const celula = (nome: string, codigo: string) => linha(nome).getByRole('button', { name: new RegExp(`^${codigo} · `) })
const botaoSalvar = () => screen.getByRole('button', { name: /^Salvar classe/ })
const enviado = () => (estado.enfileirar.mock.calls[0]?.[0] as { chave: string; payload: { correcao: boolean; registroAulaId: string; corpo: { presencas: { dbvId: string; presente: boolean; versaoVista: string | null }[]; requisitosMarcados: { dbvId: string; requisitoId: string }[]; requisitosDesmarcados: unknown[]; aulaPlanejadaId: string | null } } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${HOJE}T12:10:00.000Z`) })
  estado.modo = 'ONLINE'
  estado.podeMarcar = true
  pacoteBaixado.total = 0
  estado.itens = []
  estado.rascunhos.clear()
  estado.enfileirar.mockClear()
  estado.aviso.success.mockClear()
  guardar()
  servidor.use(handlerAulas([]), handlerCronograma(criarCronograma({ aulas: [] })), handlerPacote(criarPacote(), pacoteBaixado))
})
afterEach(() => vi.useRealTimers())

describe('Registro de aula nova', () => {
  it('abre com todos presentes, os requisitos da aula publicada da data e Salvar habilitado', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveValue(HOJE)
    expect(screen.getByText('Texto de R1')).toBeInTheDocument()
    expect(screen.queryByText('Texto de R3')).not.toBeInTheDocument()
    await waitFor(() => expect(botaoSalvar()).toBeEnabled())
    expect(botaoSalvar()).toHaveTextContent('Salvar classe · 3 presentes')
    expect(screen.getByText('Lista atualizada hoje às 09:05')).toBeInTheDocument()
  })

  it('salva na fila com todos os membros, os requisitos marcados e a aula planejada, e volta ao Início', async () => {
    const roteador = montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    await userEvent.click(celula('Ana Clara', 'R1'))
    await userEvent.click(presenca('Lia Dias'))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { chave, payload } = enviado()
    expect(chave).toBe(`aula:${CLASSE_COMPANHEIRO.id}:${HOJE}`)
    expect(payload.correcao).toBe(false)
    expect(payload.corpo.aulaPlanejadaId).toBe(PLANEJADA)
    expect(payload.corpo.presencas).toEqual([
      { dbvId: ANA, presente: true, versaoVista: null },
      { dbvId: BRUNO, presente: true, versaoVista: null },
      { dbvId: LIA, presente: false, versaoVista: null },
    ])
    expect(payload.corpo.requisitosMarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
    expect(estado.aviso.success).toHaveBeenCalledWith('Classe salva', expect.anything())
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/inicio'))
  })

  it('data passada com aula planejada abre com os requisitos dela e liga a aula planejada (leitura do cronograma)', async () => {
    const PASSADA = uuid(51)
    servidor.use(
      handlerCronograma(
        criarCronograma({ aulas: [criarAulaDoCronograma({ id: PASSADA, data: DATA, situacao: 'NAO_REGISTRADA', requisitos: [requisito(R1, 'R1'), requisito(R3, 'R3')] })] }),
      ),
    )
    montar(NOVA)
    expect(await screen.findByText('Texto de R3')).toBeInTheDocument()
    expect(screen.getByText('Texto de R1')).toBeInTheDocument()
    expect(screen.queryByText('Texto de R2')).not.toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.corpo.aulaPlanejadaId).toBe(PASSADA)
  })

  it('a conexão cai no meio do registro retroativo: as colunas do planejado continuam e o envio leva a aula planejada', async () => {
    const PASSADA = uuid(51)
    servidor.use(
      handlerCronograma(
        criarCronograma({ aulas: [criarAulaDoCronograma({ id: PASSADA, data: DATA, situacao: 'NAO_REGISTRADA', requisitos: [requisito(R1, 'R1'), requisito(R3, 'R3')] })] }),
      ),
    )
    montar(NOVA)
    expect(await screen.findByText('Texto de R3')).toBeInTheDocument()
    estado.modo = 'SEM_CONEXAO'
    await userEvent.click(presenca('Ana Clara'))
    await userEvent.click(presenca('Ana Clara'))
    expect(screen.getByText('Texto de R3')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Ana Clara' })).getByRole('button', { name: /^R3 · / })).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.corpo.aulaPlanejadaId).toBe(PASSADA)
  })

  it('aberta sem rede numa data passada, quando a conexão volta lê o cronograma e envia a aula planejada', async () => {
    const PASSADA = uuid(51)
    let pedidos = 0
    servidor.use(
      http.get('/api/classes/:id/cronograma', () => {
        pedidos += 1
        return HttpResponse.json(
          criarCronograma({ aulas: [criarAulaDoCronograma({ id: PASSADA, data: DATA, situacao: 'NAO_REGISTRADA', requisitos: [requisito(R1, 'R1'), requisito(R3, 'R3')] })] }),
        )
      }),
    )
    estado.modo = 'SEM_CONEXAO'
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(pedidos).toBe(0)
    expect(screen.queryByText('Texto de R3')).not.toBeInTheDocument()
    estado.modo = 'ONLINE'
    await userEvent.click(presenca('Ana Clara'))
    await userEvent.click(presenca('Ana Clara'))
    expect(await screen.findByText('Texto de R3')).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.corpo.aulaPlanejadaId).toBe(PASSADA)
  })

  it('enquanto o cronograma da data carrega, Salvar classe fica desabilitado', async () => {
    servidor.use(http.get('/api/classes/:id/cronograma', () => new Promise<Response>(() => undefined)))
    montar(NOVA)
    await screen.findByText('Registro de classe')
    expect(botaoSalvar()).toBeDisabled()
  })

  it('requisito só para presente: faltou desabilita a coluna e desfaz a marcação', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    await userEvent.click(celula('Ana Clara', 'R1'))
    expect(celula('Ana Clara', 'R1')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(presenca('Ana Clara'))
    expect(celula('Ana Clara', 'R1')).toBeDisabled()
    expect(celula('Ana Clara', 'R1')).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(presenca('Ana Clara'))
    expect(celula('Ana Clara', 'R1')).toHaveAttribute('aria-pressed', 'false')
    expect(botaoSalvar()).toHaveTextContent('3 presentes')
  })

  it('concluído antes aparece feito e travado; o que falta lista só presentes que não cumpriram', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    const travada = celula('Bruno Lima', 'R2')
    expect(travada).toBeDisabled()
    expect(travada).toHaveAttribute('aria-pressed', 'true')
    expect(travada).toHaveAccessibleName('R2 · Bruno Lima · concluído antes · feito em 20/02')
    expect(travada).toHaveTextContent('20/02')
    const faltas = screen.getByRole('region', { name: 'O que falta fazer' })
    expect(within(faltas).getByText(/Ana, Bruno/)).toBeInTheDocument()
    expect(within(faltas).getByText(/Ana, Lia/)).toBeInTheDocument()
    await userEvent.click(celula('Ana Clara', 'R1'))
    await userEvent.click(celula('Bruno Lima', 'R1'))
    await userEvent.click(celula('Lia Dias', 'R1'))
    await userEvent.click(celula('Ana Clara', 'R2'))
    await userEvent.click(celula('Lia Dias', 'R2'))
    expect(within(faltas).getAllByText(/Todos concluíram/)).toHaveLength(2)
  })

  it('a ficha do próprio instrutor aparece como "você", sem marcação de requisito', async () => {
    const IVO = uuid(304)
    guardar([classe({ membros: [membro(ANA, 'Ana Clara'), membro(IVO, 'Ivo Instrutor', 'DBV', [R2], undefined, true)] })])
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    expect(linha('Ivo Instrutor').getByText('você')).toBeInTheDocument()
    expect(linha('Ivo Instrutor').queryAllByRole('button', { name: /^R\d · / })).toHaveLength(0)
    expect(linha('Ivo Instrutor').getByText('Outro instrutor ou o Adm registra os seus requisitos.')).toBeInTheDocument()
    expect(celula('Ana Clara', 'R1')).toBeEnabled()
  })

  it('instrutor ausente não vê a frase sobre os próprios requisitos', async () => {
    const IVO = uuid(304)
    guardar([classe({ membros: [membro(ANA, 'Ana Clara'), membro(IVO, 'Ivo Instrutor', 'DBV', [], undefined, true)] })])
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    await userEvent.click(linha('Ivo Instrutor').getByRole('button', { pressed: true }))
    expect(linha('Ivo Instrutor').getByText('Faltou')).toBeInTheDocument()
    expect(linha('Ivo Instrutor').queryByText('Outro instrutor ou o Adm registra os seus requisitos.')).not.toBeInTheDocument()
  })

  it('pontos provisórios contam só requisito novo de DBV; LIDER não pontua', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    await userEvent.click(celula('Ana Clara', 'R1'))
    await userEvent.click(celula('Lia Dias', 'R1'))
    expect(screen.getByText('5 pts')).toBeInTheDocument()
  })

  it('sem pontos de requisito ativos não mostra pontos', async () => {
    guardar([classe()], { pontos: 5, ativo: false })
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    expect(screen.queryByText('provisório')).not.toBeInTheDocument()
  })

  it('"+ Requisito" acrescenta um requisito ativo da classe', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    const daClasse = within(screen.getByRole('region', { name: 'Requisitos desta classe' }))
    await userEvent.selectOptions(daClasse.getByLabelText('+ Requisito'), R3)
    expect(screen.getByText('Texto de R3')).toBeInTheDocument()
    expect(celula('Ana Clara', 'R3')).toBeEnabled()
    expect(daClasse.queryByLabelText('+ Requisito')).not.toBeInTheDocument()
  })

  it('o que já está na fila e o rascunho entram por cima', async () => {
    estado.itens = [
      {
        estado: 'NA_FILA',
        criadoEm: 1,
        payload: {
          registroAulaId: uuid(777),
          corpo: { versaoPayload: 1, envioId: uuid(9), classeId: CLASSE_COMPANHEIRO.id, data: DATA, feitaNoAparelhoEm: '2030-03-10T12:00:00.000Z', aulaPlanejadaId: null, presencas: [{ dbvId: LIA, presente: false, versaoVista: null }], requisitosMarcados: [{ dbvId: ANA, requisitoId: R1 }], requisitosDesmarcados: [] },
        },
      } as unknown as ItemFila,
    ]
    estado.rascunhos.set(`aula:${CLASSE_COMPANHEIRO.id}:${DATA}`, { presencas: { [BRUNO]: false }, acoes: {}, extras: [] })
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(celula('Ana Clara', 'R1')).toHaveAttribute('aria-pressed', 'true')
    expect(linha('Lia Dias').getByText('Faltou')).toBeInTheDocument()
    expect(linha('Bruno Lima').getByText('Faltou')).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.registroAulaId).toBe(uuid(777))
  })

  it('sem `data` na rota assume hoje (data civil do clube), não o dia UTC', async () => {
    vi.setSystemTime(new Date('2030-03-16T01:30:00.000Z'))
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}`)
    await screen.findByText('Ana Clara')
    expect(screen.getByLabelText('Data')).toHaveValue('2030-03-15')
  })

  it('data fora dos últimos 30 dias mostra erro e não abre a aula', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=2030-01-01`)
    expect(await screen.findByText(/Escolha uma data entre/)).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara')).not.toBeInTheDocument()
  })

  it('funciona sem conexão, a partir do pacote, com aviso e sem nenhum pedido ao servidor', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.all('/api/*', () => HttpResponse.error()))
    montar(NOVA)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(screen.getByText(/Sem conexão\. A classe fica guardada/)).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(estado.aviso.success).toHaveBeenCalledWith('Classe salva', { description: 'Vai ser enviada quando houver internet.' })
  })

  it('já existe aula da data no servidor: abre como correção, sem o que ninguém tocou', async () => {
    servidor.use(
      handlerAulas([criarResumoAula({ id: uuid(700), data: DATA })]),
      handlerAula(criarDetalheAula({ presencas: [{ dbvId: ANA, nome: 'Ana Clara', presente: true, versao: '2030-03-10T12:00:00.000Z' }, { dbvId: BRUNO, nome: 'Bruno Lima', presente: true, versao: '2030-03-10T12:00:00.000Z' }] })),
    )
    montar(NOVA)
    await screen.findByText('Ana Clara')
    await waitFor(() => expect(botaoSalvar()).toBeDisabled())
  })
})

describe('Edição de aula', () => {
  const presencas = [
    { dbvId: ANA, nome: 'Ana Clara', presente: true, versao: '2030-03-10T12:00:00.000Z' },
    { dbvId: BRUNO, nome: 'Bruno Lima', presente: false, versao: '2030-03-10T12:01:00.000Z' },
  ]

  it('data travada, Salvar desabilitado até tocar, e só o tocado vai na correção com a versão vista', async () => {
    servidor.use(handlerAula(criarDetalheAula({ presencas, requisitosDaAula: [requisito(R1, 'R1')], concluidosNaAula: [{ dbvId: ANA, requisitoId: R1 }] })))
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument()
    expect(screen.getByText(/Companheiro · .* 10\/03/)).toBeInTheDocument()
    expect(celula('Ana Clara', 'R1')).toHaveAttribute('aria-pressed', 'true')
    expect(celula('Ana Clara', 'R1')).toBeEnabled()
    expect(botaoSalvar()).toBeDisabled()
    await userEvent.click(presenca('Bruno Lima'))
    await userEvent.click(celula('Bruno Lima', 'R1'))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { payload } = enviado()
    expect(payload.correcao).toBe(true)
    expect(payload.registroAulaId).toBe(uuid(700))
    expect(payload.corpo.presencas).toEqual([{ dbvId: BRUNO, presente: true, versaoVista: '2030-03-10T12:01:00.000Z' }])
    expect(payload.corpo.requisitosMarcados).toEqual([{ dbvId: BRUNO, requisitoId: R1 }])
  })

  it('correção de cobrança em que todos entregaram: a entrega aparece no bloco da tarefa, com desfazer, e o requisito não volta à grade', async () => {
    const anterior = { id: uuid(602), registroAulaId: uuid(701), data: '2030-03-03', encerrada: false, itens: [{ requisitoId: R3 }] }
    guardar([classe({ tarefas: [anterior] })])
    servidor.use(
      handlerAula(
        criarDetalheAula({
          presencas,
          requisitosDaAula: [requisito(R3, 'R3')],
          concluidosNaAula: [{ dbvId: ANA, requisitoId: R3 }, { dbvId: BRUNO, requisitoId: R3 }],
        }),
      ),
    )
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByRole('listitem', { name: 'Ana Clara' })
    const bloco = within(screen.getByRole('region', { name: 'Cobrar tarefa de 03/03' }))
    expect(bloco.getByRole('button', { name: 'Entregue em 10/03 · Ana Clara · desfazer' })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Ana Clara' })).queryByRole('button', { name: /^R3 · / })).not.toBeInTheDocument()
  })

  it('desmarcar o que foi concluído nesta aula vai em requisitosDesmarcados', async () => {
    servidor.use(handlerAula(criarDetalheAula({ presencas, requisitosDaAula: [requisito(R1, 'R1')], concluidosNaAula: [{ dbvId: ANA, requisitoId: R1 }] })))
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    await userEvent.click(celula('Ana Clara', 'R1'))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.corpo.requisitosDesmarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
  })

  it('sem conexão abre a aula a partir dos registros recentes do pacote', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.all('/api/*', () => HttpResponse.error()))
    guardar([classe({ registrosRecentes: [{ id: uuid(700), data: DATA, aulaPlanejadaId: null, presencas: presencas.map((p) => ({ dbvId: p.dbvId, presente: p.presente, versao: p.versao })) }] })])
    montar(`/aulas/${uuid(700)}/editar`)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(linha('Bruno Lima').getByText('Faltou')).toBeInTheDocument()
    expect(screen.getByText(/Companheiro · .* 10\/03/)).toBeInTheDocument()
  })

  it('sem conexão, aula só do pacote: o concluído nesta aula fica marcado e desmarcável; o de outra aula segue travado com a data', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.all('/api/*', () => HttpResponse.error()))
    guardar([
      classe({
        membros: [
          membro(ANA, 'Ana Clara', 'DBV', [R1], [{ requisitoId: R1, concluidoEm: DATA, registroAulaId: uuid(700) }]),
          membro(BRUNO, 'Bruno Lima', 'DBV', [R2], [{ requisitoId: R2, concluidoEm: '2030-02-20', registroAulaId: uuid(701) }]),
        ],
        registrosRecentes: [{ id: uuid(700), data: DATA, aulaPlanejadaId: null, presencas: presencas.map((p) => ({ dbvId: p.dbvId, presente: true, versao: p.versao })) }],
      }),
    ])
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    const daAula = celula('Ana Clara', 'R1')
    expect(daAula).toBeEnabled()
    expect(daAula).toHaveAttribute('aria-pressed', 'true')
    expect(daAula).not.toHaveAccessibleName(/concluído antes/)
    await userEvent.click(daAula)
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(enviado().payload.corpo.requisitosDesmarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
  })

  it('sem conexão e sem a aula no aparelho, avisa que precisa de internet', async () => {
    estado.modo = 'SEM_CONEXAO'
    montar(`/aulas/${uuid(999)}/editar`)
    expect(await screen.findByText('Esta classe não está neste aparelho')).toBeInTheDocument()
  })

  it('erro do servidor sem cópia no aparelho mostra o erro com "Tentar de novo"', async () => {
    servidor.use(handlerErroAula(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Aula não encontrada.' }))
    montar(`/aulas/${uuid(999)}/editar`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Aula não encontrada.')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('erro de rede com a aula guardada no pacote cai para o pacote', async () => {
    servidor.use(http.get('/api/aulas/:id', () => HttpResponse.error()))
    guardar([classe({ registrosRecentes: [{ id: uuid(700), data: DATA, aulaPlanejadaId: null, presencas: [{ dbvId: ANA, presente: true, versao: '2030-03-10T12:00:00.000Z' }] }] })])
    montar(`/aulas/${uuid(700)}/editar`)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
  })
})

describe('Para casa no registro', () => {
  const OUTRO_REGISTRO = uuid(710)
  const TAREFA_ANTERIOR = { id: uuid(600), registroAulaId: OUTRO_REGISTRO, data: '2030-03-01', encerrada: false, itens: [{ requisitoId: R3 }] }
  const NOS = { id: uuid(21), nome: 'Nós e Amarras', area: 'Artes e habilidades manuais' }
  const paraCasa = () => within(screen.getByRole('region', { name: 'Para casa' }))
  const corpoEnviado = () => (estado.enfileirar.mock.calls[0]?.[0] as { payload: { especialidades?: Record<string, string>; corpo: { tarefaId: string | null; tarefaItensAcrescentados: unknown[]; tarefaItensRetirados: unknown[]; presencas: unknown[] } } }).payload
  const precede = (antes: HTMLElement, depois: HTMLElement) => Boolean(antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('as seções vêm na ordem: cabeçalho, presença, requisitos desta classe, o que falta, para casa e salvar', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    const ordem = [
      screen.getByRole('heading', { name: 'Registro de classe' }),
      screen.getByRole('region', { name: 'Presença e requisitos' }),
      screen.getByRole('heading', { name: 'Requisitos desta classe' }),
      screen.getByRole('heading', { name: 'O que falta fazer' }),
      screen.getByRole('heading', { name: 'Para casa' }),
      botaoSalvar(),
    ]
    ordem.slice(1).forEach((secao, i) => expect(precede(ordem[i], secao), `${i + 1}`).toBe(true))
  })

  it('abrir com conexão rebaixa o pacote', async () => {
    montar(NOVA)
    await screen.findByText('Ana Clara')
    await waitFor(() => expect(pacoteBaixado.total).toBe(1))
  })

  it('sem conexão ao abrir, o pacote não é pedido', async () => {
    estado.modo = 'SEM_CONEXAO'
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(pacoteBaixado.total).toBe(0)
  })

  it('"Passar o que faltou" passa os requisitos do dia que algum presente não cumpriu, e salvar leva a tarefa no mesmo envio', async () => {
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    expect(paraCasa().getByText('Nada para casa.')).toBeInTheDocument()
    await userEvent.click(celula('Ana Clara', 'R1'))
    await userEvent.click(paraCasa().getByRole('button', { name: 'Passar o que faltou' }))
    expect(paraCasa().getByText('R1 · Texto de R1')).toBeInTheDocument()
    expect(paraCasa().getByText('R2 · Texto de R2')).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { corpo } = corpoEnviado()
    expect(corpo.tarefaItensAcrescentados).toEqual([{ requisitoId: R1 }, { requisitoId: R2 }])
    expect(corpo.tarefaItensRetirados).toEqual([])
    expect(corpo.tarefaId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sem internet o item da fila leva os itens da tarefa; "Tirar" desfaz o que acabou de passar', async () => {
    estado.modo = 'SEM_CONEXAO'
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByText('Ana Clara')
    await userEvent.selectOptions(paraCasa().getByLabelText('+ Requisito'), R3)
    await userEvent.selectOptions(paraCasa().getByLabelText('+ Requisito'), R1)
    await userEvent.click(paraCasa().getByRole('button', { name: 'Tirar R1' }))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(corpoEnviado().corpo.tarefaItensAcrescentados).toEqual([{ requisitoId: R3 }])
    expect(estado.aviso.success).toHaveBeenCalledWith('Classe salva', { description: 'Vai ser enviada quando houver internet.' })
  })

  it('"+ Requisito" do Para casa não oferece o item de tarefa aberta de outro registro', async () => {
    guardar([classe({ tarefas: [TAREFA_ANTERIOR] })])
    montar(NOVA)
    await screen.findByRole('listitem', { name: 'Ana Clara' })
    const opcoes = within(paraCasa().getByLabelText('+ Requisito')).getAllByRole('option')
    expect(opcoes.map((o) => o.textContent)).toEqual(['Escolha um requisito', 'R1 · Texto de R1', 'R2 · Texto de R2'])
  })

  it('"Passar o que faltou" ignora o requisito que já está em tarefa aberta da classe', async () => {
    guardar([classe({ tarefas: [{ ...TAREFA_ANTERIOR, itens: [{ requisitoId: R1 }] }] })])
    montar(`/aulas/nova?classe=${CLASSE_COMPANHEIRO.id}&data=${HOJE}`)
    await screen.findByRole('listitem', { name: 'Ana Clara' })
    await userEvent.click(paraCasa().getByRole('button', { name: 'Passar o que faltou' }))
    expect(paraCasa().queryByText('R1 · Texto de R1')).not.toBeInTheDocument()
    expect(paraCasa().getByText('R2 · Texto de R2')).toBeInTheDocument()
  })

  it('edição só da tarefa: os itens da tarefa do registro aparecem, "Tirar" habilita Salvar e o envio usa o id da tarefa existente', async () => {
    estado.modo = 'SEM_CONEXAO'
    const propria = { id: uuid(601), registroAulaId: uuid(700), data: DATA, encerrada: false, itens: [{ requisitoId: R3 }] }
    guardar([classe({ tarefas: [propria], registrosRecentes: [{ id: uuid(700), data: DATA, aulaPlanejadaId: null, presencas: [{ dbvId: ANA, presente: true, versao: '2030-03-10T12:00:00.000Z' }] }] })])
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    expect(paraCasa().getByText('R3 · Texto de R3')).toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
    await userEvent.click(paraCasa().getByRole('button', { name: 'Tirar R3' }))
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    const { corpo } = corpoEnviado()
    expect(corpo.tarefaId).toBe(uuid(601))
    expect(corpo.tarefaItensRetirados).toEqual([{ requisitoId: R3 }])
    expect(corpo.presencas).toEqual([])
  })

  it('especialidade: busca no catálogo do pacote, passa, e o payload guarda o nome dela', async () => {
    guardar([classe()], { pontos: 5, ativo: true }, [NOS])
    montar(NOVA)
    await screen.findByText('Ana Clara')
    await userEvent.click(paraCasa().getByRole('button', { name: '+ Especialidade' }))
    await userEvent.type(paraCasa().getByRole('searchbox', { name: 'Buscar especialidade' }), 'nos')
    await userEvent.click(paraCasa().getByRole('button', { name: /Nós e Amarras/ }))
    expect(paraCasa().getByText('Nós e Amarras')).toBeInTheDocument()
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledOnce())
    expect(corpoEnviado().corpo.tarefaItensAcrescentados).toEqual([{ especialidadeId: NOS.id }])
    expect(corpoEnviado().especialidades).toEqual({ [NOS.id]: 'Nós e Amarras' })
  })

  it('sem permissão de marcar requisito não há parte de especialidade', async () => {
    estado.podeMarcar = false
    guardar([classe()], { pontos: 5, ativo: true }, [NOS])
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(paraCasa().queryByRole('button', { name: '+ Especialidade' })).not.toBeInTheDocument()
    expect(paraCasa().getByLabelText('+ Requisito')).toBeInTheDocument()
  })

  it('pacote antigo, sem catálogo: pede internet uma vez e o botão some', async () => {
    guardar([classe()])
    if (estado.pacote.pacote) estado.pacote.pacote.instrutor = criarPacoteInstrutorAntigo({ classes: [classe()] })
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(paraCasa().getByText('Para passar especialidade, abra o app com internet uma vez')).toBeInTheDocument()
    expect(paraCasa().queryByRole('button', { name: '+ Especialidade' })).not.toBeInTheDocument()
  })
})

describe('Estados da tela', () => {
  it('carregando: o pacote ainda está sendo lido', () => {
    estado.pacote = { pacote: null, carregando: true, baixadoEm: null }
    montar(NOVA)
    expect(screen.getByRole('status', { name: 'Carregando a classe' })).toBeInTheDocument()
  })

  it('vazio: instrutor sem classes', async () => {
    guardar([])
    montar(NOVA)
    expect(await screen.findByText('Você ainda não tem classes')).toBeInTheDocument()
  })

  it('vazio: classe sem desbravadores cursando', async () => {
    guardar([classe({ membros: [] })])
    montar(NOVA)
    expect(await screen.findByText('Nenhum desbravador cursando esta classe')).toBeInTheDocument()
  })

  it('vazio: classe que não é do instrutor', async () => {
    montar(`/aulas/nova?classe=${uuid(999)}&data=${DATA}`)
    expect(await screen.findByText('Esta classe não é sua')).toBeInTheDocument()
  })

  it('sem conexão e sem pacote baixado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    estado.pacote = { pacote: null, carregando: false, baixadoEm: null }
    montar(NOVA)
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('Substituição: alvo fixo, destinos e R1', () => {
  const OUTRA = { ...CLASSE_COMPANHEIRO, id: uuid(401), nome: 'Pesquisador' }
  const comAlvo = (filho: ReactNode) => <ProvedorDeAlvoFixo alvo={{ classeId: CLASSE_COMPANHEIRO.id, data: HOJE }}>{filho}</ProvedorDeAlvoFixo>
  const substituicao = { autor: 'Ana Souza', semConta: true, geradoPor: 'Rita Campos', lancou: true }

  it('critério 13: com alvo fixo a data não pode ser trocada e a classe é a do alvo', async () => {
    guardar([classe({ classe: OUTRA }), classe()])
    montar(`/aulas/nova?classe=${OUTRA.id}&data=${DATA}`, comAlvo)
    expect(await screen.findByText('Ana Clara')).toBeInTheDocument()
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Classe' })).not.toBeInTheDocument()
    expect(screen.getByText(/^Companheiro · .* 15\/03$/)).toBeInTheDocument()
  })

  it('sem alvo fixo, os seletores de classe e de data continuam', async () => {
    guardar([classe({ classe: OUTRA }), classe()])
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(screen.getByLabelText('Data')).toHaveValue(DATA)
    expect(screen.getByRole('combobox', { name: 'Classe' })).toBeInTheDocument()
  })

  it('com o contexto de destinos trocado, salvar vai ao destino dado', async () => {
    const roteador = montar(NOVA, (filho) => <ProvedorDeDestinos destinos={{ depoisDeSalvarRegistroDaClasse: '/substituto/t/salvo' }}>{filho}</ProvedorDeDestinos>)
    await screen.findByText('Ana Clara')
    await waitFor(() => expect(botaoSalvar()).toBeEnabled())
    await userEvent.click(botaoSalvar())
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/substituto/t/salvo'))
  })

  it('o estado vazio volta ao destino dado', async () => {
    guardar([])
    montar(NOVA, (filho) => <ProvedorDeDestinos destinos={{ voltarDoRegistroDaClasse: { caminho: '/substituto/t', rotulo: 'Voltar ao link' } }}>{filho}</ProvedorDeDestinos>)
    expect(await screen.findByRole('link', { name: 'Voltar ao link' })).toHaveAttribute('href', '/substituto/t')
  })

  it('sem conexão, "Registrar classe" abre o registro pelo caminho dado', () => {
    const roteador = createMemoryRouter([{ path: '/', element: <ProvedorDeDestinos destinos={{ registroDaClasse: () => '/substituto/t/classe' }}><ClassesSemConexao /></ProvedorDeDestinos> }])
    render(<RouterProvider router={roteador} />)
    expect(screen.getByRole('link', { name: 'Registrar classe' })).toHaveAttribute('href', '/substituto/t/classe')
  })

  it('R1: registro lançado pelo substituto sem conta, com o Adm que gerou o link', async () => {
    servidor.use(handlerAula(criarDetalheAula({ substituicao })))
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    const aviso = screen.getByText(/^Substituição\./).closest('p')
    expect(aviso).toHaveTextContent('Substituição. Registro da classe lançado por Ana Souza (sem conta no app), pelo link que Rita Campos (Adm) gerou.')
  })

  it('R1: membro que só alterou o registro, sem o parêntese', async () => {
    servidor.use(handlerAula(criarDetalheAula({ substituicao: { ...substituicao, autor: 'Marcos Lima', semConta: false, lancou: false } })))
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    expect(screen.getByText(/^Substituição\./).closest('p')).toHaveTextContent('Substituição. Registro da classe alterado por Marcos Lima, pelo link que Rita Campos (Adm) gerou.')
  })

  it('R1 também no registro da data que já existe no servidor', async () => {
    servidor.use(handlerAulas([criarResumoAula({ id: uuid(700), data: DATA })]), handlerAula(criarDetalheAula({ substituicao })))
    montar(NOVA)
    await screen.findByText('Ana Clara')
    expect(await screen.findByText(/^Substituição\./)).toBeInTheDocument()
  })

  it('sem substituição não há R1', async () => {
    servidor.use(handlerAula(criarDetalheAula()))
    montar(`/aulas/${uuid(700)}/editar`)
    await screen.findByText('Ana Clara')
    expect(screen.queryByText(/^Substituição\./)).not.toBeInTheDocument()
  })
})
