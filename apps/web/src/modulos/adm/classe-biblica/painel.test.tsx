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
  GRUPO_DANIEL_ID,
  GRUPO_ESTER_ID,
  criarFrequencia,
  criarGrupos,
  criarPainel,
  criarPainelComTroca,
  handlersClasseBiblica,
} from '../../../testes/handlers/classe-biblica'
import type { DadosClasseBiblica } from '../../../testes/handlers/classe-biblica'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { PainelEdicao } from './PainelEdicao'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, fuso: undefined as string | undefined }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
  usePacote: () => ({ pacote: conexao.fuso ? { clube: { fuso: conexao.fuso } } : undefined }),
}))

beforeEach(() => {
  conexao.modo = 'ONLINE'
  conexao.fuso = undefined
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T15:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

interface Gravacao { metodo: string; caminho: string; corpo: unknown }

const PAINEL = `/adm/classe-biblica/${EDICAO_CB_ID}`

const ROTAS: RouteObject[] = [
  { path: '/adm/classe-biblica', element: <h1>Lista de edições</h1> },
  { path: '/adm/classe-biblica/:id', element: <PainelEdicao /> },
  { path: '/adm/classe-biblica/:id/etapa/1', element: <h1>Etapa 1</h1> },
]

function abrir(dados: DadosClasseBiblica = {}, ...extras: RequestHandler[]) {
  const gravacoes: Gravacao[] = []
  servidor.use(
    ...handlersSessao([criarVinculo('ADM')], undefined, ['classebiblica.gerenciar', 'classebiblica.chamada']),
    ...handlersClasseBiblica({ ...dados, aoGravar: (metodo, caminho, corpo) => gravacoes.push({ metodo, caminho, corpo }) }),
  )
  servidor.use(...extras)
  return { ...renderizarRotas(ROTAS, PAINEL), gravacoes }
}

/** O interceptador de XHR do msw não lê o FormData do jsdom: o envio de arquivo usa um XHR falso, como em materiais.test.tsx. */
function simularEnvio(corpo: unknown) {
  const enviados: { url: string; dados: string; arquivo: string }[] = []
  class XhrFalso {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    responseText = ''
    private url = ''
    open(_metodo: string, url: string) {
      this.url = url
    }
    setRequestHeader() {}
    send(formulario: FormData) {
      const arquivo = formulario.get('arquivo')
      const dados = formulario.get('dados')
      enviados.push({ url: this.url, dados: typeof dados === 'string' ? dados : '', arquivo: arquivo instanceof File ? arquivo.name : '' })
      this.status = 200
      this.responseText = JSON.stringify(corpo)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
  return enviados
}

const secao = (nome: string) => within(screen.getByRole('region', { name: nome }))

describe('Painel da edição', () => {
  it('mostra os números do modelo no Grupo Daniel', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: '2026 · 2º semestre' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para Classe Bíblica' })).toHaveAttribute('href', '/adm/classe-biblica')
    expect(screen.getByText('Domingos às 14h · Sala 3 da igreja · 16/08 a 13/12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar edição' })).toHaveAttribute('href', `${PAINEL}/etapa/1`)

    const proximo = secao('Próximo encontro')
    expect(proximo.getByText('Domingo, 11/10 · 14h')).toBeInTheDocument()
    expect(proximo.getByText('Sala 3 da igreja · Águias, Leões e Gaviões (31 DBVs)')).toBeInTheDocument()
    expect(proximo.getByRole('link', { name: 'Fazer a chamada do Grupo Daniel' }))
      .toHaveAttribute('href', `/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_DANIEL_ID}/chamada`)
    expect(proximo.getByRole('link', { name: 'Remarcar ou cancelar este encontro' }))
      .toHaveAttribute('href', `/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/remarcar`)

    const frequencia = secao('Frequência do grupo')
    expect(frequencia.getByText('84%')).toBeInTheDocument()
    expect(frequencia.getByText('de presença média em 8 encontros feitos · 9 ainda por vir')).toBeInTheDocument()
    expect(frequencia.getByText('3 desbravadores vieram a menos da metade dos encontros.')).toBeInTheDocument()

    const material = secao('Material do grupo')
    expect(material.getByRole('link', { name: 'Estudo Bíblico Ilustrado — lições 1 a 20 (PDF)' })).toHaveAttribute('href', 'https://arquivos.exemplo/estudo.pdf')
    expect(material.getByRole('button', { name: 'Trocar o material' })).toBeInTheDocument()

    const feitos = secao('Encontros feitos')
    expect(feitos.getAllByRole('link', { name: /^Ver/ })).toHaveLength(8)
    expect(feitos.getByText('26 de 31 presentes · 16 participaram ativamente')).toBeInTheDocument()
    expect(feitos.getByText('19/09 (sáb)')).toBeInTheDocument()
    expect(feitos.getByText('domingo 13/09 · remarcado para sábado 19/09')).toBeInTheDocument()
    const primeiroVer = feitos.getAllByRole('link', { name: /^Ver/ })[0]
    expect(primeiroVer.getAttribute('href')).toMatch(new RegExp(`/adm/classe-biblica/encontros/[^/]+/grupos/${GRUPO_DANIEL_ID}/chamada$`))
  })

  it('as abas trocam o grupo; grupo sem material mostra o quadro com "Anexar PDF ou link"', async () => {
    const usuario = userEvent.setup()
    abrir()
    const abas = await screen.findByRole('tablist', { name: 'Grupos da edição' })
    await usuario.click(within(abas).getByRole('tab', { name: 'Grupo Ester' }))
    expect(within(abas).getByRole('tab', { name: 'Grupo Ester' })).toHaveAttribute('aria-selected', 'true')
    expect(secao('Próximo encontro').getByRole('link', { name: 'Fazer a chamada do Grupo Ester' }))
      .toHaveAttribute('href', `/adm/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_ESTER_ID}/chamada`)
    const material = secao('Material do grupo')
    expect(material.getByText('Ainda sem material de estudo. Os encontros e a chamada funcionam sem ele.')).toBeInTheDocument()
    expect(material.getByRole('button', { name: 'Anexar PDF ou link' })).toBeInTheDocument()
    expect(secao('Encontros feitos').getByText(/Nenhum encontro feito/)).toBeInTheDocument()
  })

  it('quem só tem a chamada vê o grupo do escopo, sem editar, remarcar, cancelar nem anexar', async () => {
    const usuario = userEvent.setup()
    const completo = criarPainel()
    abrir({ painel: { ...completo, podeGerenciar: false, grupos: [completo.grupos[1]] } })
    expect(await screen.findByRole('link', { name: 'Fazer a chamada do Grupo Ester' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar edição' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Remarcar ou cancelar este encontro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anexar PDF ou link' })).not.toBeInTheDocument()
    expect(screen.queryByText('Grupo Daniel')).not.toBeInTheDocument()
    expect(secao('Material do grupo').getByText(/Ainda sem material de estudo/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Ver a frequência de cada um' }))
    expect(await screen.findByRole('list', { name: 'Frequência de cada um' })).toBeInTheDocument()
  })

  it('sem a permissão de chamada não oferece "Fazer a chamada"', async () => {
    abrir({ painel: criarPainel({ podeFazerChamada: false }) })
    expect(await screen.findByRole('link', { name: 'Remarcar ou cancelar este encontro' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Fazer a chamada/ })).not.toBeInTheDocument()
  })

  it('cancelado mostra o motivo e remarcado sem chamada mostra a data nova', async () => {
    const painel = criarPainel()
    const daniel = painel.grupos[0]
    const base = daniel.encontros[0]
    const encontros = [
      { ...base, id: uuid(5098), data: '2026-10-24', dataOriginal: '2026-10-18', temChamada: false, chamada: null },
      { ...base, data: '2026-09-13', cancelado: true, motivo: 'chuva forte', temChamada: false, chamada: null },
    ]
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros }, painel.grupos[1]] } })
    await screen.findByRole('region', { name: 'Encontros feitos' })
    const feitos = secao('Encontros feitos')
    expect(await feitos.findByText('domingo 18/10 · remarcado para sábado 24/10')).toBeInTheDocument()
    expect(feitos.getByText('domingo 13/09')).toBeInTheDocument()
    expect(feitos.getByText('Cancelado: chuva forte')).toBeInTheDocument()
    expect(feitos.queryByRole('link', { name: /^Ver a chamada/ })).not.toBeInTheDocument()
  })
})

