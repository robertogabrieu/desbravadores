import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import {
  criarAulaAfetada,
  criarEvento,
  handlerCalendario,
  handlerCriarEvento,
  handlerEditarEvento,
  handlerErroCalendario,
  handlerErroGravarEvento,
  handlerEvento,
} from '../../../testes/handlers/calendario'
import { handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { mesDoEndereco } from './datas'
import { textoDasAulasAfetadas } from './EditarEvento'
import { rotasAdmCalendario } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))
vi.mock('../../../api/desbravadores', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../api/desbravadores')>()),
  hojeDoClube: () => '2026-10-05',
}))

const carnaval = criarEvento(1, { nome: 'Acampamento do clube', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: true })

beforeEach(() => {
  estado.modo = 'ONLINE'
})

function abrir(...extras: Parameters<typeof servidor.use>) {
  return abrirEm('/adm/calendario?mes=2026-10', ...extras)
}

function abrirEm(rota: string, ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerConfiguracao(), ...extras)
  return renderizarRotas(rotasAdmCalendario, rota)
}

async function abrirNovoEvento(...extras: Parameters<typeof servidor.use>) {
  abrirEm('/adm/calendario/eventos/novo?data=2026-10-01', ...extras)
  await screen.findByLabelText('Nome')
}

describe('A6 · quatro estados', () => {
  it('carregando mostra o esqueleto', () => {
    abrir(http.get('/api/calendario', () => new Promise(() => undefined)))
    expect(screen.getByRole('status', { name: 'Carregando o calendário' })).toBeInTheDocument()
  })

  it('vazio: mês sem evento explica o que cadastrar', async () => {
    abrir(handlerCalendario())
    expect(await screen.findByText('Nenhum evento em Outubro')).toBeInTheDocument()
  })

  it('erro: mostra a mensagem e repete a busca', async () => {
    abrir(handlerErroCalendario())
    expect(await screen.findByText('Falha ao ler o calendário')).toBeInTheDocument()
    servidor.use(handlerCalendario({ eventos: [carnaval] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('list', { name: 'Eventos de Outubro' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir(handlerErroCalendario())
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('A6 · grade', () => {
  it('pede o ano civil do mês exibido e marca reunião com a hora, evento e +N', async () => {
    let consulta = ''
    const tres = [1, 2, 3].map((n) => criarEvento(n, { nome: `Dia cheio ${n}`, inicio: '2026-10-24', fim: '2026-10-24' }))
    abrir(handlerCalendario({ eventos: [carnaval, ...tres], diasDeReuniao: ['2026-10-03', '2026-10-10'] }, (c) => (consulta = c)))

    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    expect(consulta).toBe('?ano=2026')
    expect(grade.getAllByText('Reunião 15:00')).toHaveLength(2)
    expect(grade.getAllByRole('link', { name: 'Acampamento do clube' })).toHaveLength(3)
    expect(grade.getAllByRole('link', { name: /Dia cheio/ })).toHaveLength(2)
    expect(grade.getByText('+1')).toBeInTheDocument()
  })

  it('no celular a grade só informa: o evento vira faixa sem toque e a reunião ganha o ícone da legenda', async () => {
    abrir(handlerCalendario({ eventos: [carnaval], diasDeReuniao: ['2026-10-03'] }))
    const grupo = await screen.findByRole('group', { name: 'Outubro de 2026' })
    const links = within(grupo).getAllByRole('link', { name: 'Acampamento do clube' })
    for (const link of links) expect(link).toHaveClass('max-sm:hidden')
    const faixas = grupo.querySelectorAll('[data-faixa-do-evento]')
    expect(faixas).toHaveLength(links.length)
    for (const faixa of faixas) {
      expect(faixa.tagName).toBe('SPAN')
      expect(faixa).toHaveAttribute('aria-hidden', 'true')
      expect(faixa).toHaveClass('sm:hidden')
    }
    expect(grupo.querySelectorAll('[data-marca="reuniao"]')).toHaveLength(1)
    const legenda = screen.getByRole('list', { name: 'Legenda' })
    expect(within(legenda).getByText('Reunião regular').querySelector('[data-marca="reuniao"]')).not.toBeNull()
    expect(screen.getByText('Para abrir um evento, toque nele na lista abaixo.')).toBeInTheDocument()
  })

  it('o cartão do evento na lista mostra a seta de que abre', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    expect(lista.getByRole('link', { name: /Acampamento do clube/ }).querySelector('[data-sinal="navega"]')).not.toBeNull()
  })

  it('trocar de mês pela faixa mostra os eventos daquele mês', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    await screen.findByRole('list', { name: 'Eventos de Outubro' })

    await userEvent.click(screen.getByRole('tab', { name: 'Nov' }))
    expect(screen.getByText('Nenhum evento em Novembro')).toBeInTheDocument()
  })

  it('as setas e as abas de mês gravam ?mes= no endereço', async () => {
    const { roteador } = abrir(handlerCalendario({ eventos: [carnaval] }))
    await screen.findByRole('list', { name: 'Eventos de Outubro' })

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(roteador.state.location.search).toBe('?mes=2026-11')
    await userEvent.click(screen.getByRole('tab', { name: 'Fev' }))
    expect(roteador.state.location.search).toBe('?mes=2026-02')
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(roteador.state.location.search).toBe('?mes=2025-12')
  })

  it('sem ?mes= (ou com valor inválido) abre o mês de hoje', async () => {
    abrirEm('/adm/calendario?mes=2026-13', handlerCalendario())
    expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
  })

  it('mesDoEndereco aceita AAAA-MM e cai no mês de hoje no resto', () => {
    expect(mesDoEndereco('2027-01', '2026-10-05')).toEqual({ ano: 2027, mes: 0 })
    expect(mesDoEndereco('', '2026-10-05')).toEqual({ ano: 2026, mes: 9 })
    expect(mesDoEndereco('2026-00', '2026-10-05')).toEqual({ ano: 2026, mes: 9 })
  })

  it('cada evento da lista é um link para a ficha, sem botão Editar', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    expect(lista.getByRole('link', { name: /Acampamento do clube/ })).toHaveAttribute('href', `/adm/calendario/eventos/${carnaval.id}`)
    expect(lista.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('as setas andam de mês em mês e viram o ano, pedindo o ano novo', async () => {
    const consultas: string[] = []
    abrir(handlerCalendario({ eventos: [carnaval] }, (c) => consultas.push(c)))
    await screen.findByRole('list', { name: 'Eventos de Outubro' })

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByRole('heading', { name: 'Janeiro de 2027' })).toBeInTheDocument()
    await waitFor(() => expect(consultas).toContain('?ano=2027'))
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByRole('heading', { name: 'Dezembro de 2026' })).toBeInTheDocument()
  })
})

describe('A6 · criar', () => {
  it('as três caixas seguem o padrão do tipo e a gravação leva o que está marcado', async () => {
    let corpo: Record<string, unknown> = {}
    const criado = caixa(criarEvento(99, { id: uuid(899) }))
    await abrirNovoEvento(handlerCalendario(), handlerEvento(criado), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))

    await userEvent.type(screen.getByLabelText('Nome'), 'Acampamento de unidades')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'ACAMPAMENTO')
    expect(screen.getByLabelText('Não há reunião do clube')).toBeChecked()
    expect(screen.getByLabelText('Não há aula de classe')).not.toBeChecked()
    expect(screen.getByLabelText('Bom para requisitos de campo')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Não há aula de classe'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpo).toMatchObject({
      nome: 'Acampamento de unidades',
      tipo: 'ACAMPAMENTO',
      inicio: '2026-10-01',
      fim: '2026-10-01',
      horario: null,
      local: null,
      cancelaReuniao: true,
      bloqueiaAula: true,
      bomParaCampo: true,
    }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Evento 99' })).toBeInTheDocument()
    expect(screen.queryByText(/estavam marcadas|estava marcada/)).not.toBeInTheDocument()
  })

  it('sem ?data= (ou inválida) o novo evento abre no dia de hoje', async () => {
    abrirEm('/adm/calendario/eventos/novo?data=xx', handlerCalendario())
    expect(await screen.findByLabelText('Início')).toHaveValue('2026-10-05')
  })

  it('valida nome e fim antes do início sem chamar a API', async () => {
    let chamadas = 0
    await abrirNovoEvento(handlerCalendario(), handlerCriarEvento([], () => chamadas++))

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Informe o nome do evento')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Nome'), 'Feriado')
    await userEvent.clear(screen.getByLabelText('Fim'))
    await userEvent.type(screen.getByLabelText('Fim'), '2026-09-30')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('O fim não pode ser antes do início')).toBeInTheDocument()
    expect(chamadas).toBe(0)
  })

  it('422 da API aparece na tela, que continua aberta', async () => {
    await abrirNovoEvento(handlerCalendario(), ...handlerErroGravarEvento(422, { codigo: 'REGRA', mensagem: 'O período cai fora do ano do clube' }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Evento')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('O período cai fora do ano do clube')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
  })

  it('Cancelar volta ao mês de onde veio, sem perguntar nada', async () => {
    servidor.use(handlerCalendario())
    const { roteador } = abrirEm('/adm/calendario/eventos/novo?data=2026-10-01')
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rascunho')
    await userEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/adm/calendario')
  })
})

describe('A6 · editar', () => {
  it('abre preenchido e envia a alteração', async () => {
    let recebido: { id: string; corpo: Record<string, unknown> } | null = null
    abrirEm(
      `/adm/calendario/eventos/${carnaval.id}/editar`,
      handlerEvento(caixa(carnaval)),
      handlerCalendario({ eventos: [carnaval] }),
      handlerEditarEvento([], (id, corpo) => (recebido = { id, corpo: corpo as Record<string, unknown> })),
    )

    expect(await screen.findByLabelText('Nome')).toHaveValue('Acampamento do clube')
    expect(screen.getByLabelText('Início')).toHaveValue('2026-10-16')
    await userEvent.type(screen.getByLabelText('Local'), 'Sítio')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(recebido).toMatchObject({ id: carnaval.id, corpo: { local: 'Sítio', bomParaCampo: true } }))
  })

  it('evento inexistente: "Não encontramos este evento"', async () => {
    abrirEm(`/adm/calendario/eventos/${uuid(898)}/editar`, handlerEvento())
    expect(await screen.findByRole('heading', { name: 'Não encontramos este evento' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrirEm(`/adm/calendario/eventos/${carnaval.id}/editar`, http.get('/api/calendario/eventos/:id', () => HttpResponse.error()))
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('textoDasAulasAfetadas', () => {
  it('singular e plural, com os nomes juntados', () => {
    expect(textoDasAulasAfetadas([criarAulaAfetada(1)])).toBe('1 aula estava marcada nessas datas: Amigo (18/10). Os instrutores foram avisados.')
    expect(textoDasAulasAfetadas([criarAulaAfetada(1), criarAulaAfetada(2), criarAulaAfetada(3, { data: '2026-10-19' })])).toBe(
      '3 aulas estavam marcadas nessas datas: Amigo (18/10), Amigo (18/10) e Amigo (19/10). Os instrutores foram avisados.',
    )
  })
})
