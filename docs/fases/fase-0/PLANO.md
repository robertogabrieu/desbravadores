# Fase 0 — Fundação · Plano de implementação

**Spec:** [SPEC.md](SPEC.md) + [anexos/](anexos/) · **Branch:** `feature/fase-0-fundacao` ·
**Commit-base:** `main@3770614` · **Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-0` ·
**PR:** a desta branch, em rascunho

Vocabulário da skill `orquestrador`: **sessão**, **agente principal** (o orquestrador),
**subagente** (`implementador`, `testador`, `saneador`, `investigador`, `documentador`, `gestor-pr`).

## 1. Regras de execução (valem para todo pacote)

- O principal não escreve código de produção nem de teste, **exceto** os arquivos de dono
  compartilhado da onda 2 (copiados dos anexos) e o registro de módulos no fim da onda 3. Não lê
  saída de suíte. Versiona pela skill `commit` ao fim de cada onda.
- Cada pacote é do `implementador` (modelo sonnet), em **TDD com a bateria inteira do pacote
  escrita antes** (a coluna "Pacote" da SPEC §11). Ele delega suíte ao `testador` e roda só os
  testes do próprio pacote.
- **Nenhum subagente roda git.** Push só pelo `gestor-pr`, uma vez, no fim da fase.
- Todo briefing segue `~/.claude/skills/orquestrador/references/briefing-template.md`, repete
  worktree, branch e **commit da onda anterior**, e copia a linha do pacote na tabela §3.1 para
  PODE TOCAR / NÃO TOCAR.
- Revisão de cada pacote com modelo capaz (opus), nunca haiku. No laço de revisão, conserta-se só
  achado **médio ou maior**; o resto vira pendência.
- Decisão que a SPEC não cobre: o implementador **para e devolve em PENDÊNCIAS**. Dependência que
  falta no `package.json`: idem (D2) — o principal instala.
- Ferramenta que falta na máquina (docker, age, rclone, pg_dump, chromium do Playwright): o pacote
  devolve em PENDÊNCIAS com o comando; não pula nem simula.
- Teto de ~80 turnos por pacote; bateu com metade feita, entrega a fatia que fecha com teste.

## 2. A conta do fatiamento

~115 arquivos alterados na fase. Ótimo medido: 6–10 por pacote (spec-e-plano §3).

| Arranjo | Pacotes | Custo relativo |
|---|---|---|
| Um pacote por camada (api / web / infra) | 3 de ~38 | ~2× (releitura) |
| **Um pacote por fluxo, 8–15 arquivos** | **10** | **1× (alvo)** |
| Um pacote por tela/endpoint | ~30 de 3–4 | ~2,3× (piso repetido) |

## 3. Ondas e pacotes

Pacotes da mesma onda rodam **em paralelo** (no máximo 3): arquivos disjuntos (§3.1) e banco de
teste próprio por execução (SPEC D11).

### Onda 1 — esqueleto [subagente, sozinho]

**P1 · Esqueleto do monorepo.** Raiz (workspaces, scripts `dev, lint, tipos, teste, teste:e2e,
build`, `.nvmrc`, `engines`, `tsconfig.base.json`, `eslint.config.mjs` com `no-explicit-any` e
`no-unsafe-*` como erro, `.editorconfig`, `.gitignore` com `src/generated`, `.env.exemplo` da SPEC
§10.1), `docker-compose.yml` (postgres 17 em 5442 com usuário `desbravador` e `postgres` com
CREATEDB, mailpit 1026/8026), **todas as dependências da SPEC §3 instaladas e fixadas**,
`apps/api` mínimo (Nest com `GET /api/saude` `@Publica` provisório, `prisma.config.ts`, schema com
só `generator` e `datasource`, `postinstall` com `prisma generate`), `apps/web` mínimo (Vite +
React, proxy `/api`), `packages/shared` com `index.ts`, harness de teste da API
(`global-setup.ts`/`global-teardown.ts` da D11 e `teste:limpar`), Vitest no `shared` e no `web`,
`playwright.config.ts` headless, `.github/workflows/ci.yml` (serviço Postgres, `npm ci`, lint,
tipos, teste, build; e2e **não** entra no CI desta fase).
**Pronto quando:** `docker compose up -d && npm ci && npm run lint && npm run tipos && npm run teste && npm run build`
passa na raiz de um checkout limpo; o harness cria e apaga o banco (prova com `SELECT 1`); dois
`npm run teste -w api` simultâneos passam os dois.
O principal anota na SPEC §3 as versões escolhidas para os pacotes "última estável" e commita.

### Onda 2 — contratos [agente principal, inline]

Copia dos anexos, sem alterar: `anexos/schema.prisma` → `apps/api/prisma/schema.prisma` e gera a
migration `fase0_fundacao`; `anexos/contratos.ts` → `packages/shared/src/enums.ts` e
`contratos/*.ts` (um arquivo por bloco `ARQUIVO:`, acrescentando só os `import` entre arquivos). Escreve `permissoes.ts` (catálogo da SPEC §6.1
e `permissoesEfetivas`) com o teste; `apps/web/src/rotas.tsx` com as rotas da SPEC §8.3 apontando
para componentes-placeholder por módulo; `CLAUDE.md` da SPEC §12.
**Pronto quando:** `npm run tipos` passa; `prisma migrate dev` aplica num banco vazio; o SQL da
migration contém os 3 índices parciais e as 5 chaves compostas; o teste de `permissoesEfetivas`
passa. `testador` colhe o **baseline por nomes**. Commit da onda.

### Onda 3 — bases [3 subagentes em paralelo]

**P2 · Fórmulas do shared** — `formulas/*`, `datas.ts`, com as tabelas da SPEC §7.
**P3 · Base da API** — `comum/prisma` (serviço + guarda da SPEC §6.3 + teste); `ZodValidationPipe`;
filtro de erro (`ErroApi`); `GuardaSessao`, `GuardaPermissao`, `@Publica/@Logado/@Pode`, o teste
de varredura de rotas; `sessao/` (emitir/verificar access token com `JWT_SEGREDO`; gerar/hashear/
validar token de uso único; criar/rotacionar/revogar família de refresh com a tolerância de 30 s);
`email/` (`ServicoEmail`, SMTP e falso); `test/fabricas.ts` (clube já com `clube:criar`, usuário
com senha argon2, vínculo com unidades/classes, unidade, DBV, matrícula, **sessão assinada direto**),
`test/isolamento.ts` (`testarIsolamento`); `scripts/carga.ts` (SPEC §5.3) e
`scripts/clube-criar.ts` (§5.2) com os testes; `email/modelos.ts` com os três textos da SPEC §9.2; o `PrismaSistema` e a regra de
lint que o restringe; e acrescenta a carga ao `global-setup.ts` do P1.
**P4 · Base do front** — `ui/` (tokens, tema `@theme inline`, componentes: Botão, Campo, Seleção,
Caixa de marcação, Cartão, Folha lateral, Tabela com paginação, Faixa de aviso, Estado vazio, Menu
do cabeçalho), `LayoutCelular` e `LayoutAdm` (SPEC §8.2), `api/cliente.ts` (SPEC §8.4, com Web
Locks), `sessao/` (contexto, papel ativo, guarda de rota, redirecionamentos de `/`), página 404,
PWA (SPEC §8.5: `sw.ts`, manifesto, `public/icone.svg`, ícones gerados). E os **hooks de leitura
usados por mais de uma tela** em `api/leitura.ts` (`useClasses`, `useUnidades`, `useUsuariosResumo`,
`useCatalogoPermissoes`) com os handlers msw — P8 e P9 só escrevem as mutações do seu módulo.

**Fim da onda 3 [principal]:** registra em `app.module.ts` os módulos `auth, usuarios,
desbravadores, unidades, classes, especialidades, permissoes` vazios, e liga em `rotas.tsx` os
layouts, a guarda de rota, o redirecionamento de `/` e a 404 do P4, para os pacotes seguintes só
preencherem as pastas deles. Commit da onda.

### Onda 4 — fluxos [3 subagentes em paralelo]

**P5 · Autenticação na API** — `auth/` (todas as rotas `/api/auth/*` e `/api/eu` da SPEC §9),
limites de taxa (§9.1), e-mails (§9.2), testes de auth e de isolamento das suas rotas.
**P6 · Cadastros na API** — `desbravadores/, unidades/, usuarios/, classes/, especialidades/,
permissoes/` com escopo (SPEC §6.2), avisos, último Adm, usuário global (D21); testes de
permissões, escopo, matrícula e isolamento das suas rotas.
**P7 · Telas de acesso** — `modulos/acesso/` (login, definir senha, esqueci, redefinir, papel) e
`modulos/inicio/` (início provisório + convite de instalação), com `api/auth.ts` e os handlers msw.

### Onda 5 — telas de cadastro e ida ao ar [3 subagentes em paralelo]

**P8 · Adm: Desbravadores e Unidades** — A1 e A3 da SPEC §8.3, com `api/desbravadores.ts`,
`api/unidades.ts` e handlers.
**P9 · Adm: Usuários + Minha unidade** — A2 e C2 da SPEC §8.3, com `api/usuarios.ts` e handlers.
**P10 · Ida ao ar** — Dockerfiles (api com `prisma` CLI e `/app/dados`; web com nginx e CSP),
`docker-compose.prod.yml`, `scripts/*` (SPEC §10.2) com o teste local de backup/restauração, e o
**Playwright ponta a ponta** da SPEC §11 (`globalSetup` próprio que cria o banco, sobe a API e o `vite preview` do build em portas livres,
e os derruba no fim; convite lido na API do Mailpit).

### Onda 6 — fechamento [agente principal]

1. `testador`: `npm run lint && npm run tipos && npm run teste && npm run teste:e2e`, comparado ao
   baseline por nomes. Falhas → **um** `saneador` com o dossiê.
2. Revisão da PR inteira (`code-review`, opus) até nenhum achado médio ou maior (máx. 3 rodadas).
3. `qa-runner`, headless, com o roteiro do §4.
4. `documentador`: README (subir, testar, carga, criar clube, deploy, backup e restauração).
5. Principal: registra D12 em `docs/planejamento/MODELO-DE-DADOS.md` §3 e D21 em `ARQUITETURA.md` §4.
6. `gestor-pr`: push único; a PR sai do rascunho só com CI verde e revisão limpa.

### 3.1 Quem toca o quê

| Pacote | PODE TOCAR | NÃO TOCAR (além dos arquivos de dono compartilhado — SPEC §4) |
|---|---|---|
| P1 | tudo (é o esqueleto) | `docs/` |
| P2 | `packages/shared/src/formulas/**`, `packages/shared/src/datas.ts` e testes | `apps/**` |
| P3 | `apps/api/src/{comum,sessao,email,scripts}/**`, `apps/api/test/**`, `apps/api/src/main.ts`, **`apps/api/src/app.module.ts`** (exceção: registra os módulos comuns e os guards globais — nenhum outro pacote da onda toca a API) | `apps/api/src/{auth,usuarios,desbravadores,unidades,classes,especialidades,permissoes}/**`, `apps/web/**` |
| P4 | `apps/web/src/{ui,layouts,sessao,api/cliente.ts,api/leitura.ts,sw.ts,main.tsx}`, `apps/web/src/testes/handlers/leitura.ts`, `apps/web/public/**`, `apps/web/vite.config.ts`, `apps/web/src/modulos/erro/**` | `apps/web/src/modulos/{acesso,inicio,unidade,adm}/**`, `apps/api/**` |
| P5 | `apps/api/src/auth/**` e seus testes | demais módulos da API, `sessao/` e `email/` (usa, não altera) |
| P6 | `apps/api/src/{usuarios,desbravadores,unidades,classes,especialidades,permissoes}/**` e testes | `auth/`, `sessao/`, `email/` |
| P7 | `apps/web/src/modulos/{acesso,inicio}/**`, `apps/web/src/api/auth.ts`, `apps/web/src/testes/handlers/auth.ts` | `ui/`, `layouts/`, `sessao/` (usa, não altera) |
| P8 | `apps/web/src/modulos/adm/{desbravadores,unidades}/**`, `api/{desbravadores,unidades}.ts`, handlers correspondentes | idem P7, e `api/leitura.ts` (usa, não altera) |
| P9 | `apps/web/src/modulos/adm/usuarios/**`, `apps/web/src/modulos/unidade/**`, `api/usuarios.ts`, handlers correspondentes | idem P8 |
| P10 | `apps/*/Dockerfile`, `apps/web/nginx.conf`, `docker-compose.prod.yml`, `scripts/**`, `e2e/**` | código de produção de `apps/**` |

Precisou mudar algo fora da própria linha (um componente de `ui/`, a guarda, o cliente HTTP)?
Devolve em PENDÊNCIAS com a mudança proposta; o principal decide e aplica entre ondas.

## 4. Critério de pronto da fase (comandos)

1. `npm ci && npm run lint && npm run tipos && npm run teste && npm run build` — verde num checkout limpo.
2. `npm run teste:e2e` — o cenário ponta a ponta da SPEC §11 passa (convite pelo Mailpit,
   conselheiro vê só a própria unidade, manifesto e service worker registrados).
3. `npm run carga -w api` duas vezes num banco novo: a segunda imprime 0 / 0 / 0.
4. `scripts/backup.sh` seguido de `scripts/restaurar.sh` num banco novo, com o remoto local: a
   API apontada para o banco restaurado responde `GET /api/saude` com `banco: true` e lista os
   mesmos desbravadores.
5. Revisão da PR sem achado médio ou maior aberto.

## 5. Como paralelizar sem perder qualidade

**Dentro da fase** (este plano):
- **Contratos antes do paralelo.** Schema, contratos, permissões e rotas estão nos anexos
  revisados; o orquestrador só os copia na onda 2. Nenhum agente decide o formato de um dado.
- **Até 3 implementadores** por onda, com arquivos disjuntos (§3.1). Mais que isso a máquina (WSL
  com pouca memória) e a revisão não acompanham.
- **Banco de teste por execução** (D11): testadores de pacotes diferentes rodam juntos.
- **Dependências todas no P1** (D2): ninguém disputa o `package-lock.json`.
- **Peças de uso comum antes de quem usa**: sessão, tokens, e-mail e fábricas de teste nascem no
  P3, uma onda antes de P5 e P6.

**Entre fases** (o maior ganho de prazo):

| Quando | Em paralelo | Condição |
|---|---|---|
| Fase 0 mergeada | Fase 1 começa pelo **núcleo offline** (fila de envio, pacote do domingo, rotas `/sync`) numa PR pequena | Fases 1, 2 e 3 dependem dele |
| Núcleo offline mergeado | **Fase 1** (resto) · **Fase 2** (Instrutor) · **Fase 3** (Adm: calendário e cronograma) — até 3 sessões, cada uma com worktree e PR próprias | O plano de cada uma é escrito **depois** desse merge, apontando para código que existe |
| Fases 1–3 mergeadas | **Fase 4** (ranking e relatórios) | Precisa dos lançamentos de pontos das três |

Regras para as sessões paralelas não colidirem:
- **Schema serializado**: cada fase tem a sua migration; quem mergeia depois faz *rebase*, apaga
  a própria migration e a **gera de novo** sobre a `main`.
- `rotas.tsx` e `app.module.ts` importam **um arquivo por módulo**: fases diferentes não editam a
  mesma linha.
- PR só mergeia com CI verde **depois do rebase** na `main` do momento.
- O gargalo passa a ser a sua revisão: três PRs ao mesmo tempo é o teto útil.

**O que não se paraleliza:** decisão de produto em aberto (resolve-se antes da fase), a revisão
final de cada PR e a Fase 4.

## 6. O que NÃO quebra

Repositório sem código anterior. `docs/design/` não muda. `docs/planejamento/` só ganha as notas
D12 e D21 na onda 6.

## 7. Comando para a sessão que vai executar

Numa **sessão nova** do Claude Code aberta em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 0 do Aplicativo do Desbravador.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/fase-0 · branch
feature/fase-0-fundacao · commit-base main@3770614 · continue nesta branch e na PR em rascunho
que já existe; não crie outras.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-0/PLANO.md e docs/fases/fase-0/SPEC.md (na
worktree). Os anexos (docs/fases/fase-0/anexos/) são contrato literal: copie, não reescreva.
Referência de padrões: /home/robertogabrieu/desbravadores-finance@c7d82a5 (ONDE FICA da SPEC) —
consultar, não copiar às cegas.

ANTES DA ONDA 1: confira `docker compose version` e que as portas 5442, 1026 e 8026 estão livres.
Faltando algo, pare e me diga — não siga sem banco.

DECISÕES TRAVADAS (não reabrir): as D1–D24 da SPEC §2. Em especial: guarda de clube sem exceção;
usuário global; refresh com rotação, tolerância de 30 s e validade absoluta; access token só em
memória; banco de teste por execução; carga fora do deploy automático; dependências todas no P1.

FORA DE ESCOPO: SPEC §1 "Fora da Fase 0". Nada "de passagem".

EXECUÇÃO: ondas 1 a 6 do PLANO §3, na ordem; paralelo só dentro da onda, no máximo 3
implementadores (sonnet), com PODE/NÃO TOCAR do PLANO §3.1; onda 2 e o registro de módulos são
seus. Revisões com opus. Commit por onda (skill commit). Push e saída do rascunho só pelo
gestor-pr, no fim.

GATE: PLANO §4, os 5 itens.

RETORNO: relatório de fechamento da skill orquestrador (FEITO / SUÍTE / DOCS / PENDÊNCIAS / PR),
com toda decisão que a SPEC não cobria em PENDÊNCIAS.
```
