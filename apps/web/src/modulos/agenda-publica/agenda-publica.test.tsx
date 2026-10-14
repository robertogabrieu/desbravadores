import type { AgendaPublicaSaida } from '@desbravadores/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { definirTokenAcesso } from '../../api/cliente'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotas } from '../../rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
}))

type Compromisso = AgendaPublicaSaida['compromissos'][number]

const compromisso = (parcial: Partial<Compromisso>): Compromisso => ({
  data: '2026-10-18',
  nome: 'Reunião',
  tipo: 'REUNIAO',
  horario: '09:00',
  local: 'Igreja Central',
  uniforme: 'CAMPO',
  ...parcial,
})

const agenda = (compromissos: Compromisso[]): AgendaPublicaSaida => ({
  clube: { nome: 'Clube de Desbravadores Exemplo' },
  hoje: '2026-10-13',
  compromissos,
})

const AGENDA_COMPLETA = agenda([
  // Fora de ordem de propósito: o próximo é o de menor data, não o primeiro da resposta.
  compromisso({ data: '2026-10-25' }),
  compromisso({ data: '2026-10-22', nome: 'Ensaio da apresentação', tipo: 'REUNIAO_EXTRA', horario: '19:00' }),
  compromisso({ data: '2026-10-18' }),
  compromisso({ data: '2026-10-31', nome: 'Dia do Desbravador', tipo: 'EVENTO', horario: '14:00', local: 'Parque Municipal', uniforme: null }),
  compromisso({ data: '2026-11-14', fim: '2026-11-16', nome: 'Acampamento de unidades', tipo: 'ACAMPAMENTO', horario: '19:00', local: 'Sítio Recanto Verde', uniforme: 'GALA' }),
  compromisso({ data: '2026-11-29', nome: 'Fim de semana prolongado', tipo: 'SEM_REUNIAO', horario: null, local: null, uniforme: null }),
  compromisso({ data: '2026-12-25', nome: 'Natal', tipo: 'FERIADO', horario: null, local: null, uniforme: null }),
])

const ENDERECO = '/agenda/clube-exemplo'
const responder = (corpo: AgendaPublicaSaida) => http.get('/api/agenda-publica/:slug', () => HttpResponse.json(corpo))
const montar = (endereco = ENDERECO) => renderizarRotas(rotas, endereco, { enderecoDoNavegador: endereco })

beforeEach(() => {
  conexao.modo = 'ONLINE'
})

afterEach(() => {
  definirTokenAcesso(null)
  window.history.pushState({}, '', '/')
})

