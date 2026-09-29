import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hojeDoClube } from '../../../api/desbravadores'
import { handlerMoverUnidade } from '../../../testes/handlers/desbravadores'
import { criarMembro, criarUnidade, handlerMembrosUnidade, handlerSemMembros, handlerUnidades } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { handlerCriarUnidade, handlerEditarUnidade, handlerErroEditarUnidade } from '../../../testes/handlers/unidades'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUnidades } from './rotas'

const aguias = criarUnidade({
  id: uuid(201),
  nome: 'Águias',
  tipo: 'MASCULINA',
  gritoDeGuerra: 'Voar alto!',
  conselheiros: [{ usuarioId: uuid(501), nome: 'Paulo Reis' }, { usuarioId: uuid(502), nome: 'Rita Melo' }],
  totalMembros: 1,
})
const leoes = criarUnidade({ id: uuid(202), nome: 'Leões', tipo: 'FEMININA', totalMembros: 0 })
const antiga = criarUnidade({ id: uuid(203), nome: 'Falcões', ativa: false })
const ana = criarMembro({ dbvId: uuid(301), nome: 'Ana Clara Souza' })
const bruno = criarMembro({ dbvId: uuid(302), nome: 'Bruno Lima', sexo: 'M' })

afterEach(() => {
  vi.useRealTimers()
})

function abrir(listaDeUnidades = handlerUnidades([aguias, leoes, antiga])) {
  servidor.use(
    listaDeUnidades,
    handlerMembrosUnidade([ana]),
    handlerSemMembros([bruno]),
  )
  return renderizarRotas(rotasAdmUnidades, '/adm/unidades')
}

const cartao = (nome: string) => within(screen.getByRole('article', { name: nome }))

describe('A3 · cartões', () => {
  it('mostram nome, tipo, conselheiros e total; inativa vem marcada', async () => {
    abrir()
    await screen.findByRole('article', { name: 'Águias' })
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
      http.get('/api/unidades', ({ request }) => {
        consulta = new URL(request.url).search
        return HttpResponse.json([aguias])
      }),
    )
    await screen.findByRole('article', { name: 'Águias' })
    expect(consulta).toBe('?todas=true')
  })
})

describe('A3 · nova e editar', () => {
  it('cria com nome, tipo e grito', async () => {
    let corpo: unknown
    servidor.use(handlerCriarUnidade(criarUnidade(), (recebido) => (corpo = recebido)))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Nova unidade' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Nova unidade' }))
    expect(painel.queryByLabelText('Unidade ativa')).not.toBeInTheDocument()
    await userEvent.type(painel.getByLabelText('Nome'), 'Panteras')
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Feminina')
    await userEvent.type(painel.getByLabelText('Grito de guerra'), 'Rugir!')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toEqual({ nome: 'Panteras', tipo: 'FEMININA', gritoDeGuerra: 'Rugir!' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('exige o nome', async () => {
    let enviou = false
    servidor.use(handlerCriarUnidade(criarUnidade(), () => (enviou = true)))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Nova unidade' }))
    const painel = within(await screen.findByRole('dialog'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Informe o nome da unidade')).toBeInTheDocument()
    expect(enviou).toBe(false)
  })

  it('edita nome, tipo, grito e ativa', async () => {
    let recebido: { id: string; corpo: unknown } | undefined
    servidor.use(handlerEditarUnidade(aguias, (id, corpo) => (recebido = { id, corpo })))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Águias' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Águias' }))
    expect(painel.getByLabelText('Nome')).toHaveValue('Águias')
    expect(painel.getByLabelText('Grito de guerra')).toHaveValue('Voar alto!')
    expect(painel.getByLabelText('Unidade ativa')).toBeChecked()
    await userEvent.clear(painel.getByLabelText('Nome'))
    await userEvent.type(painel.getByLabelText('Nome'), 'Águias Douradas')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(recebido?.id).toBe(aguias.id))
    expect(recebido?.corpo).toEqual({ nome: 'Águias Douradas', tipo: 'MASCULINA', gritoDeGuerra: 'Voar alto!', ativa: true })
  })

  it('desativar unidade com membros mostra a mensagem 422 e mantém o painel aberto', async () => {
    servidor.use(handlerErroEditarUnidade(422, { codigo: 'REGRA', mensagem: 'Mova os membros antes de desativar' }))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Águias' }))
    const painel = within(await screen.findByRole('dialog'))
    await userEvent.click(painel.getByLabelText('Unidade ativa'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByRole('alert')).toHaveTextContent('Mova os membros antes de desativar')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('A3 · painel de membros', () => {
  async function abrirPainel() {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Membros de Águias' }))
    await screen.findByRole('button', { name: 'Tirar Ana Clara Souza de Águias' })
  }

  it('mostra as colunas "Na unidade" e "Sem unidade" com a contagem', async () => {
    await abrirPainel()
    expect(screen.getByRole('heading', { name: 'Na unidade (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sem unidade (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colocar Bruno Lima em Águias' })).toBeInTheDocument()
  })

  it('tocar em quem está sem unidade move na hora e Desfazer devolve', async () => {
    const chamadas: Array<{ id: string; unidadeId: string | null; desde: string }> = []
    servidor.use(handlerMoverUnidade((id, corpo) => chamadas.push({ id, ...corpo })))
    await abrirPainel()
    await userEvent.click(screen.getByRole('button', { name: 'Colocar Bruno Lima em Águias' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toEqual({ id: bruno.dbvId, unidadeId: aguias.id, desde: hojeDoClube() })

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(chamadas).toHaveLength(2))
    expect(chamadas[1]).toEqual({ id: bruno.dbvId, unidadeId: null, desde: hojeDoClube() })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument())
  })

  it('tocar em quem está na unidade tira; Desfazer põe de volta', async () => {
    const chamadas: Array<{ id: string; unidadeId: string | null }> = []
    servidor.use(handlerMoverUnidade((id, corpo) => chamadas.push({ id, unidadeId: corpo.unidadeId })))
    await abrirPainel()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar Ana Clara Souza de Águias' }))
    await waitFor(() => expect(chamadas).toEqual([{ id: ana.dbvId, unidadeId: null }]))
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(chamadas[1]).toEqual({ id: ana.dbvId, unidadeId: aguias.id }))
  })

  it('o Desfazer some depois de 5 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    servidor.use(handlerMoverUnidade())
    await abrirPainel()
    await usuario.click(screen.getByRole('button', { name: 'Colocar Bruno Lima em Águias' }))
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument()
  })

  it('erro ao mover aparece em texto e não oferece Desfazer', async () => {
    servidor.use(
      http.put('/api/desbravadores/:id/unidade', () =>
        HttpResponse.json({ codigo: 'REGRA', mensagem: 'Líder não tem unidade.' }, { status: 422 }),
      ),
    )
    await abrirPainel()
    await userEvent.click(screen.getByRole('button', { name: 'Colocar Bruno Lima em Águias' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Líder não tem unidade.')
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument()
  })
})
