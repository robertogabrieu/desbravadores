import { screen, within } from '@testing-library/react'
import { delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao, PacoteGuardado } from '../../offline'
import { criarClasse, handlerClasses } from '../../testes/handlers/leitura'
import {
  CLASSE_AMIGO,
  CLASSE_COMPANHEIRO,
  criarClasseDoInstrutor,
  criarInicioInstrutor,
  handlerErroInicioInstrutor,
  handlerInicioInstrutor,
} from '../../testes/handlers/instrutor'
import { criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaClasses } from './TelaClasses'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, pacote: null as PacoteGuardado['pacote'] }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
  usePacote: () => ({ pacote: offline.pacote, carregando: false, baixadoEm: null }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.pacote = null
})

const guardarPacote = () => {
  offline.pacote = criarPacote({
    instrutor: {
      classes: [criarClasseInstrutor({ classe: CLASSE_AMIGO, aulasProximas: [{ aulaPlanejadaId: uuid(50), data: '2030-09-27', horario: '09:15', titulo: 'Descoberta espiritual', requisitoIds: [] }] })],
      pontosRequisito: { pontos: 5, ativo: true },
    },
  })
}

function abrir() {
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO, CLASSE_COMPANHEIRO] })]), handlerClasses([criarClasse({ id: CLASSE_AMIGO.id, idade: 10 })]))
  return renderizarRotas([{ path: '/classes', element: <TelaClasses /> }], '/classes')
}

describe('minhas classes', () => {
  it('um cartão por classe com tipo, idade, DBVs, progresso, próxima aula, aulas dadas, atalhos e rodapé', async () => {
    servidor.use(
      handlerInicioInstrutor(
        criarInicioInstrutor({ classes: [criarClasseDoInstrutor(), criarClasseDoInstrutor({ classe: CLASSE_COMPANHEIRO, progressoMedio: null, proximaAula: null, aulasDadas: 1, totalDbvs: 0 })] }),
      ),
    )
    abrir()
    const amigo = (await screen.findByRole('heading', { name: 'Amigo' })).closest('article')
    expect(amigo).not.toBeNull()
    const cartao = within(amigo as HTMLElement)
    expect(await cartao.findByText('Classe regular · 10 anos')).toBeInTheDocument()
    expect(cartao.getByText('9 DBVs')).toBeInTheDocument()
    expect(cartao.getByText('64%')).toBeInTheDocument()
    expect(cartao.getByText('Próxima aula: 27 set')).toBeInTheDocument()
    expect(cartao.getByText('11 aulas dadas')).toBeInTheDocument()
    expect(cartao.getByRole('link', { name: 'Cronograma' })).toHaveAttribute('href', `/cronograma?classe=${CLASSE_AMIGO.id}`)
    expect(cartao.getByRole('link', { name: 'Progresso' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/progresso`)
    expect(cartao.getByRole('link', { name: 'Materiais' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/materiais`)
    const companheiro = within((screen.getByRole('heading', { name: 'Companheiro' })).closest('article') as HTMLElement)
    expect(companheiro.getByText('—')).toBeInTheDocument()
    expect(companheiro.getByText('1 aula dada')).toBeInTheDocument()
    expect(companheiro.getByText('Nenhuma aula publicada ainda')).toBeInTheDocument()
    expect(screen.getByText('As classes são atribuídas pelo Adm do clube.')).toBeInTheDocument()
  })

  it('pinta o topo do cartão com a cor da classe', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir()
    const topo = (await screen.findByRole('heading', { name: 'Amigo' })).parentElement
    expect(topo?.style.backgroundColor).toBe('var(--classe-amigo)')
  })

  it('sem classe explica que o Adm atribui', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [] })))
    abrir()
    expect(await screen.findByText('Você ainda não tem classes. O Adm do clube as atribui.')).toBeInTheDocument()
  })

  it('mostra carregando enquanto espera', async () => {
    servidor.use(http.get('/api/inicio/instrutor', () => delay('infinite')))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando as classes' })).toBeInTheDocument()
  })

  it('mostra o erro da API', async () => {
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor' }))
    abrir()
    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument()
  })

  it('sem conexão e sem pacote baixado diz que precisa de internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('sem conexão, com pacote: lista a classe com "Registrar aula" e sem progresso', async () => {
    offline.modo = 'SEM_CONEXAO'
    guardarPacote()
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir()
    expect(await screen.findByText('Sem conexão: dá para registrar a aula; o resto volta com a internet.')).toBeInTheDocument()
    const cartao = screen.getByRole('region', { name: 'Classe Amigo' })
    expect(within(cartao).getByRole('link', { name: 'Registrar aula' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}`)
    expect(screen.queryByText('Progresso médio')).not.toBeInTheDocument()
  })
})

describe('atalhos no cartão da classe', () => {
  it('Observações e Especialidades viram botões no cartão, ao lado de Cronograma, Progresso e Materiais', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor()] })))
    abrir()
    const amigo = within((await screen.findByRole('heading', { name: 'Amigo' })).closest('article') as HTMLElement)
    expect(amigo.getByRole('link', { name: 'Observações' })).toHaveAttribute('href', `/observacoes?classe=${CLASSE_AMIGO.id}`)
    expect(amigo.getByRole('link', { name: 'Especialidades' })).toHaveAttribute('href', `/especialidades?classe=${CLASSE_AMIGO.id}`)
  })

  it('o cartão usa o contorno de controle', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor()] })))
    abrir()
    const artigo = (await screen.findByRole('heading', { name: 'Amigo' })).closest('article')
    expect(artigo).toHaveClass('border-borda-controle')
  })
})
