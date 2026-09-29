# Fase 1 — Conselheiro · Plano de implementação

**Spec:** [SPEC.md](SPEC.md) + [anexos/](anexos/) · **Base:** `main@3de43f2`
**1a:** branch `feature/fase-1-conselheiro` (esta), worktree `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-1`, PR em rascunho desta branch
**1b:** branch `feature/fase-1b-domingo`, criada da `main` **depois do merge da 1a**, com PR própria

Briefing de cada implementador: `~/.claude/skills/orquestrador/references/briefing-template.md`,
com a linha do pacote na tabela §3 em PODE/NÃO TOCAR e as linhas de teste da SPEC §7 do pacote.
PENDÊNCIAS: uma linha cada, no relatório de fechamento e como comentário na PR.

Vocabulário e regras de execução: iguais ao [PLANO da Fase 0 §1](../fase-0/PLANO.md) — o
principal não escreve código fora dos arquivos de dono compartilhado; implementador (sonnet) em
TDD com a bateria do pacote escrita antes; revisão com opus; nenhum subagente roda git; decisão
fora da spec vai para PENDÊNCIAS; dependência ou ferramenta faltando também; teto de ~80 turnos;
no máximo 3 implementadores por onda; conserta-se na revisão só achado médio ou maior.

**Arquivos de dono compartilhado** (só o principal): `schema.prisma` e migrations,
`guarda-clube.ts` (lista de modelos), `packages/shared/src/{enums,index}.ts` e `contratos/*`,
`apps/web/src/rotas.tsx`, `apps/api/src/app.module.ts`, `package.json`/lock, `.env.exemplo`,
`CLAUDE.md`, `ci.yml`, e — nesta fase — `apps/web/src/offline/tipos.ts` (contrato da fila).

## 1. A conta do fatiamento

| Parte | Arquivos alterados (estim.) | Pacotes | Média |
|---|---|---|---|
| 1a | ~45 | onda 0 + 4 pacotes | ~10 |
| 1b | ~75 | 8 pacotes | ~9 |

Dentro da faixa ótima (6–10 por pacote, [spec-e-plano §3]). Não juntar nem fatiar mais fino.

## 2. PR 1a — Núcleo offline

### Onda 0 [principal, inline]

1. Instala `dexie`, `fake-indexeddb` (web, dev), `workbox-strategies`, `workbox-expiration`,
   `workbox-cacheable-response` (web, 7.4.1), `sharp`, `multer`, `@types/multer` (api); anota as
   versões na SPEC §3.
2. Copia `anexos/schema.prisma` → `apps/api/prisma/schema.prisma`; `prisma migrate dev --name
   fase1_conselheiro`; confere que o SQL não tem DROP e contém os 3 índices parciais novos.
3. Acrescenta os 9 modelos à `MODELOS_DE_CLUBE` (SPEC E3).
4. Copia `anexos/contratos.ts` para `packages/shared/src/` (enums + `contratos/{reunioes,sync,fotos,
   ranking,perfil,inicio,pedidos}.ts`; `MembroSaida.frequencia` opcional; `TEMPORARIO` em
   `CODIGOS_ERRO` e 503 em `apps/api/src/comum/erros.ts`) e exporta no `index.ts`;
   `formulas/situacao.ts` passa a derivar o tipo de `SITUACOES_CHAMADA`. Acrescenta
   `pontosPorCriterio` com teste e faz `pontosDaChamada` somá-la (SPEC §5.3) — os testes atuais
   de `pontosDaChamada` precisam continuar verdes.
5. Escreve `apps/web/src/offline/tipos.ts` com **exatamente** as assinaturas da SPEC §4.3
   (`ItemFila`, `TipoFila`, `registrarTipo`, `enfileirar`, `useFila`, `itensDaChave`,
   `useConexao`, `useModoSessao`, `limparDadosDoUsuario`) — A2 implementa, A3 e a 1b consomem.
6. Registra em `app.module.ts` os módulos vazios `sync`, `pontos`, `arquivos`; `.env.exemplo`
   com `ARQUIVOS_DIR`, `ARQUIVOS_SEGREDO`; `CLAUDE.md` (SPEC §8).

**Pronto quando:** `npm run tipos` passa; `prisma migrate dev` aplica; testes existentes verdes.
`testador` colhe o **baseline por nomes**. Commit.

### Onda 1 [3 subagentes em paralelo]

