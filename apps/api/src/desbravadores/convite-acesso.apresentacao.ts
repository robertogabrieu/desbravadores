import type { ConviteAcessoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { ErroApp } from '../comum/erros'
import type { ConviteAcesso, Prisma, PrismaClient } from '../generated/prisma/client.js'
import { colador } from './apoio'

type Saida = z.infer<typeof ConviteAcessoSaida>
type Leitor = Pick<PrismaClient, 'unidade' | 'classe'>
type Relacoes = Pick<ConviteAcesso, 'clubeId' | 'unidadeIds' | 'classeIds'>

export const VALIDADE_CONVITE_ACESSO_MS = 7 * 24 * 60 * 60 * 1000

/** Convite que ainda vale: nao usado, nao cancelado e dentro da validade. */
export function conviteAberto(agora: Date) {
  return { usadoEm: null, canceladoEm: null, expiraEm: { gt: agora } } satisfies Prisma.ConviteAcessoWhereInput
}

/** Unidade ativa do clube; classe ativa, oficial ou do clube. Devolve quantas das pedidas faltam. */
export async function relacoesQueFaltam(prisma: Leitor, convite: Relacoes): Promise<number> {
  const unidades = [...new Set(convite.unidadeIds)]
  const classes = [...new Set(convite.classeIds)]
  const unidadesAchadas = unidades.length
    ? await prisma.unidade.count({ where: { clubeId: convite.clubeId, id: { in: unidades }, ativa: true } })
    : 0
  const classesAchadas = classes.length
    ? await prisma.classe.count({
        where: { id: { in: classes }, ativa: true, OR: [{ clubeId: null }, { clubeId: convite.clubeId }] },
      })
    : 0
  return unidades.length - unidadesAchadas + classes.length - classesAchadas
}

export async function exigirRelacoesDoConvite(prisma: Leitor, convite: Relacoes, erro: ErroApp): Promise<void> {
  if ((await relacoesQueFaltam(prisma, convite)) > 0) throw erro
}

/** Papel, unidades e classes do convite, como a tela mostra (o link vem de quem gerou). */
export async function apresentarConvite(
  prisma: Leitor,
  convite: Pick<ConviteAcesso, 'clubeId' | 'papel' | 'unidadeIds' | 'classeIds' | 'expiraEm'>,
  link: string | null,
): Promise<Saida> {
  if (convite.papel === 'ADM') throw new ErroApp('ERRO_INTERNO', 'Convite com papel inesperado.')
  const unidades = convite.unidadeIds.length
    ? await prisma.unidade.findMany({
        where: { clubeId: convite.clubeId, id: { in: convite.unidadeIds } },
        select: { id: true, nome: true },
      })
    : []
  const classes = convite.classeIds.length
    ? await prisma.classe.findMany({
        where: { id: { in: convite.classeIds }, OR: [{ clubeId: null }, { clubeId: convite.clubeId }] },
        select: SELECAO_REF_CLASSE,
      })
    : []
  return {
    link,
    expiraEm: convite.expiraEm.toISOString(),
    papel: convite.papel,
    unidades: unidades.sort((a, b) => colador.compare(a.nome, b.nome)),
    classes: classes.map(refClasse).sort((a, b) => colador.compare(a.nome, b.nome)),
  }
}
