import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Montagem } from '../../api/montagem'
import type { ModoConexao } from '../../offline'
import { criarClasse, handlerClasses } from '../../testes/handlers/leitura'
import {
  AVANCADA_MONTAGEM,
  CLASSE_AVANCADA_MONTAGEM,
  CLASSE_MONTAGEM,
  criarDataMontagem,
  criarMontagem,
  criarRequisitoAvancada,
  criarRequisitoMontagem,
  handlersMontagem,
  situacaoDoDia,
} from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { simularLargura } from '../../testes/midia'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { nomeDoParDe, parDaClasse, regularDaClasse } from './classes'
import { aceitaRequisitoNovo, dataBloqueada, diaComDadosSomeAoTirar } from './datas'
import { rotasAdmCronogramas } from './rotas'
import { aulaDadaPorTodas, contagemDaData, diaPodeMudar, montarVista, ordenarPorVazias, progressoDoLado } from './vista'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const AULA = uuid(2001)
const CLASSE_REGULAR = criarClasse({ avancadaPareadaId: AVANCADA_MONTAGEM.id })
const CLASSE_AVANCADA = criarClasse({ id: AVANCADA_MONTAGEM.id, nome: 'Amigo da Natureza', tipo: 'AVANCADA', classeBaseId: uuid(100), regularDoParId: uuid(100), ordem: 2 })

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement

function abrirAdm(montagem: Montagem, rota = '/adm/cronogramas', classes = [CLASSE_REGULAR, CLASSE_AVANCADA]) {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(classes), ...handlers)
  renderizarRotas(rotasAdmCronogramas, rota)
  return registro
}

/** Par com a aula de 04/10 planejada, um requisito de cada classe nela e, se pedido, as classes que já deram aula. */
function parComAula(classeIdsComAulaDada: string[] = [], detalhe: { horario?: string } = {}): Montagem {
  const R1 = criarRequisitoMontagem(1, { aulaId: AULA, data: '2026-10-04' })
  const AN1 = criarRequisitoAvancada(1, { aulaId: AULA, data: '2026-10-04' })
  const datas = [criarDataMontagem('2026-10-04', { aulaId: AULA, requisitoIds: [R1.id, AN1.id], classeIdsComAulaDada, ...detalhe })]
  return criarMontagem({ requisitos: [R1, AN1], datas, avancada: AVANCADA_MONTAGEM })
}

function primeiraData(montagem: Montagem) {
  const [dado] = montarVista(montagem).datas
  if (!dado) throw new Error('montagem sem data')
  return dado
}

