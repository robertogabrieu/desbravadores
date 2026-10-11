import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Montagem } from '../../api/montagem'
import type { ModoConexao } from '../../offline'
import { criarClasse, handlerClasses } from '../../testes/handlers/leitura'
import {
  AVANCADA_MONTAGEM,
  criarAvancadaMontagem,
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
import { nomeDoPar, parDaClasse, regularDaClasse } from './classes'
import { aceitaRequisitoNovo, dataBloqueada, diaComDadosSomeAoTirar } from './datas'
import { rotasAdmCronogramas } from './rotas'
import { aulasDaData, diaPodeMudar, ordenarPorVazias, unirMontagem } from './unida'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const AULA_REGULAR = uuid(2001)
const AULA_AVANCADA = uuid(2501)
const CLASSE_AVANCADA = criarClasse({ id: AVANCADA_MONTAGEM.id, nome: 'Amigo da Natureza', tipo: 'AVANCADA', classeBaseId: uuid(100), ordem: 2 })

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement

function abrirAdm(montagem: Montagem, rota = '/adm/cronogramas', classes = [criarClasse(), CLASSE_AVANCADA]) {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(classes), ...handlers)
  renderizarRotas(rotasAdmCronogramas, rota)
  return registro
}

/** Avançada com a aula de cada data no id pedido (a fixture padrão deixa `aulaId` nulo). */
function comAulaDaAvancada(montagem: Montagem, aulaId: string | null): Montagem {
  if (!montagem.avancada) throw new Error('montagem sem avançada')
  return { ...montagem, avancada: { ...montagem.avancada, datas: montagem.avancada.datas.map((dado) => ({ ...dado, aulaId })) } }
}

/** Par com a aula de 04/10 já planejada nas duas classes, ou só em uma. */
function parComAulas(aulas: { regular: string | null; avancada: string | null }, detalhe: { horario?: string } = {}): Montagem {
  const R1 = criarRequisitoMontagem(1, { aulaId: aulas.regular, data: '2026-10-04' })
  const AN1 = criarRequisitoAvancada(1, { data: '2026-10-04' })
  const datas = [criarDataMontagem('2026-10-04', { aulaId: aulas.regular, requisitoIds: aulas.regular ? [R1.id] : [], ...detalhe })]
  const avancada = criarAvancadaMontagem([AN1], datas)
  return comAulaDaAvancada(criarMontagem({ requisitos: [R1], datas, avancada }), aulas.avancada)
}

function primeiraData(montagem: Montagem) {
  const [dado] = unirMontagem(montagem).datas
  if (!dado) throw new Error('montagem sem data')
  return dado
}

describe('Agrupadas não formam par', () => {
  const agrupada = criarClasse({ id: uuid(104), nome: 'Agrupadas (Amigo a Guia)', trilha: 'AGRUPADAS', ordem: 13 })
  const agrupadaAvancada = criarClasse({ id: uuid(105), nome: 'Agrupadas — avançada', tipo: 'AVANCADA', trilha: 'AGRUPADAS', classeBaseId: uuid(104), ordem: 14 })
  const classes = [agrupada, agrupadaAvancada]

  it('parDaClasse, regularDaClasse e nomeDoPar tratam as duas como classes soltas', () => {
    expect(parDaClasse(classes, agrupada.id)).toBeNull()
    expect(parDaClasse(classes, agrupadaAvancada.id, true)).toBeNull()
    expect(regularDaClasse(classes, agrupadaAvancada.id)).toBe(agrupadaAvancada.id)
    expect(nomeDoPar(classes, agrupada)).toBe('Agrupadas (Amigo a Guia)')
  })

  it('o seletor mostra as duas pelo próprio nome e ?classe=<avançada> abre a montagem dela', async () => {
    const montagem = criarMontagem({ classe: { ...AVANCADA_MONTAGEM, id: agrupadaAvancada.id, trilha: 'AGRUPADAS' }, datasLivres: true })
    const registro = abrirAdm(montagem, `/adm/cronogramas?classe=${agrupadaAvancada.id}`, classes)
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    await waitFor(() =>
      expect(within(seletor).queryAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Agrupadas (Amigo a Guia)', 'Agrupadas — avançada']),
    )
    await waitFor(() => expect(registro.classesLidas).toEqual([agrupadaAvancada.id]))
  })
})

describe('Conflito da avançada vem do servidor', () => {
  const evento = situacaoDoDia('2026-10-25', [{ nome: 'Ensaio', tipo: 'EVENTO' }])

  function montar(conflito: boolean) {
    const AN = criarRequisitoAvancada(1, { data: '2026-10-25' })
    const datas = [criarDataMontagem('2026-10-25', { situacao: evento })]
    const base = criarAvancadaMontagem([AN], datas)
    return criarMontagem({ datas, avancada: { ...base, datas: base.datas.map((dado) => ({ ...dado, conflito })) } })
  }

  it('usa o valor do servidor nos dois sentidos, sem refazer a conta no navegador', () => {
    const comConflito = primeiraData(montar(true))
    expect(comConflito.lados.AVANCADA.conflito).toBe(true)
    expect(comConflito.conflito).toBe(true)
    // Mesmo com a data em evento, o navegador não decide por conta própria.
    const semConflito = primeiraData(montar(false))
    expect(semConflito.lados.AVANCADA.conflito).toBe(false)
    expect(semConflito.conflito).toBe(false)
  })
})

describe('Data bloqueada por lado', () => {
  // Dia sem classe, mas com classe liberada quando há aula marcada (férias com classe marcada).
  const situacao = { ...situacaoDoDia('2026-10-04'), temClasse: false, classeLiberada: true }

  function soAvancadaTemAula() {
    const datas = [criarDataMontagem('2026-10-04', { situacao })]
    const avancada = criarAvancadaMontagem([criarRequisitoAvancada(1)], datas)
    return primeiraData(comAulaDaAvancada(criarMontagem({ requisitos: [criarRequisitoMontagem(1)], datas, avancada }), AULA_AVANCADA))
  }

  it('não bloqueia a avançada, aceita requisito dela e segue recusando o da regular', () => {
    const dado = soAvancadaTemAula()
    expect(dataBloqueada(dado, 'AVANCADA')).toBe(false)
    expect(dataBloqueada(dado, 'REGULAR')).toBe(true)
    expect(dataBloqueada(dado)).toBe(false)
    expect(aceitaRequisitoNovo({ datasLivres: false }, dado, 'AVANCADA')).toBe(true)
    expect(aceitaRequisitoNovo({ datasLivres: false }, dado, 'REGULAR')).toBe(false)
  })

  it('"Mais vazias primeiro" não manda para o fim a data aberta só para a avançada', () => {
    const aberta = { ...soAvancadaTemAula(), requisitoIds: ['a', 'b'] }
    const fechada = primeiraData(criarMontagem({ datas: [criarDataMontagem('2026-10-05', { situacao })] }))
    expect(dataBloqueada(fechada)).toBe(true)
    expect(ordenarPorVazias([fechada, aberta]).map((dado) => dado.data)).toEqual(['2026-10-04', '2026-10-05'])
  })
})

describe('Aviso de dia que some, por lado', () => {
  function montar(regular: number, avancada: number) {
    const daRegular = Array.from({ length: regular }, (_, n) => criarRequisitoMontagem(n + 1, { data: '2026-10-04' }))
    const daAvancada = Array.from({ length: avancada }, (_, n) => criarRequisitoAvancada(n + 1, { data: '2026-10-04' }))
    const datas = [criarDataMontagem('2026-10-04', { aulaId: AULA_REGULAR, local: 'Sala 2', requisitoIds: daRegular.map((requisito) => requisito.id) })]
    const base = criarAvancadaMontagem(daAvancada, datas)
    return primeiraData(comAulaDaAvancada(criarMontagem({ requisitos: daRegular, datas, avancada: base }), AULA_AVANCADA))
  }

  it('o último da regular avisa mesmo que a avançada tenha requisito na data', () => {
    const dado = montar(1, 2)
    expect(dado.requisitoIds).toHaveLength(3)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, dado, 'REGULAR')).toBe(true)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, dado, 'AVANCADA')).toBe(false)
    expect(diaComDadosSomeAoTirar({ datasLivres: true }, dado, 'REGULAR')).toBe(false)
  })

  it('o último da avançada avisa mesmo que a regular tenha mais de um', () => {
    const dado = montar(2, 1)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, dado, 'AVANCADA')).toBe(true)
    expect(diaComDadosSomeAoTirar({ datasLivres: false }, dado, 'REGULAR')).toBe(false)
  })
})

