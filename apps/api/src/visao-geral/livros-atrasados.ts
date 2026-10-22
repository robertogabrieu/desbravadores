import { situacaoDoEmprestimo, type VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Visao = z.infer<typeof VisaoGeralSaida>

const MAXIMO_DE_ITENS = 5

/**
 * Cartão "Livros atrasados": `null` quando o clube não tem livro físico (o cartão some); senão o total real
 * e os 5 mais atrasados. O atraso vem de `situacaoDoEmprestimo`, a mesma função da aba Empréstimos, então o
 * total e o selo da aba dão o mesmo número. Desbravador inativado continua na lista (D19).
 * Consultas com `clubeId` em cada nível: `include` aninhado não passa pela guarda de clube.
 */
export async function livrosAtrasados(prisma: PrismaService, clubeId: string, hoje: string): Promise<Visao['livrosAtrasados']> {
  const livrosFisicos = await prisma.itemBiblioteca.count({ where: { clubeId, tipo: 'FISICO', removidoEm: null } })
  if (livrosFisicos === 0) return null

  const vencidos = await prisma.emprestimoBiblioteca.findMany({
    where: { clubeId, devolvidoEm: null, devolverAte: { lt: daDataCivil(hoje) } },
    select: {
      id: true,
      devolverAte: true,
      exemplar: { select: { item: { select: { nome: true } } } },
      desbravador: {
        select: {
          nome: true,
          ativo: true,
          tipo: true,
          membros: { where: { clubeId, fim: null }, select: { unidade: { select: { nome: true } } } },
        },
      },
    },
  })
  const atrasados = vencidos
    .map((emprestimo) => ({ emprestimo, ...situacaoDoEmprestimo(paraDataCivil(emprestimo.devolverAte), hoje) }))
    .filter((linha) => linha.situacao === 'ATRASADO')
    .sort((a, b) => b.dias - a.dias || colador.compare(a.emprestimo.desbravador.nome, b.emprestimo.desbravador.nome) || a.emprestimo.id.localeCompare(b.emprestimo.id))

  return {
    total: atrasados.length,
    itens: atrasados.slice(0, MAXIMO_DE_ITENS).map(({ emprestimo, dias }) => ({
      emprestimoId: emprestimo.id,
      titulo: emprestimo.exemplar.item.nome,
      desbravadorNome: emprestimo.desbravador.nome,
      desbravadorAtivo: emprestimo.desbravador.ativo && emprestimo.desbravador.tipo === 'DBV',
      unidade: emprestimo.desbravador.ativo ? (emprestimo.desbravador.membros[0]?.unidade.nome ?? null) : null,
      dias,
    })),
  }
}
