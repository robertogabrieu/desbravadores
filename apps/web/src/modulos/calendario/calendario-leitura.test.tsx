import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao, PacoteGuardado } from '../../offline'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasCalendario } from './rotas'

type Pacote = NonNullable<PacoteGuardado['pacote']>
type EventoDoPacote = Pacote['calendario'][number]

const offline = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pacote: null as PacoteGuardado['pacote'],
  carregando: false,
  baixadoEm: null as number | null,
}))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
  usePacote: () => ({ pacote: offline.pacote, carregando: offline.carregando, baixadoEm: offline.baixadoEm }),
}))

// 11/10/2026, meio-dia no fuso do clube.
const AGORA = '2026-10-11T15:00:00Z'
const BAIXADO_EM_10_10 = Date.parse('2026-10-10T15:00:00Z')
const BAIXADO_EM_08_10 = Date.parse('2026-10-08T15:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(AGORA))
  offline.modo = 'ONLINE'
  offline.pacote = null
  offline.carregando = false
  offline.baixadoEm = null
})

afterEach(() => {
  vi.useRealTimers()
})

function evento(parcial: Partial<EventoDoPacote> & Pick<EventoDoPacote, 'nome' | 'tipo' | 'inicio'>): EventoDoPacote {
  return { fim: parcial.inicio, horario: null, local: null, temReuniao: true, temClasse: false, bomParaCampo: false, ...parcial }
}

const EVENTOS: EventoDoPacote[] = [
  evento({ nome: 'Já passou', tipo: 'EVENTO', inicio: '2026-10-05' }),
  evento({ nome: 'Feriado: Nossa Senhora Aparecida', tipo: 'FERIADO', inicio: '2026-10-12' }),
  evento({
    nome: 'Aniversário do clube', tipo: 'EVENTO_ESPECIAL', inicio: '2026-10-17', horario: '19:00', local: 'Salão da igreja',
    uniforme: 'CAMPO', pontosParticipacao: 15, pontosUniforme: 5,
  }),
  evento({ nome: 'Encontro da Classe Bíblica', tipo: 'CLASSE_BIBLICA', inicio: '2026-10-25' }),
  evento({
    nome: 'Culto de Investidura', tipo: 'EVENTO_ESPECIAL', inicio: '2026-10-31', horario: '18:30', local: 'Igreja Central',
    uniforme: 'GALA', pontosParticipacao: 20, pontosUniforme: 10,
  }),
  evento({ nome: 'Acampamento de primavera', tipo: 'ACAMPAMENTO', inicio: '2026-11-13', fim: '2026-11-15', horario: '18:00', local: 'Sítio Boa Vista' }),
  evento({ nome: 'Férias de fim de ano', tipo: 'FERIAS', inicio: '2026-12-21', fim: '2027-01-03' }),
]

function abrir(papel: 'CONSELHEIRO' | 'INSTRUTOR' = 'CONSELHEIRO') {
  servidor.use(...handlersSessao([criarVinculo(papel)]))
  return renderizarRotas(rotasCalendario, '/calendario')
}

