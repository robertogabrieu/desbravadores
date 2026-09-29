# Fase 0 — Fundação · Spec

**Status:** revisada em duas rodadas (fatos, desenho/segurança, completude; depois contradições) ·
**Branch:** `feature/fase-0-fundacao` · **Base:** `main@3770614`

Esta spec transforma a Fase 0 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas.
Quem implementa **não decide nada que esteja aqui**; o que não estiver aqui e precisar de decisão
volta ao orquestrador em PENDÊNCIAS — nunca é escolhido pelo implementador.

**Precedência quando as fontes divergirem:** (1) esta spec e seus anexos; (2) `docs/planejamento/`;
(3) `docs/design/telas/*.dc.html` — **vence na aparência** (layout, textos, cores), nunca na regra.
Do design **não se copia CSS inline**: copia-se estrutura e texto; o estilo sai dos tokens (§8.1).

**Anexos que são contrato literal** (a onda 2 os copia sem alterar nomes, tipos nem campos):
- [`anexos/schema.prisma`](anexos/schema.prisma) — o banco inteiro da fase. Validado com `prisma validate` 7.5.0.
- [`anexos/contratos.ts`](anexos/contratos.ts) — enums e schemas zod de todas as entradas e saídas
  da API. Conferido com `tsc --strict` 5.9.3 + zod 4.3.6.

---

## 1. Entrega da fase

Ao fim, rodando localmente com um comando e pronto para ir ao servidor:

- monorepo com CI verde (lint, tipos, testes, build);
- banco com as tabelas da fundação e a **carga oficial** (22 classes, 834 requisitos, 9 áreas,
  514 especialidades, 16 mestrados, critérios de ranking padrão), reexecutável;
- login, convite por e-mail, recuperação de senha, sessão de até 30 dias, troca de papel, sair;
- autorização em três camadas (clube, permissão, escopo), com testes de isolamento entre clubes;
- telas: Login, Definir senha (convite), Esqueci/Redefinir senha, Escolher papel, Início
  provisório, **Minha unidade** (versão da fundação) e o Adm mínimo: Desbravadores, Unidades,
  Usuários;
- layouts de celular (barra inferior por papel) e de Adm (menu lateral), com os tokens do design;
- PWA instalável;
- scripts de deploy, atualização, backup e restauração, testados localmente.

**Fora da Fase 0** (não implementar, nem "de passagem"): chamada, reuniões, ranking calculado e
tela de ranking, perfil do DBV, aulas, cronograma, calendário, fotos, fila offline, relatórios,
notificações, anonimização de DBV (vem antes do lançamento público — RISCOS P7). As tabelas
dessas funções **não** entram no schema — cada fase traz a sua migration.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| D1 | Node **22 LTS** (`.nvmrc` = `22`; `engines.node` = `>=22 <23`), npm workspaces. Node 22 sai de suporte em **30/04/2027**: migrar para o 24 LTS antes disso fica como pendência declarada do projeto | Node 20 saiu de suporte em 30/04/2026 |
| D2 | Versões **fixas**, sem `^` (§3). Todas as dependências da fase são instaladas no P1; pacote seguinte não adiciona dependência — se precisar, devolve em PENDÊNCIAS | Agente não "atualiza de passagem"; três pacotes em paralelo não disputam o `package-lock.json` |
| D3 | Nomes de domínio em **português** (modelos, campos, rotas, componentes, arquivos de módulo). Termos da ferramenta ficam como são (`guard`, `hook`, `service`, `controller`) | Espelha os documentos |
| D4 | IDs **UUID v7 gerados pelo Prisma Client** (`@default(uuid(7))`). O banco **não** tem default de id: toda escrita passa pelo client; SQL cru só para leitura e para os scripts de backup | É assim que o Prisma implementa `uuid(7)` |
| D5 | Datas civis em `@db.Date` e trafegam como `"AAAA-MM-DD"`; instantes em `timestamptz` e ISO com fuso. Fuso do clube em `ConfiguracaoClube.fuso` (padrão `America/Sao_Paulo`); "hoje" é calculado nesse fuso (`hojeNoFuso`) | Domingo não vira sábado |
| D6 | Validação **só com zod** (`anexos/contratos.ts`), por um `ZodValidationPipe` próprio na API. Sem class-validator | Um contrato, usado no front e na API |
| D7 | Senha com **argon2id** (`argon2`, prebuild para musl — não precisa compilar no alpine). Login com e-mail inexistente roda o argon2 contra um hash falso fixo, para o tempo de resposta não revelar se o e-mail existe | Timing |
| D8 | **Sessão**: access JWT de 15 min, só em memória no front. Refresh opaco (32 bytes, base64url), guardado só como SHA-256, em cookie `httpOnly; SameSite=Strict; Path=/api/auth; Secure` (Secure desligável por `COOKIE_SECURE=false` só em dev/teste). **Rotação** a cada uso. **Tolerância de 30 s**: reapresentar um token já usado há ≤ 30 s emite um novo sucessor na mesma família, sem revogar (duas abas, resposta perdida no 3G); depois disso é reuso e **revoga a família**. **Validade absoluta da família: 30 dias desde o login** (`familiaExpiraEm`), sem renovação infinita. A família guarda o **vínculo ativo** (`RefreshToken.vinculoId`). Cada refresh vale até `familiaExpiraEm`. **Escolha do vínculo** no login e no refresh: o da família, se ativo; senão, o único vínculo ativo, se houver um; senão `null` (front vai a `/papel`). Usuário com **zero** vínculos ativos: login e refresh respondem 403 `VINCULO_INATIVO` ("Você não tem acesso ativo a nenhum clube"). O front serializa o refresh entre abas com Web Locks (`navigator.locks.request('refresh', …)`) | ARQUITETURA §3 + revisões |
| D9 | O access token leva `{ sub: usuarioId, vinculoId }` (`vinculoId` pode ser `null`) e nada mais de autorização. A cada requisição o `Vinculo` é lido do banco: **papel e clube vêm do banco**, nunca do token | Tirar ou trocar papel vale na próxima requisição |
| D10 | Testes: **Jest 30 + ts-jest** na API (unit e integração contra Postgres real); **Vitest** no `shared` e no `web` (com Testing Library e **msw 2** para simular a API); **Playwright headless** no ponta a ponta. Nunca navegador visível | Jest é o que roda Nest sem ajuste; Vitest é o nativo do Vite |
| D11 | **Banco de teste por execução.** O `globalSetup` do Jest cria `teste_<pid>_<8 hex>` com `CREATE DATABASE … OWNER desbravador`, usando `DATABASE_URL_ADMIN` (usuário `postgres`); roda `prisma migrate deploy` num processo filho com `DATABASE_URL` = usuário `desbravador` nesse banco; e roda a **carga oficial** uma vez (o P1 cria o setup; o P3 acrescenta a carga). O `globalTeardown` apaga o banco. Testes nunca fazem `TRUNCATE`: cada teste cria o próprio clube pelas fábricas e só lê o que é dele. `npm run teste:limpar -w api` apaga bancos `teste_*` órfãos com mais de 2 h | Execuções simultâneas em worktrees diferentes não se atropelam — é o que viabiliza o paralelo (PLANO §5) |
| D12 | Classes, requisitos e especialidades **oficiais** não têm `clubeId`. O que o clube escolhe sobre eles fica em `ClasseClube` (ativa, quem monta o cronograma) e `RequisitoAjuste` (ativo, CAMPO). Requisito oficial desativado pela carga **prevalece** sobre o ajuste. Especialidade oficial **não** tem ajuste por clube nesta fase (o clube não esconde especialidade oficial) | Corrige o MODELO-DE-DADOS: escolha de um clube não pode viver na linha compartilhada |
| D13 | **Carga oficial** idempotente (§5.3), rodada por comando próprio — **nunca** pelo deploy automático | Revisão dos requisitos antes do lançamento corrige o JSON e roda a carga de novo, de propósito |
| D14 | E-mail por SMTP (`nodemailer`); em dev e no e2e, **Mailpit** no compose | Sem conta externa para desenvolver |
| D15 | Front: React 19 + Vite 6 + React Router 7 (`createBrowserRouter`), TanStack Query 5, react-hook-form + `@hookform/resolvers` com os schemas zod, Tailwind 4 (`@theme inline`), componentes shadcn copiados para `web/src/ui` | Igual ao Finance |
| D16 | PWA com `vite-plugin-pwa` em **`injectManifest`** (`srcDir: 'src'`, `filename: 'sw.ts'`), `workbox-precaching` + `workbox-routing` (`NavigationRoute` com *denylist* de `/api/` escrita à mão — `navigateFallback` só existe no `generateSW`) | A Fase 1 põe a fila offline no service worker |
| D17 | API REST com prefixo `/api`; erro sempre `ErroApi` com os códigos de `CODIGOS_ERRO` (contratos) e mensagem em português pronta para a tela | API.md |
| D18 | Zero `any`. `@typescript-eslint/no-explicit-any: error` e `no-unsafe-*` ligados | Regra do projeto |
| D19 | Cor da classe no contrato como **nome de token** (`corToken`): regulares individuais `--classe-<slug>`; avançada individual herda da regular; Agrupadas e classes do clube `--color-primary` | tokens.css só define as 6 regulares |
| D20 | Uma migration por fase (`prisma migrate dev --name fase0_fundacao`); índices parciais vêm do schema (preview `partialIndexes`), nunca de SQL à mão — assim o próximo `migrate dev` não os apaga | Sem drift |
| D21 | **Usuário é global** (um e-mail, uma conta, vários clubes). O Adm de um clube: cria usuário ou, se o e-mail já existe, **só acrescenta vínculos — com a mesma resposta** (não revela que existia); não edita e-mail nem senha; edita nome/gênero só de quem está CONVIDADO; "inativar" = `Vinculo.ativo=false` **neste clube**. `Usuario.status=INATIVO` não é usado nesta fase | Um Adm não pode sequestrar nem desligar a conta de alguém de outro clube |
| D22 | **Guarda de clube sem exceções** (§6.3): toda operação sobre modelo de clube exige `clubeId` igual a um UUID em string — inclusive `findUnique`, `update`, `delete`, `upsert` (o Prisma aceita campo não único no `where` dessas operações). **Única saída**: o `PrismaSistema` (client sem a guarda), injetável só em `sessao/`, `auth/` e `scripts/` — é quem lê vínculos pelo usuário (login, `/eu`, `GuardaSessao`) e quem faz a carga. Regra de lint `no-restricted-imports` barra o import fora dessas pastas, e um teste confere | Sem isso, trocar o id na URL lê registro de outro clube (IDOR); e login e carga precisam enxergar além de um clube |
| D23 | Relações entre dois modelos de clube usam **chave estrangeira composta** `(clubeId, id)` (está no schema). Relação com `Classe` (que pode ser oficial) e com `Usuario` (global) é validada no serviço, com teste | O banco recusa ligar a unidade de um clube ao DBV de outro |
| D24 | Toda rota declara quem acessa, com exatamente um de: `@Publica()`; `@Autenticado()` (token válido, vínculo pode ser nulo — só `GET /eu` e `POST /auth/sair-de-todos`); `@Logado()` (vínculo ativo); `@Pode('<permissão>')`. Um teste varre as rotas registradas e falha se alguma não tiver exatamente um | Nenhuma rota nasce aberta por esquecimento |

