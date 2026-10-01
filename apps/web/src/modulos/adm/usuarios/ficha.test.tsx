import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import type { Usuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlersSessao, uuid } from '../../../testes/handlers/sessao'
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
  handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUsuarios } from './rotas'

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

function abrir(rota: string, usuario = carla(), ...outros: Caixa<Usuario>[]) {
  servidor.use(
    ...handlersSessao(),
    handlerUsuario(usuario, ...outros),
    handlerListaUsuarios([usuario.atual]),
    handlerCatalogoUsuarios(),
    handlerUnidades([aguias]),
  )
  return { ...renderizarRotas(rotasAdmUsuarios, rota), usuario }
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

  it('dados com último acesso; um cartão por papel ativo com escopo e "O que pode fazer" do catálogo', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    expect(await screen.findByText('Ativa · último acesso hoje')).toBeInTheDocument()
    const papel = within(screen.getByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('Unidade Águias')).toBeInTheDocument()
    expect(papel.getByText('Ver desbravadores')).toBeInTheDocument()
    expect(papel.queryByText('Editar dados dos desbravadores')).not.toBeInTheDocument()
  })

  it('o ajuste do vínculo entra em "O que pode fazer"', async () => {
    const ajustada = carla({ vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.editar', concedida: true }] })] })
    abrir(`/adm/usuarios/${uuid(710)}`, ajustada)
    const papel = within(await screen.findByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('Editar dados dos desbravadores')).toBeInTheDocument()
  })

  it('Adm: escopo "Todo o clube" e todas as permissões', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ genero: 'M', vinculos: [criarVinculoUsuario('ADM', 1)] }))
    const papel = within(await screen.findByRole('region', { name: 'Adm' }))
    expect(papel.getByText('Todo o clube')).toBeInTheDocument()
    expect(papel.getByText('Todas as permissões do clube')).toBeInTheDocument()
  })

  it('convidado: Reenviar convite; ativo: Desativar neste clube com confirmação', async () => {
    const chamadas: string[] = []
    servidor.use(handlerConvite(chamadas))
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar convite' }))
    await waitFor(() => expect(chamadas).toEqual([uuid(710)]))
    expect(await screen.findByText('Convite reenviado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desativar neste clube' })).toBeInTheDocument()
  })

  it('ativo não tem Reenviar convite; desativar outra pessoa nomeia a pessoa', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    expect(screen.queryByRole('button', { name: 'Reenviar convite' })).not.toBeInTheDocument()
    const janela = within(screen.getByRole('dialog', { name: 'Desativar Carla Mendes neste clube?' }))
    expect(janela.getByText('A pessoa perde o acesso a este clube na hora.')).toBeInTheDocument()
  })

  it('desativar a si mesmo diz isso com todas as letras', async () => {
    const desativados: string[] = []
    const eu = carla({ id: uuid(500) })
    servidor.use(handlerDesativarUsuario({ ...eu.atual, situacao: 'INATIVO' }, desativados))
    abrir(`/adm/usuarios/${uuid(500)}`, eu)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    const janela = within(await screen.findByRole('dialog', { name: 'Desativar o seu próprio acesso?' }))
    expect(janela.getByText(/Este é o seu usuário/)).toBeInTheDocument()
    await userEvent.click(janela.getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(desativados).toEqual([uuid(500)]))
  })

  it('inativo neste clube: situação Inativo, sem Desativar, com Acrescentar papel', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'INATIVO', vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ativo: false })] }))
    expect(await screen.findByText('Inativo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desativar neste clube' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acrescentar papel' })).toHaveAttribute('href', `/adm/usuarios/${uuid(710)}/editar?acrescentar=1`)
  })

  it('erro de leitura mostra a mensagem e o botão de repetir', async () => {
    servidor.use(...handlersSessao(), http.get('/api/usuarios/:id', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Falhou feio.' }, { status: 422 })))
    renderizarRotas(rotasAdmUsuarios, `/adm/usuarios/${uuid(710)}`)
    expect(await screen.findByText('Falhou feio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('Editar → um Salvar grava os dados e o vínculo alterado e volta à ficha atualizada', async () => {
    const usuario = carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null })
    const corposDados: unknown[] = []
    const corposVinculo: unknown[] = []
    const comNome = { ...usuario.atual, nome: 'Carla M. Souza' }
    servidor.use(
      handlerEditarUsuario(comNome, corposDados),
      handlerEditarVinculo({ ...comNome, vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.editar', concedida: true }] })] }, corposVinculo),
    )
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, usuario)
    const nome = await screen.findByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Carla M. Souza')
    await userEvent.click(within(screen.getByRole('group', { name: 'Vínculo 1' })).getByLabelText('Editar dados dos desbravadores'))
    usuario.atual = comNome
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`))
    expect(corposDados).toEqual([{ nome: 'Carla M. Souza', genero: 'F' }])
    expect(corposVinculo).toHaveLength(1)
  })

  it('fora de convidado, nome e gênero ficam travados e e-mail é só leitura; sem alteração nada é gravado', async () => {
    const corpos: unknown[] = []
    servidor.use(handlerEditarUsuario(carla().atual, corpos), handlerEditarVinculo(carla().atual, corpos))
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`)
    expect(await screen.findByLabelText('Nome')).toBeDisabled()
    expect(screen.getByLabelText('Gênero')).toBeDisabled()
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`))
    expect(corpos).toEqual([])
  })

  it('Cancelar volta à ficha sem perguntar', async () => {
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`)
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`)
  })

  it('vínculo novo recusado: fica na tela com o erro no bloco; Salvar de novo tenta só ele', async () => {
    const usuario = carla()
    const novos: unknown[] = []
    let recusar = true
    servidor.use(
      http.post('/api/usuarios/:id/vinculos', async ({ request }) => {
        novos.push(await request.json())
        if (recusar) return HttpResponse.json({ codigo: 'REGRA', mensagem: 'Escolha ao menos uma classe.' }, { status: 422 })
        return HttpResponse.json({ ...usuario.atual, vinculos: [...usuario.atual.vinculos, criarVinculoUsuario('INSTRUTOR', 2)] }, { status: 201 })
      }),
    )
    abrir(`/adm/usuarios/${uuid(710)}/editar?acrescentar=1`, usuario)
    const bloco = within(await screen.findByRole('group', { name: 'Vínculo 2' }))
    await userEvent.selectOptions(bloco.getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await bloco.findByText('Escolha ao menos uma classe.')).toBeInTheDocument()
    recusar = false
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(novos).toHaveLength(2))
  })

  it('Novo → Salvar leva à ficha do convidado', async () => {
    const criado = caixa(criarUsuario({ id: uuid(720), nome: 'Rui Novo', email: 'rui@clube.test', situacao: 'CONVIDADO' }))
    servidor.use(handlerCriarUsuario(criado.atual))
    const { roteador } = abrir('/adm/usuarios/novo', carla(), criado)
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(await screen.findByLabelText('Águias'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(720)}`))
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
