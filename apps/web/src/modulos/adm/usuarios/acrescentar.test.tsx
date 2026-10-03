import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, delay, http } from 'msw'
import type { HttpHandler } from 'msw'
import type { Usuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { criarUsuario, criarVinculoUsuario, handlerCatalogoUsuarios, handlerListaUsuarios, handlerNovoVinculo, handlerUsuario } from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import type { ModoConexao } from '../../../offline'
import { rotasAdmUsuarios } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo' })
const guia = criarClasse({ id: uuid(102), nome: 'Guia' })
const avancada = criarClasse({ id: uuid(103), nome: 'Guia de Exploração', tipo: 'AVANCADA' })
const PASSO_1 = `/adm/usuarios/${uuid(710)}/papeis/novo`
const FICHA = `/adm/usuarios/${uuid(710)}`

const carla = (...papeis: Array<'ADM' | 'CONSELHEIRO' | 'INSTRUTOR'>) =>
  caixa(
    criarUsuario({
      id: uuid(710),
      nome: 'Carla Mendes',
      genero: 'F',
      vinculos: papeis.map((papel, i) => criarVinculoUsuario(papel, i + 1, { unidades: papel === 'CONSELHEIRO' ? [{ id: aguias.id, nome: 'Águias' }] : [] })),
    }),
  )

function abrir(rota: string, usuario = carla('CONSELHEIRO'), corpos: unknown[] = [], ...especiais: HttpHandler[]) {
  servidor.use(
    ...especiais,
    ...handlersSessao(),
    handlerUsuario(usuario),
    handlerListaUsuarios([usuario.atual]),
    handlerCatalogoUsuarios(),
    handlerUnidades([aguias]),
    handlerClasses([amigo, guia, avancada]),
    handlerNovoVinculo(usuario.atual, corpos),
  )
  return renderizarRotas(rotasAdmUsuarios, rota)
}

describe('Acrescentar papel · passo 1', () => {
  it('mostra o sobretítulo, a pergunta e os três papéis com as descrições', async () => {
    abrir(PASSO_1)
    expect(await screen.findByRole('heading', { level: 1, name: 'Que papel Carla vai ter?' })).toBeInTheDocument()
    expect(screen.getByText('Acrescentar papel · passo 1 de 2')).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Escolha um papel' })
    expect(grupo.tagName).toBe('FIELDSET')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText('Cuida do clube inteiro: usuários, unidades, classes, calendário e ranking.')).toBeInTheDocument()
    expect(screen.getByText('Acompanha uma ou mais unidades: reuniões, chamada e fotos.')).toBeInTheDocument()
    expect(screen.getByText('Dá uma ou mais classes: registra a classe, marca requisitos e envia materiais.')).toBeInTheDocument()
  })

  it('papel que já tem fica desabilitado e o "já tem" é lido junto', async () => {
    abrir(PASSO_1)
    const conselheiro = await screen.findByRole('radio', { name: /Conselheiro/ })
    expect(conselheiro).toBeDisabled()
    expect(conselheiro).toHaveAccessibleDescription('já tem')
    expect(screen.getByRole('radio', { name: /Instrutor/ })).toBeEnabled()
  })

  it('papel removido (inativo) não conta como "já tem"', async () => {
    const usuario = carla('CONSELHEIRO')
    usuario.atual.vinculos[0] = { ...usuario.atual.vinculos[0]!, ativo: false }
    abrir(PASSO_1, usuario)
    expect(await screen.findByRole('radio', { name: /Conselheiro/ })).toBeEnabled()
  })

  it('com os três papéis, diz que já tem todos e não oferece Continuar', async () => {
    abrir(PASSO_1, carla('ADM', 'CONSELHEIRO', 'INSTRUTOR'))
    expect(await screen.findByText('Carla já tem todos os papéis')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
  })

  it('Adm escolhido: o botão vira Salvar, grava sem escopo e volta à ficha com replace e o estado de volta', async () => {
    const corpos: unknown[] = []
    const { roteador } = abrir(PASSO_1, carla('CONSELHEIRO'), corpos)
    await userEvent.click(await screen.findByRole('radio', { name: /Adm/ }))
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(corpos).toEqual([{ papel: 'ADM', unidadeIds: [], classeIds: [], ajustes: [] }])
    expect(roteador.state.historyAction).toBe('REPLACE')
    expect(roteador.state.location.state).toEqual({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
  })

  it('Continuar com Instrutor leva a ?papel=instrutor (push)', async () => {
    const { roteador } = abrir(PASSO_1)
    await userEvent.click(await screen.findByRole('radio', { name: /Instrutor/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(`${roteador.state.location.pathname}${roteador.state.location.search}`).toBe(`${PASSO_1}?papel=instrutor`)
    expect(roteador.state.historyAction).toBe('PUSH')
  })

  it('Continuar sem escolher não sai do passo 1', async () => {
    const { roteador } = abrir(PASSO_1)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(roteador.state.location.search).toBe('')
    expect(await screen.findByText('Escolha um papel para continuar.')).toBeInTheDocument()
  })
})

describe('Acrescentar papel · passo 2', () => {
  const DE_INSTRUTOR = `${PASSO_1}?papel=instrutor`

  it('mostra sobretítulo, pergunta, busca e grupos nomeados com chips', async () => {
    abrir(DE_INSTRUTOR)
    expect(await screen.findByRole('heading', { level: 1, name: 'Que classes Carla vai instruir?' })).toBeInTheDocument()
    expect(screen.getByText('Acrescentar papel · passo 2 de 2 · Instrutora')).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar classe')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Regulares' })).toContainElement(screen.getByRole('button', { name: 'Amigo' }))
    expect(screen.getByRole('group', { name: 'Avançadas' })).toContainElement(screen.getByRole('button', { name: 'Guia de Exploração' }))
    expect(screen.getByRole('button', { name: 'Amigo' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Amigo' }))
    expect(screen.getByRole('button', { name: 'Amigo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Carla começa com as permissões de instrutora. Dá para ajustar depois, em Alterar.')).toBeInTheDocument()
  })

  it('"N escolhidas" conta também o que a busca escondeu', async () => {
    abrir(DE_INSTRUTOR)
    await userEvent.click(await screen.findByRole('button', { name: 'Amigo' }))
    await userEvent.type(screen.getByLabelText('Buscar classe'), 'guia')
    expect(screen.queryByRole('button', { name: 'Amigo' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guia' }))
    const contagem = screen.getByText('2 escolhidas')
    expect(contagem).toHaveAttribute('aria-live', 'polite')
  })

  it('busca sem resultado diz "Nenhuma classe com esse nome"', async () => {
    abrir(DE_INSTRUTOR)
    await userEvent.type(await screen.findByLabelText('Buscar classe'), 'zzz')
    expect(screen.getByText('Nenhuma classe com esse nome')).toBeInTheDocument()
  })

  it('Salvar sem escolha não grava: mostra a mensagem junto do Salvar e foca o grupo, que aponta para ela', async () => {
    const corpos: unknown[] = []
    abrir(DE_INSTRUTOR, carla('CONSELHEIRO'), corpos)
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    const mensagem = screen.getByRole('alert')
    expect(mensagem).toHaveTextContent('Escolha pelo menos uma classe.')
    const grupo = screen.getByRole('group', { name: 'Escolha das classes' })
    expect(grupo).toHaveFocus()
    expect(grupo).toHaveAttribute('aria-describedby', mensagem.id)
    expect(corpos).toEqual([])
  })

  it('Salvar grava as classes escolhidas, sem ajustes, e volta à ficha', async () => {
    const corpos: unknown[] = []
    const { roteador } = abrir(DE_INSTRUTOR, carla('CONSELHEIRO'), corpos)
    await userEvent.click(await screen.findByRole('button', { name: 'Amigo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(corpos).toEqual([{ papel: 'INSTRUTOR', unidadeIds: [], classeIds: [amigo.id, guia.id], ajustes: [] }])
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('Enter na busca não envia o formulário', async () => {
    const corpos: unknown[] = []
    const { roteador } = abrir(DE_INSTRUTOR, carla('CONSELHEIRO'), corpos)
    await userEvent.click(await screen.findByRole('button', { name: 'Amigo' }))
    await userEvent.type(screen.getByLabelText('Buscar classe'), 'guia{Enter}')
    // Um envio indevido só chega ao servidor de mentira depois de um ciclo.
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(corpos).toEqual([])
    expect(`${roteador.state.location.pathname}${roteador.state.location.search}`).toBe(DE_INSTRUTOR)
  })

  it('conselheiro: unidades, na pergunta e no corpo', async () => {
    const corpos: unknown[] = []
    abrir(`${PASSO_1}?papel=conselheiro`, carla('INSTRUTOR'), corpos)
    expect(await screen.findByRole('heading', { level: 1, name: 'Que unidades Carla vai acompanhar?' })).toBeInTheDocument()
    expect(screen.getByText('Acrescentar papel · passo 2 de 2 · Conselheira')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Unidades' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Águias' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({ papel: 'CONSELHEIRO', unidadeIds: [aguias.id], classeIds: [], ajustes: [] })
  })

  it('Voltar leva ao passo 1 com o papel marcado', async () => {
    const { roteador } = abrir(DE_INSTRUTOR)
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar' }))
    expect(`${roteador.state.location.pathname}${roteador.state.location.search}`).toBe(PASSO_1)
    expect(await screen.findByRole('radio', { name: /Instrutor/ })).toBeChecked()
  })

  it.each(['?papel=adm', '?papel=x', '?papel=INSTRUTOR', '?papel=conselheiro'])('%s volta ao passo 1 substituindo o endereço', async (busca) => {
    const { roteador } = abrir(`${PASSO_1}${busca}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Que papel Carla vai ter?' })).toBeInTheDocument()
    expect(roteador.state.location.search).toBe('')
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('sem unidade ativa: pré-requisito com link e sem Salvar', async () => {
    abrir(`${PASSO_1}?papel=conselheiro`, carla('INSTRUTOR'), [], handlerUnidades([criarUnidade({ ativa: false })]))
    expect(await screen.findByText('Nenhuma unidade ativa no clube')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Unidades/ })).toHaveAttribute('href', '/adm/unidades')
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
  })

  it('sem classe ativa: pré-requisito com link e sem Salvar', async () => {
    abrir(DE_INSTRUTOR, carla('CONSELHEIRO'), [], handlerClasses([criarClasse({ ativa: false })]))
    expect(await screen.findByText('Nenhuma classe ativa')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Classes/ })).toHaveAttribute('href', '/adm/classes')
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
  })

  it('erro da API ao gravar aparece na tela, sem sair', async () => {
    const { roteador } = abrir(DE_INSTRUTOR, carla('CONSELHEIRO'), [], http.post('/api/usuarios/:id/vinculos', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Esta pessoa já tem este papel.' }, { status: 409 })))
    await userEvent.click(await screen.findByRole('button', { name: 'Amigo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Esta pessoa já tem este papel.')).toBeInTheDocument()
    expect(roteador.state.location.search).toBe('?papel=instrutor')
  })
})

describe('Acrescentar papel · estados', () => {
  it('carrega: sem a tela até ler usuário e lista', async () => {
    abrir(`${PASSO_1}?papel=instrutor`, carla('CONSELHEIRO'), [], http.get('/api/classes', async () => { await delay(150); return HttpResponse.json([amigo]) }))
    expect(await screen.findByRole('status', { name: /Carregando/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Que classes Carla vai instruir?' })).toBeInTheDocument()
  })

  it('usuário inexistente: "Não encontramos este usuário"', async () => {
    abrir(`/adm/usuarios/${uuid(799)}/papeis/novo`)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este usuário' })).toBeInTheDocument()
  })

  it('erro ao ler o usuário: mensagem e "Tentar de novo"', async () => {
    abrir(PASSO_1, carla('CONSELHEIRO'), [], http.get('/api/usuarios/:id', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Falhou feio.' }, { status: 422 })))
    expect(await screen.findByText('Falhou feio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('erro ao ler a lista do passo 2: "Tentar de novo"', async () => {
    abrir(`${PASSO_1}?papel=instrutor`, carla('CONSELHEIRO'), [], http.get('/api/classes', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Lista caiu.' }, { status: 422 })))
    expect(await screen.findByText('Lista caiu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir(PASSO_1, carla('CONSELHEIRO'), [], http.get('/api/usuarios/:id', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'x' }, { status: 500 })))
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
