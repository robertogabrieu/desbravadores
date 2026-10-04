import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import { criarConfiguracao, handlerConfiguracao, handlerErroConfiguracao } from '../../../testes/handlers/clube'
import { criarRefClasse, criarVisaoGeral, handlerErroVisaoGeral, handlerVisaoGeral } from '../../../testes/handlers/visao-geral'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { simularLargura } from '../../../testes/midia'
import { servidor } from '../../../testes/servidor'
import { rotasAdmVisaoGeral } from './rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
}))

afterEach(() => {
  conexao.modo = 'ONLINE'
})

const abrir = () => renderizarRotas(rotasAdmVisaoGeral, '/adm')
const cartao = (nome: string) => within(screen.getByRole('group', { name: nome }))

describe('A0 · quatro estados', () => {
  it('carregando: mostra o aviso de carregamento', () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando a visão geral' })).toBeInTheDocument()
  })

  it('vazio: clube sem desbravadores nem unidades leva ao cadastro', async () => {
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ dbvsAtivos: 0, unidades: 0, unidadesResumo: [], frequenciaMes: null, variacaoFrequencia: null })))
    abrir()
    expect(await screen.findByText('O clube ainda não tem desbravadores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar desbravador' })).toHaveAttribute('href', '/adm/desbravadores/novo')
  })

  it('erro: mostra a mensagem da API e repete a busca', async () => {
    servidor.use(handlerErroVisaoGeral())
    abrir()
    expect(await screen.findByText('Falha ao montar a visão geral.')).toBeInTheDocument()
    servidor.use(handlerVisaoGeral())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('group', { name: 'Desbravadores' })).toBeInTheDocument()
  })

  it('sem conexão e sem dado: "Disponível quando houver internet"', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('A0 · conteúdo', () => {
  it('cartões trazem os números e as variações', async () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    await screen.findByRole('group', { name: 'Desbravadores' })
    expect(cartao('Desbravadores').getByText('58')).toBeInTheDocument()
    expect(cartao('Desbravadores').getByText('+4 no trimestre')).toBeInTheDocument()
    expect(cartao('Unidades').getByText('6')).toBeInTheDocument()
    expect(cartao('Instrutores').getByText('5')).toBeInTheDocument()
    expect(cartao('Instrutores').getByText('6 classes cobertas')).toBeInTheDocument()
    expect(cartao('Frequência do mês').getByText('84%')).toBeInTheDocument()
    expect(cartao('Frequência do mês').getByText('+3 pts vs. mês anterior')).toBeInTheDocument()
    expect(cartao('Especialidades no ano').getByText('142')).toBeInTheDocument()
    expect(cartao('Especialidades no ano').getByText('2,4 por DBV')).toBeInTheDocument()
  })

  it('frequência sem reuniões no mês aparece como traço', async () => {
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ frequenciaMes: null, variacaoFrequencia: null })))
    abrir()
    await screen.findByRole('group', { name: 'Frequência do mês' })
    expect(cartao('Frequência do mês').getByText('—')).toBeInTheDocument()
    expect(cartao('Frequência do mês').getByText('Nenhuma reunião registrada no mês')).toBeInTheDocument()
  })

  it('progresso por classe: média, DBVs e instrutores; classe sem dados', async () => {
    servidor.use(
      handlerVisaoGeral(
        criarVisaoGeral({
          progressoClasses: [
            { classe: criarRefClasse(1, 'Amigo'), media: 64, totalDbvs: 9, instrutores: ['Priscila'] },
            { classe: criarRefClasse(2, 'Pioneiro'), media: null, totalDbvs: 0, instrutores: [] },
          ],
        }),
      ),
    )
    abrir()
    expect(await screen.findByRole('progressbar', { name: 'Progresso médio de Amigo' })).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(screen.getByText('9 DBVs · Priscila')).toBeInTheDocument()
    expect(screen.getByText('Sem dados')).toBeInTheDocument()
    expect(screen.getByText('0 DBVs · Sem instrutor')).toBeInTheDocument()
  })

  const duasUnidades = criarVisaoGeral({
    unidadesResumo: [
      { id: uuid(11), nome: 'Águias', conselheiros: ['Thiago'], totalDbvs: 8, frequenciaMes: 87 },
      { id: uuid(12), nome: 'Tigres', conselheiros: [], totalDbvs: 10, frequenciaMes: 68 },
    ],
  })

  it('unidades: marca a frequência abaixo do limiar do clube (60 não marca ninguém)', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    const aguias = within(await screen.findByRole('link', { name: /^Águias/ }))
    const tigres = within(screen.getByRole('link', { name: /^Tigres/ }))
    await waitFor(() => expect(tigres.getByText('68%')).toHaveAttribute('data-abaixo-do-limiar', 'true'))
    expect(aguias.getByText('87%')).toHaveAttribute('data-abaixo-do-limiar', 'false')
    expect(tigres.getByText('Sem conselheiro')).toBeInTheDocument()
  })

  it('o cartão da unidade leva à ficha dela', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao()))
    abrir()
    expect(await screen.findByRole('link', { name: /^Águias/ })).toHaveAttribute('href', `/adm/unidades/${uuid(11)}`)
    expect(screen.getByRole('link', { name: /^Tigres/ })).toHaveAttribute('href', `/adm/unidades/${uuid(12)}`)
  })

  it('o nome do cartão da unidade diz a contagem e a frequência, e avisa quando está abaixo do limite', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    expect(await screen.findByRole('link', { name: 'Águias · 8 DBVs · frequência do mês 87%' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Tigres · 10 DBVs · frequência do mês 68%, abaixo do limite' })).toBeInTheDocument()
  })

  it('só o que abre leva seta: o cartão da unidade tem, os números do clube não', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao()))
    abrir()
    const unidade = await screen.findByRole('link', { name: /^Águias/ })
    expect(unidade.querySelector('[data-sinal="navega"]')).not.toBeNull()
    for (const titulo of ['Desbravadores', 'Unidades', 'Instrutores', 'Frequência do mês', 'Especialidades no ano']) {
      const indicador = screen.getByRole('group', { name: titulo })
      expect(indicador.querySelector('[data-sinal="navega"]')).toBeNull()
      expect(indicador.closest('a')).toBeNull()
    }
  })

  it('"Novo desbravador" abre o cadastro, não a lista', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao()))
    abrir()
    expect(await screen.findByRole('link', { name: 'Novo desbravador' })).toHaveAttribute('href', '/adm/desbravadores/novo')
  })

  it('limiar diferente de 70: com 90, 87% passa a ser marcado; com 60, 68% deixa de ser', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 90 })))
    const primeira = abrir()
    const aguias = within(await screen.findByRole('link', { name: /^Águias/ }))
    await waitFor(() => expect(aguias.getByText('87%')).toHaveAttribute('data-abaixo-do-limiar', 'true'))
    primeira.unmount()

    servidor.use(handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 60 })))
    abrir()
    const tigres = within(await screen.findByRole('link', { name: /^Tigres/ }))
    await waitFor(() => expect(tigres.getByText('68%')).toHaveAttribute('data-abaixo-do-limiar', 'false'))
  })

  it('configuração com erro: unidades aparecem sem destaque', async () => {
    servidor.use(handlerVisaoGeral(duasUnidades), handlerErroConfiguracao())
    abrir()
    const tigres = within(await screen.findByRole('link', { name: /^Tigres/ }))
    expect(tigres.getByText('68%')).toHaveAttribute('data-abaixo-do-limiar', 'false')
  })

  it('cronogramas enviados levam à publicação da classe; atividade recente lista os eventos', async () => {
    servidor.use(
      handlerVisaoGeral(
        criarVisaoGeral({
          cronogramasEnviados: [{ cronogramaId: uuid(21), classe: criarRefClasse(1, 'Amigo'), enviadoPor: 'Priscila', enviadoEm: '2026-09-25T13:00:00Z' }],
          atividades: [
            { id: uuid(31), descricao: 'Thiago registrou a reunião da unidade Águias', link: '/reunioes/x', criadaEm: '2026-09-26T13:40:00Z', autor: 'Thiago' },
            { id: uuid(32), descricao: 'Nova foto na galeria', link: null, criadaEm: '2026-09-25T13:40:00Z', autor: null },
          ],
        }),
      ),
    )
    abrir()
    expect(await screen.findByRole('link', { name: 'Revisar cronograma de Amigo' })).toHaveAttribute('href', `/adm/cronogramas?classe=${uuid(1)}`)
    expect(screen.getByText('Cronogramas aguardando publicação')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thiago registrou a reunião da unidade Águias' })).toHaveAttribute('href', '/reunioes/x')
    expect(screen.getByText('Nova foto na galeria')).toBeInTheDocument()
  })

  it('sem cronogramas enviados, o bloco não aparece', async () => {
    servidor.use(handlerVisaoGeral())
    abrir()
    await screen.findByRole('group', { name: 'Desbravadores' })
    expect(screen.queryByText('Cronogramas aguardando publicação')).not.toBeInTheDocument()
  })
})

