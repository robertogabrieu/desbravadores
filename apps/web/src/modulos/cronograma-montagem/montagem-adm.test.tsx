import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { handlerConfiguracao } from '../../testes/handlers/clube'
import { handlerClasses } from '../../testes/handlers/leitura'
import { criarClasse } from '../../testes/handlers/leitura'
import {
  ATUALIZADO_EM,
  CRONOGRAMA_ID,
  REQ_CAMPO,
  REQ_COLOCADO,
  REQ_LIVRE,
  criarDataMontagem,
  criarMontagem,
  criarMontagemDeExemplo,
  handlerErroMontagem,
  handlersMontagem,
} from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAdmCronogramas } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

afterEach(() => {
  vi.useRealTimers()
})

const CONFLITO = { codigo: 'CONFLITO', mensagem: 'Outra pessoa acabou de mudar esta data. Atualize a tela.' } as const

function abrir(montagem = criarMontagemDeExemplo(), rota = '/adm/cronogramas') {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), ...handlers)
  renderizarRotas(rotasAdmCronogramas, rota)
  return registro
}

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement

describe('A7 · quatro estados', () => {
  it('carregando: mostra o esqueleto até a resposta', async () => {
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando cronograma' })).toBeInTheDocument()
    await screen.findByText(/agendados/)
  })

  it('erro: mostra a mensagem e o botão que busca de novo', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), handlerConfiguracao(), handlerErroMontagem(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falhou' }))
    renderizarRotas(rotasAdmCronogramas, '/adm/cronogramas')
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão: avisa e não oferece ação', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument()
  })

  it('vazio: sem cronograma oferece "Criar cronograma"', async () => {
    abrir(criarMontagem({ cronograma: null }))
    expect(await screen.findByRole('button', { name: 'Criar cronograma' })).toBeInTheDocument()
  })
})

describe('A7 · criar cronograma', () => {
  it('cria com o ano do clube como período padrão', async () => {
    const registro = abrir(criarMontagem({ cronograma: null }))
    const usuario = userEvent.setup()
    const botao = await screen.findByRole('button', { name: 'Criar cronograma' })
    await waitFor(() => expect(botao).toBeEnabled())
    await usuario.click(botao)
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    const ano = new Date().getFullYear()
    const fimDoAno = new Date(Date.UTC(ano + 1, 2, 0)).toISOString().slice(0, 10)
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/api/cronogramas',
      corpo: { classeId: uuid(100), anoClube: ano, inicio: `${ano}-03-01`, fim: fimDoAno },
    })
  })
})

describe('A7 · ano do clube', () => {
  it('em janeiro, antes do início do ano do clube, abre e cria o ano anterior', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-01-15T15:00:00.000Z') })
    const registro = abrir(criarMontagem({ cronograma: null }))
    const usuario = userEvent.setup()
    const botao = await screen.findByRole('button', { name: 'Criar cronograma' })
    await waitFor(() => expect(botao).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'Ano do clube' })).toHaveValue('2026')
    await usuario.click(botao)
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ corpo: { anoClube: 2026, inicio: '2026-03-01', fim: '2027-02-28' } })
  })
})

