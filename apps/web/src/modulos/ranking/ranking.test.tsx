import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarRanking, handlerErroRanking, handlerRanking, handlerRankingUnidades } from '../../testes/handlers/ranking'
import { UNIDADE_AGUIAS, UNIDADE_LEOES } from '../../testes/handlers/inicio'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasRanking } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const rotas = [...rotasRanking, { path: '/dbv/:id', element: <p>perfil aberto</p> }]

function abrir() {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
  return renderizarRotas(rotas, '/ranking')
}

describe('ranking do mês', () => {
  it('mostra o pódio (2º, 1º, 3º) e a lista a partir do 4º, sem variação de posição', async () => {
    servidor.use(handlerRanking(), handlerRankingUnidades())
    abrir()
    const podio = await screen.findByRole('list', { name: 'Pódio' })
    const nomes = within(podio).getAllByRole('listitem').map((item) => item.textContent)
    expect(nomes[0]).toContain('Pedro Henrique Lima')
    expect(nomes[1]).toContain('Ana Clara Souza')
    expect(nomes[2]).toContain('Mateus V.')
    const lista = screen.getByRole('list', { name: 'Classificação' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista).getByText('Júlia Ramos')).toBeInTheDocument()
    expect(within(lista).getByText('398 pts')).toBeInTheDocument()
    expect(within(lista).getByText('Leões · Amigo')).toBeInTheDocument()
    expect(screen.queryByText(/mantém/)).not.toBeInTheDocument()
  })

  it('abas: Mês ativa; Trimestre e Ano "em breve" e desabilitadas', async () => {
    servidor.use(handlerRanking(), handlerRankingUnidades())
    abrir()
    await screen.findByRole('list', { name: 'Classificação' })
    expect(screen.getByRole('tab', { name: 'Mês' })).toHaveAttribute('aria-selected', 'true')
    const trimestre = screen.getByRole('button', { name: /Trimestre/ })
    expect(trimestre).toBeDisabled()
    expect(trimestre).toHaveTextContent('em breve')
    expect(screen.getByRole('button', { name: /Ano/ })).toBeDisabled()
  })

  it('mês com setas: anterior pede o mês de trás; seguinte fica desligada no mês corrente', async () => {
    const consultas: Array<string | null> = []
    servidor.use(handlerRanking(criarRanking(), (consulta) => consultas.push(consulta.get('mes'))), handlerRankingUnidades())
    abrir()
    expect(await screen.findByText('setembro de 2030')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mês seguinte' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('agosto de 2030')).toBeInTheDocument()
    expect(consultas).toContain('2030-08')

    await userEvent.click(screen.getByRole('button', { name: 'Mês seguinte' }))
    expect(await screen.findByText('setembro de 2030')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mês seguinte' })).toBeDisabled()
  })

  it('a linha abre o perfil quando abrePerfil é verdadeiro', async () => {
    servidor.use(handlerRanking(), handlerRankingUnidades())
    abrir()
    await userEvent.click(await screen.findByRole('link', { name: /Júlia Ramos/ }))
    expect(await screen.findByText('perfil aberto')).toBeInTheDocument()
  })

  it('sem abrePerfil a linha não é link e tocar nela não navega', async () => {
    servidor.use(handlerRanking(), handlerRankingUnidades())
    const { roteador } = abrir()
    const lista = await screen.findByRole('list', { name: 'Classificação' })
    expect(within(lista).queryByRole('link', { name: /Lucas O\./ })).not.toBeInTheDocument()
    await userEvent.click(within(lista).getByText('Lucas O.'))
    expect(roteador.state.location.pathname).toBe('/ranking')
    expect(screen.queryByRole('link', { name: /Mateus V\./ })).not.toBeInTheDocument()
  })

  it('filtro por unidade: aparece com 2 ou mais unidades e refaz a busca com a unidade escolhida', async () => {
    const unidades: Array<string | null> = []
    servidor.use(handlerRanking(criarRanking(), (consulta) => unidades.push(consulta.get('unidadeId'))), handlerRankingUnidades())
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: UNIDADE_LEOES.nome }))
    await waitFor(() => expect(unidades).toContain(UNIDADE_LEOES.id))
    expect(screen.getByRole('button', { name: UNIDADE_LEOES.nome })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Todas as unidades' }))
    await waitFor(() => expect(unidades.at(-1)).toBeNull())
  })

  it('sem o filtro quando só há uma unidade', async () => {
    servidor.use(handlerRanking(), handlerRankingUnidades([{ posicao: 1, unidade: UNIDADE_AGUIAS, mediaPontos: 10, totalDbvs: 2 }]))
    abrir()
    await screen.findByRole('list', { name: 'Classificação' })
    expect(screen.queryByRole('button', { name: 'Todas as unidades' })).not.toBeInTheDocument()
  })

  it('vazio: "Ainda não há pontos neste mês."', async () => {
    servidor.use(handlerRanking(criarRanking({ itens: [] })), handlerRankingUnidades())
    abrir()
    expect(await screen.findByText('Ainda não há pontos neste mês.')).toBeInTheDocument()
  })

  it('carregando: esqueleto acessível', async () => {
    servidor.use(http.get('/api/ranking', async () => new Promise<Response>(() => {})), handlerRankingUnidades())
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando o ranking' })).toBeInTheDocument()
  })

  it('erro da API: mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    servidor.use(handlerErroRanking(500, { codigo: 'ERRO_INTERNO', mensagem: 'Ranking indisponível agora' }), handlerRankingUnidades())
    abrir()
    expect(await screen.findByText('Ranking indisponível agora')).toBeInTheDocument()
    servidor.use(handlerRanking())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('list', { name: 'Classificação' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
