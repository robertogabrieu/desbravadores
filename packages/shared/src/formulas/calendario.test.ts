import { describe, expect, it } from 'vitest'
import { MARCACOES_PADRAO, TIPOS_EVENTO } from '../enums'
import {
  datasDaMontagem, datasDeClasse, diasDeReuniao, emConflito, feriasAte, horarioELocalDoDia, proximaReuniao,
  situacaoDaAula, situacaoDaData, validarEvento, type EventoDoCalendario,
} from './calendario'

type Tipo = (typeof TIPOS_EVENTO)[number]

/** Evento com as marcações do tipo (padrão: Feriado); datas de out/2026, domingo = 0. */
function evento(dados: Partial<EventoDoCalendario> & Pick<EventoDoCalendario, 'inicio'> & { tipo?: Tipo }): EventoDoCalendario {
  const tipo = dados.tipo ?? 'FERIADO'
  return { nome: 'Evento', fim: dados.inicio, horario: null, local: null, ...MARCACOES_PADRAO[tipo], ...dados, tipo }
}

const DOMINGO = 0
const ACAMPAMENTO = evento({ nome: 'Acampamento', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18' })
const SEM_REUNIAO_25 = evento({ nome: 'Sem reunião', tipo: 'SEM_REUNIAO', inicio: '2026-10-25' })
const FERIAS_OUTUBRO = evento({ nome: 'Férias', tipo: 'FERIAS', inicio: '2026-10-10', fim: '2026-10-20' })
const EXTRA_QUARTA = evento({ nome: 'Encontro de pais', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-07', horario: '19:30', local: 'Parque' })
const FERIAS_VERAO = evento({ nome: 'Férias de verão', tipo: 'FERIAS', inicio: '2026-12-07', fim: '2027-01-31' })

describe('situacaoDaData', () => {
  it('sem evento num domingo: reunião e classe', () => {
    expect(situacaoDaData('2026-10-04', DOMINGO, [])).toEqual({
      reuniaoMantida: true, classeLiberada: true, bomParaCampo: false,
      temReuniao: true, temClasse: true, ferias: false, extra: null, eventos: [],
    })
  })

  it('sem evento numa quarta: nem reunião nem classe, mas nada foi tirado', () => {
    expect(situacaoDaData('2026-10-07', DOMINGO, [])).toMatchObject({ reuniaoMantida: true, temReuniao: false, temClasse: false })
  })

  it('entre comuns, qualquer um que tire, tira', () => {
    const feriado = evento({ nome: 'Feriado', inicio: '2026-10-11' })
    const semReuniao = evento({ nome: 'Sem reunião', tipo: 'SEM_REUNIAO', inicio: '2026-10-11' })
    const evt = evento({ nome: 'Evento', tipo: 'EVENTO', inicio: '2026-10-11' })
    const acampamento = evento({ nome: 'Acampamento', tipo: 'ACAMPAMENTO', inicio: '2026-10-11' })
    expect(situacaoDaData('2026-10-11', DOMINGO, [feriado, semReuniao]).reuniaoMantida).toBe(false)
    expect(situacaoDaData('2026-10-11', DOMINGO, [feriado, evt]).classeLiberada).toBe(false)
    expect(situacaoDaData('2026-10-11', DOMINGO, [acampamento, feriado]).bomParaCampo).toBe(true)
  })

  it('campo dá classe fora do dia normal', () => {
    expect(situacaoDaData('2026-10-17', DOMINGO, [ACAMPAMENTO])).toMatchObject({ temClasse: true, temReuniao: false })
  })

  it('Férias no domingo: sem reunião e sem classe, mas a classe segue liberada', () => {
    expect(situacaoDaData('2026-10-11', DOMINGO, [FERIAS_OUTUBRO])).toMatchObject({
      ferias: true, temReuniao: false, temClasse: false, classeLiberada: true,
    })
  })

  it('acampamento dentro das férias continua com classe', () => {
    expect(situacaoDaData('2026-10-18', DOMINGO, [FERIAS_OUTUBRO, ACAMPAMENTO]).temClasse).toBe(true)
    expect(situacaoDaData('2026-10-17', DOMINGO, [FERIAS_OUTUBRO, ACAMPAMENTO]).temClasse).toBe(true)
  })

  it('extra numa quarta dá a reunião, com nome e horário da extra', () => {
    expect(situacaoDaData('2026-10-07', DOMINGO, [EXTRA_QUARTA])).toMatchObject({
      temReuniao: true, temClasse: true,
      extra: { nome: 'Encontro de pais', temReuniao: true, temClasse: true, horario: '19:30', local: 'Parque' },
    })
  })

  it('a extra vence: dentro das férias e num feriado sem classe', () => {
    const extraSabado = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-17' })
    const extraDomingo = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-11' })
    expect(situacaoDaData('2026-10-17', DOMINGO, [FERIAS_OUTUBRO, extraSabado])).toMatchObject({ temReuniao: true, temClasse: true })
    expect(situacaoDaData('2026-10-11', DOMINGO, [FERIAS_OUTUBRO, extraDomingo])).toMatchObject({ temReuniao: true, temClasse: true })
    const feriadoSemClasse = evento({ nome: 'Feriado', inicio: '2026-10-07', temClasse: false })
    expect(situacaoDaData('2026-10-07', DOMINGO, [feriadoSemClasse, EXTRA_QUARTA])).toMatchObject({ temReuniao: true, temClasse: true })
  })

  it('extra com Terá reunião = não num domingo normal não cancela o dia', () => {
    const extra = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-11', temReuniao: false })
    expect(situacaoDaData('2026-10-11', DOMINGO, [extra]).temReuniao).toBe(true)
  })

  it('evento removido é ignorado; eventos traz comuns e a extra', () => {
    expect(situacaoDaData('2026-10-25', DOMINGO, [{ ...SEM_REUNIAO_25, removido: true }])).toEqual(situacaoDaData('2026-10-25', DOMINGO, []))
    const feriado = evento({ nome: 'Feriado', inicio: '2026-10-07' })
    expect(situacaoDaData('2026-10-07', DOMINGO, [feriado, EXTRA_QUARTA]).eventos).toEqual(['Feriado', 'Encontro de pais'])
  })

  it('encontro da Classe Bíblica não muda a regra do dia, nem com marcações fora do padrão', () => {
    const contas = (situacao: ReturnType<typeof situacaoDaData>) => ({ ...situacao, eventos: [] })
    const neutro = evento({ nome: 'Classe Bíblica', tipo: 'CLASSE_BIBLICA', inicio: '2026-10-11' })
    const torto = { ...neutro, temReuniao: false, temClasse: false, bomParaCampo: true }
    for (const data of ['2026-10-11', '2026-10-25']) {
      const semEle = situacaoDaData(data, DOMINGO, data === '2026-10-25' ? [SEM_REUNIAO_25] : [])
      for (const cb of [neutro, torto]) {
        const comEle = situacaoDaData(data, DOMINGO, [...(data === '2026-10-25' ? [SEM_REUNIAO_25] : []), { ...cb, inicio: data, fim: data }])
        expect(contas(comEle)).toEqual(contas(semEle))
      }
    }
  })
})

describe('equivalência com as marcações negativas de antes', () => {
  const combinacoes = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ c: (n & 4) > 0, b: (n & 2) > 0, f: (n & 1) > 0 }))
  const datas = [{ data: '2026-10-04', domingo: true }, { data: '2026-10-07', domingo: false }]

  it.each(combinacoes.flatMap((m) => datas.map((d) => ({ ...m, ...d }))))(
    'cancela=$c bloqueia=$b campo=$f em $data: mesma classe e mesmo conflito',
    ({ c, b, f, data, domingo }) => {
      const antigo = { temClasse: !b && (f || (domingo && !c)), conflito: b || (c && !f) }
      const situacao = situacaoDaData(data, DOMINGO, [evento({ tipo: 'EVENTO', inicio: data, temReuniao: !c, temClasse: !b, bomParaCampo: f })])
      const conflito = emConflito({ trilha: 'INDIVIDUAL', temRequisitos: true, temRegistro: false, data, hoje: '2026-10-01', situacaoDaData: situacao })
      expect({ temClasse: situacao.temClasse, conflito }).toEqual(antigo)
    },
  )
})

describe('emConflito', () => {
  const base = {
    trilha: 'INDIVIDUAL' as const,
    temRequisitos: true,
    temRegistro: false,
    data: '2026-10-25',
    hoje: '2026-10-10',
    situacaoDaData: situacaoDaData('2026-10-25', DOMINGO, [SEM_REUNIAO_25]),
  }

  it('individual futura, com requisitos, sem registro, em data que deixou de ser de classe: conflito', () => {
    expect(emConflito(base)).toBe(true)
  })

  it('hoje conta como futura', () => {
    expect(emConflito({ ...base, hoje: '2026-10-25' })).toBe(true)
  })

  it('cada condição que falta desarma o conflito', () => {
    expect(emConflito({ ...base, trilha: 'AGRUPADAS' })).toBe(false)
    expect(emConflito({ ...base, temRequisitos: false })).toBe(false)
    expect(emConflito({ ...base, temRegistro: true })).toBe(false)
    expect(emConflito({ ...base, hoje: '2026-10-26' })).toBe(false)
  })

  it('data sem evento numa quarta não é conflito', () => {
    expect(emConflito({ ...base, data: '2026-10-07', situacaoDaData: situacaoDaData('2026-10-07', DOMINGO, []) })).toBe(false)
  })

  it('extra com classe sobre "Sem reunião" segura a data', () => {
    const extra = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-25' })
    expect(emConflito({ ...base, situacaoDaData: situacaoDaData('2026-10-25', DOMINGO, [SEM_REUNIAO_25, extra]) })).toBe(false)
  })

  it('domingo em férias é conflito', () => {
    expect(emConflito({ ...base, data: '2026-10-11', situacaoDaData: situacaoDaData('2026-10-11', DOMINGO, [FERIAS_OUTUBRO]) })).toBe(true)
  })
})

describe('diasDeReuniao', () => {
  it('inclui a extra de quarta e tira os domingos de férias', () => {
    expect(diasDeReuniao('2026-10-01', '2026-10-31', DOMINGO, [EXTRA_QUARTA, FERIAS_OUTUBRO])).toEqual(['2026-10-04', '2026-10-07', '2026-10-25'])
  })

  it('respeita o dia da semana configurado (quarta = 3)', () => {
    expect(diasDeReuniao('2026-10-01', '2026-10-31', 3, [])).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'])
  })

  it('início e fim entram; intervalo invertido dá lista vazia', () => {
    expect(diasDeReuniao('2026-10-04', '2026-10-04', DOMINGO, [])).toEqual(['2026-10-04'])
    expect(diasDeReuniao('2026-10-31', '2026-10-01', DOMINGO, [])).toEqual([])
  })
})

describe('datasDeClasse (individuais)', () => {
  it('out/2026 com acampamento 16–18: 04, 11, 16, 17, 18, 25', () => {
    expect(datasDeClasse('2026-10-01', '2026-10-31', DOMINGO, [ACAMPAMENTO])).toEqual([
      '2026-10-04', '2026-10-11', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-25',
    ])
  })

  it('evento sem classe tira a data mesmo sendo dia de reunião', () => {
    const evt = evento({ tipo: 'EVENTO', inicio: '2026-10-11' })
    expect(datasDeClasse('2026-10-01', '2026-10-31', DOMINGO, [evt])).toEqual(['2026-10-04', '2026-10-18', '2026-10-25'])
  })

  it('sem reunião e sem campo tira a data', () => {
    expect(datasDeClasse('2026-10-01', '2026-10-31', DOMINGO, [SEM_REUNIAO_25])).toEqual(['2026-10-04', '2026-10-11', '2026-10-18'])
  })
})

describe('datasDaMontagem', () => {
  it('domingo em férias some; domingo "Sem reunião" fica', () => {
    expect(datasDaMontagem('2026-10-01', '2026-10-31', DOMINGO, [FERIAS_OUTUBRO, SEM_REUNIAO_25])).toEqual(['2026-10-04', '2026-10-25'])
  })

  it('acampamento em férias e extra com classe entram; extra só com reunião não', () => {
    const extraSoReuniao = evento({ nome: 'Só reunião', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-21', temClasse: false })
    expect(datasDaMontagem('2026-10-01', '2026-10-31', DOMINGO, [FERIAS_OUTUBRO, ACAMPAMENTO, EXTRA_QUARTA, extraSoReuniao])).toEqual([
      '2026-10-04', '2026-10-07', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-25',
    ])
  })

  it('encontro da Classe Bíblica no domingo ou numa quarta não tira nem acrescenta data', () => {
    const cb = (inicio: string) => ({ ...evento({ nome: 'Classe Bíblica', tipo: 'CLASSE_BIBLICA', inicio }), bomParaCampo: true, temReuniao: false })
    const sem = datasDaMontagem('2026-10-01', '2026-10-31', DOMINGO, [SEM_REUNIAO_25])
    expect(datasDaMontagem('2026-10-01', '2026-10-31', DOMINGO, [SEM_REUNIAO_25, cb('2026-10-11'), cb('2026-10-14')])).toEqual(sem)
    expect(sem).toContain('2026-10-11')
  })
})

describe('proximaReuniao', () => {
  it('hoje inclusive', () => {
    expect(proximaReuniao('2026-10-04', DOMINGO, [])).toEqual({ data: '2026-10-04', extra: null })
  })

  it('pula as férias', () => {
    expect(proximaReuniao('2026-12-10', DOMINGO, [FERIAS_VERAO])).toEqual({ data: '2027-02-07', extra: null })
  })

  it('extra numa quarta antes do domingo', () => {
    expect(proximaReuniao('2026-10-05', DOMINGO, [EXTRA_QUARTA])).toEqual({
      data: '2026-10-07',
      extra: { nome: 'Encontro de pais', temReuniao: true, temClasse: true, horario: '19:30', local: 'Parque' },
    })
  })

  it('nada na janela: null', () => {
    const ferias = evento({ nome: 'Férias', tipo: 'FERIAS', inicio: '2026-10-01', fim: '2027-03-31' })
    expect(proximaReuniao('2026-10-01', DOMINGO, [ferias])).toBeNull()
    const curtas = evento({ nome: 'Férias', tipo: 'FERIAS', inicio: '2026-10-01', fim: '2026-10-10' })
    expect(proximaReuniao('2026-10-01', DOMINGO, [curtas], 7)).toBeNull()
  })
})

describe('feriasAte', () => {
  it('primeiro domingo em férias: o fim delas', () => {
    expect(feriasAte('2026-12-10', DOMINGO, [FERIAS_VERAO])).toBe('2027-01-31')
  })

  it('férias encadeadas se juntam; "Sem reunião" entre elas não separa', () => {
    const a = evento({ nome: 'A', tipo: 'FERIAS', inicio: '2026-12-07', fim: '2027-01-15' })
    const b = evento({ nome: 'B', tipo: 'FERIAS', inicio: '2027-01-16', fim: '2027-01-31' })
    expect(feriasAte('2026-12-10', DOMINGO, [a, b])).toBe('2027-01-31')
    const a2 = evento({ nome: 'A', tipo: 'FERIAS', inicio: '2026-12-07', fim: '2027-01-08' })
    const semReuniao = evento({ nome: 'Sem reunião', tipo: 'SEM_REUNIAO', inicio: '2027-01-10' })
    const b2 = evento({ nome: 'B', tipo: 'FERIAS', inicio: '2027-01-11', fim: '2027-01-31' })
    expect(feriasAte('2026-12-10', DOMINGO, [a2, semReuniao, b2])).toBe('2027-01-31')
  })

  it('domingo com reunião entre as férias separa', () => {
    const a = evento({ nome: 'A', tipo: 'FERIAS', inicio: '2026-12-07', fim: '2027-01-08' })
    const b = evento({ nome: 'B', tipo: 'FERIAS', inicio: '2027-01-11', fim: '2027-01-31' })
    expect(feriasAte('2026-12-10', DOMINGO, [a, b])).toBe('2027-01-08')
  })

  it('extra no primeiro domingo, ou primeiro domingo sem evento: null', () => {
    const extra = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-12-13' })
    expect(feriasAte('2026-12-10', DOMINGO, [FERIAS_VERAO, extra])).toBeNull()
    expect(feriasAte('2026-10-05', DOMINGO, [])).toBeNull()
  })
})

describe('horarioELocalDoDia', () => {
  const clube = { horario: '09:00', local: 'Sede' }

  it('extra com reunião: horário dela, local do clube quando o dela é nulo', () => {
    const extra = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-07', horario: '15:00' })
    expect(horarioELocalDoDia(situacaoDaData('2026-10-07', DOMINGO, [extra]), clube)).toEqual({ horario: '15:00', local: 'Sede' })
  })

  it('extra só com classe: os dois do clube', () => {
    const extra = evento({ nome: 'Extra', tipo: 'REUNIAO_EXTRA', inicio: '2026-10-07', horario: '15:00', local: 'Parque', temReuniao: false })
    expect(horarioELocalDoDia(situacaoDaData('2026-10-07', DOMINGO, [extra]), clube)).toEqual(clube)
  })
})

describe('validarEvento', () => {
  const base = { tipo: 'EVENTO' as const, inicio: '2026-10-10', fim: '2026-10-10', temReuniao: true, temClasse: false }

  it('fim antes do início', () => {
    expect(validarEvento({ ...base, fim: '2026-10-09' })).toEqual([{ campo: 'fim', mensagem: 'O fim não pode ser antes do início' }])
  })

  it('reunião extra de dois dias', () => {
    expect(validarEvento({ ...base, tipo: 'REUNIAO_EXTRA', fim: '2026-10-11' })).toEqual([{ campo: 'fim', mensagem: 'A reunião extra é de um dia só.' }])
  })

  it('reunião extra sem as duas caixas; evento válido', () => {
    expect(validarEvento({ ...base, tipo: 'REUNIAO_EXTRA', temReuniao: false, temClasse: false })).toEqual([
      { campo: 'temReuniao', mensagem: 'Marque Terá reunião, Terá classe ou as duas.' },
    ])
    expect(validarEvento(base)).toEqual([])
  })
})

describe('situacaoDaAula', () => {
  const hoje = '2026-10-10'
  it('DADA se tem registro, mesmo em conflito', () => {
    expect(situacaoDaAula({ temRegistro: true, emConflito: true, data: '2026-10-01', hoje })).toBe('DADA')
  })
  it('CONFLITO vem antes de HOJE', () => {
    expect(situacaoDaAula({ temRegistro: false, emConflito: true, data: hoje, hoje })).toBe('CONFLITO')
  })
  it('HOJE, NAO_REGISTRADA e PLANEJADA', () => {
    expect(situacaoDaAula({ temRegistro: false, emConflito: false, data: hoje, hoje })).toBe('HOJE')
    expect(situacaoDaAula({ temRegistro: false, emConflito: false, data: '2026-10-09', hoje })).toBe('NAO_REGISTRADA')
    expect(situacaoDaAula({ temRegistro: false, emConflito: false, data: '2026-10-11', hoje })).toBe('PLANEJADA')
  })
})
