import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import { criarEvento, handlerCalendario, handlerCriarEvento, handlerEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

const acampamento = criarEvento(1, { nome: 'Acampamento do clube', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18' })

function abrirEm(rota: string, ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerConfiguracao(criarConfiguracao()), handlerCalendario({ eventos: [acampamento] }), ...extras)
  renderizarRotas(rotasAdmCalendario, rota)
}

describe('Evento · erro à vista ao salvar', () => {
  it('novo: salvar sem nome e com o fim antes do início foca o nome e resume os dois campos', async () => {
    let chamadas = 0
    abrirEm('/adm/calendario/eventos/novo?data=2026-10-10', handlerCriarEvento([], () => chamadas++))
    await screen.findByLabelText('Nome')
    await userEvent.clear(screen.getByLabelText('Fim'))
    await userEvent.type(screen.getByLabelText('Fim'), '2026-10-01')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    const resumo = screen.getByRole('alert', { name: 'Faltam 2 informações para salvar' })
    expect(within(resumo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Nome', 'Fim'])
    await userEvent.click(within(resumo).getByRole('link', { name: 'Fim' }))
    expect(screen.getByLabelText('Fim')).toHaveFocus()
    expect(chamadas).toBe(0)
  })

  it('editar: apagar o nome e salvar foca o nome e diz que falta 1 informação', async () => {
    abrirEm(`/adm/calendario/eventos/${acampamento.id}/editar`, handlerEvento(caixa(acampamento)))
    await userEvent.clear(await screen.findByLabelText('Nome'))

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    expect(within(screen.getByRole('alert', { name: 'Falta 1 informação para salvar' })).getByRole('link', { name: 'Nome' })).toBeInTheDocument()
  })
})