## 3. Stack e versões

Regra: a versão **instalada** no Finance (`/home/robertogabrieu/desbravadores-finance@c7d82a5`,
conferida com `npm ls`). Pacote que o Finance não usa: a última estável no dia do P1, fixada e
**anotada nesta tabela pelo orquestrador** no commit da onda 1.

| Pacote | Versão | Pacote | Versão |
|---|---|---|---|
| prisma, @prisma/client, @prisma/adapter-pg | 7.5.0 | react, react-dom | 19.2.4 |
| @nestjs/core, /common, /platform-express, /testing | 11.1.17 | vite | 6.4.1 |
| @nestjs/jwt | 11.0.2 | vite-plugin-pwa | 1.3.0 |
| @nestjs/throttler | 6.5.0 | zod | 4.3.6 |
| typescript | 5.9.3 | nodemailer | 8.0.4 |
| jest | 30.3.0 | ts-jest | 29.4.6 |
| react-router-dom, @tanstack/react-query, tailwindcss, @tailwindcss/vite, @vitejs/plugin-react, react-hook-form, @hookform/resolvers, lucide-react, sonner, class-variance-authority, clsx, tailwind-merge, cookie-parser, helmet, supertest, pg, eslint, @eslint/js, typescript-eslint, globals, prettier, @types/node, @types/jest, @types/supertest, @types/cookie-parser, @types/nodemailer, @types/react, @types/react-dom, @types/pg | as do lock do Finance | argon2, vitest, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom, msw, @playwright/test, tsx, workbox-core, workbox-precaching, workbox-routing, @vite-pwa/assets-generator, dotenv | última estável, fixada no P1 |

Esta é a lista **completa** da fase. Qualquer outra dependência é pendência para o principal.

Diferenças **deliberadas** em relação ao Finance — não "corrigir" para ficar igual: refresh com
rotação, tolerância e validade absoluta (lá não rotaciona); access token em memória (lá fica em
`localStorage`, exposto a XSS); a guarda de **autenticação** é global com `@Publica()` (lá é por
controller); banco de teste por execução (lá é fixo, com TRUNCATE, e colide); argon2 (lá bcrypt);
guarda de clube sem chaves de linha (lá aceita `id`).

## 4. Estrutura do repositório

