import type { ClasseDoAvatar } from '../../ui/Avatar'

const CLASSES: readonly ClasseDoAvatar[] = ['amigo', 'companheiro', 'pesquisador', 'pioneiro', 'excursionista', 'guia']

/** `corToken` vem da API como `--classe-amigo`; classe fora da lista cai na cor da marca. */
export function classeDoAvatar(corToken: string | undefined): ClasseDoAvatar | undefined {
  const nome = corToken?.replace('--classe-', '')
  return CLASSES.find((classe) => classe === nome)
}