describe('Dia da data unida', () => {
  it('aulasDaData e diaPodeMudar consideram os dois lados', () => {
    const ambas = primeiraData(parComAulas({ regular: AULA_REGULAR, avancada: AULA_AVANCADA }))
    const soAvancada = primeiraData(parComAulas({ regular: null, avancada: AULA_AVANCADA }))
    expect(aulasDaData(ambas)).toEqual([AULA_REGULAR, AULA_AVANCADA])
    expect(aulasDaData(soAvancada)).toEqual([AULA_AVANCADA])
    expect(diaPodeMudar(soAvancada)).toBe(true)
    expect(diaPodeMudar({ ...ambas, lados: { ...ambas.lados, AVANCADA: { ...ambas.lados.AVANCADA, aulaDada: true } } })).toBe(false)
  })

  it('computador: "Remover dia de classe" apaga as aulas das duas classes e a confirmação fala das duas', async () => {
    const registro = abrirAdm(parComAulas({ regular: AULA_REGULAR, avancada: AULA_AVANCADA }))
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Remover dia de classe' }))
    expect(screen.getByText(/requisitos das duas classes neste dia voltam a ficar sem data/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas.map((chamada) => [chamada.metodo, chamada.caminho])).toEqual([
      ['DELETE', `/api/aulas-planejadas/${AULA_REGULAR}`],
      ['DELETE', `/api/aulas-planejadas/${AULA_AVANCADA}`],
    ])
  })

  it('computador: "Editar horário, local e título" grava nas duas aulas', async () => {
    const registro = abrirAdm(parComAulas({ regular: AULA_REGULAR, avancada: AULA_AVANCADA }, { horario: '09:15' }))
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Editar horário, local e título' }))
    await usuario.type(screen.getByLabelText('Local'), 'Sala 3')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas.map((chamada) => [chamada.metodo, chamada.caminho])).toEqual([
      ['PATCH', `/api/aulas-planejadas/${AULA_REGULAR}`],
      ['PATCH', `/api/aulas-planejadas/${AULA_AVANCADA}`],
    ])
    expect(registro.chamadas[1]?.corpo).toMatchObject({ horario: '09:15', local: 'Sala 3' })
  })

  it('celular: data em que só a avançada tem aula também mostra editar e remover, e remove a dela', async () => {
    simularLargura(390)
    const registro = abrirAdm(parComAulas({ regular: null, avancada: AULA_AVANCADA }))
    const usuario = userEvent.setup()
    await screen.findByRole('tab', { name: 'Por data' })
    await usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    const dia = within(linha('2026-10-04'))
    expect(dia.getByRole('button', { name: 'Editar horário, local e título' })).toBeInTheDocument()
    await usuario.click(dia.getByRole('button', { name: 'Remover dia de classe' }))
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/aulas-planejadas/${AULA_AVANCADA}` })
  })
})
