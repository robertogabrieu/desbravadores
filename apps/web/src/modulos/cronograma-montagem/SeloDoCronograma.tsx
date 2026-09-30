import type { CronogramaDaMontagem } from '../../api/montagem'
import { Selo } from '../../ui/Selo'
import type { TomDoSelo } from '../../ui/Selo'

const SELOS: Record<CronogramaDaMontagem['status'], { rotulo: string; tom: TomDoSelo }> = {
  RASCUNHO: { rotulo: 'Rascunho', tom: 'alerta' },
  ENVIADO: { rotulo: 'Enviado', tom: 'neutro' },
  PUBLICADO: { rotulo: 'Publicado', tom: 'sucesso' },
}

export function SeloDoCronograma({ status }: { status: CronogramaDaMontagem['status'] }) {
  const { rotulo, tom } = SELOS[status]
  return <Selo tom={tom}>{rotulo}</Selo>
}
