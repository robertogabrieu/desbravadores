import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarEvento, criarEventoEspecial, handlerCalendario } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { simularLargura } from '../../../testes/midia'
import { renderizarRotas } from '../../../testes/renderizar'
import { uuid } from '../../../testes/handlers/sessao'
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
    const botao = await screen.findByRole('button', { name: 'O que cada marca quer dizer' })
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

  it('a lista do mês tem o título "Eventos de outubro" logo antes dela', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const titulo = await screen.findByRole('heading', { name: 'Eventos de outubro' })
    const lista = screen.getByRole('list', { name: 'Eventos de Outubro' })
    expect(titulo.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

const doEncontro = (n: number, inicio: string, cancelado: boolean) =>
  criarEvento(n, {
    nome: 'Classe Bíblica 2026 · 2º semestre', tipo: 'CLASSE_BIBLICA', inicio, fim: inicio, horario: '14:00', local: 'Sala 3 da igreja',
    temReuniao: true, temClasse: true, bomParaCampo: false,
    classeBiblica: { edicaoId: uuid(950), grupos: ['Grupo Daniel', 'Grupo Ester'], cancelado, motivo: cancelado ? 'chuva forte' : null },
  })

function abrirComEncontros(rota: string) {
  servidor.use(
    handlerConfiguracao(criarConfiguracao({ diaReuniao: 0, horaReuniao: '09:00' })),
    handlerCalendario({ eventos: [doEncontro(11, '2026-10-11', false), doEncontro(12, '2026-10-25', true)], diasDeReuniao: ['2026-10-11', '2026-10-25'] }),
  )
  return renderizarRotas(rotasAdmCalendario, rota)
}

describe('calendário · encontro da Classe Bíblica', () => {
  it('no celular, o dia mostra a reunião e o encontro com o texto do tipo e os grupos', async () => {
    simularLargura(390)
    abrirComEncontros('/adm/calendario?mes=2026-10&dia=2026-10-11')
    const painel = within(await screen.findByRole('region', { name: 'Domingo, 11 de outubro' }))
    expect(painel.getByText('Reunião regular')).toBeInTheDocument()
    expect(painel.getByText('Classe Bíblica · 11/10 · 14h · Sala 3 da igreja · Grupo Daniel e Grupo Ester')).toBeInTheDocument()
    expect(painel.queryByText(/^Cancelado/)).not.toBeInTheDocument()
  })

  it('cancelado aparece riscado com o motivo', async () => {
    simularLargura(390)
    abrirComEncontros('/adm/calendario?mes=2026-10&dia=2026-10-25')
    const painel = within(await screen.findByRole('region', { name: 'Domingo, 25 de outubro' }))
    expect(painel.getByText('Classe Bíblica 2026 · 2º semestre').closest('s')).not.toBeNull()
    expect(painel.getByText('Cancelado: chuva forte')).toBeInTheDocument()
  })

  it('no computador, o encontro na grade e na legenda leva o ícone de livro, na cor de evento do clube', async () => {
    abrirComEncontros('/adm/calendario?mes=2026-10')
    const dias = await grade()
    const [noDia] = dias.getAllByRole('link', { name: 'Classe Bíblica 2026 · 2º semestre' })
    expect(noDia?.querySelector('svg.lucide-book-open')).not.toBeNull()
    expect(noDia?.className).toContain('--cal-evento-bg')
    const legenda = within(screen.getByRole('list', { name: 'Legenda' }))
    expect(legenda.getByText('Classe Bíblica').closest('li')?.querySelector('svg.lucide-book-open')).not.toBeNull()
  })
})

describe('calendário · no computador', () => {
  it('a grade continua com os eventos em texto, a legenda aberta e sem o painel do dia', async () => {
    abrirEm('/adm/calendario?mes=2026-10')
    const dias = await grade()
    expect(dias.getByRole('link', { name: 'Feira de saúde' })).toBeInTheDocument()
    expect(dias.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legenda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'O que cada marca quer dizer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /de outubro$/ })).not.toBeInTheDocument()
  })
})

describe('calendário · evento especial no celular', () => {
  beforeEach(() => simularLargura(360))
  const gala = criarEventoEspecial(50, { nome: 'Culto de Ação de Graças', inicio: '2026-10-03', fim: '2026-10-03', horario: '18:00', local: 'Igreja Central' })
  const campo = criarEventoEspecial(51, { nome: 'Aniversário do clube', inicio: '2026-10-17', fim: '2026-10-17', uniforme: 'CAMPO' })

  function abrirComEspeciais(rota: string) {
    servidor.use(handlerConfiguracao(criarConfiguracao({ diaReuniao: 0, horaReuniao: '15:00' })), handlerCalendario({ eventos: [gala, campo], diasDeReuniao: [] }))
    return renderizarRotas(rotasAdmCalendario, rota)
  }

  it('o dia do evento especial leva um losango, e o nome do botão diz "evento especial"', async () => {
    abrirComEspeciais('/adm/calendario?mes=2026-10')
    const dias = await grade()
    const tres = dias.getByRole('button', { name: '3 de outubro: evento especial' })
    const ponto = tres.querySelector('[data-ponto]') as HTMLElement
    expect(ponto.className).toContain('rotate-45')
    expect(ponto.className).not.toContain('rounded-full')
  })

  it('a grade do celular não tem vão entre os dias, para o dia chegar a 44 px em 360 px', async () => {
    abrirComEspeciais('/adm/calendario?mes=2026-10')
    const dias = await screen.findByRole('group', { name: 'Outubro de 2026' })
    expect(dias.className).toContain('gap-0')
    expect(dias.className).not.toContain('gap-0.5')
    expect(dias.parentElement?.className).toContain('p-2')
  })

  it('o painel do dia e a lista do mês mostram o uniforme; a pendência só na lista do mês e no painel do dia do evento', async () => {
    abrirComEspeciais('/adm/calendario?mes=2026-10&dia=2026-10-03')
    const painel = within(await screen.findByRole('region', { name: /^Sábado, 3 de outubro/ }))
    expect(painel.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(painel.getByText('Falta registrar quem foi')).toBeInTheDocument()
    const lista = within(screen.getByRole('list', { name: 'Eventos de Outubro' }))
    expect(lista.getByText('Falta registrar quem foi')).toBeInTheDocument()
    expect(lista.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(lista.getByText('Uniforme de campo')).toBeInTheDocument()
    expect(lista.getAllByText('Falta registrar quem foi')).toHaveLength(1)
  })
})
