import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { CLASSE_AMIGO, CLASSE_AMIGO_AVANCADA, criarProgressoClasse, handlerClassesCatalogo, handlerErroProgressoClasse, handlerProgressoClasse } from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaProgressoClasse } from './TelaProgressoClasse'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const abrir = (classeId: string = CLASSE_AMIGO.id) =>
  renderizarRotas([{ path: '/classes/:id/progresso', element: <TelaProgressoClasse /> }], `/classes/${classeId}/progresso`)

const catalogo = [CLASSE_AMIGO, CLASSE_AMIGO_AVANCADA].map((c, i) => ({
  ...c, idade: 10, origem: 'OFICIAL', classeBaseId: c.tipo === 'AVANCADA' ? CLASSE_AMIGO.id : null, ordem: i + 1, ativa: true, quemMontaCronograma: 'ADM', totalRequisitos: 50,
}))

beforeEach(() => {
  estado.modo = 'ONLINE'
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO, CLASSE_AMIGO_AVANCADA] })]), handlerClassesCatalogo(catalogo))
})

describe('Progresso da classe', () => {
  it('mostra a média, os prontos, os abaixo do limiar e cada DBV com o que falta', async () => {
    servidor.use(handlerProgressoClasse())
    abrir()
    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByText('3 DBVs · 50 requisitos')).toBeInTheDocument()
    expect(screen.getByText('1 prontos p/ investidura')).toBeInTheDocument()
    expect(screen.getByText('1 abaixo de 40%')).toBeInTheDocument()
    expect(screen.getByText('faltam 40 req.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Miguel Teixeira/ })).toHaveAttribute('href', `/dbv/${uuid(403)}`)
  })

  it('a ficha da própria conta aparece como "você"; a dos outros, não', async () => {
    const padrao = criarProgressoClasse()
    const itens = padrao.itens.map((item, i) => ({ ...item, voce: i === 1 }))
    servidor.use(handlerProgressoClasse({ ...padrao, itens }))
    abrir()
    expect(within(await screen.findByRole('link', { name: /Sofia Lopes/ })).getByText('você')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Miguel Teixeira/ })).queryByText('você')).not.toBeInTheDocument()
  })

  it('marca em laranja quem está abaixo do limiar e não quem está acima', async () => {
    servidor.use(handlerProgressoClasse())
    abrir()
    const abaixo = await screen.findByText('20%')
    expect(abaixo).toHaveAttribute('data-abaixo', 'true')
    expect(screen.getByText('62%')).toHaveAttribute('data-abaixo', 'false')
  })

  it('na avançada conta os que concluíram a avançada, sem falar de investidura', async () => {
    servidor.use(handlerProgressoClasse(criarProgressoClasse({ classe: CLASSE_AMIGO_AVANCADA, concluiramAvancada: 2, prontos: 0 })))
    abrir(CLASSE_AMIGO_AVANCADA.id)
    expect(await screen.findByText('2 concluíram a avançada')).toBeInTheDocument()
    expect(screen.queryByText(/prontos p\/ investidura/)).not.toBeInTheDocument()
  })

  it('troca entre Regular e Avançada pelo alternador', async () => {
    const usuario = userEvent.setup()
    servidor.use(
      http.get('/api/classes/:id/progresso', ({ params }) =>
        HttpResponse.json(params['id'] === CLASSE_AMIGO.id ? criarProgressoClasse() : criarProgressoClasse({ classe: CLASSE_AMIGO_AVANCADA, media: 33, concluiramAvancada: 0 })),
      ),
    )
    abrir()
    expect(await screen.findByText('60%')).toBeInTheDocument()
    await usuario.click(await screen.findByRole('tab', { name: 'Avançada' }))
    expect(await screen.findByText('33%')).toBeInTheDocument()
    expect(screen.getByText('0 concluíram a avançada')).toBeInTheDocument()
  })

  it('sem matriculados mostra o vazio e o traço na média', async () => {
    servidor.use(handlerProgressoClasse(criarProgressoClasse({ itens: [], media: null, prontos: 0, abaixoDoLimiar: 0 })))
    abrir()
    expect(await screen.findByText('Nenhum desbravador cursando esta classe.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('mostra o carregando e depois o erro da API com a opção de tentar de novo', async () => {
    servidor.use(handlerErroProgressoClasse(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Classe não encontrada.' }))
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando progresso' })).toBeInTheDocument()
    expect(await screen.findByText('Classe não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão diz que precisa de internet e não consulta', async () => {
    estado.modo = 'SEM_CONEXAO'
    let consultas = 0
    servidor.use(http.get('/api/classes/:id/progresso', () => { consultas += 1; return HttpResponse.json(criarProgressoClasse()) }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(consultas).toBe(0)
  })
})
