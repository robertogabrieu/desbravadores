import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { JsonBodyType } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { GuardaRota } from '../../sessao/GuardaRota'
import type { CategoriaBiblioteca, ChamadaBiblioteca } from '../../testes/handlers/biblioteca'
import { criarCategoriaBiblioteca, criarItemBiblioteca, criarItemFisico, handlerBiblioteca, handlersEscritaBiblioteca } from '../../testes/handlers/biblioteca'
import { criarEmprestimos, handlerEmprestimos } from '../../testes/handlers/emprestimos'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaBiblioteca } from './TelaBiblioteca'
import { escolherOpcao, valorDe } from '../../testes/escolherOpcao'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

vi.mock('./AbaEmprestimos', () => ({
  AbaEmprestimos: ({ filtroInicial }: { filtroInicial?: string }) => <p>{`Aba Empréstimos (${filtroInicial ?? 'sem filtro'})`}</p>,
}))

vi.mock('./DialogoEmprestar', () => ({
  DialogoEmprestar: ({ aberto, item }: { aberto: boolean; item: { nome: string } | null }) => (aberto && item ? <p>{`Emprestando ${item.nome}`}</p> : null),
}))

const abrir = (endereco = '/biblioteca') =>
  renderizarRotas(
    [{ element: <GuardaRota />, children: [{ path: '/biblioteca', element: <TelaBiblioteca /> }, { path: '/inicio', element: <p>Início</p> }] }],
    endereco,
  )

const amigo = criarItemBiblioteca(1, { nome: 'Amigo', descricao: 'Classe regular e avançada' })
const companheiro = criarItemBiblioteca(2, { nome: 'Companheiro' })
const caminho = criarItemBiblioteca(3, { nome: 'Caminho a Cristo', descricao: 'Ellen G. White', capaUrl: 'https://arquivos.test/capa-3.jpg' })
const cadernos = criarCategoriaBiblioteca(1, [amigo, companheiro], { nome: 'Cadernos de Classes' })
const livros = criarCategoriaBiblioteca(2, [caminho], { nome: 'Livros' })
const manuais = criarCategoriaBiblioteca(3, [], { nome: 'Manuais & Documentos' })
const estante: CategoriaBiblioteca[] = [cadernos, livros, manuais]
let chamadas: ChamadaBiblioteca[] = []

function comoAdm(categorias: CategoriaBiblioteca[] = estante) {
  servidor.use(
    ...handlersSessao([criarVinculo('ADM')], undefined, ['biblioteca.gerenciar']),
    handlerBiblioteca(categorias),
    handlerEmprestimos(() => criarEmprestimos([])),
    ...handlersEscritaBiblioteca(chamadas),
  )
}

function comoLeitor(categorias: CategoriaBiblioteca[] = estante) {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]), handlerBiblioteca(categorias))
}