const comAlerta = criarVisaoGeral({
  unidadesResumo: [
    { id: uuid(11), nome: 'Águias', conselheiros: ['Thiago'], totalDbvs: 8, frequenciaMes: 87 },
    { id: uuid(12), nome: 'Tigres', conselheiros: [], totalDbvs: 10, frequenciaMes: 68 },
  ],
  cronogramasEnviados: [{ cronogramaId: uuid(21), classe: criarRefClasse(1, 'Amigo'), enviadoPor: 'Priscila', enviadoEm: '2026-09-25T13:00:00Z' }],
  progressoClasses: [
    { classe: criarRefClasse(1, 'Amigo'), media: 64, totalDbvs: 9, instrutores: ['Priscila'] },
    { classe: criarRefClasse(2, 'Pioneiro'), media: null, totalDbvs: 0, instrutores: [] },
  ],
})

describe('celular · o que precisa de atenção vem primeiro', () => {
  it('"Precisa de atenção" aparece antes dos números, com a unidade abaixo do limite e o cronograma aguardando', async () => {
    simularLargura(390)
    servidor.use(handlerVisaoGeral(comAlerta), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    const atencao = await screen.findByRole('region', { name: 'Precisa de atenção · 2' })
    const numeros = screen.getByRole('region', { name: 'Números do clube' })
    expect(atencao.compareDocumentPosition(numeros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const dentro = within(atencao)
    const tigres = dentro.getByRole('link', { name: /Tigres/ })
    expect(tigres).toHaveAttribute('href', `/adm/unidades/${uuid(12)}`)
    expect(within(tigres).getByText('Frequência 68% · abaixo do limite de 75%')).toBeInTheDocument()
    expect(dentro.queryByRole('link', { name: /Águias/ })).not.toBeInTheDocument()

    const cronograma = dentro.getByRole('link', { name: /Cronograma de Amigo para publicar/ })
    expect(cronograma).toHaveAttribute('href', `/adm/cronogramas?classe=${uuid(1)}`)
    expect(within(cronograma).getByText('Enviado por Priscila em 25/09')).toBeInTheDocument()
    expect(within(cronograma).getByText('Revisar')).toBeInTheDocument()
  })

  it('a ordem segue: números, "Novo desbravador", unidades, progresso e atividade', async () => {
    simularLargura(390)
    servidor.use(handlerVisaoGeral(comAlerta), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    await screen.findByRole('region', { name: /Precisa de atenção/ })
    const emOrdem = [
      screen.getByRole('region', { name: 'Números do clube' }),
      screen.getByRole('link', { name: 'Novo desbravador' }),
      screen.getByRole('region', { name: 'Unidades' }),
      screen.getByRole('heading', { name: 'Progresso por classe' }),
      screen.getByRole('heading', { name: 'Atividade recente' }),
    ]
    for (let i = 1; i < emOrdem.length; i++) {
      expect(emOrdem[i - 1].compareDocumentPosition(emOrdem[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.queryByText('Cronogramas aguardando publicação')).not.toBeInTheDocument()
  })

  it('sem unidade abaixo do limite nem cronograma aguardando, a seção não aparece', async () => {
    simularLargura(390)
    servidor.use(handlerVisaoGeral(criarVisaoGeral({ ...comAlerta, cronogramasEnviados: [] })), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 60 })))
    abrir()
    await screen.findByRole('region', { name: 'Números do clube' })
    await screen.findByRole('link', { name: /^Tigres/ })
    expect(screen.queryByRole('region', { name: /Precisa de atenção/ })).not.toBeInTheDocument()
  })

  it('progresso por classe começa recolhido e abre no botão', async () => {
    simularLargura(390)
    servidor.use(handlerVisaoGeral(comAlerta), handlerConfiguracao(criarConfiguracao()))
    abrir()
    const botao = await screen.findByRole('button', { name: 'Ver progresso das 2 classes' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('progressbar', { name: 'Progresso médio de Amigo' })).not.toBeInTheDocument()
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('progressbar', { name: 'Progresso médio de Amigo' })).toBeInTheDocument()
  })
})

describe('alerta de frequência em texto, não só na cor', () => {
  it('no computador, o cartão da unidade abaixo do limite diz "abaixo de L%"', async () => {
    servidor.use(handlerVisaoGeral(comAlerta), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    const tigres = within(await screen.findByRole('link', { name: /^Tigres/ }))
    expect(await tigres.findByText('abaixo de 75%')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /^Águias/ })).queryByText(/abaixo de/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Precisa de atenção/ })).not.toBeInTheDocument()
  })

  it('no celular, o cartão da unidade também diz o motivo', async () => {
    simularLargura(390)
    servidor.use(handlerVisaoGeral(comAlerta), handlerConfiguracao(criarConfiguracao({ limiarFrequenciaAlerta: 75 })))
    abrir()
    const unidades = within(await screen.findByRole('region', { name: 'Unidades' }))
    const tigres = within(unidades.getByRole('link', { name: /^Tigres/ }))
    expect(await tigres.findByText('abaixo de 75%')).toBeInTheDocument()
  })
})
