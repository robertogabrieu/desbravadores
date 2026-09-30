import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { ESP_AVES, ESP_NOS, handlerCatalogoEspecialidades, handlerEspecialidadesDoDbv, handlerEspecialidadesDoDbvNaoEncontrado } from '../../testes/handlers/especialidades'
import { CLASSE_AMIGO, criarProgressoClasse, handlerProgressoClasse } from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaEspecialidades } from './TelaEspecialidades'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const ANA = uuid(401)
const abrir = (consulta = '') => renderizarRotas([{ path: '/especialidades', element: <TelaEspecialidades /> }], `/especialidades${consulta}`)
const concluidas = [{ especialidadeId: ESP_NOS, concluidaEm: '2030-09-10', marcadoPor: 'Priscila', podeDesmarcar: true }]

beforeEach(() => {
  estado.modo = 'ONLINE'
  servidor.use(
    ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO] })]),
    handlerProgressoClasse(),
    handlerCatalogoEspecialidades(),
  )
})

describe('Especialidades', () => {
  it('sem desbravador escolhido pede para escolher e lista os da classe', async () => {
    abrir()
    expect(await screen.findByText('Escolha um desbravador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sofia Lopes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CLASSE_AMIGO.nome })).toHaveAttribute('aria-pressed', 'true')
  })

  it('escolher um desbravador leva ao dele e mostra quem marcou e quando', async () => {
    servidor.use(handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas }))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Ana Clara Souza' }))
    expect(await screen.findByText('Concluída em 10/09 · marcada por Priscila')).toBeInTheDocument()
    expect(screen.getByText('1 concluídas')).toBeInTheDocument()
    expect(screen.getByText('Artes e habilidades manuais')).toBeInTheDocument()
  })

  it('a busca ignora acento e maiúscula e esconde as áreas sem resultado', async () => {
    servidor.use(handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas: [] }))
    const usuario = userEvent.setup()
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    await usuario.type(await screen.findByLabelText('Buscar especialidade'), 'NOS e')
    expect(screen.getByRole('button', { name: /Nós e Amarras/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aves/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Estudo da natureza')).not.toBeInTheDocument()
  })

  it('marcar abre a data e grava a data escolhida', async () => {
    let corpo: unknown
    servidor.use(
      handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas: [] }),
      http.put(`/api/desbravadores/${ANA}/especialidades/${ESP_AVES}`, async ({ request }) => {
        corpo = await request.json()
        return HttpResponse.json({ dbvId: ANA, concluidas: [{ especialidadeId: ESP_AVES, concluidaEm: '2030-09-15', marcadoPor: 'Priscila', podeDesmarcar: true }] })
      }),
    )
    const usuario = userEvent.setup()
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    await usuario.click(await screen.findByRole('button', { name: /^Aves/ }))
    const dialogo = await screen.findByRole('dialog', { name: 'Marcar como concluída' })
    const campo = within(dialogo).getByLabelText('Data de conclusão')
    await usuario.clear(campo)
    await usuario.type(campo, '2030-09-15')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar' }))
    expect(await screen.findByText('Concluída em 15/09 · marcada por Priscila')).toBeInTheDocument()
    expect(corpo).toEqual({ concluidoEm: '2030-09-15' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra a recusa da API ao marcar (já concluída) sem fechar o painel', async () => {
    servidor.use(
      handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas: [] }),
      http.put(`/api/desbravadores/${ANA}/especialidades/${ESP_AVES}`, () =>
        HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Já concluída em 10/09.' }, { status: 409 }),
      ),
    )
    const usuario = userEvent.setup()
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    await usuario.click(await screen.findByRole('button', { name: /^Aves/ }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Marcar' }))
    expect(await screen.findByText('Já concluída em 10/09.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('desmarcar pede confirmação: cancelar não apaga, confirmar apaga', async () => {
    let apagou = 0
    servidor.use(
      handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas }),
      http.delete(`/api/desbravadores/${ANA}/especialidades/${ESP_NOS}`, () => {
        apagou += 1
        return HttpResponse.json({ dbvId: ANA, concluidas: [] })
      }),
    )
    const usuario = userEvent.setup()
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    await usuario.click(await screen.findByRole('button', { name: /^Nós e Amarras/ }))
    let dialogo = await screen.findByRole('dialog', { name: 'Desmarcar especialidade?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(apagou).toBe(0)
    await usuario.click(screen.getByRole('button', { name: /^Nós e Amarras/ }))
    dialogo = await screen.findByRole('dialog', { name: 'Desmarcar especialidade?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desmarcar' }))
    await waitFor(() => expect(apagou).toBe(1))
    expect(await screen.findAllByText('Toque para marcar como concluída')).toHaveLength(3)
  })

  it('desbravador fora do escopo mostra o 404 amigável', async () => {
    servidor.use(handlerEspecialidadesDoDbvNaoEncontrado(uuid(499)))
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${uuid(499)}`)
    expect(await screen.findByText('Desbravador não encontrado')).toBeInTheDocument()
  })

  it('mostra o carregando e o erro do catálogo com tentar de novo', async () => {
    servidor.use(http.get('/api/especialidades', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou o catálogo.' }, { status: 500 })), handlerEspecialidadesDoDbv(ANA, { dbvId: ANA, concluidas: [] }))
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    expect(await screen.findByRole('status', { name: 'Carregando especialidades' })).toBeInTheDocument()
    expect(await screen.findByText('Falhou o catálogo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('classe sem desbravadores mostra o vazio', async () => {
    servidor.use(handlerProgressoClasse(criarProgressoClasse({ itens: [] })))
    abrir()
    expect(await screen.findByText('Nenhum desbravador cursando esta classe.')).toBeInTheDocument()
  })

  it('sem conexão diz que precisa de internet', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir(`?classe=${CLASSE_AMIGO.id}&dbv=${ANA}`)
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
