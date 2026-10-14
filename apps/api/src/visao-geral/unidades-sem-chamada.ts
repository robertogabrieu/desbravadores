import { diasDeReuniao, type EventoDoCalendario, type VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { somarDias } from '../classe-biblica/datas'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Visao = z.infer<typeof VisaoGeralSaida>
type Unidades = NonNullable<Visao['unidadesSemChamada']>['unidades']

/** O último dia de reunião do calendário do clube estritamente antes de `hoje`, procurando no ano de hoje e no anterior. */
async function ultimaReuniao(prisma: PrismaService, clubeId: string, hoje: string, diaReuniao: number): Promise<string | null> {
  const ontem = somarDias(hoje, -1)
  const inicio = `${Number(hoje.slice(0, 4)) - 1}-01-01`
  const eventos = await prisma.eventoCalendario.findMany({
    where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(ontem) }, fim: { gte: daDataCivil(inicio) } },
    select: { nome: true, tipo: true, inicio: true, fim: true, horario: true, local: true, temReuniao: true, temClasse: true, bomParaCampo: true },
  })
  const doCalendario: EventoDoCalendario[] = eventos.map((evento) => ({ ...evento, inicio: paraDataCivil(evento.inicio), fim: paraDataCivil(evento.fim) }))
  return diasDeReuniao(inicio, ontem, diaReuniao, doCalendario).at(-1) ?? null
}

/**
 * Das unidades ativas recebidas (já com conselheiros), as que não têm nenhuma linha de `Chamada` na reunião da última
 * data de reunião. Unidade sem desbravador ativo naquela data não conta. Sem dia de reunião nos dois anos: `null`.
 */
export async function unidadesSemChamada(
  prisma: PrismaService,
  clubeId: string,
  hoje: string,
  diaReuniao: number,
  unidades: Unidades,
): Promise<Visao['unidadesSemChamada']> {
  const reuniao = await ultimaReuniao(prisma, clubeId, hoje, diaReuniao)
  if (reuniao === null) return null
  const data = daDataCivil(reuniao)
  const unidadeIds = unidades.map((unidade) => unidade.id)

  const [comChamada, comMembro] = await Promise.all([
    prisma.chamada.findMany({
      where: { clubeId, reuniao: { clubeId, data, unidadeId: { in: unidadeIds } } },
      select: { reuniao: { select: { unidadeId: true } } },
      distinct: ['reuniaoId'],
    }),
    prisma.membroUnidade.findMany({
      where: {
        clubeId,
        unidadeId: { in: unidadeIds },
        inicio: { lte: data },
        OR: [{ fim: null }, { fim: { gt: data } }],
        dbv: { tipo: 'DBV', ativo: true },
      },
      select: { unidadeId: true },
      distinct: ['unidadeId'],
    }),
  ])
  const lancaram = new Set(comChamada.map((linha) => linha.reuniao.unidadeId))
  const comDesbravador = new Set(comMembro.map((membro) => membro.unidadeId))
  return { reuniao, unidades: unidades.filter((unidade) => comDesbravador.has(unidade.id) && !lancaram.has(unidade.id)) }
}
