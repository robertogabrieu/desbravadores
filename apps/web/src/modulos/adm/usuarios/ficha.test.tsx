import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HttpResponse, delay, http } from 'msw'
import { chavesUsuarios } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerUnidades } from '../../../testes/handlers/leitura'
import { criarEu, criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import {
  criarUsuario,
  criarVinculoUsuario,
  handlerCatalogoUsuarios,
  handlerConvite,
  handlerCriarUsuario,
  handlerDesativarUsuario,
  handlerEditarUsuario,
  handlerEditarVinculo,
  handlerListaUsuarios,
  handlerRegra422,
  handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUsuarios } from './rotas'
import type { RouteObject } from 'react-router-dom'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const carla = (parcial: Partial<Usuario> = {}) =>
  caixa(
    criarUsuario({
      id: uuid(710),
      nome: 'Carla Mendes',
      email: 'carla.mendes@antares.local',
      genero: 'F',
      ultimoAcessoEm: new Date().toISOString(),
      vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { unidades: [{ id: aguias.id, nome: 'Águias' }] })],
      ...parcial,
    }),
  )

/** Para onde a sessão sem o papel em uso é levada. */
const rotasDeSaida: RouteObject[] = [
  { path: '/papel', element: <p>escolha de papel</p> },
  { path: '/login', element: <p>login</p> },
]

function abrir(rota: string, usuario = carla(), ...outros: Caixa<Usuario>[]) {
  servidor.use(
    ...handlersSessao(),
    handlerUsuario(usuario, ...outros),
    handlerListaUsuarios([usuario.atual]),
    handlerCatalogoUsuarios(),
    handlerUnidades([aguias]),
  )
  return { ...renderizarRotas([...rotasAdmUsuarios, ...rotasDeSaida], rota), usuario }
}

