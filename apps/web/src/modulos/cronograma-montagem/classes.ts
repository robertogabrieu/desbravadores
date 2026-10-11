import type { Classe } from '../../api/leitura'

export interface ParDeClasses {
  regular: Classe
  avancada: Classe
}

/**
 * A classe regular e a avançada dela, quando as duas existem; a avançada aponta para a regular por `classeBaseId`.
 * O par só existe com as duas ativas; a lista de Classes passa `incluirInativa` para enxergar também a desativada.
 */
export function parDaClasse(classes: Classe[], classeId: string | undefined, incluirInativa = false): ParDeClasses | null {
  const atual = classes.find((classe) => classe.id === classeId)
  if (!atual) return null
  const regular = atual.tipo === 'REGULAR' ? atual : classes.find((classe) => classe.id === atual.classeBaseId)
  const avancada =
    atual.tipo === 'AVANCADA' ? atual : classes.find((classe) => (incluirInativa || classe.ativa) && classe.tipo === 'AVANCADA' && classe.classeBaseId === atual.id)
  if (!regular || !avancada) return null
  return incluirInativa || regular.ativa ? { regular, avancada } : null
}

/**
 * A classe que a montagem abre para o id pedido: a própria, ou a regular quando é uma avançada que anda em par com ela
 * (`?classe=` com a avançada leva à regular). Avançada sem par — regular inativa — vale sozinha.
 */
export function regularDaClasse(classes: Classe[], classeId: string | undefined): string | undefined {
  const par = parDaClasse(classes, classeId)
  return par && par.avancada.id === classeId ? par.regular.id : classeId
}

/** "Amigo + Amigo da Natureza" quando a regular tem avançada ativa; senão só o nome. */
export function nomeDoPar(classes: Classe[], regular: Classe): string {
  const par = parDaClasse(classes, regular.id)
  return par ? `${par.regular.nome} + ${par.avancada.nome}` : regular.nome
}
