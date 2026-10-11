import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import {
  criarAulaAfetada,
  criarEvento,
  criarEventoEspecial,
  handlerCalendario,
  handlerCriarEvento,
  handlerEditarEvento,
  handlerErroCalendario,
  handlerErroGravarEvento,
  handlerEvento,
} from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao, handlerErroConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { mesDoEndereco } from './datas'
import { textoDasAulasAfetadas } from './EditarEvento'
import { rotasAdmCalendario } from './rotas'
import { ROTULOS_DO_TIPO } from './tipos'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))
vi.mock('../../../api/desbravadores', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../api/desbravadores')>()),
  hojeDoClube: () => '2026-10-05',
}))

const carnaval = criarEvento(1, { nome: 'Acampamento do clube', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', temReuniao: false, temClasse: true, bomParaCampo: true })

beforeEach(() => {
  estado.modo = 'ONLINE'
  diaReuniao = 0
  configuracaoComErro = false
})

function abrir(...extras: Parameters<typeof servidor.use>) {
  return abrirEm('/adm/calendario?mes=2026-10', ...extras)
}

let diaReuniao = 0
let configuracaoComErro = false
function abrirEm(rota: string, ...extras: Parameters<typeof servidor.use>) {
  servidor.use(configuracaoComErro ? handlerErroConfiguracao() : handlerConfiguracao(criarConfiguracao({ diaReuniao, horaReuniao: '15:00' })), ...extras)
  return renderizarRotas(rotasAdmCalendario, rota)
}

async function abrirNovoDoTipo(tipo: string, ...extras: Parameters<typeof servidor.use>) {
  abrirEm(`/adm/calendario/eventos/novo?data=2026-10-01&tipo=${tipo}`, ...extras)
  await screen.findByLabelText('Nome')
}

const abrirNovoEvento = (...extras: Parameters<typeof servidor.use>) => abrirNovoDoTipo('EVENTO', ...extras)

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

  it('a reunião regular da legenda leva o ícone, para não depender só da cor', async () => {
    abrir(handlerCalendario({ eventos: [carnaval], diasDeReuniao: ['2026-10-03'] }))
    const legenda = await screen.findByRole('list', { name: 'Legenda' })
    expect(within(legenda).getByText(/^Reunião regular/).querySelector('[data-marca="reuniao"]')).not.toBeNull()
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
    await abrirNovoDoTipo('ACAMPAMENTO', handlerCalendario(), handlerEvento(criado), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))

    await userEvent.type(screen.getByLabelText('Nome'), 'Acampamento de unidades')
    expect(screen.getByLabelText('Terá reunião')).not.toBeChecked()
    expect(screen.getByLabelText('Terá classe')).toBeChecked()
    expect(screen.getByLabelText('Terá atividade de campo')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Terá reunião'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpo).toMatchObject({
      nome: 'Acampamento de unidades',
      tipo: 'ACAMPAMENTO',
      inicio: '2026-10-01',
      fim: '2026-10-01',
      horario: null,
      local: null,
      temReuniao: true,
      temClasse: true,
      bomParaCampo: true,
    }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Evento 99' })).toBeInTheDocument()
    expect(screen.queryByText(/estavam marcadas|estava marcada/)).not.toBeInTheDocument()
  })

  it('sem ?data= (ou inválida) o novo evento abre no dia de hoje', async () => {
    abrirEm('/adm/calendario/eventos/novo?data=xx&tipo=EVENTO', handlerCalendario())
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
    const { roteador } = abrirEm('/adm/calendario/eventos/novo?data=2026-10-01&tipo=EVENTO')
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

const TEXTO_EVENTO = 'Evento do clube: a reunião acontece e não há classe, salvo se você marcar. Para um período sem reuniões, escolha Férias; para uma reunião fora do domingo, Reunião extra.'
const TEXTO_FERIAS = 'Férias: sem reunião e sem classe nos domingos do período; acampamentos continuam valendo.'
const TEXTO_EXTRA = 'Reunião extra: uma data fora do domingo, com chamada da unidade, classe ou as duas.'
const CAIXAS = ['Terá reunião', 'Terá classe', 'Terá atividade de campo']

describe('P3 · formulário', () => {
  it('Evento mostra o texto de apoio e as caixas positivas, na ordem, com a legenda', async () => {
    await abrirNovoEvento(handlerCalendario())
    expect(await screen.findByText(TEXTO_EVENTO)).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Para a reunião e as classes' })
    expect(within(grupo).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(CAIXAS)
    expect(screen.getByLabelText('Terá reunião')).toBeChecked()
    expect(screen.getByLabelText('Terá classe')).not.toBeChecked()
    expect(screen.getByText(/Se já houver classes marcadas no período, o instrutor é avisado\./)).toBeInTheDocument()
  })

  it('Férias esconde as caixas e mostra o texto de apoio', async () => {
    await abrirNovoDoTipo('FERIAS', handlerCalendario())
    expect(await screen.findByText(TEXTO_FERIAS)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('o dia do texto de apoio vem da configuração; sem ela, "nos dias de reunião"', async () => {
    diaReuniao = 6
    await abrirNovoDoTipo('FERIAS', handlerCalendario())
    expect(await screen.findByText('Férias: sem reunião e sem classe nos sábados do período; acampamentos continuam valendo.')).toBeInTheDocument()
  })

  it('Férias grava o padrão do tipo (sem reunião, com classe)', async () => {
    let corpo: Record<string, unknown> = {}
    await abrirNovoDoTipo('FERIAS', handlerCalendario(), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))
    await userEvent.type(screen.getByLabelText('Nome'), 'Férias de verão')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'FERIAS', temReuniao: false, temClasse: true, bomParaCampo: false }))
  })

  it('Reunião extra: campo Data, sem Início e Fim, duas caixas, e envia fim igual ao início', async () => {
    let corpo: Record<string, unknown> = {}
    await abrirNovoDoTipo('REUNIAO_EXTRA', handlerCalendario(), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))
    await userEvent.type(screen.getByLabelText('Nome'), 'Encontro')
    expect(await screen.findByText(TEXTO_EXTRA)).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-01')
    expect(screen.queryByLabelText('Início')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fim')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(CAIXAS.slice(0, 2))
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-21' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'REUNIAO_EXTRA', inicio: '2026-10-21', fim: '2026-10-21', temReuniao: true, temClasse: true, bomParaCampo: false }))
  })

  it('API recusa duas extras na mesma data: o erro aparece sob a Data', async () => {
    await abrirNovoDoTipo('REUNIAO_EXTRA', handlerCalendario(),
      http.post('/api/calendario/eventos', () =>
        HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Dados inválidos', campos: { inicio: 'Já há uma reunião extra nesta data.' } }, { status: 400 }),
      ),
    )
    await userEvent.type(screen.getByLabelText('Nome'), 'Encontro')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Já há uma reunião extra nesta data.')).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveAccessibleDescription('Já há uma reunião extra nesta data.')
  })

  it('extra sem caixas: o erro fica no grupo, ligado ao fieldset, sem chamar a API', async () => {
    let chamadas = 0
    await abrirNovoDoTipo('REUNIAO_EXTRA', handlerCalendario(), handlerCriarEvento([], () => chamadas++))
    await userEvent.type(screen.getByLabelText('Nome'), 'Encontro')
    await userEvent.click(screen.getByLabelText('Terá reunião'))
    await userEvent.click(screen.getByLabelText('Terá classe'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const grupo = screen.getByRole('group', { name: 'Para a reunião e as classes' })
    const alerta = await within(grupo).findByRole('alert')
    expect(alerta).toHaveTextContent('Marque Terá reunião, Terá classe ou as duas.')
    expect(grupo).toContainElement(alerta)
    expect(grupo).toHaveAttribute('aria-describedby', alerta.id)
    expect(chamadas).toBe(0)
  })

  it('extra no dia da reunião avisa sob a Data; fora dele, não', async () => {
    await abrirNovoDoTipo('REUNIAO_EXTRA', handlerCalendario())
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-18' } })
    expect(screen.getByLabelText('Data')).toHaveAccessibleDescription('Domingo já tem reunião: esta reunião extra só muda nome, horário e local.')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-21' } })
    expect(screen.queryByText(/já tem reunião/)).not.toBeInTheDocument()
  })

  it('Terá classe sem reunião e sem campo avisa, e a caixa não muda sozinha', async () => {
    await abrirNovoEvento(handlerCalendario())
    expect(screen.queryByText('Sem reunião e sem campo, não há classe nesses dias.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Terá classe'))
    await userEvent.click(screen.getByLabelText('Terá reunião'))
    expect(screen.getByText('Sem reunião e sem campo, não há classe nesses dias.')).toBeInTheDocument()
    expect(screen.getByLabelText('Terá classe')).toBeChecked()
  })

  it('API recusa aba antiga (400 sem campos): mensagem geral', async () => {
    await abrirNovoEvento(handlerCalendario(), ...handlerErroGravarEvento(400, { codigo: 'VALIDACAO', mensagem: 'Atualize o app para salvar este evento.' }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Evento')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Atualize o app para salvar este evento.')).toBeInTheDocument()
  })
})

describe('P3 · calendário', () => {
  const ferias = criarEvento(20, { nome: 'Férias de verão', tipo: 'FERIAS', inicio: '2026-10-04', fim: '2026-10-25', temReuniao: false, temClasse: true })
  const extraQuarta = criarEvento(21, { nome: 'Encontro', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-21', fim: '2026-10-21', horario: '19:30', temReuniao: true, temClasse: true })

  it('férias saem como faixa, com a cor de férias, e o domingo sem o selo de reunião', async () => {
    abrir(handlerCalendario({ eventos: [ferias], diasDeReuniao: [] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    const faixas = grade.getAllByRole('link', { name: 'Férias de verão' })
    expect(faixas[0]?.className).toContain('--cal-ferias-bg')
    expect(grade.queryByText(/^Reunião \d/)).not.toBeInTheDocument()
  })

  it('selo da extra com o horário dela; extra só com classe diz "Classe extra"', async () => {
    const soClasse = criarEvento(22, { nome: 'Classe especial', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-22', fim: '2026-10-22', horario: '19:30', temReuniao: false, temClasse: true })
    abrir(handlerCalendario({ eventos: [extraQuarta, soClasse], diasDeReuniao: ['2026-10-21'] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    expect(grade.getByText('Reunião extra 19h30')).toBeInTheDocument()
    expect(grade.getByText('Classe extra 19h30')).toBeInTheDocument()
  })

  it('extra no dia normal: só o selo da extra, sem o regular duplicado', async () => {
    const noDomingo = criarEvento(23, { nome: 'Encontro', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-11', fim: '2026-10-11', horario: null, temReuniao: true, temClasse: false })
    abrir(handlerCalendario({ eventos: [noDomingo], diasDeReuniao: ['2026-10-11'] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    expect(grade.getByText('Reunião extra 15h')).toBeInTheDocument()
    expect(grade.queryByText('Reunião 15:00')).not.toBeInTheDocument()
  })

  it('a legenda traz Reunião extra e Férias', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    const legenda = within(await screen.findByRole('list', { name: 'Legenda' }))
    expect(legenda.getByText('Reunião extra')).toBeInTheDocument()
    expect(legenda.getByText('Férias')).toBeInTheDocument()
  })

  it('a legenda diz a reunião regular com o horário do clube, e sem horário não inventa um', async () => {
    abrir(handlerCalendario({ eventos: [carnaval] }))
    expect(await within(await screen.findByRole('list', { name: 'Legenda' })).findByText('Reunião regular · 15h')).toBeInTheDocument()
  })

  it('sem a configuração do clube, a legenda diz só "Reunião regular"', async () => {
    configuracaoComErro = true
    abrir(handlerCalendario({ eventos: [carnaval] }))
    expect(within(await screen.findByRole('list', { name: 'Legenda' })).getByText('Reunião regular')).toBeInTheDocument()
  })

  it('no dia com extra e férias, a extra vem antes de "Férias"', async () => {
    abrir(handlerCalendario({ eventos: [ferias, extraQuarta], diasDeReuniao: [] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    const celula = grade.getByText('21', { selector: 'span' }).parentElement as HTMLElement
    const textos = within(celula).getAllByRole('link').map((link) => link.textContent)
    expect(textos).toEqual(['Encontro', 'Férias de verão'])
  })

  it('a lista mostra período e horário no formato curto do modelo', async () => {
    const longas = criarEvento(24, { nome: 'Férias de fim de ano', tipo: 'FERIAS', inicio: '2026-10-07', fim: '2026-10-25', temReuniao: false, temClasse: true })
    const dezembro = criarEvento(25, { nome: 'Recesso', tipo: 'FERIAS', inicio: '2026-09-07', fim: '2027-02-01', temReuniao: false, temClasse: true })
    abrir(handlerCalendario({ eventos: [dezembro, longas, extraQuarta], diasDeReuniao: [] }))
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    expect(lista.getByText('Férias · 7/09 a 1/02')).toBeInTheDocument()
    expect(lista.getByText('Férias · 7/10 a 25/10')).toBeInTheDocument()
    expect(lista.getByText('Reunião extra · 21/10 · 19h30')).toBeInTheDocument()
  })

  it('mês vazio explica o que cadastrar', async () => {
    abrir(handlerCalendario())
    expect(await screen.findByText('Cadastre feriados, férias, acampamentos, dias sem reunião e reuniões extras para que o cronograma das classes os respeite.')).toBeInTheDocument()
  })
})

describe('textoDasAulasAfetadas', () => {
  it('singular e plural, com os nomes juntados', () => {
    expect(textoDasAulasAfetadas([criarAulaAfetada(1)])).toBe('1 classe estava marcada nessas datas: Amigo (18/10). Os instrutores foram avisados.')
    expect(textoDasAulasAfetadas([criarAulaAfetada(1), criarAulaAfetada(2), criarAulaAfetada(3, { data: '2026-10-19' })])).toBe(
      '3 classes estavam marcadas nessas datas: Amigo (18/10), Amigo (18/10) e Amigo (19/10). Os instrutores foram avisados.',
    )
  })
})

describe('evento especial no calendário do computador', () => {
  const gala = criarEventoEspecial(40, { nome: 'Culto de Ação de Graças', inicio: '2026-10-03', fim: '2026-10-03', uniforme: 'GALA', horario: '18:00', local: 'Igreja Central' })
  const campo = criarEventoEspecial(41, { nome: 'Aniversário do clube', inicio: '2026-10-17', fim: '2026-10-17', uniforme: 'CAMPO' })

  it('a legenda segue a ordem real dos tipos e traz os dois uniformes à parte, depois deles', async () => {
    abrir(handlerCalendario({ eventos: [gala] }))
    const itens = within(await screen.findByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent?.trim())).toEqual([
      'Reunião regular · 15h',
      ...Object.values(ROTULOS_DO_TIPO),
      'Uniforme de gala',
      'Uniforme de campo',
    ])
    expect(itens.at(-2)?.querySelector('svg')).not.toBeNull()
    expect(itens.at(-1)?.querySelector('.border-dashed')).not.toBeNull()
    expect(itens.at(-2)?.querySelector('.border-dashed')).toBeNull()
  })

  it('a célula traz ícone e nome e, em segunda linha, o uniforme: gala cheio, campo tracejado, sem cortar o texto', async () => {
    abrir(handlerCalendario({ eventos: [gala, campo], diasDeReuniao: [] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    const link = grade.getByRole('link', { name: 'Culto de Ação de Graças' })
    expect(link.querySelector('svg')).not.toBeNull()
    expect(link.className).not.toContain('truncate')
    const celula = link.parentElement as HTMLElement
    const uniforme = within(celula).getByText('Uniforme de gala')
    expect(link.compareDocumentPosition(uniforme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(uniforme.parentElement?.className).not.toContain('truncate')
    expect(uniforme.parentElement?.className).toContain('border-solid')
    const doCampo = grade.getByText('Uniforme de campo')
    expect(doCampo.parentElement?.className).toContain('border-dashed')
    expect(doCampo.parentElement?.className).not.toContain('truncate')
  })

  it('evento comum continua cortando o nome comprido e sem uniforme', async () => {
    abrir(handlerCalendario({ eventos: [criarEvento(42, { nome: 'Feira', inicio: '2026-10-08', fim: '2026-10-08' })], diasDeReuniao: [] }))
    const grade = within(await screen.findByRole('group', { name: 'Outubro de 2026' }))
    expect(grade.getByRole('link', { name: 'Feira' }).className).toContain('truncate')
    expect(grade.queryByText(/^Uniforme/)).not.toBeInTheDocument()
  })

  it('o cartão do evento mostra o uniforme e diz "Falta registrar quem foi" só com a pendência da regra única', async () => {
    const noPrazo = criarEventoEspecial(43, { nome: 'No prazo', inicio: '2026-10-01', fim: '2026-10-03' })
    const emAndamento = criarEventoEspecial(44, { nome: 'Em andamento', inicio: '2026-10-04', fim: '2026-10-06' })
    const semPontos = criarEventoEspecial(45, { nome: 'Sem pontos', inicio: '2026-10-02', fim: '2026-10-02', pontosParticipacao: 0, pontosUniforme: 0 })
    const concluida = criarEventoEspecial(46, {
      nome: 'Concluída',
      inicio: '2026-10-02',
      fim: '2026-10-02',
      lista: { concluidaEm: '2026-10-03T12:00:00Z', foram: 5, uniformizados: 3 },
    })
    abrir(handlerCalendario({ eventos: [noPrazo, emAndamento, semPontos, concluida] }))
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    const doItem = (nome: string) => within(lista.getByRole('link', { name: new RegExp(nome) }))
    expect(doItem('No prazo').getByText('Falta registrar quem foi')).toBeInTheDocument()
    expect(doItem('No prazo').getByText('Uniforme de gala')).toBeInTheDocument()
    expect(lista.getByRole('link', { name: new RegExp('No prazo') })).toHaveAttribute('href', `/adm/calendario/eventos/${noPrazo.id}`)
    for (const nome of ['Em andamento', 'Sem pontos', 'Concluída']) expect(doItem(nome).queryByText('Falta registrar quem foi')).not.toBeInTheDocument()
  })

  it('passados mais de 60 dias do fim, o aviso some sozinho', async () => {
    const antigo = criarEventoEspecial(47, { nome: 'Antigo', inicio: '2026-07-20', fim: '2026-07-20' })
    const recente = criarEventoEspecial(48, { nome: 'Recente', inicio: '2026-08-10', fim: '2026-08-10' })
    abrirEm('/adm/calendario?mes=2026-07', handlerCalendario({ eventos: [antigo, recente] }))
    const julho = within(await screen.findByRole('list', { name: 'Eventos de Julho' }))
    expect(julho.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(julho.queryByText('Falta registrar quem foi')).not.toBeInTheDocument()
  })
})