```
desbravadores/
├── package.json            # workspaces apps/*, packages/*; scripts: dev, lint, tipos, teste, teste:e2e, build
├── .nvmrc  .editorconfig  .gitignore  .env.exemplo  CLAUDE.md  eslint.config.mjs  tsconfig.base.json
├── docker-compose.yml       # dev: postgres (porta 5442) e mailpit (1026 SMTP, 8026 web)
├── docker-compose.prod.yml  # prod: postgres, api, web (nginx)
├── scripts/                 # deploy.sh, atualizar.sh, carga.sh, backup.sh, restaurar.sh
├── .github/workflows/ci.yml
├── packages/shared/src/
│   ├── index.ts  enums.ts  permissoes.ts  datas.ts
│   ├── contratos/           # comum, auth, eu, desbravadores, unidades, usuarios, classes, especialidades, saude
│   └── formulas/            # pontos, progresso, frequencia, nome-publico (+ *.test.ts)
├── apps/api/
│   ├── prisma/schema.prisma  prisma/migrations/  prisma.config.ts
│   ├── test/                # global-setup.ts, global-teardown.ts, fabricas.ts, isolamento.ts, app.ts
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── comum/           # prisma/ (serviço + guarda de clube), pipes/, filtros/, guards/, decorators/
│       ├── auth/  sessao/(jwt, tokens de uso único)  email/
│       ├── clubes/  usuarios/  desbravadores/  unidades/  classes/  especialidades/  permissoes/  saude/
│       └── scripts/         # carga.ts, clube-criar.ts, limpar-bancos-teste.ts (compilados para dist/)
└── apps/web/
    ├── index.html  vite.config.ts  public/icone.svg
    └── src/
        ├── main.tsx  sw.ts  rotas.tsx          # rotas.tsx importa um arquivo de rotas por módulo
        ├── ui/  layouts/  sessao/
        ├── api/             # cliente.ts (fetch + refresh), um arquivo de hooks por módulo
        ├── testes/          # handlers msw por módulo, construídos com os contratos
        └── modulos/         # acesso/, inicio/, unidade/, adm/
```

**Arquivos de dono compartilhado** (só o orquestrador edita): `schema.prisma` e migrations,
`packages/shared/src/{enums,permissoes}.ts`, `contratos/*`, `apps/web/src/rotas.tsx`,
`apps/api/src/app.module.ts`, `package.json`/`package-lock.json` de qualquer pacote,
`.env.exemplo`, `CLAUDE.md`, `ci.yml`.

## 5. Banco de dados

### 5.1 Schema

O [anexo](anexos/schema.prisma) é o schema completo, com relações, índices, chaves compostas e
índices parciais. Classificação que a guarda de clube e os testes usam:

| Grupo | Modelos | Como se acessa |
|---|---|---|
| **De clube** | `Vinculo, VinculoUnidade, Desbravador, Unidade, MembroUnidade, MatriculaClasse, CriterioRanking, ClasseClube, RequisitoAjuste` | sempre com `clubeId` (guarda, §6.3) |
| **Mistos** | `Classe, Especialidade` | `clubeId` ou exatamente `OR: [{clubeId: null}, {clubeId}]` |
| **Filhos sem `clubeId`** | `VinculoClasse, PermissaoAjuste` (via `Vinculo`), `SecaoRequisito, Requisito` (via `Classe`) | só alcançados a partir do pai já filtrado; nunca listados sozinhos |
| **Globais** | `Usuario, TokenUsoUnico, RefreshToken` | só pelo módulo `auth`/`sessao`, e `Usuario` só via `Vinculo where clubeId` fora dele |
| **Catálogo** | `AreaEspecialidade, Mestrado, Clube, ConfiguracaoClube` | leitura livre (catálogo) ou pelo `clubeId` da sessão |

### 5.2 Criar um clube

Não há rota. Script `apps/api/src/scripts/clube-criar.ts` (dev: `npm run clube:criar -w api -- …`
via `tsx`; prod: `node dist/scripts/clube-criar.js …` dentro do container), com
`--nome --slug --adm-nome --adm-email`. Numa transação: `Clube` + `ConfiguracaoClube`;
`ClasseClube` para cada classe oficial; os 8 critérios da §5.4; `Usuario` do Adm (ou o existente,
pelo e-mail) com `Vinculo` ADM. Depois da transação: se o usuário está CONVIDADO, gera convite e
envia o e-mail; imprime o link do convite no terminal. Usuário já ATIVO não recebe convite (só o
e-mail "você foi adicionado ao clube X").

### 5.3 Carga oficial

`apps/api/src/scripts/carga.ts`. Lê de `CARGA_DIR` (padrão: `<raiz do repo>/docs/planejamento/dados`;
na imagem de produção, `/app/dados`, copiado pelo Dockerfile) os arquivos `cadernos/{amigo,
companheiro, pesquisador, pioneiro, excursionista, guia, agrupadas}.json` e `especialidades.json`.
Arquivo ausente → erro e nada é gravado. Os campos `fonte` e `avisos` dos JSON são ignorados.

Numa transação, com **`findFirst` + `update`/`create`** (o `upsert` do Prisma não usa índice parcial):

- **Classe oficial**, chave `(nome, trilha, clubeId=null)`: grava `idade, tipo, trilha, origem=OFICIAL`.
  `classeBaseId` = a classe **oficial** de mesmo `trilha` com nome igual a `classeBase`.
  `ordem` = `100 × índice do arquivo` + `2 × posição da regular no arquivo`; a avançada recebe
  `ordem da sua regular + 1` (assim a lista mostra cada avançada logo após a regular).
- **SecaoRequisito**, chave `(classeId, codigo)`: `nome, ordem`. Seção que sumiu do JSON fica.
- **Requisito**, chave `(secaoId, codigo)`: `texto, campo, ordem, pagina, ativo=true`. Sumiu do
  JSON → `ativo=false`. **Texto mudou** num requisito com histórico → recusa sem `--forcar`
  (`temHistorico(requisitoId)` retorna `false` nesta fase; a Fase 2 o preenche com
  `RequisitoConcluido`).
- **AreaEspecialidade** por `codigo` (`nome, ordem`); **Especialidade** oficial por
  `(areaId, nome, clubeId=null)`; **Mestrado** por `nome`. Sumiu → `ativa/ativo=false`.
- `ClasseClube` que faltar, para cada clube existente.
- **Freio**: se a carga fosse desativar mais de 10% dos requisitos ou das especialidades
  existentes, recusa sem `--forcar`.
- Saída: tabela criados / atualizados / desativados por tipo.

Contagens depois da primeira carga (constantes do teste):

| Classe | Tipo · Trilha | Requisitos |
|---|---|---|
| Amigo · Amigo da Natureza | R · A — individual | 24 · 9 |
| Companheiro · Companheiro de Excursionismo | R · A — individual | 26 · 12 |
| Pesquisador · Pesquisador de Campo e Bosque | R · A — individual | 23 · 11 |
| Pioneiro · Pioneiro de Novas Fronteiras | R · A — individual | 24 · 13 |
| Excursionista · Excursionista na Mata | R · A — individual | 26 · 8 (incompleta; entra assim — revisão antes do lançamento) |
| Guia · Guia de Exploração | R · A — individual | 29 · 8 |
| Agrupadas 11 / 12 / 13 / 14 / 15+ | R — agrupadas | 46 / 63 / 80 / 98 / 123 |
| Agrupadas 11 / 12 / 13 / 14 / 15+ — avançada | A — agrupadas | 21 / 32 / 42 / 53 / 63 |

Total: **22 classes, 834 requisitos; 9 áreas, 514 especialidades; 16 mestrados.** Rodar a carga
duas vezes: a segunda imprime zero criados, zero atualizados, zero desativados.

### 5.4 Critérios padrão do ranking (criados pelo `clube:criar`)

