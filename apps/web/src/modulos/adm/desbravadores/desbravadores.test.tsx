import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import type { RequestHandler } from 'msw'
import { hojeDoClube } from '../../../api/desbravadores'
import type { Desbravador } from '../../../api/desbravadores'
import { caixa } from '../../../testes/handlers/caixa'
import { criarPerfil, handlerPerfilDe } from '../../../testes/handlers/perfil'
import { handlerProgressoDbv } from '../../../testes/handlers/progresso'
import { criarClasse, criarUnidade, criarListaUsuarios, handlerClasses, handlerUnidades, handlerUsuarios } from '../../../testes/handlers/leitura'
import {
  criarDesbravador,
  handlerCriarDesbravador,
  handlerDesbravador,
  handlerDesbravadores,
  handlerEditarDesbravador,
  handlerErroDesbravador,
  handlerMatricular,
  handlerMoverUnidade,
} from '../../../testes/handlers/desbravadores'
import { handlersConviteAcesso } from '../../../testes/handlers/convite-acesso'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { simularLargura } from '../../../testes/midia'
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

const REGIAO_DA_FICHA = { name: 'Cadastro' }
const esperarFicha = () => screen.findByRole('region', REGIAO_DA_FICHA)

/** A ficha que abre depois de gravar precisa de perfil e progresso; `handlers` do teste têm prioridade. */
const handlersDaFicha = (...dbvs: Desbravador[]) => {
  const caixas = dbvs.map((d) => caixa(d))
  return [handlerDesbravador(...caixas), handlerPerfilDe(caixas), handlerProgressoDbv(), ...handlersConviteAcesso()]
}

async function abrirNovo(...handlers: RequestHandler[]) {
  servidor.use(
    ...handlers,
    ...handlersDaFicha(criarDesbravador()),
    handlerUnidades([aguias]),
    handlerClasses([amigo]),
    handlerUsuarios(criarListaUsuarios()),
    handlerConfiguracao(criarConfiguracao()),
  )
  const tela = renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores/novo')
  await screen.findByRole('heading', { level: 1, name: 'Novo desbravador' })
  return tela
}

async function abrirEdicao(dbv: Desbravador, ...handlers: RequestHandler[]) {
  servidor.use(
    ...handlers,
    ...handlersDaFicha(dbv),
    handlerUnidades([aguias]),
    handlerClasses([amigo]),
    handlerUsuarios(criarListaUsuarios()),
    handlerConfiguracao(criarConfiguracao()),
  )
  const tela = renderizarRotas(rotasAdmDesbravadores, `/adm/desbravadores/${dbv.id}/editar`)
  await screen.findByRole('heading', { level: 1, name: dbv.nome })
  // Unidades e classes chegam depois do registro; sem elas a seleção ainda não mostra o valor do cadastro.
  await waitFor(() => {
    const unidade = screen.queryByLabelText('Unidade')
    if (unidade) expect(unidade).toHaveTextContent('Águias')
    const classe = screen.queryByLabelText('Classe do ano')
    if (classe) expect(classe).toHaveTextContent('Amigo')
  })
  return tela
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

  it('filtros e página moram no endereço: abrir com ?unidade=sem&pagina=2 pede isso à API', async () => {
    const urls: URL[] = []
    servidor.use(
      handlerDesbravadores(Array.from({ length: 30 }, (_, n) => criarDesbravador({ id: uuid(400 + n), nome: `Dbv ${n}` })), (url) => urls.push(url)),
      handlerUnidades([aguias]),
      handlerClasses([amigo]),
    )
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores?unidade=sem&pagina=2')
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('pagina')).toBe('2'))
    expect(urls.at(-1)?.searchParams.get('semUnidade')).toBe('true')
    expect(screen.getByLabelText('Unidade')).toHaveValue('sem')
  })

  it('a lista não tem mais coluna de ações: inativar e reativar moram na ficha', async () => {
    abrir([criarDesbravador()])
    await screen.findByRole('link', { name: 'Ana Clara Souza' })
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  })

  it('lista vazia ensina o próximo passo, sem botão de limpar filtro que não existe', async () => {
    abrir([])
    expect(await screen.findByText('Nenhum desbravador encontrado')).toBeInTheDocument()
    expect(screen.getByText(/Cadastre o primeiro desbravador/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  })

  it('vazio com filtro ativo diz que o filtro esconde e "Limpar filtros" volta à lista inteira', async () => {
    servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]), ...handlersConviteAcesso())
    servidor.use(handlerDesbravadores([]))
    const { roteador } = renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores?tipo=LIDER&situacao=false&busca=ze')
    expect(await screen.findByText(/Os filtros escolhidos escondem/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(roteador.state.location.search).toBe('')
  })

  it('o nome na lista traz o ícone de abrir a ficha, e o nome acessível continua sendo o nome', async () => {
    abrir([criarDesbravador()])
    const link = await screen.findByRole('link', { name: 'Ana Clara Souza' })
    expect(link.querySelector('[data-sinal="abre-ficha"]')).not.toBeNull()
  })

  it('erro ao carregar mostra a mensagem da API e repete a busca pelo "Tentar de novo"', async () => {
    servidor.use(handlerErroDesbravador('get', '/api/desbravadores', 500, { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao listar.' }))
    servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]))
    renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao listar.')
    servidor.use(handlerDesbravadores([criarDesbravador()]))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: 'Ana Clara Souza' })).toBeInTheDocument()
  })
})

