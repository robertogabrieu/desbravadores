import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import { criarEvento, criarEventoEspecial, handlerCalendario, handlerCriarEvento, handlerEditarEvento, handlerEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

const APOIO_DO_TIPO =
  'Evento especial: vale pontos no ranking, tem lista de quem foi e pede uniforme de gala ou de campo.'
const SEM_PONTOS_DE_IR = 'Informe os pontos de quem for ao evento. Pode ser 0.'
const SEM_PONTOS_DE_UNIFORME = 'Informe os pontos de quem for com o uniforme. Pode ser 0.'
const PONTOS_INVALIDOS = 'Use um número inteiro de 0 a 1000'

function abrir(rota: string, ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerConfiguracao(criarConfiguracao({ diaReuniao: 0 })), handlerCalendario(), ...extras)
  return renderizarRotas(rotasAdmCalendario, rota)
}

async function abrirNovoDoTipo(tipo: string, ...extras: Parameters<typeof servidor.use>) {
  const retorno = abrir(`/adm/calendario/eventos/novo?data=2026-10-17&tipo=${tipo}`, ...extras)
  await screen.findByLabelText('Nome')
  return retorno
}

const abrirNovoEspecial = (...extras: Parameters<typeof servidor.use>) => abrirNovoDoTipo('EVENTO_ESPECIAL', ...extras)

const pontosDeIr = () => screen.getByLabelText('Pontos por ir ao evento')
const pontosDoUniforme = () => screen.getByLabelText('Pontos por usar o uniforme')

