import type { Classe } from '../../api/leitura'

export interface ParDeClasses {
  regular: Classe
  avancada: Classe
}

/** A classe regular e a avançada dela, quando as duas existem; a avançada aponta para a regular por `classeBaseId`. */
export function parDaClasse(classes: Classe[], classeId: string | undefined): ParDeClasses | null {
  const atual = classes.find((classe) => classe.id === classeId)
  if (!atual) return null
  const regular = atual.tipo === 'REGULAR' ? atual : classes.find((classe) => classe.id === atual.classeBaseId)
  const avancada =
    atual.tipo === 'AVANCADA' ? atual : classes.find((classe) => classe.tipo === 'AVANCADA' && classe.classeBaseId === atual.id)
  return regular && avancada ? { regular, avancada } : null
}
