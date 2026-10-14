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
  it('novo: salvar sem nome foca o nome, resume o campo e não envia', async () => {
    let chamadas = 0
    abrirEm('/adm/calendario/eventos/novo?data=2026-10-10&tipo=EVENTO', handlerCriarEvento([], () => chamadas++))
    await screen.findByLabelText('Nome')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    const resumo = screen.getByRole('region', { name: 'Revise 1 campo para salvar' })
    expect(within(resumo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Nome'])
    expect(chamadas).toBe(0)
  })

  it('editar: apagar o nome e salvar foca o nome e diz que falta 1 informação', async () => {
    abrirEm(`/adm/calendario/eventos/${acampamento.id}/editar`, handlerEvento(caixa(acampamento)))
    await userEvent.clear(await screen.findByLabelText('Nome'))

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    expect(within(screen.getByRole('region', { name: 'Revise 1 campo para salvar' })).getByRole('link', { name: 'Nome' })).toBeInTheDocument()
  })
})