describe('Evento especial · formulário novo', () => {
  it('abre sem uniforme escolhido e sem pontos, com o texto de apoio do tipo', async () => {
    await abrirNovoEspecial()

    expect(screen.getByText(APOIO_DO_TIPO)).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Uniforme e pontos' })
    const uniforme = within(grupo).getByRole('group', { name: 'Uniforme do evento' })
    expect(within(uniforme).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Uniforme de gala', 'Uniforme de campo'])
    expect(within(uniforme).getByLabelText('Uniforme de gala')).not.toBeChecked()
    expect(within(uniforme).getByLabelText('Uniforme de campo')).not.toBeChecked()
    expect(pontosDeIr()).toHaveValue(null)
    expect(pontosDoUniforme()).toHaveValue(null)
    expect(screen.queryByText(/^Quem for ganha \d/)).not.toBeInTheDocument()
  })

  it('outros tipos não mostram o grupo de uniforme e pontos', async () => {
    await abrirNovoDoTipo('EVENTO')

    expect(screen.queryByRole('group', { name: 'Uniforme e pontos' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pontos por ir ao evento')).not.toBeInTheDocument()
  })

  it('as marcações vêm neutras: reunião e classe marcadas, campo não', async () => {
    await abrirNovoEspecial()

    expect(screen.getByLabelText('Terá reunião')).toBeChecked()
    expect(screen.getByLabelText('Terá classe')).toBeChecked()
    expect(screen.getByLabelText('Terá atividade de campo')).not.toBeChecked()
    expect(screen.getByText(/Desmarque “Terá reunião” se o evento toma o lugar dela\./)).toBeInTheDocument()
  })

  it('a frase do instrutor só aparece com “Terá classe” desmarcada', async () => {
    await abrirNovoEspecial()
    const frase = /Se já houver classes marcadas no período, o instrutor é avisado\./
    expect(screen.queryByText(frase)).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Terá classe'))
    expect(screen.getByText(frase)).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Terá classe'))
    expect(screen.queryByText(frase)).not.toBeInTheDocument()
  })

  it('salvar sem nada leva o foco ao primeiro da fila (pontos por ir) e resume os três, na ordem da tela', async () => {
    let chamadas = 0
    await abrirNovoEspecial(handlerCriarEvento([], () => chamadas++))
    await userEvent.type(screen.getByLabelText('Nome'), 'Culto de Investidura')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(pontosDeIr()).toHaveFocus())
    expect(screen.getByText('Escolha o uniforme do evento.')).toBeInTheDocument()
    const resumo = screen.getByRole('region', { name: 'Revise 3 campos para salvar' })
    expect(within(resumo).getAllByRole('link').map((l) => l.textContent)).toEqual(['Pontos por ir ao evento', 'Uniforme do evento', 'Pontos por usar o uniforme'])
    await userEvent.click(within(resumo).getByRole('link', { name: 'Uniforme do evento' }))
    expect(screen.getByLabelText('Uniforme de gala')).toHaveFocus()
    expect(chamadas).toBe(0)
  })

  it('só o uniforme faltando: o foco vai a ele e o resumo diz 1 campo', async () => {
    await abrirNovoEspecial()
    await userEvent.type(screen.getByLabelText('Nome'), 'Culto de Investidura')
    await userEvent.type(pontosDeIr(), '20')
    await userEvent.type(pontosDoUniforme(), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByLabelText('Uniforme de gala')).toHaveFocus())
    const resumo = screen.getByRole('region', { name: 'Revise 1 campo para salvar' })
    await userEvent.click(within(resumo).getByRole('link', { name: 'Uniforme do evento' }))
    expect(screen.getByLabelText('Uniforme de gala')).toHaveFocus()
  })

  it('escolher o uniforme tira o erro dele', async () => {
    await abrirNovoEspecial()
    await userEvent.type(screen.getByLabelText('Nome'), 'Culto')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Escolha o uniforme do evento.')

    await userEvent.click(screen.getByLabelText('Uniforme de campo'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.queryByText('Escolha o uniforme do evento.')).not.toBeInTheDocument()
  })

  it('ao sair do campo vazio, a mensagem aparece junto dele e não vai ao resumo nem tira o foco', async () => {
    await abrirNovoEspecial()
    await userEvent.click(pontosDeIr())

    await userEvent.tab()

    const campo = pontosDeIr()
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(SEM_PONTOS_DE_IR))
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Uniforme de gala')).toHaveFocus()
    expect(screen.queryByRole('region', { name: /Revise/ })).not.toBeInTheDocument()
  })

  it('ao sair do campo de pontos do uniforme vazio, a mensagem é a do uniforme', async () => {
    await abrirNovoEspecial()
    await userEvent.click(pontosDoUniforme())
    await userEvent.tab()

    expect(pontosDoUniforme()).toHaveAccessibleDescription(expect.stringContaining(SEM_PONTOS_DE_UNIFORME))
  })

  it.each(['1001', '-1', '1.5'])('ao sair com %s, pede um inteiro de 0 a 1000', async (digitado) => {
    await abrirNovoEspecial()
    await userEvent.type(pontosDeIr(), digitado)

    await userEvent.tab()

    expect(pontosDeIr()).toHaveAccessibleDescription(expect.stringContaining(PONTOS_INVALIDOS))
  })

  it('zero é um valor válido e corrigir o campo tira a mensagem', async () => {
    await abrirNovoEspecial()
    await userEvent.click(pontosDeIr())
    await userEvent.tab()
    expect(pontosDeIr()).toHaveAttribute('aria-invalid', 'true')

    await userEvent.type(pontosDeIr(), '0')
    await userEvent.tab()

    expect(pontosDeIr()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(SEM_PONTOS_DE_IR)).not.toBeInTheDocument()
  })

  it('a frase de efeito repete o que foi digitado e segue o uniforme escolhido', async () => {
    await abrirNovoEspecial()
    await userEvent.click(screen.getByLabelText('Uniforme de gala'))
    await userEvent.type(pontosDeIr(), '20')
    await userEvent.type(pontosDoUniforme(), '10')

    expect(screen.getByText('Quem for ganha 20 pontos. Quem for com o uniforme de gala ganha mais 10.')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Uniforme de campo'))
    expect(screen.getByText('Quem for ganha 20 pontos. Quem for com o uniforme de campo ganha mais 10.')).toBeInTheDocument()

    await userEvent.clear(pontosDoUniforme())
    expect(screen.queryByText(/^Quem for ganha \d/)).not.toBeInTheDocument()
  })

  it('salva o uniforme e os dois valores como números e leva à ficha com “Evento salvo.” lido uma vez', async () => {
    let corpo: Record<string, unknown> = {}
    const criado = caixa(criarEventoEspecial(99, { id: uuid(899), nome: 'Culto de Investidura', inicio: '2026-10-31', fim: '2026-10-31' }))
    const { roteador } = await abrirNovoEspecial(handlerEvento(criado), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))
    await userEvent.type(screen.getByLabelText('Nome'), 'Culto de Investidura')
    await userEvent.click(screen.getByLabelText('Uniforme de gala'))
    await userEvent.type(pontosDeIr(), '20')
    await userEvent.type(pontosDoUniforme(), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'EVENTO_ESPECIAL', uniforme: 'GALA', pontosParticipacao: 20, pontosUniforme: 10, temReuniao: true, temClasse: true, bomParaCampo: false }))
    expect(await screen.findByText('Evento salvo. Conselheiros e instrutores o veem ao abrir o app com internet.')).toBeInTheDocument()
    expect(screen.getAllByText(/Evento salvo\./)).toHaveLength(1)
    await waitFor(() => expect(roteador.state.location.state ?? {}).not.toHaveProperty('salvo'))
    expect(screen.getByText(/Evento salvo\./)).toBeInTheDocument()
  })

  it('evento de outro tipo não leva uniforme nem pontos na gravação', async () => {
    let corpo: Record<string, unknown> = {}
    const criado = caixa(criarEvento(98, { id: uuid(899) }))
    abrir('/adm/calendario/eventos/novo?data=2026-10-17&tipo=EVENTO', handlerEvento(criado), handlerCriarEvento([], (c) => (corpo = c as Record<string, unknown>)))
    await userEvent.type(await screen.findByLabelText('Nome'), 'Jantar')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpo).toMatchObject({ nome: 'Jantar', tipo: 'EVENTO' }))
    expect(corpo).not.toHaveProperty('uniforme')
    expect(corpo).not.toHaveProperty('pontosParticipacao')
    expect(corpo).not.toHaveProperty('pontosUniforme')
  })
})