describe('lista no celular', () => {
  const diretora = criarDesbravador({ id: uuid(306), nome: 'Davi Rocha', tipo: 'DIRETORIA', idade: 16, classeAtual: refAmigo })

  it('cada pessoa é um cartão que leva à ficha: nome, "N anos · Unidade", chip da classe e selo do tipo fora de Desbravador', async () => {
    simularLargura(390)
    const { roteador } = abrir([ana, bruno, diretora])
    const cartaoAna = await screen.findByRole('link', { name: /Ana Clara Souza/ })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(cartaoAna).toHaveTextContent('11 anos · Águias')
    expect(within(cartaoAna).getByText('Amigo')).toHaveStyle({ backgroundColor: 'var(--classe-amigo)' })
    expect(within(cartaoAna).queryByText('Desbravador')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bruno Lima/ })).toHaveTextContent('12 anos · Sem unidade')
    const cartaoDavi = screen.getByRole('link', { name: /Davi Rocha/ })
    expect(within(cartaoDavi).getByText('Diretoria')).toBeInTheDocument()
    expect(cartaoDavi).toHaveTextContent('16 anos')
    expect(cartaoDavi).not.toHaveTextContent('·')

    await userEvent.click(cartaoAna)
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${ana.id}`)
  })

  it('topo no celular: "Novo desbravador" e "Importar" lado a lado', async () => {
    simularLargura(390)
    abrir([ana])
    await screen.findByRole('link', { name: /Ana Clara Souza/ })
    expect(screen.getByRole('link', { name: 'Novo desbravador' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument()
  })

  it('só a busca fica à vista; "Filtros" abre a folha, aplica na URL, conta os filtros ligados e "Mostrar N" fecha', async () => {
    simularLargura(390)
    const consultas: URL[] = []
    const { roteador } = abrir([ana, bruno, diretora], (url) => consultas.push(url))
    await screen.findByRole('link', { name: /Ana Clara Souza/ })
    expect(screen.getByLabelText('Buscar por nome')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    const folha = within(screen.getByRole('dialog', { name: 'Filtrar desbravadores' }))
    expect(folha.getByLabelText('Classe')).toBeInTheDocument()
    expect(folha.getByLabelText('Situação')).toBeInTheDocument()
    await userEvent.selectOptions(folha.getByLabelText('Tipo'), 'Diretoria')
    await waitFor(() => expect(consultas.at(-1)?.searchParams.get('tipo')).toBe('DIRETORIA'))
    expect(roteador.state.location.search).toContain('tipo=DIRETORIA')
    await userEvent.selectOptions(folha.getByLabelText('Unidade'), 'Águias')
    await waitFor(() => expect(consultas.at(-1)?.searchParams.get('unidadeId')).toBe(aguias.id))

    await userEvent.click(await folha.findByRole('button', { name: 'Mostrar 0 desbravadores' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtros, 2 ligados' })).toHaveTextContent('2')
  })

  it('a folha mostra a contagem do resultado e "Limpar filtros" desliga os quatro filtros', async () => {
    simularLargura(390)
    const { roteador } = renderizarComFiltro('/adm/desbravadores?tipo=DIRETORIA&situacao=todos')
    await screen.findByRole('link', { name: /Davi Rocha/ })
    await userEvent.click(screen.getByRole('button', { name: 'Filtros, 2 ligados' }))
    const folha = within(screen.getByRole('dialog'))
    expect(folha.getByRole('button', { name: 'Mostrar 1 desbravador' })).toBeInTheDocument()
    await userEvent.click(folha.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(roteador.state.location.search).toBe(''))
    expect(await folha.findByRole('button', { name: 'Mostrar 3 desbravadores' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
  })

  function renderizarComFiltro(endereco: string) {
    servidor.use(handlerDesbravadores([ana, bruno, diretora]), handlerUnidades([aguias]), handlerClasses([amigo]), ...handlersConviteAcesso())
    return renderizarRotas(rotasAdmDesbravadores, endereco)
  }
})

describe('A1 · novo desbravador', () => {
  it('cria com os campos do contrato, classe do ano e avançada marcada por padrão', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    await abrirNovo()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Águias')
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Amigo')
    expect(screen.getByLabelText('Matricular também na avançada')).toBeChecked()
    await userEvent.type(screen.getByLabelText('Responsável'), 'Marta Rocha')
    await userEvent.click(screen.getByLabelText('Autorizou o uso de imagem'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

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
    await esperarFicha()
  })

  it('desmarcar a avançada é enviado', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    await abrirNovo()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Amigo')
    await userEvent.click(screen.getByLabelText('Matricular também na avançada'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ classeId: amigo.id, incluirAvancada: false }))
  })

  it('valida com os contratos antes de enviar', async () => {
    let enviou = false
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], () => (enviou = true)))
    await abrirNovo()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe o nome completo')).toBeInTheDocument()
    expect(screen.getByText('Informe a data de nascimento')).toBeInTheDocument()
    expect(screen.getByText('Escolha o sexo')).toBeInTheDocument()
    expect(enviou).toBe(false)
  })

  it('líder esconde a unidade e a classe e mostra a conta de usuário (opcional)', async () => {
    servidor.use(handlerUsuarios(criarListaUsuarios()))
    await abrirNovo()
    expect(screen.getByLabelText('Unidade')).toBeInTheDocument()
    expect(screen.queryByLabelText('Conta de usuário (opcional)')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Líder em formação')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Classe do ano')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Conta de usuário (opcional)')).toBeInTheDocument()
  })

  it('mostra os avisos da API em faixa amarela sem impedir o cadastro', async () => {
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [{ codigo: 'AVISO_SEXO_UNIDADE', mensagem: 'A unidade Águias é masculina.' }]))
    await abrirNovo()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Feminino')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('A unidade Águias é masculina.')).toBeInTheDocument()
    await esperarFicha()
  })

  it('erro da API fica na tela, que continua aberta', async () => {
    servidor.use(handlerErroDesbravador('post', '/api/desbravadores', 422, { codigo: 'REGRA', mensagem: 'Classe de outro clube.' }))
    await abrirNovo()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Classe de outro clube.')
    expect(screen.getByRole('heading', { level: 1, name: 'Novo desbravador' })).toBeInTheDocument()
  })

  it('erro de campo da API (400) aparece no campo', async () => {
    servidor.use(handlerErroDesbravador('post', '/api/desbravadores', 400, { codigo: 'VALIDACAO', mensagem: 'Campos inválidos', campos: { nome: 'Nome já usado' } }))
    await abrirNovo()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2015-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado')).toBeInTheDocument()
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
    await abrirEdicao(ana)
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana Clara Souza')
    expect(screen.getByLabelText('Unidade')).toHaveValue(aguias.id)
    expect(screen.queryByLabelText('Entrada no clube')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Nome público'))
    await userEvent.type(screen.getByLabelText('Nome público'), 'Aninha')
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Sem unidade')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(corpo).toMatchObject({ nome: 'Ana Clara Souza', nomePublico: 'Aninha', nascimento: '2015-03-10' }))
    expect(corpo).not.toHaveProperty('unidadeId')
    await waitFor(() => expect(movido).toEqual({ id: ana.id, unidadeId: null }))
  })

  it('não move de unidade quando a unidade não mudou', async () => {
    let moveu = false
    servidor.use(handlerEditarDesbravador(ana), handlerMoverUnidade(() => (moveu = true)))
    await abrirEdicao(ana)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await esperarFicha()
    expect(moveu).toBe(false)
  })
})

describe('A1 · editar a classe do ano', () => {
  const configuracao = criarConfiguracao()
  const anoEsperado = anoClube(hojeNoFuso(configuracao.fuso, new Date()), configuracao.inicioAnoClube)

  it('desbravador sem classe: escolher a classe na edição matricula no ano do clube, com a avançada', async () => {
    let matricula: { id: string; classeId: string; anoClube: number; incluirAvancada: boolean } | undefined
    servidor.use(handlerConfiguracao(configuracao), handlerEditarDesbravador(bruno), handlerMatricular((id, corpo) => (matricula = { id, ...corpo })))
    await abrirEdicao(bruno)
    expect(screen.getByLabelText('Classe do ano')).toHaveValue('')
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Amigo')
    expect(screen.getByRole('checkbox', { name: 'Matricular também na avançada' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(matricula).toEqual({ id: bruno.id, classeId: amigo.id, anoClube: anoEsperado, incluirAvancada: true }))
    await esperarFicha()
  })

  it('trocar a classe: a ficha abre já com a classe nova, sem esperar a releitura do perfil', async () => {
    const registro = caixa(bruno)
    let matriculou = false
    servidor.use(
      handlerConfiguracao(configuracao),
      handlerEditarDesbravador(bruno),
      handlerMatricular(() => {
        matriculou = true
        registro.atual = { ...bruno, classeAtual: refAmigo }
      }),
      handlerDesbravador(registro),
      http.get('/api/desbravadores/:id/perfil', async () => {
        if (matriculou) await delay('infinite')
        return HttpResponse.json(criarPerfil({ dbv: registro.atual }))
      }),
      handlerProgressoDbv(),
      ...handlersConviteAcesso(),
      handlerUnidades([aguias]),
      handlerClasses([amigo]),
      handlerUsuarios(criarListaUsuarios()),
    )
    const { roteador } = renderizarRotas(rotasAdmDesbravadores, `/adm/desbravadores/${bruno.id}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Editar' }))
    await screen.findByLabelText('Classe do ano')
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Amigo')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const ficha = within(await esperarFicha())
    await waitFor(() => expect(ficha.getByText('Classe do ano', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Amigo'))
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('com classe atual: o campo vem preenchido, sem "Sem classe", e não matricula se a classe não mudou', async () => {
    let matriculou = false
    servidor.use(handlerConfiguracao(configuracao), handlerEditarDesbravador(ana), handlerMatricular(() => (matriculou = true)))
    await abrirEdicao(ana)
    expect(screen.getByLabelText('Classe do ano')).toHaveValue(amigo.id)
    expect(within(screen.getByLabelText('Classe do ano')).queryByRole('option', { name: 'Sem classe' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await esperarFicha()
    expect(matriculou).toBe(false)
  })

  it('o aviso da troca acompanha a trilha: mesma trilha é desistência, outra trilha cursa as duas', async () => {
    const companheiro = criarClasse({ id: uuid(102), nome: 'Companheiro', corToken: '--classe-companheiro' })
    const agrupada = criarClasse({ id: uuid(103), nome: 'Agrupadas (Amigo a Guia)', trilha: 'AGRUPADAS', corToken: '--classe-guia' })
    await abrirEdicao(ana, handlerClasses([amigo, companheiro, agrupada]))
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Companheiro')
    expect(screen.getByText('A classe atual fica registrada como desistência.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Agrupadas (Amigo a Guia)')
    expect(screen.getByText('A classe atual continua: o desbravador passa a cursar as duas.')).toBeInTheDocument()
  })

  it('matrícula recusada: os dados ficam salvos e a tela diz que a classe não mudou', async () => {
    servidor.use(
      handlerConfiguracao(configuracao),
      handlerEditarDesbravador(bruno),
      http.post('/api/desbravadores/:id/matriculas', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Reative o desbravador antes de matricular.' }, { status: 422 })),
    )
    await abrirEdicao(bruno)
    await userEvent.selectOptions(screen.getByLabelText('Classe do ano'), 'Amigo')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Dados salvos. A classe não foi alterada: Reative o desbravador antes de matricular.')).toBeInTheDocument()
  })
})

describe('A1 · editar com salvamento parcial', () => {
  it('desbravador inativo não mostra o campo Unidade', async () => {
    const inativo = criarDesbravador({ id: uuid(311), nome: 'Elisa Prado', ativo: false, saidaEm: '2026-08-01' })
    await abrirEdicao(inativo)
    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it('PATCH ok e PUT recusado: a tela fica na edição, diz o que salvou e mostra os avisos', async () => {
    servidor.use(
      handlerEditarDesbravador(ana, [{ codigo: 'AVISO_SEXO_UNIDADE', mensagem: 'A unidade Leões é feminina.' }]),
      http.put('/api/desbravadores/:id/unidade', () =>
        HttpResponse.json({ codigo: 'REGRA', mensagem: 'Reative o desbravador antes de mudar a unidade.' }, { status: 422 }),
      ),
    )
    await abrirEdicao(ana)
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Sem unidade')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Dados salvos. A unidade não foi alterada: Reative o desbravador antes de mudar a unidade.')).toBeInTheDocument()
    expect(screen.getByText('A unidade Leões é feminina.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
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

  it('na edição, o Tipo é editável e a ajuda diz todos os motivos da Diretoria; a linha "Membro da Diretoria" saiu', async () => {
    await abrirEdicao(diretor)
    const tipo = screen.getByLabelText('Tipo')
    expect(tipo).toBeEnabled()
    expect(tipo).toHaveValue('DIRETORIA')
    expect(tipo).toHaveAccessibleDescription('Diretoria pela idade (16 anos até junho) e porque é conselheiro')
    expect(screen.queryByText('Membro da Diretoria')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Classe do ano')).toHaveValue(amigo.id)
  })

  it('a ajuda diz o motivo instrutor', async () => {
    await abrirEdicao(instrutora)
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque é instrutor')
  })

  it('a ajuda diz quando foi o Adm que marcou', async () => {
    await abrirEdicao(marcada)
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque foi marcado pelo Adm')
  })

  it('Líder não mostra motivo de Diretoria', async () => {
    await abrirEdicao(liderConselheira)
    expect(screen.getByLabelText('Tipo')).toHaveValue('LIDER')
    expect(screen.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
  })

  it('trocar Desbravador para Diretoria avisa a saída da unidade, esconde a Unidade, mantém a classe e envia o Tipo', async () => {
    let corpo: unknown
    let moveu = false
    servidor.use(
      handlerEditarDesbravador(ana, [], (recebido) => (corpo = recebido)),
      handlerMoverUnidade(() => (moveu = true)),
    )
    await abrirEdicao(ana)
    expect(screen.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Diretoria')
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Sai da unidade e da chamada; continua cursando a classe.')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Classe do ano')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'DIRETORIA' }))
    await esperarFicha()
    expect(moveu).toBe(false)
  })

  it('trocar Desbravador para Líder também avisa a saída da unidade', async () => {
    await abrirEdicao(ana)
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Líder em formação')
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Sai da unidade e da chamada; continua cursando a classe.')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it.each([
    ['Diretoria', marcada],
    ['Líder', liderConselheira],
  ])('voltar %s a Desbravador avisa que a chamada depende da unidade', async (_rotulo, quem) => {
    await abrirEdicao(quem)
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Desbravador')
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Entra na chamada quando tiver uma unidade: escolha abaixo.')
    expect(screen.getByLabelText('Unidade')).toHaveValue('')
  })

  it('Desbravador sem unidade mostra o aviso junto à Unidade; escolhida a unidade, o aviso sai', async () => {
    const semUnidade = criarDesbravador({ id: uuid(506), nome: 'Ivo Lopes', unidade: null })
    await abrirEdicao(semUnidade)
    const unidade = screen.getByLabelText('Unidade')
    expect(unidade).toHaveAccessibleDescription('Entra na chamada quando tiver uma unidade: escolha abaixo.')
    expect(screen.getByLabelText('Tipo')).not.toHaveAccessibleDescription()
    await userEvent.selectOptions(unidade, aguias.id)
    expect(unidade).not.toHaveAccessibleDescription()
  })

  it('no cadastro novo, "Sem unidade" também avisa que só entra na chamada com unidade', async () => {
    await abrirNovo()
    const unidade = screen.getByLabelText('Unidade')
    await waitFor(() => expect(unidade).toHaveTextContent('Águias'))
    expect(unidade).toHaveAccessibleDescription('Entra na chamada quando tiver uma unidade: escolha abaixo.')
    await userEvent.selectOptions(unidade, aguias.id)
    expect(unidade).not.toHaveAccessibleDescription()
  })

  it('sem nenhuma unidade no clube, o cadastro explica e leva às Unidades', async () => {
    await abrirNovo(handlerUnidades([]))
    const unidade = screen.getByLabelText('Unidade')
    await waitFor(() => expect(unidade).toHaveAccessibleDescription('Entra na chamada quando tiver uma unidade. O clube ainda não tem unidades.'))
    expect(screen.getByRole('link', { name: 'Cadastrar unidades' })).toHaveAttribute('href', '/adm/unidades')
  })

  it('o Tipo só vai no corpo quando muda', async () => {
    let corpo: unknown
    servidor.use(handlerEditarDesbravador(ana, [], (recebido) => (corpo = recebido)))
    await abrirEdicao(ana)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
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
    await abrirEdicao(diretor)
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Desbravador')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(screen.getByLabelText('Tipo')).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription(expect.stringContaining('Tem 16 anos até junho: é Diretoria automaticamente.'))
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })

  it('no cadastro, Diretoria esconde a Unidade, mantém a classe e envia o Tipo', async () => {
    let corpo: unknown
    servidor.use(handlerCriarDesbravador(criarDesbravador(), [], (recebido) => (corpo = recebido)))
    await abrirNovo()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Diretoria')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Classe do ano')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2014-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toMatchObject({ tipo: 'DIRETORIA' }))
    expect(corpo).not.toHaveProperty('unidadeId')
  })

  it('cadastro de quem já cai na regra mostra o aviso de Diretoria sem unidade', async () => {
    servidor.use(
      handlerCriarDesbravador(diretor, [{ codigo: 'AVISO_DIRETORIA_SEM_UNIDADE', mensagem: 'Diretoria não entra em unidade.' }]),
    )
    await abrirNovo(...handlersDaFicha(diretor))
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Davi Rocha')
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '2009-05-20' } })
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino')
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'Águias')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Diretoria não entra em unidade.')).toBeInTheDocument()
    await esperarFicha()
  })

  it('a edição mostra o que a conta ligada instrui e aconselha', async () => {
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
    await abrirEdicao(duplo)
    expect(screen.getByText('Instrui: Amigo, Companheiro')).toBeInTheDocument()
    expect(screen.getByText('Aconselha: Águias')).toBeInTheDocument()
    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Diretoria porque é conselheiro e instrutor')
  })

  it('sem vínculo de instrutor ou conselheiro, a edição não tem as linhas Instrui/Aconselha', async () => {
    await abrirEdicao(ana)
    expect(screen.queryByText(/^Instrui:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Aconselha:/)).not.toBeInTheDocument()
  })
})
