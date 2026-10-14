import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { handlerRankingUnidades } from '../../../testes/handlers/ranking'
import { criarRefClasse, criarVisaoGeral, handlerErroVisaoGeral, handlerVisaoGeral } from '../../../testes/handlers/visao-geral'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { simularLargura } from '../../../testes/midia'
import { servidor } from '../../../testes/servidor'
import { rotasAdmVisaoGeral } from './rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T15:00:00Z'))
  servidor.use(handlerConfiguracao(criarConfiguracao()), handlerRankingUnidades([]))
})

afterEach(() => {
  vi.useRealTimers()
  conexao.modo = 'ONLINE'
})

const abrir = () => renderizarRotas(rotasAdmVisaoGeral, '/adm')
const comPermissao = () => servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['usuario.gerenciar']))
/** Espera as permissões chegarem junto da tela: o primeiro atalho só existe com `usuario.gerenciar`. */
const secaoDosAtalhos = async () => {
  await screen.findByRole('button', { name: 'Gerar link de substituto' })
  return within(screen.getByRole('region', { name: 'Atalhos' }))
}

describe('quatro estados', () => {
  it('carregando: mostra o aviso de carregamento', () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando a visão geral' })).toBeInTheDocument()
  })

  it('vazio: clube novo, sem desbravadores nem unidades, continua com os atalhos e os vazios de cada bloco', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ dbvsAtivos: 0, unidades: 0, unidadesResumo: [], frequenciaMes: null, variacaoFrequencia: null })))
    abrir()
    expect(await screen.findByRole('button', { name: 'Gerar link de substituto' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Novo evento no calendário' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lançar chamada da Classe Bíblica' })).toBeInTheDocument()
    expect(screen.getByText('Nenhum evento marcado à frente.')).toBeInTheDocument()
    expect(screen.getByText('Todas as classes têm cronograma.')).toBeInTheDocument()
    expect(screen.queryByText('O clube ainda não tem desbravadores')).not.toBeInTheDocument()
  })

  it('erro: mostra a mensagem da API e repete a busca', async () => {
    servidor.use(handlerErroVisaoGeral())
    abrir()
    expect(await screen.findByText('Falha ao montar a visão geral.')).toBeInTheDocument()
    servidor.use(handlerVisaoGeral())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Atalhos' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('cabeçalho', () => {
  it('traz a data de hoje no fuso do clube', async () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    expect(await screen.findByText('Terça-feira, 13 de outubro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Visão geral', level: 1 })).toBeInTheDocument()
  })

  it('a data segue o fuso configurado, não o relógio do navegador', async () => {
    vi.setSystemTime(new Date('2026-10-13T23:00:00Z'))
    servidor.use(handlerVisaoGeral(), handlerConfiguracao(criarConfiguracao({ fuso: 'Asia/Tokyo' })))
    abrir()
    expect(await screen.findByText('Quarta-feira, 14 de outubro')).toBeInTheDocument()
  })

  it('não traz mais os números do clube nem o "Novo desbravador"', async () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    await screen.findByRole('region', { name: 'Atalhos' })
    expect(screen.queryByRole('group', { name: 'Desbravadores' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Novo desbravador' })).not.toBeInTheDocument()
    expect(screen.queryByText('Progresso por classe')).not.toBeInTheDocument()
    expect(screen.queryByText('Atividade recente')).not.toBeInTheDocument()
  })
})