| nome | pontos | ativo | gatilho | lancadoPor | ordem |
|---|---|---|---|---|---|
| Presença | 10 | sim | PRESENCA | CONSELHEIRO | 1 |
| Pontualidade | 5 | sim | PONTUALIDADE | CONSELHEIRO | 2 |
| Uniforme completo | 5 | sim | UNIFORME | CONSELHEIRO | 3 |
| Bíblia | 3 | sim | BIBLIA | CONSELHEIRO | 4 |
| Lição/devocional | 3 | **não** | LICAO | CONSELHEIRO | 5 |
| Requisito concluído | 4 | sim | REQUISITO | INSTRUTOR | 6 |
| Especialidade concluída | 15 | sim | ESPECIALIDADE | INSTRUTOR | 7 |
| Participação em evento | 20 | sim | MANUAL | ADM | 8 |

Todos com `padrao=true`.

## 6. Autorização

### 6.1 Catálogo (`packages/shared/src/permissoes.ts`)

Constante única `as const`: para cada chave, `rotulo` (texto da tela de Usuários) e o padrão por
papel. Chave **ausente** para o papel = não se aplica (não aparece na tela, e ajuste é recusado);
`false` = existe e começa desligada; `true` = começa ligada.

| Chave | Rótulo | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|---|
| `dbv.ver` | Ver desbravadores | ✔ | ✔ | ✔ |
| `dbv.ver_contato` | Ver contato do responsável | ✔ | ✔ | — |
| `dbv.editar` | Editar dados dos DBVs da unidade | ✔ | desligada | — |
| `dbv.cadastrar` | Cadastrar desbravadores | ✔ | — | — |
| `reuniao.registrar` | Registrar reuniões | ✔ | ✔ | — |
| `reuniao.ver` | Ver histórico de reuniões | ✔ | ✔ | — |
| `foto.enviar` | Enviar fotos na galeria | ✔ | ✔ | — |
| `foto.ver` | Ver a galeria | ✔ | ✔ | — |
| `relatorio.unidade` | Ver relatórios da unidade | ✔ | desligada | — |
| `aula.registrar` | Registrar aulas | ✔ | — | ✔ |
| `requisito.marcar` | Marcar requisitos e especialidades | ✔ | — | ✔ |
| `material.enviar` | Enviar materiais de apoio | ✔ | — | ✔ |
| `classe.ver_relatorio` | Ver relatórios da classe | ✔ | — | ✔ |
| `observacao.ver_outros` | Ver observações de outros instrutores | ✔ | — | desligada |
| `ranking.lancar_manual` | Lançar pontos manuais | ✔ | — | — |
| `usuario.gerenciar` | Gerenciar usuários | ✔ | — | — |
| `unidade.gerenciar` | Gerenciar unidades | ✔ | — | — |
| `classe.gerenciar` | Gerenciar classes e matrículas | ✔ | — | — |
| `calendario.gerenciar` | Gerenciar o calendário | ✔ | — | — |
| `ranking.configurar` | Configurar o ranking | ✔ | — | — |
| `relatorio.geral` | Ver relatórios gerais | ✔ | — | — |
| `clube.configurar` | Configurar o clube | ✔ | — | — |

`permissoesEfetivas(papel, ajustes)` (pura, em `permissoes.ts`, com teste): ADM → todas; outros →
padrão do papel com os ajustes aplicados **somente** às chaves que se aplicam ao papel. A API
recusa com 422 `AJUSTE_INVALIDO` ajuste de chave inexistente ou que não se aplica, e qualquer
ajuste para ADM.

### 6.2 As três camadas na API

1. **`GuardaSessao`** (global, `APP_GUARD`): valida o access token; carrega o `Vinculo` do token
   **do banco** (pelo `PrismaSistema`). Sem token → 401 `NAO_AUTENTICADO`. Token com `vinculoId`
   nulo só passa em `@Autenticado`; nas outras rotas → 403 `VINCULO_INATIVO`. Vínculo inexistente,
   inativo ou de outro usuário → 403 `VINCULO_INATIVO` (o front leva a `/papel`). Injeta
   `req.sessao = { usuarioId, vinculoId, clubeId, papel }` com clube e papel **do banco**.
   `@Publica()` pula tudo.
2. **`GuardaPermissao`** (global): `@Pode('<chave>')` calcula `permissoesEfetivas` com os ajustes
   lidos do banco; negada → 403 `SEM_PERMISSAO`. `@Logado()` só exige vínculo ativo.
3. **Escopo**, no serviço, a partir de `req.sessao`:
   - ADM: tudo do clube.
   - CONSELHEIRO: `Desbravador`/`Unidade` das unidades do seu `VinculoUnidade`, e só tipo DBV.
   - INSTRUTOR: DBVs (DBV e LIDER) com `MatriculaClasse` nas classes do seu `VinculoClasse` no
     `anoClube` corrente.
   - Recurso fora do escopo ou de outro clube → **404** `NAO_ENCONTRADO` (não confirma que existe).
   - `contato` do DBV só é incluído na saída com `dbv.ver_contato`; sem ela, a chave é **omitida**
     pelo serviço (não só escondida na tela). Teste no JSON.

**Escopo por rota** (o que cada papel recebe; fora disso, 404 ou lista vazia):

| Rota | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|
| `GET /desbravadores[/:id]` | todos | DBV das suas unidades | matriculados nas suas classes no ano |
| `PATCH /desbravadores/:id` | todos os campos | só nome, nomePublico, responsável*, autorização de imagem (com `dbv.editar`) | — |
| `GET /unidades` | todas (`?todas=true` inclui inativas) | só as suas | lista vazia |
| `GET /unidades/:id/membros` | qualquer | só as suas | 404 |
| `GET /unidades/sem-membros` | sim | 403 | 403 |

**Avisos do cadastro** (não impedem salvar; vêm em `avisos[]`):
`AVISO_SEXO_UNIDADE` — unidade MASCULINA/FEMININA e sexo diferente ("A unidade Águias é masculina.");
`AVISO_IDADE_CLASSE` — classe regular individual com `idade` diferente da idade do DBV no início do
ano do clube, ou agrupada com `idade` maior que a dele ("Pela idade, a classe esperada é Pioneiro.").

**Matrícula**: matricular numa regular quando já há outra regular CURSANDO da mesma trilha no mesmo
ano muda a anterior (e a avançada ligada a ela) para DESISTIU — só uma regular CURSANDO por trilha e
ano. **Reativar** um DBV inativo: `POST /desbravadores/:id/reativar` (`dbv.cadastrar`) — `ativo=true`,
`saidaEm=null`; unidade e matrícula são refeitas pelas rotas próprias.

**Escritas que cruzam relações** (validadas no serviço, com teste de "id de outro clube → 404"):
`unidadeId`, `classeId` (oficial ou do próprio clube), `usuarioId` do LIDER (precisa ter vínculo
ativo no clube), `unidadeIds`/`classeIds` de vínculo. As chaves compostas do schema cobrem
unidade/DBV/vínculo no próprio banco.

**Último Adm**: qualquer operação que deixaria o clube com zero `Vinculo` ADM ativo → 422
`ULTIMO_ADM` (desativar vínculo, desativar o próprio). Teste.

