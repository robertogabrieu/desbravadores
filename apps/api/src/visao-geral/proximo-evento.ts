import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Visao = z.infer<typeof VisaoGeralSaida>

/** Mesmos tipos que o cartão do instrutor mostra; Classe Bíblica, reunião extra, feriado e férias ficam fora. */
const TIPOS_DO_CARTAO = ['EVENTO_ESPECIAL', 'ACAMPAMENTO', 'EVENTO'] as const

/** O primeiro evento com `fim >= hoje`, por intervalo de datas (a virada do ano não importa); removido é como cancelado. */
export async function proximoEvento(prisma: PrismaService, clubeId: string, hoje: string): Promise<Visao['proximoEvento']> {
  const evento = await prisma.eventoCalendario.findFirst({
    where: { clubeId, removidoEm: null, tipo: { in: [...TIPOS_DO_CARTAO] }, fim: { gte: daDataCivil(hoje) } },
    select: { id: true, nome: true, tipo: true, inicio: true, fim: true, horario: true, local: true },
    orderBy: [{ inicio: 'asc' }, { fim: 'asc' }, { id: 'asc' }],
  })
  if (!evento) return null
  return { ...evento, inicio: paraDataCivil(evento.inicio), fim: paraDataCivil(evento.fim) }
}
