import { screen, waitFor, within } from '@testing-library/react'
import type { BoundFunctions, queries } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Desbravador } from '../../../api/desbravadores'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { handlersConviteAcesso } from '../../../testes/handlers/convite-acesso'
import { criarDesbravador, handlerCriarDesbravador, handlerDesbravador, handlerDesbravadores, handlerEditarDesbravador, handlerInativarDesbravador } from '../../../testes/handlers/desbravadores'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlerPerfilDe } from '../../../testes/handlers/perfil'
import { handlerProgressoDbv } from '../../../testes/handlers/progresso'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmDesbravadores } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', corToken: '--classe-amigo' })
const refAmigo = { id: amigo.id, nome: 'Amigo', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-amigo' }

const novaAna = (parcial: Partial<Desbravador> = {}) =>
  caixa(
    criarDesbravador({
      id: uuid(310),
      nome: 'Ana Beatriz Souza',
      nomePublico: 'Ana B.',
      nascimento: '2016-01-15',
      idade: 10,
      entradaEm: '2026-02-02',
      unidade: { id: aguias.id, nome: 'Águias' },
      classeAtual: refAmigo,
      autorizacaoImagem: true,
      autorizacaoImagemEm: '2026-02-02',
      contato: { responsavelNome: 'Márcia Souza', responsavelTelefone: '(11) 98888-0000', responsavelEmail: 'marcia@exemplo.com' },
      ...parcial,
    }),
  )

function abrir(rota: string, dbv = novaAna(), ...outros: Caixa<Desbravador>[]) {
  servidor.use(
    handlerDesbravadores([dbv.atual]),
    handlerDesbravador(dbv, ...outros),
    handlerPerfilDe([dbv, ...outros], { posicaoMes: 3, pontosMes: 86, frequenciaMes: 88 }),
    handlerProgressoDbv(),
    ...handlersConviteAcesso(),
    handlerUnidades([aguias]),
    handlerClasses([amigo]),
  )
  return { ...renderizarRotas(rotasAdmDesbravadores, rota), dbv }
}

const valorDe = (regiao: BoundFunctions<typeof queries>, rotulo: string) => regiao.getByText(rotulo, { selector: 'dt' }).nextElementSibling

describe('ficha do desbravador', () => {
  it('a lista abre a ficha pelo nome e o Voltar devolve filtros e página', async () => {
    const { roteador } = abrir('/adm/desbravadores?busca=Ana&situacao=todos')
    await userEvent.click(await screen.findByRole('link', { name: 'Ana Beatriz Souza' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Desbravadores' }))
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores')
    expect(roteador.state.location.search).toBe('?busca=Ana&situacao=todos')
    expect(await screen.findByLabelText('Buscar por nome')).toHaveValue('Ana')
  })

  it('mostra cadastro, os três números do mês, progresso e responsável com uso de imagem', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`)
    expect(await screen.findByText('Desbravador · Ativo')).toBeInTheDocument()
    expect(screen.getByText('10 anos · Águias')).toBeInTheDocument()
    const cadastro = within(screen.getByRole('region', { name: 'Cadastro' }))
    expect(valorDe(cadastro, 'Nome público')).toHaveTextContent('Ana B.')
    expect(valorDe(cadastro, 'Nascimento')).toHaveTextContent('15/01/2016')
    expect(valorDe(cadastro, 'Entrada no clube')).toHaveTextContent('02/02/2026')
    expect(valorDe(cadastro, 'Classe do ano')).toHaveTextContent('Amigo')
    const numeros = within(screen.getByRole('region', { name: 'Números do mês' }))
    expect(await numeros.findByText('67%')).toBeInTheDocument()
    expect(numeros.getByText('Progresso em Amigo')).toBeInTheDocument()
    expect(numeros.getByText('86 pts')).toBeInTheDocument()
    expect(numeros.getByText('3º no ranking do mês')).toBeInTheDocument()
    expect(numeros.getByText('88%')).toBeInTheDocument()
    expect(numeros.getByText('Frequência no mês')).toBeInTheDocument()
    const responsavel = within(screen.getByRole('region', { name: 'Responsável' }))
    expect(valorDe(responsavel, 'Nome')).toHaveTextContent('Márcia Souza')
    expect(valorDe(responsavel, 'Uso de imagem')).toHaveTextContent('Autorizado em 02/02/2026')
    expect(screen.getByRole('button', { name: 'Inativar desbravador' })).toBeInTheDocument()
  })

  it('sem contato na resposta, não há bloco Responsável', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna({ contato: undefined }))
    await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })
    expect(screen.queryByRole('region', { name: 'Responsável' })).not.toBeInTheDocument()
  })

  it.each([
    ['Diretoria', { tipo: 'DIRETORIA' as const, unidade: null }],
    ['inativo', { ativo: false, saidaEm: '2026-08-01' }],
  ])('%s: sem os três números', async (_caso, parcial) => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna(parcial))
    await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })
    expect(screen.queryByRole('region', { name: 'Números do mês' })).not.toBeInTheDocument()
  })

  it('inativo: Reativar no rodapé e sem "Gerar link de acesso"', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna({ ativo: false, saidaEm: '2026-08-01' }))
    expect(await screen.findByRole('button', { name: 'Reativar desbravador' })).toBeInTheDocument()
    const acesso = within(await screen.findByRole('region', { name: 'Acesso ao app' }))
    await acesso.findByText(/não tem acesso ao app/)
    expect(acesso.queryByRole('button', { name: 'Gerar link de acesso' })).not.toBeInTheDocument()
  })

  it('inativar abre a janela com a data de saída e envia', async () => {
    const corpos: unknown[] = []
    servidor.use(handlerInativarDesbravador((corpo) => corpos.push(corpo)))
    abrir(`/adm/desbravadores/${uuid(310)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Inativar desbravador' }))
    const janela = within(screen.getByRole('dialog', { name: 'Inativar Ana Beatriz Souza?' }))
    expect(janela.getByLabelText('Data de saída')).toBeInTheDocument()
    await userEvent.click(janela.getByRole('button', { name: 'Inativar' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
  })

  it('Editar → Salvar volta à ficha com o dado novo e os avisos da gravação no topo', async () => {
    const dbv = novaAna()
    const editada = { ...dbv.atual, nome: 'Ana Beatriz Lima' }
    servidor.use(handlerEditarDesbravador(editada, [{ codigo: 'AVISO', mensagem: 'Sai da unidade e da chamada.' }], () => { dbv.atual = editada }))
    const { roteador } = abrir(`/adm/desbravadores/${uuid(310)}`, dbv)
    await userEvent.click(await screen.findByRole('link', { name: 'Editar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}/editar`)
    const nome = await screen.findByLabelText('Nome completo')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Ana Beatriz Lima')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Lima' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}`)
    expect(screen.getByText('Sai da unidade e da chamada.')).toBeInTheDocument()
  })

  it('Cancelar da edição volta à ficha sem gravar', async () => {
    const { roteador } = abrir(`/adm/desbravadores/${uuid(310)}/editar`)
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}`)
  })

  it('Novo → Salvar leva à ficha do criado; Cancelar do novo volta à lista', async () => {
    const criada = caixa(criarDesbravador({ id: uuid(330), nome: 'Bia Nova' }))
    servidor.use(handlerCriarDesbravador(criada.atual))
    const { roteador } = abrir('/adm/desbravadores?pagina=1', novaAna(), criada)
    await userEvent.click(await screen.findByRole('link', { name: 'Novo desbravador' }))
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores/novo')
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Bia Nova')
    await userEvent.type(screen.getByLabelText('Nascimento'), '2015-03-10')
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'F')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Bia Nova' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(330)}`)
  })

  it.each([
    ['inexistente', `/adm/desbravadores/${uuid(399)}`],
    ['id malformado', '/adm/desbravadores/abc'],
    ['edição de inexistente', `/adm/desbravadores/${uuid(399)}/editar`],
  ])('%s: "Não encontramos este desbravador" com link para a lista', async (_caso, rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este desbravador' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a lista de desbravadores' })).toHaveAttribute('href', '/adm/desbravadores')
  })
})
