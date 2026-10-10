// Depois destes segmentos o caminho leva um token: convite, primeiro acesso, troca de senha, link de substituição.
const SEGMENTOS_ANTES_DO_TOKEN = new Set(['convite', 'acesso', 'redefinir', 'convite-acesso', 'substituto', 'substituicao'])

/**
 * Endereço que pode ir ao Sentry: sem query nem #hash (a assinatura de /api/arquivos/ vai na query) e
 * com o token do caminho trocado por `:token`. Aceita URL inteira, caminho ou "MÉTODO /caminho".
 */
export function urlSemSegredo(url: string): string {
  const semQuery = url.split(/[?#]/, 1)[0] ?? ''
  const partes = semQuery.split('/')
  return partes
    .map((parte, i) => (parte !== '' && SEGMENTOS_ANTES_DO_TOKEN.has(partes[i - 1] ?? '') ? ':token' : parte))
    .join('/')
}