describe('Painel — chamada no dia e chamada atrasada', () => {
  it('antes do dia do encontro, a chamada ainda não abre', async () => {
    vi.setSystemTime(new Date('2026-10-10T15:00:00.000Z'))
    abrir()
    const proximo = await waitFor(() => secao('Próximo encontro'))
    expect(await proximo.findByText('A chamada abre no dia do encontro.')).toBeInTheDocument()
    expect(proximo.queryByRole('link', { name: /Fazer a chamada/ })).not.toBeInTheDocument()
    expect(proximo.getByRole('link', { name: 'Remarcar ou cancelar este encontro' })).toBeInTheDocument()
  })

  it('no fuso do clube: 23h de sábado em São Paulo ainda não é o domingo do encontro', async () => {
    vi.setSystemTime(new Date('2026-10-11T02:30:00.000Z'))
    abrir()
    const proximo = await waitFor(() => secao('Próximo encontro'))
    expect(await proximo.findByText('A chamada abre no dia do encontro.')).toBeInTheDocument()
  })

  it('"hoje" é o do fuso configurado do clube, não o padrão', async () => {
    vi.setSystemTime(new Date('2026-10-11T02:30:00.000Z'))
    conexao.fuso = 'Europe/Lisbon'
    abrir()
    const proximo = await waitFor(() => secao('Próximo encontro'))
    expect(await proximo.findByRole('link', { name: 'Fazer a chamada do Grupo Daniel' })).toBeInTheDocument()
  })

  it('o encontro remarcado para hoje aparece só como próximo, não também nos feitos', async () => {
    const painel = criarPainel()
    const daniel = painel.grupos[0]
    const remarcadoParaHoje = { ...daniel.proximoEncontro!, dataOriginal: '2026-10-10' }
    abrir({ painel: { ...painel, grupos: [{ ...daniel, proximoEncontro: remarcadoParaHoje, encontros: [remarcadoParaHoje, ...daniel.encontros] }, painel.grupos[1]] } })
    const feitos = await waitFor(() => secao('Encontros feitos'))
    expect(await feitos.findByText('04/10')).toBeInTheDocument()
    expect(feitos.queryByText('Sem chamada')).not.toBeInTheDocument()
    expect(feitos.queryByText(/remarcado para domingo 11\/10/)).not.toBeInTheDocument()
    expect(secao('Próximo encontro').getByRole('link', { name: 'Fazer a chamada do Grupo Daniel' })).toBeInTheDocument()
  })

  it('encontro passado sem chamada mostra "Sem chamada" e o caminho para fazê-la', async () => {
    const painel = criarPainel()
    const daniel = painel.grupos[0]
    const semChamada = { ...daniel.encontros[0], temChamada: false, chamada: null }
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros: [semChamada, ...daniel.encontros.slice(1)] }, painel.grupos[1]] } })
    const feitos = await waitFor(() => secao('Encontros feitos'))
    expect(await feitos.findByText('Sem chamada')).toBeInTheDocument()
    expect(feitos.getByText('04/10')).toBeInTheDocument()
    expect(feitos.getByRole('link', { name: 'Fazer a chamada do Grupo Daniel' }))
      .toHaveAttribute('href', `/adm/classe-biblica/encontros/${semChamada.id}/grupos/${GRUPO_DANIEL_ID}/chamada`)
  })

  it('sem a permissão de chamada, o encontro passado sem chamada só diz "Sem chamada"', async () => {
    const painel = criarPainel({ podeFazerChamada: false })
    const daniel = painel.grupos[0]
    const semChamada = { ...daniel.encontros[0], temChamada: false, chamada: null }
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros: [semChamada] }, painel.grupos[1]] } })
    const feitos = await waitFor(() => secao('Encontros feitos'))
    expect(await feitos.findByText('Sem chamada')).toBeInTheDocument()
    expect(feitos.queryByRole('link', { name: /Fazer a chamada/ })).not.toBeInTheDocument()
  })

  it('"1 participou ativamente" no singular', async () => {
    const painel = criarPainel()
    const daniel = painel.grupos[0]
    const umSo = { ...daniel.encontros[0], chamada: { presentes: 26, total: 31, participaram: 1 } }
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros: [umSo] }, painel.grupos[1]] } })
    const feitos = await waitFor(() => secao('Encontros feitos'))
    expect(await feitos.findByText('26 de 31 presentes · 1 participou ativamente')).toBeInTheDocument()
  })
})

