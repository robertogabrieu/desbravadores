import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarEvento, handlerCalendario } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { simularLargura } from '../../../testes/midia'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

vi.mock('../../../api/desbravadores', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../api/desbravadores')>()),
  hojeDoClube: () => '2026-10-05',
}))

const feira = criarEvento(1, { nome: 'Feira de saúde', tipo: 'EVENTO', inicio: '2026-10-11', fim: '2026-10-11', horario: '14:00', local: 'Praça Central' })
const acampamento = criarEvento(2, { nome: 'Acampamento do clube', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', temReuniao: false })
const feriado = criarEvento(3, { nome: 'Feriado municipal', tipo: 'FERIADO', inicio: '2026-10-17', fim: '2026-10-17' })
const semReuniao = criarEvento(4, { nome: 'Sem reunião', tipo: 'SEM_REUNIAO', inicio: '2026-10-17', fim: '2026-10-17' })
const extra = criarEvento(5, { nome: 'Encontro', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-17', fim: '2026-10-17', horario: '19:30' })
const novembro = criarEvento(6, { nome: 'Caminhada', tipo: 'EVENTO', inicio: '2026-11-14', fim: '2026-11-14' })

const EVENTOS = [feira, acampamento, feriado, semReuniao, extra, novembro]

function abrirEm(rota: string) {
  servidor.use(
    handlerConfiguracao(criarConfiguracao({ diaReuniao: 0, horaReuniao: '15:00' })),
    handlerCalendario({ eventos: EVENTOS, diasDeReuniao: ['2026-10-04', '2026-10-11'] }),
  )
  return renderizarRotas(rotasAdmCalendario, rota)
}

const grade = async () => within(await screen.findByRole('group', { name: 'Outubro de 2026' }))

describe('calendário · no celular', () => {
  beforeEach(() => simularLargura(390))

  it('cada dia é um botão que diz o dia e o que há nele, com um ponto por tipo (no máximo três)', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const dias = await grade()
    const onze = dias.getByRole('button', { name: '11 de outubro: reunião regular e evento do clube' })
    expect(onze.querySelectorAll('[data-ponto]')).toHaveLength(2)
    expect(dias.getByRole('button', { name: '12 de outubro' }).querySelectorAll('[data-ponto]')).toHaveLength(0)
    const dezessete = dias.getByRole('button', { name: /^17 de outubro: / })
    expect(dezessete.querySelectorAll('[data-ponto]')).toHaveLength(3)
    expect(dias.getByRole('button', { name: '5 de outubro, hoje' })).toBeInTheDocument()
    expect(dias.queryByRole('link')).not.toBeInTheDocument()
  })

  it('ao abrir o mês, o dia escolhido é hoje', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    expect(await screen.findByRole('region', { name: 'Segunda-feira, 5 de outubro' })).toBeInTheDocument()
    expect((await grade()).getByRole('button', { name: '5 de outubro, hoje' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('mês sem hoje abre no primeiro dia com evento', async () => {
    abrirEm('/adm/calendario?mes=2026-11')
    expect(await screen.findByRole('region', { name: 'Sábado, 14 de novembro' })).toBeInTheDocument()
  })

  it('mês só com reuniões regulares abre na primeira reunião, não no dia 1', async () => {
    servidor.use(
      handlerConfiguracao(criarConfiguracao({ diaReuniao: 0, horaReuniao: '15:00' })),
      handlerCalendario({ eventos: [], diasDeReuniao: ['2026-12-06', '2026-12-13'] }),
    )
    renderizarRotas(rotasAdmCalendario, '/adm/calendario?mes=2026-12')
    expect(await screen.findByRole('region', { name: 'Domingo, 6 de dezembro' })).toBeInTheDocument()
  })

  it('?dia= no endereço abre aquele dia', async () => {
    abrirEm('/adm/calendario?mes=2026-10&dia=2026-10-16')
    const painel = within(await screen.findByRole('region', { name: 'Sexta-feira, 16 de outubro' }))
    expect(painel.getByRole('link', { name: /Acampamento do clube/ })).toBeInTheDocument()
  })

  it('tocar num dia mostra a reunião com a hora e o evento com o link para a ficha, sem criar nada', async () => {
    const { roteador } = abrirEm('/adm/calendario?mes=2026-10')
    await userEvent.click((await grade()).getByRole('button', { name: /^11 de outubro/ }))
    const painel = within(screen.getByRole('region', { name: 'Domingo, 11 de outubro' }))
    expect(painel.getByText('Reunião regular')).toBeInTheDocument()
    expect(painel.getByText('15h')).toBeInTheDocument()
    expect(painel.queryByRole('link', { name: /Reunião regular/ })).not.toBeInTheDocument()
    const link = painel.getByRole('link', { name: /Feira de saúde/ })
    expect(link).toHaveAttribute('href', `/adm/calendario/eventos/${feira.id}`)
    expect(painel.getByText('Evento do clube · 11/10 · 14h · Praça Central')).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/adm/calendario')
    expect(roteador.state.location.search).toBe('?mes=2026-10&dia=2026-10-11')
    expect((await grade()).getByRole('button', { name: /^11 de outubro/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('dia vazio diz que não há nada e oferece o novo evento naquele dia', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    await userEvent.click((await grade()).getByRole('button', { name: '12 de outubro' }))
    const painel = within(screen.getByRole('region', { name: 'Segunda-feira, 12 de outubro' }))
    expect(painel.getByText('Nada marcado neste dia.')).toBeInTheDocument()
    expect(painel.getByRole('link', { name: 'Novo evento neste dia' })).toHaveAttribute('href', '/adm/calendario/eventos/novo?data=2026-10-12')
  })

  it('a legenda vem recolhida e abre pelo botão', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const botao = await screen.findByRole('button', { name: 'O que cada cor quer dizer' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Legenda' })).not.toBeInTheDocument()
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('list', { name: 'Legenda' })).getByText('Reunião regular · 15h')).toBeInTheDocument()
  })

  it('a lista do mês continua abaixo do painel do dia', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const painel = await screen.findByRole('region', { name: 'Segunda-feira, 5 de outubro' })
    const lista = screen.getByRole('list', { name: 'Eventos de Outubro' })
    expect(painel.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('calendário · no computador', () => {
  it('a grade continua com os eventos em texto, a legenda aberta e sem o painel do dia', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const dias = await grade()
    expect(dias.getByRole('link', { name: 'Feira de saúde' })).toBeInTheDocument()
    expect(dias.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legenda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'O que cada cor quer dizer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /de outubro$/ })).not.toBeInTheDocument()
  })
})
