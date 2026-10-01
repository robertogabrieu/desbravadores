import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import { hojeDoClube } from '../../../api/desbravadores'
import type { Desbravador } from '../../../api/desbravadores'
import { criarClasse, criarUnidade, criarListaUsuarios, handlerClasses, handlerUnidades, handlerUsuarios } from '../../../testes/handlers/leitura'
import {
  criarDesbravador,
  handlerCriarDesbravador,
  handlerDesbravadores,
  handlerEditarDesbravador,
  handlerErroDesbravador,
  handlerInativarDesbravador,
  handlerMatricular,
  handlerMoverUnidade,
  handlerReativarDesbravador,
} from '../../../testes/handlers/desbravadores'
import { handlersConviteAcesso } from '../../../testes/handlers/convite-acesso'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmDesbravadores } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', corToken: '--classe-amigo' })
const refAmigo = { id: amigo.id, nome: 'Amigo', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-amigo' }

const ana = criarDesbravador({
  id: uuid(301),
  nome: 'Ana Clara Souza',
  idade: 11,
  unidade: { id: aguias.id, nome: 'Águias' },
  classeAtual: refAmigo,
})
const bruno = criarDesbravador({ id: uuid(302), nome: 'Bruno Lima', sexo: 'M', idade: 12, unidade: null })
const lider = criarDesbravador({ id: uuid(303), nome: 'Carla Dias', tipo: 'LIDER', idade: 17 })

function abrir(desbravadores = [ana, bruno, lider], aoConsultar?: (url: URL) => void) {
  servidor.use(handlerDesbravadores(desbravadores, aoConsultar), handlerUnidades([aguias]), handlerClasses([amigo]), ...handlersConviteAcesso())
  return renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
}

const linhaDe = (nome: string) => screen.getByRole('row', { name: new RegExp(nome) })

describe('A1 · lista', () => {
  it('mostra nome, idade, unidade, classe em chip com a cor do token e tipo', async () => {
    abrir()
    const linha = within(await screen.findByRole('row', { name: /Ana Clara Souza/ }))
    expect(linha.getByText('11')).toBeInTheDocument()
    expect(linha.getByText('Águias')).toBeInTheDocument()
    expect(linha.getByText('Amigo')).toHaveStyle({ backgroundColor: 'var(--classe-amigo)' })
    expect(linha.getByText('Desbravador')).toBeInTheDocument()
    expect(within(linhaDe('Bruno Lima')).getByText('Sem unidade')).toBeInTheDocument()
    expect(within(linhaDe('Carla Dias')).getByText('Líder')).toBeInTheDocument()
  })

  it('pede só ativos, 25 por página, por padrão', async () => {
    const consultas: URL[] = []
    abrir([ana], (url) => consultas.push(url))
    await screen.findByRole('row', { name: /Ana Clara/ })
    expect(consultas[0]?.searchParams.get('ativo')).toBe('true')
    expect(consultas[0]?.searchParams.get('porPagina')).toBe('25')
    expect(consultas[0]?.searchParams.get('pagina')).toBe('1')
  })

  it('filtra por busca, unidade, "sem unidade", classe e situação', async () => {
    const consultas: URL[] = []
    abrir([ana, bruno], (url) => consultas.push(url))
    await screen.findByRole('row', { name: /Ana Clara/ })
    const ultima = () => consultas[consultas.length - 1]?.searchParams

    await userEvent.type(screen.getByLabelText('Buscar por nome'), 'Bru')
    await waitFor(() => expect(ultima()?.get('busca')).toBe('Bru'))
    await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Clara/ })).not.toBeInTheDocument())
    expect(screen.getByRole('row', { name: /Bruno/ })).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Buscar por nome'))

    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Sem unidade')
    await waitFor(() => expect(ultima()?.get('semUnidade')).toBe('true'))

    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Águias')
    await waitFor(() => expect(ultima()?.get('unidadeId')).toBe(aguias.id))
    expect(ultima()?.get('semUnidade')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('Classe'), 'Amigo')
    await waitFor(() => expect(ultima()?.get('classeId')).toBe(amigo.id))

    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'Inativos')
    await waitFor(() => expect(ultima()?.get('ativo')).toBe('false'))
  })

  it('pagina de 25 em 25', async () => {
    const muitos = Array.from({ length: 30 }, (_, i) => criarDesbravador({ id: uuid(400 + i), nome: `Pessoa ${String(i).padStart(2, '0')}` }))
    const consultas: URL[] = []
    abrir(muitos, (url) => consultas.push(url))
    await screen.findByRole('row', { name: /Pessoa 00/ })
    expect(screen.getByText('1–25 de 30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(await screen.findByRole('row', { name: /Pessoa 25/ })).toBeInTheDocument()
    expect(consultas[consultas.length - 1]?.searchParams.get('pagina')).toBe('2')
  })

  it('lista vazia ensina o próximo passo', async () => {
    abrir([])
    expect(await screen.findByText('Nenhum desbravador encontrado')).toBeInTheDocument()
  })

  it('erro ao carregar aparece em texto', async () => {
    servidor.use(handlerErroDesbravador('get', '/api/desbravadores', 500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os desbravadores')
  })
})

describe('A1 · novo desbravador', () => {
  async function abrirNovo() {
    abrir([])
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desbravador' }))
    return within(await screen.findByRole('dialog', { name: 'Novo desbravador' }))
  }

  it('cria com os campos do contrato, classe do ano e avançada marcada por padrão', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    const painel = await abrirNovo()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(painel.getByLabelText('Unidade'), 'Águias')
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Amigo')
    expect(painel.getByLabelText('Matricular também na avançada')).toBeChecked()
    await userEvent.type(painel.getByLabelText('Responsável'), 'Marta Rocha')
    await userEvent.click(painel.getByLabelText('Autorizou o uso de imagem'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpo).toBeDefined())
    expect(corpo).toMatchObject({
      nome: 'Davi Rocha',
      nascimento: '2015-05-20',
      sexo: 'M',
      tipo: 'DBV',
      unidadeId: aguias.id,
      classeId: amigo.id,
      incluirAvancada: true,
      responsavelNome: 'Marta Rocha',
      autorizacaoImagem: true,
      autorizacaoImagemEm: hojeDoClube(),
      entradaEm: hojeDoClube(),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('desmarcar a avançada é enviado', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    const painel = await abrirNovo()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Amigo')
    await userEvent.click(painel.getByLabelText('Matricular também na avançada'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ classeId: amigo.id, incluirAvancada: false }))
  })

  it('valida com os contratos antes de enviar', async () => {
    let enviou = false
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], () => (enviou = true)))
    const painel = await abrirNovo()
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Informe o nome completo')).toBeInTheDocument()
    expect(painel.getByText('Informe a data de nascimento')).toBeInTheDocument()
    expect(painel.getByText('Escolha o sexo')).toBeInTheDocument()
    expect(enviou).toBe(false)
  })

  it('líder esconde a unidade e a classe e mostra a conta de usuário (opcional)', async () => {
    servidor.use(handlerUsuarios(criarListaUsuarios()))
    const painel = await abrirNovo()
    expect(painel.getByLabelText('Unidade')).toBeInTheDocument()
    expect(painel.queryByLabelText('Conta de usuário (opcional)')).not.toBeInTheDocument()
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Líder em formação')
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(painel.queryByLabelText('Classe do ano')).not.toBeInTheDocument()
    expect(painel.getByLabelText('Conta de usuário (opcional)')).toBeInTheDocument()
  })

  it('mostra os avisos da API em faixa amarela sem impedir o cadastro', async () => {
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [{ codigo: 'AVISO_SEXO_UNIDADE', mensagem: 'A unidade Águias é masculina.' }]))
    const painel = await abrirNovo()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Feminino')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    const faixa = await screen.findByRole('status')
    expect(faixa).toHaveTextContent('A unidade Águias é masculina.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('erro da API fica no painel, que continua aberto', async () => {
    servidor.use(handlerErroDesbravador('post', '/api/desbravadores', 422, { codigo: 'REGRA', mensagem: 'Classe de outro clube.' }))
    const painel = await abrirNovo()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByRole('alert')).toHaveTextContent('Classe de outro clube.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('erro de campo da API (400) aparece no campo', async () => {
    servidor.use(handlerErroDesbravador('post', '/api/desbravadores', 400, { codigo: 'VALIDACAO', mensagem: 'Campos inválidos', campos: { nome: 'Nome já usado' } }))
    const painel = await abrirNovo()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Nome já usado')).toBeInTheDocument()
  })
})

