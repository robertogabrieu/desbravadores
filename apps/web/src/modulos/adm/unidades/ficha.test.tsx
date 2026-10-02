import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Membro, Unidade } from '../../../api/leitura'
import { handlersConviteAcesso } from '../../../testes/handlers/convite-acesso'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarDesbravador, handlerDesbravador, handlerMoverUnidade } from '../../../testes/handlers/desbravadores'
import { handlerPerfilDe } from '../../../testes/handlers/perfil'
import { handlerProgressoDbv } from '../../../testes/handlers/progresso'
import { criarMembro, criarUnidade, handlerMembrosUnidade, handlerSemMembros, handlerUnidades } from '../../../testes/handlers/leitura'
import { criarResumo, handlerReunioes } from '../../../testes/handlers/reunioes'
import { uuid } from '../../../testes/handlers/sessao'
import { handlerCriarUnidade, handlerEditarUnidade, handlerUnidade } from '../../../testes/handlers/unidades'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmDesbravadores } from '../desbravadores/rotas'
import { rotasAdmUnidades } from './rotas'

const aguias = (parcial: Partial<Unidade> = {}) =>
  caixa(
    criarUnidade({
      id: uuid(201),
      nome: 'Águias',
      tipo: 'FEMININA',
      gritoDeGuerra: 'Voando alto!',
      conselheiros: [{ usuarioId: uuid(501), nome: 'Carla Mendes' }],
      totalMembros: 2,
      ...parcial,
    }),
  )
const ana = criarMembro({ dbvId: uuid(301), nome: 'Ana Beatriz Souza', idade: 10, frequencia: 90 })
const julia = criarMembro({ dbvId: uuid(302), nome: 'Júlia Rocha', idade: 11, frequencia: 70 })
const bruno = criarMembro({ dbvId: uuid(303), nome: 'Bruno Lima', sexo: 'M' })

interface Cenario {
  unidade?: Caixa<Unidade>
  outras?: Caixa<Unidade>[]
  membros?: Membro[]
  sem?: Membro[]
  reunioes?: Record<string, ReturnType<typeof criarResumo>[]>
}

function abrir(rota: string, { unidade = aguias(), outras = [], membros = [ana, julia], sem = [bruno], reunioes = {} }: Cenario = {}) {
  const consultas: { unidadeId: string; mes: string }[] = []
  servidor.use(handlerUnidade(unidade, ...outras), handlerUnidades([unidade.atual]), handlerMembrosUnidade(membros), handlerSemMembros(sem), handlerReunioes(reunioes, consultas))
  return { ...renderizarRotas([...rotasAdmUnidades, { path: '/adm/desbravadores/novo', element: <p>novo desbravador</p> }], rota), consultas, unidade }
}

