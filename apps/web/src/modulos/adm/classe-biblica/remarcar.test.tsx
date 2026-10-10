import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { RequestHandler } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import type { ModoConexao } from '../../../offline'
import {
  EDICAO_CB_ID,
  ENCONTRO_CB_ID,
  criarEncontroCB,
  criarEncontroDetalhe,
  handlersClasseBiblica,
} from '../../../testes/handlers/classe-biblica'
import type { DadosClasseBiblica } from '../../../testes/handlers/classe-biblica'
import { criarVinculo, handlersSessao } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { RemarcarEncontro } from './RemarcarEncontro'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, fuso: undefined as string | undefined }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
  usePacote: () => ({ pacote: conexao.fuso ? { clube: { fuso: conexao.fuso } } : undefined }),
}))

beforeEach(() => {
  conexao.modo = 'ONLINE'
  conexao.fuso = undefined
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-10T15:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

interface Gravacao { metodo: string; caminho: string; corpo: unknown }

const ROTAS: RouteObject[] = [
  { path: '/adm/classe-biblica/:id', element: <h1>Painel da edição</h1> },
  { path: '/adm/classe-biblica/encontros/:id/remarcar', element: <RemarcarEncontro /> },
]

function abrir(dados: DadosClasseBiblica = {}, ...extras: RequestHandler[]) {
  const gravacoes: Gravacao[] = []
  servidor.use(
    ...handlersSessao([criarVinculo('ADM')], undefined, ['classebiblica.gerenciar']),
    ...handlersClasseBiblica({ ...dados, aoGravar: (metodo, caminho, corpo) => gravacoes.push({ metodo, caminho, corpo }) }),
  )
  servidor.use(...extras)
  return { ...renderizarRotas(ROTAS, `/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/remarcar`), gravacoes }
}

async function escolherData(usuario: ReturnType<typeof userEvent.setup>, data: string) {
  const campo = await screen.findByLabelText('Nova data')
  await usuario.clear(campo)
  await usuario.type(campo, data)
}

describe('Remarcar o encontro', () => {
  it('mostra o encontro e, com a data livre, remarca e volta ao painel', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Encontro de domingo, 18/10' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para 2026 · 2º semestre' })).toHaveAttribute('href', `/adm/classe-biblica/${EDICAO_CB_ID}`)
    expect(screen.getByText('Classe Bíblica 2026 · 2º semestre')).toBeInTheDocument()
    expect(screen.getByText('Vale para os dois grupos. O calendário do clube muda junto.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Remarcar para outra data' })).toBeChecked()

    await escolherData(usuario, '2026-10-24')
    expect(await screen.findByText('Sábado, 24/10 — dia livre no calendário')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remarcar para sábado, 24/10' }))

    expect(await screen.findByRole('heading', { name: 'Painel da edição' })).toBeInTheDocument()
    expect(gravacoes).toContainEqual({
      metodo: 'POST', caminho: `/api/classe-biblica/encontros/${ENCONTRO_CB_ID}/remarcar`, corpo: { data: '2026-10-24' },
    })
  })

  it('manda o horário só quando muda', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    await escolherData(usuario, '2026-10-24')
    const horario = screen.getByLabelText('Horário')
    await usuario.clear(horario)
    await usuario.type(horario, '15:00')
    await usuario.click(screen.getByRole('button', { name: 'Remarcar para sábado, 24/10' }))
    await waitFor(() => expect(gravacoes.at(-1)?.corpo).toEqual({ data: '2026-10-24', horario: '15:00' }))
  })

  it('data em feriado mostra o aviso e deixa seguir', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    await escolherData(usuario, '2026-10-12')
    expect(await screen.findByText('12/10 cai em Feriado: Nossa Senhora Aparecida.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remarcar para segunda, 12/10' }))
    await waitFor(() => expect(gravacoes.at(-1)?.corpo).toEqual({ data: '2026-10-12' }))
  })

  it.each([
    ['2026-10-25', 'Já há outro encontro desta edição em 25/10.'],
    ['2026-12-20', 'Escolha uma data entre 16/08 e 13/12, o período da edição.'],
    ['2026-10-05', 'Escolha uma data a partir de hoje.'],
  ])('data %s não se envia', async (data, mensagem) => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    await escolherData(usuario, data)
    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /^Remarcar/ }))
    expect(gravacoes).toHaveLength(0)
  })

  it('recusa do servidor aparece na tela', async () => {
    const usuario = userEvent.setup()
    abrir({}, http.post('/api/classe-biblica/encontros/:id/remarcar', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Data ocupada.' }, { status: 422 })))
    await escolherData(usuario, '2026-10-24')
    await usuario.click(screen.getByRole('button', { name: 'Remarcar para sábado, 24/10' }))
    expect(await screen.findByText('Data ocupada.')).toBeInTheDocument()
  })
})

