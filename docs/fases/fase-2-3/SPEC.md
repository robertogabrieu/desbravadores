# Base das Fases 2 e 3 · Spec e plano

**Status:** rascunho para revisão · **Branch:** `feature/fase-2-3-base` · **Base:** `main@b966352` (Fase 0 + 1a)

As Fases 2 (Instrutor) e 3 (Adm) compartilham dados: o instrutor lê e registra aulas do
cronograma que o Adm monta, e o calendário do Adm bloqueia datas desse cronograma. Para que as duas
rodem **em paralelo** (e junto com a 1b), esta PR pequena entrega antes o que as duas usam. Ela
também carrega as specs e os planos das duas fases ([Fase 2](../fase-2/SPEC.md),
[Fase 3](../fase-3/SPEC.md)).

**Precedência e regras gerais:** as mesmas da [spec da Fase 1](../fase-1/SPEC.md) (cabeçalho). As
specs das Fases 0 e 1 continuam valendo onde esta não as altera.

**Anexos — contrato literal** (usados pelas três PRs):
- [`anexos/schema.prisma`](anexos/schema.prisma) — schema completo (Fases 0–3; blocos novos
  marcados `// FASE 2-3`). Validado com `prisma validate` 7.5.0. A migration contra a `main` **não
  tem DROP** nem mexe em tabelas da 1a/1b: cria 14 tabelas e 3 índices parciais, e acrescenta
  relações em `Clube`, `Usuario`, `Desbravador`, `Classe`, `SecaoRequisito`, `Requisito`,
  `Especialidade`, `Arquivo`.
- [`anexos/contratos.ts`](anexos/contratos.ts) — contratos novos das duas fases, conferidos com
  `tsc --strict` contra o `packages/shared` real.

## 1. O que a base entrega

1. Schema e migration `fase2_3_instrutor_adm`; os 14 modelos novos em `MODELOS_DE_CLUBE`
   (`EventoCalendario, Cronograma, CronogramaPublicacao, AulaPlanejada, AulaRequisito,
   RegistroAula, PresencaAula, EnvioAulaProcessado, RequisitoConcluido, EspecialidadeConcluida,
   Observacao, Material, Notificacao, Atividade`).
2. Contratos das duas fases no `shared`; `PacoteSaida` ganha `instrutor` (nulo por padrão).
3. **Fórmulas do calendário** no `shared` (§3).
4. API: `ServicoCalendario` (leitura), leitura do cronograma
   `GET /classes/:id/cronograma` (§4), `ServicoNotificacoes` + rotas do sino (§5),
   `ServicoAtividade` (§6).
5. Web: carregamento automático dos tipos da fila (§7), sino e `/notificacoes` nos dois layouts,
   e a rota reservada `/cronograma/montar` com a página "Em breve" (a Fase 3 a preenche).

**Fora da base:** telas e regras próprias de cada fase; criar/editar evento (Fase 3); montar
cronograma (Fase 3); registrar aula (Fase 2).

## 2. Decisões travadas (valem para as Fases 2 e 3)

| # | Decisão | Por quê |
|---|---|---|
| B1 | A base mescla **antes** das Fases 2 e 3; cada uma parte da `main` com a base e tem PR própria. A 1b pode estar rodando em paralelo — nenhuma das três toca no schema (a base já criou tudo) | Paralelo sem migrations concorrentes |
| B2 | Um cronograma por **classe** por ano do clube (a avançada é outra classe, com o seu). Quem monta edita o cronograma **vivo**; quem não monta vê a última **publicação** (retrato em `CronogramaPublicacao`). Qualquer edição no vivo põe `status = RASCUNHO`; "Enviar" (instrutor liberado) → `ENVIADO`; "Publicar" (só Adm) grava o retrato e põe `PUBLICADO` | O instrutor não vê meia montagem, e editar um publicado não o desfaz para os outros |
| B3 | **Quem monta** = Adm sempre; instrutor da classe só se `ClasseClube.quemMontaCronograma = INSTRUTOR`. Publicar é só do Adm. Montagem só **online** | Trava única (D12 da Fase 0) |
| B4 | **Situação de uma data** (fórmula `situacaoDaData`, §3): basta um evento que cubra a data com `bloqueiaAula` para bloquear; `bomParaCampo` e `cancelaReuniao` idem, por qualquer um. Evento de vários dias vale para **todas** as datas do intervalo. Evento removido (`removidoEm`) não conta | MODELO §5 |
| B5 | **Dias de reunião** do período = datas com o dia da semana `diaReuniao` sem evento `cancelaReuniao`. Classes **individuais** só recebem aula nessas datas; **Agrupadas** recebem aula em qualquer data, e evento na data só gera aviso | VISAO decisão 11 |
| B6 | **Conflito** = aula (viva ou publicada) com requisito numa data que passou a bloquear aula, e ainda sem registro. É derivado na leitura (não há coluna); a notificação é da Fase 3 | Não duplicar estado |
| B7 | **Pontos** de requisito e especialidade só por `ServicoPontos.sincronizar`, origem `REQUISITO`/`ESPECIALIDADE`, `origemId = "<dbvId>:<requisitoId|especialidadeId>"`, critério padrão do gatilho; só DBV tipo `DBV` pontua (LIDER nunca) | Mesma regra da chamada |
| B8 | Tipos da fila ficam em `apps/web/src/offline/tipos/<nome>.ts`, cada um chamando `registrarTipo` no carregamento; o `main.tsx` importa todos com `import.meta.glob('./offline/tipos/*.ts', { eager: true })` **antes** de iniciar a sessão | Nenhuma fase edita um arquivo comum para registrar o seu tipo (a 1b usa esse mesmo caminho) |
| B9 | Notificações só **dentro do app** (sino), nunca e-mail nesta fase; a lista guarda as últimas 50 por pessoa | VISAO: push fica para depois |

