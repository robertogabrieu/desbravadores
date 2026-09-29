import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { criarMembro } from '../../testes/handlers/leitura'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasUnidade } from './rotas'

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
  it('lista os desbravadores com iniciais, classe e idade, sem frequência', async () => {
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
    expect(screen.queryByText(/frequência/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
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
    expect(await screen.findByText('Nenhum desbravador nesta unidade. Avise o Adm.')).toBeInTheDocument()
  })
})
