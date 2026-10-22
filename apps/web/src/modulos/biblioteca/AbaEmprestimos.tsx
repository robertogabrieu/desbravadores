import type { SituacaoDosEmprestimos } from '@desbravadores/shared'
import type { FunctionComponent } from 'react'

interface Propriedades {
  /** Situação com que a aba abre (vem de `?situacao=` no endereço); sem ela, todas. */
  filtroInicial?: SituacaoDosEmprestimos
}

/** Provisória: a aba Empréstimos é do pacote P5, que substitui este arquivo mantendo a assinatura. */
export const AbaEmprestimos: FunctionComponent<Propriedades> = () => null
