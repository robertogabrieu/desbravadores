import { z } from 'zod'
import { RefClasse } from './auth'
import { Horario, TipoEvento } from '../enums'
import { DataCivil, InstanteIso, Uuid } from './comum'

export const AtividadeSaida = z.object({ id: Uuid, descricao: z.string(), link: z.string().nullable(), criadaEm: InstanteIso, autor: z.string().nullable() })
export const VisaoGeralSaida = z.object({
  dbvsAtivos: z.number().int(),
  variacaoTrimestre: z.number().int(),        // ativos hoje − ativos há 3 meses
  unidades: z.number().int(),
  instrutores: z.number().int(),
  classesCobertas: z.number().int(),           // classes ativas com pelo menos um instrutor
  frequenciaMes: z.number().int().nullable(),
  variacaoFrequencia: z.number().int().nullable(), // pontos percentuais vs mês anterior
  especialidadesAno: z.number().int(),
  especialidadesPorDbv: z.number(),
  progressoClasses: z.array(z.object({ classe: RefClasse, media: z.number().int().nullable(), totalDbvs: z.number().int(), instrutores: z.array(z.string()) })),
  unidadesResumo: z.array(z.object({ id: Uuid, nome: z.string(), conselheiros: z.array(z.string()), totalDbvs: z.number().int(), frequenciaMes: z.number().int().nullable() })),
  cronogramasEnviados: z.array(z.object({ cronogramaId: Uuid, classe: RefClasse, enviadoPor: z.string(), enviadoEm: InstanteIso })),
  atividades: z.array(AtividadeSaida).max(10),
  /** Eventos especiais que terminaram há até 60 dias, valem pontos e ainda não têm a lista concluída (`pendenciaDeLista`). */
  eventosSemLista: z.array(z.object({ eventoId: Uuid, nome: z.string(), inicio: DataCivil, fim: DataCivil })).default([]),
  /** Classes sem nenhum cronograma no ano do clube; a avançada pareada vem junto da regular, uma linha só. */
  classesSemCronograma: z.array(z.object({ classe: RefClasse, idade: z.number().int().nullable() })).default([]),
  /** Unidades ativas sem chamada na última reunião (estritamente antes de hoje); nulo quando o calendário não tem dia de reunião. */
  unidadesSemChamada: z.object({
    reuniao: DataCivil,
    unidades: z.array(z.object({ id: Uuid, nome: z.string(), conselheiros: z.array(z.string()) })),
  }).nullable().default(null),
  /** Primeiro evento com `fim >= hoje`, sem cancelado e sem Classe Bíblica; nulo quando não há nenhum à frente. */
  proximoEvento: z.object({
    id: Uuid, nome: z.string(), tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
    horario: Horario.nullable(), local: z.string().nullable(),
  }).nullable().default(null),
  /** Pares (encontro, grupo) sem chamada nos últimos 7 dias, o encontro mais recente primeiro. */
  chamadasClasseBiblica: z.array(z.object({
    encontroId: Uuid, data: DataCivil, grupoId: Uuid, grupoNome: z.string(),
  })).default([]),
})
// GET /visao-geral → VisaoGeralSaida
