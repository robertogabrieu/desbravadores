import type { DesbravadorParaEmprestimoSaida } from '@desbravadores/shared'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paraDataCivil, semAcento } from '../desbravadores/apoio'

const MAXIMO_DE_RESULTADOS = 20

/**
 * Busca do D7: desbravadores ativos do clube inteiro (sem o escopo de unidade e classe da lista de desbravadores).
 * Devolve só o que o empréstimo precisa; nenhum outro dado da ficha sai daqui.
 */
export async function buscarDesbravadoresParaEmprestimo(
  prisma: PrismaService,
  clubeId: string,
  busca: string,
): Promise<DesbravadorParaEmprestimoSaida[]> {
  const termo = semAcento(busca)
  const ativos = await prisma.desbravador.findMany({
    where: { clubeId, ativo: true, tipo: 'DBV' },
    select: {
      id: true,
      nome: true,
      entradaEm: true,
      membros: { where: { clubeId, fim: null }, select: { unidade: { select: { nome: true } } } },
    },
  })
  const achados = ativos
    .filter((desbravador) => semAcento(desbravador.nome).includes(termo))
    .sort((a, b) => colador.compare(a.nome, b.nome) || a.id.localeCompare(b.id))
    .slice(0, MAXIMO_DE_RESULTADOS)
  if (achados.length === 0) return []

  const emAberto = await prisma.emprestimoBiblioteca.findMany({
    where: { clubeId, devolvidoEm: null, desbravadorId: { in: achados.map((desbravador) => desbravador.id) } },
    select: { id: true, desbravadorId: true, exemplar: { select: { item: { select: { nome: true } } } } },
  })
  const livroDe = new Map(emAberto.map((emprestimo) => [emprestimo.desbravadorId, { emprestimoId: emprestimo.id, titulo: emprestimo.exemplar.item.nome }]))

  return achados.map((desbravador) => ({
    id: desbravador.id,
    nome: desbravador.nome,
    unidade: desbravador.membros[0]?.unidade.nome ?? null,
    entradaEm: paraDataCivil(desbravador.entradaEm),
    livroEmAberto: livroDe.get(desbravador.id) ?? null,
  }))
}
