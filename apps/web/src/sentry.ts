import { init, type BrowserOptions } from '@sentry/react'

// O DSN só diz para onde mandar o erro, não dá acesso a nada: é público por desenho. A API usa o mesmo.
const DSN = 'https://54a26ae2d355986a7d250e0f2e3a80af@o4512184671272960.ingest.us.sentry.io/4512184737136640'

/**
 * Só erros, só no build de produção: desenvolvimento e testes não gastam a cota. Sem dado pessoal (os
 * membros do clube são menores), sem gravação de sessão e sem medição de desempenho. A tag `app`
 * separa o site da API no mesmo projeto. A versão (commit) quem injeta é o plugin do build.
 */
export function opcoesSentry(env: Pick<ImportMetaEnv, 'PROD' | 'MODE'>): BrowserOptions {
  return {
    dsn: DSN,
    enabled: env.PROD,
    environment: env.MODE,
    // Esta versão do SDK coleta tudo por padrão (o antigo `sendDefaultPii: false` não existe mais): aqui se
    // desliga cada dado que pode identificar ou expor um membro — usuário, cookies, cabeçalhos, corpo,
    // parâmetros da URL e variáveis locais da pilha.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    initialScope: { tags: { app: 'web' } },
  }
}

export function iniciarSentry(): void {
  init(opcoesSentry(import.meta.env))
}