const concluido = (parcial: Parameters<typeof criarEventoEspecial>[1] = {}) =>
  caixa(
    criarEventoEspecial(7, {
      id: uuid(807),
      nome: 'Dia do Desbravador',
      inicio: '2026-09-26',
      fim: '2026-09-26',
      pontosParticipacao: 20,
      pontosUniforme: 10,
      lista: { concluidaEm: '2026-09-27T00:05:00.000Z', foram: 38, uniformizados: 15 },
      ...parcial,
    }),
  )

describe('Evento especial · edição', () => {
  it('traz o que foi gravado: uniforme marcado e pontos preenchidos', async () => {
    const evento = caixa(criarEventoEspecial(5, { id: uuid(805), uniforme: 'CAMPO', pontosParticipacao: 15, pontosUniforme: 5 }))
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento))

    expect(await screen.findByLabelText('Uniforme de campo')).toBeChecked()
    expect(screen.getByLabelText('Uniforme de gala')).not.toBeChecked()
    expect(pontosDeIr()).toHaveValue(15)
    expect(pontosDoUniforme()).toHaveValue(5)
    expect(screen.getByLabelText('Tipo')).toBeEnabled()
    expect(screen.queryByText(/Se você trocar o uniforme/)).not.toBeInTheDocument()
  })

  it('lista concluída: avisa, trava o tipo e lembra que as marcas de uniforme não mudam', async () => {
    const evento = concluido()
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento))

    expect(await screen.findByText('A lista deste evento já foi concluída: 38 desbravadores foram. Se você mudar a data ou os pontos, os pontos desses 38 serão refeitos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tipo')).toBeDisabled()
    expect(screen.getByText('O tipo não muda depois que a lista é começada.')).toBeInTheDocument()
    expect(screen.getByText('Se você trocar o uniforme, as marcas de quem foi com o uniforme continuam como estão. Confira a lista depois.')).toBeInTheDocument()
  })

  it('lista começada e não concluída: tipo travado, sem o aviso de refazer pontos', async () => {
    const evento = concluido({ lista: { concluidaEm: null, foram: 41, uniformizados: 12 } })
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento))

    await screen.findByLabelText('Nome')
    expect(screen.getByLabelText('Tipo')).toBeDisabled()
    expect(screen.getByText('O tipo não muda depois que a lista é começada.')).toBeInTheDocument()
    expect(screen.queryByText(/já foi concluída/)).not.toBeInTheDocument()
  })

  it('lista concluída, pontos mudados: pergunta antes; “Voltar ao formulário” não grava', async () => {
    const gravados: unknown[] = []
    const evento = concluido()
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento), handlerEditarEvento([], (_, c) => gravados.push(c)))
    await userEvent.clear(await screen.findByLabelText('Pontos por ir ao evento'))
    await userEvent.type(pontosDeIr(), '25')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Refazer os pontos de 38 desbravadores?' })
    expect(dialogo).toHaveTextContent('Os pontos por ir passam de 20 para 25 para quem foi ao Dia do Desbravador. O ranking de setembro muda. Você pode mudar de novo depois.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Voltar ao formulário' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gravados).toEqual([])
    expect(pontosDeIr()).toHaveValue(25)
  })

  it('lista concluída, pontos mudados: “Refazer os pontos” grava', async () => {
    const gravados: unknown[] = []
    const evento = concluido()
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento), handlerEditarEvento([], (_, c) => gravados.push(c)))
    await userEvent.clear(await screen.findByLabelText('Pontos por usar o uniforme'))
    await userEvent.type(pontosDoUniforme(), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Refazer os pontos de 38 desbravadores?' })
    expect(dialogo).toHaveTextContent('Os pontos por usar o uniforme passam de 10 para 12')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Refazer os pontos' }))

    await waitFor(() => expect(gravados).toHaveLength(1))
    expect(gravados[0]).toMatchObject({ pontosParticipacao: 20, pontosUniforme: 12, uniforme: 'GALA' })
  })

  it('lista concluída, data mudada: também pergunta', async () => {
    const evento = concluido()
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento), handlerEditarEvento())
    const inicio = await screen.findByLabelText('Início')
    await userEvent.clear(inicio)
    await userEvent.type(inicio, '25/09/2026')
    await userEvent.clear(screen.getByLabelText('Fim'))
    await userEvent.type(screen.getByLabelText('Fim'), '25/09/2026')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByRole('dialog', { name: 'Refazer os pontos de 38 desbravadores?' })).toBeInTheDocument()
  })

  it('lista concluída, só o nome ou o uniforme mudaram: grava sem perguntar', async () => {
    const gravados: unknown[] = []
    const evento = concluido()
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento), handlerEditarEvento([], (_, c) => gravados.push(c)))
    await userEvent.type(await screen.findByLabelText('Nome'), ' 2026')
    await userEvent.click(screen.getByLabelText('Uniforme de campo'))

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(gravados).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gravados[0]).toMatchObject({ nome: 'Dia do Desbravador 2026', uniforme: 'CAMPO' })
  })

  it('sem lista concluída, mudar os pontos grava direto', async () => {
    const gravados: unknown[] = []
    const evento = caixa(criarEventoEspecial(5, { id: uuid(805) }))
    abrir(`/adm/calendario/eventos/${evento.atual.id}/editar`, handlerEvento(evento), handlerEditarEvento([], (_, c) => gravados.push(c)))
    await userEvent.clear(await screen.findByLabelText('Pontos por ir ao evento'))
    await userEvent.type(pontosDeIr(), '25')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(gravados).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('data que ainda não chegou, recusada pelo servidor: a mensagem fica no Início e leva o foco', async () => {
    const mensagem = 'Esta data ainda não chegou e a lista deste evento já tem marcas. Escolha uma data que já passou, ou exclua o evento e cadastre de novo.'
    const evento = concluido({ lista: { concluidaEm: null, foram: 41, uniformizados: 12 } })
    abrir(
      `/adm/calendario/eventos/${evento.atual.id}/editar`,
      handlerEvento(evento),
      http.patch('/api/calendario/eventos/:id', () => HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Confira os campos informados.', campos: { inicio: mensagem } }, { status: 400 })),
    )
    const inicio = await screen.findByLabelText('Início')
    await userEvent.clear(inicio)
    await userEvent.type(inicio, '15/11/2026')
    await userEvent.clear(screen.getByLabelText('Fim'))
    await userEvent.type(screen.getByLabelText('Fim'), '15/11/2026')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Início')).toHaveFocus())
  })
})
