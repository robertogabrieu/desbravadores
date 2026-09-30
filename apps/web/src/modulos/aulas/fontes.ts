import type { AulaDetalhe, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { BaseAula } from './estado'

type Pacote = z.infer<typeof PacoteSaida>
type Registro = NonNullable<Pacote['instrutor']>['classes'][number]['registrosRecentes'][number]

export function baseDoDetalhe(detalhe: z.infer<typeof AulaDetalhe>): BaseAula {
  return {
    registroAulaId: detalhe.id,
    aulaPlanejadaId: detalhe.aulaPlanejadaId,
    presencas: detalhe.presencas,
    requisitos: detalhe.requisitosDaAula,
    concluidosNaAula: detalhe.concluidosNaAula,
  }
}

/** O pacote guarda só as presenças: não sabe os requisitos da aula nem o que já foi concluído nela. */
export function baseDoPacote(registro: Registro): BaseAula {
  return { registroAulaId: registro.id, aulaPlanejadaId: registro.aulaPlanejadaId, presencas: registro.presencas, requisitos: null, concluidosNaAula: [] }
}
