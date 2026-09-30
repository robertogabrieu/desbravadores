import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { handlerPerfil } from '../../testes/handlers/perfil'
import {
  criarProgressoDbv,
  handlerDesmarcarRequisito,
  handlerErroRequisito,
  handlerMarcarRequisito,
  handlerProgressoDbv,
} from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasPerfil } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const ID = '00000000-0000-4000-8000-000000000201'

function abrir(...handlers: Parameters<typeof servidor.use>) {
  servidor.use(handlerPerfil(), ...handlers, ...handlersSessao([criarVinculo('INSTRUTOR')]))
  return renderizarRotas(rotasPerfil, `/dbv/${ID}`)
}

async function abrirSecao(nome: string) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(nome) }))
}

describe('seção de progresso do perfil', () => {
  it('mostra o anel da regular, o anel menor da avançada recomendada e as seções verde/cinza', async () => {
    abrir(handlerProgressoDbv())
    expect(await screen.findByRole('img', { name: '67% da classe Amigo concluída' })).toBeInTheDocument()
    expect(screen.getByText('2 de 3 requisitos concluídos')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0% da avançada Amigo da Natureza concluída' })).toBeInTheDocument()
    expect(screen.getByText('Avançada recomendada')).toBeInTheDocument()
    expect(screen.getByTestId('barra-GE')).toHaveAttribute('data-completa', 'true')
    expect(screen.getByTestId('barra-DE')).toHaveAttribute('data-completa', 'false')
    expect(screen.queryByText('Pronto para investidura')).not.toBeInTheDocument()
  })

  it('em 100% da regular: "Pronto para investidura"', async () => {
    const base = criarProgressoDbv()
    abrir(handlerProgressoDbv({ matriculas: [{ ...base.matriculas[0], percentual: 100, concluidos: 3 }] }))
    expect(await screen.findByText('Pronto para investidura')).toBeInTheDocument()
    expect(screen.queryByText('Avançada recomendada')).not.toBeInTheDocument()
  })

  it('tocar na seção abre os requisitos com a data de conclusão', async () => {
    abrir(handlerProgressoDbv())
    expect(await screen.findByText('1/1')).toBeInTheDocument()
    expect(screen.queryByText('Requisito DE.1')).not.toBeInTheDocument()
    await abrirSecao('Descoberta espiritual')
    expect(screen.getByText(/Requisito DE\.1/)).toBeInTheDocument()
    expect(screen.getByText('Concluído em 02/04/2020')).toBeInTheDocument()
    expect(screen.getByText('Ainda não concluído')).toBeInTheDocument()
  })

  it('marca o requisito com a data escolhida (limitada ao início do ano do clube e hoje)', async () => {
    const corpos: unknown[] = []
    abrir(handlerProgressoDbv(), handlerMarcarRequisito((c) => corpos.push(c)))
    await abrirSecao('Descoberta espiritual')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar DE.2' }))
    const campo = screen.getByLabelText('Data de conclusão')
    expect(campo).toHaveAttribute('min', '2020-01-01')
    expect(campo).toHaveAttribute('max', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    fireEvent.change(campo, { target: { value: '2020-05-05' } })
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await vi.waitFor(() => expect(corpos).toEqual([{ concluidoEm: '2020-05-05' }]))
  })

  it('desmarca só depois da confirmação', async () => {
    const chamadas: number[] = []
    abrir(handlerProgressoDbv(), handlerDesmarcarRequisito(() => chamadas.push(1)))
    await abrirSecao('Gerais')
    await userEvent.click(screen.getByRole('button', { name: 'Desmarcar GE.1' }))
    expect(chamadas).toHaveLength(0)
    await userEvent.click(botaoDoDialogo('Cancelar'))
    expect(chamadas).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Desmarcar GE.1' }))
    await userEvent.click(botaoDoDialogo('Desmarcar'))
    await vi.waitFor(() => expect(chamadas).toHaveLength(1))
  })

  it('409 mostra "Já concluído em dd/mm." e 422 mostra a mensagem da API', async () => {
    abrir(handlerProgressoDbv(), handlerErroRequisito(409, { codigo: 'CONFLITO', mensagem: 'Já concluído em 02/04.' }))
    await abrirSecao('Descoberta espiritual')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar DE.2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Já concluído em 02/04.')).toBeInTheDocument()
    servidor.use(handlerErroRequisito(422, { codigo: 'VALIDACAO', mensagem: 'Data fora do ano do clube.' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Data fora do ano do clube.')).toBeInTheDocument()
  })

  it('quem não pode marcar (conselheiro) vê os requisitos sem controles', async () => {
    abrir(handlerProgressoDbv(criarProgressoDbv(false)))
    await abrirSecao('Descoberta espiritual')
    expect(screen.getByText(/Requisito DE\.2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Marcar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Desmarcar/ })).not.toBeInTheDocument()
  })

  it('sem conexão: só a seção pede internet e o resto do perfil segue', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByRole('heading', { name: 'Ana Clara Souza' })).toBeInTheDocument()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('erro da API na seção: mensagem e "Tentar de novo"; sem matrícula: estado vazio', async () => {
    abrir(http.get('/api/desbravadores/:id/progresso', () => HttpResponse.json({ codigo: 'ERRO', mensagem: 'Falhou ao ler o progresso.' }, { status: 500 })))
    expect(await screen.findByText(/Não foi possível|Falhou ao ler/)).toBeInTheDocument()
    servidor.use(handlerProgressoDbv({ matriculas: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Sem classe neste ano')).toBeInTheDocument()
  })
})

function botaoDoDialogo(nome: string) {
  const dialogo = screen.getByRole('dialog')
  const botao = Array.from(dialogo.querySelectorAll('button')).find((b) => b.textContent === nome)
  if (!botao) throw new Error(`botão ${nome} não está no diálogo`)
  return botao
}
