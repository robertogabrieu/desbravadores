import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerMembrosUnidade, handlerSemMembros, handlerUnidades } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { handlerCriarUnidade, handlerEditarUnidade, handlerErroEditarUnidade, handlerUnidade } from '../../../testes/handlers/unidades'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUnidades } from './rotas'

const aguias = criarUnidade({
  id: uuid(201),
  nome: 'Águias',
  tipo: 'MASCULINA',
  gritoDeGuerra: 'Voar alto!',
  conselheiros: [
    { usuarioId: uuid(501), nome: 'Paulo Reis' },
    { usuarioId: uuid(502), nome: 'Rita Melo' },
  ],
  totalMembros: 1,
})
const leoes = criarUnidade({ id: uuid(202), nome: 'Leões', tipo: 'FEMININA', totalMembros: 0 })
const antiga = criarUnidade({ id: uuid(203), nome: 'Falcões', ativa: false })

function abrir(rota = '/adm/unidades', listaDeUnidades = handlerUnidades([aguias, leoes, antiga])) {
  servidor.use(listaDeUnidades, handlerUnidade(caixa(aguias)), handlerMembrosUnidade([]), handlerSemMembros([]))
  return renderizarRotas(rotasAdmUnidades, rota)
}

const cartao = (nome: string) => within(screen.getByRole('link', { name: new RegExp(`^${nome}`) }))

describe('A3 · cartões', () => {
  it('mostram nome, tipo, conselheiros e total; inativa vem marcada', async () => {
    abrir()
    await screen.findByRole('link', { name: /^Águias/ })
    expect(cartao('Águias').getByText('Masculina')).toBeInTheDocument()
    expect(cartao('Águias').getByText('Conselheiros: Paulo Reis, Rita Melo')).toBeInTheDocument()
    expect(cartao('Águias').getByText('1 DBV')).toBeInTheDocument()
    expect(cartao('Águias').getByText(/Voar alto!/)).toBeInTheDocument()
    expect(cartao('Leões').getByText('Sem conselheiro')).toBeInTheDocument()
    expect(cartao('Leões').getByText('0 DBVs')).toBeInTheDocument()
    expect(cartao('Falcões').getByText('Inativa')).toBeInTheDocument()
    expect(screen.getByText('3 unidades · 1 desbravador')).toBeInTheDocument()
  })

  it('pede também as inativas ao Adm', async () => {
    let consulta = ''
    abrir(
      '/adm/unidades',
      http.get('/api/unidades', ({ request }) => {
        consulta = new URL(request.url).search
        return HttpResponse.json([aguias])
      }),
    )
    await screen.findByRole('link', { name: /^Águias/ })
    expect(consulta).toBe('?todas=true')
  })

  it('o cartão inteiro é link para a ficha; não há mais painel de membros nem Editar no cartão', async () => {
    abrir()
    expect(await screen.findByRole('link', { name: /^Águias/ })).toHaveAttribute('href', `/adm/unidades/${uuid(201)}`)
    expect(screen.queryByRole('button', { name: /Membros de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('"Nova unidade" é link para o formulário', async () => {
    abrir()
    expect(await screen.findByRole('link', { name: 'Nova unidade' })).toHaveAttribute('href', '/adm/unidades/nova')
  })
})

describe('A3 · nova e editar (telas dedicadas)', () => {
  it('cria com nome, tipo e grito', async () => {
    let corpo: unknown
    servidor.use(handlerCriarUnidade(criarUnidade(), (recebido) => (corpo = recebido)))
    abrir('/adm/unidades/nova')
    expect(screen.queryByLabelText('Unidade ativa')).not.toBeInTheDocument()
    await userEvent.type(await screen.findByLabelText('Nome'), 'Panteras')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Feminina')
    await userEvent.type(screen.getByLabelText('Grito de guerra'), 'Rugir!')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toEqual({ nome: 'Panteras', tipo: 'FEMININA', gritoDeGuerra: 'Rugir!' }))
  })

  it('exige o nome', async () => {
    let enviou = false
    servidor.use(handlerCriarUnidade(criarUnidade(), () => (enviou = true)))
    abrir('/adm/unidades/nova')
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe o nome da unidade')).toBeInTheDocument()
    expect(enviou).toBe(false)
  })

  it('salvar sem nome foca o campo e resume o que falta, com link para ele', async () => {
    servidor.use(handlerCriarUnidade(criarUnidade()))
    abrir('/adm/unidades/nova')
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    const resumo = screen.getByRole('region', { name: 'Revise 1 campo para salvar' })
    expect(within(resumo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Nome'])
  })

  it('Cancelar volta à lista (nova) sem perguntar nada', async () => {
    const { roteador } = abrir('/adm/unidades/nova')
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe('/adm/unidades')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edita nome, tipo, grito e ativa', async () => {
    let recebido: { id: string; corpo: unknown } | undefined
    servidor.use(handlerEditarUnidade(aguias, (id, corpo) => (recebido = { id, corpo })))
    abrir(`/adm/unidades/${uuid(201)}/editar`)
    expect(await screen.findByLabelText('Nome')).toHaveValue('Águias')
    expect(screen.getByLabelText('Grito de guerra')).toHaveValue('Voar alto!')
    expect(screen.getByLabelText('Unidade ativa')).toBeChecked()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Águias Douradas')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(recebido?.id).toBe(aguias.id))
    expect(recebido?.corpo).toEqual({
      nome: 'Águias Douradas',
      tipo: 'MASCULINA',
      gritoDeGuerra: 'Voar alto!',
      ativa: true,
    })
  })

  it('Cancelar na edição volta à ficha', async () => {
    const { roteador } = abrir(`/adm/unidades/${uuid(201)}/editar`)
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
  })

  it('desativar unidade com membros mostra a mensagem 422 e fica na edição', async () => {
    servidor.use(
      handlerErroEditarUnidade(422, {
        codigo: 'REGRA',
        mensagem: 'Mova os membros antes de desativar',
      }),
    )
    const { roteador } = abrir(`/adm/unidades/${uuid(201)}/editar`)
    await userEvent.click(await screen.findByLabelText('Unidade ativa'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mova os membros antes de desativar')
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}/editar`)
  })

  it('editar unidade inexistente: "Não encontramos esta unidade"', async () => {
    abrir(`/adm/unidades/${uuid(299)}/editar`)
    expect(await screen.findByRole('heading', { name: 'Não encontramos esta unidade' })).toBeInTheDocument()
  })
})

describe('lista de unidades: sinal de navegação e erro', () => {
  it('cada cartão de unidade mostra a seta de que abre', async () => {
    abrir()
    const cartaoDasAguias = await screen.findByRole('link', { name: /^Águias/ })
    expect(cartaoDasAguias.querySelector('[data-sinal="navega"]')).not.toBeNull()
  })

  it('erro ao carregar mostra a mensagem da API e repete a busca pelo "Tentar de novo"', async () => {
    abrir('/adm/unidades', http.get('/api/unidades', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao listar.' }, { status: 500 })))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao listar.')
    servidor.use(handlerUnidades([aguias]))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: /^Águias/ })).toBeInTheDocument()
  })
})
