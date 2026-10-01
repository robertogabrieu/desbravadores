import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ErroDaApi } from '../api/cliente'
import { CabecalhoDaPagina } from './CabecalhoDaPagina'
import { EstadoNaoEncontrado, ehNaoEncontrado } from './EstadoNaoEncontrado'
import { ListaDePares } from './ListaDePares'
import { RodapeDoFormulario } from './RodapeDoFormulario'

function Onde() {
  const local = useLocation()
  return <p data-testid="onde">{`${local.pathname}${local.search}`}</p>
}

const emRota = (conteudo: ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/adm/desbravadores/1']}>
      <Routes>
        <Route path="*" element={<>{conteudo}<Onde /></>} />
      </Routes>
    </MemoryRouter>,
  )

describe('CabecalhoDaPagina', () => {
  it('Voltar vai ao destino dado; mostra sobretítulo, h1, apoio e ações', async () => {
    emRota(
      <CabecalhoDaPagina
        voltar={{ para: '/adm/desbravadores?pagina=2', rotulo: 'Desbravadores' }}
        sobretitulo="Desbravador · Ativo"
        titulo="Ana Beatriz Souza"
        apoio="10 anos · Águias"
        acoes={<button type="button">Editar</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })).toBeInTheDocument()
    expect(screen.getByText('Desbravador · Ativo')).toBeInTheDocument()
    expect(screen.getByText('10 anos · Águias')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Desbravadores' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/adm/desbravadores?pagina=2')
  })
})

describe('ListaDePares', () => {
  it('é uma lista de definição com rótulo e valor', () => {
    render(<ListaDePares colunas={3} pares={[{ rotulo: 'Sexo', valor: 'Feminino' }, { rotulo: 'Unidade', valor: 'Águias' }]} />)
    const termos = screen.getAllByRole('term').map((t) => t.textContent)
    expect(termos).toEqual(['Sexo', 'Unidade'])
    expect(screen.getByText('Sexo').nextElementSibling).toHaveTextContent('Feminino')
  })
})

describe('RodapeDoFormulario', () => {
  it('Salvar é o submit e vem antes de Cancelar (em cima no celular); nada preso na tela', () => {
    const { container } = render(
      <MemoryRouter>
        <form>
          <RodapeDoFormulario cancelar={{ para: '/adm/unidades/1' }} rotuloSalvar="Salvar alterações" salvando={false} />
        </form>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/adm/unidades/1')
    const ordem = [...container.querySelectorAll('a, button')].map((e) => e.textContent)
    expect(ordem).toEqual(['Salvar alterações', 'Cancelar'])
    expect(container.innerHTML).not.toMatch(/\b(fixed|sticky)\b/)
  })
})

describe('EstadoNaoEncontrado', () => {
  it('404 e 400 da API contam como "não encontrado"; 500 e outros erros, não', () => {
    expect(ehNaoEncontrado(new ErroDaApi(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'x' }))).toBe(true)
    expect(ehNaoEncontrado(new ErroDaApi(400, { codigo: 'VALIDACAO', mensagem: 'x' }))).toBe(true)
    expect(ehNaoEncontrado(new ErroDaApi(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))).toBe(false)
    expect(ehNaoEncontrado(new Error('rede'))).toBe(false)
  })

  it('diz o que não achou e leva à lista', () => {
    render(
      <MemoryRouter>
        <EstadoNaoEncontrado registro="este desbravador" lista={{ para: '/adm/desbravadores', rotulo: 'Ver a lista de desbravadores' }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Não encontramos este desbravador' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a lista de desbravadores' })).toHaveAttribute('href', '/adm/desbravadores')
  })

  it('a explicação vale para qualquer registro, sem concordar com um gênero', () => {
    render(
      <MemoryRouter>
        <EstadoNaoEncontrado registro="esta unidade" lista={{ para: '/adm/unidades', rotulo: 'Ver as unidades' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Pode ter sido removido, ser de outro clube, ou o endereço estar incompleto.')).toBeInTheDocument()
  })
})
