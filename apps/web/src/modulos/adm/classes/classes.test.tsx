import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AreaEspecialidades } from '../../../api/classes-adm'
import type { ModoConexao } from '../../../offline'
import {
  criarDetalhe,
  criarRequisito,
  handlerAjusteDoRequisito,
  handlerCriarEspecialidade,
  handlerDetalheDaClasse,
  handlerEditarClasse,
  handlerErroCriarEspecialidade,
  handlerErroEditarClasse,
  handlerEspecialidades,
} from '../../../testes/handlers/classes-adm'
import { criarClasse, handlerClasses } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmClasses } from './rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
}))

afterEach(() => {
  conexao.modo = 'ONLINE'
})

const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', idade: 10, ordem: 1 })
const companheiro = criarClasse({ id: uuid(102), nome: 'Companheiro', idade: 11, ordem: 2, ativa: false })
const avancada = criarClasse({ id: uuid(103), nome: 'Amigo da Natureza', idade: null, tipo: 'AVANCADA', ordem: 7 })
const agrupada = criarClasse({ id: uuid(104), nome: 'Agrupadas (Amigo a Guia)', idade: 16, trilha: 'AGRUPADAS', ordem: 13 })

const oficialLigado = { ativo: true, campo: false }
const ajustado = criarRequisito({ id: uuid(601), codigo: 'G.2', texto: 'Ler um livro', ativo: false, campo: true, oficial: oficialLigado, ajustado: true })
const normal = criarRequisito({ id: uuid(602), codigo: 'G.1', texto: 'Ter 10 anos', ativo: true, campo: false, oficial: oficialLigado, ajustado: false })

const detalheDeAmigo = criarDetalhe({
  ...amigo,
  totalRequisitos: 2,
  secoes: [
    { id: uuid(401), codigo: 'G', nome: 'Gerais', ordem: 1, requisitos: [normal, ajustado] },
    { id: uuid(402), codigo: 'DE', nome: 'Descoberta espiritual', ordem: 2, requisitos: [criarRequisito({ id: uuid(603), codigo: 'DE.1', texto: 'Ler a Bíblia' })] },
  ],
})

function abrirClasses(rota = '/adm/classes') {
  servidor.use(handlerClasses([amigo, companheiro, avancada, agrupada]), handlerDetalheDaClasse(detalheDeAmigo))
  return renderizarRotas(rotasAdmClasses, rota)
}

const requisito = (codigo: string) => within(screen.getByRole('listitem', { name: `Requisito ${codigo}` }))

/** As seções chegam fechadas: abre a pedida pelo botão do cabeçalho. */
async function abrirSecao(nome: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: nome }))
}