describe('A1 · editar', () => {
  it('abre com os dados, envia só os campos da pessoa e move de unidade quando ela muda', async () => {
    let corpo: unknown
    let movido: { id: string; unidadeId: string | null } | undefined
    servidor.use(
      handlerEditarDesbravador(ana, [], (recebido) => (corpo = recebido)),
      handlerMoverUnidade((id, c) => (movido = { id, unidadeId: c.unidadeId })),
    )
    abrir([ana])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Clara Souza' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Ana Clara Souza' }))
    expect(painel.getByLabelText('Nome completo')).toHaveValue('Ana Clara Souza')
    expect(painel.getByLabelText('Unidade')).toHaveValue(aguias.id)
    expect(painel.queryByLabelText('Entrada no clube')).not.toBeInTheDocument()
    await userEvent.clear(painel.getByLabelText('Nome público'))
    await userEvent.type(painel.getByLabelText('Nome público'), 'Aninha')
    await userEvent.selectOptions(painel.getByLabelText('Unidade'), 'Sem unidade')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ nome: 'Ana Clara Souza', nomePublico: 'Aninha', nascimento: '2015-03-10' }))
    expect(corpo).not.toHaveProperty('unidadeId')
    await waitFor(() => expect(movido).toEqual({ id: ana.id, unidadeId: null }))
  })

  it('não move de unidade quando a unidade não mudou', async () => {
    let moveu = false
    servidor.use(handlerEditarDesbravador(ana), handlerMoverUnidade(() => (moveu = true)))
    abrir([ana])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Clara Souza' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(moveu).toBe(false)
  })
})

