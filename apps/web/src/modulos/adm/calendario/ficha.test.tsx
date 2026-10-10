import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chavesCalendario } from '../../../api/calendario'
import type { EventoCalendario } from '../../../api/calendario'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarAulaAfetada, criarEvento, handlerCalendario, handlerCriarEvento, handlerEditarEvento, handlerEvento, handlerExcluirEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao, handlerErroConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

let diaReuniao = 0
beforeEach(() => {
  estado.modo = 'ONLINE'
  diaReuniao = 0
})

const acampamento = () =>
  caixa(criarEvento(1, { nome: 'Acampamento de primavera', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', horario: '07:00', local: 'Sítio Recanto Verde', temReuniao: false, temClasse: true, bomParaCampo: true }))

function abrir(rota: string, evento = acampamento(), ...outros: Caixa<EventoCalendario>[]) {
  servidor.use(handlerEvento(evento, ...outros), handlerCalendario({ eventos: [evento.atual] }), handlerConfiguracao(criarConfiguracao({ diaReuniao })))
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
    expect(await muda.findByText('Terá classe', { selector: 'dt' })).toBeInTheDocument()
  })

  it('sem horário nem local mostra traço', async () => {
    abrir(`/adm/calendario/eventos/${uuid(802)}`, caixa(criarEvento(2, { temReuniao: true, temClasse: false, bomParaCampo: false })))
    await screen.findByRole('heading', { level: 1, name: 'Evento 2' })
    const dados = within(screen.getByRole('region', { name: 'Dados do evento' }))
    expect(dados.getByText('Horário', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—')
    expect(dados.getByText('Local', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—')
  })

  async function valorDe(rotulo: string): Promise<string> {
    const muda = within(await screen.findByRole('region', { name: 'O que muda no calendário' }))
    return (await muda.findByText(rotulo, { selector: 'dt' })).nextElementSibling?.textContent ?? ''
  }

  it('Férias mostra um texto só, sem pares', async () => {
    abrir(`/adm/calendario/eventos/${uuid(810)}`, caixa(criarEvento(10, { tipo: 'FERIAS', inicio: '2025-12-07', fim: '2026-02-01', temReuniao: false, temClasse: true })))
    const muda = within(await screen.findByRole('region', { name: 'O que muda no calendário' }))
    expect(await muda.findByText('Sem reunião e sem classe nos domingos do período; acampamentos continuam valendo.')).toBeInTheDocument()
    expect(muda.queryByText('Terá reunião')).not.toBeInTheDocument()
  })

  it('Reunião extra fora do dia normal: reunião sim e classe não', async () => {
    abrir(`/adm/calendario/eventos/${uuid(811)}`, caixa(criarEvento(11, { tipo: 'REUNIAO_EXTRA', inicio: '2026-10-21', fim: '2026-10-21', temReuniao: true, temClasse: false })))
    expect(await valorDe('Terá reunião')).toBe('Sim (quarta-feira 21)')
    expect(await valorDe('Terá classe')).toBe('Não')
  })

  it.each([
    [true, 'Sim — domingo 18 já tem reunião; vale o horário e o local deste evento'],
    [false, 'Não acrescenta — domingo 18 segue o calendário'],
  ])('Reunião extra no domingo, Terá reunião %s', async (temReuniao, texto) => {
    abrir(`/adm/calendario/eventos/${uuid(812)}`, caixa(criarEvento(12, { tipo: 'REUNIAO_EXTRA', inicio: '2026-10-18', fim: '2026-10-18', temReuniao, temClasse: true })))
    expect(await valorDe('Terá reunião')).toBe(texto)
    expect(await valorDe('Terá classe')).toBe('Sim (domingo 18)')
  })

  it('Reunião extra no domingo sem classe: "Não acrescenta"', async () => {
    abrir(`/adm/calendario/eventos/${uuid(813)}`, caixa(criarEvento(13, { tipo: 'REUNIAO_EXTRA', inicio: '2026-10-18', fim: '2026-10-18', temReuniao: true, temClasse: false })))
    expect(await valorDe('Terá classe')).toBe('Não acrescenta — domingo 18 segue o calendário')
  })

  it('Evento comum num domingo', async () => {
    abrir(`/adm/calendario/eventos/${uuid(814)}`, caixa(criarEvento(14, { inicio: '2026-10-18', fim: '2026-10-18', temReuniao: true, temClasse: false, bomParaCampo: false })))
    expect(await valorDe('Terá reunião')).toBe('Sim (domingo 18)')
    expect(await valorDe('Terá classe')).toBe('Não (domingo 18)')
    expect(await valorDe('Terá atividade de campo')).toBe('Não')
  })

  it('Acampamento de sexta a domingo', async () => {
    abrir(`/adm/calendario/eventos/${uuid(801)}`)
    expect(await valorDe('Terá reunião')).toBe('Não (domingo 18)')
    expect(await valorDe('Terá classe')).toBe('Sim (sexta 16 a domingo 18)')
    expect(await valorDe('Terá atividade de campo')).toBe('Sim')
  })

  it('mais de três domingos vira contagem; dois domingos viram lista', async () => {
    abrir(`/adm/calendario/eventos/${uuid(815)}`, caixa(criarEvento(15, { tipo: 'FERIADO', inicio: '2025-12-07', fim: '2026-02-01', temReuniao: false, temClasse: false })))
    expect(await valorDe('Terá reunião')).toBe('Não (9 domingos, de 7/12 a 1/02)')
  })

  it('dois domingos no período: lista os dois', async () => {
    abrir(`/adm/calendario/eventos/${uuid(816)}`, caixa(criarEvento(16, { inicio: '2026-10-10', fim: '2026-10-18', temReuniao: false, temClasse: false })))
    expect(await valorDe('Terá reunião')).toBe('Não (domingos 11 e 18)')
  })

  it('sem domingo no período', async () => {
    abrir(`/adm/calendario/eventos/${uuid(817)}`, caixa(criarEvento(17, { inicio: '2026-10-20', fim: '2026-10-21', temReuniao: false, temClasse: false })))
    expect(await valorDe('Terá reunião')).toBe('Não há domingo no período')
  })

  it('o dia da reunião vem da configuração: sábado', async () => {
    diaReuniao = 6
    abrir(`/adm/calendario/eventos/${uuid(818)}`, caixa(criarEvento(18, { inicio: '2026-10-10', fim: '2026-10-18', temReuniao: false, temClasse: false })))
    expect(await valorDe('Terá reunião')).toBe('Não (sábados 10 e 17)')
  })

  it('configuração com erro: só Sim ou Não, sem parênteses', async () => {
    abrir(`/adm/calendario/eventos/${uuid(819)}`, caixa(criarEvento(19, { inicio: '2026-10-18', fim: '2026-10-18', temReuniao: true, temClasse: false })))
    servidor.use(handlerErroConfiguracao())
    expect(await valorDe('Terá reunião')).toBe('Sim')
    expect(await valorDe('Terá classe')).toBe('Não')
  })

  it('Editar → Salvar volta à ficha com o aviso das aulas afetadas no topo', async () => {
    const evento = acampamento()
    servidor.use(handlerEditarEvento([criarAulaAfetada(1, { data: '2026-10-17' }), criarAulaAfetada(2, { classe: { id: uuid(102), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: 'companheiro' }, data: '2026-10-18' })]))
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}/editar`, evento)
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/calendario/eventos/${uuid(801)}`))
    expect(roteador.state.historyAction).toBe('REPLACE')
    expect(await screen.findByText('2 classes estavam marcadas nessas datas: Amigo (17/10) e Companheiro (18/10). Os instrutores foram avisados.')).toBeInTheDocument()
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

  describe('encontro da Classe Bíblica', () => {
    const encontro = (cancelado = false) =>
      caixa(
        criarEvento(3, {
          nome: 'Classe Bíblica 2026 · 2º semestre', tipo: 'CLASSE_BIBLICA', inicio: '2026-10-11', fim: '2026-10-11', horario: '14:00', local: 'Sala 3 da igreja',
          temReuniao: true, temClasse: true, bomParaCampo: false,
          classeBiblica: { edicaoId: uuid(950), grupos: ['Grupo Daniel', 'Grupo Ester'], cancelado, motivo: cancelado ? 'chuva forte' : null },
        }),
      )

    it('leva à edição no lugar de Editar e Excluir, e diz que não muda a reunião do dia', async () => {
      abrir(`/adm/calendario/eventos/${uuid(803)}`, encontro())
      await screen.findByRole('heading', { level: 1, name: 'Classe Bíblica 2026 · 2º semestre' })
      expect(screen.getByRole('link', { name: 'Abrir a edição' })).toHaveAttribute('href', `/adm/classe-biblica/${uuid(950)}`)
      expect(screen.getByText('Para remarcar ou cancelar, abra a edição: o encontro é dela, não do calendário.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
      expect(screen.getByText('Grupo Daniel e Grupo Ester')).toBeInTheDocument()
      const muda = within(screen.getByRole('region', { name: 'O que muda no calendário' }))
      expect(muda.getByText('A reunião e a classe do dia continuam como estão.')).toBeInTheDocument()
      expect(muda.queryByText('Terá reunião')).not.toBeInTheDocument()
    })

    it('cancelado mostra o motivo', async () => {
      abrir(`/adm/calendario/eventos/${uuid(803)}`, encontro(true))
      expect(await screen.findByText('Cancelado: chuva forte')).toBeInTheDocument()
    })
  })

  it('o seletor de tipo do formulário não oferece Classe Bíblica', async () => {
    abrir('/adm/calendario/eventos/novo')
    const tipo = await screen.findByLabelText('Tipo')
    const opcoes = within(tipo).getAllByRole('option').map((opcao) => opcao.textContent)
    expect(opcoes).toContain('Evento do clube')
    expect(opcoes).not.toContain('Classe Bíblica')
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

  it('Excluir volta para onde o Voltar levaria, e no mês do evento se não veio de lugar nenhum', async () => {
    servidor.use(handlerExcluirEvento())
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}`)
    await act(() => roteador.navigate(`/adm/calendario/eventos/${uuid(801)}`, { state: { voltarPara: '/adm/calendario?mes=2026-11' } }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Excluir Acampamento de primavera?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(roteador.state.location.search).toBe('?mes=2026-11'))
  })

  it('excluir tira o evento do cache em vez de reler o que acabou de sumir', async () => {
    let leituras = 0
    const { roteador, evento, clienteConsultas } = abrir(`/adm/calendario/eventos/${uuid(801)}`)
    servidor.use(
      handlerExcluirEvento(),
      http.get('/api/calendario/eventos/:id', () => {
        leituras += 1
        return HttpResponse.json(evento.atual)
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Excluir Acampamento de primavera?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(roteador.state.location.search).toBe('?mes=2026-10'))
    expect(leituras).toBe(0)
    expect(clienteConsultas.getQueryData(chavesCalendario.evento(uuid(801)))).toBeUndefined()
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