### 6.3 Guarda de clube no Prisma

Extensão (`Prisma.defineExtension` + `query.$allModels.$allOperations`), aplicada no construtor do
`PrismaService` (que devolve o client estendido — ver ONDE FICA). Para os modelos **de clube**
(§5.1), em **toda** operação exceto `create`/`createMany`, o `where` precisa ter, no nível de cima
ou dentro de um `AND`, `clubeId` **igual a uma string UUID** (`typeof === 'string'` e formato
UUID; `undefined`, `null`, `{in}`, `{not}` e qualquer objeto são recusados). Em `create`, o
`data.clubeId` precisa ser string UUID. Para os modelos **mistos**, aceita também exatamente
`OR: [{ clubeId: null }, { clubeId: <string UUID> }]` no nível de cima. Violação → lança
`ErroEscopoClube` (vira 500 e aparece no log; é defeito, não uso). **`include` aninhado não passa
pela extensão** — o isolamento de relações aninhadas é garantido pela suíte de isolamento (§11).
Em `createMany`, cada item de `data` precisa de `clubeId` string UUID. **Escrita aninhada** de
modelo de clube (ex.: `desbravador.create({ data: { membros: { create } } })`) é proibida: crie
em separado, dentro da transação.

O `PrismaSistema` (D22) é outra instância do client, sem a extensão, exposta por um provider
próprio; só `sessao/`, `auth/` e `scripts/` o injetam.

## 7. Fórmulas do `shared` (os casos viram teste)

**`pontosDaChamada(marcacao, criterios, config)`** — soma os critérios **ativos** por gatilho.

| Marcação | Critérios / config | Resultado |
|---|---|---|
| presente, não atrasou, uniforme, Bíblia | padrão | 23 |
| presente, atrasou, sem uniforme, sem Bíblia | padrão | 10 |
| falta | `descontarFalta=false` | 0 |
| falta | `descontarFalta=true`, `pontosDescontoFalta=2` | −2 |
| falta justificada | `descontarFalta=true` | 0 |
| presente, Lição marcada | LICAO desligado | 23 no máximo (Lição não soma) |
| presente, Lição marcada | LICAO ligado (3) | +3 |
| presente, Presença desligada | — | sem os 10 |

**`percentualClasse(concluidos, total)`** → 0–100 sem arredondar; `total=0` → 0.
**`mediaTurma(percentuais)`** → média dos exatos, `Math.round` só no fim; `[]` → 0. `[33.33, 66.67, 100]` → 67.
**`prontoParaInvestidura(percentualRegular)`** → `=== 100`.
**`frequencia(situacoes)`** → PRESENTE e ATRASADO contam; FALTA e FALTA_JUSTIFICADA não; `[]` → `null`. `[P, A, F, J]` → 50.
**`anoClube(data, inicioAnoClube)`** → `"02-01"`: 15/01/2027 → 2026; 01/02/2027 → 2027.
**`idade(nascimento, hoje)`** → aniversário hoje conta; 29/02 em ano não bissexto faz aniversário em 01/03.
**`hojeNoFuso(fuso, agora)`** → `"AAAA-MM-DD"` no fuso; 28/09 02:30Z em `America/Sao_Paulo` → 27/09.
**`nomePublico(nome)`** → primeiro nome + inicial do último sobrenome que não seja partícula
(da, de, do, das, dos, e): "Ana Clara Souza" → "Ana S."; "João da Silva" → "João S."; "Pedro" → "Pedro".
**`permissoesEfetivas`** → §6.1; casos: CONSELHEIRO sem ajuste não tem `dbv.editar`; com ajuste
`dbv.editar=true` tem; ajuste `usuario.gerenciar=true` para CONSELHEIRO é **ignorado**; ADM tem as 22.

## 8. Front

### 8.1 Visual

`docs/design/tokens.css` vira `apps/web/src/ui/tokens.css` **sem alterar valores**; o Tailwind 4
usa `@theme inline` apontando para essas variáveis. Fontes Bricolage Grotesque e Figtree (Google
Fonts), ícones `lucide-react`, alvo de toque ≥ 44 px, input com 16 px no celular, sem dark mode.
Telas de celular com largura máxima de 480 px centralizada no computador.

### 8.2 Navegação

- **Barra inferior** (`LayoutCelular`), por papel ativo:
  Conselheiro — Início · Unidade · Reuniões · Ranking; Instrutor — Início · Classes · Cronograma ·
  Ranking. O que não existe na fase aparece **desabilitado** com a etiqueta "em breve".
- **Menu lateral** (`LayoutAdm`): Visão geral · Desbravadores · Usuários · Unidades · Classes e
  especialidades · Calendário do clube · Cronogramas · Ranking · Relatórios. Na fase, habilitados:
  Desbravadores, Usuários, Unidades; os outros com "em breve".
- **Adm no celular** (largura < 900 px): em `/adm/*`, faixa "O painel do Adm é melhor no
  computador", sem bloquear.
- **Sair**: menu no cabeçalho (nome do usuário) com "Trocar de papel" (se 2+ vínculos), "Sair" e
  "Sair de todos os aparelhos".
- `/` redireciona: sem sessão → `/login`; ADM → `/adm/desbravadores`; outros → `/inicio`.
  Rota inexistente → página "Página não encontrada" com link para `/`.
- O botão "Ver ranking DBV Destaque" do Login **não** aparece nesta fase.

