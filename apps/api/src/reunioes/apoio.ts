import { hojeNoFuso } from '@desbravadores/shared'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil } from '../desbravadores/apoio'
import type { ServicoEscopo } from '../desbravadores/escopo.service'

export const MS_POR_DIA = 86_400_000
export const DIAS_DE_CORRECAO = 30
export const DIAS_DE_ENVIO_TARDIO = 7

/** ADM alcanca qualquer unidade do clube; conselheiro so as suas; o resto e 404 (SPEC Fase 1, 5.4). */
export async function exigirUnidadeNoEscopo(
  prisma: PrismaService,
  escopo: ServicoEscopo,
  sessao: SessaoLogada,
  unidadeId: string,
): Promise<{ id: string; nome: string }> {
  const alcanca =
    sessao.papel === 'ADM' ||
    (sessao.papel === 'CONSELHEIRO' && (await escopo.unidadesDoConselheiro(sessao)).includes(unidadeId))
  const unidade = alcanca
    ? await prisma.unidade.findFirst({ where: { id: unidadeId, clubeId: sessao.clubeId }, select: { id: true, nome: true } })
    : null
  if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
  return unidade
}

/** Dias corridos de `de` ate `ate`, ambas "AAAA-MM-DD". */
export function diasEntre(de: string, ate: string): number {
  return Math.round((daDataCivil(ate).getTime() - daDataCivil(de).getTime()) / MS_POR_DIA)
}

/** Correcao de chamada ja registrada: ate 30 dias depois da data, contados em `feito` (SPEC E11). */
export function dentroDoPrazoDeCorrecao(data: string, feito: Date, fuso: string): boolean {
  return diasEntre(data, hojeNoFuso(fuso, feito)) <= DIAS_DE_CORRECAO
}
