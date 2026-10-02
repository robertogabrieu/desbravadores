import { urlSemSegredo } from '@desbravadores/shared'
import { breadcrumbsIntegration, init, type BrowserOptions } from '@sentry/react'

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
    // desliga o que pode identificar ou expor um membro — usuário, cookies, cabeçalhos, corpo e variáveis
    // locais da pilha. No navegador isto não alcança o endereço da página: quem limpa é o beforeSend.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    initialScope: { tags: { app: 'web' } },
    // O clique leva o texto do botão, que pode ter nome de membro; o console, qualquer dado da tela. Nesta
    // versão do SDK as migalhas de console vêm de uma integração própria, a "Console", que sai inteira.
    integrations: (padrao) => [
      ...padrao.filter((integracao) => integracao.name !== 'Console' && integracao.name !== 'Breadcrumbs'),
      breadcrumbsIntegration({ dom: false }),
    ],
    // O SDK manda o endereço inteiro, e nele vão tokens de convite e assinaturas de arquivo.
    beforeSend(evento) {
      const pedido = evento.request
      if (pedido) {
        if (pedido.url) pedido.url = urlSemSegredo(pedido.url)
        delete pedido.query_string
        const origem = pedido.headers?.['Referer']
        if (pedido.headers && origem) pedido.headers['Referer'] = urlSemSegredo(origem)
      }
      return evento
    },
    // Navegação, fetch e xhr levam o endereço. O console já sai acima; o descarte aqui segura a migalha
    // de console que outra integração venha a criar.
    beforeBreadcrumb(migalha) {
      if (migalha.category === 'console') return null
      const dados = migalha.data
      if (dados) {
        for (const chave of ['url', 'from', 'to']) {
          const valor: unknown = dados[chave]
          if (typeof valor === 'string') dados[chave] = urlSemSegredo(valor)
        }
      }
      return migalha
    },
  }
}

export function iniciarSentry(): void {
  init(opcoesSentry(import.meta.env))
}
