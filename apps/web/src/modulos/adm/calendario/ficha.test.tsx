import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoCalendario } from '../../../api/calendario'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarAulaAfetada, criarEvento, handlerCalendario, handlerCriarEvento, handlerEditarEvento, handlerEvento, handlerExcluirEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

beforeEach(() => {
  estado.modo = 'ONLINE'
})

const acampamento = () =>
  caixa(criarEvento(1, { nome: 'Acampamento de primavera', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', horario: '07:00', local: 'Sítio Recanto Verde', cancelaReuniao: true, bloqueiaAula: true, bomParaCampo: true }))

function abrir(rota: string, evento = acampamento(), ...outros: Caixa<EventoCalendario>[]) {
  servidor.use(handlerEvento(evento, ...outros), handlerCalendario({ eventos: [evento.atual] }), handlerConfiguracao(criarConfiguracao()))
  return { ...renderizarRotas(rotasAdmCalendario, rota), evento }
}

describe('ficha do evento', () => {
  it('calendário → ficha; Voltar devolve o mês', async () => {
    const { roteador } = abrir('/adm/calendario?mes=2026-10')
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    await userEvent.click(lista.getByRole('link', { name: /Acampamento de primavera/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Acampamento de primavera' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Calendário do clube' }))
    expect(roteador.state.location.search).toBe('?mes=2026-10')
    expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
  })

  it('mostra datas, horário, local e o que muda no calendário', async () => {
    abrir(`/adm/calendario/eventos/${uuid(801)}`)
    expect(await screen.findByText('sex 16 a dom 18 de outubro')).toBeInTheDocument()
    expect(screen.getByText('7h')).toBeInTheDocument()
    expect(screen.getByText('Sítio Recanto Verde')).toBeInTheDocument()
    const muda = within(screen.getByRole('region', { name: 'O que muda no calendário' }))
    expect(muda.getByText('Cancela a reunião', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Sim')
  })

  it('sem horário nem local mostra traço e marcações "Não"', async () => {
    abrir(`/adm/calendario/eventos/${uuid(802)}`, caixa(criarEvento(2, { cancelaReuniao: false, bloqueiaAula: false, bomParaCampo: false })))
    await screen.findByRole('heading', { level: 1, name: 'Evento 2' })
    const dados = within(screen.getByRole('region', { name: 'Dados do evento' }))
    expect(dados.getByText('Horário', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—')
    expect(dados.getByText('Local', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—')
    const muda = within(screen.getByRole('region', { name: 'O que muda no calendário' }))
    expect(muda.getByText('Bloqueia aulas nessas datas', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Não')
  })

  it('Editar → Salvar volta à ficha com o aviso das aulas afetadas no topo', async () => {
    const evento = acampamento()
    servidor.use(handlerEditarEvento([criarAulaAfetada(1, { data: '2026-10-17' }), criarAulaAfetada(2, { classe: { id: uuid(102), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: 'companheiro' }, data: '2026-10-18' })]))
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}/editar`, evento)
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/calendario/eventos/${uuid(801)}`))
    expect(await screen.findByText('2 aulas estavam marcadas nessas datas: Amigo (17/10) e Companheiro (18/10). Os instrutores foram avisados.')).toBeInTheDocument()
  })

  it('Novo pelo calendário chega com a data do mês mostrado e leva à ficha do criado', async () => {
    const criado = caixa(criarEvento(99, { id: uuid(899), nome: 'Feriado municipal', inicio: '2026-10-01', fim: '2026-10-01' }))
    servidor.use(handlerCriarEvento([]))
    const { roteador } = abrir('/adm/calendario?mes=2026-10', acampamento(), criado)
    await userEvent.click(await screen.findByRole('link', { name: 'Novo evento' }))
    expect(roteador.state.location.search).toBe('?data=2026-10-01')
    expect(await screen.findByLabelText('Início')).toHaveValue('2026-10-01')
    await userEvent.type(screen.getByLabelText('Nome'), 'Feriado municipal')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/calendario/eventos/${uuid(899)}`))
  })

  it('Excluir pede confirmação e volta ao mês do evento', async () => {
    const excluidos: string[] = []
    servidor.use(handlerExcluirEvento((id) => excluidos.push(id)))
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Excluir Acampamento de primavera?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(roteador.state.location.search).toBe('?mes=2026-10'))
    expect(excluidos).toEqual([uuid(801)])
  })

  it('cancelar a confirmação não exclui', async () => {
    const excluidos: string[] = []
    servidor.use(handlerExcluirEvento((id) => excluidos.push(id)))
    abrir(`/adm/calendario/eventos/${uuid(801)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(excluidos).toEqual([])
  })

  it('exclusão recusada mostra a mensagem da API e fica na ficha', async () => {
    servidor.use(http.delete('/api/calendario/eventos/:id', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Não foi possível excluir' }, { status: 422 })))
    abrir(`/adm/calendario/eventos/${uuid(801)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Não foi possível excluir')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Acampamento de primavera' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.get('/api/calendario/eventos/:id', () => HttpResponse.error()))
    renderizarRotas(rotasAdmCalendario, `/adm/calendario/eventos/${uuid(801)}`)
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('erro de servidor oferece tentar de novo', async () => {
    servidor.use(http.get('/api/calendario/eventos/:id', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler o evento' }, { status: 500 })))
    renderizarRotas(rotasAdmCalendario, `/adm/calendario/eventos/${uuid(801)}`)
    expect(await screen.findByText('Falha ao ler o evento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it.each([`/adm/calendario/eventos/${uuid(898)}`, '/adm/calendario/eventos/abc'])('%s → "Não encontramos este evento"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este evento' })).toBeInTheDocument()
  })
})
