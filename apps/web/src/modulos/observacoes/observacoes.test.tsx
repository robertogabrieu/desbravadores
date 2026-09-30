import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeDoClube } from '../../api/desbravadores'
import type { ModoConexao } from '../../offline'
import { criarObservacao, handlerAulasDaClasse, handlerObservacoes } from '../../testes/handlers/observacoes'
import { CLASSE_AMIGO, handlerProgressoClasse } from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaObservacoes } from './TelaObservacoes'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const AULA_ANTIGA = { id: uuid(951), data: '2030-09-20' }
const AULA_DE_HOJE = { id: uuid(952), data: hojeDoClube() }
const abrir = () => renderizarRotas([{ path: '/observacoes', element: <TelaObservacoes /> }], `/observacoes?classe=${CLASSE_AMIGO.id}`)

const porDbv = criarObservacao({
  id: uuid(902), alvo: 'DBV', aula: null, dbv: { id: uuid(403), nome: 'Miguel Teixeira' }, titulo: null, texto: 'Precisa de reforço.',
})

beforeEach(() => {
  estado.modo = 'ONLINE'
  servidor.use(
    ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO] })]),
    handlerProgressoClasse(),
    handlerAulasDaClasse([AULA_ANTIGA, AULA_DE_HOJE]),
  )
})

