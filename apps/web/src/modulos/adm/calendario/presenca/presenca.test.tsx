import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoCalendario } from '../../../../api/calendario'
import type { Presenca } from '../../../../api/presenca'
import { caixa } from '../../../../testes/handlers/caixa'
import { criarEvento, criarEventoEspecial, handlerEvento } from '../../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../../testes/handlers/clube'
import {
  CONCLUIDA_EM,
  criarLinha,
  criarPresenca,
  criarUnidadeDaPresenca,
  erroDaGravacao,
  handlerErroPresenca,
  handlerPresencaNaoEncontrada,
  handlersPresenca,
} from '../../../../testes/handlers/presenca'
import type { OpcoesDaPresenca } from '../../../../testes/handlers/presenca'
import { uuid } from '../../../../testes/handlers/sessao'
import { simularLargura } from '../../../../testes/midia'
import { renderizarRotas } from '../../../../testes/renderizar'
import { servidor } from '../../../../testes/servidor'
import { rotasAdmCalendario } from '../rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const EVENTO_ID = uuid(801)
const ROTA = `/adm/calendario/eventos/${EVENTO_ID}/presenca`

const ANA = criarLinha(1, { nome: 'Ana Clara Souza' })
const DAVI = criarLinha(2, { nome: 'Davi Carvalho' })
const ENZO = criarLinha(3, { nome: 'Enzo Barros' })
const JULIA = criarLinha(4, { nome: 'Júlia Ramos' })
const PEDRO = criarLinha(5, { nome: 'Pedro Henrique Lima' })
const SOLO = criarLinha(6, { nome: 'Zeca Solto' })

const unidades = (linhas = { aguias: [ANA, DAVI, ENZO], leoes: [JULIA, PEDRO], sem: [SOLO] }) => [
  criarUnidadeDaPresenca('Águias', linhas.aguias, uuid(201)),
  criarUnidadeDaPresenca('Leões', linhas.leoes, uuid(202)),
  criarUnidadeDaPresenca('Sem unidade', linhas.sem, null),
]

const eventoDeGala = () => criarEventoEspecial(1, { nome: 'Culto de Ação de Graças', inicio: '2026-10-03', fim: '2026-10-03' })

interface Cenario {
  evento?: EventoCalendario
  presenca?: Presenca
  opcoes?: OpcoesDaPresenca
}

function abrir({ evento = eventoDeGala(), presenca = criarPresenca(unidades()), opcoes }: Cenario = {}) {
  const lista = caixa(presenca)
  servidor.use(handlerEvento(caixa(evento)), handlerConfiguracao(criarConfiguracao()), ...handlersPresenca(lista, opcoes))
  return { lista, ...renderizarRotas(rotasAdmCalendario, ROTA) }
}

/** O `<li>` de uma pessoa, para procurar só dentro dele. */
const linhaDe = (nome: string) => within(screen.getByText(nome).closest('li') as HTMLElement)

/** Guarda o corpo do PUT para o teste conferir e deixa o servidor de mentira responder. */
function registrar(corpos: unknown[], corpo: unknown): undefined {
  corpos.push(corpo)
  return undefined
}

