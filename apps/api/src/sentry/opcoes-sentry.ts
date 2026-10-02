import { urlSemSegredo } from '@desbravadores/shared'
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
    // dados de consulta ao banco e variáveis locais da pilha. O endereço quem limpa é o beforeSend.
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
    // O token de convite e de primeiro acesso viaja no caminho (/api/acesso/:token), e a assinatura de
    // arquivo, na query: nenhum dos dois pode chegar ao Sentry.
    beforeSend(evento) {
      if (evento.request?.url) evento.request.url = urlSemSegredo(evento.request.url)
      if (evento.request) delete evento.request.query_string
      if (evento.transaction) evento.transaction = urlSemSegredo(evento.transaction)
      return evento
    },
  }
}
