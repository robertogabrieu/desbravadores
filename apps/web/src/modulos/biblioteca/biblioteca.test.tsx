import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { GuardaRota } from '../../sessao/GuardaRota'
import type { CategoriaBiblioteca, ChamadaBiblioteca } from '../../testes/handlers/biblioteca'
import { criarCategoriaBiblioteca, criarItemBiblioteca, handlerBiblioteca, handlersEscritaBiblioteca } from '../../testes/handlers/biblioteca'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaBiblioteca } from './TelaBiblioteca'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const abrir = () =>
  renderizarRotas(
    [{ element: <GuardaRota />, children: [{ path: '/biblioteca', element: <TelaBiblioteca /> }, { path: '/inicio', element: <p>Início</p> }] }],
    '/biblioteca',
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
    expect(dialogo.getByLabelText('Categoria')).toHaveValue(cadernos.id)
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
    await usuario.selectOptions(dialogo.getByLabelText('Categoria'), livros.id)
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
    expect(dialogo.getByLabelText('Categoria')).toHaveValue(cadernos.id)
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
    await usuario.selectOptions(dialogo.getByLabelText('Categoria'), livros.id)
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

  it('sem conexão diz que precisa de internet e não consulta', async () => {
    estado.modo = 'SEM_CONEXAO'
    let consultas = 0
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]), http.get('/api/biblioteca', () => { consultas += 1; return HttpResponse.json({ categorias: estante }) }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument()
    expect(consultas).toBe(0)
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
