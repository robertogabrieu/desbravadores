import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { handlerClasses } from '../../testes/handlers/leitura'
import {
  ATUALIZADO_EM,
  CLASSE_MONTAGEM,
  CRONOGRAMA_ID,
  REQ_CAMPO,
  REQ_EM_CONFLITO,
  REQ_LIVRE,
  criarDataMontagem,
  criarMontagem,
  criarMontagemDeExemplo,
  criarRequisitoMontagem,
  handlerErroMontagem,
  handlersMontagem,
} from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { GuardaRota } from '../../sessao/GuardaRota'
import { rotasCronogramaMontagem } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const rotas = [
  { element: <GuardaRota papeis={['INSTRUTOR', 'ADM']} />, children: [...rotasCronogramaMontagem, { path: '/cronograma', element: <p>leitura do cronograma</p> }] },
]

function abrir(montagem = criarMontagemDeExemplo()) {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM] })]), handlerClasses(), ...handlers)
  renderizarRotas(rotas, '/cronograma/montar')
  return registro
}

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement

describe('I3b · data em conflito', () => {
  it('individual: "+" some na data em conflito que não é bloqueio; agrupada mantém', async () => {
    const conflito = criarDataMontagem('2026-10-04', { aulaId: uuid(2001), conflito: true })
    abrir(criarMontagem({ datasLivres: false, datas: [conflito] }))
    await screen.findByText(/requisitos com data/)
    expect(within(linha('2026-10-04')).queryByRole('button', { name: 'Adicionar requisito nesta data' })).not.toBeInTheDocument()
  })

  it('agrupada: a data em conflito mantém o "+"', async () => {
    const conflito = criarDataMontagem('2026-10-04', { aulaId: uuid(2001), conflito: true })
    abrir(criarMontagem({ datasLivres: true, datas: [conflito] }))
    await screen.findByText(/requisitos com data/)
    expect(within(linha('2026-10-04')).getByRole('button', { name: 'Adicionar requisito nesta data' })).toBeInTheDocument()
  })
})

