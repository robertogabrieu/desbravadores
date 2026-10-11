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
    atual.tipo === 'AVANCADA' ? atual : classes.find((classe) => classe.ativa && classe.tipo === 'AVANCADA' && classe.classeBaseId === atual.id)
  return regular && avancada ? { regular, avancada } : null
}

/** O id da regular de uma classe: a própria, ou a base quando é uma avançada (`?classe=` com a avançada leva à regular). */
export function regularDaClasse(classes: Classe[], classeId: string | undefined): string | undefined {
  const atual = classes.find((classe) => classe.id === classeId)
  return atual?.tipo === 'AVANCADA' && atual.classeBaseId ? atual.classeBaseId : classeId
}

/** "Amigo + Amigo da Natureza" quando a regular tem avançada ativa; senão só o nome. */
export function nomeDoPar(classes: Classe[], regular: Classe): string {
  const par = parDaClasse(classes, regular.id)
  return par ? `${par.regular.nome} + ${par.avancada.nome}` : regular.nome
}