### 8.3 Telas

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/login` | Login | `Main.dc.html` sem seletor de perfil | "E-mail ou senha incorretos" para qualquer falha; link "Esqueci minha senha" |
| `/convite/:token` | Definir senha | padrão do Login | senha + confirmação; token inválido/vencido: "Este convite não vale mais. Peça um novo ao Adm do clube." |
| `/senha/esqueci` | Esqueci | padrão do Login | sempre "Se o e-mail estiver cadastrado, enviamos um link." |
| `/senha/redefinir/:token` | Redefinir | padrão do Login | igual ao convite; ao salvar, vai ao login |
| `/papel` | Escolher papel | cartões | um cartão por vínculo ativo: papel + clube + unidades/classes |
| `/inicio` | Início provisório | cabeçalho de `Inicio-*.dc.html` | saudação, papel, cartão "Em construção"; conselheiro: link para Unidade; convite de instalação (§8.5) |
| `/unidade` | Minha unidade (C2 da fundação) | `Minha-Unidade.dc.html` | conselheiro com 2+ unidades: seletor no topo (primeira por nome); lista só DBV, ordem por nome, busca no cliente sem acento; linha: iniciais, nome, "classe · idade anos" (classe = regular atual, ou "sem classe"); **sem frequência** e **sem toque** (perfil vem na Fase 1); vazio: "Nenhum desbravador nesta unidade. Avise o Adm." |
| `/adm/desbravadores` | A1 | `Adm-Desbravadores.dc.html` | tabela: nome, idade, unidade, classe (chip com `corToken`), tipo; filtros: busca, unidade (incl. "sem unidade"), classe, situação (ativos padrão); 25 por página; ordem por nome. Painel lateral: **Novo** e **Editar**; campos de `DesbravadorCriarEntrada`; LIDER esconde unidade e mostra "conta de usuário (opcional)"; classe = regular do ano com a caixa "matricular também na avançada" marcada; avisos da API em faixa amarela sem impedir; **Inativar** com data de saída (fecha o `MembroUnidade` aberto e muda matrículas CURSANDO para DESISTIU); filtro "inativos" mostra **Reativar** |
| `/adm/unidades` | A3 | `Adm-Unidades.dc.html` | cartões: nome, tipo, conselheiros, total; **Nova** e **Editar** (nome, tipo, grito, ativa); painel com duas colunas "Na unidade" / "Sem unidade": tocar move na hora (`PUT /desbravadores/:id/unidade`, `desde` = hoje no fuso) e mostra "Desfazer" por 5 s (chamada inversa). Desativar unidade com membros → 422 `REGRA` "Mova os membros antes de desativar" |
| `/adm/usuarios` | A2 | `Adm-Usuarios.dc.html` | abas Todos/Adm/Conselheiros/Instrutores com `contagens`; tabela: nome, e-mail, papéis, situação; busca; 25 por página. Painel: nome/e-mail/gênero (e-mail só na criação); **um bloco por vínculo** com papel, unidades ou classes (múltipla escolha) e as caixas de permissão do papel pelo catálogo; "+ Acrescentar papel". **Usuário novo**: um único "Salvar" (`POST /usuarios` com os vínculos). **Usuário existente**: cada bloco salva sozinho (`PUT /vinculos/:id`; bloco novo `POST /usuarios/:id/vinculos`). "Desativar neste clube" = `POST /usuarios/:id/desativar` (todos os vínculos dele neste clube). "Reenviar convite" (só situação CONVIDADO) |

### 8.4 Sessão e dados no front

Access token em memória no módulo `api/cliente.ts`, nunca em `localStorage`. Ao abrir: `POST
/api/auth/refresh` (serializado por Web Locks); 401 → `/login`; `vinculoAtivoId` nulo → `/papel`.
Em 401 de outra rota, um refresh e **uma** repetição; requisições simultâneas esperam o mesmo
refresh. 403 `VINCULO_INATIVO` → `/papel`. Cada pacote de tela escreve os hooks TanStack Query do
seu módulo em `api/<modulo>.ts` e os handlers msw em `testes/handlers/<modulo>.ts`.

### 8.5 PWA

Manifesto: nome "Desbravador", `short_name` "Desbravador", `display: standalone`, `lang: pt-BR`,
cor de tema `#1F4D3A`, fundo `#F4F1EA`. Ícones gerados por `@vite-pwa/assets-generator` a partir
de `public/icone.svg` (quadrado verde-mata `#1F4D3A` com um "D" creme `#F3E3C8` em Bricolage
Grotesque 700 convertido em caminho). Service worker: *precache* do build; `NavigationRoute` para
`index.html` com denylist `^/api/`; nada de cache de `/api`. Convite de instalação no Início:
botão "Instalar app" quando o navegador dispara `beforeinstallprompt`; no iPhone, a instrução
"Compartilhar → Adicionar à Tela de Início" **e** "Depois de instalar, entre de novo pelo ícone"
(o app instalado não compartilha a sessão do Safari), mostrada uma vez (`localStorage`).

## 9. API da Fase 0

Contratos no [anexo](anexos/contratos.ts). Ordem das rotas no Nest: rotas literais
(`/unidades/sem-membros`) antes das paramétricas (`/unidades/:id`).

| Método e rota | Entrada → Saída | Acesso |
|---|---|---|
| `POST /api/auth/login` | `LoginEntrada` → `SessaoSaida` | `@Publica` · limites §9.1 |
| `POST /api/auth/refresh` | cookie → `SessaoSaida` | `@Publica` (cookie) |
| `POST /api/auth/papel-ativo` | `PapelAtivoEntrada` → `SessaoSaida` (vínculo precisa ser do usuário e ativo; grava na família) | `@Publica` (cookie) |
| `POST /api/auth/logout` | → 204 (revoga a família atual) | `@Publica` (cookie) |
| `POST /api/auth/sair-de-todos` | → 204 (revoga todas as famílias do usuário) | `@Autenticado` |
| `POST /api/auth/convite/aceitar` | `AceitarConviteEntrada` → `SessaoSaida` (só usuário CONVIDADO; vira ATIVO) | `@Publica` · limites |
| `POST /api/auth/senha/esqueci` | `EsqueciSenhaEntrada` → 204 sempre (só envia a ATIVO) | `@Publica` · limites |
| `POST /api/auth/senha/redefinir` | `RedefinirSenhaEntrada` → 204; revoga todas as famílias | `@Publica` · limites |
| `GET /api/eu` | → `EuSaida` | `@Autenticado` |
| `GET /api/desbravadores` | `DesbravadorFiltro` → `DesbravadorLista` | `@Pode('dbv.ver')` + escopo |
| `GET /api/desbravadores/:id` | → `DesbravadorSaida` | `@Pode('dbv.ver')` + escopo |
| `POST /api/desbravadores` | `DesbravadorCriarEntrada` → `comAvisos(DesbravadorSaida)` 201 | `@Pode('dbv.cadastrar')` |
| `PATCH /api/desbravadores/:id` | `DesbravadorEditarEntrada` → `comAvisos(DesbravadorSaida)` | `@Pode('dbv.editar')` + escopo |
| `POST /api/desbravadores/:id/inativar` | `InativarEntrada` → `DesbravadorSaida` | `@Pode('dbv.cadastrar')` |
| `POST /api/desbravadores/:id/reativar` | → `DesbravadorSaida` | `@Pode('dbv.cadastrar')` |
| `PUT /api/desbravadores/:id/unidade` | `MoverUnidadeEntrada` → `DesbravadorSaida` (LIDER → 422 `REGRA`) | `@Pode('unidade.gerenciar')` |
| `POST /api/desbravadores/:id/matriculas` | `MatriculaEntrada` → `MatriculaSaida[]` (regular + avançada quando `incluirAvancada`) | `@Pode('classe.gerenciar')` |
| `GET /api/unidades` | `UnidadeFiltro` → `UnidadeSaida[]` | `@Pode('dbv.ver')` + escopo |
| `GET /api/unidades/:id/membros` | → `MembroSaida[]` | `@Pode('dbv.ver')` + escopo |
| `GET /api/unidades/sem-membros` | → `MembroSaida[]` | `@Pode('unidade.gerenciar')` |
| `POST /api/unidades` · `PATCH /api/unidades/:id` | `UnidadeCriarEntrada` / `UnidadeEditarEntrada` → `UnidadeSaida` | `@Pode('unidade.gerenciar')` |
| `GET /api/usuarios` | `UsuarioFiltro` → `UsuarioLista` | `@Pode('usuario.gerenciar')` |
| `POST /api/usuarios` | `UsuarioCriarEntrada` → `UsuarioSaida` 201; e-mail já existente: só ganha os vínculos e a resposta **ecoa o que foi enviado** (nome, gênero, situação CONVIDADO) | `@Pode('usuario.gerenciar')` |
| `PATCH /api/usuarios/:id` | `UsuarioEditarEntrada` → `UsuarioSaida` (só CONVIDADO sem vínculo em outro clube) | `@Pode('usuario.gerenciar')` |
| `POST /api/usuarios/:id/desativar` | → `UsuarioSaida` (todos os vínculos neste clube; respeita último Adm) | `@Pode('usuario.gerenciar')` |
| `POST /api/usuarios/:id/vinculos` | `VinculoEntrada` → `UsuarioSaida` | `@Pode('usuario.gerenciar')` |
| `PUT /api/vinculos/:id` | `VinculoEditarEntrada` → `UsuarioSaida` | `@Pode('usuario.gerenciar')` |
| `POST /api/usuarios/:id/convite` | → 204 (só CONVIDADO; invalida convites anteriores) | `@Pode('usuario.gerenciar')` |
| `GET /api/permissoes/catalogo` | → `CatalogoPermissoesSaida` | `@Pode('usuario.gerenciar')` |
| `GET /api/classes` · `GET /api/classes/:id` | `ClasseFiltro` → `ClasseSaida[]` / `ClasseDetalheSaida` | `@Logado` |
| `GET /api/especialidades` | `EspecialidadeFiltro` → `AreaComEspecialidades[]` | `@Logado` |
| `GET /api/saude` | → `SaudeSaida` | `@Publica` |