describe('A5 · classes · quatro estados', () => {
  it('carregando', () => {
    abrirClasses()
    expect(screen.getByRole('status', { name: 'Carregando as classes' })).toBeInTheDocument()
  })

  it('vazio', async () => {
    servidor.use(handlerClasses([]))
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    expect(await screen.findByText('Nenhuma classe no catálogo')).toBeInTheDocument()
  })

  it('erro, com nova tentativa', async () => {
    servidor.use(http.get('/api/classes', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Catálogo fora do ar.' }, { status: 500 })))
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    expect(await screen.findByText('Catálogo fora do ar.')).toBeInTheDocument()
    servidor.use(handlerClasses([amigo]), handlerDetalheDaClasse(detalheDeAmigo))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('button', { name: /Amigo/ })).toBeInTheDocument()
  })

  it('sem conexão e sem dado', async () => {
    conexao.modo = 'SEM_CONEXAO'
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('A5 · classes · lista e detalhe', () => {
  it('lista na ordem em três grupos, regulares, avançadas e agrupadas, e abre a primeira; contagens são as reais', async () => {
    abrirClasses()
    const nav = within(await screen.findByRole('navigation', { name: 'Classes' }))
    expect(nav.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Regulares', 'Avançadas', 'Agrupadas'])
    expect(nav.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Amigo10 anos',
      'CompanheiroInativa11 anos',
      'Amigo da Natureza',
      'Agrupadas (Amigo a Guia)16 anos',
    ])
    expect(await screen.findByRole('heading', { name: 'Amigo', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('2 requisitos ativos · 1 ajustado pelo clube')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Gerais' })).getByText('1 requisito · 1 ajustado')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Descoberta espiritual' })).getByText('1 requisito')).toBeInTheDocument()
  })

  it('as seções chegam fechadas e abrem pelo cabeçalho', async () => {
    abrirClasses()
    const cabecalho = await screen.findByRole('button', { name: /Gerais/ })
    expect(cabecalho).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listitem', { name: 'Requisito G.1' })).not.toBeInTheDocument()
    await userEvent.click(cabecalho)
    expect(cabecalho).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listitem', { name: 'Requisito G.1' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Requisito DE.1' })).not.toBeInTheDocument()
  })

  it('?classe= abre a classe pedida e clicar em outra troca o parâmetro', async () => {
    const detalheDeCompanheiro = criarDetalhe({ ...companheiro, secoes: [] })
    abrirClasses(`/adm/classes?classe=${companheiro.id}`)
    servidor.use(http.get('/api/classes/:id', ({ params }) => HttpResponse.json(params['id'] === companheiro.id ? detalheDeCompanheiro : detalheDeAmigo)))
    expect(await screen.findByRole('heading', { name: 'Companheiro', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Companheiro/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^Amigo10/ }))
    expect(await screen.findByRole('heading', { name: 'Amigo', level: 2 })).toBeInTheDocument()
  })

  it('"Quem monta" e "Ativa" gravam na classe', async () => {
    const corpos: unknown[] = []
    abrirClasses()
    servidor.use(handlerEditarClasse((id, corpo) => corpos.push({ id, corpo })))
    const grupo = within(await screen.findByRole('radiogroup', { name: 'Quem monta o cronograma' }))
    expect(grupo.getByRole('radio', { name: 'Adm' })).toBeChecked()
    await userEvent.click(grupo.getByRole('radio', { name: 'Instrutores da classe' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ativa' }))
    await waitFor(() => expect(corpos).toHaveLength(2))
    expect(corpos[0]).toEqual({ id: amigo.id, corpo: { quemMontaCronograma: 'INSTRUTOR' } })
    expect(corpos[1]).toEqual({ id: amigo.id, corpo: { ativa: false } })
  })

  it('desativar com matrícula cursando mostra a mensagem do 422', async () => {
    abrirClasses()
    servidor.use(handlerErroEditarClasse(422, { codigo: 'REGRA', mensagem: 'Há 3 desbravadores cursando esta classe.' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ativa' }))
    expect(await screen.findByText('Há 3 desbravadores cursando esta classe.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ativa' })).toBeChecked()
  })
})

describe('A5 · classes · ajuste de requisito', () => {
  it('só o ajustado se destaca e oferece "Voltar ao oficial"; o igual ao oficial não repete o oficial', async () => {
    abrirClasses()
    await abrirSecao(/Gerais/)
    expect(requisito('G.2').getByText('Ajustado pelo clube')).toBeInTheDocument()
    expect(requisito('G.1').queryByText('Ajustado pelo clube')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Oficial:/)).not.toBeInTheDocument()
    expect(requisito('G.2').getByRole('checkbox', { name: 'Ativo' })).not.toBeChecked()
    expect(requisito('G.2').getByRole('checkbox', { name: 'Campo' })).toBeChecked()
    expect(requisito('G.2').getByRole('button', { name: 'Voltar ao oficial' })).toBeInTheDocument()
    expect(requisito('G.1').queryByRole('button', { name: 'Voltar ao oficial' })).not.toBeInTheDocument()
  })

  it('valor diferente do oficial grava o ajuste; igual ao oficial manda null; voltar ao oficial zera os dois', async () => {
    const chamadas: Array<{ id: string; corpo: unknown }> = []
    abrirClasses()
    servidor.use(handlerAjusteDoRequisito((id, corpo) => chamadas.push({ id, corpo })))
    await abrirSecao(/Gerais/)
    await userEvent.click(requisito('G.1').getByRole('checkbox', { name: 'Campo' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    await userEvent.click(requisito('G.2').getByRole('checkbox', { name: 'Ativo' }))
    await waitFor(() => expect(chamadas).toHaveLength(2))
    await userEvent.click(requisito('G.2').getByRole('button', { name: 'Voltar ao oficial' }))
    await waitFor(() => expect(chamadas).toHaveLength(3))
    expect(chamadas).toEqual([
      { id: normal.id, corpo: { campo: true } },
      { id: ajustado.id, corpo: { ativo: null } },
      { id: ajustado.id, corpo: { ativo: null, campo: null } },
    ])
  })

  it('depois de gravar, a classe é relida', async () => {
    let leituras = 0
    abrirClasses()
    servidor.use(
      http.get('/api/classes/:id', () => {
        leituras += 1
        return HttpResponse.json(detalheDeAmigo)
      }),
      handlerAjusteDoRequisito(),
    )
    await abrirSecao(/Gerais/)
    const antes = leituras
    await userEvent.click(requisito('G.1').getByRole('checkbox', { name: 'Campo' }))
    await waitFor(() => expect(leituras).toBeGreaterThan(antes))
  })
})

const areas: AreaEspecialidades[] = [
  {
    id: uuid(701), codigo: 'AV', nome: 'Aventura', ordem: 1,
    especialidades: [
      { id: uuid(711), nome: 'Acampamento', origem: 'OFICIAL' },
      { id: uuid(712), nome: 'Orientação', origem: 'CLUBE' },
    ],
  },
  { id: uuid(702), codigo: 'AH', nome: 'Artes e habilidades manuais', ordem: 2, especialidades: [{ id: uuid(721), nome: 'Nós e amarras', origem: 'OFICIAL' }] },
]

async function abrirEspecialidades(lista: AreaEspecialidades[] = areas) {
  servidor.use(handlerClasses([amigo]), handlerDetalheDaClasse(detalheDeAmigo), handlerEspecialidades(lista))
  renderizarRotas(rotasAdmClasses, '/adm/classes')
  await userEvent.click(await screen.findByRole('tab', { name: 'Especialidades' }))
}

describe('A5 · especialidades', () => {
  it('carregando', async () => {
    servidor.use(handlerClasses([amigo]), handlerDetalheDaClasse(detalheDeAmigo), http.get('/api/especialidades', () => new Promise(() => {})))
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    await userEvent.click(await screen.findByRole('tab', { name: 'Especialidades' }))
    expect(screen.getByRole('status', { name: 'Carregando as especialidades' })).toBeInTheDocument()
  })

  it('erro com nova tentativa e depois vazio', async () => {
    servidor.use(handlerClasses([amigo]), handlerDetalheDaClasse(detalheDeAmigo))
    servidor.use(http.get('/api/especialidades', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Lista fora do ar.' }, { status: 500 })))
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    await userEvent.click(await screen.findByRole('tab', { name: 'Especialidades' }))
    expect(await screen.findByText('Lista fora do ar.')).toBeInTheDocument()
    servidor.use(handlerEspecialidades([]))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhuma especialidade no catálogo')).toBeInTheDocument()
  })

  it('sem conexão e sem dado', async () => {
    conexao.modo = 'SEM_CONEXAO'
    renderizarRotas(rotasAdmClasses, '/adm/classes')
    await userEvent.click(screen.getByRole('tab', { name: 'Especialidades' }))
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('áreas chegam fechadas com contagem, quantas são do clube e exemplos; abrem pelo cabeçalho', async () => {
    await abrirEspecialidades()
    const aventura = within(await screen.findByRole('region', { name: 'Aventura' }))
    const cabecalho = aventura.getByRole('button', { name: /Aventura/ })
    expect(cabecalho).toHaveAttribute('aria-expanded', 'false')
    expect(aventura.getByText('2 especialidades · 1 do clube')).toBeInTheDocument()
    expect(aventura.getByText('Acampamento, Orientação')).toBeInTheDocument()
    expect(aventura.queryByRole('listitem')).not.toBeInTheDocument()
    await userEvent.click(cabecalho)
    expect(cabecalho).toHaveAttribute('aria-expanded', 'true')
    expect(aventura.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Acampamento', 'OrientaçãoDo clube'])
  })

  it('a busca ignora acento e caixa, abre as áreas com resultado e esconde as outras', async () => {
    await abrirEspecialidades()
    await screen.findByRole('region', { name: 'Aventura' })
    await userEvent.type(screen.getByLabelText('Buscar especialidade'), 'ORIENTACAO')
    const aventura = within(screen.getByRole('region', { name: 'Aventura' }))
    expect(aventura.getByRole('button', { name: /Aventura/ })).toHaveAttribute('aria-expanded', 'true')
    expect(aventura.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['OrientaçãoDo clube'])
    expect(screen.queryByRole('region', { name: 'Artes e habilidades manuais' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Buscar especialidade'))
    await userEvent.type(screen.getByLabelText('Buscar especialidade'), 'zzz')
    expect(screen.getByText('Nenhuma especialidade encontrada')).toBeInTheDocument()
  })

  it('cria a especialidade do clube na área escolhida', async () => {
    let corpo: unknown
    await abrirEspecialidades()
    servidor.use(handlerCriarEspecialidade((c) => (corpo = c), areas))
    await userEvent.click(await screen.findByRole('button', { name: 'Nova especialidade do clube' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Nova especialidade do clube' }))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findAllByRole('alert')).toHaveLength(2)
    expect(painel.getByText('Informe o nome da especialidade')).toBeInTheDocument()
    await userEvent.selectOptions(painel.getByLabelText('Área'), 'Aventura')
    await userEvent.type(painel.getByLabelText('Nome'), 'Fogueira segura')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(corpo).toEqual({ areaId: uuid(701), nome: 'Fogueira segura' })
  })

  it('nome repetido na área (409) mostra a mensagem e mantém o painel aberto', async () => {
    await abrirEspecialidades()
    servidor.use(handlerErroCriarEspecialidade(409, { codigo: 'CONFLITO', mensagem: 'Já existe uma especialidade com esse nome nesta área.' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nova especialidade do clube' }))
    const painel = within(await screen.findByRole('dialog', { name: 'Nova especialidade do clube' }))
    await userEvent.selectOptions(painel.getByLabelText('Área'), 'Aventura')
    await userEvent.type(painel.getByLabelText('Nome'), 'Acampamento')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar' }))
    expect(await painel.findByText('Já existe uma especialidade com esse nome nesta área.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