describe('Remarcar — "hoje" no fuso do clube', () => {
  it('no fuso configurado, a data que já passou lá é recusada', async () => {
    const usuario = userEvent.setup()
    vi.setSystemTime(new Date('2026-10-14T02:30:00.000Z'))
    conexao.fuso = 'Europe/Lisbon'
    abrir()
    await escolherData(usuario, '2026-10-13')
    expect(await screen.findByText('Escolha uma data a partir de hoje.')).toBeInTheDocument()
  })

  it('no fuso padrão, a mesma data ainda é hoje e fica livre', async () => {
    const usuario = userEvent.setup()
    vi.setSystemTime(new Date('2026-10-14T02:30:00.000Z'))
    abrir()
    await escolherData(usuario, '2026-10-13')
    expect(await screen.findByText('Terça, 13/10 — dia livre no calendário')).toBeInTheDocument()
  })
})

describe('Cancelar o encontro', () => {
  it('pede o motivo e a confirmação antes de cancelar', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    await usuario.click(await screen.findByRole('radio', { name: 'Cancelar este encontro' }))
    expect(screen.getByText('O encontro sai das contas de frequência. Dá para desfazer até a data dele.')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cancelar o encontro de 18/10' }))
    expect(await screen.findByText('Escreva o motivo')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Motivo (aparece no calendário)'), 'chuva forte')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar o encontro de 18/10' }))
    const dialogo = await screen.findByRole('dialog')
    expect(gravacoes).toHaveLength(0)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar o encontro' }))

    expect(await screen.findByRole('heading', { name: 'Painel da edição' })).toBeInTheDocument()
    expect(gravacoes).toContainEqual({
      metodo: 'POST', caminho: `/api/classe-biblica/encontros/${ENCONTRO_CB_ID}/cancelar`, corpo: { motivo: 'chuva forte' },
    })
  })

  it('"Voltar" na confirmação não cancela', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir()
    await usuario.click(await screen.findByRole('radio', { name: 'Cancelar este encontro' }))
    await usuario.type(screen.getByLabelText('Motivo (aparece no calendário)'), 'chuva forte')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar o encontro de 18/10' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gravacoes).toHaveLength(0)
  })

  it('cancelado com "Desfazer" disponível desfaz', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir({
      encontro: criarEncontroDetalhe({ encontro: criarEncontroCB({ cancelado: true, motivo: 'chuva forte', podeDesfazer: true }) }),
    })
    expect(await screen.findByText('Este encontro foi cancelado: chuva forte.')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Desfazer o cancelamento' }))
    expect(await screen.findByRole('heading', { name: 'Painel da edição' })).toBeInTheDocument()
    expect(gravacoes.at(-1)).toMatchObject({ metodo: 'POST', caminho: `/api/classe-biblica/encontros/${ENCONTRO_CB_ID}/desfazer-cancelamento` })
  })

  it('cancelado depois da data (ou com a data ocupada) não oferece "Desfazer"', async () => {
    abrir({
      encontro: criarEncontroDetalhe({ encontro: criarEncontroCB({ cancelado: true, motivo: 'chuva forte', podeDesfazer: false }) }),
    })
    expect(await screen.findByText('Este encontro foi cancelado: chuva forte.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desfazer o cancelamento' })).not.toBeInTheDocument()
  })
})

describe('Encontro com chamada', () => {
  it('mostra o motivo e nenhuma ação', async () => {
    abrir({ encontro: criarEncontroDetalhe({ encontro: criarEncontroCB({ data: '2026-10-04', temChamada: true }) }) })
    expect(await screen.findByText('O encontro de 04/10 já tem chamada feita, por isso não dá para remarcar nem cancelar.')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remarcar|Cancelar/ })).not.toBeInTheDocument()
  })
})

describe('Remarcar — quatro estados', () => {
  it('carregando', async () => {
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando o encontro' })).toBeInTheDocument()
    await screen.findByRole('heading', { level: 1, name: 'Encontro de domingo, 18/10' })
  })

  it('vazio: encontro que não existe ou não é do clube', async () => {
    abrir({}, http.get('/api/classe-biblica/encontros/:id', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Encontro não encontrado.' }, { status: 404 })))
    expect(await screen.findByText('Encontro não encontrado.')).toBeInTheDocument()
  })

  it('erro mostra a mensagem e o "Tentar de novo"', async () => {
    abrir({}, http.get('/api/classe-biblica/encontros/:id', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou aqui.' }, { status: 500 })))
    expect(await screen.findByText('Falhou aqui.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão mostra que a tela depende da internet', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir({}, http.get('/api/classe-biblica/encontros/:id', () => HttpResponse.error()))
    await waitFor(() => expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument())
  })
})
