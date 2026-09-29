import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { hojeNoFuso } from '@desbravadores/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao, PacoteGuardado } from '../../offline'
import {
  UNIDADE_AGUIAS,
  UNIDADE_LEOES,
  criarInicioConselheiro,
  handlerErroInicio,
  handlerInicioConselheiro,
} from '../../testes/handlers/inicio'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasInicio } from './rotas'

const CHAVE_IOS = 'convite-instalacao-ios-visto'

const offline = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pacote: null as PacoteGuardado['pacote'],
}))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
  usePacote: () => ({ pacote: offline.pacote, carregando: false, baixadoEm: null }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.pacote = null
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function simularIphone(): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')
}

function dispararConviteDeInstalacao() {
  const prompt = vi.fn(() => Promise.resolve())
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  act(() => {
    window.dispatchEvent(evento)
  })
  return { prompt, evento }
}

describe('início provisório', () => {
  it('cumprimenta pelo primeiro nome, mostra papel e clube e o cartão "Em construção"', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument()
    expect(screen.getByText(/Instrutor/)).toBeInTheDocument()
    expect(screen.getByText(/Clube Teste/)).toBeInTheDocument()
    expect(screen.getByText('Em construção')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unidade/i })).not.toBeInTheDocument()
  })
})

describe('convite de instalação', () => {
  it('botão "Instalar app" aparece quando o navegador oferece e abre o convite', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
    // Deixa os efeitos da tela rodarem: é neles que o ouvinte de `beforeinstallprompt` é registrado.
    await act(async () => {})
    const { prompt, evento } = dispararConviteDeInstalacao()
    expect(evento.defaultPrevented).toBe(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Instalar app' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('no iPhone mostra as duas instruções uma única vez', async () => {
    simularIphone()
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    const primeira = renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText(/Compartilhar → Adicionar à Tela de Início/)).toBeInTheDocument()
    expect(screen.getByText(/Depois de instalar, entre de novo pelo ícone/)).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(CHAVE_IOS)).toBe('1'))
    primeira.unmount()

    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByText(/Compartilhar → Adicionar à Tela de Início/)).not.toBeInTheDocument()
  })

  it('fora do iPhone não mostra instruções de iPhone', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByText(/Compartilhar/)).not.toBeInTheDocument()
  })
})

type ReunioesDoPacote = NonNullable<PacoteGuardado['pacote']>['reunioesRecentes']

const CONSELHEIRO = criarVinculo('CONSELHEIRO', 1, { unidades: [UNIDADE_AGUIAS] })
const CONSELHEIRO_DE_DUAS = criarVinculo('CONSELHEIRO', 1, { unidades: [UNIDADE_AGUIAS, UNIDADE_LEOES] })

