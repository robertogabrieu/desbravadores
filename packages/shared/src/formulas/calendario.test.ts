import { describe, expect, it } from 'vitest'
import { MARCACOES_PADRAO } from '../enums'
import { datasDeAula, diasDeReuniao, emConflito, situacaoDaAula, situacaoDaData, type EventoDoCalendario } from './calendario'

function evento(dados: Partial<EventoDoCalendario> & Pick<EventoDoCalendario, 'inicio'>): EventoDoCalendario {
  return { nome: 'Evento', fim: dados.inicio, ...MARCACOES_PADRAO.FERIADO, ...dados }
}

const ACAMPAMENTO = evento({ nome: 'Acampamento', inicio: '2026-10-16', fim: '2026-10-18', ...MARCACOES_PADRAO.ACAMPAMENTO })
const SEM_REUNIAO_25 = evento({ nome: 'Sem reunião', inicio: '2026-10-25', ...MARCACOES_PADRAO.SEM_REUNIAO })

describe('situacaoDaData', () => {
  it('sem evento: tudo falso', () => {
    expect(situacaoDaData('2026-10-04', [])).toEqual({ cancelaReuniao: false, bloqueiaAula: false, bomParaCampo: false, eventos: [] })
  })

  it('evento de vários dias vale para todas as datas do intervalo, e só elas', () => {
    expect(situacaoDaData('2026-10-18', [ACAMPAMENTO])).toMatchObject({ cancelaReuniao: true, bomParaCampo: true, bloqueiaAula: false, eventos: ['Acampamento'] })
    expect(situacaoDaData('2026-10-16', [ACAMPAMENTO]).bomParaCampo).toBe(true)
    expect(situacaoDaData('2026-10-15', [ACAMPAMENTO]).bomParaCampo).toBe(false)
    expect(situacaoDaData('2026-10-19', [ACAMPAMENTO]).bomParaCampo).toBe(false)
  })

  it('dois eventos na data, um bloqueia: bloqueia', () => {
    const feriado = evento({ nome: 'Feriado', inicio: '2026-10-17' })
    const evt = evento({ nome: 'Evento', inicio: '2026-10-17', ...MARCACOES_PADRAO.EVENTO })
    expect(situacaoDaData('2026-10-17', [feriado, evt])).toMatchObject({ bloqueiaAula: true, eventos: ['Feriado', 'Evento'] })
  })

  it('evento removido é ignorado', () => {
    expect(situacaoDaData('2026-10-25', [{ ...SEM_REUNIAO_25, removido: true }])).toMatchObject({ cancelaReuniao: false, bloqueiaAula: false, eventos: [] })
  })
})

describe('diasDeReuniao', () => {
  it('out/2026, domingo, sem reunião em 25/10: 04, 11 e 18', () => {
    expect(diasDeReuniao('2026-10-01', '2026-10-31', 0, [SEM_REUNIAO_25])).toEqual(['2026-10-04', '2026-10-11', '2026-10-18'])
  })

  it('respeita o dia da semana configurado (quarta = 3)', () => {
    expect(diasDeReuniao('2026-10-01', '2026-10-31', 3, [])).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'])
  })

  it('início e fim entram; intervalo invertido dá lista vazia', () => {
    expect(diasDeReuniao('2026-10-04', '2026-10-04', 0, [])).toEqual(['2026-10-04'])
    expect(diasDeReuniao('2026-10-31', '2026-10-01', 0, [])).toEqual([])
  })
})

describe('datasDeAula (individuais)', () => {
  it('out/2026 com acampamento 16–18: 04, 11, 16, 17, 18, 25', () => {
    expect(datasDeAula('2026-10-01', '2026-10-31', 0, [ACAMPAMENTO])).toEqual([
      '2026-10-04', '2026-10-11', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-25',
    ])
  })

  it('bloqueiaAula tira a data mesmo sendo dia de reunião', () => {
    const evt = evento({ inicio: '2026-10-11', ...MARCACOES_PADRAO.EVENTO })
    expect(datasDeAula('2026-10-01', '2026-10-31', 0, [evt])).toEqual(['2026-10-04', '2026-10-18', '2026-10-25'])
  })

  it('cancelamento sem bomParaCampo tira a data', () => {
    expect(datasDeAula('2026-10-01', '2026-10-31', 0, [SEM_REUNIAO_25])).toEqual(['2026-10-04', '2026-10-11', '2026-10-18'])
  })
})

describe('emConflito', () => {
  const base = {
    trilha: 'INDIVIDUAL' as const,
    temRequisitos: true,
    temRegistro: false,
    data: '2026-10-25',
    hoje: '2026-10-10',
    situacaoDaData: situacaoDaData('2026-10-25', [SEM_REUNIAO_25]),
  }

  it('individual futura, com requisitos, sem registro, em data que deixou de ser de aula: conflito', () => {
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

  it('bloqueiaAula conflita; cancelaReuniao com bomParaCampo não; data sem evento não', () => {
    const bloqueia = situacaoDaData('2026-10-25', [evento({ inicio: '2026-10-25', ...MARCACOES_PADRAO.EVENTO })])
    expect(emConflito({ ...base, situacaoDaData: bloqueia })).toBe(true)
    const campo = situacaoDaData('2026-10-25', [evento({ inicio: '2026-10-25', ...MARCACOES_PADRAO.ACAMPAMENTO })])
    expect(emConflito({ ...base, situacaoDaData: campo })).toBe(false)
    expect(emConflito({ ...base, situacaoDaData: situacaoDaData('2026-10-25', []) })).toBe(false)
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
