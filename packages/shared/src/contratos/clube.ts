import { z } from 'zod'
import { Horario } from '../enums'

export const ConfiguracaoClubeEntrada = z.object({
  diaReuniao: z.number().int().min(0).max(6),
  horaReuniao: Horario,
  localReuniaoPadrao: z.string().trim().max(120).nullable(),
  limiarFrequenciaAlerta: z.number().int().min(0).max(100),
  limiarProgressoAlerta: z.number().int().min(0).max(100),
  metaFrequencia: z.number().int().min(0).max(100),
}).partial()
export const ConfiguracaoClubeSaida = z.object({
  diaReuniao: z.number().int(), horaReuniao: Horario, localReuniaoPadrao: z.string().nullable(),
  limiarFrequenciaAlerta: z.number().int(), limiarProgressoAlerta: z.number().int(), metaFrequencia: z.number().int(),
  fuso: z.string(), inicioAnoClube: z.string(),
})
// GET /clube/configuracao → ConfiguracaoClubeSaida · PATCH → ConfiguracaoClubeSaida