describe('Observações', () => {
  it('lista as da aula com autor e data, e avisa quem pode ver', async () => {
    servidor.use(handlerObservacoes([criarObservacao(), porDbv]))
    abrir()
    expect(await screen.findByText('Turma animada com o jogo.')).toBeInTheDocument()
    expect(screen.getByText('Visível só para instrutores e Adm')).toBeInTheDocument()
    expect(screen.getByText(/Priscila/)).toBeInTheDocument()
    expect(screen.getByText('Aula · 27/09')).toBeInTheDocument()
    expect(screen.queryByText('Precisa de reforço.')).not.toBeInTheDocument()
  })

  it('a aba Por DBV mostra as sobre desbravadores', async () => {
    servidor.use(handlerObservacoes([criarObservacao(), porDbv]))
    const usuario = userEvent.setup()
    abrir()
    await screen.findByText('Turma animada com o jogo.')
    await usuario.click(screen.getByRole('tab', { name: 'Por DBV' }))
    expect(await screen.findByText('Precisa de reforço.')).toBeInTheDocument()
    expect(screen.getByText('Miguel Teixeira', { selector: 'span' })).toBeInTheDocument()
  })

  it('cria a observação sobre a aula de hoje, que vem escolhida', async () => {
    let corpo: unknown
    servidor.use(
      handlerObservacoes([]),
      http.post('/api/observacoes', async ({ request }) => {
        corpo = await request.json()
        return HttpResponse.json(criarObservacao(), { status: 201 })
      }),
    )
    const usuario = userEvent.setup()
    abrir()
    await screen.findByText('Nenhuma observação ainda.')
    await waitFor(() => expect(screen.getByLabelText('Aula')).toHaveValue(AULA_DE_HOJE.id))
    await usuario.type(screen.getByLabelText('Título (opcional)'), 'Bom encontro')
    await usuario.type(screen.getByLabelText('Nova observação'), 'Retomar o 7º mandamento.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar observação' }))
    await waitFor(() =>
      expect(corpo).toEqual({ classeId: CLASSE_AMIGO.id, alvo: 'AULA', registroAulaId: AULA_DE_HOJE.id, dbvId: null, titulo: 'Bom encontro', texto: 'Retomar o 7º mandamento.' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Nova observação')).toHaveValue(''))
  })

  it('cria a observação sobre um DBV da classe', async () => {
    let corpo: unknown
    servidor.use(
      handlerObservacoes([]),
      http.post('/api/observacoes', async ({ request }) => {
        corpo = await request.json()
        return HttpResponse.json(porDbv, { status: 201 })
      }),
    )
    const usuario = userEvent.setup()
    abrir()
    await screen.findByText('Nenhuma observação ainda.')
    await usuario.click(screen.getByRole('radio', { name: 'Sobre um DBV' }))
    await screen.findByRole('option', { name: 'Miguel Teixeira' })
    await usuario.selectOptions(screen.getByLabelText('Desbravador'), uuid(403))
    await usuario.type(screen.getByLabelText('Nova observação'), 'Precisa de reforço.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar observação' }))
    await waitFor(() =>
      expect(corpo).toEqual({ classeId: CLASSE_AMIGO.id, alvo: 'DBV', registroAulaId: null, dbvId: uuid(403), titulo: null, texto: 'Precisa de reforço.' }),
    )
  })

  it('não salva texto vazio', async () => {
    let chamadas = 0
    servidor.use(handlerObservacoes([]), http.post('/api/observacoes', () => { chamadas += 1; return HttpResponse.json(criarObservacao(), { status: 201 }) }))
    const usuario = userEvent.setup()
    abrir()
    await screen.findByText('Nenhuma observação ainda.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar observação' }))
    expect(await screen.findByText('Escreva a observação.')).toBeInTheDocument()
    expect(chamadas).toBe(0)
  })

  it('só o autor vê Editar; quem não pode apagar não vê Apagar', async () => {
    servidor.use(handlerObservacoes([criarObservacao({ podeEditar: false, podeApagar: false, texto: 'De outra pessoa.' })]))
    abrir()
    await screen.findByText('De outra pessoa.')
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o Adm que só pode apagar vê Apagar e não Editar', async () => {
    servidor.use(handlerObservacoes([criarObservacao({ podeEditar: false, podeApagar: true })]))
    abrir()
    await screen.findByText('Turma animada com o jogo.')
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
  })

  it('edita o texto do autor', async () => {
    let corpo: unknown
    servidor.use(
      handlerObservacoes([criarObservacao()]),
      http.patch(`/api/observacoes/${uuid(901)}`, async ({ request }) => {
        corpo = await request.json()
        return HttpResponse.json(criarObservacao({ texto: 'Texto novo.' }))
      }),
    )
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const campo = screen.getByLabelText('Editar observação')
    await usuario.clear(campo)
    await usuario.type(campo, 'Texto novo.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpo).toEqual({ titulo: 'Descoberta espiritual', texto: 'Texto novo.' }))
  })

  it('apagar pede confirmação', async () => {
    let apagou = 0
    servidor.use(handlerObservacoes([criarObservacao()]), http.delete(`/api/observacoes/${uuid(901)}`, () => { apagou += 1; return new HttpResponse(null, { status: 204 }) }))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Apagar' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Apagar observação?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(apagou).toBe(0)
    await usuario.click(screen.getByRole('button', { name: 'Apagar' }))
    dialogo = await screen.findByRole('dialog', { name: 'Apagar observação?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(apagou).toBe(1))
  })

  it('mostra o carregando e o erro da API', async () => {
    servidor.use(http.get('/api/observacoes', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Classe não encontrada.' }, { status: 404 })))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando observações' })).toBeInTheDocument()
    expect(await screen.findByText('Classe não encontrada.')).toBeInTheDocument()
  })

  it('sem conexão diz que precisa de internet e não consulta', async () => {
    estado.modo = 'SEM_CONEXAO'
    let consultas = 0
    servidor.use(http.get('/api/observacoes', () => { consultas += 1; return HttpResponse.json([]) }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(consultas).toBe(0)
  })

  it('B12: o cache das observações sai da memória quando a tela fecha', async () => {
    servidor.use(handlerObservacoes([criarObservacao()]))
    const { unmount, clienteConsultas } = abrir()
    await screen.findByText('Turma animada com o jogo.')
    expect(clienteConsultas.getQueryCache().findAll({ queryKey: ['observacoes'] })).toHaveLength(1)
    unmount()
    await waitFor(() => expect(clienteConsultas.getQueryCache().findAll({ queryKey: ['observacoes'] })).toHaveLength(0))
  })
})
