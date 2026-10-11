import { nomeDoPar } from '@desbravadores/shared'
import type { Classe } from '../../api/leitura'

export interface ParDeClasses {
  regular: Classe
  avancada: Classe
}

/**
 * A regular e a avançada que andam juntas. Quem diz quem é o par é a API (`avancadaPareadaId` na regular,
 * `regularDoParId` na avançada), que já considera classe ativa no sistema e no clube e a avançada de menor ordem.
 */
export function parDaClasse(classes: Classe[], classeId: string | undefined): ParDeClasses | null {
  const atual = classes.find((classe) => classe.id === classeId)
  if (!atual) return null
  const regularId = atual.tipo === 'REGULAR' ? atual.id : atual.regularDoParId
  const avancadaId = atual.tipo === 'REGULAR' ? atual.avancadaPareadaId : atual.id
  const regular = classes.find((classe) => classe.id === regularId)
  const avancada = classes.find((classe) => classe.id === avancadaId)
  return regular && avancada ? { regular, avancada } : null
}

/**
 * A classe que a montagem abre para o id pedido: a própria, ou a regular quando é uma avançada que anda em par com ela
 * (`?classe=` com a avançada leva à regular). Avançada sem par — regular inativa — vale sozinha.
 */
export function regularDaClasse(classes: Classe[], classeId: string | undefined): string | undefined {
  const par = parDaClasse(classes, classeId)
  return par && par.avancada.id === classeId ? par.regular.id : classeId
}

/** O nome do par da regular, procurando a avançada pareada na lista de classes. */
export function nomeDoParDe(classes: Classe[], regular: Classe): string {
  return nomeDoPar(regular.nome, parDaClasse(classes, regular.id)?.avancada.nome)
}
