import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasInicio } from './rotas'

const CHAVE_IOS = 'convite-instalacao-ios-visto'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function simularIphone(): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')
}

function dispararConviteDeInstalacao() {
  const prompt = vi.fn(() => Promise.resolve())
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  act(() => {
    window.dispatchEvent(evento)
  })
  return { prompt, evento }
}

describe('início provisório', () => {
  it('cumprimenta pelo primeiro nome, mostra papel e clube e o cartão "Em construção"', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument()
    expect(screen.getByText(/Instrutor/)).toBeInTheDocument()
    expect(screen.getByText(/Clube Teste/)).toBeInTheDocument()
    expect(screen.getByText('Em construção')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unidade/i })).not.toBeInTheDocument()
  })

  it('conselheiro vê o link para a unidade e o nome da unidade', async () => {
    const vinculo = criarVinculo('CONSELHEIRO', 1, { unidades: [{ id: '00000000-0000-4000-8000-000000000101', nome: 'Águias' }] })
    servidor.use(...handlersSessao([vinculo]))
    renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByRole('link', { name: /unidade/i })).toHaveAttribute('href', '/unidade')
    expect(screen.getByText(/Conselheiro · Águias/)).toBeInTheDocument()
  })
})

describe('convite de instalação', () => {
  it('botão "Instalar app" aparece quando o navegador oferece e abre o convite', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
    const { prompt, evento } = dispararConviteDeInstalacao()
    expect(evento.defaultPrevented).toBe(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Instalar app' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('no iPhone mostra as duas instruções uma única vez', async () => {
    simularIphone()
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    const primeira = renderizarRotas(rotasInicio, '/inicio')
    expect(await screen.findByText(/Compartilhar → Adicionar à Tela de Início/)).toBeInTheDocument()
    expect(screen.getByText(/Depois de instalar, entre de novo pelo ícone/)).toBeInTheDocument()
    expect(localStorage.getItem(CHAVE_IOS)).toBe('1')
    primeira.unmount()

    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByText(/Compartilhar → Adicionar à Tela de Início/)).not.toBeInTheDocument()
  })

  it('fora do iPhone não mostra instruções de iPhone', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasInicio, '/inicio')
    await screen.findByRole('heading', { name: 'Olá, Ana' })
    expect(screen.queryByText(/Compartilhar/)).not.toBeInTheDocument()
  })
})