describe('A1 · editar a classe do ano', () => {
  const configuracao = criarConfiguracao()
  const anoEsperado = anoClube(hojeNoFuso(configuracao.fuso, new Date()), configuracao.inicioAnoClube)

  it('desbravador sem classe: escolher a classe na edição matricula no ano do clube, com a avançada', async () => {
    let matricula: { id: string; classeId: string; anoClube: number; incluirAvancada: boolean } | undefined
    servidor.use(handlerConfiguracao(configuracao), handlerEditarDesbravador(bruno), handlerMatricular((id, corpo) => (matricula = { id, ...corpo })))
    abrir([bruno])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Bruno Lima' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Bruno Lima' }))
    expect(painel.getByLabelText('Classe do ano')).toHaveValue('')
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Amigo')
    expect(painel.getByRole('checkbox', { name: 'Matricular também na avançada' })).toBeChecked()
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(matricula).toEqual({ id: bruno.id, classeId: amigo.id, anoClube: anoEsperado, incluirAvancada: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('com classe atual: o campo vem preenchido, sem "Sem classe", e não matricula se a classe não mudou', async () => {
    let matriculou = false
    servidor.use(handlerConfiguracao(configuracao), handlerEditarDesbravador(ana), handlerMatricular(() => (matriculou = true)))
    abrir([ana])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Clara Souza' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Ana Clara Souza' }))
    expect(painel.getByLabelText('Classe do ano')).toHaveValue(amigo.id)
    expect(within(painel.getByLabelText('Classe do ano')).queryByRole('option', { name: 'Sem classe' })).not.toBeInTheDocument()
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(matriculou).toBe(false)
  })

  it('o aviso da troca acompanha a trilha: mesma trilha é desistência, outra trilha cursa as duas', async () => {
    const companheiro = criarClasse({ id: uuid(102), nome: 'Companheiro', corToken: '--classe-companheiro' })
    const agrupada = criarClasse({ id: uuid(103), nome: 'Agrupadas (Amigo a Guia)', trilha: 'AGRUPADAS', corToken: '--classe-guia' })
    servidor.use(handlerDesbravadores([ana]), handlerUnidades([aguias]), handlerClasses([amigo, companheiro, agrupada]))
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Clara Souza' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Ana Clara Souza' }))
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Companheiro')
    expect(painel.getByText('A classe atual fica registrada como desistência.')).toBeInTheDocument()
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Agrupadas (Amigo a Guia)')
    expect(painel.getByText('A classe atual continua: o desbravador passa a cursar as duas.')).toBeInTheDocument()
  })

  it('matrícula recusada: os dados ficam salvos e o painel diz que a classe não mudou', async () => {
    servidor.use(
      handlerConfiguracao(configuracao),
      handlerEditarDesbravador(bruno),
      http.post('/api/desbravadores/:id/matriculas', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Reative o desbravador antes de matricular.' }, { status: 422 })),
    )
    abrir([bruno])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Bruno Lima' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Bruno Lima' }))
    await userEvent.selectOptions(painel.getByLabelText('Classe do ano'), 'Amigo')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Dados salvos. A classe não foi alterada: Reative o desbravador antes de matricular.')).toBeInTheDocument()
  })
})