describe('atalhos', () => {
  it('são três, na ordem do desenho, e só o primeiro é o botão verde', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral())
    abrir()
    const atalhos = await secaoDosAtalhos()
    const nomes = [...atalhos.getAllByRole('button'), ...atalhos.getAllByRole('link')]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((elemento) => elemento.textContent)
    expect(nomes).toEqual(['Gerar link de substituto', 'Novo evento no calendário', 'Lançar chamada da Classe Bíblica'])
    expect(atalhos.getByRole('button', { name: 'Gerar link de substituto' })).toHaveClass('bg-marca')
    expect(atalhos.getByRole('link', { name: 'Novo evento no calendário' })).not.toHaveClass('bg-marca')
    expect(atalhos.getByRole('button', { name: 'Lançar chamada da Classe Bíblica' })).not.toHaveClass('bg-marca')
  })

  it('nenhum está desabilitado, nem sem chamada pendente', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral())
    abrir()
    const atalhos = await secaoDosAtalhos()
    expect(atalhos.getByRole('button', { name: 'Lançar chamada da Classe Bíblica' })).toBeEnabled()
    expect(atalhos.getByRole('button', { name: 'Gerar link de substituto' })).toBeEnabled()
  })

  it('no celular cada um ocupa a linha inteira', async () => {
    simularLargura(390)
    comPermissao()
    servidor.use(handlerVisaoGeral())
    abrir()
    const atalhos = await secaoDosAtalhos()
    for (const nome of ['Gerar link de substituto', 'Lançar chamada da Classe Bíblica']) expect(atalhos.getByRole('button', { name: nome })).toHaveClass('w-full')
    expect(atalhos.getByRole('link', { name: 'Novo evento no calendário' })).toHaveClass('w-full')
  })

  it('"Novo evento" leva ao formulário e o "voltar" retorna à visão geral', async () => {
    servidor.use(handlerVisaoGeral())
    const { roteador } = abrir()
    await userEvent.click(await screen.findByRole('link', { name: 'Novo evento no calendário' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/adm/calendario/eventos/novo'))
    expect(roteador.state.location.state).toMatchObject({ voltarPara: '/adm' })
  })
})

describe('atalho "Gerar link de substituto"', () => {
  const comDestinos = criarVisaoGeral({
    unidadesResumo: [{ id: uuid(11), nome: 'Águias', conselheiros: [], totalDbvs: 8, frequenciaMes: 87 }],
    progressoClasses: [{ classe: criarRefClasse(1, 'Amigo'), media: 64, totalDbvs: 9, instrutores: [] }],
  })

  it('abre a escolha em folha e leva à geração da unidade ou da classe escolhida', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral(comDestinos))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar link de substituto' }))
    const folha = within(screen.getByRole('dialog'))
    expect(folha.getByRole('link', { name: 'Águias' })).toHaveAttribute('href', `/adm/unidades/${uuid(11)}/substituicao`)
    expect(folha.getByRole('link', { name: 'Amigo' })).toHaveAttribute('href', `/adm/classes/${uuid(1)}/substituicao`)
    expect(folha.getByRole('heading', { name: 'Unidades', level: 3 })).toBeInTheDocument()
    expect(folha.getByRole('heading', { name: 'Classes', level: 3 })).toBeInTheDocument()
  })

  it('Fechar fecha a folha e devolve o foco ao botão', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral(comDestinos))
    abrir()
    const botao = await screen.findByRole('button', { name: 'Gerar link de substituto' })
    await userEvent.click(botao)
    const fechar = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Fechar' })
    await userEvent.click(fechar[fechar.length - 1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(botao).toHaveFocus()
  })

  it('some sem usuario.gerenciar', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, []))
    servidor.use(handlerVisaoGeral(comDestinos))
    abrir()
    await screen.findByRole('region', { name: 'Atalhos' })
    expect(screen.queryByRole('button', { name: 'Gerar link de substituto' })).not.toBeInTheDocument()
  })

  it('sem unidades nem classes, explica que é preciso cadastrar antes', async () => {
    comPermissao()
    servidor.use(handlerVisaoGeral(criarVisaoGeral()))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar link de substituto' }))
    expect(screen.getByText(/cadastre antes uma unidade ou uma classe/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar unidade' })).toHaveAttribute('href', '/adm/unidades/nova')
  })
})

describe('atalho "Lançar chamada da Classe Bíblica"', () => {
  const norte = { encontroId: uuid(71), data: '2026-10-11', grupoId: uuid(81), grupoNome: 'Grupo Norte' }
  const sul = { encontroId: uuid(71), data: '2026-10-11', grupoId: uuid(82), grupoNome: 'Grupo Sul' }
  const norteAntigo = { encontroId: uuid(72), data: '2026-10-04', grupoId: uuid(81), grupoNome: 'Grupo Norte' }

  it('uma chamada pendente: vai direto a ela, com o voltar para a visão geral', async () => {
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ chamadasClasseBiblica: [norte] })))
    const { roteador } = abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Lançar chamada da Classe Bíblica' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/classe-biblica/encontros/${uuid(71)}/grupos/${uuid(81)}/chamada`))
    expect(roteador.state.location.state).toMatchObject({ voltarPara: '/adm' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('várias: abre "Qual chamada lançar?" com uma linha por par, e cada linha leva à chamada dele', async () => {
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ chamadasClasseBiblica: [norte, sul, norteAntigo] })))
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Lançar chamada da Classe Bíblica' }))
    const folha = within(screen.getByRole('dialog', { name: 'Qual chamada lançar?' }))
    const linhas = folha.getAllByRole('link')
    expect(linhas.map((linha) => linha.textContent)).toEqual([
      'Grupo NorteEncontro de domingo, 11/10',
      'Grupo SulEncontro de domingo, 11/10',
      'Grupo NorteEncontro de domingo, 04/10',
    ])
    expect(linhas[2]).toHaveAttribute('href', `/adm/classe-biblica/encontros/${uuid(72)}/grupos/${uuid(81)}/chamada`)
  })

  it('várias: Fechar fecha a folha e devolve o foco ao botão que a abriu', async () => {
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ chamadasClasseBiblica: [norte, sul] })))
    abrir()
    const botao = await screen.findByRole('button', { name: 'Lançar chamada da Classe Bíblica' })
    await userEvent.click(botao)
    const fechar = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Fechar' })
    await userEvent.click(fechar[fechar.length - 1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(botao).toHaveFocus()
  })

  it('nenhuma: a folha diz que os últimos 7 dias estão lançados e leva às edições', async () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Lançar chamada da Classe Bíblica' }))
    const folha = within(screen.getByRole('dialog', { name: 'Nenhuma chamada pendente' }))
    expect(folha.getByText('As chamadas dos últimos 7 dias estão lançadas.')).toBeInTheDocument()
    expect(folha.getByRole('link', { name: 'Ver edições da Classe Bíblica' })).toHaveAttribute('href', '/adm/classe-biblica')
  })
})
