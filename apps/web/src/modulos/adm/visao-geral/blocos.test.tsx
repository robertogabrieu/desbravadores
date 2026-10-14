import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import type { RankingUnidades } from '../../../api/ranking'
import type { VisaoGeral } from '../../../api/visao-geral'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { handlerRankingUnidades } from '../../../testes/handlers/ranking'
import { criarRefClasse, criarVisaoGeral, handlerVisaoGeral } from '../../../testes/handlers/visao-geral'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmVisaoGeral } from './rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
}))

beforeEach(() => {
  conexao.modo = 'ONLINE'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T15:00:00Z'))
  servidor.use(handlerConfiguracao(criarConfiguracao()), handlerRankingUnidades([]))
})

afterEach(() => {
  vi.useRealTimers()
})

const abrirCom = (parcial: Partial<VisaoGeral>) => {
  servidor.use(handlerVisaoGeral(criarVisaoGeral(parcial)))
  return renderizarRotas(rotasAdmVisaoGeral, '/adm')
}

const evento = (parcial: Partial<NonNullable<VisaoGeral['proximoEvento']>> = {}): NonNullable<VisaoGeral['proximoEvento']> => ({
  id: uuid(51),
  nome: 'Culto Jovem de Desbravadores',
  tipo: 'EVENTO',
  inicio: '2026-10-17',
  fim: '2026-10-17',
  horario: '19:00',
  local: null,
  ...parcial,
})

describe('próximo evento', () => {
  it('mostra mês e dia, tipo, nome, data com horário e leva à ficha do evento', async () => {
    abrirCom({ proximoEvento: evento() })
    const cartao = await screen.findByRole('link', { name: /Culto Jovem de Desbravadores/ })
    expect(cartao).toHaveAttribute('href', `/adm/calendario/eventos/${uuid(51)}`)
    expect(within(cartao).getByText('Evento do clube')).toBeInTheDocument()
    expect(within(cartao).getByText('Sábado, 17 de outubro · 19h')).toBeInTheDocument()
    expect(within(cartao).getByText('Out')).toBeInTheDocument()
    expect(within(cartao).getByText('17')).toBeInTheDocument()
  })

  it('sem horário a frase fica só com a data; o local vem depois do horário', async () => {
    abrirCom({ proximoEvento: evento({ horario: null }) })
    expect(await screen.findByText('Sábado, 17 de outubro')).toBeInTheDocument()
  })

  it('com horário e local, os dois entram na frase', async () => {
    abrirCom({ proximoEvento: evento({ horario: '09:30', local: 'Salão' }) })
    expect(await screen.findByText('Sábado, 17 de outubro · 9h30 · Salão')).toBeInTheDocument()
  })

  it('evento de um dia que é hoje: "Hoje, ..."', async () => {
    abrirCom({ proximoEvento: evento({ inicio: '2026-10-13', fim: '2026-10-13', horario: null }) })
    expect(await screen.findByText('Hoje, terça-feira, 13 de outubro')).toBeInTheDocument()
  })

  it('evento de vários dias em andamento: "Até ..."', async () => {
    abrirCom({ proximoEvento: evento({ inicio: '2026-10-11', fim: '2026-10-15', horario: null }) })
    expect(await screen.findByText('Até quinta-feira, 15 de outubro')).toBeInTheDocument()
  })

  it('vazio: diz que não há evento e leva ao calendário', async () => {
    abrirCom({ proximoEvento: null })
    expect(await screen.findByText('Nenhum evento marcado à frente.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir calendário' })).toHaveAttribute('href', '/adm/calendario')
  })
})

