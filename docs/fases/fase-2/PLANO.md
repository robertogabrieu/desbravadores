# Fase 2 — Instrutor · Plano

**Spec:** [SPEC.md](SPEC.md) · **Branch:** `feature/fase-2-instrutor` (da `main` com a base 2·3) ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-2` · PR própria em rascunho

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md) (cabeçalho e §1) — principal só
nos arquivos de dono compartilhado; implementador sonnet em TDD com a bateria do pacote antes;
revisão opus; nenhum subagente roda git; até 3 implementadores por onda; ~80 turnos por pacote;
PENDÊNCIAS em uma linha cada. **Não altere o schema** (a base já criou tudo) nem arquivos da 1b.

Arquivos de dono compartilhado nesta fase: `app.module.ts`, `rotas.tsx`, `packages/shared/**`,
`package.json`/lock, `CLAUDE.md`, `apps/web/nginx.conf`, `apps/api/src/arquivos/arquivos.controller.ts`
(a mudança F8 é feita pelo principal na onda 0, com teste).

## Conta

~70 arquivos alterados em 7 pacotes (~10 cada).

## Ondas

**Onda 0 [principal]:** investigador atualiza o ONDE FICA da SPEC com o código da base (commit);
F8 na rota de arquivos e no nginx (com teste); registra módulos `aulas, progresso, observacoes,
materiais, instrutor` em `app.module.ts`; rotas do §4 em `rotas.tsx` (placeholders); cria
`api/aulas.ts` com as assinaturas `useAulas(classeId)`, `useAula(id)`, `useSalvarAula()`
(enfileira) e `api/progresso.ts` com `useProgressoClasse(classeId)`, `useProgressoDbv(dbvId)`.
Baseline. Commit.

**Onda 1 [3 subagentes] — API:**
- **A1 · Aula e pacote** — `apps/api/src/aulas/**`, a seção `instrutor` do pacote em
  `apps/api/src/sync/**` (só acrescentar), fábricas novas em `apps/api/test/fabricas.ts`
  (cronograma publicado com aulas, registro de aula, conclusão de requisito).
- **A2 · Progresso, especialidades e início** — `apps/api/src/{progresso,instrutor}/**`,
  especialidades do DBV em `apps/api/src/especialidades/**` (só acrescentar), pedido de liberação.
- **A3 · Observações e materiais** — `apps/api/src/{observacoes,materiais}/**`.

**Onda 2 [3 subagentes] — telas:**
- **B1 · Registro de aula** — `modulos/aulas/**`, `offline/tipos/aula.ts`, `api/aulas.ts` (mutação).
- **B2 · Início, classes e cronograma** — `modulos/{inicio-instrutor,classes,cronograma}/**`,
  `api/instrutor.ts`, habilitar Classes e Cronograma no `LayoutCelular` (só `para`).
- **B3 · Progresso, especialidades, observações e materiais** — `modulos/{progresso,especialidades,
  observacoes,materiais}/**`, `api/{progresso,especialidades,observacoes,materiais}.ts`.

**Onda 3 [1–2 subagentes]:**
- **B4 · e2e** — `e2e/instrutor.spec.ts` (SPEC §5).
- **B5 · Progresso no perfil (I6)** — **só se a 1b já está na `main`**: rebase, então
  `modulos/perfil/**` ganha a seção de progresso. Se a 1b ainda não entrou, B5 fica para uma PR
  curta depois do merge dela — registrar como PENDÊNCIA e seguir.

**Onda 4 — fechamento:** suíte inteira contra o baseline; revisão (opus) até limpa; `qa-runner`
headless com o roteiro das linhas do §4; `documentador`; `gestor-pr` tira do rascunho.

**Pronto:** lint/tipos/teste/build verdes; e2e (anteriores + instrutor) verde; revisão limpa; QA sem
FALHOU; B5 feito ou declarado.

## Comando

Sessão nova em `/home/robertogabrieu/desbravadores`, **depois do merge da base 2·3**:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 2 (Instrutor).

ONDE: crie a branch feature/fase-2-instrutor a partir da main atualizada (já com a base 2·3) numa
worktree nova em /home/robertogabrieu/desbravadores/.claude/worktrees/fase-2 e abra a PR em rascunho
no fim da onda 0.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-2/PLANO.md, docs/fases/fase-2/SPEC.md e
docs/fases/fase-2-3/SPEC.md. As specs das Fases 0 e 1 valem onde estas não alteram.

DECISÕES TRAVADAS: F1–F14 (Fase 2), B1–B9 (base), E1–E22 (Fase 1), D1–D24 (Fase 0).
FORA DE ESCOPO: SPEC §1 "Fora da Fase 2". Não altere o schema nem arquivos da 1b. A Fase 3 pode
estar rodando em paralelo: não toque em calendario/, cronogramas/ (exceto ler), modulos/adm/ nem
modulos/cronograma-montagem/.

EXECUÇÃO: PLANO, ondas 0 a 4; no máximo 3 implementadores (sonnet); revisões com opus; commit por
onda; push e saída do rascunho só pelo gestor-pr no fim.
GATE: "Pronto" do PLANO.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```
