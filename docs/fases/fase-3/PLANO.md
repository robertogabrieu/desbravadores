# Fase 3 — Adm · Plano

**Spec:** [SPEC.md](SPEC.md) · **Branch:** `feature/fase-3-adm`, da `main` com a 1b e a base 2·3 ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-3` · PR própria em rascunho
· a **Fase 2 pode estar rodando em paralelo**

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md) (cabeçalho e §1). Suíte: no máximo
1 completa por vez nesta sessão, com as flags de pouca memória do Jest. **Não altere o schema nem
código da 1b, da base ou da Fase 2.**

**Arquivos de dono compartilhado** (só o principal): `app.module.ts`, `rotas.tsx`,
`packages/shared/**`, `package.json`/lock, `CLAUDE.md`, `apps/web/src/layouts/LayoutAdm.tsx`,
`apps/api/test/fabricas.ts`.

## Conta

~65 arquivos alterados em 7 pacotes (~9 cada).

## Ondas

**Onda 0 [principal]:**
1. Conferir: `git log --oneline main` tem o merge da 1b **e** o da base; senão, pare e avise.
2. Investigador atualiza o ONDE FICA da SPEC (§6) — commit.
3. `app.module.ts`: módulos `visao-geral`, `clube` e os controllers novos de `calendario` (escrita),
   `cronogramas` (montagem) e `especialidades` (clube); `rotas.tsx`: rotas do §4; `LayoutAdm`:
   habilita os itens (só `para`) e acrescenta "Configurações do clube".
4. Fábricas: as da base cobrem evento, cronograma, publicação, registro de aula e conclusões;
   acrescentar só o que o §5 pedir e a base não tiver, com nome que a Fase 2 não use (prefixo
   `adm`).
5. Baseline por nomes. Commit.

| Pacote | PODE TOCAR | NÃO TOCAR (além dos compartilhados) |
|---|---|---|
| A1 · Calendário | `apps/api/src/calendario/eventos.*` (novo: controller e serviço de escrita) | a leitura da base em `calendario/`; `cronogramas/` (usa `emConflito`, `instrutoresDaClasse`, não altera) |
| A2 · Montagem | `apps/api/src/cronogramas/montagem/**` (novo) | a leitura da base em `cronogramas/` (usa) |
| A3 · Classes, visão geral, configurações | `apps/api/src/{visao-geral,clube}/**`; `apps/api/src/classes/ajustes.*` (novo); `apps/api/src/classes/classes.service.ts` (**só acrescentar** `oficial`/`ajustado` na resposta de `GET /classes/:id`); `apps/api/src/especialidades/especialidades-clube.*` (novo) | `especialidades-dbv.*` (Fase 2); controllers existentes de `classes/` e `especialidades/` |
| B1 · Calendário e configurações | `apps/web/src/modulos/adm/{calendario,configuracoes}/**`, `api/{calendario,clube}.ts`, handlers | — |
| B2 · Montagem | `apps/web/src/modulos/cronograma-montagem/**` (substitui o "Em breve"), `api/montagem.ts`, handlers | `modulos/cronograma/` (Fase 2) |
| B3 · Visão geral e classes | `apps/web/src/modulos/adm/{visao-geral,classes}/**`, `api/{visao-geral,classes-adm}.ts`, handlers | `api/leitura.ts` (usa; invalida a chave `classes` depois de um ajuste) |
| B4 · e2e | `e2e/adm.spec.ts` (semeia por `e2e/apoio/semear.ts`) | `e2e/global-setup.ts`, `e2e/apoio/**` |

A1–A3 na onda 1; B1–B3 na onda 2; B4 na onda 3.

**Onda 4 — fechamento:** suíte inteira contra o baseline; revisão (opus) até limpa; `qa-runner`
headless com **um item por linha da tabela do SPEC §4**; `documentador`; `gestor-pr` tira do
rascunho. Se a Fase 2 mesclou antes: rebase, resolver só acréscimos, suíte de novo.

**Pronto:** `npm ci && npm run lint && npm run tipos && npm run teste && npm run build` verdes;
`npm run teste:e2e` verde; revisão limpa; QA sem FALHOU.

## Comando

Sessão nova em `/home/robertogabrieu/desbravadores`, **depois do merge da 1b e da base 2·3**:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 3 (Adm).

ONDE: crie a branch feature/fase-3-adm a partir da main atualizada (com a 1b e a base 2·3) numa
worktree nova em /home/robertogabrieu/desbravadores/.claude/worktrees/fase-3 e abra a PR em rascunho
no fim da onda 0.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-3/PLANO.md, docs/fases/fase-3/SPEC.md e
docs/fases/fase-2-3/SPEC.md. As specs das Fases 0 e 1 valem onde estas não alteram.

DECISÕES TRAVADAS: G1–G12 (Fase 3), B1–B12 (base), E1–E22 (Fase 1), D1–D24 (Fase 0).
FORA DE ESCOPO: SPEC §1 "Fora da Fase 3". Não altere o schema nem código da 1b, da base ou da
Fase 2 (que pode estar rodando): aulas/, progresso/, observacoes/, materiais/, instrutor/,
especialidades-dbv.*, modulos/{aulas,classes,cronograma,progresso,especialidades,observacoes,
materiais,inicio-instrutor}.

EXECUÇÃO: PLANO, ondas 0 a 4, com a tabela PODE/NÃO TOCAR; no máximo 3 implementadores (sonnet);
revisões com opus; commit por onda; uma suíte completa por vez; push e saída do rascunho só pelo
gestor-pr no fim.
GATE: "Pronto" do PLANO.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```
