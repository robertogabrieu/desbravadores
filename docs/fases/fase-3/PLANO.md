# Fase 3 — Adm · Plano

**Spec:** [SPEC.md](SPEC.md) · **Branch:** `feature/fase-3-adm` (da `main` com a base 2·3) ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-3` · PR própria em rascunho

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md) (cabeçalho e §1). **Não altere o
schema** nem arquivos da 1b ou da Fase 2.

Arquivos de dono compartilhado nesta fase: `app.module.ts`, `rotas.tsx`, `packages/shared/**`,
`package.json`/lock, `CLAUDE.md`, `layouts/LayoutAdm.tsx` (itens do menu — feito pelo principal
na onda 0).

## Conta

~65 arquivos alterados em 7 pacotes (~9 cada).

## Ondas

**Onda 0 [principal]:** investigador atualiza o ONDE FICA da SPEC (commit); registra módulos
`calendario` (escrita), `cronogramas` (montagem), `visao-geral`, `clube` em `app.module.ts` —
os dois primeiros **já existem** pela base e ganham controllers novos; rotas do §4 em `rotas.tsx`;
habilita os itens do menu lateral (SPEC §4) e acrescenta "Configurações do clube". Baseline. Commit.

**Onda 1 [3 subagentes] — API:**
- **A1 · Calendário** — escrita de eventos em `apps/api/src/calendario/**` (a leitura da base não
  muda), `aulasAfetadas`, notificações G5.
- **A2 · Montagem** — `apps/api/src/cronogramas/montagem/**` (novo subdiretório: controller e
  serviço de montagem, enviar, publicar, notificações G6); fábricas de cronograma vivo e publicado
  em `apps/api/test/fabricas.ts` (só acrescentar).
- **A3 · Classes, visão geral e configurações** — `apps/api/src/{visao-geral,clube}/**`, ajustes
  em `apps/api/src/classes/**` e especialidade do clube em `apps/api/src/especialidades/**` (só
  acrescentar rotas de escrita).

**Onda 2 [3 subagentes] — telas:**
- **B1 · Calendário e configurações** — `modulos/adm/{calendario,configuracoes}/**`,
  `api/{calendario,clube}.ts`.
- **B2 · Montagem (computador e celular)** — `modulos/cronograma-montagem/**` (substitui o "Em
  breve"), `api/montagem.ts`.
- **B3 · Visão geral e classes** — `modulos/adm/{visao-geral,classes}/**`, `api/{visao-geral,
  classes-adm}.ts`.

**Onda 3 [1 subagente]:** **B4 · e2e** — `e2e/adm.spec.ts` (SPEC §5).

**Onda 4 — fechamento:** suíte inteira contra o baseline; revisão (opus) até limpa; `qa-runner`
headless; `documentador`; `gestor-pr` tira do rascunho.

**Pronto:** lint/tipos/teste/build verdes; e2e verde; revisão limpa; QA sem FALHOU.

**Conflito esperado com a Fase 2** (rodam juntas): as duas acrescentam fábricas em
`apps/api/test/fabricas.ts` e rotas em `rotas.tsx`/`app.module.ts` — quem mergeia depois faz
rebase e resolve só acréscimos. Nenhuma das duas altera o que a outra criou.

## Comando

Sessão nova em `/home/robertogabrieu/desbravadores`, **depois do merge da base 2·3**:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 3 (Adm).

ONDE: crie a branch feature/fase-3-adm a partir da main atualizada (já com a base 2·3) numa
worktree nova em /home/robertogabrieu/desbravadores/.claude/worktrees/fase-3 e abra a PR em rascunho
no fim da onda 0.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-3/PLANO.md, docs/fases/fase-3/SPEC.md e
docs/fases/fase-2-3/SPEC.md. As specs das Fases 0 e 1 valem onde estas não alteram.

DECISÕES TRAVADAS: G1–G10 (Fase 3), B1–B9 (base), E1–E22 (Fase 1), D1–D24 (Fase 0).
FORA DE ESCOPO: SPEC §1 "Fora da Fase 3". Não altere o schema nem arquivos da 1b ou da Fase 2 (que
podem estar rodando em paralelo): não toque em aulas/, progresso/, observacoes/, materiais/,
modulos/aulas|classes|cronograma|progresso|especialidades|observacoes|materiais|inicio-instrutor.

EXECUÇÃO: PLANO, ondas 0 a 4; no máximo 3 implementadores (sonnet); revisões com opus; commit por
onda; push e saída do rascunho só pelo gestor-pr no fim.
GATE: "Pronto" do PLANO.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```
