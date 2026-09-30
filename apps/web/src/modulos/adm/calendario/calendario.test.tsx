import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  criarAulaAfetada,
  criarEvento,
  handlerCalendario,
  handlerCriarEvento,
  handlerEditarEvento,
  handlerErroCalendario,
  handlerErroGravarEvento,
  handlerExcluirEvento,
} from '../../../testes/handlers/calendario'
import { handlerConfiguracao } from '../../../testes/handlers/clube'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
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
  servidor.use(handlerConfiguracao(), ...extras)
  return renderizarRotas(rotasAdmCalendario, '/adm/calendario')
}

async function abrirNovoEvento() {
  await userEvent.click(await screen.findByRole('button', { name: 'Novo evento' }))
  return within(await screen.findByRole('dialog', { name: 'Novo evento no calendário' }))
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
    expect(grade.getAllByRole('button', { name: 'Acampamento do clube' })).toHaveLength(3)
    expect(grade.getAllByRole('button', { name: /Dia cheio/ })).toHaveLength(2)
    expect(grade.getByText('+1')).toBeInTheDocument()
  })

  it('trocar de mês pela faixa mostra os eventos daquele mês', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    await screen.findByRole('list', { name: 'Eventos de Outubro' })

    await userEvent.click(screen.getByRole('tab', { name: 'Nov' }))
    expect(screen.getByText('Nenhum evento em Novembro')).toBeInTheDocument()
  })

  it('as setas andam de mês em mês e viram o ano, pedindo o ano novo', async () => {
    const consultas: string[] = []
    abrir(handlerCalendario({ eventos: [carnaval] }, (c) => consultas.push(c)))
    await screen.findByRole('list', { name: 'Eventos de Outubro' })

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
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
    abrir(handlerCalendario(), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))
    const painel = await abrirNovoEvento()

    await userEvent.type(painel.getByLabelText('Nome'), 'Acampamento de unidades')
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'ACAMPAMENTO')
    expect(painel.getByLabelText('Não há reunião do clube')).toBeChecked()
    expect(painel.getByLabelText('Não há aula de classe')).not.toBeChecked()
    expect(painel.getByLabelText('Bom para requisitos de campo')).toBeChecked()
    await userEvent.click(painel.getByLabelText('Não há aula de classe'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(corpo).toMatchObject({
      nome: 'Acampamento de unidades',
      tipo: 'ACAMPAMENTO',
      inicio: '2026-10-01',
      fim: '2026-10-01',
      horario: null,
      local: null,
      cancelaReuniao: true,
      bloqueiaAula: true,
      bomParaCampo: true,
    })
    expect(screen.queryByText(/Isto afeta/)).not.toBeInTheDocument()
  })

  it('valida nome e fim antes do início sem chamar a API', async () => {
    let chamadas = 0
    abrir(handlerCalendario(), handlerCriarEvento([], () => chamadas++))
    const painel = await abrirNovoEvento()

    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(painel.getByText('Informe o nome do evento')).toBeInTheDocument()

    await userEvent.type(painel.getByLabelText('Nome'), 'Feriado')
    await userEvent.clear(painel.getByLabelText('Fim'))
    await userEvent.type(painel.getByLabelText('Fim'), '2026-09-30')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('O fim não pode ser antes do início')).toBeInTheDocument()
    expect(chamadas).toBe(0)
  })

  it('422 da API aparece no painel, que continua aberto', async () => {
    abrir(handlerCalendario(), ...handlerErroGravarEvento(422, { codigo: 'REGRA', mensagem: 'O período cai fora do ano do clube' }))
    const painel = await abrirNovoEvento()
    await userEvent.type(painel.getByLabelText('Nome'), 'Evento')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))

    expect(await painel.findByText('O período cai fora do ano do clube')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('aulas afetadas: faixa com a contagem e as classes', async () => {
    const aulas = [criarAulaAfetada(1), criarAulaAfetada(2, { classe: { ...criarAulaAfetada(2).classe, nome: 'Pioneiro' }, data: '2026-10-19' })]
    abrir(handlerCalendario(), handlerCriarEvento(aulas))
    const painel = await abrirNovoEvento()
    await userEvent.type(painel.getByLabelText('Nome'), 'Retiro')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Isto afeta 2 aulas (Amigo 18/10, Pioneiro 19/10). Os instrutores foram avisados.')).toBeInTheDocument()
  })
})

describe('A6 · editar e excluir', () => {
  it('editar abre o painel preenchido e envia a alteração; a faixa usa singular', async () => {
    let recebido: { id: string; corpo: Record<string, unknown> } | null = null
    abrir(handlerCalendario({ eventos: [carnaval] }), handlerEditarEvento([criarAulaAfetada(1)], (id, corpo) => (recebido = { id, corpo: corpo as Record<string, unknown> })))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Acampamento do clube' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Acampamento do clube' }))

    expect(painel.getByLabelText('Nome')).toHaveValue('Acampamento do clube')
    expect(painel.getByLabelText('Início')).toHaveValue('2026-10-16')
    await userEvent.type(painel.getByLabelText('Local'), 'Sítio')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Isto afeta 1 aula (Amigo 18/10). Os instrutores foram avisados.')).toBeInTheDocument()
    expect(recebido).toMatchObject({ id: carnaval.id, corpo: { local: 'Sítio', bomParaCampo: true } })
  })

  it('excluir pede confirmação e só então apaga', async () => {
    const apagados: string[] = []
    abrir(handlerCalendario({ eventos: [carnaval] }), handlerExcluirEvento((id) => apagados.push(id)))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Acampamento do clube' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir evento' }))

    const confirmacao = within(await screen.findByRole('dialog', { name: 'Excluir Acampamento do clube?' }))
    await userEvent.click(confirmacao.getByRole('button', { name: 'Cancelar' }))
    expect(apagados).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Excluir evento' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir Acampamento do clube?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(apagados).toEqual([carnaval.id]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('exclusão recusada mostra a mensagem da API', async () => {
    abrir(
      handlerCalendario({ eventos: [carnaval] }),
      http.delete('/api/calendario/eventos/:id', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Evento não encontrado' }, { status: 404 })),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Acampamento do clube' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir evento' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir Acampamento do clube?' })).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Evento não encontrado')).toBeInTheDocument()
  })
})