describe('Agrupadas não formam par', () => {
  const agrupada = criarClasse({ id: uuid(104), nome: 'Agrupadas (Amigo a Guia)', trilha: 'AGRUPADAS', ordem: 13 })
  const agrupadaAvancada = criarClasse({ id: uuid(105), nome: 'Agrupadas — avançada', tipo: 'AVANCADA', trilha: 'AGRUPADAS', classeBaseId: uuid(104), ordem: 14 })
  const classes = [agrupada, agrupadaAvancada]

  it('parDaClasse, regularDaClasse e nomeDoParDe tratam as duas como classes soltas', () => {
    expect(parDaClasse(classes, agrupada.id)).toBeNull()
    expect(parDaClasse(classes, agrupadaAvancada.id)).toBeNull()
    expect(regularDaClasse(classes, agrupadaAvancada.id)).toBe(agrupadaAvancada.id)
    expect(nomeDoParDe(classes, agrupada)).toBe('Agrupadas (Amigo a Guia)')
  })

  it('o seletor mostra as duas pelo próprio nome e ?classe=<avançada> abre a montagem dela', async () => {
    const montagem = criarMontagem({ classe: { ...CLASSE_AVANCADA_MONTAGEM, id: agrupadaAvancada.id, trilha: 'AGRUPADAS' }, datasLivres: true })
    const registro = abrirAdm(montagem, `/adm/cronogramas?classe=${agrupadaAvancada.id}`, classes)
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    await userEvent.click(seletor)
    await waitFor(() =>
      expect(screen.queryAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Agrupadas (Amigo a Guia)', 'Agrupadas — avançada']),
    )
    await waitFor(() => expect(registro.classesLidas).toEqual([agrupadaAvancada.id]))
  })
})

describe('Conflito é um só por data e vem do servidor', () => {
  const evento = situacaoDoDia('2026-10-25', [{ nome: 'Ensaio', tipo: 'EVENTO' }])

  it('usa o valor do servidor nos dois sentidos, sem refazer a conta no navegador', () => {
    const datas = (conflito: boolean) => [criarDataMontagem('2026-10-25', { situacao: evento, conflito })]
    expect(primeiraData(criarMontagem({ datas: datas(true) })).conflito).toBe(true)
    // Mesmo com a data em evento, o navegador não decide por conta própria.
    expect(primeiraData(criarMontagem({ datas: datas(false) })).conflito).toBe(false)
  })

  it('computador: a linha em conflito avisa uma vez, para o encontro', async () => {
    const AN = criarRequisitoAvancada(1, { aulaId: AULA, data: '2026-10-25' })
    const datas = [criarDataMontagem('2026-10-25', { aulaId: AULA, situacao: evento, conflito: true, requisitoIds: [AN.id] })]
    abrirAdm(criarMontagem({ requisitos: [AN], datas, avancada: AVANCADA_MONTAGEM }))
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(within(linha('2026-10-25')).getAllByText(/Conflito:/)).toHaveLength(1)
  })
})

describe('Bloqueio é um só por data', () => {
  // Dia sem classe, mas com classe liberada quando há aula marcada (férias com classe marcada).
  const situacao = { ...situacaoDoDia('2026-10-04'), temClasse: false, classeLiberada: true }

  it('com a aula do encontro marcada a data fica aberta para as duas classes; sem aula, fechada', () => {
    const comAula = primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-04', { situacao, aulaId: AULA })] }))
    const semAula = primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-04', { situacao })] }))
    expect(dataBloqueada(comAula)).toBe(false)
    expect(dataBloqueada(semAula)).toBe(true)
    expect(aceitaRequisitoNovo({ datasLivres: false }, comAula, [CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id])).toBe(true)
    expect(aceitaRequisitoNovo({ datasLivres: false }, semAula, [CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id])).toBe(false)
  })

  it('"Mais vazias primeiro" manda a bloqueada para o fim e a aberta com aula não', () => {
    const aberta = { ...primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-04', { situacao, aulaId: AULA })] })), requisitoIds: ['a', 'b'] }
    const fechada = primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-05', { situacao })] }))
    expect(ordenarPorVazias([fechada, aberta]).map((dado) => dado.data)).toEqual(['2026-10-04', '2026-10-05'])
  })
})

describe('Classe dada por classe, só pela lista do servidor', () => {
  it('só a avançada deu aula: o colocar dela fecha e o da regular segue aberto; com as duas, nenhuma', () => {
    const dadaAvancada = primeiraData(parComAula([AVANCADA_MONTAGEM.id]))
    expect(aceitaRequisitoNovo({ datasLivres: false }, dadaAvancada, [AVANCADA_MONTAGEM.id])).toBe(false)
    expect(aceitaRequisitoNovo({ datasLivres: false }, dadaAvancada, [CLASSE_MONTAGEM.id])).toBe(true)
    expect(aceitaRequisitoNovo({ datasLivres: false }, dadaAvancada, [CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id])).toBe(true)
    const dadaNasDuas = primeiraData(parComAula([CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id]))
    expect(aceitaRequisitoNovo({ datasLivres: false }, dadaNasDuas, [CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id])).toBe(false)
  })

  it('editar e remover o dia só valem com a lista vazia (e com aula)', () => {
    expect(diaPodeMudar(primeiraData(parComAula()))).toBe(true)
    expect(diaPodeMudar(primeiraData(parComAula([AVANCADA_MONTAGEM.id])))).toBe(false)
    expect(diaPodeMudar(primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-04')] })))).toBe(false)
  })
})

describe('Aviso de dia que some, pelo total da aula', () => {
  function montar(regular: number, avancada: number) {
    const daRegular = Array.from({ length: regular }, (_, n) => criarRequisitoMontagem(n + 1, { data: '2026-10-04' }))
    const daAvancada = Array.from({ length: avancada }, (_, n) => criarRequisitoAvancada(n + 1, { data: '2026-10-04' }))
    const requisitoIds = [...daRegular, ...daAvancada].map((requisito) => requisito.id)
    const datas = [criarDataMontagem('2026-10-04', { aulaId: AULA, local: 'Sala 2', requisitoIds })]
    return primeiraData(criarMontagem({ requisitos: [...daRegular, ...daAvancada], datas, avancada: AVANCADA_MONTAGEM }))
  }

  it('só avisa quando o requisito é o único da aula, de qualquer classe', () => {
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, montar(1, 0))).toBe(true)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, montar(0, 1))).toBe(true)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, montar(1, 1))).toBe(false)
    expect(diaComDadosSomeAoTirar({ datasLivres: true }, montar(1, 0))).toBe(false)
  })
})