**A1 · API do núcleo** — `sync/` (`GET /sync/pacote`, SPEC §4.2), `pontos/` (`ServicoPontos`,
§5.3), `arquivos/` (`Armazenamento` em disco, `ServicoArquivos` com URL assinada,
`GET /arquivos/:id`, §4.5); `ARQUIVOS_DIR` temporário no `globalSetup`/`globalTeardown` do Jest;
em `test/fabricas.ts` **todas** as fábricas que a 1b vai usar: `criarMembro({ dbvId, unidadeId,
inicio, fim? })`, `configurarClube({ clubeId, ...ConfiguracaoClube })`, `criterioPorGatilho(clubeId,
gatilho)`, `criarReuniao({ unidadeId, data, chamada: linhas[] })`, `criarLancamento(...)`,
`criarArquivo(...)`, `criarAlbum(...)`, `criarFoto(...)`; `test/isolamento.ts` aceita corpo
multipart (`anexos`). Testes da SPEC §7 marcados 1a-A1.
**A2 · Motor offline do front** — `offline/` (banco Dexie E5, motor da fila §4.3, `useConexao`,
identidade e pacote guardados, download do pacote §4.2, `limparDadosDoUsuario`), abertura sem
internet (§4.1) em `sessao/` e `api/cliente.ts` (rede × sessão recusada, E4), rota `/conectar`,
handlers msw de `auth/refresh` e `sync/pacote`. Testes 1a-A2.
**A3 · Interface do núcleo** — componentes novos de `ui/` (§4.4), faixa "Sem conexão" nos dois
layouts, selo da fila, tela `/fila` em `modulos/fila/`, confirmação ao sair no `MenuCabecalho`.
Programa contra `offline/tipos.ts` (com implementação falsa nos testes). Testes 1a-A3.

**Fim da onda [principal]:** liga `/fila` e `/conectar` em `rotas.tsx`. Commit.

### Onda 2 [1 subagente]

**A4 · Ida ao ar e ponta a ponta** — `nginx.conf` (E19, os 4 blocos de CSP), `docker-compose.prod.yml`
(volume `arquivos`, `ARQUIVOS_DIR`/`ARQUIVOS_SEGREDO` no serviço `api`, 384 MB), `Dockerfile` da
API (`mkdir`+`chown node` em `/app/arquivos`; `sharp` pelo binário musl do npm, `npm ci` dentro da
imagem), `scripts/deploy.sh` (gera `ARQUIVOS_SEGREDO`), `scripts/backup.sh`/`restaurar.sh` incluem
`ARQUIVOS_DIR`, cache de fontes no `sw.ts` (E20), o teste do `grep` de CSP (SPEC §10), `ARQUIVOS_DIR`
temporário no `global-setup` do e2e, e o **e2e 1a** (SPEC §7). Pronto inclui `docker build` da API e
`require('sharp')` dentro da imagem.

### Onda 3 — fechamento 1a [principal]

Igual ao PLANO da Fase 0 §3 onda 6: suíte inteira contra o baseline (falhas → um `saneador`),
revisão da PR (opus, até limpa, máx. 3 rodadas), `documentador` (README: offline, fila, arquivos),
`gestor-pr` sobe e tira do rascunho.

**Critério de pronto da 1a:**
0. Se a `main` avançou com outra migration desde a base, a `fase1_conselheiro` foi **apagada e
   gerada de novo** sobre a `main` antes do merge.
1. `npm ci && npm run lint && npm run tipos && npm run teste && npm run build` verde.
2. `npm run teste:e2e` — o cenário da Fase 0 e o da 1a (recarregar sem rede abre o app).
3. Fila: os testes de §7 (1a-A2) cobrem substituição, backoff, erro, 401 e descarte.
4. `GET /arquivos/:id` com assinatura vencida → 403 (teste).
5. Revisão limpa.

## 3. Quem toca o quê

