import { hojeNoFuso } from '@desbravadores/shared'
import { usePacote } from '../../offline'

const FUSO_PADRAO_DO_CLUBE = 'America/Sao_Paulo'

/**
 * O "hoje" que a tela usa para escolher data e medir atraso: dia de calendário no fuso do clube, o mesmo em que a API
 * valida a data do empréstimo e conta o atraso. Sem o pacote do clube no aparelho, o fuso padrão do clube.
 */
export function useHojeDoClube(): string {
  const { pacote } = usePacote()
  return hojeNoFuso(pacote?.clube.fuso ?? FUSO_PADRAO_DO_CLUBE, new Date())
}

/** "(inativo)" ao lado do nome de quem deixou o clube com livro em aberto (o contrato não traz o gênero). */
export const nomeComSituacao = (nome: string, ativo: boolean): string => (ativo ? nome : `${nome} (inativo)`)

export const unidadeOuSem = (unidade: string | null): string => unidade ?? 'sem unidade'