describe('Dia único do encontro', () => {
  it('computador: "Remover dia de classe" faz uma chamada só e a confirmação fala das duas classes', async () => {
    const registro = abrirAdm(parComAula())
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Remover dia de classe' }))
    expect(screen.getByText(/requisitos das duas classes neste dia voltam a ficar sem data/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/aulas-planejadas/${AULA}` })
  })

  it('computador: "Editar horário, local e título" faz uma chamada só', async () => {
    const registro = abrirAdm(parComAula([], { horario: '09:15' }))
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Editar horário, local e título' }))
    await usuario.type(screen.getByLabelText('Local'), 'Sala 3')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'PATCH', caminho: `/api/aulas-planejadas/${AULA}` })
    expect(registro.chamadas[0]?.corpo).toMatchObject({ horario: '09:15', local: 'Sala 3' })
  })

  it('celular: o cartão da data mostra editar e remover e remove o dia com uma chamada', async () => {
    simularLargura(390)
    const registro = abrirAdm(parComAula())
    const usuario = userEvent.setup()
    await screen.findByRole('tab', { name: 'Por data' })
    await usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    const dia = within(linha('2026-10-04'))
    expect(dia.getByRole('button', { name: 'Editar horário, local e título' })).toBeInTheDocument()
    await usuario.click(dia.getByRole('button', { name: 'Remover dia de classe' }))
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/aulas-planejadas/${AULA}` })
  })
})

describe('Par desfeito: o cronograma ainda guarda requisitos da avançada', () => {
  const R1 = criarRequisitoMontagem(1, { data: '2026-10-04' })
  const AN1 = criarRequisitoAvancada(1, { data: '2026-10-04' })
  const datas = [criarDataMontagem('2026-10-04', { aulaId: AULA, local: 'Sala 2', requisitoIds: [R1.id, AN1.id] })]
  const desfeito = criarMontagem({ requisitos: [R1, AN1], datas, avancada: null })
  const classes = [CLASSE_REGULAR, CLASSE_AVANCADA]

  it('o lado é pela dona do cronograma: o da avançada é "Avançada" com o nome da classe dele, e a regular conta só os dela', () => {
    const vista = montarVista(desfeito, classes)
    expect(vista.requisitos.map((requisito) => [requisito.lado, requisito.nomeDaClasse])).toEqual([['REGULAR', null], ['AVANCADA', 'Amigo da Natureza']])
    expect(progressoDoLado(vista, 'REGULAR')).toEqual({ comData: 1, total: 1 })
    expect(contagemDaData(vista, desfeito.datas[0] ?? criarDataMontagem('2026-10-04'))).toEqual({ regular: 1, avancada: 1 })
  })

  it('com o par ativo a avançada continua só "Avançada", sem o nome da classe na etiqueta', () => {
    const vista = montarVista(criarMontagem({ requisitos: [R1, AN1], datas, avancada: AVANCADA_MONTAGEM }), classes)
    expect(vista.requisitos.map((requisito) => requisito.nomeDaClasse)).toEqual([null, null])
  })

  it('"Classe dada" só quando toda classe que tem requisito na data já deu aula', () => {
    const vista = montarVista(desfeito, classes)
    const [dado] = desfeito.datas
    if (!dado) throw new Error('sem data')
    expect(aulaDadaPorTodas({ ...dado, classeIdsComAulaDada: [CLASSE_MONTAGEM.id] }, vista.requisitos)).toBe(false)
    expect(aulaDadaPorTodas({ ...dado, classeIdsComAulaDada: [CLASSE_MONTAGEM.id, AVANCADA_MONTAGEM.id] }, vista.requisitos)).toBe(true)
    // Data só com requisito da regular: basta a regular ter dado.
    expect(aulaDadaPorTodas({ ...dado, classeIdsComAulaDada: [CLASSE_MONTAGEM.id] }, vista.requisitos.slice(0, 1))).toBe(true)
  })

  it('não avisa que o dia some quando outra classe do encontro já deu aula (o servidor mantém a aula)', () => {
    const [dado] = desfeito.datas
    if (!dado) throw new Error('sem data')
    const unico = { ...dado, requisitoIds: [R1.id] }
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, unico)).toBe(true)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, { ...unico, classeIdsComAulaDada: [AVANCADA_MONTAGEM.id] })).toBe(false)
  })
})