describe('calendário de leitura: com o pacote guardado', () => {
  beforeEach(() => {
    offline.pacote = criarPacote({ calendario: EVENTOS })
    offline.baixadoEm = BAIXADO_EM_10_10
  })

  it('lista por mês os eventos que ainda vão acontecer, sem Classe Bíblica nem os que já passaram', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário do clube' })).toBeInTheDocument()
    expect(screen.getByText('Os eventos do clube que ainda vão acontecer. Quem cadastra é o Adm do clube.')).toBeInTheDocument()
    expect(screen.getByText('Reunião regular: domingos, 9h · dados deste aparelho, de 10/10')).toBeInTheDocument()

    const meses = screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)
    expect(meses).toEqual(['Outubro de 2026', 'Novembro de 2026', 'Dezembro de 2026'])
    const outubro = within(screen.getByRole('region', { name: 'Outubro de 2026' }))
    expect(outubro.getAllByRole('article').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Feriado: Nossa Senhora Aparecida',
      'Aniversário do clube',
      'Culto de Investidura',
    ])
    expect(screen.queryByText('Já passou')).not.toBeInTheDocument()
    expect(screen.queryByText('Encontro da Classe Bíblica')).not.toBeInTheDocument()
  })

  it('só leitura: nenhum botão nem link de escrita', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1, name: 'Calendário do clube' })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /novo|editar/i })).not.toBeInTheDocument()
  })

  it('evento especial: chip, uniforme em texto e o que vale de ponto', async () => {
    abrir()
    const culto = within(await screen.findByRole('article', { name: 'Culto de Investidura' }))
    expect(culto.getByText('Evento especial')).toBeInTheDocument()
    expect(culto.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(culto.getByText('18h30 · Igreja Central')).toBeInTheDocument()
    expect(culto.getByText('Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala.')).toBeInTheDocument()

    const aniversario = within(screen.getByRole('article', { name: 'Aniversário do clube' }))
    expect(aniversario.getByText('Uniforme de campo')).toBeInTheDocument()
    expect(aniversario.getByText('Vale pontos no ranking: 15 por ir, mais 5 pelo uniforme de campo.')).toBeInTheDocument()
  })

  it('feriado, acampamento e férias: rótulo do tipo, sem uniforme nem pontos', async () => {
    abrir()
    const feriado = within(await screen.findByRole('article', { name: 'Feriado: Nossa Senhora Aparecida' }))
    expect(feriado.getByText('Feriado')).toBeInTheDocument()
    expect(feriado.getByText('Dia inteiro')).toBeInTheDocument()
    const acampamento = within(screen.getByRole('article', { name: 'Acampamento de primavera' }))
    expect(acampamento.getByText('Acampamento / campo')).toBeInTheDocument()
    expect(acampamento.getByText('Sexta, 18h · Sítio Boa Vista')).toBeInTheDocument()
    const ferias = within(screen.getByRole('article', { name: 'Férias de fim de ano' }))
    expect(ferias.getByText('Até 3 de janeiro · sem reunião nos domingos')).toBeInTheDocument()
    expect(screen.getAllByText(/Vale pontos/)).toHaveLength(2)
  })

  it('pontos que valem zero somem da frase; sem nenhum ponto, a frase some', async () => {
    offline.pacote = criarPacote({
      calendario: [
        evento({ nome: 'Só uniforme', tipo: 'EVENTO_ESPECIAL', inicio: '2026-10-20', uniforme: 'CAMPO', pontosParticipacao: 0, pontosUniforme: 10 }),
        evento({ nome: 'Sem pontos', tipo: 'EVENTO_ESPECIAL', inicio: '2026-10-21', uniforme: 'GALA', pontosParticipacao: 0, pontosUniforme: 0 }),
      ],
    })
    abrir()
    expect(await screen.findByText('Vale pontos no ranking: 10 pelo uniforme de campo.')).toBeInTheDocument()
    expect(screen.getAllByText(/Vale pontos/)).toHaveLength(1)
    expect(within(screen.getByRole('article', { name: 'Sem pontos' })).getByText('Uniforme de gala')).toBeInTheDocument()
  })

  it('o instrutor lê onde ficam as datas das classes dele; o conselheiro não', async () => {
    const instrutor = abrir('INSTRUTOR')
    expect(await screen.findByText(/As datas das suas classes estão em Cronograma\./)).toBeInTheDocument()
    instrutor.unmount()

    abrir('CONSELHEIRO')
    await screen.findByRole('heading', { level: 1, name: 'Calendário do clube' })
    expect(screen.queryByText(/estão em Cronograma/)).not.toBeInTheDocument()
  })

  it('sem internet: avisa de quando é o calendário guardado e segue mostrando a lista', async () => {
    offline.modo = 'SEM_CONEXAO'
    offline.baixadoEm = BAIXADO_EM_08_10
    abrir()
    expect(await screen.findByText('Sem internet. Você vê o calendário de 08/10.')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Culto de Investidura' })).toBeInTheDocument()
  })

  it('pacote do substituto (sem `lista`): mostra os mesmos pontos e uniformes', async () => {
    abrir()
    const culto = await screen.findByRole('article', { name: 'Culto de Investidura' })
    expect(EVENTOS.every((item) => !('lista' in item))).toBe(true)
    expect(within(culto).getByText(/Vale pontos no ranking: 20 por ir/)).toBeInTheDocument()
  })
})

describe('calendário de leitura: estados', () => {
  it('carregando: mostra o lugar do conteúdo, sem lista nem aviso', async () => {
    offline.carregando = true
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando o calendário' })).toBeInTheDocument()
    expect(screen.queryByText('Disponível quando houver internet')).not.toBeInTheDocument()
  })

  it('sem eventos a vir: diz que são os dados deste aparelho e de quando, sem afirmar que o clube não tem evento', async () => {
    offline.pacote = criarPacote({ calendario: [evento({ nome: 'Já passou', tipo: 'EVENTO', inicio: '2026-10-05' })] })
    offline.baixadoEm = BAIXADO_EM_10_10
    abrir()
    expect(await screen.findByText('Nenhum evento nos dados deste aparelho')).toBeInTheDocument()
    expect(screen.getByText(/Atualizados em 10\/10\./)).toBeInTheDocument()
    expect(screen.queryByText(/não tem evento/i)).not.toBeInTheDocument()
  })

  it('sem internet e sem calendário guardado: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByText('Conecte-se uma vez para guardar o calendário neste aparelho.')).toBeInTheDocument()
    expect(screen.queryByText(/Sem internet\. Você vê/)).not.toBeInTheDocument()
  })

  it('não existe estado de erro: nunca aparece "Tentar de novo"', async () => {
    abrir()
    await screen.findByText('Disponível quando houver internet')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })
})