/** O texto de cada linha da lista de encontros, na ordem da tela, sem o que o leitor de tela pula. */
function textoLegivel(linha: HTMLElement): string {
  const textos: string[] = []
  const caminhante = document.createTreeWalker(linha, NodeFilter.SHOW_TEXT)
  while (caminhante.nextNode()) {
    if (!caminhante.currentNode.parentElement?.closest('[aria-hidden="true"]')) textos.push(caminhante.currentNode.textContent ?? '')
  }
  return textos.join(' ').replace(/\s+/g, ' ').trim()
}

const linhasDosEncontros = () =>
  within(screen.getByRole('region', { name: 'Encontros feitos' }).querySelector('ul')!).getAllByRole('listitem').map(textoLegivel)

describe('Painel — unidade que troca de grupo (critério 49)', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-10-20T15:00:00.000Z')))

  it('no Daniel, cada encontro diz as unidades do dia e a saída de Águias fica entre eles', async () => {
    abrir({ painel: criarPainelComTroca() })
    await screen.findByRole('region', { name: 'Encontros feitos' })
    expect(linhasDosEncontros()).toEqual([
      '18/10 Leões e Gaviões 19 de 21 presentes · 9 participaram ativamente Ver',
      '12/10 · Águias saiu do grupo (foi para o Grupo Ester)',
      '04/10 Águias, Leões e Gaviões 26 de 31 presentes · 16 participaram ativamente Ver',
    ])
    expect(secao('Encontros feitos').getAllByRole('link', { name: /^Ver/ })).toHaveLength(2)
  })

  it('no Ester, a mesma troca aparece como entrada, com o grupo de onde veio', async () => {
    const usuario = userEvent.setup()
    abrir({ painel: criarPainelComTroca() })
    await usuario.click(await screen.findByRole('tab', { name: 'Grupo Ester' }))
    expect(linhasDosEncontros()).toEqual([
      '18/10 Águias, Falcões e Panteras 25 de 29 presentes · 11 participaram ativamente Ver',
      '12/10 · Águias entrou no grupo (veio do Grupo Daniel)',
      '04/10 Falcões e Panteras 17 de 19 presentes · 8 participaram ativamente Ver',
    ])
  })

  it('troca sem o outro grupo não leva o parêntese; uma unidade só aparece sozinha', async () => {
    const painel = criarPainelComTroca()
    const [daniel, ester] = painel.grupos
    const mudancas = [
      { data: '2026-10-12', unidade: 'Gaviões', tipo: 'SAIU' as const, outroGrupo: null },
      { data: '2026-10-11', unidade: 'Tigres', tipo: 'ENTROU' as const, outroGrupo: null },
    ]
    const encontros = [{ ...daniel.encontros[0], unidades: ['Leões'] }]
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros, mudancas }, ester] } })
    await screen.findByRole('region', { name: 'Encontros feitos' })
    expect(linhasDosEncontros()).toEqual([
      '18/10 Leões 19 de 21 presentes · 9 participaram ativamente Ver',
      '12/10 · Gaviões saiu do grupo',
      '11/10 · Tigres entrou no grupo',
    ])
  })

  it('em data igual, a troca fica abaixo do encontro do dia, que já tem a composição nova', async () => {
    const painel = criarPainelComTroca()
    const [daniel, ester] = painel.grupos
    const mudancas = [{ ...daniel.mudancas[0], data: '2026-10-18' }]
    abrir({ painel: { ...painel, grupos: [{ ...daniel, mudancas }, ester] } })
    await screen.findByRole('region', { name: 'Encontros feitos' })
    expect(linhasDosEncontros()).toEqual([
      '18/10 Leões e Gaviões 19 de 21 presentes · 9 participaram ativamente Ver',
      '18/10 · Águias saiu do grupo (foi para o Grupo Ester)',
      '04/10 Águias, Leões e Gaviões 26 de 31 presentes · 16 participaram ativamente Ver',
    ])
  })

  it('grupo sem encontro feito mostra o vazio e, abaixo, a troca', async () => {
    const painel = criarPainelComTroca()
    const [daniel, ester] = painel.grupos
    abrir({ painel: { ...painel, grupos: [{ ...daniel, encontros: [] }, ester] } })
    await screen.findByRole('region', { name: 'Encontros feitos' })
    expect(secao('Encontros feitos').getByText(/Nenhum encontro feito ainda/)).toBeInTheDocument()
    expect(linhasDosEncontros()).toEqual(['12/10 · Águias saiu do grupo (foi para o Grupo Ester)'])
  })

  it('sem trocas, a lista não ganha linha nenhuma', async () => {
    abrir()
    await screen.findByRole('region', { name: 'Encontros feitos' })
    const linhas = linhasDosEncontros()
    expect(linhas).toHaveLength(8)
    expect(linhas.some((linha) => linha.includes(' do grupo'))).toBe(false)
    expect(linhas[0]).toBe('04/10 Águias, Leões e Gaviões 26 de 31 presentes · 16 participaram ativamente Ver')
  })
})