describe('I3b · achados de montagem', () => {
  it('dia de reunião cancelado sem aula: hachurado, com o texto e sem "+"', async () => {
    const situacao = { cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: false, eventos: ['Retiro da igreja'] }
    abrir(criarMontagem({ datas: [criarDataMontagem('2026-10-11', { situacao })] }))
    await screen.findByText(/requisitos com data/)
    const bloqueada = linha('2026-10-11')
    expect(bloqueada).toHaveAttribute('data-estado', 'bloqueada')
    expect(within(bloqueada).getByText('Retiro da igreja · sem aula de classe')).toBeInTheDocument()
    expect(within(bloqueada).queryByRole('button', { name: 'Adicionar requisito nesta data' })).not.toBeInTheDocument()
  })

  it('"Remover aula" pede confirmação e chama DELETE; aula dada não tem o botão', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/requisitos com data/)
    expect(within(linha('2026-11-01')).queryByRole('button', { name: 'Remover aula' })).not.toBeInTheDocument()
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Remover aula' }))
    expect(registro.chamadas).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/aulas-planejadas/${uuid(2001)}` })
  })

  it('classe desativada (422): mostra a mensagem na faixa', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/requisitos com data/)
    registro.falharProxima(422, { codigo: 'VALIDACAO', mensagem: 'Esta classe está desativada no clube.' })
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Remover aula' }))
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Esta classe está desativada no clube.')).toBeInTheDocument()
  })
})

describe('I3b · quatro estados', () => {
  it('carregando, depois o conteúdo', async () => {
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando cronograma' })).toBeInTheDocument()
    await screen.findByText('3 de 5 requisitos com data')
  })

  it('erro: mostra "Tentar de novo"', async () => {
    servidor.use(
      ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM] })]),
      handlerClasses(),
      handlerErroMontagem(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falhou' }),
    )
    renderizarRotas(rotas, '/cronograma/montar')
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão: avisa e não oferece ação', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar para o Adm publicar' })).not.toBeInTheDocument()
  })

  it('vazio: cronograma ainda não criado pede ao Adm', async () => {
    abrir(criarMontagem({ cronograma: null }))
    expect(await screen.findByText('O cronograma ainda não foi criado')).toBeInTheDocument()
  })
})

describe('I3b · montar', () => {
  it('abas: contador, barra e a lista dos requisitos sem data com CAMPO', async () => {
    abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    expect(screen.getByText('2 sem data')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Requisitos com data' })).toHaveAttribute('aria-valuenow', '60')
    await usuario.click(screen.getByRole('tab', { name: 'Sem data (2)' }))
    expect(screen.getByText(REQ_LIVRE.texto)).toBeInTheDocument()
    expect(screen.getByText(REQ_CAMPO.texto)).toBeInTheDocument()
    expect(screen.getByText('CAMPO')).toBeInTheDocument()
  })

  it('"+" abre a folha e cada requisito marcado grava com PUT', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Adicionar requisito nesta data' }))
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_LIVRE.texto) }))
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_CAMPO.texto) }))
    await usuario.click(screen.getByRole('button', { name: 'Adicionar 2 requisitos' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas.map((chamada) => chamada.metodo)).toEqual(['PUT', 'PUT'])
    expect(registro.chamadas[0]).toMatchObject({
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_LIVRE.id}`,
      corpo: { data: '2026-10-04' },
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Adicionar em/ })).not.toBeInTheDocument())
  })

  it('data de campo: os de campo vêm primeiro, "Sugerido para este dia"', async () => {
    abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    await usuario.click(within(linha('2026-10-18')).getByRole('button', { name: 'Adicionar requisito nesta data' }))
    const folha = screen.getByRole('dialog', { name: 'Adicionar em 18/10' })
    const opcoes = within(folha).getAllByRole('button', { pressed: false })
    expect(opcoes[0]).toHaveTextContent(REQ_CAMPO.texto)
    expect(within(folha).getAllByText('Sugerido para este dia')).toHaveLength(1)
  })

  it('folha sem requisitos livres diz que todos já têm data', async () => {
    const todosComData = criarMontagemDeExemplo({
      requisitos: [criarRequisitoMontagem(1, { data: '2026-10-04', aulaId: uuid(2001) })],
    })
    abrir(todosComData)
    const usuario = userEvent.setup()
    await screen.findByText('1 de 1 requisitos com data')
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Adicionar requisito nesta data' }))
    expect(within(screen.getByRole('dialog')).getByText('Todos os requisitos já têm data')).toBeInTheDocument()
  })

  it('data bloqueada e aula dada não têm "+"', async () => {
    abrir()
    await screen.findByText('3 de 5 requisitos com data')
    expect(within(linha('2026-10-11')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(linha('2026-10-11')).getByText('Feriado prolongado · sem aula de classe')).toBeInTheDocument()
    const dada = linha('2026-11-01')
    expect(within(dada).getByText('Aula dada')).toBeInTheDocument()
    expect(within(dada).queryByRole('button')).not.toBeInTheDocument()
  })

  it('conflito fica em vermelho e "Mover" leva a uma data que aceita aula', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    const conflito = linha('2026-10-25')
    expect(conflito).toHaveAttribute('data-estado', 'conflito')
    await usuario.click(within(conflito).getByRole('button', { name: 'Mover' }))
    const folha = screen.getByRole('dialog', { name: `Mover ${REQ_EM_CONFLITO.codigo} para` })
    expect(within(folha).queryByRole('button', { name: /11\/10/ })).not.toBeInTheDocument()
    await usuario.click(within(folha).getByRole('button', { name: /04\/10/ }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'PUT', corpo: { data: '2026-10-04' } })
  })

  it('tira um requisito da data com DELETE', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    await usuario.click(screen.getAllByRole('button', { name: /^Tirar R3/ })[0])
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE' })
  })

  it('edita horário, local e título da aula', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: /Editar horário/ }))
    await usuario.type(screen.getByLabelText('Local'), ' externa')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'PATCH', corpo: { horario: '09:15', local: 'Sala 2 externa', titulo: null } })
  })
})

describe('I3b · enviar e concorrência', () => {
  it('"Enviar para o Adm publicar" pede confirmação e leva o atualizadoEm visto', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    await usuario.click(screen.getByRole('button', { name: 'Enviar para o Adm publicar' }))
    expect(registro.chamadas).toHaveLength(0)
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/enviar`,
      corpo: { atualizadoEmVisto: ATUALIZADO_EM },
    })
  })

  it('já enviado: o botão de enviar fica desligado', async () => {
    const enviado = criarMontagemDeExemplo()
    if (enviado.cronograma) enviado.cronograma.status = 'ENVIADO'
    abrir(enviado)
    await screen.findByText('3 de 5 requisitos com data')
    expect(screen.getByRole('button', { name: 'Enviar para o Adm publicar' })).toBeDisabled()
  })

  it('409 mostra a faixa e "Atualizar" refaz a busca', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText('3 de 5 requisitos com data')
    const mensagem = 'O cronograma mudou desde que você abriu. Revise antes de publicar.'
    registro.falharProxima(409, { codigo: 'CONFLITO', mensagem })
    await usuario.click(screen.getByRole('button', { name: 'Enviar para o Adm publicar' }))
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(registro.leituras).toBe(2))
  })
})
