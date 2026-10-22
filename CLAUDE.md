# Aplicativo do Desbravador — instruções para agentes

Só o que morde em silêncio: o que nenhum lint pega e nenhum erro denuncia antes da produção.
Planejamento em `docs/planejamento/`; decisões de cada fase em `docs/fases/<fase>/SPEC.md`.

- **Zero `any`.** Tipo específico, `unknown` com type guard, ou generic.
- **Contratos só em `packages/shared`.** Nunca redeclare na API ou no front um formato que já
  existe lá.
- **Toda operação de modelo de clube leva `clubeId`.** A guarda de clube lança, não preenche.
  `include` aninhado **não** passa pela guarda: o isolamento dele depende dos testes.
- **Toda rota declara `@Publica`, `@Autenticado`, `@Logado` ou `@Pode`.** Recurso fora do escopo
  ou de outro clube responde 404, nunca 403.
- **JWT com `tipo` nunca vale como sessão:** a credencial de substituição só passa em rota com
  `@PodeOuSubstituto`/`@LogadoOuSubstituto`.
- **`PrismaSistema` (client sem a guarda) só em `sessao/`, `auth/`, `scripts/` e `tarefas/`.**
  Em `tarefas/` só para listar os clubes; o resto roda pelo client com guarda, clube a clube.
- **Classes, requisitos e especialidades oficiais não têm `clubeId`.** O que o clube escolhe
  sobre eles vai em `ClasseClube` e `RequisitoAjuste`.
- **Ids vêm do Prisma Client** (UUID v7): nada de INSERT em SQL cru.
- **Nunca apague linha com histórico**: desative.
- **Usuário é global**: o Adm de um clube não edita e-mail nem senha de ninguém.
- **Testes de integração criam banco próprio** por execução; nunca `TRUNCATE`.
- **O Jest da API não checa tipos** (`apps/api/tsconfig.jest.json`, com `isolatedModules`): teste
  verde não prova tipo certo. A checagem é `npm run tipos`. Não devolva a checagem ao Jest — ela
  deixava a suíte em 20 minutos em vez de 7.
- **e2e (Playwright) não roda na máquina local**: só no CI do GitHub ou contra produção.
- **Do design não se copia CSS inline**: copia-se estrutura e texto; o estilo sai dos tokens.
- **A carga oficial não roda no deploy automático**: é comando próprio (`scripts/carga.sh`).
- **`LancamentoPontos` só por `ServicoPontos.sincronizar`.** Nenhum outro lugar escreve pontos.
- **Modelo novo de clube entra em `MODELOS_DE_CLUBE` na mesma migration** que o cria.
- **Imagem só por URL assinada**; caminho de arquivo sempre montado pelo servidor, nunca vindo do
  cliente.
- **Conflito de chamada é por `versao`**, nunca pelo relógio do aparelho.
- **Tela de celular trata quatro estados**: carregando, vazio, erro e sem conexão.
- **Modo de conexão só por `useConexao`**, nunca `navigator.onLine` sozinho.
- **Upload novo acima do limite padrão do nginx** exige um `location` próprio em
  `apps/web/nginx.conf` com `client_max_body_size` e aviso de deploy para o nginx do host
  (fora do repo): sem isso o envio morre em 413 só em produção.

## Ambiente local por agente (Docker)

Cada agente sobe a **própria** stack — banco, e-mail e app (API e web), com portas sorteadas e teto de
memória —, para vários agentes validarem a interface ao mesmo tempo sem se atrapalhar nem travar o WSL.
Ela não usa o `docker-compose.yml` (portas fixas 5442, 1026 e 8026) nem o `docker-compose.prod.yml`, e
não depende do seu `.env`.

```bash
scripts/agente-stack.sh up --tipo efemero      # QA do próprio agente: cai sozinha
scripts/agente-stack.sh up --tipo validacao    # o usuário vai olhar: só ele manda derrubar
scripts/agente-stack.sh portas                 # URLs sorteadas: frontend, api, mailpit
scripts/agente-stack.sh testar --api src/saude/saude.controller.spec.ts   # relativo a apps/api
scripts/agente-stack.sh testar --web src/testes/cursor.test.ts            # relativo a apps/web
scripts/agente-stack.sh testar --shared        # packages/shared
scripts/agente-stack.sh down                   # efêmera cai; validação recusa sem a decisão do usuário
```

- **Quem orquestra pergunta ao usuário se ele vai validar localmente antes de despachar** os
  implementadores, grava a resposta (`ambiente validacao <worktree> sim|nao`) e já roda `up` em
  segundo plano. A primeira subida constrói a imagem (cerca de 2 minutos); depois leva menos de 1 minuto.
- **Primeiro acesso**: o `up` roda as migrations, a carga oficial e cria o "Clube QA" convidando
  `adm@qa.local`. O link do convite sai no fim do `up` e o e-mail chega ao Mailpit (porta `mailpit`
  do `portas`); abra o link para definir a senha.
- **Teste roda em container descartável** (`testar`): 2 GB, 2 núcleos; na API o Postgres também é
  descartável e vive em memória (o Jest cria um banco por execução e aplica as migrations nele). O
  ponta a ponta (Playwright) não roda aqui: só no CI do GitHub ou contra produção. Não rode `jest`
  nem `vitest` direto na máquina.
- A API monta links com a origem do navegador, então a porta é escolhida antes de subir; use a URL
  que o `portas` imprime, com `localhost`.
- `down` de uma stack de validação é recusado: quem decide é o usuário, por `ambiente derrubar`.
  No `gh pr ready`, `scripts/agente-stack.sh liberar` derruba a efêmera e avisa se há validação.
- `scripts/agente-stack.sh` é o núcleo, igual em todos os projetos que usam o esquema; o que muda
  daqui fica em `scripts/agente-stack.conf.sh`, `docker-compose.agente*.yml` e `docker/Dockerfile.agente`.