beforeEach(() => {
  estado.modo = 'ONLINE'
  chamadas = []
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface Resposta {
  status: number
  corpo: unknown
}

interface EnvioFeito {
  metodo: string
  url: string
  campo: string
  dados: string
  nomeDoArquivo: string
}

interface EventoDeProgresso {
  lengthComputable: boolean
  loaded: number
  total: number
}

/**
 * O interceptador de XHR do msw não lê o FormData do jsdom: o envio de arquivo usa um XHR falso, como os
 * testes de materiais. `segurar` deixa o envio pendente até `concluir()`, para o teste ver o andamento.
 */
function simularEnvios(respostas: Resposta[], segurar = false) {
  const enviados: EnvioFeito[] = []
  const pendentes: XhrFalso[] = []
  let abortados = 0
  let proxima = 0
  class XhrFalso {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    upload: { onprogress: ((evento: EventoDeProgresso) => void) | null } = { onprogress: null }
    status = 0
    responseText = ''
    private metodo = ''
    private url = ''
    open(metodo: string, url: string) {
      this.metodo = metodo
      this.url = url
    }
    setRequestHeader() {}
    send(formulario: FormData) {
      const campo = formulario.has('arquivo') ? 'arquivo' : 'capa'
      const arquivo = formulario.get(campo)
      const dados = formulario.get('dados')
      enviados.push({ metodo: this.metodo, url: this.url, campo, dados: typeof dados === 'string' ? dados : '', nomeDoArquivo: arquivo instanceof File ? arquivo.name : '' })
      if (segurar) pendentes.push(this)
      else this.responder()
    }
    abort() {
      abortados += 1
      this.onabort?.()
    }
    responder() {
      const resposta = respostas[Math.min(proxima, respostas.length - 1)]
      proxima += 1
      this.status = resposta?.status ?? 0
      this.responseText = JSON.stringify(resposta?.corpo ?? null)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
  return {
    enviados,
    abortados: () => abortados,
    progredir: (porcento: number) => pendentes.at(-1)?.upload.onprogress?.({ lengthComputable: true, loaded: porcento, total: 100 }),
    concluir: () => pendentes.pop()?.responder(),
  }
}

const arquivoDe = (nome: string, tipo: string, bytes?: number): File => {
  const arquivo = new File(['conteudo'], nome, { type: tipo })
  if (bytes !== undefined) Object.defineProperty(arquivo, 'size', { value: bytes })
  return arquivo
}
const pdfDe = (nome = 'livro.pdf', bytes?: number) => arquivoDe(nome, 'application/pdf', bytes)
const capaDe = (nome = 'capa.png', bytes?: number) => arquivoDe(nome, 'image/png', bytes)
const MB = 1024 * 1024

type Usuario = ReturnType<typeof userEvent.setup>

async function abrirMenu(usuario: Usuario, botao: string) {
  await usuario.click(await screen.findByRole('button', { name: botao }))
  return within(screen.getByRole('menu'))
}

const itensDoMenu = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)

async function abrirAdicionar(usuario: Usuario) {
  await usuario.click(await screen.findByRole('button', { name: 'Adicionar à biblioteca' }))
  return within(await screen.findByRole('dialog', { name: 'Adicionar à biblioteca' }))
}

const secao = (nome: string) => within(screen.getByRole('region', { name: nome }))

/** Segura a resposta da API até o teste liberar: dá tempo de mexer na tela com o pedido em voo. */
function segurarResposta(metodo: 'post' | 'patch' | 'delete', caminhoDaRota: string, corpo: JsonBodyType) {
  let liberar = () => {}
  const liberada = new Promise<void>((resolver) => {
    liberar = resolver
  })
  const pedidos: string[] = []
  servidor.use(
    http[metodo](caminhoDaRota, async ({ request }) => {
      pedidos.push(request.method)
      await liberada
      return HttpResponse.json(corpo)
    }),
  )
  return { pedidos, liberar: () => liberar() }
}

describe('Biblioteca — quem só lê', () => {
  beforeEach(() => comoLeitor())

  it('mostra uma seção por categoria, na ordem, com o resumo e a contagem; a categoria vazia some', async () => {
    abrir()
    expect(await screen.findByText('2 categorias · 3 itens')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual(['Cadernos de Classes', 'Livros'])
    expect(secao('Cadernos de Classes').getByText('2 itens')).toBeInTheDocument()
    expect(secao('Livros').getByText('1 item')).toBeInTheDocument()
    expect(screen.queryByText('Manuais & Documentos')).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhum item nesta categoria.')).not.toBeInTheDocument()
  })

  it('o cartão tem nome e descrição; sem descrição não sobra linha vazia', async () => {
    abrir()
    expect(await screen.findByText('Classe regular e avançada')).toBeInTheDocument()
    expect(secao('Livros').getByText('Ellen G. White')).toBeInTheDocument()
    const cartaoSemDescricao = screen.getByRole('link', { name: 'Ler Companheiro' }).closest('li')
    expect(cartaoSemDescricao?.querySelectorAll('p')).toHaveLength(1)
  })

  it('"Ler" abre o PDF numa aba nova e "Baixar" aponta para o download', async () => {
    abrir()
    const ler = await screen.findByRole('link', { name: 'Ler Amigo' })
    expect(ler).toHaveAttribute('href', amigo.urlLer)
    expect(ler).toHaveAttribute('target', '_blank')
    expect(ler.getAttribute('rel')).toContain('noopener')
    expect(ler).toHaveTextContent('Ler')
    const baixar = screen.getByRole('link', { name: 'Baixar Amigo' })
    expect(baixar).toHaveAttribute('href', amigo.urlBaixar)
    expect(baixar).toHaveTextContent('Baixar')
  })

  it('não mostra nenhum controle de alteração', async () => {
    abrir()
    await screen.findByRole('link', { name: 'Ler Amigo' })
    expect(screen.queryByRole('button', { name: /Opções/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar à biblioteca' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova categoria' })).not.toBeInTheDocument()
  })

  it('o voltar leva ao Início', async () => {
    abrir()
    expect(await screen.findByRole('link', { name: 'Voltar para o Início' })).toHaveAttribute('href', '/inicio')
  })

  it('usa a capa quando existe e o nome sobre o bloco liso quando não existe', async () => {
    const { container } = abrir()
    await screen.findByRole('link', { name: 'Ler Amigo' })
    const imagens = container.querySelectorAll('img')
    expect(imagens).toHaveLength(1)
    expect(imagens[0]).toHaveAttribute('src', caminho.capaUrl)
    expect(secao('Cadernos de Classes').getAllByText('Amigo')).toHaveLength(2)
    expect(secao('Livros').getAllByText('Caminho a Cristo')).toHaveLength(1)
  })

  it('sem nenhum item diz que o Adm é quem adiciona, mesmo havendo categorias', async () => {
    comoLeitor([criarCategoriaBiblioteca(1, [], { nome: 'Livros' })])
    abrir()
    expect(await screen.findByText('A biblioteca ainda está vazia.')).toBeInTheDocument()
    expect(screen.getByText('O Adm do clube adiciona aqui os cadernos de classe, livros e manuais.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum item ainda')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum item nesta categoria.')).not.toBeInTheDocument()
  })

  it('sem nenhuma categoria mostra o mesmo vazio', async () => {
    comoLeitor([])
    abrir()
    expect(await screen.findByText('A biblioteca ainda está vazia.')).toBeInTheDocument()
  })
})

describe('Biblioteca — o Adm monta a estante', () => {
  beforeEach(() => comoAdm())

  it('mostra os botões do cabeçalho, o resumo e a categoria vazia com a sua mensagem', async () => {
    abrir()
    expect(await screen.findByRole('button', { name: 'Adicionar à biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova categoria' })).toBeInTheDocument()
    expect(screen.getByText('3 categorias · 3 itens')).toBeInTheDocument()
    expect(secao('Manuais & Documentos').getByText('Nenhum item nesta categoria.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Voltar para o Início' })).not.toBeInTheDocument()
  })

  it('o menu da categoria só oferece o que cabe: sem subir a primeira, sem descer a última, excluir só a vazia', async () => {
    const usuario = userEvent.setup()
    abrir()
    await abrirMenu(usuario, 'Opções da categoria Cadernos de Classes')
    expect(itensDoMenu()).toEqual(['Renomear', 'Mover para baixo'])
    await usuario.keyboard('{Escape}')
    await abrirMenu(usuario, 'Opções da categoria Livros')
    expect(itensDoMenu()).toEqual(['Renomear', 'Mover para cima', 'Mover para baixo'])
    await usuario.keyboard('{Escape}')
    await abrirMenu(usuario, 'Opções da categoria Manuais & Documentos')
    expect(itensDoMenu()).toEqual(['Renomear', 'Mover para cima', 'Excluir'])
  })

  it('o menu do item só oferece o que cabe: sem subir o primeiro, sem descer o último', async () => {
    const usuario = userEvent.setup()
    abrir()
    await abrirMenu(usuario, 'Opções de Amigo')
    expect(itensDoMenu()).toEqual(['Editar', 'Mover para baixo', 'Remover'])
    await usuario.keyboard('{Escape}')
    await abrirMenu(usuario, 'Opções de Companheiro')
    expect(itensDoMenu()).toEqual(['Editar', 'Mover para cima', 'Remover'])
    await usuario.keyboard('{Escape}')
    await abrirMenu(usuario, 'Opções de Caminho a Cristo')
    expect(itensDoMenu()).toEqual(['Editar', 'Remover'])
  })

  it('sem categoria, o cabeçalho fica sem botões e o único caminho é "Nova categoria"', async () => {
    comoAdm([])
    abrir()
    expect(await screen.findByText('Crie uma categoria para começar a montar a biblioteca.')).toBeInTheDocument()
    expect(screen.getByText('Categorias são as prateleiras: Livros, Manuais, Cadernos de Classes…')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((botao) => botao.textContent)).toEqual(['Nova categoria'])
    expect(screen.queryByText(/categorias ·/)).not.toBeInTheDocument()
  })

  it('sem item, só a mensagem — com os nomes das categorias que já estão prontas — e os botões do cabeçalho', async () => {
    comoAdm([criarCategoriaBiblioteca(1, [], { nome: 'Cadernos de Classes' }), criarCategoriaBiblioteca(2, [], { nome: 'Livros' }), criarCategoriaBiblioteca(3, [], { nome: 'Manuais & Documentos' })])
    abrir()
    expect(await screen.findByText('A biblioteca está vazia.')).toBeInTheDocument()
    expect(screen.getByText('Use “Adicionar à biblioteca” para colocar o primeiro PDF. As categorias Cadernos de Classes, Livros e Manuais & Documentos já estão prontas.')).toBeInTheDocument()
    expect(screen.getByText('3 categorias · nenhum item')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar à biblioteca' })).toBeInTheDocument()
    expect(screen.queryByText('Nenhum item nesta categoria.')).not.toBeInTheDocument()
  })

  it('com uma categoria só, o vazio fala no singular', async () => {
    comoAdm([criarCategoriaBiblioteca(1, [], { nome: 'Livros' })])
    abrir()
    expect(await screen.findByText('1 categoria · nenhum item')).toBeInTheDocument()
    expect(screen.getByText(/A categoria Livros já está pronta\./)).toBeInTheDocument()
  })
})

describe('Biblioteca — adicionar', () => {
  beforeEach(() => comoAdm())

  it('escolher o PDF preenche o nome com o arquivo sem ".pdf"', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('livro.pdf'))
    expect(dialogo.getByLabelText('Nome')).toHaveValue('livro')
  })

  it('o nome já digitado não é sobrescrito pelo arquivo', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.type(dialogo.getByLabelText('Nome'), 'Meu nome')
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('livro.pdf'))
    expect(dialogo.getByLabelText('Nome')).toHaveValue('Meu nome')
  })

  it('mostra a ajuda de cada campo e começa pela primeira categoria', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    for (const ajuda of ['Até 50 MB.', 'É o nome que aparece na estante e no arquivo baixado.', 'Opcional. Uma linha abaixo do nome.', 'Opcional. JPG, PNG ou WebP, até 5 MB.']) {
      expect(dialogo.getByText(ajuda)).toBeInTheDocument()
    }
    expect(valorDe(dialogo.getByLabelText('Categoria'))).toBe(cadernos.id)
    expect(dialogo.getByLabelText('PDF')).toHaveAttribute('accept', 'application/pdf')
    expect(dialogo.getByLabelText('Capa')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('recusa na hora o PDF acima de 50 MB e não chama a API', async () => {
    const envio = simularEnvios([{ status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('grande.pdf', 51 * MB))
    expect(dialogo.getByText('O PDF pode ter até 50 MB.')).toBeInTheDocument()
    await usuario.type(dialogo.getByLabelText('Nome'), 'Grande')
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    expect(envio.enviados).toHaveLength(0)
    expect(dialogo.getByText('O PDF pode ter até 50 MB.')).toBeInTheDocument()
  })

  it('aceita o PDF de exatamente 50 MB', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('limite.pdf', 50 * MB))
    expect(dialogo.queryByText('O PDF pode ter até 50 MB.')).not.toBeInTheDocument()
  })

  it('recusa na hora a capa acima de 5 MB', async () => {
    const envio = simularEnvios([{ status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe())
    await usuario.upload(dialogo.getByLabelText('Capa'), capaDe('grande.png', 6 * MB))
    expect(dialogo.getByText('A capa pode ter até 5 MB.')).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    expect(envio.enviados).toHaveLength(0)
  })

  it('pede o PDF e o nome antes de enviar', async () => {
    const envio = simularEnvios([{ status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    expect(dialogo.getByText('Escolha o PDF.')).toBeInTheDocument()
    expect(dialogo.getByText('Dê um nome ao item.')).toBeInTheDocument()
    expect(envio.enviados).toHaveLength(0)
  })

  it('envia o PDF em multipart com nome, descrição e categoria, mostra o andamento e atualiza a estante', async () => {
    const novo = criarItemBiblioteca(8, { nome: 'Vaso de Barro' })
    const envio = simularEnvios([{ status: 201, corpo: novo }], true)
    let leituras = 0
    servidor.use(http.get('/api/biblioteca', () => { leituras += 1; return HttpResponse.json({ categorias: estante }) }))
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.clear(dialogo.getByLabelText('Nome'))
    await usuario.type(dialogo.getByLabelText('Nome'), 'Vaso de Barro')
    await usuario.type(dialogo.getByLabelText('Descrição'), 'Leitura do ano')
    await escolherOpcao(usuario, dialogo.getByLabelText('Categoria'), livros.id)
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))

    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    expect(envio.enviados[0]).toMatchObject({ metodo: 'POST', url: '/api/biblioteca/itens', campo: 'arquivo', nomeDoArquivo: 'vaso.pdf' })
    expect(JSON.parse(envio.enviados[0]?.dados ?? '')).toEqual({ nome: 'Vaso de Barro', descricao: 'Leitura do ano', categoriaId: livros.id })
    expect(dialogo.getByText('Enviando o PDF…')).toBeInTheDocument()
    expect(dialogo.getByRole('button', { name: 'Adicionando' })).toBeDisabled()
    expect(dialogo.getByLabelText('Nome')).toBeDisabled()
    expect(dialogo.getByLabelText('PDF')).toBeDisabled()
    expect(dialogo.getByLabelText('Categoria')).toBeDisabled()

    envio.progredir(62)
    await waitFor(() => expect(dialogo.getByRole('progressbar', { name: 'Envio do PDF' })).toHaveAttribute('aria-valuenow', '62'))
    expect(dialogo.getByText('62%')).toBeInTheDocument()

    envio.concluir()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(leituras).toBe(2))
  })

  it('sem descrição e sem capa, manda a descrição nula e não faz o segundo envio', async () => {
    const envio = simularEnvios([{ status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(envio.enviados).toHaveLength(1)
    expect(JSON.parse(envio.enviados[0]?.dados ?? '')).toEqual({ nome: 'vaso', descricao: null, categoriaId: cadernos.id })
  })

  it('com capa, envia o PDF e depois a capa pelo PUT do item criado', async () => {
    const novo = criarItemBiblioteca(8, { nome: 'Vaso de Barro' })
    const envio = simularEnvios([{ status: 201, corpo: novo }, { status: 200, corpo: novo }], true)
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.upload(dialogo.getByLabelText('Capa'), capaDe('capa-vaso.png'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    expect(dialogo.getByText('Não feche esta janela até terminar. Depois do PDF vai a capa.')).toBeInTheDocument()

    envio.concluir()
    await waitFor(() => expect(envio.enviados).toHaveLength(2))
    expect(envio.enviados[1]).toMatchObject({ metodo: 'PUT', url: `/api/biblioteca/itens/${novo.id}/capa`, campo: 'capa', nomeDoArquivo: 'capa-vaso.png' })
    expect(dialogo.getByText('Enviando a capa…')).toBeInTheDocument()
    expect(dialogo.getByRole('progressbar', { name: 'Envio da capa' })).toBeInTheDocument()

    envio.concluir()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('capa recusada depois do item criado: o diálogo vira "<nome> foi adicionado", e outra capa fecha o assunto', async () => {
    const novo = criarItemBiblioteca(8, { nome: 'Vaso de Barro' })
    const envio = simularEnvios([
      { status: 201, corpo: novo },
      { status: 422, corpo: { codigo: 'REGRA', mensagem: 'A capa precisa ser JPG, PNG ou WebP.' } },
      { status: 200, corpo: novo },
    ])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.upload(dialogo.getByLabelText('Capa'), capaDe('capa-ruim.png'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))

    const aviso = within(await screen.findByRole('dialog', { name: 'Vaso de Barro foi adicionado' }))
    expect(aviso.getByText('O item foi adicionado, mas a capa não: a capa precisa ser JPG, PNG ou WebP.')).toBeInTheDocument()
    expect(aviso.getByText('Escolha outra imagem, ou feche e coloque a capa depois em “Editar”.')).toBeInTheDocument()
    expect(aviso.queryByLabelText('PDF')).not.toBeInTheDocument()
    expect(aviso.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()

    await usuario.upload(aviso.getByLabelText('Capa'), capaDe('capa-boa.png'))
    await usuario.click(aviso.getByRole('button', { name: 'Enviar capa' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(envio.enviados.map((e) => `${e.metodo} ${e.url}`)).toEqual([
      'POST /api/biblioteca/itens',
      `PUT /api/biblioteca/itens/${novo.id}/capa`,
      `PUT /api/biblioteca/itens/${novo.id}/capa`,
    ])
  })

  it('"Fechar" no aviso da capa fecha sem novo envio, e "Enviar capa" sem escolher pede a imagem', async () => {
    const novo = criarItemBiblioteca(8, { nome: 'Vaso de Barro' })
    const envio = simularEnvios([{ status: 201, corpo: novo }, { status: 422, corpo: { codigo: 'REGRA', mensagem: 'A capa precisa ser JPG, PNG ou WebP.' } }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.upload(dialogo.getByLabelText('Capa'), capaDe('capa-ruim.png'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    const aviso = within(await screen.findByRole('dialog', { name: 'Vaso de Barro foi adicionado' }))
    await usuario.click(aviso.getByRole('button', { name: 'Enviar capa' }))
    expect(aviso.getByText('Escolha a imagem da capa.')).toBeInTheDocument()
    expect(envio.enviados).toHaveLength(2)
    await usuario.click(aviso.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(envio.enviados).toHaveLength(2)
  })

  it('a API recusa o PDF: a mensagem fica no diálogo e os campos voltam a aceitar edição', async () => {
    simularEnvios([{ status: 422, corpo: { codigo: 'REGRA', mensagem: 'O arquivo não é um PDF.' } }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('falso.pdf'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('O arquivo não é um PDF.')
    expect(dialogo.getByLabelText('Nome')).toBeEnabled()
    expect(dialogo.getByRole('button', { name: 'Adicionar' })).toBeEnabled()
  })

  describe('o erro vindo da API', () => {
    const recusaDoPdf = { status: 422, corpo: { codigo: 'REGRA', mensagem: 'O arquivo não é um PDF.' } }
    const MENSAGEM = 'O arquivo não é um PDF.'

    async function provocarRecusa(usuario: Usuario, dialogo: Awaited<ReturnType<typeof abrirAdicionar>>) {
      await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('falso.pdf'))
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
    }

    it('some quando a pessoa escolhe outro PDF', async () => {
      simularEnvios([recusaDoPdf])
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      await provocarRecusa(usuario, dialogo)
      await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('certo.pdf'))
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('não convive com o aviso local: ao escolher uma capa grande demais, só resta o aviso da capa', async () => {
      simularEnvios([recusaDoPdf])
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      await provocarRecusa(usuario, dialogo)
      await usuario.upload(dialogo.getByLabelText('Capa'), capaDe('grande.png', 6 * MB))
      expect(dialogo.getByText('A capa pode ter até 5 MB.')).toBeInTheDocument()
      expect(dialogo.queryByText(MENSAGEM)).not.toBeInTheDocument()
    })

    it('some quando a pessoa muda o nome, a descrição, a categoria ou a capa', async () => {
      simularEnvios([recusaDoPdf])
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      await provocarRecusa(usuario, dialogo)
      await usuario.type(dialogo.getByLabelText('Nome'), ' 2')
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await usuario.type(dialogo.getByLabelText('Descrição'), 'x')
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await escolherOpcao(usuario, dialogo.getByLabelText('Categoria'), livros.id)
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await usuario.upload(dialogo.getByLabelText('Capa'), capaDe())
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('some ao tentar enviar de novo, enquanto o novo envio corre', async () => {
      const envio = simularEnvios([recusaDoPdf], true)
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('falso.pdf'))
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      await waitFor(() => expect(envio.enviados).toHaveLength(1))
      envio.concluir()
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      await waitFor(() => expect(envio.enviados).toHaveLength(2))
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('"Cancelar" durante o envio interrompe o envio e fecha o diálogo', async () => {
    const envio = simularEnvios([{ status: 201, corpo: criarItemBiblioteca(8) }], true)
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(envio.abortados()).toBe(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('sessão vencida (401): renova a sessão e repete o envio uma vez', async () => {
    const envio = simularEnvios([{ status: 401, corpo: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada' } }, { status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(envio.enviados.map((e) => `${e.metodo} ${e.url}`)).toEqual(['POST /api/biblioteca/itens', 'POST /api/biblioteca/itens'])
  })

  it('sem conexão no envio: avisa e deixa tentar de novo', async () => {
    simularEnvios([{ status: 0, corpo: null }, { status: 201, corpo: criarItemBiblioteca(8) }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Sem conexão. Confira a internet e tente de novo.')
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('"Cancelar" durante o envio da capa interrompe sem abrir o aviso de capa recusada', async () => {
    const novo = criarItemBiblioteca(8, { nome: 'Vaso de Barro' })
    const envio = simularEnvios([{ status: 201, corpo: novo }], true)
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirAdicionar(usuario)
    await usuario.upload(dialogo.getByLabelText('PDF'), pdfDe('vaso.pdf'))
    await usuario.upload(dialogo.getByLabelText('Capa'), capaDe())
    await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    envio.concluir()
    await waitFor(() => expect(envio.enviados).toHaveLength(2))
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(envio.abortados()).toBe(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Biblioteca — editar', () => {
  beforeEach(() => comoAdm())

  async function abrirEditar(usuario: Usuario, nome: string) {
    const menu = await abrirMenu(usuario, `Opções de ${nome}`)
    await usuario.click(menu.getByRole('menuitem', { name: 'Editar' }))
    return within(await screen.findByRole('dialog', { name: `Editar ${nome}` }))
  }

  it('mostra os dados do item, a ajuda da categoria e o aviso sobre trocar o PDF', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    expect(dialogo.getByLabelText('Nome')).toHaveValue('Amigo')
    expect(dialogo.getByLabelText('Descrição')).toHaveValue('Classe regular e avançada')
    expect(valorDe(dialogo.getByLabelText('Categoria'))).toBe(cadernos.id)
    expect(dialogo.getByText('Ao mudar de categoria, o item vai para o fim dela.')).toBeInTheDocument()
    expect(dialogo.getByText('Para trocar o PDF, remova o item e adicione de novo.')).toBeInTheDocument()
    expect(dialogo.getByRole('button', { name: 'Trocar capa' })).toBeInTheDocument()
    expect(dialogo.queryByRole('button', { name: 'Tirar capa' })).not.toBeInTheDocument()
  })

  it('muda nome e categoria e grava só o que mudou pelo PATCH', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    await usuario.clear(dialogo.getByLabelText('Nome'))
    await usuario.type(dialogo.getByLabelText('Nome'), 'Amigo 2')
    await escolherOpcao(usuario, dialogo.getByLabelText('Categoria'), livros.id)
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toEqual([{ metodo: 'PATCH', caminho: `/api/biblioteca/itens/${amigo.id}`, corpo: { nome: 'Amigo 2', categoriaId: livros.id } }])
  })

  it('apagar a descrição manda nulo', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    await usuario.clear(dialogo.getByLabelText('Descrição'))
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.corpo).toEqual({ descricao: null })
  })

  it('sem mudança, "Salvar" só fecha', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
  })

  it('nome vazio não grava', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    await usuario.clear(dialogo.getByLabelText('Nome'))
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    expect(dialogo.getByText('Dê um nome ao item.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
  })

  it('"Tirar capa" chama o DELETE da capa', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Caminho a Cristo')
    await usuario.click(dialogo.getByRole('button', { name: 'Tirar capa' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'DELETE', caminho: `/api/biblioteca/itens/${caminho.id}/capa`, corpo: null }]))
  })

  it('"Trocar capa" envia a imagem escolhida pelo PUT e recusa a de mais de 5 MB', async () => {
    const envio = simularEnvios([{ status: 200, corpo: caminho }])
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Caminho a Cristo')
    await usuario.upload(dialogo.getByLabelText('Nova capa'), capaDe('grande.png', 6 * MB))
    expect(dialogo.getByText('A capa pode ter até 5 MB.')).toBeInTheDocument()
    expect(envio.enviados).toHaveLength(0)
    await usuario.upload(dialogo.getByLabelText('Nova capa'), capaDe('nova.png'))
    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    expect(envio.enviados[0]).toMatchObject({ metodo: 'PUT', url: `/api/biblioteca/itens/${caminho.id}/capa`, campo: 'capa', nomeDoArquivo: 'nova.png' })
    await waitFor(() => expect(dialogo.queryByText('A capa pode ter até 5 MB.')).not.toBeInTheDocument())
  })

  it('a API recusa a edição: a mensagem aparece e o diálogo continua aberto', async () => {
    servidor.use(http.patch('/api/biblioteca/itens/:id', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Categoria não encontrada.' }, { status: 404 })))
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Amigo')
    await usuario.type(dialogo.getByLabelText('Nome'), ' novo')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Categoria não encontrada.')
  })

  describe('com o "Salvar" em voo', () => {
    type DialogoDoItem = Awaited<ReturnType<typeof abrirEditar>>
    const mexerNaTela = [
      { mexida: 'digitar no nome', mexer: (usuario: Usuario, dialogo: DialogoDoItem) => usuario.type(dialogo.getByLabelText('Nome'), '!') },
      { mexida: 'digitar na descrição', mexer: (usuario: Usuario, dialogo: DialogoDoItem) => usuario.type(dialogo.getByLabelText('Descrição'), '!') },
      { mexida: 'mudar a categoria', mexer: (usuario: Usuario, dialogo: DialogoDoItem) => escolherOpcao(usuario, dialogo.getByLabelText('Categoria'), cadernos.id) },
      { mexida: 'tirar a capa', mexer: (usuario: Usuario, dialogo: DialogoDoItem) => usuario.click(dialogo.getByRole('button', { name: 'Tirar capa' })) },
      { mexida: 'trocar a capa', mexer: (usuario: Usuario, dialogo: DialogoDoItem) => usuario.upload(dialogo.getByLabelText('Nova capa'), capaDe('nova.png')) },
    ]

    it.each(mexerNaTela)('$mexida não impede o diálogo de fechar quando a API responde, e o pedido não se repete', async ({ mexer }) => {
      const gravacao = segurarResposta('patch', '/api/biblioteca/itens/:id', criarItemBiblioteca(3, { id: caminho.id }))
      simularEnvios([{ status: 200, corpo: caminho }])
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirEditar(usuario, 'Caminho a Cristo')
      await usuario.type(dialogo.getByLabelText('Nome'), ' 2')
      await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(gravacao.pedidos).toHaveLength(1))
      await mexer(usuario, dialogo)
      expect(dialogo.getByRole('button', { name: 'Salvar' })).toBeDisabled()
      gravacao.liberar()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(gravacao.pedidos).toHaveLength(1)
    })
  })

  it('"Tirar capa" não manda um segundo DELETE enquanto o primeiro corre, mesmo que a pessoa mexa num campo', async () => {
    const retirada = segurarResposta('delete', '/api/biblioteca/itens/:id/capa', criarItemBiblioteca(3, { id: caminho.id, capaUrl: null }))
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirEditar(usuario, 'Caminho a Cristo')
    await usuario.click(dialogo.getByRole('button', { name: 'Tirar capa' }))
    await waitFor(() => expect(retirada.pedidos).toHaveLength(1))
    await usuario.type(dialogo.getByLabelText('Nome'), '!')
    expect(dialogo.getByRole('button', { name: 'Tirar capa' })).toBeDisabled()
    await usuario.click(dialogo.getByRole('button', { name: 'Tirar capa' }))
    retirada.liberar()
    await waitFor(() => expect(dialogo.getByRole('button', { name: 'Tirar capa' })).toBeEnabled())
    expect(retirada.pedidos).toHaveLength(1)
  })

  describe('o erro vindo da API', () => {
    const MENSAGEM = 'Categoria não encontrada.'

    async function provocarRecusa(usuario: Usuario, dialogo: Awaited<ReturnType<typeof abrirEditar>>) {
      servidor.use(http.patch('/api/biblioteca/itens/:id', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: MENSAGEM }, { status: 404 })))
      await usuario.type(dialogo.getByLabelText('Nome'), ' novo')
      await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
    }

    it('some quando a pessoa muda o nome, a descrição ou a categoria', async () => {
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirEditar(usuario, 'Amigo')
      await provocarRecusa(usuario, dialogo)
      await usuario.type(dialogo.getByLabelText('Nome'), '!')
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

      await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await usuario.type(dialogo.getByLabelText('Descrição'), '!')
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

      await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
      expect(await dialogo.findByRole('alert')).toHaveTextContent(MENSAGEM)
      await escolherOpcao(usuario, dialogo.getByLabelText('Categoria'), livros.id)
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('não convive com o aviso local: ao escolher uma capa grande demais, só resta o aviso da capa', async () => {
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirEditar(usuario, 'Amigo')
      await provocarRecusa(usuario, dialogo)
      await usuario.upload(dialogo.getByLabelText('Nova capa'), capaDe('grande.png', 6 * MB))
      expect(dialogo.getAllByRole('alert').map((aviso) => aviso.textContent)).toEqual(['A capa pode ter até 5 MB.'])
    })

    it('some quando a pessoa tira a capa', async () => {
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirEditar(usuario, 'Caminho a Cristo')
      await provocarRecusa(usuario, dialogo)
      await usuario.click(dialogo.getByRole('button', { name: 'Tirar capa' }))
      expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})

describe('Biblioteca — mover', () => {
  beforeEach(() => comoAdm())

  it('"Mover para baixo" no item chama o POST com a direção', async () => {
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções de Amigo')
    await usuario.click(menu.getByRole('menuitem', { name: 'Mover para baixo' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/biblioteca/itens/${amigo.id}/mover`, corpo: { direcao: 'abaixo' } }]))
  })

  it('"Mover para cima" na categoria chama o POST da categoria', async () => {
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções da categoria Livros')
    await usuario.click(menu.getByRole('menuitem', { name: 'Mover para cima' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/biblioteca/categorias/${livros.id}/mover`, corpo: { direcao: 'acima' } }]))
  })

  it('mover que a API recusa avisa na tela e relê a estante', async () => {
    let leituras = 0
    servidor.use(
      http.get('/api/biblioteca', () => { leituras += 1; return HttpResponse.json({ categorias: estante }) }),
      http.post('/api/biblioteca/itens/:id/mover', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Este item já não existe.' }, { status: 404 })),
    )
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções de Amigo')
    await usuario.click(menu.getByRole('menuitem', { name: 'Mover para baixo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este item já não existe.')
    await waitFor(() => expect(leituras).toBe(2))
  })
})

describe('Biblioteca — remover item', () => {
  beforeEach(() => comoAdm())

  async function abrirRemover(usuario: Usuario) {
    const menu = await abrirMenu(usuario, 'Opções de Amigo')
    await usuario.click(menu.getByRole('menuitem', { name: 'Remover' }))
    return within(await screen.findByRole('dialog', { name: 'Remover “Amigo” da biblioteca?' }))
  }

  it('pede confirmação com o texto do modelo e o botão vermelho; cancelar não remove', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirRemover(usuario)
    expect(dialogo.getByText('O arquivo é apagado e não dá para desfazer.')).toBeInTheDocument()
    expect(dialogo.getByRole('button', { name: 'Remover' }).className).toContain('bg-perigo')
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
  })

  it('confirmar chama o DELETE e fecha', async () => {
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirRemover(usuario)
    await usuario.click(dialogo.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'DELETE', caminho: `/api/biblioteca/itens/${amigo.id}`, corpo: null }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('falha da API fica no diálogo, que continua aberto', async () => {
    servidor.use(http.delete('/api/biblioteca/itens/:id', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Este item já não existe.' }, { status: 404 })))
    const usuario = userEvent.setup()
    abrir()
    const dialogo = await abrirRemover(usuario)
    await usuario.click(dialogo.getByRole('button', { name: 'Remover' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Este item já não existe.')
  })
})

describe('Biblioteca — categorias', () => {
  beforeEach(() => comoAdm())

  it('"Nova categoria" cria pelo POST e avisa a mensagem da API quando o nome já existe', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    expect(dialogo.getByText('Ela entra no fim da estante; mude a posição pelo menu dela.')).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    expect(dialogo.getByText('Dê um nome à categoria.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(0)

    servidor.use(http.post('/api/biblioteca/categorias', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Já existe uma categoria com esse nome.' }, { status: 422 })))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), 'Livros')
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Já existe uma categoria com esse nome.')
  })

  it('o erro da API some quando a pessoa muda o nome, e não convive com o aviso de nome vazio', async () => {
    servidor.use(http.post('/api/biblioteca/categorias', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Já existe uma categoria com esse nome.' }, { status: 422 })))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), 'Livros')
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Já existe uma categoria com esse nome.')
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), ' 2')
    expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()

    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Já existe uma categoria com esse nome.')
    await usuario.clear(dialogo.getByLabelText('Nome da categoria'))
    expect(dialogo.queryByText('Já existe uma categoria com esse nome.')).not.toBeInTheDocument()
    expect(dialogo.getByText('Dê um nome à categoria.')).toBeInTheDocument()
  })

  it('"Renomear": o erro da API também some quando a pessoa muda o nome', async () => {
    servidor.use(http.patch('/api/biblioteca/categorias/:id', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Já existe uma categoria com esse nome.' }, { status: 422 })))
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções da categoria Livros')
    await usuario.click(menu.getByRole('menuitem', { name: 'Renomear' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Renomear categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), ' 2')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Já existe uma categoria com esse nome.')
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), '!')
    expect(dialogo.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('"Nova categoria": digitar com o pedido em voo não impede o diálogo de fechar, e o pedido não se repete', async () => {
    const gravacao = segurarResposta('post', '/api/biblioteca/categorias', criarCategoriaBiblioteca(9, [], { nome: 'Comunicados' }))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), 'Comunicados')
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(gravacao.pedidos).toHaveLength(1))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), '!')
    expect(dialogo.getByRole('button', { name: 'Criar' })).toBeDisabled()
    gravacao.liberar()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(gravacao.pedidos).toHaveLength(1)
  })

  it('"Renomear": digitar com o pedido em voo não impede o diálogo de fechar, e o pedido não se repete', async () => {
    const gravacao = segurarResposta('patch', '/api/biblioteca/categorias/:id', criarCategoriaBiblioteca(2, [], { nome: 'Leituras' }))
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções da categoria Livros')
    await usuario.click(menu.getByRole('menuitem', { name: 'Renomear' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Renomear categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), ' 2')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(gravacao.pedidos).toHaveLength(1))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), '!')
    expect(dialogo.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    gravacao.liberar()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(gravacao.pedidos).toHaveLength(1)
  })

  it('"Nova categoria" grava o nome e fecha', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), 'Comunicados')
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'POST', caminho: '/api/biblioteca/categorias', corpo: { nome: 'Comunicados' } }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('o vazio sem categoria também cria a primeira', async () => {
    comoAdm([])
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    await usuario.type(dialogo.getByLabelText('Nome da categoria'), 'Livros')
    await usuario.click(dialogo.getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
  })

  it('"Renomear" abre com o nome atual e grava pelo PATCH', async () => {
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções da categoria Livros')
    await usuario.click(menu.getByRole('menuitem', { name: 'Renomear' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Renomear categoria' }))
    const campo = dialogo.getByLabelText('Nome da categoria')
    expect(campo).toHaveValue('Livros')
    await usuario.clear(campo)
    await usuario.type(campo, 'Leituras')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'PATCH', caminho: `/api/biblioteca/categorias/${livros.id}`, corpo: { nome: 'Leituras' } }]))
  })

  it('"Excluir" na categoria vazia pede confirmação e chama o DELETE', async () => {
    const usuario = userEvent.setup()
    abrir()
    const menu = await abrirMenu(usuario, 'Opções da categoria Manuais & Documentos')
    await usuario.click(menu.getByRole('menuitem', { name: 'Excluir' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Excluir a categoria “Manuais & Documentos”?' }))
    expect(dialogo.getByRole('button', { name: 'Excluir' }).className).toContain('bg-perigo')
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(chamadas).toHaveLength(0)

    const outroMenu = await abrirMenu(usuario, 'Opções da categoria Manuais & Documentos')
    await usuario.click(outroMenu.getByRole('menuitem', { name: 'Excluir' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'DELETE', caminho: `/api/biblioteca/categorias/${manuais.id}`, corpo: null }]))
  })
})

describe('Biblioteca — carregando, erro e sem conexão', () => {
  it('mostra o carregando e depois a estante', async () => {
    comoLeitor()
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando a biblioteca' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Ler Amigo' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Carregando a biblioteca' })).not.toBeInTheDocument()
  })

  it('mostra a mensagem da API e deixa tentar de novo', async () => {
    let falhar = true
    servidor.use(
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
      http.get('/api/biblioteca', () =>
        falhar ? HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Não deu para abrir a biblioteca.' }, { status: 500 }) : HttpResponse.json({ categorias: estante }),
      ),
    )
    const usuario = userEvent.setup()
    abrir()
    expect(await screen.findByText('Não deu para abrir a biblioteca.')).toBeInTheDocument()
    falhar = false
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: 'Ler Amigo' })).toBeInTheDocument()
  })

  it('com o modo global preso em sem conexão, mas a rede ok, ainda consulta e mostra a estante', async () => {
    estado.modo = 'SEM_CONEXAO'
    let consultas = 0
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]), http.get('/api/biblioteca', () => { consultas += 1; return HttpResponse.json({ categorias: estante }) }))
    abrir()
    expect(await screen.findByRole('link', { name: 'Ler Amigo' })).toBeInTheDocument()
    expect(screen.queryByText('Disponível quando houver internet')).not.toBeInTheDocument()
    expect(consultas).toBeGreaterThan(0)
  })

  it('se a própria consulta falha por rede, diz que precisa de internet', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]), http.get('/api/biblioteca', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument()
  })

  it('as URLs assinadas vencem em 10 min: relê aos 8, ao voltar para a aba e o cache sai da memória com a tela', async () => {
    comoLeitor()
    const { unmount, clienteConsultas } = abrir()
    await screen.findByRole('link', { name: 'Ler Amigo' })
    const consulta = clienteConsultas.getQueryCache().find({ queryKey: ['biblioteca'] })
    expect(consulta?.observers[0]?.options).toMatchObject({ staleTime: 5 * 60_000, refetchInterval: 8 * 60_000, refetchOnWindowFocus: true, gcTime: 0 })
    unmount()
    await waitFor(() => expect(clienteConsultas.getQueryCache().findAll({ queryKey: ['biblioteca'] })).toHaveLength(0))
  })
})

describe('Biblioteca — livros físicos', () => {
  const pesquisador = criarItemFisico(1, { capaUrl: 'https://arquivos.test/capa-f1.jpg', nome: 'Pesquisador', total: 2, disponiveis: 1 })
  const guia = criarItemFisico(2, { capaUrl: 'https://arquivos.test/capa-f2.jpg', nome: 'Guia', total: 2, disponiveis: 0 })
  const orfao = criarItemFisico(3, { capaUrl: 'https://arquivos.test/capa-f3.jpg', nome: 'Sem cópias', total: 0, disponiveis: 0 })
  const unico = criarItemFisico(4, { capaUrl: 'https://arquivos.test/capa-f4.jpg', nome: 'Exemplar único', total: 1, disponiveis: 1 })
  const cadernosMistos = criarCategoriaBiblioteca(1, [amigo, pesquisador, guia, orfao], { nome: 'Cadernos de Classes' })
  const soFisicos = criarCategoriaBiblioteca(4, [unico], { nome: 'Só físicos' })
  const mista: CategoriaBiblioteca[] = [cadernosMistos, livros, manuais, soFisicos]
  const COM_EMPRESTAR = ['biblioteca.emprestar']

  function comoAdmDaEstante(categorias: CategoriaBiblioteca[] = mista, permissoes = ['biblioteca.gerenciar', ...COM_EMPRESTAR]) {
    servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, permissoes), handlerBiblioteca(categorias), handlerEmprestimos(() => criarEmprestimos([])), ...handlersEscritaBiblioteca(chamadas))
  }

  function comoConselheiro(categorias: CategoriaBiblioteca[] = mista, permissoes = COM_EMPRESTAR) {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')], undefined, permissoes), handlerBiblioteca(categorias))
  }

  const cartaoDe = (nome: string) => within(screen.getByText(nome).closest('li') as HTMLElement)

  describe('abas do Adm', () => {
    it('mostra Livros digitais, Livros físicos e Empréstimos, abrindo nos digitais', async () => {
      comoAdmDaEstante()
      abrir()
      const abas = within(await screen.findByRole('tablist', { name: 'Tipo de livro' }))
      expect(abas.getAllByRole('tab').map((aba) => aba.textContent)).toEqual(['Livros digitais', 'Livros físicos', 'Empréstimos'])
      expect(abas.getByRole('tab', { name: 'Livros digitais' })).toHaveAttribute('aria-selected', 'true')
      expect(await screen.findByRole('link', { name: 'Ler Amigo' })).toBeInTheDocument()
      expect(screen.queryByText('Pesquisador')).not.toBeInTheDocument()
    })

    it('Livros físicos mostra só os físicos, sem Ler nem Baixar, e o Adm vê a categoria sem físico', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir()
      await usuario.click(await screen.findByRole('tab', { name: 'Livros físicos' }))
      expect(await screen.findByText('Pesquisador')).toBeInTheDocument()
      expect(screen.queryByText('Amigo')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Ler / })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Baixar / })).not.toBeInTheDocument()
      expect(secao('Livros').getByText('Nenhum item nesta categoria.')).toBeInTheDocument()
      expect(secao('Cadernos de Classes').getByText('3 livros · 4 exemplares')).toBeInTheDocument()
    })

    it('o resumo da aba Físicos conta livros e exemplares disponíveis', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir()
      await usuario.click(await screen.findByRole('tab', { name: 'Livros físicos' }))
      expect(await screen.findByText('4 livros físicos · 2 exemplares disponíveis')).toBeInTheDocument()
    })

    it('o resumo usa o singular com 1 livro e 1 exemplar', async () => {
      comoAdmDaEstante([criarCategoriaBiblioteca(1, [unico], { nome: 'Cadernos de Classes' })])
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByText('1 livro físico · 1 exemplar disponível')).toBeInTheDocument()
    })

    it('Empréstimos abre a aba com o filtro da URL e some com os botões de adicionar', async () => {
      comoAdmDaEstante()
      abrir('/biblioteca?aba=emprestimos&situacao=atrasados')
      expect(await screen.findByText('Aba Empréstimos (atrasados)')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Empréstimos' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('button', { name: 'Adicionar à biblioteca' })).not.toBeInTheDocument()
    })

    it('Empréstimos sem filtro na URL abre sem filtro; filtro desconhecido é ignorado; trocar de aba volta e vai', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=emprestimos&situacao=qualquer')
      expect(await screen.findByText('Aba Empréstimos (sem filtro)')).toBeInTheDocument()
      await usuario.click(screen.getByRole('tab', { name: 'Livros físicos' }))
      expect(await screen.findByText('Pesquisador')).toBeInTheDocument()
      await usuario.click(screen.getByRole('tab', { name: 'Empréstimos' }))
      expect(await screen.findByText('Aba Empréstimos (sem filtro)')).toBeInTheDocument()
    })
  })

  describe('quem não gerencia', () => {
    it('tem o alternador Digitais | Físicos, sem Empréstimos, e esconde a categoria sem item do tipo', async () => {
      comoConselheiro()
      const usuario = userEvent.setup()
      abrir()
      const abas = within(await screen.findByRole('tablist', { name: 'Tipo de livro' }))
      expect(abas.getAllByRole('tab').map((aba) => aba.textContent)).toEqual(['Digitais', 'Físicos'])
      await screen.findByRole('link', { name: 'Ler Amigo' })
      expect(screen.queryByRole('region', { name: 'Só físicos' })).not.toBeInTheDocument()
      await usuario.click(abas.getByRole('tab', { name: 'Físicos' }))
      expect(await screen.findByText('Pesquisador')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Só físicos' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Livros' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Manuais & Documentos' })).not.toBeInTheDocument()
    })

    it('?aba=emprestimos não abre a aba Empréstimos: cai nos digitais', async () => {
      comoConselheiro()
      abrir('/biblioteca?aba=emprestimos')
      expect(await screen.findByRole('link', { name: 'Ler Amigo' })).toBeInTheDocument()
      expect(screen.queryByText(/Aba Empréstimos/)).not.toBeInTheDocument()
    })

    it('busca por nome na aba Físicos, sem acento nem maiúscula, e limpa quando nada combina', async () => {
      comoConselheiro()
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      const busca = await screen.findByRole('searchbox', { name: 'Buscar livro' })
      await usuario.type(busca, 'EXEMPLAR unico')
      expect(screen.getByText('Exemplar único')).toBeInTheDocument()
      expect(screen.queryByText('Pesquisador')).not.toBeInTheDocument()
      await usuario.clear(busca)
      await usuario.type(busca, 'zzz')
      expect(screen.getByText('Nenhum livro com esse nome.')).toBeInTheDocument()
      await usuario.click(screen.getByRole('button', { name: 'Limpar a busca' }))
      expect(screen.getByText('Pesquisador')).toBeInTheDocument()
      expect(busca).toHaveValue('')
    })

    it('não há busca nos digitais', async () => {
      comoConselheiro()
      abrir()
      await screen.findByRole('link', { name: 'Ler Amigo' })
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })

    it('sem livro físico: "O Adm ainda não cadastrou livros físicos."', async () => {
      comoConselheiro(estante)
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByText('Nenhum livro físico ainda.')).toBeInTheDocument()
      expect(screen.getByText('O Adm ainda não cadastrou livros físicos.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Adicionar|Cadastre/ })).not.toBeInTheDocument()
    })

    it('só com livros físicos, os digitais dizem "Nenhum livro digital ainda."', async () => {
      comoConselheiro([soFisicos])
      abrir()
      expect(await screen.findByText('Nenhum livro digital ainda.')).toBeInTheDocument()
    })
  })

  describe('o cartão do livro físico', () => {
    beforeEach(() => comoConselheiro())

    it('mostra a pílula de disponibilidade e Emprestar e Exemplares, sem Ler nem Baixar', async () => {
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Pesquisador')
      const cartao = cartaoDe('Pesquisador')
      expect(cartao.getByText('1 de 2 disponíveis')).toBeInTheDocument()
      expect(cartao.getByRole('button', { name: 'Emprestar Pesquisador' })).toBeEnabled()
      expect(cartao.getByRole('link', { name: 'Exemplares de Pesquisador' })).toHaveAttribute('href', `/biblioteca/livros/${pesquisador.id}`)
      expect(cartao.queryByRole('link', { name: /Ler|Baixar/ })).not.toBeInTheDocument()
      expect(cartaoDe('Exemplar único').getByText('1 de 1 disponível')).toBeInTheDocument()
    })

    it('0 disponíveis: pílula "Todos emprestados", Emprestar desligado e o motivo escrito', async () => {
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Guia')
      const cartao = cartaoDe('Guia')
      expect(cartao.getByText('Todos emprestados')).toBeInTheDocument()
      const emprestar = cartao.getByRole('button', { name: 'Emprestar Guia' })
      expect(emprestar).toBeDisabled()
      expect(emprestar).toHaveAccessibleDescription('Todos os exemplares estão emprestados.')
      expect(cartao.getByRole('link', { name: 'Exemplares de Guia' })).toBeInTheDocument()
    })

    it('sem exemplares: "Sem exemplares", Emprestar desligado e o motivo escrito', async () => {
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Sem cópias')
      const cartao = cartaoDe('Sem cópias')
      expect(cartao.getByText('Sem exemplares')).toBeInTheDocument()
      expect(cartao.getByRole('button', { name: 'Emprestar Sem cópias' })).toBeDisabled()
      expect(cartao.getByRole('button', { name: 'Emprestar Sem cópias' })).toHaveAccessibleDescription('Este livro não tem exemplares.')
    })

    it('Emprestar abre o diálogo de empréstimo com o livro do cartão', async () => {
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      await usuario.click(await screen.findByRole('button', { name: 'Emprestar Pesquisador' }))
      expect(screen.getByText('Emprestando Pesquisador')).toBeInTheDocument()
    })

    it('sem conexão: Emprestar desligado dizendo que precisa de internet', async () => {
      estado.modo = 'SEM_CONEXAO'
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Pesquisador')
      const emprestar = cartaoDe('Pesquisador').getByRole('button', { name: 'Emprestar Pesquisador' })
      expect(emprestar).toBeDisabled()
      expect(emprestar).toHaveAccessibleDescription('Emprestar precisa de internet.')
    })

    it('sem a permissão de emprestar: só a pílula, sem Emprestar nem Exemplares', async () => {
      comoConselheiro(mista, [])
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Pesquisador')
      const cartao = cartaoDe('Pesquisador')
      expect(cartao.getByText('1 de 2 disponíveis')).toBeInTheDocument()
      expect(cartao.queryByRole('button', { name: /Emprestar/ })).not.toBeInTheDocument()
      expect(cartao.queryByRole('link', { name: /Exemplares/ })).not.toBeInTheDocument()
      expect(cartao.queryByRole('button', { name: /Opções/ })).not.toBeInTheDocument()
    })
  })

  describe('o cartão do Adm', () => {
    it('Exemplares leva ao detalhe do Adm e Opções traz Editar, Mover e Remover', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Guia')
      const cartao = cartaoDe('Guia')
      expect(cartao.getByRole('link', { name: 'Exemplares de Guia' })).toHaveAttribute('href', `/adm/biblioteca/livros/${guia.id}`)
      await usuario.click(cartao.getByRole('button', { name: 'Opções de Guia' }))
      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Mover para cima' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Remover' })).toBeInTheDocument()
    })

    it('Editar abre o diálogo sem falar de PDF', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      await screen.findByText('Guia')
      await usuario.click(cartaoDe('Guia').getByRole('button', { name: 'Opções de Guia' }))
      await usuario.click(screen.getByRole('menuitem', { name: 'Editar' }))
      const dialogo = within(await screen.findByRole('dialog'))
      expect(dialogo.getByLabelText('Nome')).toHaveValue('Guia')
      expect(dialogo.queryByText(/PDF/)).not.toBeInTheDocument()
    })
  })

  describe('vazios do Adm', () => {
    it('sem livro físico: "Cadastre o primeiro livro físico" com o botão que abre o diálogo já no tipo físico', async () => {
      comoAdmDaEstante(estante)
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByText('Cadastre o primeiro livro físico')).toBeInTheDocument()
      await usuario.click(screen.getByRole('button', { name: 'Adicionar livro físico' }))
      const dialogo = within(await screen.findByRole('dialog', { name: 'Adicionar à biblioteca' }))
      expect(dialogo.getByRole('radio', { name: 'Livro físico' })).toBeChecked()
    })

    it('o vazio dos digitais continua falando do PDF', async () => {
      comoAdmDaEstante([criarCategoriaBiblioteca(1, [], { nome: 'Cadernos de Classes' })])
      abrir()
      expect(await screen.findByText(/para colocar o primeiro PDF/)).toBeInTheDocument()
    })

    it('"Adicionar à biblioteca" na aba Físicos já abre no tipo físico', async () => {
      comoAdmDaEstante()
      const usuario = userEvent.setup()
      abrir('/biblioteca?aba=fisicos')
      await usuario.click(await screen.findByRole('button', { name: 'Adicionar à biblioteca' }))
      expect(within(await screen.findByRole('dialog')).getByRole('radio', { name: 'Livro físico' })).toBeChecked()
    })
  })

  describe('adicionar um livro físico', () => {
    async function abrirNoTipoFisico(usuario: ReturnType<typeof userEvent.setup>) {
      comoAdmDaEstante(estante)
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      await usuario.click(dialogo.getByRole('radio', { name: 'Livro físico' }))
      return dialogo
    }

    it('o tipo vem no topo, digital é o padrão e físico troca o PDF pela quantidade', async () => {
      comoAdmDaEstante(estante)
      const usuario = userEvent.setup()
      abrir()
      const dialogo = await abrirAdicionar(usuario)
      expect(dialogo.getByRole('radio', { name: 'Livro digital (PDF)' })).toBeChecked()
      expect(dialogo.getByLabelText('PDF')).toBeInTheDocument()
      expect(dialogo.queryByLabelText('Quantidade de exemplares')).not.toBeInTheDocument()
      await usuario.click(dialogo.getByRole('radio', { name: 'Livro físico' }))
      expect(dialogo.queryByLabelText('PDF')).not.toBeInTheDocument()
      expect(dialogo.getByLabelText('Quantidade de exemplares')).toHaveValue(1)
      expect(dialogo.getByText('Cada exemplar vira uma linha para emprestar e devolver. Você pode acrescentar mais depois.')).toBeInTheDocument()
      expect(dialogo.getByLabelText('Capa')).toBeInTheDocument()
    })

    it('cria o livro pela rota de físicos com a quantidade e fecha o diálogo', async () => {
      const usuario = userEvent.setup()
      const dialogo = await abrirNoTipoFisico(usuario)
      await usuario.type(dialogo.getByLabelText('Nome'), 'Novo físico')
      await usuario.clear(dialogo.getByLabelText('Quantidade de exemplares'))
      await usuario.type(dialogo.getByLabelText('Quantidade de exemplares'), '3')
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(chamadas).toContainEqual({ metodo: 'POST', caminho: '/api/biblioteca/itens-fisicos', corpo: { nome: 'Novo físico', descricao: null, categoriaId: cadernos.id, quantidade: 3 } })
    })

    it('depois de criar, envia a capa escolhida no mesmo passo do digital', async () => {
      const envio = simularEnvios([{ status: 200, corpo: criarItemFisico(9, { nome: 'Novo físico' }) }])
      const usuario = userEvent.setup()
      const dialogo = await abrirNoTipoFisico(usuario)
      await usuario.type(dialogo.getByLabelText('Nome'), 'Novo físico')
      await usuario.upload(dialogo.getByLabelText('Capa'), capaDe())
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      await waitFor(() => expect(envio.enviados).toHaveLength(1))
      expect(envio.enviados[0]).toMatchObject({ metodo: 'PUT', campo: 'capa' })
      expect(envio.enviados[0].url).toMatch(/^\/api\/biblioteca\/itens\/.+\/capa$/)
    })

    it.each([
      ['0', 'Informe ao menos 1 exemplar'],
      ['51', 'No máximo 50 exemplares por vez'],
    ])('quantidade %s: "%s", e nada é enviado', async (quantidade, mensagem) => {
      const usuario = userEvent.setup()
      const dialogo = await abrirNoTipoFisico(usuario)
      await usuario.type(dialogo.getByLabelText('Nome'), 'Novo físico')
      await usuario.clear(dialogo.getByLabelText('Quantidade de exemplares'))
      await usuario.type(dialogo.getByLabelText('Quantidade de exemplares'), quantidade)
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(dialogo.getByText(mensagem)).toBeInTheDocument()
      expect(chamadas).toHaveLength(0)
    })

    it('sem nome pede o nome e não chama a API', async () => {
      const usuario = userEvent.setup()
      const dialogo = await abrirNoTipoFisico(usuario)
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(dialogo.getByText('Dê um nome ao item.')).toBeInTheDocument()
      expect(chamadas).toHaveLength(0)
    })

    it('mostra a recusa da API dentro do diálogo', async () => {
      const usuario = userEvent.setup()
      const dialogo = await abrirNoTipoFisico(usuario)
      servidor.use(http.post('/api/biblioteca/itens-fisicos', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Categoria não existe mais.' }, { status: 404 })))
      await usuario.type(dialogo.getByLabelText('Nome'), 'Novo físico')
      await usuario.click(dialogo.getByRole('button', { name: 'Adicionar' }))
      expect(await dialogo.findByText('Categoria não existe mais.')).toBeInTheDocument()
    })
  })

  describe('carregando, erro e sem conexão na aba Físicos', () => {
    it('carregando, e depois os livros', async () => {
      comoConselheiro()
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByRole('status', { name: 'Carregando a biblioteca' })).toBeInTheDocument()
      expect(await screen.findByText('Pesquisador')).toBeInTheDocument()
    })

    it('erro com a mensagem da API e "Tentar de novo"', async () => {
      servidor.use(
        ...handlersSessao([criarVinculo('CONSELHEIRO')], undefined, COM_EMPRESTAR),
        http.get('/api/biblioteca', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Não deu para abrir a biblioteca.' }, { status: 500 })),
      )
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByText('Não deu para abrir a biblioteca.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    })

    it('sem rede: "Disponível quando houver internet"', async () => {
      servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')], undefined, COM_EMPRESTAR), http.get('/api/biblioteca', () => HttpResponse.error()))
      abrir('/biblioteca?aba=fisicos')
      expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    })
  })
})