| Pacote | PODE TOCAR | NÃO TOCAR (além dos de dono compartilhado) |
|---|---|---|
| A1 | `apps/api/src/{sync,pontos,arquivos}/**`, `apps/api/test/fabricas.ts` | demais módulos da API, `apps/web/**` |
| A2 | `apps/web/src/offline/**` (menos `tipos.ts`), `apps/web/src/sessao/**`, `apps/web/src/api/cliente.ts`, `apps/web/src/main.tsx`, `apps/web/src/modulos/conectar/**`, testes | `ui/`, `layouts/`, demais `modulos/**` |
| A3 | `apps/web/src/ui/**`, `apps/web/src/layouts/**`, `apps/web/src/modulos/fila/**`, testes | `offline/`, `sessao/`, `api/` |
| A4 | `apps/web/nginx.conf`, `apps/web/src/sw.ts`, `docker-compose.prod.yml`, `apps/*/Dockerfile`, `scripts/**`, `e2e/**` | código de `apps/**/src` fora do `sw.ts` |
| B1 | `apps/api/src/reunioes/**`, `apps/api/src/unidades/**` (só `membros` com frequência e a rota de grade) | `sync/pacote`, `pontos/` (usa, não altera) |
| B2 | `apps/api/src/{ranking,inicio}/**`, `apps/api/src/desbravadores/perfil.*` | `reunioes/`, `fotos/` |
| B3 | `apps/api/src/{fotos,pedidos}/**`, `apps/api/src/email/modelos.ts` (acrescenta `emailPedidoUnidadeSemDbv`) | `arquivos/` (usa, não altera) |
| B4 | `apps/web/src/modulos/reunioes/{chamada,*.Chamada*}/**`, `apps/web/src/offline/tipos/reuniao.ts`, `api/reunioes.ts` (mutação), handlers | `offline/` (motor) |
| B5 | `apps/web/src/modulos/reunioes/{historico,detalhe}/**`, `apps/web/src/modulos/unidade/**`, `api/reunioes.ts` (leituras), `api/pedidos.ts`, `api/unidades.ts` (só a leitura de membros com frequência), handlers | chamada (B4) |
| B6 | `apps/web/src/modulos/{inicio,perfil,ranking}/**`, `api/{inicio,perfil,ranking}.ts`, `layouts/LayoutCelular.tsx` e o menu do Adm (só habilitar itens), handlers | `ui/` |
| B7 | `apps/web/src/modulos/galeria/**`, `apps/web/src/offline/tipos/foto.ts`, `api/fotos.ts`, handlers | `offline/` (motor) |
| B8 | `e2e/**` | `apps/**` |

B4 e B5 dividem `api/reunioes.ts`: **o principal o cria na onda 0 da 1b** com estas assinaturas
e chaves, e cada um preenche só o seu bloco:
`useReunioes(unidadeId, mes)` → `['reunioes', unidadeId, mes]` (B5) · `useReuniao(id)` →
`['reuniao', id]` (B5, B4 lê para editar) · `useGradeFrequencia(unidadeId)` → `['grade', unidadeId]`
(B5) · `useSalvarChamada()` → enfileira `REUNIAO` (B4). A invalidação depois do envio é do
`aoEnviar` do tipo `REUNIAO` (B4), pelas raízes `reunioes`, `reuniao`, `grade`, `inicio`, `ranking`.
B7 descobre a chamada de hoje por `itensDaChave('<unidadeId>:<hoje>')` e pela lista do servidor.
B3 converte o erro do multer em 422 no próprio controller.

## 4. PR 1b — O domingo do conselheiro

### Onda 0 [principal]

1. Branch `feature/fase-1b-domingo` da `main` atualizada (com a 1a). Worktree própria.
2. **Atualiza o ONDE FICA** desta spec (commit na branch da 1b) com o código da 1a: manda o `investigador` levantar
   `arquivo:linha` de `offline/tipos.ts`, `registrarTipo`, `enfileirar`, `useConexao`,
   `ServicoPontos.sincronizar`, `ServicoArquivos.urlAssinada`, fábricas novas, componentes novos de
   `ui/`. Commita o bloco na SPEC.
3. Registra os módulos `reunioes, ranking, inicio, fotos, pedidos` em `app.module.ts`; cria
   `api/reunioes.ts` com os blocos vazios; liga as rotas de §6 em `rotas.tsx` (placeholders).
4. Baseline por nomes. Commit.

### Onda 1 [3 subagentes] — API

**B1 · Reuniões e chamada** — `PUT /sync/reunioes/:uuid` (SPEC §5.1–5.2), `GET /reunioes`,
`GET /reunioes/:id`, `GET /unidades/:id/frequencia`, frequência em `GET /unidades/:id/membros`.
**B2 · Ranking, perfil e início** — `GET /ranking`, `/ranking/unidades`, `GET /desbravadores/:id/perfil`,
`GET /inicio/conselheiro` (SPEC E14, E15).
**B3 · Fotos e pedido ao Adm** — `PUT /sync/fotos/:uuid`, `GET /albuns`, `/albuns/:id`,
`DELETE /fotos/:id`, `GET /unidades/:id/sem-autorizacao-imagem`, `POST /pedidos-ao-adm`.