## 3. Fórmulas do calendário (`packages/shared/src/formulas/calendario.ts`, com testes)

- `situacaoDaData(data, eventos) → SituacaoData` — B4. Casos: sem evento → tudo falso;
  acampamento 16–18/10 cobre 18/10 com `bomParaCampo`; dois eventos no mesmo dia, um bloqueia →
  bloqueia; evento removido é ignorado.
- `diasDeReuniao(inicio, fim, diaReuniao, eventos) → DataCivil[]` — B5. Caso: out/2026, domingo,
  "sem reunião" em 25/10 → [04, 11, 18].
- `situacaoDaAula({ data, hoje, temRegistro, situacaoDaData, temRequisitos }) → 'DADA' | 'HOJE' |
  'PLANEJADA' | 'CONFLITO'` — DADA se tem registro; senão CONFLITO se bloqueia e tem requisitos;
  senão HOJE se `data === hoje`; senão PLANEJADA.

## 4. Leitura do cronograma (API)

`GET /api/classes/:id/cronograma?anoClube` → `CronogramaLeitura`. `@Logado`. Escopo: Adm
qualquer classe; instrutor só as do seu `VinculoClasse`; conselheiro 403.
- `podeMontar` = B3. Quem pode montar recebe o **vivo** (`fonte: 'VIVO'`); os demais recebem a
  última publicação (`fonte: 'PUBLICADO'`) — sem publicação, `aulas: []` e `status` do vivo (a tela
  mostra o vazio "O cronograma ainda não foi publicado").
- Cada aula traz os requisitos (código, texto, CAMPO com o ajuste do clube), `situacao` (§3) e o
  `registroAulaId` do `RegistroAula` da classe na data, se houver.
- Serviço reaproveitável: `ServicoCronograma.leitura(sessao, classeId, anoClube)` e
  `ServicoCalendario.situacoes(clubeId, inicio, fim) → Map<data, SituacaoData>`.

## 5. Notificações

`ServicoNotificacoes.notificar(tx, { clubeId, usuarioIds, tipo, titulo, texto, link })` grava uma
linha por pessoa (deduplica ids) e apaga, da mesma pessoa, o que passar das 50 mais recentes.
Rotas (`@Logado`, só as do próprio usuário no clube ativo): `GET /notificacoes` →
`NotificacoesSaida`; `POST /notificacoes/:id/lida` → 204; `POST /notificacoes/lidas` → 204.
Web: `SinoNotificacoes` no cabeçalho dos dois layouts (contador de não lidas; tocar abre
`/notificacoes`, lista com título, texto, data relativa e link; abrir marca lida); busca a cada
abertura do app e a cada 2 min com a aba visível; sem conexão, esconde o contador.

## 6. Atividade

`ServicoAtividade.registrar(tx, { clubeId, autorId, tipo, descricao, link })`. Tipos usados:
`AULA_REGISTRADA` (Fase 2), `CRONOGRAMA_PUBLICADO`, `CRONOGRAMA_ENVIADO`, `EVENTO_CRIADO` (Fase 3).
A 1b **não** registra atividade (a visão geral da Fase 3 lê reuniões direto das tabelas).
Leitura é da Fase 3.

## 7. Web — carregamento dos tipos da fila

`main.tsx` ganha o `import.meta.glob` do B8 antes de montar o `ProvedorSessao`. Um teste confere
que um arquivo em `offline/tipos/` registra o seu tipo sem que nenhum outro arquivo o importe.

## 8. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Fórmulas do §3, todos os casos | Vitest | BA1 |
| Guarda: os 14 modelos novos sem `clubeId` lançam | Jest | BA1 |
| Leitura do cronograma: vivo × publicado por papel; conselheiro 403; instrutor de outra classe 404; situação CONFLITO; `registroAulaId`; isolamento entre clubes | Jest | BA1 |
| Notificações: grava por pessoa, dedupe, limite 50, só vê as suas, marcar lida | Jest | BA1 |
| Glob dos tipos da fila; sino (contador, lista, marcar lida, sem conexão) | Vitest | BA2 |

## 9. Plano da base

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md) (cabeçalho).

