import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErroDaApi } from '../api/cliente'
import { Carregando, DisponivelComInternet, ErroDeCarga } from './EstadosDeCarga'

describe('Carregando', () => {
  it('anuncia o rótulo e mostra três esqueletos por padrão', () => {
    render(<Carregando rotulo="Carregando o teste" />)
    expect(screen.getByRole('status', { name: 'Carregando o teste' }).children).toHaveLength(3)
  })

  it('usa o conteúdo passado no lugar dos esqueletos', () => {
    render(<Carregando rotulo="Carregando o teste">bloco próprio</Carregando>)
    expect(screen.getByRole('status', { name: 'Carregando o teste' })).toHaveTextContent('bloco próprio')
  })
})

describe('DisponivelComInternet', () => {
  it('explica que a tela precisa de conexão', () => {
    render(<DisponivelComInternet />)
    expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByText('Conecte-se para ver esta tela.')).toBeInTheDocument()
  })
})

describe('ErroDeCarga', () => {
  it('mostra a mensagem da API e repete a busca em "Tentar de novo"', async () => {
    const repetir = vi.fn()
    const erro = new ErroDaApi(422, { codigo: 'VALIDACAO', mensagem: 'Reunião não encontrada.' })
    render(<ErroDeCarga erro={erro} aoTentarDeNovo={repetir} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Reunião não encontrada.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(repetir).toHaveBeenCalledOnce()
  })

  it('erro que não é da API mostra a mensagem padrão', () => {
    render(<ErroDeCarga erro={new Error('detalhe interno')} aoTentarDeNovo={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar agora.')
    expect(screen.queryByText(/detalhe interno/)).not.toBeInTheDocument()
  })

  it('sem erro definido mostra a mensagem padrão', () => {
    render(<ErroDeCarga erro={null} aoTentarDeNovo={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar agora.')
  })

  it('falha de rede vira "Disponível quando houver internet", sem botão', () => {
    const erro = new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão.' }, 'REDE')
    render(<ErroDeCarga erro={erro} aoTentarDeNovo={vi.fn()} />)
    expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })
})
