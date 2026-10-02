import type { NodeOptions } from '@sentry/nestjs'

// O DSN só diz para onde mandar o erro, não dá acesso a nada: é público por desenho. O site usa o mesmo.
const DSN = 'https://54a26ae2d355986a7d250e0f2e3a80af@o4512184671272960.ingest.us.sentry.io/4512184737136640'

/**
 * Só erros, só em produção: desenvolvimento e testes não gastam a cota. Sem dado pessoal (os membros
 * do clube são menores) e sem medição de desempenho. A tag `app` separa a API do site no mesmo projeto.
 */
export function opcoesSentry(env: NodeJS.ProcessEnv): NodeOptions {
  return {
    dsn: DSN,
    enabled: env['NODE_ENV'] === 'production',
    environment: 'production',
    release: env['VERSAO_APP'] || undefined,
    // Esta versão do SDK coleta tudo por padrão (o antigo `sendDefaultPii: false` não existe mais): aqui se
    // desliga cada dado que pode identificar ou expor um membro — usuário, cookies, cabeçalhos, corpo,
    // parâmetros da URL, dados de consulta ao banco e variáveis locais da pilha.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    initialScope: { tags: { app: 'api' } },
  }
}