describe('classes sem cronograma', () => {
  const classes = [
    { classe: criarRefClasse(1, 'Pioneiro'), idade: 13 },
    { classe: criarRefClasse(2, 'Guia'), idade: null },
  ]

  it('lista as classes, o selo traz o número e o cartão diz o que ele conta', async () => {
    abrirCom({ classesSemCronograma: classes })
    const cartao = within(await screen.findByRole('region', { name: '2 classes sem cronograma' }))
    expect(cartao.getByText('2')).toBeInTheDocument()
    expect(cartao.getByRole('link', { name: /Pioneiro/ })).toHaveAttribute('href', `/adm/cronogramas?classe=${uuid(1)}`)
    expect(cartao.getByRole('link', { name: /Guia/ })).toHaveAttribute('href', `/adm/cronogramas?classe=${uuid(2)}`)
    expect(cartao.getAllByText('Montar')).toHaveLength(2)
  })

  it('mostra a idade da classe, no singular com 1 ano, e some quando não há', async () => {
    abrirCom({ classesSemCronograma: [...classes, { classe: criarRefClasse(3, 'Amigo'), idade: 1 }] })
    const cartao = within(await screen.findByRole('region', { name: '3 classes sem cronograma' }))
    expect(cartao.getByText('Pioneiro · 13 anos')).toBeInTheDocument()
    expect(cartao.getByText('Amigo · 1 ano')).toBeInTheDocument()
    expect(cartao.getByText('Guia')).toBeInTheDocument()
  })

  it('clicar em "Montar" abre a montagem da classe', async () => {
    const { roteador } = abrirCom({ classesSemCronograma: classes })
    await userEvent.click(await screen.findByRole('link', { name: /Guia/ }))
    await waitFor(() => expect(roteador.state.location.pathname + roteador.state.location.search).toBe(`/adm/cronogramas?classe=${uuid(2)}`))
  })

  it('uma só classe: nome no singular', async () => {
    abrirCom({ classesSemCronograma: [classes[0]] })
    expect(await screen.findByRole('region', { name: '1 classe sem cronograma' })).toBeInTheDocument()
  })

  it('nenhuma: "tudo em dia", sem selo de alerta', async () => {
    abrirCom({ classesSemCronograma: [] })
    const cartao = within(await screen.findByRole('region', { name: 'Classes sem cronograma' }))
    expect(cartao.getByText('Todas as classes têm cronograma.')).toBeInTheDocument()
    expect(document.querySelector('[data-tom="alerta"]')).toBeNull()
  })
})

describe('unidades sem chamada', () => {
  const unidade = (n: number, conselheiros: string[] = []) => ({ id: uuid(100 + n), nome: `Unidade ${n}`, conselheiros })
  const pendencia = (n: number) => ({ reuniao: '2026-10-11', unidades: Array.from({ length: n }, (_, i) => unidade(i + 1, ['Marcos'])) })

  it('traz a data da reunião, as unidades com conselheiros e leva à ficha de cada uma', async () => {
    abrirCom({ unidades: 2, unidadesSemChamada: pendencia(2) })
    const cartao = within(await screen.findByRole('region', { name: '2 unidades sem chamada' }))
    expect(cartao.getByText('Reunião de domingo, 11/10')).toBeInTheDocument()
    const primeira = cartao.getByRole('link', { name: /Unidade 1/ })
    expect(primeira).toHaveAttribute('href', `/adm/unidades/${uuid(101)}`)
    expect(within(primeira).getByText('Marcos')).toBeInTheDocument()
  })

  it('unidade sem conselheiro diz isso', async () => {
    abrirCom({ unidades: 1, unidadesSemChamada: { reuniao: '2026-10-11', unidades: [unidade(1)] } })
    expect(await screen.findByRole('region', { name: '1 unidade sem chamada' })).toBeInTheDocument()
    expect(screen.getByText('Sem conselheiro')).toBeInTheDocument()
  })

  it('mais de 5: mostra 5 e "E mais N unidades" leva à lista de unidades', async () => {
    abrirCom({ unidades: 8, unidadesSemChamada: pendencia(8) })
    const cartao = within(await screen.findByRole('region', { name: '8 unidades sem chamada' }))
    expect(cartao.getAllByRole('link')).toHaveLength(6)
    expect(cartao.queryByRole('link', { name: /Unidade 6/ })).not.toBeInTheDocument()
    expect(cartao.getByRole('link', { name: 'E mais 3 unidades' })).toHaveAttribute('href', '/adm/unidades')
  })

  it('uma a mais que o limite: "E mais 1 unidade"', async () => {
    abrirCom({ unidades: 6, unidadesSemChamada: pendencia(6) })
    expect(await screen.findByRole('link', { name: 'E mais 1 unidade' })).toBeInTheDocument()
  })

  it('todas lançaram: "tudo em dia", com a data da reunião', async () => {
    abrirCom({ unidades: 3, unidadesSemChamada: { reuniao: '2026-10-11', unidades: [] } })
    const cartao = within(await screen.findByRole('region', { name: 'Unidades sem chamada' }))
    expect(cartao.getByText('Todas as unidades lançaram a chamada.')).toBeInTheDocument()
    expect(cartao.getByText('Reunião de domingo, 11/10')).toBeInTheDocument()
  })

  it('clube sem dia de reunião (nulo): o cartão não aparece', async () => {
    abrirCom({ unidades: 3, unidadesSemChamada: null })
    await screen.findByText('Todas as classes têm cronograma.')
    expect(screen.queryByText('Unidades sem chamada')).not.toBeInTheDocument()
  })

  it('clube sem unidades ativas: o cartão não aparece', async () => {
    abrirCom({ unidades: 0, unidadesSemChamada: { reuniao: '2026-10-11', unidades: [] } })
    await screen.findByText('Todas as classes têm cronograma.')
    expect(screen.queryByText('Unidades sem chamada')).not.toBeInTheDocument()
  })
})

