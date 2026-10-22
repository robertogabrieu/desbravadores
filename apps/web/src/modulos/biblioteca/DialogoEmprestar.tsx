import type { FunctionComponent } from 'react'
import type { ItemFisico } from '../../api/biblioteca'

interface Propriedades {
  aberto: boolean
  /** O livro a emprestar; nulo com o diálogo fechado. */
  item: ItemFisico | null
  onFechar: () => void
}

/** Provisório: o diálogo de empréstimo é do pacote P5, que substitui este arquivo mantendo a assinatura. */
export const DialogoEmprestar: FunctionComponent<Propriedades> = () => null
