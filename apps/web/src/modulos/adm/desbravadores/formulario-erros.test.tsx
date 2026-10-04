import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { criarDesbravador, handlerCriarDesbravador, handlerDesbravador } from '../../../testes/handlers/desbravadores'
import { criarClasse, criarListaUsuarios, criarUnidade, handlerClasses, handlerUnidades, handlerUsuarios } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmDesbravadores } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', corToken: '--classe-amigo' })

function prepararLeituras() {
  servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]), handlerUsuarios(criarListaUsuarios()), handlerConfiguracao(criarConfiguracao()))
}

describe('Desbravador · erro à vista ao salvar', () => {
  it('novo: salvar vazio foca o primeiro campo com erro e resume o que falta, com um link por campo', async () => {
    let enviou = false
    prepararLeituras()
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], () => (enviou = true)))
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores/novo')
    await screen.findByRole('heading', { level: 1, name: 'Novo desbravador' })

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveFocus())
    const resumo = screen.getByRole('alert', { name: 'Faltam 3 informações para salvar' })
    expect(within(resumo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Nome completo', 'Nascimento', 'Sexo'])
    await userEvent.click(within(resumo).getByRole('link', { name: 'Sexo' }))
    expect(screen.getByLabelText('Sexo')).toHaveFocus()
    expect(enviou).toBe(false)
  })

  it('editar: apagar o nome e salvar foca o nome e diz que falta 1 informação', async () => {
    const dbv = criarDesbravador({ id: uuid(301), nome: 'Ana Clara Souza', unidade: null, classeAtual: null })
    prepararLeituras()
    servidor.use(handlerDesbravador(caixa(dbv)))
    renderizarRotas(rotasAdmDesbravadores, `/adm/desbravadores/${dbv.id}/editar`)
    await screen.findByRole('heading', { level: 1, name: dbv.nome })

    await userEvent.clear(screen.getByLabelText('Nome completo'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveFocus())
    const resumo = screen.getByRole('alert', { name: 'Falta 1 informação para salvar' })
    expect(within(resumo).getByRole('link', { name: 'Nome completo' })).toBeInTheDocument()
  })
})
