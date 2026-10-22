import { DesbravadorParaEmprestimoSaida, EmprestimoSaida, EmprestimosSaida, ItemFisicoSaida, LivroFisicoDetalheSaida } from '@desbravadores/shared'
import type { AcrescentarExemplares, EmprestimoEntrada, EmprestimosFiltro } from '@desbravadores/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

export type DetalheDoLivro = LivroFisicoDetalheSaida
export type Emprestimos = EmprestimosSaida
export type LinhaDeEmprestimo = EmprestimosSaida['itens'][number]
export type DesbravadorParaEmprestimo = DesbravadorParaEmprestimoSaida

/**
 * Mesma raiz da estante: uma escrita de empréstimo relê a estante, o detalhe, a aba e o selo de uma vez.
 * Como a estante, nenhuma consulta daqui fica em memória depois que a tela sai (`gcTime: 0`): têm nome de gente.
 */
const RAIZ = 'biblioteca'

export const MINIMO_DE_LETRAS_DA_BUSCA = 2

const DesbravadoresParaEmprestimo = z.array(DesbravadorParaEmprestimoSaida)
/** As escritas de exemplar devolvem o item com os totais novos (ou o detalhe); a tela relê o detalhe de qualquer jeito. */
const RespostaDeExemplar = LivroFisicoDetalheSaida.or(ItemFisicoSaida)

/** GET /biblioteca/itens/:id/exemplares: exige `biblioteca.emprestar`; sem ela a tela nem pergunta. */
export function useDetalheDoLivro(itemId: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: [RAIZ, 'exemplares', itemId],
    queryFn: () => requisitar(`/api/biblioteca/itens/${itemId}/exemplares`, LivroFisicoDetalheSaida),
    enabled: habilitada && itemId !== undefined,
    gcTime: 0,
  })
}

/** GET /biblioteca/emprestimos?situacao=&busca=: só do Adm. Sem filtro é a consulta que alimenta o selo da aba. */
export function useEmprestimos(filtro: EmprestimosFiltro = {}, habilitada = true) {
  const situacao = filtro.situacao ?? 'todas'
  const busca = filtro.busca?.trim() ?? ''
  return useQuery({
    queryKey: [RAIZ, 'emprestimos', situacao, busca],
    queryFn: () => requisitar(`/api/biblioteca/emprestimos${montarConsulta({ situacao, busca: busca === '' ? undefined : busca })}`, EmprestimosSaida),
    enabled: habilitada,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
}

/** GET /biblioteca/desbravadores?busca=: do clube inteiro; só consulta com 2 letras ou mais. */
export function useBuscaDeDesbravadores(busca: string) {
  const limpa = busca.trim()
  return useQuery({
    queryKey: [RAIZ, 'desbravadores', limpa],
    queryFn: () => requisitar(`/api/biblioteca/desbravadores${montarConsulta({ busca: limpa })}`, DesbravadoresParaEmprestimo),
    enabled: limpa.length >= MINIMO_DE_LETRAS_DA_BUSCA,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
}

/** Escrita que sempre relê o que a tela mostra, dê certo ou não: uma recusa por "acabou de ser emprestado" mostra o estado de agora. */
function useEscritaDeEmprestimo<Variaveis, Resultado>(escrever: (variaveis: Variaveis) => Promise<Resultado>) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: escrever,
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** POST /biblioteca/emprestimos: o corpo não tem campo de devolução, o servidor soma o prazo fixo. */
export const useEmprestar = () =>
  useEscritaDeEmprestimo((entrada: EmprestimoEntrada) => requisitar('/api/biblioteca/emprestimos', EmprestimoSaida, { metodo: 'POST', corpo: entrada }))

/** POST /biblioteca/emprestimos/:id/devolucao: a data é o "hoje" do servidor, por isso o corpo vai vazio. */
export const useDevolver = () =>
  useEscritaDeEmprestimo((emprestimoId: string) => requisitar(`/api/biblioteca/emprestimos/${emprestimoId}/devolucao`, EmprestimoSaida, { metodo: 'POST', corpo: {} }))

export const useAcrescentarExemplares = () =>
  useEscritaDeEmprestimo(({ itemId, quantidade }: AcrescentarExemplares & { itemId: string }) =>
    requisitar(`/api/biblioteca/itens/${itemId}/exemplares`, RespostaDeExemplar, { metodo: 'POST', corpo: { quantidade } }),
  )

export const useDarBaixa = () =>
  useEscritaDeEmprestimo(({ itemId, exemplarId }: { itemId: string; exemplarId: string }) =>
    requisitar(`/api/biblioteca/itens/${itemId}/exemplares/${exemplarId}/baixa`, RespostaDeExemplar, { metodo: 'POST', corpo: {} }),
  )