describe('ficha do usuário', () => {
  it('lista → ficha; Voltar devolve aba e busca', async () => {
    const { roteador } = abrir('/adm/usuarios?papel=CONSELHEIRO&busca=Carla')
    await userEvent.click(await screen.findByRole('link', { name: 'Carla Mendes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Carla Mendes' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Usuários' }))
    expect(roteador.state.location.search).toBe('?papel=CONSELHEIRO&busca=Carla')
    expect(await screen.findByRole('tab', { name: /Conselheiros/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('dados com último acesso; um cartão por papel ativo, sem "O que pode fazer" nem selo "Ativo"', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    expect(await screen.findByText('Ativa · último acesso hoje')).toBeInTheDocument()
    const papel = within(screen.getByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('Unidade Águias')).toBeInTheDocument()
    expect(papel.getByText('Permissões do papel')).toBeInTheDocument()
    expect(papel.getByText('sem ajustes')).toBeInTheDocument()
    expect(screen.queryByText('O que pode fazer')).not.toBeInTheDocument()
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument()
  })

  it('o ajuste do vínculo vira selo e linha', async () => {
    const ajustada = carla({ vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.editar', concedida: true }] })] })
    abrir(`/adm/usuarios/${uuid(710)}`, ajustada)
    const papel = within(await screen.findByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('+ 1 ajuste')).toBeInTheDocument()
    expect(papel.getByText('Ajuste: também pode Editar dados dos desbravadores')).toBeInTheDocument()
  })

  it('ajuste igual ao padrão do papel não conta', async () => {
    const igual = carla({ vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.ver', concedida: true }] })] })
    abrir(`/adm/usuarios/${uuid(710)}`, igual)
    const papel = within(await screen.findByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('sem ajustes')).toBeInTheDocument()
  })

  it('Adm: "Todo o clube", todas as permissões, sem Alterar e com Remover papel', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ genero: 'M', vinculos: [criarVinculoUsuario('ADM', 1)] }))
    const papel = within(await screen.findByRole('region', { name: 'Adm' }))
    expect(papel.getByText('Todo o clube')).toBeInTheDocument()
    expect(papel.getByText('Todas as permissões do clube')).toBeInTheDocument()
    expect(papel.queryByRole('link', { name: 'Alterar' })).not.toBeInTheDocument()
    expect(papel.getByRole('button', { name: 'Remover papel' })).toBeInTheDocument()
  })

  it('cartões em ordem Adm, Conselheira, Instrutora; Alterar e Acrescentar papel são links com o estado de volta', async () => {
    const todos = carla({
      vinculos: [
        criarVinculoUsuario('INSTRUTOR', 3),
        criarVinculoUsuario('CONSELHEIRO', 2, { unidades: [{ id: aguias.id, nome: 'Águias' }] }),
        criarVinculoUsuario('ADM', 1),
      ],
    })
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}`, todos)
    await screen.findByRole('region', { name: 'Adm' })
    const nomes = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(nomes).toEqual(['Adm', 'Conselheira', 'Instrutora'])
    const alterar = within(screen.getByRole('region', { name: 'Conselheira' })).getByRole('link', { name: 'Alterar' })
    expect(alterar).toHaveAttribute('href', `/adm/usuarios/${uuid(710)}/papeis/${uuid(602)}`)
    const acrescentar = screen.getByRole('link', { name: 'Acrescentar papel' })
    expect(acrescentar).toHaveAttribute('href', `/adm/usuarios/${uuid(710)}/papeis/novo`)
    await userEvent.click(acrescentar)
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}/papeis/novo`)
    expect(roteador.state.location.state).toMatchObject({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
  })

  it('convidado: Editar e Reenviar convite no cabeçalho; ativo: nenhum dos dois', async () => {
    const chamadas: string[] = []
    servidor.use(handlerConvite(chamadas))
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null }))
    const cabecalho = within(await screen.findByRole('banner'))
    expect(cabecalho.getByRole('link', { name: 'Editar' })).toBeInTheDocument()
    await userEvent.click(cabecalho.getByRole('button', { name: 'Reenviar convite' }))
    await waitFor(() => expect(chamadas).toEqual([uuid(710)]))
    expect(await screen.findByText('Convite reenviado.')).toBeInTheDocument()
  })

  it('ativo não tem Editar nem Reenviar convite', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    await screen.findByRole('region', { name: 'Conselheira' })
    expect(screen.queryByRole('button', { name: 'Reenviar convite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('"Desativar neste clube" fica no rodapé, depois dos cartões, e nomeia a pessoa', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    const cartao = await screen.findByRole('region', { name: 'Conselheira' })
    const desativar = screen.getByRole('button', { name: 'Desativar neste clube' })
    expect(cartao.compareDocumentPosition(desativar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(desativar)
    const janela = within(screen.getByRole('dialog', { name: 'Desativar Carla Mendes neste clube?' }))
    expect(janela.getByText('A pessoa perde o acesso a este clube na hora.')).toBeInTheDocument()
  })

  it('último Adm ao desativar: o alerta aparece dentro do diálogo, que segue aberto', async () => {
    servidor.use(handlerRegra422('post', '/api/usuarios/:id/desativar', 'ULTIMO_ADM'))
    abrir(`/adm/usuarios/${uuid(710)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    const janela = within(screen.getByRole('dialog', { name: 'Desativar Carla Mendes neste clube?' }))
    await userEvent.click(janela.getByRole('button', { name: 'Desativar' }))
    expect(await janela.findByRole('alert')).toHaveTextContent('O clube precisa de pelo menos um Adm ativo.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('desativar a si mesmo, com outro papel em algum clube, vai a /papel', async () => {
    const desativados: string[] = []
    const eu = carla({ id: uuid(500), vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1) })] })
    servidor.use(handlerDesativarUsuario({ ...eu.atual, situacao: 'INATIVO', vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1), ativo: false })] }, desativados))
    const { roteador } = abrir(`/adm/usuarios/${uuid(500)}`, eu)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    const janela = within(await screen.findByRole('dialog', { name: 'Desativar o seu próprio acesso?' }))
    expect(janela.getByText(/Este é o seu usuário/)).toBeInTheDocument()
    servidor.use(http.get('/api/eu', () => HttpResponse.json(criarEu([criarVinculo('CONSELHEIRO', 2)], null))))
    await userEvent.click(janela.getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(desativados).toEqual([uuid(500)]))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/papel'))
  })

  it('desativar a si mesmo, sem papel em clube nenhum, vai ao login com o aviso e sai', async () => {
    const saidas: string[] = []
    const eu = carla({ id: uuid(500), vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1) })] })
    const { roteador } = abrir(`/adm/usuarios/${uuid(500)}`, eu)
    servidor.use(
      handlerDesativarUsuario({ ...eu.atual, situacao: 'INATIVO', vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1), ativo: false })] }),
      http.post('/api/auth/logout', () => {
        saidas.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    servidor.use(http.get('/api/eu', () => HttpResponse.json(criarEu([], null))))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    expect(roteador.state.location.state).toEqual({ aviso: 'Você não tem mais acesso a nenhum clube.' })
    await waitFor(() => expect(saidas).toEqual(['logout']))
  })

  it('inativo neste clube: "Nenhum papel neste clube", Acrescentar papel para papeis/novo, sem Desativar', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'INATIVO', vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ativo: false })] }))
    expect(await screen.findByRole('heading', { name: 'Nenhum papel neste clube' })).toBeInTheDocument()
    expect(screen.getByText('Usuário · Inativo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desativar neste clube' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acrescentar papel' })).toHaveAttribute('href', `/adm/usuarios/${uuid(710)}/papeis/novo`)
  })

  it('os avisos do estado da navegação aparecem como status acima dos cartões', async () => {
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}`)
    await screen.findByRole('region', { name: 'Conselheira' })
    await roteador.navigate('/adm/usuarios')
    await screen.findByRole('link', { name: 'Carla Mendes' })
    await roteador.navigate(`/adm/usuarios/${uuid(710)}`, { state: { avisos: ['Este papel foi removido por outra pessoa.'] } })
    const aviso = await screen.findByText('Este papel foi removido por outra pessoa.')
    expect(aviso).toHaveAttribute('role', 'status')
    expect(aviso.compareDocumentPosition(screen.getByRole('region', { name: 'Conselheira' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe('Remover papel', () => {
    const duasFuncoes = (parcial: Partial<Usuario> = {}) =>
      carla({
        vinculos: [criarVinculoUsuario('ADM', 1), criarVinculoUsuario('CONSELHEIRO', 2, { unidades: [{ id: aguias.id, nome: 'Águias' }] })],
        ...parcial,
      })

    it('confirma, grava { ativo: false }, fecha o diálogo e o cartão some', async () => {
      const corpos: unknown[] = []
      const usuario = duasFuncoes()
      abrir(`/adm/usuarios/${uuid(710)}`, usuario)
      servidor.use(handlerEditarVinculo({ ...usuario.atual, vinculos: [usuario.atual.vinculos[0], { ...usuario.atual.vinculos[1], ativo: false }] }, corpos))
      await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('button', { name: 'Remover papel' }))
      const janela = within(screen.getByRole('dialog', { name: 'Remover o papel de Conselheira de Carla?' }))
      expect(janela.getByText('Ela segue como Adm.')).toBeInTheDocument()
      usuario.atual = { ...usuario.atual, vinculos: [usuario.atual.vinculos[0]] }
      await userEvent.click(janela.getByRole('button', { name: 'Remover papel' }))
      await waitFor(() => expect(corpos).toEqual([{ ativo: false }]))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.queryByRole('region', { name: 'Conselheira' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Adm' })).toBeInTheDocument()
    })

    it('último Adm: o diálogo segue aberto com o alerta do P0', async () => {
      servidor.use(handlerRegra422('put', '/api/vinculos/:id', 'ULTIMO_ADM'))
      abrir(`/adm/usuarios/${uuid(710)}`, carla({ vinculos: [criarVinculoUsuario('ADM', 1)] }))
      await userEvent.click(within(await screen.findByRole('region', { name: 'Adm' })).getByRole('button', { name: 'Remover papel' }))
      const janela = within(screen.getByRole('dialog'))
      await userEvent.click(janela.getByRole('button', { name: 'Remover papel' }))
      expect(await janela.findByRole('alert')).toHaveTextContent('Torne outra pessoa Adm antes de remover este papel.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('último papel: a ficha passa a "Nenhum papel neste clube" e "Usuário · Inativo"', async () => {
      const usuario = carla()
      abrir(`/adm/usuarios/${uuid(710)}`, usuario)
      const depois = { ...usuario.atual, situacao: 'INATIVO' as const, vinculos: [{ ...(usuario.atual.vinculos[0]), ativo: false }] }
      servidor.use(handlerEditarVinculo(depois))
      await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('button', { name: 'Remover papel' }))
      usuario.atual = depois
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover papel' }))
      expect(await screen.findByRole('heading', { name: 'Nenhum papel neste clube' })).toBeInTheDocument()
      expect(screen.getByText('Usuário · Inativo')).toBeInTheDocument()
    })

    it('o próprio papel da sessão, com outro papel: relê /api/eu e vai a /papel', async () => {
      const eu = carla({ id: uuid(500), vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1) }), criarVinculoUsuario('CONSELHEIRO', 2)] })
      const depois = { ...eu.atual, vinculos: [{ ...(eu.atual.vinculos[0]), ativo: false }, eu.atual.vinculos[1]] }
      const { roteador } = abrir(`/adm/usuarios/${uuid(500)}`, eu)
      servidor.use(handlerEditarVinculo(depois))
      await userEvent.click(within(await screen.findByRole('region', { name: 'Adm' })).getByRole('button', { name: 'Remover papel' }))
      const janela = within(screen.getByRole('dialog', { name: 'Remover o seu papel de Adm?' }))
      expect(janela.getByText('Você perde esse acesso na hora.')).toBeInTheDocument()
      let leituras = 0
      servidor.use(
        http.get('/api/eu', () => {
          leituras += 1
          return HttpResponse.json(criarEu([criarVinculo('CONSELHEIRO', 2)], null))
        }),
      )
      await userEvent.click(janela.getByRole('button', { name: 'Remover papel' }))
      await waitFor(() => expect(roteador.state.location.pathname).toBe('/papel'))
      expect(leituras).toBeGreaterThan(0)
      expect(roteador.state.historyAction).toBe('REPLACE')
    })

    it('o próprio papel da sessão, sem papel em clube nenhum: vai ao login com o aviso e chama o logout', async () => {
      const saidas: string[] = []
      const eu = carla({ id: uuid(500), vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1) }), criarVinculoUsuario('CONSELHEIRO', 2)] })
      const depois = { ...eu.atual, situacao: 'INATIVO' as const, vinculos: eu.atual.vinculos.map((v) => ({ ...v, ativo: false })) }
      const { roteador } = abrir(`/adm/usuarios/${uuid(500)}`, eu)
      servidor.use(
        handlerEditarVinculo(depois),
        http.post('/api/auth/logout', () => {
          saidas.push('logout')
          return new HttpResponse(null, { status: 204 })
        }),
      )
      await userEvent.click(within(await screen.findByRole('region', { name: 'Adm' })).getByRole('button', { name: 'Remover papel' }))
      servidor.use(http.get('/api/eu', () => HttpResponse.json(criarEu([], null))))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover papel' }))
      await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
      expect(roteador.state.location.state).toEqual({ aviso: 'Você não tem mais acesso a nenhum clube.' })
      await waitFor(() => expect(saidas).toEqual(['logout']))
    })
  })

  it('erro de leitura mostra a mensagem e o botão de repetir', async () => {
    servidor.use(...handlersSessao(), http.get('/api/usuarios/:id', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Falhou feio.' }, { status: 422 })))
    renderizarRotas(rotasAdmUsuarios, `/adm/usuarios/${uuid(710)}`)
    expect(await screen.findByText('Falhou feio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('Editar de convidado: só Nome e Gênero; "Salvar alterações" faz o PATCH e volta à ficha com replace', async () => {
    const usuario = carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null })
    const corpos: unknown[] = []
    servidor.use(handlerEditarUsuario({ ...usuario.atual, nome: 'Carla M. Souza' }, corpos))
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, usuario)
    const nome = await screen.findByLabelText('Nome')
    expect(screen.getByLabelText('Gênero')).toBeEnabled()
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Vínculo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Acrescentar papel' })).not.toBeInTheDocument()
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Carla M. Souza')
    usuario.atual = { ...usuario.atual, nome: 'Carla M. Souza' }
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`))
    expect(corpos).toEqual([{ nome: 'Carla M. Souza', genero: 'F' }])
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('Editar de convidado sem alteração: nada é gravado e volta à ficha', async () => {
    const usuario = carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null })
    const corpos: unknown[] = []
    servidor.use(handlerEditarUsuario(usuario.atual, corpos))
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, usuario)
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`))
    expect(corpos).toEqual([])
  })

  it('/editar de quem não é convidado redireciona para a ficha, com replace e o estado de volta', async () => {
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`)
    await screen.findByRole('heading', { level: 1, name: 'Carla Mendes' })
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`)
    expect(roteador.state.historyAction).toBe('REPLACE')
    expect(roteador.state.location.state).toEqual({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
  })

  it('recusa da API (outro clube): a mensagem aparece no formulário, sem sair', async () => {
    const usuario = carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null })
    servidor.use(handlerRegra422('patch', '/api/usuarios/:id', 'REGRA', 'Esta pessoa tem papel em outro clube.'))
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, usuario)
    const nome = await screen.findByLabelText('Nome')
    await userEvent.type(nome, ' Jr')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta pessoa tem papel em outro clube.')
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}/editar`)
  })

  it('Cancelar volta à ficha sem perguntar', async () => {
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null }))
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`)
  })

  it('Novo → Salvar leva à ficha do convidado', async () => {
    const criado = caixa(criarUsuario({ id: uuid(720), nome: 'Rui Novo', email: 'rui@clube.test', situacao: 'CONVIDADO' }))
    servidor.use(handlerCriarUsuario(criado.atual))
    const { roteador } = abrir('/adm/usuarios/novo', carla(), criado)
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(await screen.findByRole('radio', { name: /Conselheiro/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Águias' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(720)}`))
  })

  it('criar não grava a resposta na ficha: a ficha lê do servidor', async () => {
    const criado = criarUsuario({ id: uuid(720), nome: 'Rui Novo', email: 'rui@clube.test', situacao: 'CONVIDADO' })
    servidor.use(handlerCriarUsuario(criado))
    const { roteador, clienteConsultas } = abrir('/adm/usuarios/novo')
    servidor.use(http.get(`/api/usuarios/${uuid(720)}`, () => delay('infinite')))
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(await screen.findByRole('radio', { name: /Conselheiro/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Águias' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(720)}`))
    expect(clienteConsultas.getQueryData(chavesUsuarios.um(uuid(720)))).toBeUndefined()
  })

  it.each([`/adm/usuarios/${uuid(799)}`, '/adm/usuarios/abc'])('%s → "Não encontramos este usuário"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este usuário' })).toBeInTheDocument()
  })

  it('editar um usuário que não existe → "Não encontramos este usuário"', async () => {
    abrir(`/adm/usuarios/${uuid(799)}/editar`)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este usuário' })).toBeInTheDocument()
  })
})
