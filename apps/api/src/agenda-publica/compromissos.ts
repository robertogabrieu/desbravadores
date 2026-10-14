import {
  diasDeReuniao,
  situacaoDaData,
  type AgendaPublicaSaida,
  type EventoDoCalendario,
} from '@desbravadores/shared'

type Compromisso = AgendaPublicaSaida['compromissos'][number]

/** O evento do calendário como o banco entrega, com as datas já em AAAA-MM-DD. */
export type EventoPublicoBruto = EventoDoCalendario & { uniforme: Compromisso['uniforme'] }

export interface EntradaDosCompromissos {
  hoje: string
  fimDaJanela: string
  diaReuniao: number
  horaReuniao: string
  localReuniaoPadrao: string | null
  /** Só os eventos não removidos que tocam a janela. */
  eventos: readonly EventoPublicoBruto[]
}

function ordemCronologica(a: Compromisso, b: Compromisso): number {
  return a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome)
}

/**
 * Os compromissos da página dos pais: os eventos do calendário (sem o encontro da Classe Bíblica) e a
 * reunião semanal de cada data com reunião. A Reunião extra com "Terá reunião" substitui a linha semanal
 * da data; a extra só com classe não substitui.
 */
export function montarCompromissos(entrada: EntradaDosCompromissos): Compromisso[] {
  const { hoje, fimDaJanela, diaReuniao, horaReuniao, localReuniaoPadrao } = entrada
  const eventos = entrada.eventos.filter((evento) => !evento.removido && evento.tipo !== 'CLASSE_BIBLICA')

  const doCalendario = eventos.map(
    (evento): Compromisso => ({
      data: evento.inicio,
      ...(evento.fim > evento.inicio ? { fim: evento.fim } : {}),
      nome: evento.nome,
      tipo: evento.tipo,
      horario: evento.horario,
      local: evento.local,
      uniforme: evento.uniforme,
    }),
  )

  const semanais = diasDeReuniao(hoje, fimDaJanela, diaReuniao, eventos)
    .filter((data) => !situacaoDaData(data, diaReuniao, eventos).extra?.temReuniao)
    .map(
      (data): Compromisso => ({
        data,
        nome: 'Reunião',
        tipo: 'REUNIAO',
        horario: horaReuniao,
        local: localReuniaoPadrao,
        uniforme: 'CAMPO',
      }),
    )

  return [...doCalendario, ...semanais].sort(ordemCronologica)
}
