export const ACESSO_PUBLICA = 'acesso:publica'
export const ACESSO_AUTENTICADO = 'acesso:autenticado'
export const ACESSO_LOGADO = 'acesso:logado'
export const ACESSO_PODE = 'acesso:pode'

const CHAVES_DE_ACESSO = [ACESSO_PUBLICA, ACESSO_AUTENTICADO, ACESSO_LOGADO, ACESSO_PODE]

/**
 * Declaracoes de acesso de uma rota: as do metodo; se ele nao tem nenhuma, as da classe.
 * Uma rota valida tem exatamente uma.
 */
export function acessosDeclarados(handler: object, controlador: object): string[] {
  const doMetodo = CHAVES_DE_ACESSO.filter((chave) => Reflect.hasMetadata(chave, handler))
  if (doMetodo.length > 0) return doMetodo
  return CHAVES_DE_ACESSO.filter((chave) => Reflect.hasMetadata(chave, controlador))
}
