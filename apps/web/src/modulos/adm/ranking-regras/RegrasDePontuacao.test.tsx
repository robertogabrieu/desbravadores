import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarEventoDeRegras, criarRegras, handlerErroRegras, handlersRegras } from '../../../testes/handlers/ranking-regras'
import { criarVinculo, handlersSessao } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmRankingRegras } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

beforeEach(() => {
  estado.modo = 'ONLINE'
})

const TUDO = ['ranking.configurar', 'calendario.gerenciar']

function abrir(handlers: Parameters<typeof servidor.use>, permissoes: string[] = TUDO) {
  servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, permissoes), ...handlers)
  return renderizarRotas(rotasAdmRankingRegras, '/adm/ranking/regras')
}

const eventos = [
  criarEventoDeRegras(),
  criarEventoDeRegras({
    id: '00000000-0000-4000-8000-000000007002',
    nome: 'Campori Regional',
    inicio: '2026-08-21',
    fim: '2026-08-23',
    uniforme: 'CAMPO',
    pontosParticipacao: 40,
    pontosUniforme: 10,
    listaConcluida: false,
    foram: null,
  }),
]

describe('Regras de pontuação · conteúdo', () => {
  it('mostra título, migalha para o ranking e os 4 grupos na ordem do mockup', async () => {
    abrir(handlersRegras(criarRegras(eventos)))
    expect(await screen.findByRole('region', { name: 'Em eventos especiais' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Regras de pontuação' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking')
    expect(screen.getByText('Tudo que dá ponto no ranking, em um só lugar. Para mudar quanto vale cada coisa, toque em Editar.')).toBeInTheDocument()

    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Na reunião de domingo', 'Nas aulas', 'Na Classe Bíblica', 'Em eventos especiais'])
    expect(screen.getByText('Quem lança: o conselheiro, na chamada')).toBeInTheDocument()
    expect(screen.getByText('Quem lança: o instrutor, ao marcar o que foi feito')).toBeInTheDocument()
    expect(screen.getByText('Quem lança: o responsável pela chamada da classe')).toBeInTheDocument()
    expect(screen.getByText('Cada evento define os próprios pontos, no calendário. Lançado na lista de quem foi.')).toBeInTheDocument()
  })

  it('cada regra fixa traz selo com texto, nome, descrição, pontos e Editar', async () => {
    abrir(handlersRegras(criarRegras(eventos)))
    const grupo = within(await screen.findByRole('region', { name: 'Na reunião de domingo' }))
    await screen.findByRole('button', { name: 'Editar Presença' })
    const linhas = grupo.getAllByRole('listitem')
    expect(linhas).toHaveLength(5)
    expect(within(linhas[0]).getByText('Ligada')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('Presença')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('O desbravador foi marcado como presente na chamada.')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('+10')).toBeInTheDocument()
    expect(within(linhas[0]).getByRole('button', { name: 'Editar Presença' })).toBeEnabled()
    expect(within(linhas[4]).getByText('Desligada')).toBeInTheDocument()
    expect(within(linhas[4]).getByText('Lição ou devocional em dia')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Editar / })).toHaveLength(9)
  })

  it('o resumo conta as regras ligadas e soma a reunião perfeita', async () => {
    abrir(handlersRegras(criarRegras(eventos)))
    expect(await screen.findByText('8 de 9')).toBeInTheDocument()
    expect(screen.getByText('regras fixas estão ligadas')).toBeInTheDocument()
    expect(screen.getByText('23 pontos')).toBeInTheDocument()
    expect(screen.getByText('é o que um desbravador ganha numa reunião perfeita')).toBeInTheDocument()
  })

  it('religar Lição recalcula o resumo e destaca a linha', async () => {
    abrir(handlersRegras(criarRegras(eventos)))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Lição ou devocional em dia' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Esta regra dá ponto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pontos' }))

    expect(await screen.findByText('9 de 9')).toBeInTheDocument()
    expect(screen.getByText('26 pontos')).toBeInTheDocument()
    const linha = screen.getByText('Lição ou devocional em dia').closest('li')
    expect(linha).toHaveAttribute('data-destacada', 'true')
  })
})