describe('Frequência de cada um', () => {
  it('abre na própria página, do menor para o maior', async () => {
    const usuario = userEvent.setup()
    const itens = [...criarFrequencia().itens].reverse()
    abrir({ frequencia: criarFrequencia({ itens }) })
    await usuario.click(await screen.findByRole('button', { name: 'Ver a frequência de cada um' }))
    const lista = await screen.findByRole('list', { name: 'Frequência de cada um' })
    const linhas = within(lista).getAllByRole('listitem')
    expect(linhas).toHaveLength(10)
    expect(linhas[0]).toHaveTextContent('Ana Clara Souza')
    expect(linhas[0]).toHaveTextContent('3 de 8 encontros')
    expect(linhas[9]).toHaveTextContent('Pedro Henrique Lima')
  })

  it('grupo ainda sem chamada mostra o vazio', async () => {
    const usuario = userEvent.setup()
    abrir({ frequencia: criarFrequencia({ itens: [] }) })
    await usuario.click(await screen.findByRole('button', { name: 'Ver a frequência de cada um' }))
    expect(await screen.findByText(/Ninguém deste grupo tem presença registrada ainda/)).toBeInTheDocument()
  })
})

describe('Material do grupo', () => {
  async function abrirAnexo() {
    const usuario = userEvent.setup()
    const resultado = abrir()
    await usuario.click(await screen.findByRole('tab', { name: 'Grupo Ester' }))
    await usuario.click(secao('Material do grupo').getByRole('button', { name: 'Anexar PDF ou link' }))
    return { usuario, ...resultado }
  }

  it('link sem https é recusado na tela; com https é anexado', async () => {
    const { usuario, gravacoes } = await abrirAnexo()
    const material = secao('Material do grupo')
    await usuario.click(material.getByRole('button', { name: 'Colar um link' }))
    await usuario.type(material.getByLabelText('Nome do material'), 'Lições do Ester')
    await usuario.type(material.getByLabelText('Link'), 'http://exemplo.org/licoes')
    await usuario.click(material.getByRole('button', { name: 'Anexar o link' }))
    expect(await material.findByText('Use um link https://')).toBeInTheDocument()
    expect(gravacoes).toHaveLength(0)

    await usuario.clear(material.getByLabelText('Link'))
    await usuario.type(material.getByLabelText('Link'), 'https://exemplo.org/licoes')
    await usuario.click(material.getByRole('button', { name: 'Anexar o link' }))
    await waitFor(() => expect(gravacoes).toContainEqual({
      metodo: 'POST',
      caminho: `/api/classe-biblica/grupos/${GRUPO_ESTER_ID}/material/link`,
      corpo: { titulo: 'Lições do Ester', url: 'https://exemplo.org/licoes' },
    }))
  })

  it('PDF acima de 20 MB mostra o aviso sem perder o que foi digitado', async () => {
    const { usuario, gravacoes } = await abrirAnexo()
    const material = secao('Material do grupo')
    await usuario.click(material.getByRole('button', { name: 'Colar um link' }))
    await usuario.type(material.getByLabelText('Nome do material'), 'Lições do Ester')
    const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: 25 * 1024 * 1024 })
    await usuario.upload(material.getByLabelText('Enviar PDF'), grande)
    expect(await material.findByText('O PDF passa de 20 MB')).toBeInTheDocument()
    expect(material.getByLabelText('Nome do material')).toHaveValue('Lições do Ester')
    expect(gravacoes).toHaveLength(0)
  })

  it('PDF de 15 MB é enviado ao grupo', async () => {
    const enviados = simularEnvio(criarGrupos().grupos[1])
    const { usuario } = await abrirAnexo()
    const pdf = new File(['%PDF'], 'licoes-ester.pdf', { type: 'application/pdf' })
    Object.defineProperty(pdf, 'size', { value: 15 * 1024 * 1024 })
    await usuario.upload(secao('Material do grupo').getByLabelText('Enviar PDF'), pdf)
    await waitFor(() => expect(enviados).toEqual([{
      url: `/api/classe-biblica/grupos/${GRUPO_ESTER_ID}/material/arquivo`, dados: JSON.stringify({ titulo: 'licoes-ester' }), arquivo: 'licoes-ester.pdf',
    }]))
    expect(await screen.findByText('Material salvo. Quem abre a edição já vê o novo.')).toBeInTheDocument()
  })
})

describe('Painel — quatro estados', () => {
  it('carregando', async () => {
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando a edição' })).toBeInTheDocument()
    await screen.findByRole('heading', { level: 1, name: '2026 · 2º semestre' })
  })

  it('vazio: nenhum grupo do escopo', async () => {
    abrir({ painel: criarPainel({ podeGerenciar: false, grupos: [] }) })
    expect(await screen.findByRole('heading', { name: 'Nenhum grupo seu nesta edição' })).toBeInTheDocument()
  })

  it('erro mostra a mensagem e o "Tentar de novo"', async () => {
    abrir({}, http.get('/api/classe-biblica/edicoes/:id', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou aqui.' }, { status: 500 })))
    expect(await screen.findByText('Falhou aqui.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão mostra que a tela depende da internet', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir({}, http.get('/api/classe-biblica/edicoes/:id', () => HttpResponse.error()))
    await waitFor(() => expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument())
  })
})
