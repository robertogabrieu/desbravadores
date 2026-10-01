import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  LINK_CONVITE,
  criarConviteAcesso,
  handlersConviteAcesso,
} from '../../../testes/handlers/convite-acesso'
import { criarDesbravador, handlerDesbravadores } from '../../../testes/handlers/desbravadores'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import type { SituacaoAcesso } from '../../../api/convite-acesso'
import { rotasAdmDesbravadores } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', corToken: '--classe-amigo' })
const paulo = criarDesbravador({ id: uuid(310), nome: 'Paulo Henrique Souza', sexo: 'M', idade: 17 })

async function abrirAcesso(situacao?: SituacaoAcesso, registro = { gerados: [] as unknown[], cancelados: 0 }) {
  servidor.use(
    handlerDesbravadores([paulo]),
    handlerUnidades([aguias]),
    handlerClasses([amigo]),
    ...handlersConviteAcesso(situacao, registro),
  )
  renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Paulo Henrique Souza' }))
  const painel = within(await screen.findByRole('dialog', { name: 'Editar Paulo Henrique Souza' }))
  const secao = within(await painel.findByRole('region', { name: 'Acesso ao app' }))
  return { secao, registro }
}

describe('acesso ao app · sem conta e sem convite', () => {
  it('gera convite de conselheiro com a unidade escolhida e mostra o link, copiar e WhatsApp', async () => {
    const { secao, registro } = await abrirAcesso()
    await userEvent.click(await secao.findByRole('button', { name: 'Gerar convite de acesso' }))
    expect(secao.getByLabelText('Papel')).toHaveValue('CONSELHEIRO')
    await userEvent.click(await secao.findByRole('checkbox', { name: 'Águias' }))
    await userEvent.click(secao.getByRole('button', { name: 'Gerar link' }))

    expect(await secao.findByText(LINK_CONVITE)).toBeInTheDocument()
    expect(registro.gerados).toEqual([{ papel: 'CONSELHEIRO', unidadeIds: [aguias.id] }])
    const mensagem =
      `Olá, Paulo! Você foi convidado para usar o App do Desbravador no Clube Teste como conselheiro da unidade Águias. ` +
      `Crie seu acesso: ${LINK_CONVITE}`
    expect(secao.getByRole('link', { name: 'Enviar pelo WhatsApp' })).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
    )
    expect(secao.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument()
    expect(secao.getByRole('button', { name: 'Cancelar convite' })).toBeInTheDocument()
  })

  it('gera convite de instrutor com a classe escolhida', async () => {
    const { secao, registro } = await abrirAcesso()
    await userEvent.click(await secao.findByRole('button', { name: 'Gerar convite de acesso' }))
    await userEvent.selectOptions(secao.getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(await secao.findByRole('checkbox', { name: 'Amigo' }))
    await userEvent.click(secao.getByRole('button', { name: 'Gerar link' }))
    await secao.findByText(LINK_CONVITE)
    expect(registro.gerados).toEqual([{ papel: 'INSTRUTOR', classeIds: [amigo.id] }])
    expect(secao.getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href')).toContain(
      encodeURIComponent('como instrutor de Amigo.'),
    )
  })

  it('sem unidade marcada não gera e diz o que falta', async () => {
    const { secao, registro } = await abrirAcesso()
    await userEvent.click(await secao.findByRole('button', { name: 'Gerar convite de acesso' }))
    await userEvent.click(secao.getByRole('button', { name: 'Gerar link' }))
    expect(await secao.findByText('Escolha pelo menos uma unidade.')).toBeInTheDocument()
    expect(registro.gerados).toEqual([])
  })

  it('copiar link põe o link na área de transferência e confirma', async () => {
    const usuario = userEvent.setup()
    const { secao } = await abrirAcesso()
    await usuario.click(await secao.findByRole('button', { name: 'Gerar convite de acesso' }))
    await usuario.click(await secao.findByRole('checkbox', { name: 'Águias' }))
    await usuario.click(secao.getByRole('button', { name: 'Gerar link' }))
    await usuario.click(await secao.findByRole('button', { name: 'Copiar link' }))
    expect(await secao.findByText('Link copiado.')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(LINK_CONVITE)
  })
})

describe('acesso ao app · convite aberto', () => {
  it('mostra papel e validade, explica que o link só aparece ao gerar, e cancela com confirmação', async () => {
    const { secao, registro } = await abrirAcesso({ convite: criarConviteAcesso({ link: null }), conta: null })
    expect(await secao.findByText(/Convite aberto para conselheiro da unidade Águias/)).toBeInTheDocument()
    expect(secao.getByText(/vale até 07\/10\/2026/)).toBeInTheDocument()
    expect(secao.getByRole('button', { name: 'Gerar outro' })).toBeInTheDocument()
    expect(secao.queryByRole('link', { name: 'Enviar pelo WhatsApp' })).not.toBeInTheDocument()

    await userEvent.click(secao.getByRole('button', { name: 'Cancelar convite' }))
    const confirmacao = within(await screen.findByRole('dialog', { name: 'Cancelar o convite?' }))
    await userEvent.click(confirmacao.getByRole('button', { name: 'Sim, cancelar convite' }))
    await waitFor(() => expect(registro.cancelados).toBe(1))
    expect(await secao.findByRole('button', { name: 'Gerar convite de acesso' })).toBeInTheDocument()
  })
})

describe('acesso ao app · com conta ligada', () => {
  it('mostra e-mail e papel, sem botões de convite', async () => {
    const { secao } = await abrirAcesso({ convite: null, conta: { email: 'paulo@exemplo.org', papeis: ['CONSELHEIRO', 'INSTRUTOR'] } })
    expect(await secao.findByText('Tem acesso: paulo@exemplo.org · Conselheiro, Instrutor')).toBeInTheDocument()
    expect(secao.queryByRole('button', { name: 'Gerar convite de acesso' })).not.toBeInTheDocument()
    expect(secao.queryByRole('button', { name: 'Cancelar convite' })).not.toBeInTheDocument()
  })
})

describe('acesso ao app · erro ao carregar', () => {
  it('mostra a mensagem e tenta de novo', async () => {
    servidor.use(
      http.get('/api/desbravadores/:id/convite-acesso', () =>
        HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou agora.' }, { status: 500 }),
      ),
    )
    servidor.use(handlerDesbravadores([paulo]), handlerUnidades([aguias]), handlerClasses([amigo]))
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Paulo Henrique Souza' }))
    const secao = within(await screen.findByRole('region', { name: 'Acesso ao app' }))
    expect(await secao.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