describe('A1 · editar com salvamento parcial', () => {
  it('desbravador inativo não mostra o campo Unidade', async () => {
    const inativo = criarDesbravador({ id: uuid(311), nome: 'Elisa Prado', ativo: false, saidaEm: '2026-08-01' })
    abrir([inativo])
    await userEvent.selectOptions(await screen.findByLabelText('Situação'), 'Inativos')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Elisa Prado' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Editar Elisa Prado' }))
    expect(painel.getByLabelText('Nome completo')).toBeInTheDocument()
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it('PATCH ok e PUT recusado: painel fica aberto, diz o que salvou e mostra os avisos', async () => {
    servidor.use(
      handlerEditarDesbravador(ana, [{ codigo: 'AVISO_SEXO_UNIDADE', mensagem: 'A unidade Leões é feminina.' }]),
      http.put('/api/desbravadores/:id/unidade', () =>
        HttpResponse.json({ codigo: 'REGRA', mensagem: 'Reative o desbravador antes de mudar a unidade.' }, { status: 422 }),
      ),
    )
    abrir([ana])
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Clara Souza' }))
    const painel = within(await screen.findByRole('dialog'))
    await userEvent.selectOptions(painel.getByLabelText('Unidade'), 'Sem unidade')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Dados salvos. A unidade não foi alterada: Reative o desbravador antes de mudar a unidade.')).toBeInTheDocument()
    expect(painel.getByText('A unidade Leões é feminina.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('A1 · inativar e reativar', () => {
  it('inativar pede a data de saída (hoje por padrão) e envia', async () => {
    let recebido: unknown
    servidor.use(handlerInativarDesbravador((corpo) => (recebido = corpo)))
    abrir([ana])
    await userEvent.click(await screen.findByRole('button', { name: 'Inativar Ana Clara Souza' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Inativar Ana Clara Souza' }))
    expect(painel.getByLabelText('Data de saída')).toHaveValue(hojeDoClube())
    fireEvent.change(painel.getByLabelText('Data de saída'), { target: { value: '2026-09-20' } })
    await userEvent.click(painel.getByRole('button', { name: 'Inativar' }))
    await waitFor(() => expect(recebido).toEqual({ id: ana.id, saidaEm: '2026-09-20' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('ativos não têm Reativar; no filtro inativos, sim, e ele chama a API', async () => {
    const inativa = criarDesbravador({ id: uuid(310), nome: 'Elisa Prado', ativo: false, saidaEm: '2026-08-01' })
    let reativado: string | undefined
    servidor.use(handlerReativarDesbravador((id) => (reativado = id)))
    abrir([ana, inativa])
    await screen.findByRole('row', { name: /Ana Clara/ })
    expect(screen.queryByRole('button', { name: /Reativar/ })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'Inativos')
    await userEvent.click(await screen.findByRole('button', { name: 'Reativar Elisa Prado' }))
    await waitFor(() => expect(reativado).toBe(inativa.id))
    expect(screen.queryByRole('button', { name: /Inativar/ })).not.toBeInTheDocument()
  })
})

describe('Tipo: Desbravador, Diretoria e Líder', () => {
  const diretor = criarDesbravador({
    id: uuid(501),
    nome: 'Davi Rocha',
    tipo: 'DIRETORIA',
    idade: 16,
    classeAtual: refAmigo,
    motivosDiretoria: ['IDADE', 'CONSELHEIRO'],
  })
  const instrutora = criarDesbravador({ id: uuid(502), nome: 'Eva Prado', tipo: 'DIRETORIA', idade: 14, motivosDiretoria: ['INSTRUTOR'] })
  const marcada = criarDesbravador({ id: uuid(504), nome: 'Gil Matos', tipo: 'DIRETORIA', idade: 13, motivosDiretoria: ['ADM'] })
  const liderConselheira = criarDesbravador({ id: uuid(505), nome: 'Hana Reis', tipo: 'LIDER', idade: 17, motivosDiretoria: [] })

  async function editar(desbravador: Desbravador, outros: Desbravador[] = []) {
    abrir([desbravador, ...outros])
    await userEvent.click(await screen.findByRole('button', { name: `Editar ${desbravador.nome}` }))
    return within(await screen.findByRole('dialog', { name: `Editar ${desbravador.nome}` }))
  }

  it('a coluna Tipo mostra Diretoria, sem selo ao lado do nome, e a unidade fica "—" para Diretoria e Líder', async () => {
    abrir([ana, diretor, lider])
    const linhaDiretor = within(await screen.findByRole('row', { name: /Davi Rocha/ }))
    expect(linhaDiretor.getAllByText('Diretoria')).toHaveLength(1)
    expect(linhaDiretor.getByText('—')).toBeInTheDocument()
    expect(linhaDiretor.queryByText('Sem unidade')).not.toBeInTheDocument()
    expect(within(linhaDe('Carla Dias')).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(linhaDe('Ana Clara Souza')).queryByText('Diretoria')).not.toBeInTheDocument()
  })

  it('filtro Tipo: Todos por padrão, Desbravador, Diretoria e Líder; o filtro "diretoria" não é mais enviado', async () => {
    const consultas: URL[] = []
    abrir([ana, diretor, lider], (url) => consultas.push(url))
    await screen.findByRole('row', { name: /Ana Clara/ })
    const ultima = () => consultas[consultas.length - 1]?.searchParams
    expect(ultima()?.get('tipo')).toBeNull()
    expect(screen.queryByLabelText('Diretoria')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Diretoria')
    await waitFor(() => expect(ultima()?.get('tipo')).toBe('DIRETORIA'))
    await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Clara/ })).not.toBeInTheDocument())
    expect(screen.getByRole('row', { name: /Davi Rocha/ })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Líder')
    await waitFor(() => expect(ultima()?.get('tipo')).toBe('LIDER'))
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Desbravador')
    await waitFor(() => expect(ultima()?.get('tipo')).toBe('DBV'))
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Todos')
    await waitFor(() => expect(ultima()?.get('tipo')).toBeNull())
    expect(consultas.every((url) => url.searchParams.get('diretoria') === null)).toBe(true)
  })

  it('filtro Tipo sem ninguém mostra o estado vazio', async () => {
    abrir([ana])
    await screen.findByRole('row', { name: /Ana Clara/ })
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Diretoria')
    expect(await screen.findByText('Nenhum desbravador encontrado')).toBeInTheDocument()
  })

  it('no painel, o Tipo é editável e a ajuda diz todos os motivos da Diretoria; a linha "Membro da Diretoria" saiu', async () => {
    const painel = await editar(diretor)
    const tipo = painel.getByLabelText('Tipo')
    expect(tipo).toBeEnabled()
    expect(tipo).toHaveValue('DIRETORIA')
    expect(tipo).toHaveAccessibleDescription('Diretoria pela idade (16 anos até junho) e porque é conselheiro')
    expect(painel.queryByText('Membro da Diretoria')).not.toBeInTheDocument()
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(painel.getByLabelText('Classe do ano')).toHaveValue(amigo.id)
  })

  it('a ajuda diz o motivo instrutor', async () => {
    const painelEva = await editar(instrutora)
    expect(painelEva.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque é instrutor')
  })

  it('a ajuda diz quando foi o Adm que marcou', async () => {
    const painel = await editar(marcada)
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque foi marcado pelo Adm')
  })

  it('Líder não mostra motivo de Diretoria', async () => {
    const painel = await editar(liderConselheira)
    expect(painel.getByLabelText('Tipo')).toHaveValue('LIDER')
    expect(painel.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
  })

  it('trocar Desbravador para Diretoria avisa a saída da unidade, esconde a Unidade, mantém a classe e envia o Tipo', async () => {
    let corpo: unknown
    let moveu = false
    servidor.use(
      handlerEditarDesbravador(ana, [], (recebido) => (corpo = recebido)),
      handlerMoverUnidade(() => (moveu = true)),
    )
    const painel = await editar(ana)
    expect(painel.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Diretoria')
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription('Sai da unidade e da chamada; continua cursando a classe.')
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(painel.getByLabelText('Classe do ano')).toBeInTheDocument()
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'DIRETORIA' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(moveu).toBe(false)
  })

  it('trocar Desbravador para Líder também avisa a saída da unidade', async () => {
    const painel = await editar(ana)
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Líder em formação')
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription('Sai da unidade e da chamada; continua cursando a classe.')
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it.each([
    ['Diretoria', marcada],
    ['Líder', liderConselheira],
  ])('voltar %s a Desbravador avisa que a chamada depende da unidade', async (_rotulo, quem) => {
    const painel = await editar(quem)
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Desbravador')
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription('Volta para a chamada quando tiver uma unidade: escolha abaixo.')
    expect(painel.getByLabelText('Unidade')).toHaveValue('')
  })

  it('Desbravador sem unidade mostra o aviso junto à Unidade; escolhida a unidade, o aviso sai', async () => {
    const semUnidade = criarDesbravador({ id: uuid(506), nome: 'Ivo Lopes', unidade: null })
    const painel = await editar(semUnidade)
    const unidade = painel.getByLabelText('Unidade')
    expect(unidade).toHaveAccessibleDescription('Volta para a chamada quando tiver uma unidade: escolha abaixo.')
    expect(painel.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
    await userEvent.selectOptions(unidade, aguias.id)
    expect(unidade).not.toHaveAccessibleDescription()
  })

  it('o Tipo só vai no corpo quando muda', async () => {
    let corpo: unknown
    servidor.use(handlerEditarDesbravador(ana, [], (recebido) => (corpo = recebido)))
    const painel = await editar(ana)
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toBeDefined())
    expect(corpo).not.toHaveProperty('tipo')
  })

  it('voltar a Desbravador quem está na regra mostra a recusa da API no próprio campo Tipo', async () => {
    servidor.use(
      handlerErroDesbravador('patch', '/api/desbravadores/:id', 422, {
        codigo: 'REGRA',
        mensagem: 'Tem 16 anos até junho: é Diretoria automaticamente.',
      }),
    )
    const painel = await editar(diretor)
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Desbravador')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(painel.getByLabelText('Tipo')).toHaveAttribute('aria-invalid', 'true'))
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription(expect.stringContaining('Tem 16 anos até junho: é Diretoria automaticamente.'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('no cadastro, Diretoria esconde a Unidade, mantém a classe e envia o Tipo', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    abrir([])
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desbravador' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Novo desbravador' }))
    await userEvent.selectOptions(painel.getByLabelText('Tipo'), 'Diretoria')
    expect(painel.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(painel.getByLabelText('Classe do ano')).toBeInTheDocument()
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2014-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'DIRETORIA' }))
    expect(corpo).not.toHaveProperty('unidadeId')
  })

  it('cadastro de quem já cai na regra mostra o aviso de Diretoria sem unidade', async () => {
    servidor.use(
      handlerCriarDesbravador(diretor, [{ codigo: 'AVISO_DIRETORIA_SEM_UNIDADE', mensagem: 'Diretoria não entra em unidade.' }]),
    )
    abrir([])
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desbravador' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Novo desbravador' }))
    await userEvent.type(painel.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(painel.getByLabelText('Nascimento'), { target: { value: '2009-05-20' } })
    await userEvent.selectOptions(painel.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(painel.getByLabelText('Unidade'), 'Águias')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Diretoria não entra em unidade.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o painel mostra o que a conta ligada instrui e aconselha', async () => {
    const duplo = criarDesbravador({
      id: uuid(503),
      nome: 'Rui Duplo',
      tipo: 'DIRETORIA',
      usuarioId: uuid(900),
      motivosDiretoria: ['CONSELHEIRO', 'INSTRUTOR'],
      instrui: [
        { id: uuid(601), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' },
        { id: uuid(602), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-companheiro' },
      ],
      aconselha: [{ id: uuid(701), nome: 'Águias' }],
    })
    const painel = await editar(duplo)
    expect(painel.getByText('Instrui: Amigo, Companheiro')).toBeInTheDocument()
    expect(painel.getByText('Aconselha: Águias')).toBeInTheDocument()
    expect(painel.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque é conselheiro e instrutor')
  })

  it('sem vínculo de instrutor ou conselheiro, o painel não tem as linhas Instrui/Aconselha', async () => {
    const painel = await editar(ana)
    expect(painel.queryByText(/^Instrui:/)).not.toBeInTheDocument()
    expect(painel.queryByText(/^Aconselha:/)).not.toBeInTheDocument()
  })
})