### Onda 2 [3 subagentes] — telas

**B4 · Chamada** — tela nova/edição com rascunho, pontos provisórios, tipo `REUNIAO` da fila.
**B5 · Histórico, detalhe e Minha unidade** — `/reunioes`, `/reunioes/:id`, `/unidade` com frequência
e "Avisar o Adm".
**B6 · Início, perfil e ranking** — `/inicio` do conselheiro, `/dbv/:id`, `/ranking`, habilitar itens
da navegação.

### Onda 3 [2 subagentes]

**B7 · Galeria e envio** — `/galeria`, `/galeria/:albumId` (com tela cheia), `/galeria/enviar`,
redução no aparelho, tipo `FOTO` da fila.
**B8 · Ponta a ponta do domingo** — e2e 1b da SPEC §7.

### Onda 4 — fechamento 1b [principal]

Como a onda 3 da 1a, mais `qa-runner` headless com roteiro tirado das linhas da tabela §6 da SPEC.

**Critério de pronto da 1b:** lint/tipos/teste/build verdes; e2e (Fase 0 + 1a + 1b) verde;
revisão limpa; QA sem item FALHOU; e o **piloto** fica pronto para começar (roadmap: 2 unidades,
3 domingos) — isso é uso, não gate da PR.

## 5. Paralelo entre fases

Com a **1a mesclada**, podem começar em sessões próprias, cada uma com spec e plano escritos
depois desse merge: **1b** (este plano), **Fase 2** (Instrutor: registra o tipo `AULA` na fila, usa
`ServicoPontos` para requisitos e `Armazenamento` para materiais) e **Fase 3** (Adm: calendário e
cronograma). Regras: schema serializado (quem mergeia depois refaz a própria migration sobre a
`main`), PR só mergeia depois de rebase e CI verde, e no máximo três PRs abertas ao mesmo tempo.

## 6. Comandos para as sessões que executam

**1a** — sessão nova do Claude Code em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a PARTE 1a (núcleo offline) da Fase 1.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/fase-1 · branch
feature/fase-1-conselheiro · commit-base main@3de43f2 · continue nesta branch e na PR em rascunho
que já existe.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-1/PLANO.md e docs/fases/fase-1/SPEC.md. A spec
da Fase 0 (docs/fases/fase-0/SPEC.md) continua valendo onde esta não a altera — consulte por seção.
Anexos de docs/fases/fase-1/anexos/ são contrato literal: copie, não reescreva.

DECISÕES TRAVADAS: E1–E22 da SPEC §2, mais D1–D24 da Fase 0.
FORA DE ESCOPO: tudo da parte 1b (SPEC §1 e §5–6) e o "Fora da Fase 1". Nada de passagem.

EXECUÇÃO: PLANO §2, ondas 0 a 3; PODE/NÃO TOCAR do PLANO §3; no máximo 3 implementadores
(sonnet); revisões com opus; commit por onda; push e saída do rascunho só pelo gestor-pr no fim.
GATE: critério de pronto da 1a (PLANO §2).
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```

**1b** — só depois do merge da 1a; sessão nova em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a PARTE 1b (domingo do conselheiro) da Fase 1.

ONDE: crie a branch feature/fase-1b-domingo a partir da main atualizada (já com a 1a) numa
worktree nova em /home/robertogabrieu/desbravadores/.claude/worktrees/fase-1b, e abra a PR em
rascunho dela no fim da onda 0.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-1/PLANO.md e docs/fases/fase-1/SPEC.md (na
main). A spec da Fase 0 vale onde esta não a altera.

DECISÕES TRAVADAS: E1–E22 da SPEC §2, mais D1–D24 da Fase 0.
FORA DE ESCOPO: "Fora da Fase 1" (SPEC §1). Não altere o schema (E2).

EXECUÇÃO: PLANO §4, ondas 0 a 4 — a onda 0 começa atualizando o ONDE FICA com o código da 1a
pelo investigador. PODE/NÃO TOCAR do PLANO §3; no máximo 3 implementadores (sonnet); revisões
com opus; commit por onda; push só pelo gestor-pr no fim.
GATE: critério de pronto da 1b (PLANO §4).
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```
