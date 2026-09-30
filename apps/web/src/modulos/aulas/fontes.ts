import type { AulaDetalhe, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { BaseAula } from './estado'

type Pacote = z.infer<typeof PacoteSaida>
type ClasseDoPacote = NonNullable<Pacote['instrutor']>['classes'][number]
type Registro = ClasseDoPacote['registrosRecentes'][number]

export function baseDoDetalhe(detalhe: z.infer<typeof AulaDetalhe>): BaseAula {
  return {
    registroAulaId: detalhe.id,
    aulaPlanejadaId: detalhe.aulaPlanejadaId,
    presencas: detalhe.presencas,
    requisitos: detalhe.requisitosDaAula,
    concluidosNaAula: detalhe.concluidosNaAula,
  }
}

/** O pacote guarda as presenças e as conclusões de cada membro: o que tem `registroAulaId` desta aula já foi concluído nela. */
export function baseDoPacote(registro: Registro, classe: ClasseDoPacote): BaseAula {
  const concluidosNaAula = classe.membros.flatMap((membro) =>
    (membro.conclusoes ?? []).filter((conclusao) => conclusao.registroAulaId === registro.id).map((conclusao) => ({ dbvId: membro.dbvId, requisitoId: conclusao.requisitoId })),
  )
  const idsDaAula = new Set(concluidosNaAula.map((par) => par.requisitoId))
  return {
    registroAulaId: registro.id,
    aulaPlanejadaId: registro.aulaPlanejadaId,
    presencas: registro.presencas,
    requisitos: classe.requisitos.filter((requisito) => idsDaAula.has(requisito.id)),
    concluidosNaAula,
  }
}
