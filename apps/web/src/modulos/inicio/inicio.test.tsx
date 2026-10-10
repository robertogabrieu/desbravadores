import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { hojeNoFuso } from '@desbravadores/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemFilaNaTela, ModoConexao, PacoteGuardado } from '../../offline'
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
  fila: [] as ItemFilaNaTela[],
  baixadoEm: null as number | null,
}))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
  useFila: () => ({ itens: offline.fila }),
  usePacote: () => ({ pacote: offline.pacote, carregando: false, baixadoEm: offline.baixadoEm }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.pacote = null
  offline.fila = []
  offline.baixadoEm = null
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

type EventoDoPacote = NonNullable<PacoteGuardado['pacote']>['calendario'][number]
type ReunioesDoPacote = NonNullable<PacoteGuardado['pacote']>['reunioesRecentes']

const CONSELHEIRO = criarVinculo('CONSELHEIRO', 1, { unidades: [UNIDADE_AGUIAS] })
const CONSELHEIRO_DE_DUAS = criarVinculo('CONSELHEIRO', 1, { unidades: [UNIDADE_AGUIAS, UNIDADE_LEOES] })

const itemDaFila = (chave: string): ItemFilaNaTela => ({
  id: `item-${chave}`, versaoPayload: 1, usuarioId: 'u', vinculoId: 'v', tipo: 'REUNIAO', chave, rotulo: 'Chamada', detalhe: '', payload: {},
  estado: 'NA_FILA', progresso: 0, tentativas: 0, proximaTentativaEm: null, criadoEm: 0, atualizadoEm: 0, esperandoDependencia: false,
})

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
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toHaveAttribute('href', '/biblioteca')
    expect(screen.getByRole('link', { name: /Ana Clara Souza/ })).toHaveAttribute('href', expect.stringMatching(/^\/dbv\/.+/))
    expect(screen.getByText('446 pts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /notificações/i })).not.toBeInTheDocument()
  })

  it('tem cinco atalhos, e o último é "Biblioteca"', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro())
    renderizarRotas(rotasInicio, '/inicio')

    const secao = (await screen.findByRole('heading', { name: 'Atalhos' })).parentElement as HTMLElement
    const atalhos = within(secao).getAllByRole('link')
    expect(atalhos.map((atalho) => atalho.textContent)).toEqual(['Unidade', 'Reuniões', 'Galeria', 'Ranking', 'Biblioteca'])
    expect(atalhos[4]).toHaveAttribute('href', '/biblioteca')
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
    const proxima = { data: '2030-10-06', horario: '08:30' as const, local: null, nome: null, ehHoje: false, chamadaFeita: false }
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: proxima })))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByText('Domingo, 6 de outubro')
    expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
  })

  it('chamada já feita hoje: sem "Fazer chamada" e avisa que está feita', async () => {
    const proxima = { data: '2030-09-29', horario: '08:30' as const, local: null, nome: null, ehHoje: true, chamadaFeita: true }
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

  describe('pelo calendário, com internet', () => {
    it('em férias: "Férias até 01/02" acima da data da próxima reunião', async () => {
      const proxima = { data: '2030-02-03', horario: '09:00' as const, local: 'Salão da Igreja Central', nome: null, ehHoje: false, chamadaFeita: false }
      servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: proxima, feriasAte: '2030-02-01' })))
      renderizarRotas(rotasInicio, '/inicio')
      const ferias = await screen.findByText('Férias até 01/02')
      const data = screen.getByText('Domingo, 3 de fevereiro')
      expect(ferias.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getByText('9h · Salão da Igreja Central')).toBeInTheDocument()
    })

    it('reunião extra: data, nome, horário e local da extra e "Fazer chamada" no dia', async () => {
      const proxima = { data: '2030-01-25', horario: '15:00' as const, local: 'Parque Ecológico do Tietê', nome: 'Encontro de início de ano', ehHoje: true, chamadaFeita: false }
      servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: proxima })))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Sexta-feira, 25 de janeiro')).toBeInTheDocument()
      expect(screen.getByText('Encontro de início de ano')).toBeInTheDocument()
      expect(screen.getByText('15h · Parque Ecológico do Tietê')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
      expect(screen.queryByText(/calendário de/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Férias até/)).not.toBeInTheDocument()
    })

    it('nada em 120 dias, em férias: diz até quando e que não há reunião nos próximos 4 meses', async () => {
      servidor.use(
        ...handlersSessao([CONSELHEIRO]),
        handlerInicioConselheiro(criarInicioConselheiro({ proximaReuniao: null, feriasAte: '2030-03-15' })),
      )
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Férias até 15/03 · nenhuma reunião marcada nos próximos 4 meses.')).toBeInTheDocument()
    })
  })

  describe('online, mas a falha é classificada como rede (portal de Wi-Fi, resposta fora do contrato)', () => {
    const respostaForaDoContrato = () => http.get('/api/inicio/conselheiro', () => HttpResponse.json({ oi: 1 }))

    it('com pacote: mostra a próxima reunião do pacote e traços nos números', async () => {
      const hoje = hojeNoFuso('America/Sao_Paulo', new Date())
      offline.pacote = criarPacote({
        clube: { ...criarPacote().clube, diaReuniao: new Date(`${hoje}T00:00:00Z`).getUTCDay(), horaReuniao: '09:00', localReuniaoPadrao: 'Salão' },
      })
      servidor.use(...handlersSessao([CONSELHEIRO]), respostaForaDoContrato())
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('9h · Salão')).toBeInTheDocument()
      expect(screen.getByText('DBVs na unidade').previousSibling).toHaveTextContent('—')
      expect(screen.queryByText('Disponível quando houver internet')).not.toBeInTheDocument()
    })

    it('sem pacote: mostra o erro com "Tentar de novo", que busca outra vez', async () => {
      servidor.use(...handlersSessao([CONSELHEIRO]), respostaForaDoContrato())
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()

      servidor.use(handlerInicioConselheiro())
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
      expect(await screen.findByText('DBVs na unidade')).toBeInTheDocument()
    })
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

    it('chamada de hoje só na fila: sem "Fazer chamada" e avisa que está feita', async () => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje()
      offline.fila = [itemDaFila(`${UNIDADE_AGUIAS.id}:${hoje}`)]
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Chamada feita')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
    })

    it('item da fila de outra unidade ou de outro dia não conta como chamada feita', async () => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje()
      offline.fila = [itemDaFila(`${UNIDADE_LEOES.id}:${hoje}`), itemDaFila(`${UNIDADE_AGUIAS.id}:2020-01-01`)]
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
    })

    it('item da fila recusado pela API (ERRO) não conta como chamada feita', async () => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje()
      offline.fila = [{ ...itemDaFila(`${UNIDADE_AGUIAS.id}:${hoje}`), estado: 'ERRO' }]
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
      expect(screen.queryByText('Chamada feita')).not.toBeInTheDocument()
    })

    it.each(['ENVIANDO', 'ENVIADO'] as const)('item da fila em %s conta como chamada feita', async (estado) => {
      offline.modo = 'SEM_CONEXAO'
      offline.pacote = pacoteDeHoje()
      offline.fila = [{ ...itemDaFila(`${UNIDADE_AGUIAS.id}:${hoje}`), estado }]
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Chamada feita')).toBeInTheDocument()
    })

    describe('pelo calendário do pacote', () => {
      const emDias = (dias: number): string => new Date(new Date(`${hoje}T00:00:00Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10)
      const diaEMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`
      const evento = (parcial: Partial<EventoDoPacote>): EventoDoPacote => ({
        nome: 'Evento', tipo: 'EVENTO', inicio: hoje, fim: hoje, horario: null, local: null, temReuniao: true, temClasse: false, bomParaCampo: false, ...parcial,
      })
      const pacoteComCalendario = (calendario: EventoDoPacote[]) =>
        criarPacote({ clube: { ...criarPacote().clube, diaReuniao: (diaDeHoje + 3) % 7, horaReuniao: '09:00', localReuniaoPadrao: 'Salão' }, calendario })

      it('extra hoje: mesma data, nome, horário e local da extra, "Fazer chamada" e "calendário de dd/mm"', async () => {
        offline.modo = 'SEM_CONEXAO'
        offline.baixadoEm = Date.UTC(2030, 0, 24, 15)
        offline.pacote = pacoteComCalendario([
          evento({ tipo: 'REUNIAO_EXTRA', nome: 'Encontro de início de ano', horario: '15:00', local: 'Parque Ecológico do Tietê' }),
        ])
        servidor.use(...handlersSessao([CONSELHEIRO]))
        renderizarRotas(rotasInicio, '/inicio')
        expect(await screen.findByText('Encontro de início de ano')).toBeInTheDocument()
        expect(screen.getByText('15h · Parque Ecológico do Tietê')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
        expect(screen.getByText('calendário de 24/01')).toBeInTheDocument()
      })

      it('em férias: "Férias até" o fim e a próxima reunião é a depois delas', async () => {
        offline.modo = 'SEM_CONEXAO'
        offline.pacote = pacoteComCalendario([evento({ tipo: 'FERIAS', nome: 'Férias', inicio: emDias(-1), fim: emDias(10), temReuniao: false })])
        servidor.use(...handlersSessao([CONSELHEIRO]))
        renderizarRotas(rotasInicio, '/inicio')
        expect(await screen.findByText(`Férias até ${diaEMes(emDias(10))}`)).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Fazer chamada' })).not.toBeInTheDocument()
      })

      it('férias além de 120 dias: avisa que não há reunião nos próximos 4 meses', async () => {
        offline.modo = 'SEM_CONEXAO'
        offline.pacote = pacoteComCalendario([evento({ tipo: 'FERIAS', nome: 'Férias', inicio: emDias(-1), fim: emDias(130), temReuniao: false })])
        servidor.use(...handlersSessao([CONSELHEIRO]))
        renderizarRotas(rotasInicio, '/inicio')
        expect(await screen.findByText(`Férias até ${diaEMes(emDias(130))} · nenhuma reunião marcada nos próximos 4 meses.`)).toBeInTheDocument()
      })

      it('pacote guardado antes do calendário (sem o campo): cai na regra do dia da semana, sem quebrar', async () => {
        offline.modo = 'SEM_CONEXAO'
        const antigo: Partial<NonNullable<PacoteGuardado['pacote']>> = pacoteDeHoje()
        delete antigo.calendario
        offline.pacote = antigo as NonNullable<PacoteGuardado['pacote']>
        servidor.use(...handlersSessao([CONSELHEIRO]))
        renderizarRotas(rotasInicio, '/inicio')
        expect(await screen.findByText('9h · Salão')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Fazer chamada' })).toBeInTheDocument()
        expect(screen.queryByText(/Férias até/)).not.toBeInTheDocument()
      })
    })

    it('sem pacote guardado: "Disponível quando houver internet"', async () => {
      offline.modo = 'SEM_CONEXAO'
      servidor.use(...handlersSessao([CONSELHEIRO]))
      renderizarRotas(rotasInicio, '/inicio')
      expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    })
  })
})