describe('conteúdo', () => {
  it('mostra o cabeçalho do clube e o próximo compromisso como o de menor data', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    expect(await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()
    expect(screen.getByText('Agenda para pais e responsáveis')).toBeInTheDocument()
    const proximo = screen.getByRole('article', { name: 'Reunião' })
    expect(within(proximo).getByText(/Próximo compromisso · domingo, 18 de outubro/)).toBeInTheDocument()
    expect(within(proximo).getByText('9h')).toBeInTheDocument()
    expect(within(proximo).getByText('Igreja Central')).toBeInTheDocument()
  })

  it('a reunião semanal sai com "Uniforme de campo"', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const proximo = await screen.findByRole('article', { name: 'Reunião' })
    expect(within(proximo).getByText('Uniforme de campo')).toBeInTheDocument()
  })

  it('evento sem uniforme não ganha etiqueta; o cadastrado (gala) aparece', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    const evento = within(lista).getByRole('heading', { name: 'Dia do Desbravador' }).closest('li') as HTMLElement
    expect(within(evento).getByText(/14h · Parque Municipal/)).toBeInTheDocument()
    expect(within(evento).queryByText(/Uniforme/)).not.toBeInTheDocument()
    const acampamento = within(lista).getByRole('heading', { name: 'Acampamento de unidades' }).closest('li') as HTMLElement
    expect(within(acampamento).getByText('Uniforme de gala')).toBeInTheDocument()
    expect(within(acampamento).getByText('14–16')).toBeInTheDocument()
  })

  it('agrupa por mês e não repete o tipo no cartão da lista', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    expect(within(lista).getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
    expect(within(lista).getByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
    expect(within(lista).queryByText('Reunião extra')).not.toBeInTheDocument()
  })

  it('compromisso em curso que começou no mês anterior fica sob o mês de hoje, com o intervalo no rótulo', async () => {
    servidor.use(
      responder({ ...agenda([compromisso({ data: '2026-10-30', fim: '2026-11-02', nome: 'Acampamento em curso', tipo: 'ACAMPAMENTO' })]), hoje: '2026-11-02' }),
    )
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    expect(within(lista).getByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
    expect(within(lista).queryByRole('heading', { name: 'Outubro de 2026' })).not.toBeInTheDocument()
    expect(within(lista).getByText('30–2')).toBeInTheDocument()
  })

  it('evento que vira o mês mostra os dois meses no rótulo do dia', async () => {
    servidor.use(responder(agenda([compromisso({ data: '2026-10-30', fim: '2026-11-02', nome: 'Acampamento de virada', tipo: 'ACAMPAMENTO' })])))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    expect(within(lista).getByText('30–2')).toBeInTheDocument()
    expect(within(lista).getByText('out–nov')).toBeInTheDocument()
  })

  it('dois compromissos iguais no mesmo dia aparecem sem aviso de key duplicada', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const igual = compromisso({ data: '2026-10-22', nome: 'Ensaio', tipo: 'REUNIAO_EXTRA' })
    servidor.use(responder(agenda([igual, { ...igual }])))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    expect(within(lista).getAllByText('Ensaio')).toHaveLength(2)
    expect(erro.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/)
    erro.mockRestore()
  })

  it('a lista mostra todos os compromissos da janela, sem corte de quantidade', async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => compromisso({ data: `2026-11-${String(i + 1).padStart(2, '0')}`, nome: `Compromisso ${i + 1}` }))
    servidor.use(responder(agenda([...muitos, compromisso({ data: '2026-12-13', nome: 'Feriado de dezembro', tipo: 'FERIADO', horario: null, local: null, uniforme: null })])))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    expect(within(lista).getByRole('heading', { name: 'Compromisso 12' })).toBeInTheDocument()
    expect(within(lista).getByRole('heading', { name: 'Sem reunião' })).toBeInTheDocument()
  })

  it('Sem reunião, Feriado e Férias viram o aviso "Sem reunião", sem uniforme', async () => {
    servidor.use(responder(agenda([compromisso({ data: '2026-12-25', nome: 'Natal', tipo: 'FERIADO', horario: null, local: null, uniforme: null })])))
    montar()
    const lista = await screen.findByRole('region', { name: 'Próximos compromissos' })
    const aviso = within(lista).getByRole('heading', { name: 'Sem reunião' }).closest('li') as HTMLElement
    expect(within(aviso).getByText('Natal')).toBeInTheDocument()
    expect(within(aviso).queryByText(/Uniforme/)).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('traz o rodapé', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    expect(await screen.findByText('Dúvidas sobre horário ou local? Fale com a diretoria do clube.')).toBeInTheDocument()
  })
})

describe('calendário', () => {
  it('mostra um mês por vez, com a abreviação escrita no dia', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const calendario = await screen.findByRole('region', { name: 'Calendário do clube' })
    expect(within(calendario).getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
    expect(within(calendario).getByRole('img', { name: '18, Reunião' })).toHaveTextContent('Reun.')
    expect(within(calendario).getByRole('img', { name: '22, Reunião extra' })).toHaveTextContent('Extra')
    expect(within(calendario).getByRole('img', { name: '31, Evento' })).toHaveTextContent('Evento')
    expect(within(calendario).getByRole('img', { name: '13, hoje' })).toBeInTheDocument()
    const usuario = userEvent.setup()
    await usuario.click(within(calendario).getByRole('button', { name: 'Próximo mês' }))
    expect(within(calendario).getByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
    expect(within(calendario).getByRole('img', { name: '14, Acampamento' })).toHaveTextContent('Acamp.')
    expect(within(calendario).getByRole('img', { name: '16, Acampamento' })).toHaveTextContent('Acamp.')
    expect(within(calendario).getByRole('img', { name: '29, Sem reunião' })).toHaveTextContent('Sem')
    expect(within(calendario).getByText('Reunião')).toBeInTheDocument()
    expect(within(calendario).getByText('Acampamento')).toBeInTheDocument()
  })

  it('só navega dentro da janela de 120 dias a partir de hoje', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const calendario = await screen.findByRole('region', { name: 'Calendário do clube' })
    const anterior = within(calendario).getByRole('button', { name: 'Mês anterior' })
    const proximo = within(calendario).getByRole('button', { name: 'Próximo mês' })
    expect(anterior).toBeDisabled()
    const usuario = userEvent.setup()
    // 13/10 + 120 dias = 10/02/2027: outubro, novembro, dezembro, janeiro e fevereiro.
    for (let i = 0; i < 4; i++) await usuario.click(proximo)
    expect(within(calendario).getByRole('heading', { name: 'Fevereiro de 2027' })).toBeInTheDocument()
    expect(proximo).toBeDisabled()
    expect(anterior).toBeEnabled()
    await usuario.click(anterior)
    expect(within(calendario).getByRole('heading', { name: 'Janeiro de 2027' })).toBeInTheDocument()
  })

  it('os botões de mês têm 44px de alvo', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    const proximo = await screen.findByRole('button', { name: 'Próximo mês' })
    expect(proximo.className).toContain('min-h-[var(--touch-min)]')
    expect(proximo.className).toContain('min-w-[var(--touch-min)]')
  })
})