describe('prévia do ranking', () => {
  const unidadeDoRanking = (n: number, mediaPontos: number): RankingUnidades[number] => ({
    posicao: n,
    unidade: { id: uuid(200 + n), nome: `Unidade ${n}` },
    mediaPontos,
    totalDbvs: 8,
  })

  it('mostra o mês, a média com vírgula e o link do ranking completo', async () => {
    servidor.use(handlerRankingUnidades([unidadeDoRanking(1, 82.4), unidadeDoRanking(2, 79)]))
    abrirCom({})
    const secao = within(await screen.findByRole('region', { name: 'Ranking das unidades' }))
    expect(await secao.findByText('82,4 pts')).toBeInTheDocument()
    expect(secao.getByText('79,0 pts')).toBeInTheDocument()
    expect(secao.getByText('Média de pontos por desbravador · outubro')).toBeInTheDocument()
    expect(secao.getByRole('link', { name: 'Ver ranking completo' })).toHaveAttribute('href', '/ranking')
  })

  it('com mais de 5 unidades, mostra só as 5 primeiras', async () => {
    servidor.use(handlerRankingUnidades(Array.from({ length: 7 }, (_, i) => unidadeDoRanking(i + 1, 90 - i))))
    abrirCom({})
    const secao = within(await screen.findByRole('region', { name: 'Ranking das unidades' }))
    expect(await secao.findByText('Unidade 5')).toBeInTheDocument()
    expect(secao.getAllByRole('listitem')).toHaveLength(5)
    expect(secao.queryByText('Unidade 6')).not.toBeInTheDocument()
  })

  it('carregando: o aviso fica dentro do cartão e o resto da tela já aparece', async () => {
    servidor.use(http.get('/api/ranking/unidades', () => new Promise<never>(() => undefined)))
    abrirCom({})
    expect(await screen.findByRole('region', { name: 'Atalhos' })).toBeInTheDocument()
    const secao = within(screen.getByRole('region', { name: 'Ranking das unidades' }))
    expect(secao.getByRole('status', { name: 'Carregando o ranking' })).toBeInTheDocument()
  })

  it('erro: a mensagem e o "Tentar de novo" ficam dentro do cartão, sem derrubar o resto', async () => {
    servidor.use(http.get('/api/ranking/unidades', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha no ranking.' }, { status: 500 })))
    abrirCom({})
    const secao = within(await screen.findByRole('region', { name: 'Ranking das unidades' }))
    expect(await secao.findByText('Falha no ranking.')).toBeInTheDocument()
    expect(secao.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Atalhos' })).toBeInTheDocument()
  })

  it('vazio: sem pontos no mês', async () => {
    servidor.use(handlerRankingUnidades([unidadeDoRanking(1, 0), unidadeDoRanking(2, 0)]))
    abrirCom({})
    expect(await screen.findByText('Ainda não há pontos neste mês.')).toBeInTheDocument()
  })

  it('sem conexão e ranking nunca buscado: o aviso "disponível com internet" dentro do cartão, não o erro', async () => {
    conexao.modo = 'SEM_CONEXAO'
    servidor.use(http.get('/api/ranking/unidades', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha no ranking.' }, { status: 500 })))
    abrirCom({})
    const secao = within(await screen.findByRole('region', { name: 'Ranking das unidades' }))
    expect(await secao.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(secao.queryByText('Falha no ranking.')).not.toBeInTheDocument()
    expect(secao.getByRole('link', { name: 'Ver ranking completo' })).toBeInTheDocument()
  })

  it('vazio: lista vazia também', async () => {
    abrirCom({})
    expect(await screen.findByText('Ainda não há pontos neste mês.')).toBeInTheDocument()
  })
})