describe('início do conselheiro', () => {
  it('mostra saudação, unidade, próxima reunião, números, atalhos e destaques, sem sino', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro())
    renderizarRotas(rotasInicio, '/inicio')

    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument()
    expect(screen.getByText('Conselheiro · Águias')).toBeInTheDocument()
    expect(await screen.findByText('Domingo, 29 de setembro')).toBeInTheDocument()
    expect(screen.getByText('8h30 · Cantinho da unidade')).toBeInTheDocument()
    expect(screen.getByText('DBVs na unidade').previousSibling).toHaveTextContent('8')
    expect(screen.getByText('Frequência no mês').previousSibling).toHaveTextContent('87%')
    expect(screen.getByText('Unidade no ranking').previousSibling).toHaveTextContent('2º')
    expect(screen.getByRole('link', { name: 'Unidade' })).toHaveAttribute('href', '/unidade')
    expect(screen.getByRole('link', { name: 'Reuniões' })).toHaveAttribute('href', '/reunioes')
    expect(screen.getByRole('link', { name: 'Galeria' })).toHaveAttribute('href', '/galeria')
    expect(screen.getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking')
    expect(screen.getByRole('link', { name: /Ana Clara Souza/ })).toHaveAttribute('href', expect.stringMatching(/^\/dbv\/.+/))
    expect(screen.getByText('446 pts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /notificações/i })).not.toBeInTheDocument()
  })

  it('carregando: mostra o esqueleto até a resposta chegar', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), http.get('/api/inicio/conselheiro', async () => new Promise<Response>(() => {})))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('status', { name: 'Carregando o início' })).toBeInTheDocument()
  })

  it('"Fazer chamada" aparece só quando a reunião é hoje e a chamada não foi feita', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro())
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('link', { name: 'Fazer chamada' })).toHaveAttribute('href', '/reunioes/nova')
  })

  it('reunião que não é hoje: sem "Fazer chamada"', async () => {
    const proxima = { data: '2030-10-06', horario: '08:30' as const, local: null, ehHoje: false, chamadaFeita: false }
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: proxima })))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByText('Domingo, 6 de outubro')
    expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
  })

  it('chamada já feita hoje: sem "Fazer chamada" e avisa que está feita', async () => {
    const proxima = { data: '2030-09-29', horario: '08:30' as const, local: null, ehHoje: true, chamadaFeita: true }
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: proxima })))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText('Chamada feita')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
  })

  it('sem reunião marcada: avisa em vez do cartão', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: null })))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText('Nenhuma reunião marcada.')).toBeInTheDocument()
  })

  it('sem posição da unidade e sem frequência: o número de lugar some e a frequência vira "—"', async () => {
    servidor.use(
      ...handlersSessao([CONSELHEIRO]),
      handlerInicioConselheiro(criarInicioConselheiro({ posicaoUnidade: null, frequenciaMes: null, destaques: [] })),
    )
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByText('DBVs na unidade')
    expect(screen.queryByText('Unidade no ranking')).not.toBeInTheDocument()
    expect(screen.getByText('Frequência no mês').previousSibling).toHaveTextContent('—')
    expect(screen.queryByText('Destaques da unidade')).not.toBeInTheDocument()
  })

  it('seletor de unidade só com 2 ou mais; trocar busca os números da outra unidade', async () => {
    const consultas: string[] = []
    servidor.use(
      ...handlersSessao([CONSELHEIRO_DE_DUAS]),
      handlerInicioConselheiro(criarInicioConselheiro(), (consulta) => consultas.push(String(consulta.get('unidadeId')))),
    )
    renderizarRotas(rotasInicio, '/inicio')
    await userEvent.selectOptions(await screen.findByLabelText('Unidade'), UNIDADE_LEOES.id)
    await waitFor(() => expect(consultas).toContain(UNIDADE_LEOES.id))
    expect(consultas[0]).toBe(UNIDADE_AGUIAS.id)
  })

  it('uma unidade só: sem seletor', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro())
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByText('DBVs na unidade')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it('sem unidade: vazio orientando falar com o Adm, sem chamar a API', async () => {
    const chamadas: string[] = []
    servidor.use(
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
      handlerInicioConselheiro(criarInicioConselheiro(), (consulta) => chamadas.push(consulta.toString())),
    )
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText('Você ainda não tem unidade. Fale com o Adm do clube.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
  })

  it('erro da API: mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerErroInicio(500, { codigo: 'ERRO_INTERNO', mensagem: 'Deu ruim no servidor' }))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText('Deu ruim no servidor')).toBeInTheDocument()

    servidor.use(handlerInicioConselheiro())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('DBVs na unidade')).toBeInTheDocument()
  })

  it('resposta que foge do contrato cai no estado de erro', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), http.get('/api/inicio/conselheiro', () => HttpResponse.json({ oi: 1 })))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  describe('sem conexão', () => {
    const hoje = hojeNoFuso('America/Sao_Paulo', new Date())
    const diaDeHoje = new Date(`${hoje}T00:00:00Z`).getUTCDay()
    const pacoteDeHoje = (reunioesRecentes: ReunioesDoPacote = []) =>
      criarPacote({
        clube: { ...criarPacote().clube, diaReuniao: diaDeHoje, horaReuniao: '09:00', localReuniaoPadrao: 'Salão' },
        reunioesRecentes,
      })

    it('mostra a próxima reunião do pacote e traços nos números', async () => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje()
      servidor.use(...handlersSessao([CONSELHEIRO]), http.get('/api/inicio/conselheiro', () => HttpResponse.error()))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('9h · Salão')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
      expect(screen.getByText('DBVs na unidade').previousSibling).toHaveTextContent('—')
      expect(screen.getByText('Frequência no mês').previousSibling).toHaveTextContent('—')
      expect(screen.queryByText('Unidade no ranking')).not.toBeInTheDocument()
    })

    it('chamada de hoje já no pacote: sem "Fazer chamada"', async () => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje([
        { id: '00000000-0000-4000-8000-000000000777', unidadeId: UNIDADE_AGUIAS.id, data: hoje, horario: '09:00', local: null, observacoes: null, cabecalhoVersao: '2030-01-01T00:00:00.000Z', chamada: [] },
      ])
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Chamada feita')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
    })

    it('sem pacote guardado: "Disponível quando houver internet"', async () => {
      offline.modo = 'SEM_CONEXAO'
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    })
  })
})