describe('ficha da unidade', () => {
  it('lista → ficha pelo cartão; mostra tipo, situação, grito, conselheiros e membros', async () => {
    abrir('/adm/unidades')
    await userEvent.click(await screen.findByRole('link', { name: /^Águias/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Águias' })).toBeInTheDocument()
    expect(screen.getByText('Unidade feminina · Ativa')).toBeInTheDocument()
    expect(screen.getByText('“Voando alto!”')).toBeInTheDocument()
    expect(screen.getByText('Membros', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2 desbravadoras')
    const membros = within(screen.getByRole('region', { name: 'Membros' }))
    expect(membros.getByRole('link', { name: /Ana Beatriz Souza/ })).toHaveAttribute('href', `/adm/desbravadores/${uuid(301)}`)
    expect(membros.getByText('90%')).toBeInTheDocument()
    const linhaDaAna = membros.getByRole('link', { name: /Ana Beatriz Souza/ })
    expect(linhaDaAna.querySelector('[data-sinal="abre-ficha"]')).not.toBeNull()
    expect(linhaDaAna.querySelector('[data-sinal="navega"]')).toBeNull()
  })

  it('adicionar desbravador sem unidade é uma janela de um campo', async () => {
    const recebidos: { id: string; unidadeId: string | null }[] = []
    servidor.use(handlerMoverUnidade((id, corpo) => recebidos.push({ id, unidadeId: corpo.unidadeId })))
    abrir(`/adm/unidades/${uuid(201)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar desbravador sem unidade' }))
    const janela = within(screen.getByRole('dialog', { name: 'Adicionar a Águias' }))
    await userEvent.selectOptions(janela.getByLabelText('Desbravador sem unidade'), uuid(303))
    await userEvent.click(janela.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(recebidos).toEqual([{ id: uuid(303), unidadeId: uuid(201) }]))
  })

  it('sem membros e sem ninguém disponível: vazio que ensina, com link para cadastrar', async () => {
    abrir(`/adm/unidades/${uuid(201)}`, {
      unidade: aguias({ totalMembros: 0 }),
      membros: [],
      sem: [],
    })
    expect(await screen.findByText('Nenhum desbravador nesta unidade')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar desbravador' })).toHaveAttribute('href', '/adm/desbravadores/novo')
  })

  it('com membros e ninguém disponível, não oferece cadastrar', async () => {
    abrir(`/adm/unidades/${uuid(201)}`, { sem: [] })
    await screen.findByRole('link', { name: /Ana Beatriz Souza/ })
    expect(screen.queryByRole('link', { name: 'Cadastrar desbravador' })).not.toBeInTheDocument()
  })

  it('o vazio de unidade inativa não oferece ação nenhuma', async () => {
    abrir(`/adm/unidades/${uuid(201)}`, { unidade: aguias({ ativa: false, totalMembros: 0 }), membros: [], sem: [] })
    await screen.findByText('Nenhum desbravador nesta unidade')
    expect(screen.queryByRole('link', { name: 'Cadastrar desbravador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar desbravador sem unidade' })).not.toBeInTheDocument()
  })

  it('cadastrar a partir do vazio leva a unidade como destino do Voltar', async () => {
    const { roteador } = abrir(`/adm/unidades/${uuid(201)}`, { unidade: aguias({ totalMembros: 0 }), membros: [], sem: [] })
    await userEvent.click(await screen.findByRole('link', { name: 'Cadastrar desbravador' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/adm/desbravadores/novo'))
    expect(roteador.state.location.state).toMatchObject({ voltarPara: `/adm/unidades/${uuid(201)}`, voltarRotulo: 'Águias' })
  })

  it('unidade → membro → Voltar diz o nome da unidade e leva a ela', async () => {
    const dbv = caixa(criarDesbravador({ id: uuid(301), nome: 'Ana Beatriz Souza' }))
    servidor.use(handlerDesbravador(dbv), handlerPerfilDe([dbv]), handlerProgressoDbv(), ...handlersConviteAcesso())
    const unidade = aguias()
    servidor.use(handlerUnidade(unidade), handlerUnidades([unidade.atual]), handlerMembrosUnidade([ana, julia]), handlerSemMembros([bruno]), handlerReunioes({}))
    const { roteador } = renderizarRotas([...rotasAdmUnidades, ...rotasAdmDesbravadores], `/adm/unidades/${uuid(201)}`)
    await userEvent.click(await screen.findByRole('link', { name: /Ana Beatriz Souza/ }))
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar para Águias' }))
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
  })

  it('trocar o mês mantém o cartão e as setas; só a lista espera', async () => {
    abrir(`/adm/unidades/${uuid(201)}?mes=2026-09`)
    servidor.use(
      http.get('/api/reunioes', async ({ request }) => {
        if (new URL(request.url).searchParams.get('mes') === '2026-08') await delay('infinite')
        return HttpResponse.json([])
      }),
    )
    const anterior = await screen.findByRole('button', { name: 'Mês anterior' })
    await userEvent.click(anterior)
    expect(await screen.findByRole('heading', { name: 'Reuniões de agosto de 2026' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Carregando as reuniões' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBe(anterior)
    expect(anterior).toHaveFocus()
  })

  it('reuniões do mês com ‹ ›, mês no endereço e link para a ficha da reunião', async () => {
    const domingo = criarResumo({
      id: uuid(601),
      data: '2026-09-27',
      presentes: 7,
      total: 8,
      atrasos: 1,
    })
    const { roteador, consultas } = abrir(`/adm/unidades/${uuid(201)}?mes=2026-09`, {
      reunioes: { '2026-09': [domingo] },
    })
    const secao = within(await screen.findByRole('region', { name: 'Reuniões de setembro de 2026' }))
    expect(await secao.findByRole('link', { name: /Domingo, 27 de setembro/ })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}`)
    expect(secao.getByRole('link', { name: /Domingo, 27 de setembro/ }).querySelector('[data-sinal="navega"]')).not.toBeNull()
    expect(secao.getByText(/7 de 8 presentes · 1 atraso/)).toBeInTheDocument()
    await userEvent.click(secao.getByRole('button', { name: 'Mês anterior' }))
    expect(roteador.state.location.search).toBe('?mes=2026-08')
    expect(await screen.findByText('Nenhuma reunião em agosto de 2026')).toBeInTheDocument()
    expect(consultas.map((c) => c.mes)).toContain('2026-08')
  })

  it('Editar → Salvar volta à ficha com o nome novo', async () => {
    const unidade = aguias()
    const editada = { ...unidade.atual, nome: 'Águias Douradas' }
    servidor.use(
      handlerEditarUnidade(editada, () => {
        unidade.atual = editada
      }),
    )
    const { roteador } = abrir(`/adm/unidades/${uuid(201)}/editar`, { unidade })
    const nome = await screen.findByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Águias Douradas')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Águias Douradas' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('Nova → Salvar leva à ficha da criada', async () => {
    const criada = caixa(criarUnidade({ id: uuid(209), nome: 'Leões' }))
    servidor.use(handlerCriarUnidade(criada.atual))
    const { roteador } = abrir('/adm/unidades/nova', { outras: [criada] })
    await userEvent.type(await screen.findByLabelText('Nome'), 'Leões')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(209)}`))
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it.each([`/adm/unidades/${uuid(299)}`, '/adm/unidades/abc'])('%s → "Não encontramos esta unidade"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos esta unidade' })).toBeInTheDocument()
  })
})