describe('sinais do início do conselheiro', () => {
  it('atalhos com seta, destaque com o ícone de ficha e números sem cara de cartão', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO]), handlerInicioConselheiro())
    renderizarRotas(rotasInicio, '/inicio')
    const destaque = await screen.findByRole('link', { name: /Ana Clara Souza/ })
    expect(destaque.querySelector('[data-sinal="abre-ficha"]')).not.toBeNull()
    expect(destaque.querySelector('[data-sinal="navega"]')).toBeNull()
    for (const rotulo of ['Unidade', 'Reuniões', 'Galeria', 'Ranking', 'Biblioteca']) {
      expect(screen.getByRole('link', { name: rotulo }).querySelector('[data-sinal="navega"]')).not.toBeNull()
    }
    const numero = screen.getByText('DBVs na unidade').parentElement as HTMLElement
    expect(numero.tagName).not.toBe('A')
    expect(numero.className).not.toMatch(/\bborder\b/)
    expect(numero.querySelector('[data-sinal]')).toBeNull()
  })

  it('sem conexão e sem pacote guardado, os atalhos continuam à vista', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(...handlersSessao([CONSELHEIRO]))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Galeria' })).toHaveAttribute('href', '/galeria')
    expect(screen.getByRole('link', { name: 'Unidade' })).toHaveAttribute('href', '/unidade')
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toHaveAttribute('href', '/biblioteca')
  })
})
