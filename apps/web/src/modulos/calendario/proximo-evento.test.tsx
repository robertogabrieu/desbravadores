import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PacoteGuardado } from '../../offline'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { CartaoProximoEvento } from './CartaoProximoEvento'

type EventoDoPacote = NonNullable<PacoteGuardado['pacote']>['calendario'][number]

const offline = vi.hoisted(() => ({ pacote: null as PacoteGuardado['pacote'], carregando: false }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  usePacote: () => ({ pacote: offline.pacote, carregando: offline.carregando, baixadoEm: null }),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T15:00:00Z'))
  offline.pacote = null
  offline.carregando = false
})

afterEach(() => {
  vi.useRealTimers()
})

function evento(parcial: Partial<EventoDoPacote> & Pick<EventoDoPacote, 'nome' | 'tipo' | 'inicio'>): EventoDoPacote {
  return { fim: parcial.inicio, horario: null, local: null, temReuniao: true, temClasse: false, bomParaCampo: false, ...parcial }
}

const especial = (parcial: Partial<EventoDoPacote> = {}): EventoDoPacote =>
  evento({
    nome: 'Culto de Investidura', tipo: 'EVENTO_ESPECIAL', inicio: '2026-10-31', horario: '18:30', local: 'Igreja Central',
    uniforme: 'GALA', pontosParticipacao: 20, pontosUniforme: 10, ...parcial,
  })

function montar(eventos: EventoDoPacote[]) {
  offline.pacote = criarPacote({ calendario: eventos })
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
  renderizarRotas([{ path: '/inicio', element: <CartaoProximoEvento /> }], '/inicio')
}

async function abrir(eventos: EventoDoPacote[]) {
  montar(eventos)
  return within(await screen.findByRole('region', { name: 'Próximo evento' }))
}

describe('cartão "Próximo evento"', () => {
  it('evento especial futuro: data por extenso, nome, uniforme, horário e pontos, com o link para o calendário', async () => {
    const cartao = await abrir([especial()])
    expect(cartao.getByText('Sábado, 31 de outubro')).toBeInTheDocument()
    expect(cartao.getByText('Culto de Investidura')).toBeInTheDocument()
    expect(cartao.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(cartao.getByText('18h30 · Igreja Central')).toBeInTheDocument()
    expect(cartao.getByText('Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala.')).toBeInTheDocument()
    expect(cartao.getByRole('link', { name: 'Ver o calendário' })).toHaveAttribute('href', '/calendario')
  })

  it('pega o primeiro a vir, pulando os que já passaram, a Classe Bíblica, o feriado, as férias e as reuniões', async () => {
    const cartao = await abrir([
      evento({ nome: 'Já passou', tipo: 'EVENTO', inicio: '2026-10-05' }),
      evento({ nome: 'Classe Bíblica do mês', tipo: 'CLASSE_BIBLICA', inicio: '2026-10-12' }),
      evento({ nome: 'Feriado', tipo: 'FERIADO', inicio: '2026-10-12' }),
      evento({ nome: 'Reunião extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-13' }),
      evento({ nome: 'Férias', tipo: 'FERIAS', inicio: '2026-10-14', fim: '2026-10-20' }),
      evento({ nome: 'Sem reunião', tipo: 'SEM_REUNIAO', inicio: '2026-10-15' }),
      especial({ nome: 'Depois', inicio: '2026-11-07' }),
      evento({ nome: 'Antes', tipo: 'EVENTO', inicio: '2026-10-24' }),
    ])
    expect(cartao.getByText('Antes')).toBeInTheDocument()
  })

  it('no dia do evento: "Hoje, sábado, 17 de outubro"', async () => {
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z'))
    const cartao = await abrir([especial({ nome: 'Aniversário do clube', inicio: '2026-10-17', uniforme: 'CAMPO', pontosParticipacao: 15, pontosUniforme: 5 })])
    expect(cartao.getByText('Hoje, sábado, 17 de outubro')).toBeInTheDocument()
    expect(cartao.getByText('Uniforme de campo')).toBeInTheDocument()
    expect(cartao.getByText('Vale pontos no ranking: 15 por ir, mais 5 pelo uniforme de campo.')).toBeInTheDocument()
  })

  it('evento de vários dias já em andamento: "Até domingo, 15 de novembro", sem uniforme nem pontos', async () => {
    vi.setSystemTime(new Date('2026-11-14T15:00:00Z'))
    const cartao = await abrir([
      evento({ nome: 'Acampamento de primavera', tipo: 'ACAMPAMENTO', inicio: '2026-11-13', fim: '2026-11-15', horario: '18:00', local: 'Sítio Boa Vista' }),
    ])
    expect(cartao.getByText('Até domingo, 15 de novembro')).toBeInTheDocument()
    expect(cartao.getByText('Sexta, 18h · Sítio Boa Vista')).toBeInTheDocument()
    expect(cartao.queryByText(/Uniforme/)).not.toBeInTheDocument()
    expect(cartao.queryByText(/Vale pontos/)).not.toBeInTheDocument()
  })

  it('evento do clube: sem uniforme nem pontos no cartão', async () => {
    const cartao = await abrir([evento({ nome: 'Piquenique', tipo: 'EVENTO', inicio: '2026-10-24', horario: '10:00', local: 'Parque' })])
    expect(cartao.getByText('Sábado, 24 de outubro')).toBeInTheDocument()
    expect(cartao.queryByText(/Uniforme/)).not.toBeInTheDocument()
    expect(cartao.queryByText(/Vale pontos/)).not.toBeInTheDocument()
  })

  it.each([
    [{ pontosParticipacao: 20, pontosUniforme: 0 }, 'Vale pontos no ranking: 20 por ir.'],
    [{ pontosParticipacao: 0, pontosUniforme: 10 }, 'Vale pontos no ranking: 10 pelo uniforme de gala.'],
    [{ pontosParticipacao: 20, pontosUniforme: 10 }, 'Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala.'],
  ])('a frase de pontos só diz o que vale (%o)', async (pontos, frase) => {
    const cartao = await abrir([especial(pontos)])
    expect(cartao.getByText(frase)).toBeInTheDocument()
  })

  it('especial sem ponto nenhum: a frase some, mas o uniforme pedido aparece', async () => {
    const cartao = await abrir([especial({ nome: 'Confraternização', uniforme: 'CAMPO', pontosParticipacao: 0, pontosUniforme: 0 })])
    expect(cartao.queryByText(/Vale pontos/)).not.toBeInTheDocument()
    expect(cartao.getByText('Uniforme de campo')).toBeInTheDocument()
  })

  it('sem evento à vista, o cartão não aparece', () => {
    montar([evento({ nome: 'Já passou', tipo: 'EVENTO', inicio: '2026-10-05' }), evento({ nome: 'Feriado', tipo: 'FERIADO', inicio: '2026-10-12' })])
    expect(screen.queryByText('Próximo evento')).not.toBeInTheDocument()
  })

  it('enquanto carrega, o cartão não aparece', () => {
    offline.carregando = true
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas([{ path: '/inicio', element: <CartaoProximoEvento /> }], '/inicio')
    expect(screen.queryByText('Próximo evento')).not.toBeInTheDocument()
  })
})