const botaoDeNome = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}`) })

const concluida = () => criarPresenca(unidades({ aguias: [{ ...ANA, foi: true, comUniforme: true }, { ...DAVI, foi: true, comUniforme: true }, ENZO], leoes: [{ ...JULIA, foi: true }, PEDRO], sem: [SOLO] }), { listaConcluidaEm: CONCLUIDA_EM })

beforeEach(() => {
  estado.modo = 'ONLINE'
  simularLargura(360)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('lista "Quem foi" no celular', () => {
  it('abre sem ninguém marcado, por unidade em ordem, só a primeira aberta, com a contagem à vista (C16)', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Quem foi' })).toBeInTheDocument()
    await screen.findByText('Ana Clara Souza')
    expect(screen.getByText('Culto de Ação de Graças · sábado, 3 de outubro')).toBeInTheDocument()
    expect(screen.getByText('Uniforme de gala')).toBeInTheDocument()
    expect(screen.getByText('0 de 6 foram')).toBeInTheDocument()
    expect(screen.getByText('0 de gala')).toBeInTheDocument()

    const cabecalhos = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))
    expect(cabecalhos.map((b) => b.textContent)).toEqual(['Águias0 de 3 foram · 0 de gala', 'Leões0 de 2 foram · 0 de gala', 'Sem unidade0 de 1 foram · 0 de gala'])
    expect(cabecalhos.map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false'])

    expect(screen.getByText('Ana Clara Souza')).toBeInTheDocument()
    expect(screen.queryByText('Júlia Ramos')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Voltar para Culto de Ação de Graças' })).toHaveAttribute('href', `/adm/calendario/eventos/${EVENTO_ID}`)
  })

  it('abre outra unidade ao tocar no cabeçalho dela', async () => {
    abrir()
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(screen.getByRole('button', { name: /^Leões/ }))
    expect(screen.getByText('Júlia Ramos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Leões/ }))
    expect(screen.queryByText('Júlia Ramos')).not.toBeInTheDocument()
  })

  it('tocar no nome mostra "Salvando…", só marca quando o servidor confirma, e diz "Salvo às" no fuso do clube (C17)', async () => {
    let soltar: () => void = () => undefined
    abrir({ opcoes: { antesDeGravar: () => new Promise<undefined>((resolver) => (soltar = () => resolver(undefined))) } })
    await screen.findByText('Ana Clara Souza')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T19:42:00.000Z') })

    expect(linhaDe('Ana Clara Souza').getByRole('button', { name: /De gala/ })).toBeDisabled()
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    expect(await linhaDe('Ana Clara Souza').findByText('Salvando…')).toBeInTheDocument()
    expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/Salvo às/)).not.toBeInTheDocument()

    soltar()
    await waitFor(() => expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'true'))
    expect(linhaDe('Ana Clara Souza').getByText('Foi')).toBeInTheDocument()
    expect(screen.getByText('Salvo às 16:42.')).toBeInTheDocument()
    expect(screen.getByText('1 de 6 foram')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Águias/ })).toHaveTextContent('1 de 3 foram · 0 de gala')
    expect(linhaDe('Ana Clara Souza').getByRole('button', { name: /De gala/ })).toBeEnabled()
  })

  it('a hora do "Salvo às" segue o fuso do clube', async () => {
    const { lista } = abrir()
    servidor.use(handlerConfiguracao(criarConfiguracao({ fuso: 'Asia/Tokyo' })))
    await screen.findByText('Ana Clara Souza')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T19:42:00.000Z') })
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    expect(await screen.findByText('Salvo às 04:42.')).toBeInTheDocument()
    expect(lista.atual.resumo.foram).toBe(1)
  })

  it('a pílula "De gala" liga o uniforme de quem foi e a contagem acompanha', async () => {
    const corpos: unknown[] = []
    abrir({ opcoes: { antesDeGravar: (corpo) => registrar(corpos, corpo) } })
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    await waitFor(() => expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(linhaDe('Ana Clara Souza').getByRole('button', { name: 'De gala' }))
    await waitFor(() => expect(screen.getByText('1 de gala')).toBeInTheDocument())
    expect(corpos).toEqual([{ marcas: [{ dbvId: ANA.dbvId, foi: true }] }, { marcas: [{ dbvId: ANA.dbvId, comUniforme: true }] }])
    expect(screen.getByRole('button', { name: /^Águias/ })).toHaveTextContent('1 de 3 foram · 1 de gala')
  })

  it('"Marcar todos como presentes" e depois "Marcar de gala todos que foram" fazem uma requisição cada (C18)', async () => {
    const corpos: Array<{ marcas: Array<{ dbvId: string; foi?: boolean; comUniforme?: boolean }> }> = []
    abrir({ opcoes: { antesDeGravar: (corpo) => registrar(corpos, corpo) } })
    await screen.findByText('Ana Clara Souza')

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos como presentes' }))
    await waitFor(() => expect(screen.getByText('6 de 6 foram')).toBeInTheDocument())
    expect(corpos).toHaveLength(1)
    expect(corpos[0]?.marcas).toHaveLength(6)
    expect(corpos[0]?.marcas.every((m) => m.foi === true && m.comUniforme === undefined)).toBe(true)

    await userEvent.click(botaoDeNome('Davi Carvalho'))
    await waitFor(() => expect(screen.getByText('5 de 6 foram')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Marcar de gala todos que foram' }))
    await waitFor(() => expect(screen.getByText('5 de gala')).toBeInTheDocument())
    expect(corpos).toHaveLength(3)
    expect(corpos[2]?.marcas).toHaveLength(5)
    expect(corpos[2]?.marcas.every((m) => m.comUniforme === true && m.foi === undefined)).toBe(true)
  })

  it('"Marcar de gala" não toca em quem não foi', async () => {
    const corpos: Array<{ marcas: unknown[] }> = []
    abrir({ presenca: criarPresenca(unidades({ aguias: [{ ...ANA, foi: true }, DAVI, ENZO], leoes: [], sem: [] })), opcoes: { antesDeGravar: (corpo) => registrar(corpos, corpo) } })
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar de gala todos que foram' }))
    await waitFor(() => expect(screen.getByText('1 de gala')).toBeInTheDocument())
    expect(corpos).toEqual([{ marcas: [{ dbvId: ANA.dbvId, comUniforme: true }] }])
  })

  it('uma marca que falha diz o nome e "Tentar de novo" grava só ela; as outras seguem salvas (C20)', async () => {
    const corpos: Array<{ marcas: Array<{ dbvId: string }> }> = []
    let falhar = true
    abrir({
      opcoes: {
        antesDeGravar: (corpo) => {
          corpos.push(corpo as never)
          return falhar && corpo.marcas[0]?.dbvId === ENZO.dbvId ? erroDaGravacao() : undefined
        },
      },
    })
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(botaoDeNome('Enzo Barros'))
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    expect(await screen.findByText('Não salvou a marca de Enzo Barros. Toque em “Tentar de novo”.')).toBeInTheDocument()
    await waitFor(() => expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByText(/Salvo às/)).not.toBeInTheDocument()

    falhar = false
    corpos.length = 0
    await userEvent.click(within(screen.getByText('Enzo Barros').closest('li') as HTMLElement).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(botaoDeNome('Enzo Barros')).toHaveAttribute('aria-pressed', 'true'))
    expect(corpos).toEqual([{ marcas: [{ dbvId: ENZO.dbvId, foi: true }] }])
    expect(screen.queryByText(/Não salvou a marca/)).not.toBeInTheDocument()
    expect(screen.getByText(/Salvo às/)).toBeInTheDocument()
  })

  it('sem internet desliga os toques e a faixa diz quantas marcas não foram salvas e que se perdem (C19)', async () => {
    abrir({ opcoes: { antesDeGravar: () => HttpResponse.error() } })
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(botaoDeNome('Enzo Barros'))
    await screen.findByText('Não salvou a marca de Enzo Barros. Toque em “Tentar de novo”.')

    estado.modo = 'SEM_CONEXAO'
    await userEvent.click(screen.getByRole('button', { name: /^Leões/ }))
    const faixa = await screen.findByText(/Sem internet\. 1 marca ainda não foi salva: Enzo Barros\./)
    expect(faixa).toHaveTextContent('Quando a internet voltar, toque em “Tentar de novo”. Se você fechar esta tela antes, essa marca se perde.')
    expect(faixa.closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByText(/está salvo|já está salvo/)).not.toBeInTheDocument()
    expect(botaoDeNome('Ana Clara Souza')).toBeDisabled()
    expect(botaoDeNome('Júlia Ramos')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Marcar todos como presentes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Concluir a lista' })).toBeDisabled()
  })

  it('sem internet e sem nada pendente, diz que o que foi marcado já está salvo', async () => {
    abrir()
    await screen.findByText('Ana Clara Souza')
    estado.modo = 'SEM_CONEXAO'
    await userEvent.click(screen.getByRole('button', { name: /^Leões/ }))
    expect(await screen.findByText('Sem internet. Conecte-se para marcar mais gente. O que você marcou antes já está salvo.')).toBeInTheDocument()
    expect(linhaDe('Júlia Ramos').getByText('Não foi · trocar só com internet')).toBeInTheDocument()
    expect(botaoDeNome('Júlia Ramos')).toBeDisabled()
  })

  it('a busca filtra pelo nome em todas as unidades, e sem resultado oferece "Limpar a busca" (C22)', async () => {
    abrir()
    await screen.findByText('Ana Clara Souza')
    await userEvent.type(screen.getByLabelText('Buscar pelo nome'), 'julia')
    expect(await screen.findByText('Júlia Ramos')).toBeInTheDocument()
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Buscar pelo nome'))
    await userEvent.type(screen.getByLabelText('Buscar pelo nome'), 'Xuxa')
    expect(await screen.findByText('Ninguém com “Xuxa” na lista.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(screen.getByLabelText('Buscar pelo nome')).toHaveValue('')
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
  })
})

describe('concluir a lista', () => {
  it('diz o efeito antes, manda os totais que o Adm vê e fecha com o que aconteceu (C24)', async () => {
    const corpos: unknown[] = []
    abrir({ opcoes: { aoConcluir: (corpo) => corpos.push(corpo) } })
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    await userEvent.click(botaoDeNome('Davi Carvalho'))
    await waitFor(() => expect(screen.getByText('2 de 6 foram')).toBeInTheDocument())
    await userEvent.click(linhaDe('Ana Clara Souza').getByRole('button', { name: 'De gala' }))
    await waitFor(() => expect(screen.getByText('1 de gala')).toBeInTheDocument())

    expect(screen.getByText('Ao concluir, os 2 que foram ganham os pontos de ir ao evento, e o 1 de gala ganha também os do uniforme. Depois você ainda pode corrigir a lista.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Concluir a lista' }))

    expect(await screen.findByRole('heading', { name: 'Lista concluída' })).toBeInTheDocument()
    expect(corpos).toEqual([{ foram: 2, uniformizados: 1 }])
    expect(screen.getByText('2 desbravadores foram, 1 de gala. Os pontos já estão no ranking de outubro.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao evento' })).toHaveAttribute('href', `/adm/calendario/eventos/${EVENTO_ID}`)
    expect(screen.queryByRole('button', { name: 'Concluir a lista' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todos como presentes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar de gala todos que foram' })).not.toBeInTheDocument()
    // Nada some sozinho: a confirmação continua lá depois de um tempo.
    await new Promise((resolver) => setTimeout(resolver, 200))
    expect(screen.getByText('2 desbravadores foram, 1 de gala. Os pontos já estão no ranking de outubro.')).toBeInTheDocument()
  })

  it('concluir sem ninguém pede confirmação; voltar não conclui e confirmar conclui sem pontos (C26)', async () => {
    const corpos: unknown[] = []
    abrir({ opcoes: { aoConcluir: (corpo) => corpos.push(corpo) } })
    await screen.findByText('Ana Clara Souza')

    await userEvent.click(screen.getByRole('button', { name: 'Concluir a lista' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Concluir sem ninguém?' }))
    expect(dialogo.getByText('Nenhum desbravador foi marcado. O evento fica sem pontos para todos. Você pode voltar e marcar quem foi.')).toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Voltar à lista' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(corpos).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Concluir a lista' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Concluir sem ninguém' }))
    expect(await screen.findByRole('heading', { name: 'Lista concluída' })).toBeInTheDocument()
    expect(corpos).toEqual([{ foram: 0, uniformizados: 0 }])
    expect(screen.getByText('0 desbravadores foram, 0 de gala. Os pontos já estão no ranking de outubro.')).toBeInTheDocument()
  })

  it('se outro Adm marcou alguém no meio, o servidor recusa e a tela diz com os números, e "Ver a lista" atualiza (C27)', async () => {
    const { lista } = abrir()
    await screen.findByText('Ana Clara Souza')
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    await waitFor(() => expect(screen.getByText('1 de 6 foram')).toBeInTheDocument())
    // O outro Adm marcou Júlia depois que esta tela abriu.
    lista.atual = criarPresenca(unidades({ aguias: [{ ...ANA, foi: true }, DAVI, ENZO], leoes: [{ ...JULIA, foi: true }, PEDRO], sem: [SOLO] }))

    await userEvent.click(screen.getByRole('button', { name: 'Concluir a lista' }))
    expect(await screen.findByText('A lista mudou desde que você abriu: agora são 2 que foram, e eram 1. Confira a lista e conclua de novo.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lista concluída' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver a lista' }))
    await waitFor(() => expect(screen.getByText('2 de 6 foram')).toBeInTheDocument())
    expect(screen.queryByText(/A lista mudou desde que você abriu/)).not.toBeInTheDocument()
  })
})

describe('corrigir depois de concluída', () => {
  async function abrirConcluida() {
    const corpos: Array<{ marcas: unknown[] }> = []
    const montado = abrir({ presenca: concluida(), opcoes: { antesDeGravar: (corpo) => registrar(corpos, corpo) } })
    await screen.findByRole('heading', { name: 'Lista concluída' })
    return { ...montado, corpos }
  }

  it('abre a lista concluída com o resumo, sem botões em massa e com as unidades fechadas (C28)', async () => {
    await abrirConcluida()
    expect(screen.getByText('3 desbravadores foram, 2 de gala. Os pontos já estão no ranking de outubro.')).toBeInTheDocument()
    expect(screen.getByText('Para corrigir, abra a unidade e mude a marca. É salvo na hora e os pontos acompanham.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todos como presentes' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(3)
  })

  it('tirar quem foi pede confirmação com os pontos que saem; "Manter na lista" não grava', async () => {
    const { corpos } = await abrirConcluida()
    await userEvent.click(screen.getByRole('button', { name: /^Águias/ }))
    await userEvent.click(botaoDeNome('Ana Clara Souza'))

    const dialogo = within(await screen.findByRole('dialog', { name: 'Tirar Ana Clara Souza da lista?' }))
    expect(dialogo.getByText('Ana Clara Souza perde 30 pontos do ranking de outubro: 20 de ir ao evento e 10 de gala. Você pode marcar de novo depois.')).toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Manter na lista' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(corpos).toHaveLength(0)
    expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Tirar os pontos" grava foi=false e a linha continua na lista', async () => {
    const { corpos } = await abrirConcluida()
    await userEvent.click(screen.getByRole('button', { name: /^Águias/ }))
    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tirar os pontos' }))
    await waitFor(() => expect(botaoDeNome('Ana Clara Souza')).toHaveAttribute('aria-pressed', 'false'))
    expect(corpos).toEqual([{ marcas: [{ dbvId: ANA.dbvId, foi: false }] }])
    expect(linhaDe('Ana Clara Souza').getByText('Não foi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Águias/ })).toHaveTextContent('1 de 3 foram · 1 de gala')
  })

  it('tirar só o uniforme diz quantos pontos saem e que os de ir ficam', async () => {
    const { corpos } = await abrirConcluida()
    await userEvent.click(screen.getByRole('button', { name: /^Águias/ }))
    await userEvent.click(linhaDe('Davi Carvalho').getByRole('button', { name: 'De gala' }))

    const dialogo = within(await screen.findByRole('dialog', { name: 'Tirar o uniforme de gala de Davi Carvalho?' }))
    expect(dialogo.getByText('Davi Carvalho perde 10 pontos do ranking de outubro. Os 20 de ir ao evento ficam. Você pode marcar de novo depois.')).toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Tirar os pontos' }))
    await waitFor(() => expect(corpos).toEqual([{ marcas: [{ dbvId: DAVI.dbvId, comUniforme: false }] }]))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Águias/ })).toHaveTextContent('2 de 3 foram · 1 de gala'))
  })

  it('marcar quem não tinha ido, ou pôr o uniforme, grava na hora, sem confirmação', async () => {
    const { corpos } = await abrirConcluida()
    await userEvent.click(screen.getByRole('button', { name: /^Águias/ }))
    await userEvent.click(botaoDeNome('Enzo Barros'))
    await waitFor(() => expect(botaoDeNome('Enzo Barros')).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(corpos).toEqual([{ marcas: [{ dbvId: ENZO.dbvId, foi: true }] }])
  })
})

describe('o rótulo segue o uniforme do evento', () => {
  it('evento de campo diz "de campo" na pílula, no botão em massa, na contagem e no fechamento', async () => {
    abrir({ evento: criarEventoEspecial(1, { nome: 'Aniversário do clube', inicio: '2026-10-17', fim: '2026-10-17', uniforme: 'CAMPO' }) })
    await screen.findByText('Ana Clara Souza')
    expect(screen.getByText('Uniforme de campo')).toBeInTheDocument()
    expect(screen.getByText('0 de campo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Águias/ })).toHaveTextContent('0 de 3 foram · 0 de campo')
    expect(screen.getByRole('button', { name: 'Marcar de campo todos que foram' })).toBeInTheDocument()
    expect(linhaDe('Enzo Barros').getByRole('button', { name: 'De campo: indisponível porque Enzo não foi' })).toBeDisabled()
    expect(screen.queryByText(/gala/i)).not.toBeInTheDocument()

    await userEvent.click(botaoDeNome('Ana Clara Souza'))
    await userEvent.click(linhaDe('Ana Clara Souza').getByRole('button', { name: 'De campo' }))
    await waitFor(() => expect(screen.getByText('1 de campo')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Concluir a lista' }))
    expect(await screen.findByText('1 desbravador foi, 1 de campo. Os pontos já estão no ranking de outubro.')).toBeInTheDocument()
  })
})

describe('os estados da tela (C49)', () => {
  it('carregando mostra o esqueleto com rótulo', async () => {
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando a lista' })).toBeInTheDocument()
    await screen.findByText('Ana Clara Souza')
    expect(screen.queryByRole('status', { name: 'Carregando a lista' })).not.toBeInTheDocument()
  })

  it('sem desbravador ativo no clube diz o pré-requisito e leva ao cadastro', async () => {
    abrir({ presenca: criarPresenca([]) })
    expect(await screen.findByRole('heading', { name: 'Nenhum desbravador ativo no clube' })).toBeInTheDocument()
    expect(screen.getByText('A lista mostra os desbravadores ativos. Cadastre o primeiro para marcar quem foi ao evento.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar desbravador' })).toHaveAttribute('href', '/adm/desbravadores/novo')
    expect(screen.queryByRole('button', { name: 'Concluir a lista' })).not.toBeInTheDocument()
  })

  it('erro ao abrir tem mensagem própria e "Tentar de novo" repete a leitura', async () => {
    servidor.use(handlerEvento(caixa(eventoDeGala())), handlerConfiguracao(criarConfiguracao()), handlerErroPresenca(500))
    renderizarRotas(rotasAdmCalendario, ROTA)
    expect(await screen.findByText('Não conseguimos abrir a lista agora. Confira a internet e tente de novo.')).toBeInTheDocument()

    servidor.use(...handlersPresenca(caixa(criarPresenca(unidades()))))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
  })

  it('sem internet ao abrir, sem nada guardado, diz que precisa de internet', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(
      handlerConfiguracao(criarConfiguracao()),
      http.get('/api/calendario/eventos/:id', () => HttpResponse.error()),
      http.get('/api/calendario/eventos/:id/presenca', () => HttpResponse.error()),
    )
    renderizarRotas(rotasAdmCalendario, ROTA)
    expect(await screen.findByRole('heading', { name: 'Disponível quando houver internet' })).toBeInTheDocument()
    expect(screen.getByText('Conecte-se para ver esta tela.')).toBeInTheDocument()
  })

  it('antes do dia do evento a lista não abre e diz quando abre (C15)', async () => {
    abrir({ evento: criarEventoEspecial(1, { nome: 'Culto de Investidura', inicio: '2026-10-31', fim: '2026-10-31' }), presenca: criarPresenca(unidades(), { aberta: false }) })
    expect(await screen.findByRole('heading', { name: 'A lista abre no dia do evento' })).toBeInTheDocument()
    expect(screen.getByText('Culto de Investidura é sábado, 31 de outubro. A lista abre nesse dia.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o evento' })).toHaveAttribute('href', `/adm/calendario/eventos/${EVENTO_ID}`)
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluir a lista' })).not.toBeInTheDocument()
  })

  it('evento que não existe responde "Não encontramos este evento"', async () => {
    servidor.use(handlerEvento(caixa(eventoDeGala())), handlerConfiguracao(criarConfiguracao()), handlerPresencaNaoEncontrada())
    renderizarRotas(rotasAdmCalendario, ROTA)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este evento' })).toBeInTheDocument()
    expect(screen.getByText('Ele pode ter sido excluído, ou não ter lista de quem foi. Volte ao calendário e escolha o evento de novo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao calendário' })).toHaveAttribute('href', '/adm/calendario')
  })

  it('evento que não é especial também não tem lista', async () => {
    abrir({ evento: criarEvento(1, { nome: 'Acampamento' }) })
    expect(await screen.findByRole('heading', { name: 'Não encontramos este evento' })).toBeInTheDocument()
  })
})

describe('lista no computador (≥ 900 px)', () => {
  beforeEach(() => simularLargura(1280))

  it('mostra uma tabela com Nome, Foi e Foi de gala, e botão de verdade nas duas colunas', async () => {
    const corpos: Array<{ marcas: unknown[] }> = []
    abrir({ opcoes: { antesDeGravar: (corpo) => registrar(corpos, corpo) } })
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome', 'Foi', 'Foi de gala'])
    expect(within(tabela).getAllByRole('row')).toHaveLength(4)

    const linhaEnzo = within(within(tabela).getByText('Enzo Barros').closest('tr') as HTMLElement)
    expect(linhaEnzo.getByRole('button', { name: 'De gala: indisponível porque Enzo não foi' })).toBeDisabled()
    expect(linhaEnzo.getByText('De gala · só quem foi')).toBeInTheDocument()

    await userEvent.click(linhaEnzo.getByRole('button', { name: 'Não foi' }))
    await waitFor(() => expect(linhaEnzo.getByRole('button', { name: 'Foi' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(linhaEnzo.getByRole('button', { name: 'De gala' }))
    await waitFor(() => expect(linhaEnzo.getByRole('button', { name: 'De gala' })).toHaveAttribute('aria-pressed', 'true'))
    expect(corpos).toEqual([{ marcas: [{ dbvId: ENZO.dbvId, foi: true }] }, { marcas: [{ dbvId: ENZO.dbvId, comUniforme: true }] }])
    expect(screen.getByText('1 de gala')).toBeInTheDocument()
  })

  it('no evento de campo a coluna diz "Foi de campo"', async () => {
    abrir({ evento: criarEventoEspecial(1, { nome: 'Aniversário do clube', inicio: '2026-10-17', fim: '2026-10-17', uniforme: 'CAMPO' }) })
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome', 'Foi', 'Foi de campo'])
  })

  it('depois de concluída, tirar alguém na tabela também pede confirmação', async () => {
    abrir({ presenca: concluida() })
    await screen.findByRole('heading', { name: 'Lista concluída' })
    await userEvent.click(screen.getByRole('button', { name: /^Águias/ }))
    const tabela = await screen.findByRole('table')
    await userEvent.click(within(within(tabela).getByText('Ana Clara Souza').closest('tr') as HTMLElement).getByRole('button', { name: 'Foi' }))
    expect(await screen.findByRole('dialog', { name: 'Tirar Ana Clara Souza da lista?' })).toBeInTheDocument()
  })
})
