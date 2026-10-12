import { z } from 'zod'
import { UniformeEvento } from '../enums'
import { GATILHOS_DE_REGRA } from '../formulas/regras-de-pontuacao'
import { DataCivil, TextoCurto, Uuid } from './comum'

export const GatilhoDeRegraSchema = z.enum(GATILHOS_DE_REGRA)

/** Pontos de uma regra fixa: inteiro de 0 a 1000. */
export const PontosDaRegra = z.number().int().min(0).max(1000)

export const RegraEntrada = z.object({ pontos: PontosDaRegra, ativo: z.boolean() })
export const RegraSaida = z.object({ gatilho: GatilhoDeRegraSchema, pontos: PontosDaRegra, ativo: z.boolean() })

/** Evento especial do ano civil corrente; `foram` é nulo enquanto a lista de presença não foi concluída. */
export const EventoDaTelaDeRegras = z.object({
  id: Uuid,
  nome: TextoCurto,
  inicio: DataCivil,
  fim: DataCivil,
  uniforme: UniformeEvento.nullable(),
  pontosParticipacao: PontosDaRegra.nullable(),
  pontosUniforme: PontosDaRegra.nullable(),
  listaConcluida: z.boolean(),
  foram: z.number().int().min(0).nullable(),
})

/** GET /ranking/regras. Sem flags de permissão: o web usa `pode(...)` da sessão. */
export const RegrasSaida = z.object({
  regras: z.array(RegraSaida),
  eventos: z.array(EventoDaTelaDeRegras),
})
