import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import { criarEvento, handlerCalendario, handlerEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao, handlerErroConfiguracao } from '../../../testes/handlers/clube'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { dosDiasDeReuniao } from './datas'
import { rotasAdmCalendario } from './rotas'
import { ROTULOS_DO_TIPO, TEXTO_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

const ESCOLHA = '/adm/calendario/eventos/novo?data=2026-10-17'
const SUBTITULO = 'Que tipo de evento é? Escolha o tipo e o formulário certo abre em seguida.'
const NA_ORDEM: TipoDeEvento[] = ['REUNIAO_EXTRA', 'FERIAS', 'ACAMPAMENTO', 'EVENTO', 'EVENTO_ESPECIAL', 'FERIADO', 'SEM_REUNIAO']

function abrir(rota: string, ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerConfiguracao(criarConfiguracao({ diaReuniao: 0 })), handlerCalendario(), ...extras)
  return renderizarRotas(rotasAdmCalendario, rota)
}

const cartoes = () => within(screen.getByRole('list')).getAllByRole('link')

describe('Novo evento · escolha do tipo', () => {
  it('sem tipo no endereço mostra a escolha: título, subtítulo e os 7 cartões na ordem, com a frase de apoio', async () => {
    abrir(ESCOLHA)

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo evento' })).toBeInTheDocument()
    expect(screen.getByText(SUBTITULO)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    await screen.findAllByText(new RegExp(`fora ${dosDiasDeReuniao(0).do}`))
    const links = cartoes()
    expect(links).toHaveLength(7)
    NA_ORDEM.forEach((tipo, indice) => {
      const cartao = links[indice]
      expect(cartao).toHaveTextContent(ROTULOS_DO_TIPO[tipo])
      expect(cartao).toHaveTextContent(TEXTO_DO_TIPO[tipo]?.(0) ?? 'sem frase')
      expect(cartao).toHaveAttribute('href', `${ESCOLHA}&tipo=${tipo}`)
    })
  })

  it('com a configuração fora do ar, a frase cai em "dia de reunião"', async () => {
    servidor.use(handlerErroConfiguracao(), handlerCalendario())
    renderizarRotas(rotasAdmCalendario, ESCOLHA)
    expect(await screen.findAllByText(/fora do dia de reunião/)).toHaveLength(2)
  })

  it('os cartões têm alvo de toque mínimo, nada fica preso à tela e o foco abre no título', async () => {
    abrir(ESCOLHA)
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Novo evento' })
    cartoes().forEach((cartao) => expect(cartao).toHaveClass('min-h-[var(--touch-min)]'))
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(document.querySelector('.fixed, .sticky')).toBeNull()
  })

  it('Cancelar volta ao mês da data', async () => {
    const { roteador } = abrir(ESCOLHA)
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe('/adm/calendario')
    expect(roteador.state.location.search).toBe('?mes=2026-10')
  })

  it('tipo inválido ou que o formulário não aceita cai na escolha', async () => {
    const primeiro = abrir(`${ESCOLHA}&tipo=CLASSE_BIBLICA`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo evento' })).toBeInTheDocument()
    expect(cartoes()).toHaveLength(7)
    primeiro.unmount()

    abrir(`${ESCOLHA}&tipo=banana`)
    expect(await screen.findByText(SUBTITULO)).toBeInTheDocument()
  })
})

describe('Novo evento · formulário com o tipo escolhido', () => {
  it('o cartão leva ao formulário daquele tipo, com a data, sem o seletor e com o selo', async () => {
    const { roteador } = abrir(ESCOLHA)
    await userEvent.click(await screen.findByRole('link', { name: new RegExp(ROTULOS_DO_TIPO.EVENTO_ESPECIAL) }))

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument()
    expect(roteador.state.location.search).toBe('?data=2026-10-17&tipo=EVENTO_ESPECIAL')
    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Início')).toHaveValue('2026-10-17')
    expect(screen.getByTestId('selo-do-tipo')).toHaveTextContent('Evento especial')
    expect(screen.getByRole('group', { name: 'Uniforme e pontos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trocar tipo' })).toHaveClass('min-h-[var(--touch-min)]')
  })

  it('cada tipo abre com as marcações dele', async () => {
    abrir(`${ESCOLHA}&tipo=ACAMPAMENTO`)
    await screen.findByLabelText('Nome')
    expect(screen.getByLabelText('Terá reunião')).not.toBeChecked()
    expect(screen.getByLabelText('Terá atividade de campo')).toBeChecked()
    expect(screen.getByTestId('selo-do-tipo')).toHaveTextContent('Acampamento / campo')
  })

  it('Trocar tipo com o formulário intocado volta à escolha, sem perguntar, levando a data', async () => {
    const { roteador } = abrir(`${ESCOLHA}&tipo=FERIAS`)
    await userEvent.click(await screen.findByRole('link', { name: 'Trocar tipo' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(roteador.state.location.search).toBe('?data=2026-10-17')
    expect(await screen.findByText(SUBTITULO)).toBeInTheDocument()
  })

  it('Trocar tipo com algo preenchido confirma; continuar preenchendo mantém o que foi digitado', async () => {
    const { roteador } = abrir(`${ESCOLHA}&tipo=EVENTO`)
    await userEvent.type(await screen.findByLabelText('Nome'), 'Culto de gala')
    await userEvent.click(screen.getByRole('link', { name: 'Trocar tipo' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Trocar o tipo do evento?' })
    expect(dialogo).toHaveTextContent('O que você já preencheu neste formulário será descartado.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Continuar preenchendo' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Culto de gala')
    expect(roteador.state.location.search).toContain('tipo=EVENTO')
  })

  it('Trocar e descartar volta à escolha; o tipo seguinte abre limpo e com a mesma data', async () => {
    const { roteador } = abrir(`${ESCOLHA}&tipo=EVENTO`)
    await userEvent.type(await screen.findByLabelText('Nome'), 'Culto de gala')
    await userEvent.click(screen.getByRole('link', { name: 'Trocar tipo' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Trocar e descartar' }))

    expect(await screen.findByRole('link', { name: 'Cancelar' })).toBeInTheDocument()
    expect(roteador.state.location.search).toBe('?data=2026-10-17')
    await userEvent.click(screen.getByRole('link', { name: new RegExp(ROTULOS_DO_TIPO.FERIADO) }))
    expect(await screen.findByLabelText('Nome')).toHaveValue('')
    expect(screen.getByLabelText('Início')).toHaveValue('2026-10-17')
  })

  it('mudar só uma marcação também conta como preenchido', async () => {
    abrir(`${ESCOLHA}&tipo=EVENTO`)
    await userEvent.click(await screen.findByLabelText('Terá classe'))
    await userEvent.click(screen.getByRole('link', { name: 'Trocar tipo' }))
    expect(await screen.findByRole('dialog', { name: 'Trocar o tipo do evento?' })).toBeInTheDocument()
  })

  it('o voltar do navegador volta à escolha', async () => {
    const { roteador } = abrir(ESCOLHA)
    await userEvent.click(await screen.findByRole('link', { name: new RegExp(ROTULOS_DO_TIPO.SEM_REUNIAO) }))
    await screen.findByLabelText('Nome')
    await roteador.navigate(-1)
    expect(await screen.findByText(SUBTITULO)).toBeInTheDocument()
  })
})

describe('Editar evento · sem escolha', () => {
  it('não mostra a escolha nem o selo; o seletor de tipo continua', async () => {
    const evento = criarEvento(1, { nome: 'Acampamento do clube', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18' })
    abrir(`/adm/calendario/eventos/${evento.id}/editar`, handlerEvento(caixa(evento)))

    expect(await screen.findByLabelText('Tipo')).toHaveValue('ACAMPAMENTO')
    expect(screen.queryByTestId('selo-do-tipo')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trocar tipo' })).not.toBeInTheDocument()
  })

  it('o ?tipo= no endereço da edição é ignorado', async () => {
    const evento = criarEvento(2, { nome: 'Reunião especial', tipo: 'EVENTO' })
    abrir(`/adm/calendario/eventos/${evento.id}/editar?tipo=FERIAS`, handlerEvento(caixa(evento)))
    expect(await screen.findByLabelText('Tipo')).toHaveValue('EVENTO')
  })
})