Tokens de uso único: 32 bytes aleatórios em base64url, guardados só como SHA-256; convite vale
7 dias, redefinição 1 hora; gerar um novo invalida os anteriores da mesma finalidade.

### 9.1 Limites de taxa

`@nestjs/throttler` com **dois throttlers nomeados**: `porEmail` (subclasse com `getTracker` =
e-mail normalizado do corpo) e `porIp` (`getTracker` = IP). Cada rota limitada declara os dois;
estourar qualquer um → 429.
`trust proxy` = `TRUST_PROXY` (padrão `2`: nginx do host + nginx do container), com teste de que o
IP vem do `X-Forwarded-For`. Limites: login 5/min por e-mail **e** 20/min por IP; esqueci 3/h por
e-mail **e** 10/h por IP; aceitar convite e redefinir 10/h por IP. Nos testes de integração o
guard é trocado por um que não limita, **exceto** no teste que verifica o limite.

### 9.2 E-mails

Remetente `SMTP_FROM`. Links usam `APP_URL`.
- Convite — assunto "Seu acesso ao <clube>"; corpo: "Olá, <nome>. Você foi convidado para o app do
  <clube>. Defina sua senha em <APP_URL>/convite/<token> — o link vale por 7 dias."
- Adicionado a outro clube — assunto "Você agora faz parte do <clube>"; corpo com link para `APP_URL`.
- Redefinição — assunto "Redefinir sua senha"; corpo: "Use este link em até 1 hora:
  <APP_URL>/senha/redefinir/<token>. Se não foi você, ignore este e-mail."
Interface `ServicoEmail { enviar(msg: { para, assunto, texto }): Promise<void> }` com duas
implementações: SMTP e `ServicoEmailFalso` (guarda as mensagens na memória, para os testes). Os
três textos acima são funções em `email/modelos.ts` (`emailConvite`, `emailAdicionado`,
`emailRedefinicao`) — nascem no P3 e são usados por P5, P6 e `clube:criar`.

## 10. Ambiente, deploy e backup

### 10.1 Variáveis (`.env.exemplo`)

| Variável | Uso | Dev |
|---|---|---|
| `DATABASE_URL` | API e Prisma | `postgresql://desbravador:desbravador@localhost:5442/desbravador` |
| `DATABASE_URL_ADMIN` | criar bancos de teste (usuário com CREATEDB) | `postgresql://postgres:postgres@localhost:5442/postgres` |
| `PORTA_API` | porta da API | `3001` |
| `APP_URL` | base dos links de e-mail | `http://localhost:5173` |
| `JWT_SEGREDO` | assinatura do access token | gerado (`openssl rand -hex 32`) |
| `COOKIE_SECURE` | cookie `Secure` | `false` |
| `TRUST_PROXY` | saltos de proxy confiáveis | `0` (prod `2`) |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA`, `SMTP_FROM` | e-mail | Mailpit `localhost:1026`, sem usuário |
| `MAILPIT_URL` | e2e lê e-mails | `http://localhost:8026` |
| `CARGA_DIR` | dados da carga | vazio (usa o padrão do repo) |
| `WEB_PORTA` | porta externa do nginx em prod | `8090` |
| `BACKUP_AGE_DESTINATARIO`, `RCLONE_REMOTO` | backup | chave de teste; pasta local |

Dev: Vite em `5173` com **proxy de `/api` para a API** (mesma origem — sem CORS; cookie funciona).
Em prod, mesma origem pelo nginx. Jest e Playwright leem `.env.teste` (criado a partir do exemplo
pelo `globalSetup` quando faltar). O compose de dev usa as portas 5442/1026/8026 para não colidir
com o Finance (5432/1025/8025).

### 10.2 Produção

- `docker-compose.prod.yml`: `postgres:17-alpine` (volume nomeado; usuário do app sem superuser),
  `api` (Node 22 alpine; imagem com `prisma` CLI, `prisma.config.ts`, `dist/` e `/app/dados`;
  entrada roda `prisma migrate deploy` e o servidor), `web` (nginx: build do front, proxy de
  `/api` para `api`, `sw.js` e `index.html` sem cache, `/assets/` com cache longo, **CSP**
  `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'` — `'unsafe-inline'` só em estilo, porque o sonner injeta `<style>`; script continua só `'self'`).
  Limites: api 256 MB, postgres 256 MB. Só o `web` publica porta (`WEB_PORTA`).
- HTTPS: nginx do host com Let's Encrypt, como no Finance (fora do repositório).
- `scripts/deploy.sh` (primeira vez: cria `.env` com segredos por `openssl`, sobe, migra),
  `scripts/atualizar.sh` (recusa árvore suja, pull, build, up — **não** roda a carga),
  `scripts/carga.sh` (roda a carga no container, repassando `--forcar` se dado),
  `scripts/backup.sh` (`pg_dump -Fc` → `age -r $BACKUP_AGE_DESTINATARIO` → `rclone copy` para
  `$RCLONE_REMOTO`; apaga remotos com mais de 30 dias),
  `scripts/restaurar.sh --arquivo <x.age> --chave <arquivo-da-chave-privada> --banco <novo>`.
- Teste local dos scripts: par de chaves `age` gerado pelo próprio teste, remoto `rclone` do tipo
  pasta local. Faltando `docker`, `age`, `rclone` ou `pg_dump` na máquina, o pacote **não pula**:
  devolve em PENDÊNCIAS com o comando que faltou.

**Depende do dono** (passo de ida ao ar, não portão da fase): VPS com folga, subdomínio com DNS,
conta SMTP, bucket R2 e a chave privada `age` guardada fora do servidor. A subida é
`scripts/deploy.sh` + `scripts/carga.sh` + `clube:criar`, rodados pelo dono.

## 11. Testes obrigatórios (escritos antes da implementação) e quem escreve

