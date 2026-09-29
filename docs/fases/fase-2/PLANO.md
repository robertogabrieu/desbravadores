# Fase 2 — Instrutor · Plano

**Spec:** [SPEC.md](SPEC.md) · **Branch:** `feature/fase-2-instrutor`, da `main` com a 1b e a base
2·3 · **Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-2` · PR própria em
rascunho · a **Fase 3 pode estar rodando em paralelo**

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md) (cabeçalho e §1). Suíte: no máximo
1 completa por vez nesta sessão, com as flags de pouca memória do Jest (a máquina é compartilhada
com a Fase 3). **Não altere o schema nem código da 1b, da base ou da Fase 3.**

**Arquivos de dono compartilhado** (só o principal): `app.module.ts`, `rotas.tsx`,
`packages/shared/**`, `package.json`/lock, `CLAUDE.md`, `apps/web/src/offline/tipos/todos.ts`,
`apps/web/src/layouts/LayoutCelular.tsx`, `apps/api/test/fabricas.ts`.

## Conta

~70 arquivos alterados em 7 pacotes (~10 cada).

## Ondas

**Onda 0 [principal]:**
1. Conferir a base: `git log --oneline main` contém o merge da 1b **e** o da base 2·3; senão, pare
   e avise.
2. Investigador atualiza o ONDE FICA da SPEC (§7) — commit.
3. `rotas.tsx`: rotas do §5 (placeholders por módulo) e `/inicio` por papel (F16);
   `LayoutCelular`: habilita Classes e Cronograma (só `para`); `todos.ts`: `import './aula'` com um
   `aula.ts` vazio que registra o tipo `AULA` com `enviar` lançando "não implementado" (o B1
   preenche); `app.module.ts`: módulos `aulas, progresso, observacoes, materiais, instrutor`.
4. Fábricas novas em `fabricas.ts`: `criarObservacao`, `criarMaterial` (as de conclusão de
   requisito e de especialidade já vêm da base).
5. `api/aulas.ts` com `useAulas(classeId)`, `useAula(id)`, `useSalvarAula()` (enfileira);
   `api/progresso.ts` com `useProgressoClasse(classeId)`, `useProgressoDbv(dbvId)`.
6. Baseline por nomes. Commit.

**Onda 1 [3 subagentes] — API · Onda 2 [3 subagentes] — telas · Onda 3 [2 subagentes]:**

| Pacote | PODE TOCAR | NÃO TOCAR (além dos compartilhados) |
|---|---|---|
| A1 · Aula e pacote | `apps/api/src/aulas/**`; em `apps/api/src/sync/**` só acrescentar a seção `instrutor` | `reunioes/` (só ler como referência), `cronogramas/` e `calendario/` (usa, não altera) |
| A2 · Progresso, especialidades, início, pedido de liberação | `apps/api/src/{progresso,instrutor}/**` (inclui `POST /classes/:id/pedir-liberacao` em `instrutor/`); `apps/api/src/especialidades/especialidades-dbv.*` (novo) | `especialidades.controller/service` existentes; `classes/` |
| A3 · Observações e materiais | `apps/api/src/{observacoes,materiais}/**` | `arquivos/` (usa `gravarDeArquivo` e `urlAssinada`, não altera) |
| B1 · Registro de aula | `apps/web/src/modulos/aulas/**`, `apps/web/src/offline/tipos/aula.ts`, `apps/web/src/api/aulas.ts` (mutação), `testes/handlers/aulas.ts` | `offline/` (motor), `modulos/reunioes/` |
| B2 · Início, classes, cronograma | `apps/web/src/modulos/{inicio-instrutor,classes,cronograma}/**`, `api/instrutor.ts`, `api/cronograma.ts` (leitura), handlers | `modulos/inicio/` (conselheiro, da 1b), `modulos/cronograma-montagem/` (Fase 3) |
| B3 · Progresso, especialidades, observações, materiais | `apps/web/src/modulos/{progresso,especialidades,observacoes,materiais}/**`, `api/{progresso,especialidades-dbv,observacoes,materiais}.ts`, handlers | `api/leitura.ts` (usa, não altera) |
| B4 · e2e | `e2e/instrutor.spec.ts` (semeia por `e2e/apoio/semear.ts`) | `e2e/global-setup.ts`, `e2e/apoio/**` |
| B5 · Progresso no perfil (I6) | `apps/web/src/modulos/perfil/**` — **só acrescentar** a seção de progresso | o resto do perfil da 1b |

A1–A3 na onda 1; B1–B3 na onda 2; B4 e B5 na onda 3.

**Onda 4 — fechamento:** suíte inteira contra o baseline; revisão (opus) até limpa; `qa-runner`
headless com **um item por linha da tabela do SPEC §5** (rota, ação, resultado esperado), mais "abrir um PDF de material no Chromium";
`documentador`; `gestor-pr` tira do rascunho. Se a Fase 3 mesclou antes: rebase, resolver só
acréscimos, suíte de novo.

**Pronto:** `npm ci && npm run lint && npm run tipos && npm run teste && npm run build` verdes;
`npm run teste:e2e` verde; revisão limpa; QA sem FALHOU.

## Comando

Sessão nova em `/home/robertogabrieu/desbravadores`, **depois do merge da 1b e da base 2·3**:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 2 (Instrutor).

ONDE: crie a branch feature/fase-2-instrutor a partir da main atualizada (com a 1b e a base 2·3)
numa worktree nova em /home/robertogabrieu/desbravadores/.claude/worktrees/fase-2 e abra a PR em
rascunho no fim da onda 0.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-2/PLANO.md, docs/fases/fase-2/SPEC.md e
docs/fases/fase-2-3/SPEC.md. As specs das Fases 0 e 1 valem onde estas não alteram.

DECISÕES TRAVADAS: F1–F17 (Fase 2), B1–B12 (base), E1–E22 (Fase 1), D1–D24 (Fase 0).
FORA DE ESCOPO: SPEC §1 "Fora da Fase 2". Não altere o schema nem código da 1b, da base ou da
Fase 3 (que pode estar rodando): calendario/, cronogramas/, modulos/adm/, modulos/cronograma-montagem/.

EXECUÇÃO: PLANO, ondas 0 a 4, com a tabela PODE/NÃO TOCAR; no máximo 3 implementadores (sonnet);
revisões com opus; commit por onda; uma suíte completa por vez; push e saída do rascunho só pelo
gestor-pr no fim.
GATE: "Pronto" do PLANO.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```
