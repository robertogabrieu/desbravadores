import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import type { PrismaService } from '../comum/prisma/prisma.service'

const SEM_PERMISSAO = 'Você não tem permissão para fazer isso.'

/**
 * Observações e materiais são do instrutor e do Adm: conselheiro recebe 403; instrutor só entra
 * nas classes do seu vínculo e a classe de fora responde 404, como a que não existe.
 */
export async function exigirClasseDoEscopo(prisma: PrismaService, sessao: SessaoLogada, classeId: string): Promise<void> {
  if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', SEM_PERMISSAO)
  const classe = await prisma.classe.findFirst({
    where: { id: classeId, OR: [{ clubeId: null }, { clubeId: sessao.clubeId }] },
    select: { id: true },
  })
  if (!classe) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
  if (sessao.papel === 'INSTRUTOR') {
    const vinculo = await prisma.vinculoClasse.findUnique({
      where: { vinculoId_classeId: { vinculoId: sessao.vinculoId, classeId } },
      select: { classeId: true },
    })
    if (!vinculo) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
  }
}