describe('A7 · montar', () => {
  it('mostra o contador real, o selo, "agendado · dd/mm" e "sem data"', async () => {
    abrir()
    expect(await screen.findByText('3/5 agendados')).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByText('agendado · 04/10')).toBeInTheDocument()
    expect(screen.getAllByText('sem data')).toHaveLength(2)
  })

  it('"Quem monta" é só leitura, com link para Classes', async () => {
    abrir()
    const link = await screen.findByRole('link', { name: 'Alterar em Classes' })
    expect(link).toHaveAttribute('href', `/adm/classes?classe=${uuid(100)}`)
    expect(screen.getByText('Adm', { selector: 'strong' })).toBeInTheDocument()
  })

  it('escolhe um requisito e "Colocar aqui" grava a data; sem escolha o botão fica desligado', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    expect(screen.getByRole('button', { name: 'Colocar aqui em 04/10' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_LIVRE.texto) }))
    await usuario.click(screen.getByRole('button', { name: 'Colocar aqui em 04/10' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'PUT',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_LIVRE.id}`,
      corpo: { data: '2026-10-04' },
    })
  })

  it('"Colocar aqui" move um requisito que já tinha data', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_COLOCADO.texto) }))
    await usuario.click(screen.getByRole('button', { name: 'Colocar aqui em 18/10' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'PUT', corpo: { data: '2026-10-18' } })
  })

  it('tirar um requisito da data chama DELETE', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    await usuario.click(screen.getByRole('button', { name: `remover ${REQ_COLOCADO.codigo} desta data` }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_COLOCADO.id}` })
  })

  it('data bloqueada: hachurada, com o texto do evento e sem "Colocar aqui"', async () => {
    abrir()
    await screen.findByText(/agendados/)
    const bloqueada = linha('2026-10-11')
    expect(bloqueada).toHaveAttribute('data-estado', 'bloqueada')
    expect(within(bloqueada).getByText('Feriado prolongado · sem aula de classe')).toBeInTheDocument()
    expect(within(bloqueada).queryByRole('button', { name: /Colocar aqui/ })).not.toBeInTheDocument()
  })

  it('classe individual: data em conflito que ainda é dia de aula não aceita requisito novo; agrupada aceita', async () => {
    const conflito = criarDataMontagem('2026-10-04', { aulaId: uuid(2001), conflito: true })
    abrir(criarMontagem({ datasLivres: false, datas: [conflito] }))
    await screen.findByText(/agendados/)
    expect(within(linha('2026-10-04')).queryByRole('button', { name: /Colocar aqui/ })).not.toBeInTheDocument()
  })

  it('classe agrupada: a mesma data em conflito mantém "Colocar aqui"', async () => {
    const conflito = criarDataMontagem('2026-10-04', { aulaId: uuid(2001), conflito: true })
    abrir(criarMontagem({ datasLivres: true, datas: [conflito] }))
    await screen.findByText(/agendados/)
    expect(within(linha('2026-10-04')).getByRole('button', { name: /Colocar aqui/ })).toBeInTheDocument()
  })

  it('data de campo fica verde só quando o requisito escolhido é de campo', async () => {
    abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    expect(within(linha('2026-10-18')).getByText('Acampamento do clube · ótimo para campo')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_LIVRE.texto) }))
    expect(linha('2026-10-18')).toHaveAttribute('data-estado', 'livre')
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_CAMPO.texto) }))
    expect(linha('2026-10-18')).toHaveAttribute('data-estado', 'campo')
  })

  it('conflito fica em vermelho; aula dada é travada, sem "Colocar aqui", remover nem editar', async () => {
    abrir()
    await screen.findByText(/agendados/)
    expect(linha('2026-10-25')).toHaveAttribute('data-estado', 'conflito')
    const dada = linha('2026-11-01')
    expect(within(dada).getByText('Aula dada')).toBeInTheDocument()
    expect(within(dada).queryByRole('button')).not.toBeInTheDocument()
  })

  it('edita horário, local e título da aula', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: /Editar horário/ }))
    const titulo = screen.getByLabelText('Título')
    await usuario.type(titulo, 'Nós e amarras')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'PATCH',
      caminho: `/api/aulas-planejadas/${uuid(2001)}`,
      corpo: { horario: '09:15', local: 'Sala 2', titulo: 'Nós e amarras' },
    })
  })

  it('Agrupadas: "+ Nova aula" cria a aula na data escolhida', async () => {
    const registro = abrir(criarMontagemDeExemplo({ datasLivres: true, datas: [criarDataMontagem('2026-10-04', { aulaId: uuid(2001) })] }))
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: '+ Nova aula' }))
    await usuario.type(screen.getByLabelText('Data'), '2026-12-20')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/aulas`,
      corpo: { data: '2026-12-20', horario: null, local: null, titulo: null },
    })
  })

  it('alternador: com regular e avançada, Avançada troca a classe da busca', async () => {
    const avancada = criarClasse({ id: uuid(101), nome: 'Amigo avançada', tipo: 'AVANCADA', classeBaseId: uuid(100), ordem: 2 })
    const { handlers, registro } = handlersMontagem(criarMontagemDeExemplo())
    servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses([criarClasse(), avancada]), ...handlers)
    renderizarRotas(rotasAdmCronogramas, '/adm/cronogramas')
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    await usuario.click(screen.getByRole('radio', { name: 'Avançada' }))
    await waitFor(() => expect(registro.leituras).toBe(2))
    expect(screen.getByRole('radio', { name: 'Avançada' })).toBeChecked()
  })
})

const SEM_REUNIAO = { cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: false, eventos: ['Retiro da igreja'] }

describe('A7 · achados de montagem', () => {
  it('dia de reunião cancelado sem aula: hachurado, com o texto e sem "Colocar aqui"', async () => {
    abrir(criarMontagem({ datas: [criarDataMontagem('2026-10-11', { situacao: SEM_REUNIAO })], requisitos: [REQ_LIVRE] }))
    await screen.findByText(/agendados/)
    const bloqueada = linha('2026-10-11')
    expect(bloqueada).toHaveAttribute('data-estado', 'bloqueada')
    expect(within(bloqueada).getByText('Retiro da igreja · sem aula de classe')).toBeInTheDocument()
    expect(within(bloqueada).queryByRole('button', { name: /Colocar aqui/ })).not.toBeInTheDocument()
  })

  it('o requisito de cada data tem o texto visível "remover" e mantém o nome acessível', async () => {
    abrir()
    await screen.findByText(/agendados/)
    const botao = within(linha('2026-10-04')).getByRole('button', { name: `remover ${REQ_COLOCADO.codigo} desta data` })
    expect(botao).toHaveTextContent('remover')
  })

  it('"Colocar aqui" some na data que já tem o requisito selecionado', async () => {
    abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_COLOCADO.texto) }))
    expect(screen.queryByRole('button', { name: 'Colocar aqui em 04/10' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colocar aqui em 18/10' })).toBeInTheDocument()
  })

  it('"Remover aula" pede confirmação e chama DELETE da aula; aula dada não tem o botão', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
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
    await screen.findByText(/agendados/)
    registro.falharProxima(422, { codigo: 'VALIDACAO', mensagem: 'Esta classe está desativada no clube.' })
    await usuario.click(screen.getByRole('button', { name: `remover ${REQ_COLOCADO.codigo} desta data` }))
    expect(await screen.findByText('Esta classe está desativada no clube.')).toBeInTheDocument()
  })
})

describe('A7 · concorrência e publicação', () => {
  it('409: mostra a faixa e "Atualizar" refaz a busca', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    registro.falharProxima(409, CONFLITO)
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_LIVRE.texto) }))
    await usuario.click(screen.getByRole('button', { name: 'Colocar aqui em 04/10' }))
    expect(await screen.findByText(CONFLITO.mensagem)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(registro.leituras).toBe(2))
    await waitFor(() => expect(screen.queryByText(CONFLITO.mensagem)).not.toBeInTheDocument())
  })

  it('422 mostra a mensagem sem botão Atualizar', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    registro.falharProxima(422, { codigo: 'VALIDACAO', mensagem: 'Esta aula já foi dada.' })
    await usuario.click(screen.getByRole('button', { name: `remover ${REQ_COLOCADO.codigo} desta data` }))
    expect(await screen.findByText('Esta aula já foi dada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument()
  })

  it('Publicar envia o atualizadoEm visto e o selo passa a Publicado', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    const publicado = criarMontagemDeExemplo()
    if (publicado.cronograma) publicado.cronograma.status = 'PUBLICADO'
    registro.responder(publicado)
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/publicar`,
      corpo: { atualizadoEmVisto: ATUALIZADO_EM },
    })
    expect(await screen.findByText('Publicado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled()
  })
})