describe('estados', () => {
  it('carregando mostra o esqueleto', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => new Promise<Response>(() => undefined)))
    montar()
    expect(await screen.findByRole('status', { name: 'Carregando a agenda' })).toBeInTheDocument()
  })

  it('vazio explica e não oferece botão', async () => {
    servidor.use(responder(agenda([])))
    montar()
    expect(await screen.findByText('O clube ainda não publicou compromissos para os próximos meses. Volte em breve.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tentar/i })).not.toBeInTheDocument()
  })

  it('erro mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    let pedidos = 0
    servidor.use(
      http.get('/api/agenda-publica/:slug', () => {
        pedidos += 1
        return pedidos === 1 ? HttpResponse.json({ codigo: 'ERRO', mensagem: 'x' }, { status: 500 }) : HttpResponse.json(AGENDA_COMPLETA)
      }),
    )
    montar()
    expect(await screen.findByText('Não foi possível carregar a agenda.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()
    expect(pedidos).toBe(2)
  })

  it('sem conexão a página monta a própria faixa, com o que já carregou', async () => {
    conexao.modo = 'SEM_CONEXAO'
    servidor.use(responder(AGENDA_COMPLETA))
    montar()
    expect(await screen.findByRole('status', { name: 'Sem conexão' })).toHaveTextContent('Sem conexão')
    expect(await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado, o pedido falha com a faixa e a opção de tentar de novo', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.error()))
    montar()
    expect(await screen.findByText('Não foi possível carregar a agenda.')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Sem conexão' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('200 fora do contrato mostra só o erro com "Tentar de novo", sem a faixa de sem conexão', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.json({ qualquer: 'coisa' })))
    montar()
    expect(await screen.findByText('Não foi possível carregar a agenda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Sem conexão' })).not.toBeInTheDocument()
  })

  it('link inexistente mostra "Agenda não encontrada"', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'x' }, { status: 404 })))
    montar()
    expect(await screen.findByText('Agenda não encontrada. Confira o link com a diretoria do clube.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })
})

describe('sem sessão e sem buscador', () => {
  it('nenhum pedido sai com Authorization, mesmo havendo sessão guardada', async () => {
    definirTokenAcesso('token-de-um-pai-que-tambem-usa-o-app')
    const cabecalhos: (string | null)[] = []
    servidor.use(
      http.get('/api/agenda-publica/:slug', ({ request }) => {
        cabecalhos.push(request.headers.get('Authorization'))
        return HttpResponse.json(AGENDA_COMPLETA)
      }),
    )
    const pedidos: string[] = []
    servidor.events.on('request:start', ({ request }) => {
      if (request.headers.get('Authorization')) pedidos.push(new URL(request.url).pathname)
    })
    montar()
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    expect(cabecalhos).toEqual([null])
    expect(pedidos.filter((caminho) => caminho.startsWith('/api/agenda-publica'))).toEqual([])
    servidor.events.removeAllListeners()
  })

  it('põe noindex no head ao montar e tira ao desmontar', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    const { unmount } = montar()
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull())
    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('o noindex vale também no link inexistente', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'x' }, { status: 404 })))
    montar()
    await screen.findByText(/Agenda não encontrada/)
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull()
  })

  it('a rota não pede login', async () => {
    servidor.use(responder(AGENDA_COMPLETA))
    const { roteador } = montar()
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    expect(roteador.state.location.pathname).toBe(ENDERECO)
  })
})
