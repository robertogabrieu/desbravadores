import { LIMITE_BYTES_COMPROVANTE } from '@desbravadores/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarPedido, criarVenda, handlersVendas } from '../../testes/handlers/vendas'
import type { ChamadaDeVenda } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaResumoDoPedido } from './TelaResumoDoPedido'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, reduzir: null as null | ((arquivo: File) => Promise<Blob>) }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))
vi.mock('./imagem/desenharImagem', () => ({ desenharImagem: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }))
vi.mock('../galeria/reducao', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../galeria/reducao')>()),
  reduzirFoto: (arquivo: File) => (estado.reduzir ?? (() => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }))))(arquivo),
}))

let chamadas: ChamadaDeVenda[] = []

/** O interceptador de XHR do msw não lê o FormData do jsdom: o envio do comprovante usa um XHR falso, como o de materiais. */
function simularEnvio(status: number, corpo: unknown) {
  class XhrFalso {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    responseText = ''
    private url = ''
    open(_metodo: string, url: string) {
      this.url = url
    }
    setRequestHeader() {}
    send(formulario: FormData) {
      const arquivo = formulario.get('arquivo')
      chamadas.push({ metodo: 'POST', caminho: this.url, corpo: { arquivo: arquivo instanceof File ? arquivo.name : null } })
      this.status = status
      this.responseText = JSON.stringify(corpo)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
}

beforeEach(() => {
  estado.modo = 'ONLINE'
  estado.reduzir = null
  chamadas = []
  vi.unstubAllGlobals()
  simularEnvio(201, COM_FOTO)
  URL.createObjectURL = vi.fn(() => 'blob:imagem-do-pedido')
  URL.revokeObjectURL = vi.fn()
})

const VENDA = criarVenda(1, { nome: 'Lasanhas — 2ª edição' })
const A_PAGAR = criarPedido(3, { comprador: 'Marlene Prado' })
const COM_FOTO = criarPedido(3, { comprador: 'Marlene Prado', pago: true, forma: 'PIX', comprovante: { arquivoId: '0190aaaa-0000-7000-8000-000000000001', tipo: 'FOTO', url: '/api/arquivos/x?c=1&v=original&exp=1&sig=abc' } })
const COM_PDF = criarPedido(3, { comprador: 'Marlene Prado', pago: true, forma: 'PIX', comprovante: { arquivoId: '0190aaaa-0000-7000-8000-000000000002', tipo: 'PDF', url: '/api/arquivos/y?c=1&v=original&exp=1&sig=abc' } })
const SEM_COMPROVANTE = criarPedido(3, { comprador: 'Marlene Prado', pago: true, forma: 'PIX' })

function abrir(pedido = A_PAGAR, venda = VENDA) {
  servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']), ...handlersVendas({ venda, pedidos: [pedido], pedido, chamadas }))
  return renderizarRotas([{ path: '/adm/vendas/:id/pedidos/:pedidoId', element: <TelaResumoDoPedido /> }], `/adm/vendas/${venda.id}/pedidos/${pedido.id}`)
}

const caminhoDe = (acao: string) => `/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/${acao}`
const foto = (nome = 'recibo.png') => new File(['x'], nome, { type: 'image/png' })
const pdf = (tamanho = 10) => new File([new Uint8Array(tamanho)], 'banco.pdf', { type: 'application/pdf' })

async function abrirDialogoDePagamento(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole('button', { name: 'Marcar como pago' }))
  const dialogo = await screen.findByRole('dialog')
  await usuario.click(within(dialogo).getByRole('radio', { name: 'Pix' }))
  return dialogo
}

const campoDeArquivo = (dialogo: HTMLElement) => dialogo.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement

describe('Comprovante na janela "Como o pedido foi pago?"', () => {
  it('sem anexo, só marca como pago', async () => {
    abrir()
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    expect(within(dialogo).getByText('Comprovante (opcional)')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(chamadas.map((c) => c.caminho)).toEqual([caminhoDe('pagar')]))
  })

  it('com foto, reduz no aparelho, grava o pagamento e depois envia o comprovante em JPEG', async () => {
    const reduzir = vi.fn(() => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' })))
    estado.reduzir = reduzir
    abrir()
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    await usuario.upload(campoDeArquivo(dialogo), foto())
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(chamadas).toHaveLength(2))
    expect(reduzir).toHaveBeenCalledTimes(1)
    expect(chamadas.map((c) => c.caminho)).toEqual([caminhoDe('pagar'), caminhoDe('comprovante')])
    expect(chamadas[1]?.corpo).toEqual({ arquivo: 'comprovante.jpg' })
  })

  it('com PDF, envia o arquivo como está', async () => {
    abrir()
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    await usuario.upload(campoDeArquivo(dialogo), pdf())
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(chamadas).toHaveLength(2))
    expect(chamadas[1]?.corpo).toEqual({ arquivo: 'banco.pdf' })
  })

  it('PDF acima de 2,5 MB é recusado na hora, com a mensagem, e o pagamento segue sem anexo', async () => {
    abrir()
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    await usuario.upload(campoDeArquivo(dialogo), pdf(LIMITE_BYTES_COMPROVANTE + 1))
    expect(await within(dialogo).findByText('O comprovante passa de 2,5 MB. Tire um print menor ou envie o PDF do banco.')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(chamadas.map((c) => c.caminho)).toEqual([caminhoDe('pagar')]))
  })

  it('foto que o aparelho não abre é recusada com orientação', async () => {
    const { ErroFormatoFoto } = await import('../galeria/reducao')
    estado.reduzir = () => Promise.reject(new ErroFormatoFoto())
    abrir()
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    await usuario.upload(campoDeArquivo(dialogo), foto('heic.png'))
    expect(await within(dialogo).findByText(/Não foi possível abrir esta foto/)).toBeInTheDocument()
  })

  it('se só o envio falhar, o pedido fica pago e a tela avisa onde tentar de novo', async () => {
    abrir()
    simularEnvio(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falhou.' })
    const usuario = userEvent.setup()
    const dialogo = await abrirDialogoDePagamento(usuario)
    await usuario.upload(campoDeArquivo(dialogo), pdf())
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    expect(await screen.findByText(/o pedido foi marcado como pago, mas o comprovante não foi enviado/i)).toBeInTheDocument()
    expect(chamadas.map((c) => c.caminho)).toEqual([caminhoDe('pagar'), caminhoDe('comprovante')])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Bloco "Comprovante" no resumo', () => {
  it('pedido não pago não mostra o bloco', async () => {
    abrir(A_PAGAR)
    await screen.findByRole('button', { name: 'Marcar como pago' })
    expect(screen.queryByRole('heading', { name: 'Comprovante' })).not.toBeInTheDocument()
  })

  it('pago sem comprovante: diz que não há e deixa anexar (foto reduzida)', async () => {
    abrir(SEM_COMPROVANTE)
    const usuario = userEvent.setup()
    expect(await screen.findByText('Nenhum comprovante anexado.')).toBeInTheDocument()
    await usuario.upload(screen.getByLabelText('Escolher o arquivo do comprovante'), foto())
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toMatchObject({ metodo: 'POST', caminho: caminhoDe('comprovante'), corpo: { arquivo: 'comprovante.jpg' } })
  })

  it('foto: mostra a miniatura, abre em nova aba, troca e remove', async () => {
    abrir(COM_FOTO)
    const usuario = userEvent.setup()
    expect(await screen.findByRole('img', { name: 'Foto do comprovante de pagamento' })).toHaveAttribute('src', COM_FOTO.comprovante?.url)
    const abrirLink = screen.getByRole('link', { name: 'Abrir em nova aba' })
    expect(abrirLink).toHaveAttribute('href', COM_FOTO.comprovante?.url)
    expect(abrirLink).toHaveAttribute('target', '_blank')

    await usuario.upload(screen.getByLabelText('Escolher o arquivo do comprovante'), pdf())
    await waitFor(() => expect(chamadas[0]?.corpo).toEqual({ arquivo: 'banco.pdf' }))

    await usuario.click(screen.getByRole('button', { name: 'Remover comprovante' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(chamadas.at(-1)).toMatchObject({ metodo: 'DELETE', caminho: caminhoDe('comprovante') }))
  })

  it('PDF: mostra o ícone de PDF em vez da miniatura', async () => {
    abrir(COM_PDF)
    expect(await screen.findByText('Comprovante em PDF')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Foto do comprovante de pagamento' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir em nova aba' })).toHaveAttribute('href', COM_PDF.comprovante?.url)
  })

  it('arquivo recusado pelo servidor aparece como alerta no bloco', async () => {
    abrir(SEM_COMPROVANTE)
    simularEnvio(422, { codigo: 'REGRA', mensagem: 'Envie uma foto (JPEG, PNG ou WebP) ou um PDF.' })
    await userEvent.setup().upload(await screen.findByLabelText('Escolher o arquivo do comprovante'), pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie uma foto (JPEG, PNG ou WebP) ou um PDF.')
  })

  it('venda encerrada: só abre, sem trocar nem remover', async () => {
    abrir(COM_FOTO, criarVenda(1, { nome: 'Lasanhas — 2ª edição', encerradaEm: '2026-11-15T12:00:00.000Z' }))
    expect(await screen.findByRole('link', { name: 'Abrir em nova aba' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar comprovante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover comprovante' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Escolher o arquivo do comprovante')).not.toBeInTheDocument()
  })

  it('sem conexão: botões desligados, com o aviso, e o link de abrir continua', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir(COM_FOTO)
    expect(await screen.findByRole('button', { name: 'Trocar comprovante' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover comprovante' })).toBeDisabled()
    expect(screen.getAllByText(/precisam de internet/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Abrir em nova aba' })).toBeInTheDocument()
  })

  it('a imagem do pedido enviada ao comprador não leva o comprovante', async () => {
    const { montarImagemDoPedido } = await import('./imagem/montarImagemDoPedido')
    const blocos = JSON.stringify(montarImagemDoPedido(VENDA, COM_FOTO, 'Clube'))
    expect(blocos).not.toContain('/api/arquivos')
    expect(blocos).not.toContain('Comprovante')
  })
})
