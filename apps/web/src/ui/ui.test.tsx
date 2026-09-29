import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Botao } from './Botao'
import { Campo } from './Campo'
import { EstadoVazio } from './EstadoVazio'
import { FolhaLateral } from './FolhaLateral'
import { Tabela } from './Tabela'

interface Linha {
  id: string
  nome: string
}
const colunas = [{ chave: 'nome', titulo: 'Nome', celula: (l: Linha) => l.nome }]

describe('Tabela', () => {
  it('mostra o estado vazio quando não há itens', () => {
    render(
      <Tabela colunas={colunas} itens={[]} chaveItem={(l: Linha) => l.id} pagina={1} porPagina={25} total={0}
        aoMudarPagina={() => undefined} vazio={<EstadoVazio titulo="Nada aqui" />} />,
    )
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('pagina: informa o intervalo e habilita só o que existe', async () => {
    const aoMudar = vi.fn()
    render(
      <Tabela colunas={colunas} itens={[{ id: '1', nome: 'Ana' }]} chaveItem={(l: Linha) => l.id}
        pagina={2} porPagina={25} total={60} aoMudarPagina={aoMudar} />,
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('26–50 de 60')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(aoMudar).toHaveBeenNthCalledWith(1, 3)
    expect(aoMudar).toHaveBeenNthCalledWith(2, 1)
  })

  it('na última página a próxima fica desabilitada; na primeira, a anterior', () => {
    const { rerender } = render(
      <Tabela colunas={colunas} itens={[{ id: '1', nome: 'Ana' }]} chaveItem={(l: Linha) => l.id}
        pagina={3} porPagina={25} total={60} aoMudarPagina={() => undefined} />,
    )
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled()
    rerender(
      <Tabela colunas={colunas} itens={[{ id: '1', nome: 'Ana' }]} chaveItem={(l: Linha) => l.id}
        pagina={1} porPagina={25} total={60} aoMudarPagina={() => undefined} />,
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })
})

describe('FolhaLateral', () => {
  it('fechada não renderiza; aberta fecha com Esc, com o botão e no fundo', async () => {
    const aoFechar = vi.fn()
    const { rerender } = render(<FolhaLateral aberta={false} titulo="Novo" aoFechar={aoFechar}>corpo</FolhaLateral>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<FolhaLateral aberta titulo="Novo" aoFechar={aoFechar}>corpo</FolhaLateral>)
    expect(screen.getByRole('dialog', { name: 'Novo' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await userEvent.click(screen.getByTestId('fundo-da-folha'))
    expect(aoFechar).toHaveBeenCalledTimes(3)
  })
})

describe('Botao e Campo', () => {
  it('botão em carregamento fica desabilitado e não dispara', async () => {
    const aoClicar = vi.fn()
    render(<Botao carregando onClick={aoClicar}>Salvar</Botao>)
    await userEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(aoClicar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled()
  })

  it('campo liga rótulo, ajuda e erro ao input', () => {
    render(<Campo rotulo="E-mail" erro="E-mail inválido" ajuda="Usamos para o convite" />)
    const input = screen.getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/E-mail inválido/)
  })
})