**Onda 0 [principal]:** copia o schema e gera a migration (confere: sem DROP, 3 índices parciais,
nada em `PedidoAoAdm`/`Reuniao`/`Chamada`); acrescenta os 14 modelos à guarda; copia os contratos
(e `PacoteSaida.instrutor` com `.nullable().default(null)`); registra módulos vazios
`calendario, cronogramas, notificacoes, atividades` no `app.module.ts`; reserva as rotas
`/notificacoes` e `/cronograma/montar` em `rotas.tsx` (arquivos de rotas por módulo). Baseline.
Commit.

**Onda 1 [2 subagentes em paralelo]:**
- **BA1 · API da base** — `packages/shared/src/formulas/calendario.ts` + testes;
  `apps/api/src/{calendario,cronogramas,notificacoes,atividades}/**` (só leitura, §4–6).
- **BA2 · Web da base** — glob em `main.tsx`; `apps/web/src/modulos/notificacoes/**` (página +
  `SinoNotificacoes`), o sino nos dois layouts (só acrescentar ao cabeçalho), `api/notificacoes.ts`,
  handlers msw; `apps/web/src/modulos/cronograma-montagem/**` com a página "Em breve".

**Onda 2 — fechamento:** suíte inteira contra o baseline, revisão (opus) até limpa, `gestor-pr`
tira do rascunho. **Pronto:** lint/tipos/teste/build verdes; e2e existentes verdes; revisão limpa.

**Comando** — sessão nova em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a BASE das Fases 2 e 3.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/fase-2-3 · branch
feature/fase-2-3-base · commit-base main@b966352 · continue nesta branch e na PR em rascunho que já existe.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-2-3/SPEC.md (spec e plano da base). As specs das
Fases 0 e 1 valem onde esta não altera. Anexos de docs/fases/fase-2-3/anexos/ são contrato literal.

DECISÕES TRAVADAS: B1–B9 desta spec, E1–E22 da Fase 1, D1–D24 da Fase 0.
FORA DE ESCOPO: tudo o que é próprio das Fases 2 e 3 (SPEC §1 "Fora da base"). Não mexa em nada da 1b.

EXECUÇÃO: SPEC §9, ondas 0 a 2; no máximo 2 implementadores (sonnet); revisões com opus; commit por
onda; push e saída do rascunho só pelo gestor-pr no fim.
GATE: "Pronto" do SPEC §9.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```

---

## ONDE FICA (`main@b966352`)

- fila offline: tipos `apps/web/src/offline/tipos.ts:8-135` (`TipoFila`, `ItemFila`, `EntradaFila` 88-94, `ContextoEnvio` 57-63, `ContextoAposEnvio` 65-74); `registro.ts:9`; `fila.ts:33-95` (`enfileirar`/fundir), `:97` (`itensDaChave`), `:148` (`descartar`), `:253` (`useFila`); motor `motor.ts:100-258` (classificação e 10 tentativas, `tempos.ts:4,16,17`); público em `offline/index.ts:3-8`
- pacote: `apps/api/src/sync/sync.service.ts:52-88` (por papel na linha 63; `versao` na 86); contrato `packages/shared/src/contratos/sync.ts:16-43`; mock `apps/web/src/testes/handlers/offline.ts:9`
- pontos: `apps/api/src/pontos/servico-pontos.ts:11-28`; teste `servico-pontos.spec.ts:47-140`
- arquivos: `apps/api/src/arquivos/armazenamento.ts:8-49`, `servico-arquivos.ts:59,71` (`urlAssinada(clubeId, arquivoId, variante)`), `arquivos.controller.ts:114-139` (fixa `image/jpeg` na linha 138)
- guarda: `apps/api/src/comum/prisma/guarda-clube.ts:4-23` (`MODELOS_DE_CLUBE`), mistos ~25
- escopo: `apps/api/src/desbravadores/escopo.service.ts:19,25,33,41,50` (`classesDoInstrutor`; o filtro do instrutor não olha o status da matrícula)
- shared: `index.ts:1-23`; `formulas/pontos.ts:36,58`; `formulas/progresso.ts:1-12`; `datas.ts:9,19,30`; `enums.ts` (`Horario` na 34)
- web: `ui/` (Abas, Avatar, BarraProgresso, Botao, CaixaMarcacao, Campo, Cartao, Chip, Confirmacao, Esqueleto, EstadoVazio, FaixaAviso, FolhaLateral, MenuCabecalho, Selecao, Selo, Tabela — não há calendário, textarea nem seletor de data); `layouts/LayoutCelular.tsx:11-18,27-32`; `layouts/LayoutAdm.tsx:12-20,40-41`; `rotas.tsx:17-42`; sessão `sessao/ProvedorSessao.tsx`
- e2e: `e2e/offline.spec.ts:12`, `e2e/fundacao.spec.ts:55,66`, `e2e/global-setup.ts:14-60`
- produção: `apps/web/nginx.conf:9,16,30,50,59,69`; `docker-compose.prod.yml:28,37-38,48`; `apps/api/Dockerfile:38,43`
- e-mail: `apps/api/src/email/modelos.ts:8,22,35`
- conferido em `desbravadores@b966352`
