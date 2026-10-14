import { AgendaPublicaSaida } from '@desbravadores/shared'
import { montarCompromissos, type EventoPublicoBruto } from './compromissos'

// 2026-10-04 é domingo (diaReuniao 0); a janela cobre 4 domingos: 04, 11, 18, 25.
const HOJE = '2026-10-04'
const FIM = '2026-10-28'

function evento(tipo: EventoPublicoBruto['tipo'], inicio: string, mudancas: Partial<EventoPublicoBruto> = {}): EventoPublicoBruto {
  const reunioes = tipo === 'REUNIAO_EXTRA' || tipo === 'EVENTO' || tipo === 'EVENTO_ESPECIAL'
  return {
    nome: `${tipo} ${inicio}`,
    tipo,
    inicio,
    fim: inicio,
    horario: null,
    local: null,
    temReuniao: reunioes && tipo === 'REUNIAO_EXTRA',
    temClasse: tipo !== 'FERIAS' && tipo !== 'FERIADO',
    bomParaCampo: false,
    uniforme: null,
    ...mudancas,
  }
}

const montar = (eventos: EventoPublicoBruto[]) =>
  montarCompromissos({ hoje: HOJE, fimDaJanela: FIM, diaReuniao: 0, horaReuniao: '09:00', localReuniaoPadrao: 'Igreja', eventos })

const datasDaSemanal = (eventos: EventoPublicoBruto[]): string[] =>
  montar(eventos)
    .filter((c) => c.tipo === 'REUNIAO')
    .map((c) => c.data)

describe('montarCompromissos', () => {
  it('sem eventos: uma reunião por domingo da janela, com horário, local e uniforme de campo', () => {
    const lista = montar([])
    expect(lista.map((c) => c.data)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
    expect(lista[0]).toEqual({ data: '2026-10-04', nome: 'Reunião', tipo: 'REUNIAO', horario: '09:00', local: 'Igreja', uniforme: 'CAMPO' })
  })

  it('a resposta valida no contrato estrito', () => {
    const lista = montar([evento('EVENTO', '2026-10-14', { uniforme: 'GALA' }), evento('ACAMPAMENTO', '2026-10-20', { fim: '2026-10-22' })])
    expect(AgendaPublicaSaida.safeParse({ clube: { nome: 'Clube' }, hoje: HOJE, compromissos: lista }).success).toBe(true)
  })

  it('descarta a Classe Bíblica', () => {
    const lista = montar([evento('CLASSE_BIBLICA', '2026-10-14')])
    expect(lista.some((c) => c.tipo === ('CLASSE_BIBLICA' as string))).toBe(false)
    expect(lista).toHaveLength(4)
  })

  it.each(['SEM_REUNIAO', 'FERIADO', 'FERIAS'] as const)('%s tira a semanal da data e aparece como aviso sem uniforme', (tipo) => {
    const eventos = [evento(tipo, '2026-10-11')]
    expect(datasDaSemanal(eventos)).toEqual(['2026-10-04', '2026-10-18', '2026-10-25'])
    expect(montar(eventos).find((c) => c.tipo === tipo)).toMatchObject({ data: '2026-10-11', uniforme: null })
  })

  it('a extra com Terá reunião substitui a semanal, com o horário e o local dela', () => {
    const extra = evento('REUNIAO_EXTRA', '2026-10-11', { horario: '14:00', local: 'Praça', uniforme: 'GALA' })
    const lista = montar([extra])
    expect(datasDaSemanal([extra])).toEqual(['2026-10-04', '2026-10-18', '2026-10-25'])
    expect(lista.filter((c) => c.data === '2026-10-11')).toEqual([
      { data: '2026-10-11', nome: extra.nome, tipo: 'REUNIAO_EXTRA', horario: '14:00', local: 'Praça', uniforme: 'GALA' },
    ])
  })

  it('a extra só com classe não substitui: a semanal fica e a extra entra como evento', () => {
    const extra = evento('REUNIAO_EXTRA', '2026-10-11', { temReuniao: false, temClasse: true, uniforme: 'CAMPO' })
    const doDia = montar([extra]).filter((c) => c.data === '2026-10-11')
    expect(doDia.map((c) => c.tipo).sort()).toEqual(['REUNIAO', 'REUNIAO_EXTRA'])
  })

  it('a extra com reunião num dia fora da semanal entra só como evento', () => {
    const lista = montar([evento('REUNIAO_EXTRA', '2026-10-14')])
    expect(lista.filter((c) => c.data === '2026-10-14').map((c) => c.tipo)).toEqual(['REUNIAO_EXTRA'])
    expect(datasDaSemanal([])).toHaveLength(4)
  })

  it('evento antigo sem uniforme devolve null; evento de vários dias leva o fim', () => {
    const lista = montar([evento('ACAMPAMENTO', '2026-10-20', { fim: '2026-10-22' })])
    expect(lista.find((c) => c.tipo === 'ACAMPAMENTO')).toMatchObject({ uniforme: null, fim: '2026-10-22' })
  })

  it('ignora evento removido', () => {
    expect(montar([evento('FERIADO', '2026-10-11', { removido: true })])).toHaveLength(4)
  })
})