describe('Regras de pontuação · eventos especiais', () => {
  it('uma linha por evento: selo, data, uniforme pelo nome do calendário, quem foi e link para o calendário', async () => {
    abrir(handlersRegras(criarRegras(eventos)))
    const grupo = within(await screen.findByRole('region', { name: 'Em eventos especiais' }))
    const linhas = grupo.getAllByRole('listitem')
    expect(linhas).toHaveLength(2)

    expect(within(linhas[0]).getByText('Pontos lançados')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('Culto de Sábado Santo')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('sábado, 04/04/2026 · mais 5 pontos com o uniforme de gala · 38 foram')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('+20')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('por ir')).toBeInTheDocument()
    expect(within(linhas[0]).getByRole('link', { name: 'Editar Culto de Sábado Santo no calendário' })).toHaveAttribute(
      'href',
      '/adm/calendario/eventos/00000000-0000-4000-8000-000000007001/editar',
    )

    expect(within(linhas[1]).getByText('Ainda vai ser')).toBeInTheDocument()
    expect(within(linhas[1]).getByText('21 a 23/08/2026 · mais 10 pontos com o uniforme de campo')).toBeInTheDocument()
  })

  it('sem evento: ensina como nascem os pontos e oferece criar no calendário', async () => {
    abrir(handlersRegras(criarRegras([])))
    expect(await screen.findByText('Nenhum evento especial neste ano')).toBeInTheDocument()
    expect(screen.getByText('Os pontos de um evento especial são definidos ao criá-lo no calendário.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar evento no calendário' })).toHaveAttribute('href', '/adm/calendario/eventos/novo')
  })

  it('sem evento e sem permissão do calendário: o botão de criar não aparece', async () => {
    abrir(handlersRegras(criarRegras([])), ['ranking.configurar'])
    expect(await screen.findByText('Nenhum evento especial neste ano')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar evento no calendário' })).not.toBeInTheDocument()
  })

  it('sem permissão do calendário: a linha do evento diz quem pode mudar, sem link', async () => {
    abrir(handlersRegras(criarRegras(eventos)), ['ranking.configurar'])
    expect(await screen.findAllByText('Só quem edita o calendário pode mudar.')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: /no calendário/ })).not.toBeInTheDocument()
  })
})

describe('Regras de pontuação · estados', () => {
  it('carregando', () => {
    abrir([http.get('/api/ranking/regras', () => new Promise(() => undefined))])
    const carregando = screen.getByRole('status', { name: 'Carregando as regras' })
    expect(carregando).toHaveAttribute('aria-busy', 'true')
  })

  it('erro, com Tentar de novo que busca outra vez', async () => {
    abrir([handlerErroRegras()])
    expect(await screen.findByText('Não deu para carregar as regras')).toBeInTheDocument()
    expect(screen.getByText('Nada foi alterado. Confira a internet e tente de novo.')).toBeInTheDocument()

    servidor.use(...handlersRegras(criarRegras(eventos)))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Na reunião de domingo' })).toBeInTheDocument()
  })

  it('sem conexão com a lista em cache: mostra tudo, avisa e desabilita Editar com o motivo', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir(handlersRegras(criarRegras(eventos)))
    expect(await screen.findByText('Sem conexão. Você pode conferir as regras, mas só consegue editar quando a internet voltar.')).toBeInTheDocument()
    const editar = await screen.findByRole('button', { name: 'Editar Presença (indisponível sem conexão)' })
    expect(editar).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Editar Culto de Sábado Santo no calendário (indisponível sem conexão)' })).toBeDisabled()
    expect(screen.getByText('Presença')).toBeInTheDocument()
  })

  it('sem conexão e sem nada guardado: disponível quando houver internet', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir([http.get('/api/ranking/regras', () => HttpResponse.error())])
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('sem permissão para editar: avisa, troca cada Editar pelo motivo e não oferece edição', async () => {
    abrir(handlersRegras(criarRegras(eventos)), ['calendario.gerenciar'])
    // O link do calendário só aparece com a sessão já lida: prova que a falta do Editar é de permissão, não de pressa.
    await screen.findByRole('link', { name: 'Editar Culto de Sábado Santo no calendário' })
    expect(screen.getByText(/Você pode conferir tudo, mas não editar/)).toBeInTheDocument()
    expect(screen.getAllByText('Só quem tem a permissão “Configurar o ranking” pode editar.')).toHaveLength(9)
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument()
    expect(screen.getByText('8 de 9')).toBeInTheDocument()
  })
})
