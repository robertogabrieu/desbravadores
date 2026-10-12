import { z } from 'zod'
import { Horario, TipoEvento, UniformeEvento } from '../enums'
import { RefClasse } from './auth'
import { DataCivil, InstanteIso, TextoCurto, Uuid } from './comum'

/** Pontos de um evento especial: inteiro de 0 a 1000 (zero é um valor válido). */
export const PontosDeEvento = z.number().int().min(0).max(1000)

/** As datas e as regras de cada tipo são conferidas por `validarEvento`, depois do padrão do tipo. */
export const EventoEntrada = z.object({
  nome: TextoCurto,
  tipo: TipoEvento,
  inicio: DataCivil,
  fim: DataCivil,
  horario: Horario.nullable(),
  local: z.string().trim().max(120).nullable(),
  temReuniao: z.boolean(),
  temClasse: z.boolean(),
  bomParaCampo: z.boolean(),
  /** Só no EVENTO_ESPECIAL (obrigatório nele, conferido por `validarEvento`); nulo nos outros tipos. */
  uniforme: UniformeEvento.nullable().optional(),
  pontosParticipacao: PontosDeEvento.nullable().optional(),
  pontosUniforme: PontosDeEvento.nullable().optional(),
})
/** Resumo da lista de presença do evento especial: só o Adm o recebe e o pacote offline o omite. */
export const ResumoDaLista = z.object({
  concluidaEm: InstanteIso.nullable(),
  foram: z.number().int(),
  uniformizados: z.number().int(),
})
export const EventoSaida = z.object({
  id: Uuid, nome: z.string(), tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
  horario: Horario.nullable(), local: z.string().nullable(),
  temReuniao: z.boolean(), temClasse: z.boolean(), bomParaCampo: z.boolean(),
  /** Só em evento CLASSE_BIBLICA: o calendário leva à edição em vez de editar. */
  classeBiblica: z.object({
    edicaoId: Uuid, grupos: z.array(z.string()), cancelado: z.boolean(), motivo: z.string().nullable(),
  }).nullable().optional(),
  /** Os pontos e o uniforme qualquer pessoa logada vê (o clube divulga o regulamento). */
  uniforme: UniformeEvento.nullable().optional(),
  pontosParticipacao: PontosDeEvento.nullable().optional(),
  pontosUniforme: PontosDeEvento.nullable().optional(),
  /** Só em evento especial e só para sessão Adm: fora do pacote (`EventoDoPacote`), senão cada toque na lista muda a versão dele. */
  lista: ResumoDaLista.nullable().optional(),
})
export const CalendarioFiltro = z.object({ ano: z.coerce.number().int().min(2000).max(2100) })
export const CalendarioSaida = z.object({
  eventos: z.array(EventoSaida),          // que tocam o ano, ordem por início
  diasDeReuniao: z.array(DataCivil),      // implícitos no ano, já sem os cancelados
})
export const AulaAfetada = z.object({ aulaId: Uuid, cronogramaId: Uuid, classe: RefClasse, data: DataCivil })
/** Resposta de POST /calendario/eventos e PATCH /calendario/eventos/:id. */
export const EventoGravadoSaida = z.object({ evento: EventoSaida, aulasAfetadas: z.array(AulaAfetada) })
// DELETE /calendario/eventos/:id → 204