describe('Par desfeito: requisito de classe fora do par não vai para outra data', () => {
  const R1 = criarRequisitoMontagem(1)
  const AN1 = criarRequisitoAvancada(1)
  const AN2 = criarRequisitoAvancada(2, { aulaId: AULA, data: '2026-10-04' })
  const datas = [criarDataMontagem('2026-10-04', { aulaId: AULA, requisitoIds: [AN2.id] }), criarDataMontagem('2026-10-18')]
  const desfeito = criarMontagem({ requisitos: [R1, AN1, AN2], datas, avancada: null })

  it('marca como fora do par só o requisito da avançada que já não anda com a regular', () => {
    expect(montarVista(desfeito).requisitos.map((requisito) => requisito.foraDoPar)).toEqual([false, true, true])
    expect(montarVista(criarMontagem({ requisitos: [R1, AN1], datas, avancada: AVANCADA_MONTAGEM })).requisitos.map((requisito) => requisito.foraDoPar)).toEqual([false, false])
  })

  it('computador: escolher o da avançada não oferece "Colocar aqui"; o da regular oferece; tirar continua', async () => {
    abrirAdm(desfeito)
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    expect(within(linha('2026-10-18')).queryByRole('button', { name: 'Colocar aqui em 18/10' })).not.toBeInTheDocument()
    expect(within(linha('2026-10-04')).getByRole('button', { name: `remover ${AN2.codigo} desta data` })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(R1.texto) }))
    expect(within(linha('2026-10-18')).getByRole('button', { name: 'Colocar aqui em 18/10' })).toBeInTheDocument()
  })

  it('celular: o da avançada sem data não abre a folha de datas e o da data só pode ser tirado', async () => {
    simularLargura(390)
    abrirAdm(desfeito)
    const usuario = userEvent.setup()
    await screen.findByRole('tab', { name: 'Por data' })
    expect(screen.getByRole('button', { name: new RegExp(AN1.texto) })).toBeDisabled()
    expect(screen.getByRole('button', { name: new RegExp(R1.texto) })).toBeEnabled()
    await usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    const dia = within(linha('2026-10-04'))
    expect(dia.queryByRole('button', { name: `Trocar data do ${AN2.codigo}` })).not.toBeInTheDocument()
    expect(dia.getByRole('button', { name: `Tirar ${AN2.codigo} da data` })).toBeInTheDocument()
  })
})

describe('O par vem da API', () => {
  const segunda = criarClasse({ id: uuid(120), nome: 'Segunda avançada', tipo: 'AVANCADA', classeBaseId: uuid(100), ordem: 9 })
  const lista = [CLASSE_REGULAR, CLASSE_AVANCADA, segunda]

  it('só a avançada indicada pela regular forma par; a segunda avançada é uma classe solta', () => {
    expect(parDaClasse(lista, CLASSE_REGULAR.id)?.avancada.id).toBe(CLASSE_AVANCADA.id)
    expect(parDaClasse(lista, segunda.id)).toBeNull()
    expect(regularDaClasse(lista, segunda.id)).toBe(segunda.id)
    expect(regularDaClasse(lista, CLASSE_AVANCADA.id)).toBe(CLASSE_REGULAR.id)
  })
})
