import type { SituacaoDoEmprestimo } from './datas'

/** "1 dia" / "N dias". */
export function textoDeDias(dias: number): string {
  return dias === 1 ? '1 dia' : `${dias} dias`
}

/** Pílula de disponibilidade do livro físico; `total` conta só os exemplares não baixados. */
export function textoDeDisponibilidade(total: number, disponiveis: number): string {
  if (total === 0) return 'Sem exemplares'
  if (disponiveis === 0) return 'Todos emprestados'
  if (total === 1) return '1 de 1 disponível'
  return `${disponiveis} de ${total} disponíveis`
}

export function textoDeSituacao(situacao: SituacaoDoEmprestimo, dias: number): string {
  if (situacao === 'NO_PRAZO') return 'No prazo'
  if (situacao === 'VENCE_HOJE') return 'Vence hoje'
  return `Atrasado há ${textoDeDias(dias)}`
}
