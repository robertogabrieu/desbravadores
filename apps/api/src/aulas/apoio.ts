import type { RequisitoResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import type { PrismaService } from '../comum/prisma/prisma.service'
import type { ServicoEscopo } from '../desbravadores/escopo.service'
import type { Prisma } from '../generated/prisma/client.js'

type Resumo = z.infer<typeof RequisitoResumo>

const CLASSE_NAO_ENCONTRADA = 'Classe não encontrada.'

/** Instrutor so alcanca as classes do vinculo; Adm, qualquer classe oficial ou do proprio clube; o resto e 404. */
export async function exigirClasseNoEscopo(
  prisma: PrismaService,
  escopo: ServicoEscopo,
  sessao: SessaoLogada,
  classeId: string,
): Promise<{ id: string; nome: string }> {
  if (sessao.papel === 'INSTRUTOR' && !(await escopo.classesDoInstrutor(sessao)).includes(classeId)) {
    throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
  }
  const classe = await prisma.classe.findFirst({
    where: { id: classeId, OR: [{ clubeId: null }, { clubeId: sessao.clubeId }] },
    select: { id: true, nome: true },
  })
  if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
  return classe
}

/** Primeiro e ultimo dia do ano do clube, a partir do "MM-DD" em que ele comeca. */
export function intervaloDoAnoClube(anoClube: number, inicioAnoClube: string): { inicio: string; fim: string } {
  const ultimoDia = new Date(`${anoClube + 1}-${inicioAnoClube}T00:00:00Z`)
  ultimoDia.setUTCDate(ultimoDia.getUTCDate() - 1)
  return { inicio: `${anoClube}-${inicioAnoClube}`, fim: ultimoDia.toISOString().slice(0, 10) }
}

/**
 * Requisitos na ordem do caderno, com `campo` (e, se pedido, o filtro de ativos) ja ajustados pelo clube.
 * `RequisitoAjuste` e do clube: sempre lido com o `clubeId`.
 */
export async function resumosDeRequisitos(
  prisma: PrismaService,
  clubeId: string,
  onde: Prisma.RequisitoWhereInput,
  apenasAtivos: boolean,
): Promise<Resumo[]> {
  const requisitos = await prisma.requisito.findMany({
    where: onde,
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }, { id: 'asc' }],
    select: { id: true, codigo: true, texto: true, campo: true, ativo: true, secao: { select: { codigo: true } } },
  })
  const ajustes = await prisma.requisitoAjuste.findMany({
    where: { clubeId, requisitoId: { in: requisitos.map((requisito) => requisito.id) } },
    select: { requisitoId: true, ativo: true, campo: true },
  })
  const ajustePorId = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste]))
  return requisitos
    .filter((requisito) => !apenasAtivos || (ajustePorId.get(requisito.id)?.ativo ?? requisito.ativo))
    .map((requisito) => ({
      id: requisito.id,
      codigo: requisito.codigo,
      texto: requisito.texto,
      campo: ajustePorId.get(requisito.id)?.campo ?? requisito.campo,
      secaoCodigo: requisito.secao.codigo,
    }))
}