| Teste | Tipo | Pacote |
|---|---|---|
| Casos do §7 e `permissoesEfetivas` | Vitest | onda 2 (`permissoesEfetivas`) · P2 (fórmulas) |
| Guarda de clube: cada operação de cada modelo de clube sem `clubeId`, com `undefined`, `{in}`, `{not}` lança; mistos com o `OR` exato passam e com outro `OR` lançam | Jest unit | P3 |
| Toda rota tem exatamente um de `@Publica/@Autenticado/@Logado/@Pode`; `PrismaSistema` só é injetado em `sessao/`, `auth/`, `scripts/` | Jest integração | P3 (roda de novo na onda 6 com todas as rotas) |
| Carga: contagens do §5.3; segunda execução não muda nada; requisito removido do JSON vira inativo; freio de 10%; arquivo ausente falha | Jest integração | P3 |
| `clube:criar` cria clube, configuração, `ClasseClube` (22), 8 critérios e o Adm, e envia o convite | Jest integração | P3 |
| Auth: login certo/errado (mesma mensagem); refresh rotaciona; reuso em ≤ 30 s não derruba; reuso após 30 s revoga a família; família expira em 30 dias; papel-ativo recusa vínculo de outro usuário; convite vencido/usado → 410; convite só para CONVIDADO; redefinir revoga sessões; sair de todos; vínculo desativado → 403 `VINCULO_INATIVO` na próxima requisição; limite de login responde 429 | Jest integração | P5 |
| Isolamento: para **cada rota do pacote**, usuário do clube A não lê, lista, altera nem descobre (404) nada do clube B — pelo auxiliar `testarIsolamento(rota)` do P3 | Jest integração | P5 e P6, cada um nas suas rotas |
| Permissões e escopo: conselheiro só vê DBV das suas unidades e nunca LIDER; instrutor só dos matriculados nas suas classes; sem `dbv.ver_contato` a chave `contato` não vem no JSON; ajuste inválido → 422; último Adm → 422; Adm cria usuário com e-mail de outro clube → mesma resposta, só ganha vínculo, não altera nome/senha do existente | Jest integração | P6 |
| Matrícula: regular com `incluirAvancada` cria as duas; avançada sozinha não cria a regular; classe de outro clube → 404 | Jest integração | P6 |
| Front: telas do pacote renderizam, validam com os contratos e tratam os erros da API (msw) | Vitest + Testing Library | P7, P8, P9 |
| Ponta a ponta (`globalSetup` do Playwright cria o banco pelo mesmo auxiliar do Jest, roda migrate e carga, **sobe a API e o `vite preview` do build** em portas livres escolhidas na hora e os derruba no `globalTeardown`; o service worker só existe no build): `clube:criar` → convite no Mailpit → definir senha → Adm cria unidade, DBV e conselheiro → convite do conselheiro → conselheiro entra e vê **só** a própria unidade; manifesto e service worker registrados | Playwright headless | P10 |

## 12. CLAUDE.md do repositório (onda 2)

Curto, só o que morde em silêncio:
- zero `any`; contratos só em `packages/shared`, nunca redeclarados na API ou no front;
- toda operação de modelo de clube leva `clubeId` — a guarda lança, não preenche; `include`
  aninhado não passa pela guarda;
- toda rota declara `@Publica`, `@Autenticado`, `@Logado` ou `@Pode`; fora do escopo é 404;
- `PrismaSistema` (sem guarda) só em `sessao/`, `auth/`, `scripts/`;
- classes/requisitos/especialidades oficiais não têm `clubeId`; escolha do clube vai em
  `ClasseClube`/`RequisitoAjuste`;
- ids vêm do Prisma Client: nada de INSERT em SQL cru;
- nunca apagar linha com histórico: desativar;
- usuário é global: o Adm não edita e-mail nem senha de ninguém;
- testes de integração criam banco próprio; nunca `TRUNCATE`; Playwright sempre headless;
- do design não se copia CSS inline;
- a carga não roda no deploy automático.

## 13. O que NÃO quebra

Repositório sem código anterior. `docs/design/` não muda. `docs/planejamento/` só ganha, na onda 6,
a correção D12 em MODELO-DE-DADOS §3 e a D21 (usuário global) em ARQUITETURA §4.

---

## ONDE FICA

Padrões do Finance a **consultar** (não copiar às cegas — diferenças deliberadas no §3):

- config do Prisma 7 (URL no config, não no schema)    `/home/robertogabrieu/desbravadores-finance/web/backend/prisma.config.ts:1-11`
- generator `prisma-client` com `moduleFormat`/`importFileExtension`  `/home/robertogabrieu/desbravadores-finance/web/backend/prisma/schema.prisma:1-9`
- PrismaService com adapter-pg e `$extends` no construtor (cast `as unknown as`)  `/home/robertogabrieu/desbravadores-finance/web/backend/src/prisma/prisma.service.ts:1-27`
- guarda de clube: ligação da extensão e o teste       `/home/robertogabrieu/desbravadores-finance/web/backend/src/prisma/tenant-guard.ts:9-49,125` · `tenant-guard.spec.ts`
- hash SHA-256 de token opaco                           `/home/robertogabrieu/desbravadores-finance/web/backend/src/modules/auth/auth.service.ts:304-364`
- cookie do refresh                                     `/home/robertogabrieu/desbravadores-finance/web/backend/src/modules/auth/auth.controller.ts:154-160`
- guard de permissão lendo do banco a cada requisição   `/home/robertogabrieu/desbravadores-finance/web/backend/src/common/guards/permissions.guard.ts:15-65`
- app de teste com AppModule real e e-mail simulado     `/home/robertogabrieu/desbravadores-finance/web/backend/test/setup.ts` (`createTestApp`)
- Tailwind 4 com `@theme inline`                        `/home/robertogabrieu/desbravadores-finance/web/frontend/src/index.css:7`
- PWA: manifesto e denylist de `/api/`                  `/home/robertogabrieu/desbravadores-finance/web/frontend/vite.config.ts:9-58`
- cliente HTTP com fila de refresh em 401               `/home/robertogabrieu/desbravadores-finance/web/frontend/src/lib/api.ts:33-75`
- nginx do front                                        `/home/robertogabrieu/desbravadores-finance/web/frontend/nginx.conf`
- deploy com segredos por `openssl`; update que recusa árvore suja  `/home/robertogabrieu/desbravadores-finance/deploy.sh`, `update.sh`
- `trust proxy`                                         `/home/robertogabrieu/desbravadores-finance/web/backend/src/main.ts:26`
- conferido em                                          `desbravadores-finance@c7d82a5`

Deste repositório:

- contrato do banco                          `docs/fases/fase-0/anexos/schema.prisma`
- contratos da API                           `docs/fases/fase-0/anexos/contratos.ts`
- dados da carga                             `docs/planejamento/dados/cadernos/*.json` (tipo, trilha, classeBase, secoes[].requisitos[]) · `docs/planejamento/dados/especialidades.json` (areas[].codigo, especialidades[], mestrados[])
- regras das telas                           `docs/planejamento/BACKLOG.md` (F1–F4, C2, A1–A3)
- tokens visuais                             `docs/design/tokens.css`
- conferido em                               `desbravadores@3770614`
