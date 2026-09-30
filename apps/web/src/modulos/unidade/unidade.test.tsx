import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { criarMembro } from '../../testes/handlers/leitura'
import { handlerErroPedidoAoAdm, handlerPedidoAoAdm } from '../../testes/handlers/pedidos'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasUnidade } from './rotas'

const ERRO_500 = { codigo: 'ERRO_INTERNO', mensagem: 'Servidor fora do ar' }

const AGUIAS = { id: uuid(201), nome: 'Águias' }
const LEOES = { id: uuid(202), nome: 'Leões' }

function entrarComo(unidades: { id: string; nome: string }[]) {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1, { unidades })]))
}

function membrosPorUnidade(porUnidade: Record<string, ReturnType<typeof criarMembro>[]>) {
  return http.get('/api/unidades/:id/membros', ({ params }) => HttpResponse.json(porUnidade[String(params['id'])] ?? []))
}

const abrir = () => renderizarRotas(rotasUnidade, '/unidade')

describe('Minha unidade', () => {
  it('lista os desbravadores com iniciais, classe, idade e link para o perfil', async () => {
    entrarComo([AGUIAS])
    servidor.use(
      membrosPorUnidade({
        [AGUIAS.id]: [
          criarMembro({ dbvId: uuid(301), nome: 'Ana Clara Souza', idade: 11, classeAtual: { id: uuid(1), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-companheiro' } }),
          criarMembro({ dbvId: uuid(302), nome: 'Pedro Lima', idade: 9, classeAtual: null }),
        ],
      }),
    )
    abrir()
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Águias' })).toBeInTheDocument()
    const itens = screen.getAllByRole('listitem')
    expect(within(itens[0]).getByText('AC')).toBeInTheDocument()
    expect(within(itens[0]).getByText('Companheiro · 11 anos')).toBeInTheDocument()
    expect(within(itens[1]).getByText('sem classe · 9 anos')).toBeInTheDocument()
    expect(within(itens[0]).getByRole('link')).toHaveAttribute('href', `/dbv/${uuid(301)}`)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('com duas unidades mostra o seletor, começa pela primeira por nome e troca a lista', async () => {
    entrarComo([LEOES, AGUIAS])
    servidor.use(
      membrosPorUnidade({
        [AGUIAS.id]: [criarMembro({ nome: 'Ana Clara Souza' })],
        [LEOES.id]: [criarMembro({ dbvId: uuid(303), nome: 'Davi Carvalho' })],
      }),
    )
    abrir()
    const seletor = await screen.findByRole('combobox', { name: 'Unidade' })
    expect(seletor).toHaveValue(AGUIAS.id)
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
    await userEvent.selectOptions(seletor, LEOES.id)
    expect(await screen.findByText('Davi Carvalho')).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()
  })

  it('busca sem diferenciar acento nem maiúscula', async () => {
    entrarComo([AGUIAS])
    servidor.use(membrosPorUnidade({ [AGUIAS.id]: [criarMembro({ dbvId: uuid(304), nome: 'João Pedro' }), criarMembro({ nome: 'Ana Clara Souza' })] }))
    abrir()
    await screen.findByText('João Pedro')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar desbravador' }), 'JOAO')
    expect(screen.getByText('João Pedro')).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()
  })

  it('unidade sem desbravadores mostra o aviso', async () => {
    entrarComo([AGUIAS])
    servidor.use(membrosPorUnidade({ [AGUIAS.id]: [] }))
    abrir()
    expect(await screen.findByText('Nenhum desbravador nesta unidade.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avisar o Adm' })).toBeInTheDocument()
  })

  it('mostra a frequência do mês, vermelha abaixo do limiar, e "—" quando não há', async () => {
    entrarComo([AGUIAS])
    servidor.use(
      membrosPorUnidade({
        [AGUIAS.id]: [
          criarMembro({ dbvId: uuid(301), nome: 'Ana Clara Souza', frequencia: 100 }),
          criarMembro({ dbvId: uuid(302), nome: 'Bruno Lima', frequencia: 50 }),
          criarMembro({ dbvId: uuid(303), nome: 'Carla Dias', frequencia: null }),
          criarMembro({ dbvId: uuid(304), nome: 'Davi Nunes' }),
        ],
      }),
    )
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.getByText('100%')).not.toHaveClass('text-perigo')
    expect(screen.getByText('50%')).toHaveClass('text-perigo')
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('"Avisar o Adm" envia o pedido e vira "Adm avisado"', async () => {
    entrarComo([AGUIAS])
    const corpos: unknown[] = []
    servidor.use(membrosPorUnidade({ [AGUIAS.id]: [] }), handlerPedidoAoAdm((corpo) => corpos.push(corpo)))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Avisar o Adm' }))
    expect(await screen.findByText('Adm avisado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Avisar o Adm' })).not.toBeInTheDocument()
    expect(corpos).toEqual([{ tipo: 'UNIDADE_SEM_DBV', unidadeId: AGUIAS.id }])
  })

  it('erro no pedido ao Adm mostra a mensagem e mantém o botão', async () => {
    entrarComo([AGUIAS])
    servidor.use(membrosPorUnidade({ [AGUIAS.id]: [] }), handlerErroPedidoAoAdm(422, { codigo: 'REGRA', mensagem: 'A unidade já tem desbravadores.' }))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Avisar o Adm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A unidade já tem desbravadores.')
    expect(screen.getByRole('button', { name: 'Avisar o Adm' })).toBeInTheDocument()
  })

  it('mostra o esqueleto enquanto carrega', async () => {
    entrarComo([AGUIAS])
    servidor.use(http.get('/api/unidades/:id/membros', () => new Promise<Response>(() => undefined)))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando unidade' })).toBeInTheDocument()
  })

  it('erro da API mostra a mensagem e "Tentar de novo" recarrega', async () => {
    entrarComo([AGUIAS])
    servidor.use(http.get('/api/unidades/:id/membros', () => HttpResponse.json(ERRO_500, { status: 500 })))
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar')
    servidor.use(membrosPorUnidade({ [AGUIAS.id]: [criarMembro({ nome: 'Ana Clara Souza' })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
  })

  it('sem conexão e sem dado mostra "Disponível quando houver internet"', async () => {
    entrarComo([AGUIAS])
    servidor.use(http.get('/api/unidades/:id/membros', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
