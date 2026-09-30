# Base das Fases 2 e 3 · Spec e plano

**Status:** revisada em duas rodadas (fatos contra o código, desenho/segurança, completude e paralelismo; depois contradições) ·
**Branch:** `feature/fase-2-3-base` · **Base de escrita:** `main@b966352` (Fase 0 + 1a)

As Fases 2 (Instrutor) e 3 (Adm) compartilham dados: o instrutor lê e registra aulas do
cronograma que o Adm monta, e o calendário do Adm bloqueia datas desse cronograma. Esta PR pequena
entrega antes o que as duas usam, para que elas rodem **em paralelo**. Ela carrega também as specs
e os planos das duas fases ([Fase 2](../fase-2/SPEC.md), [Fase 3](../fase-3/SPEC.md)).

**Ordem de merge:** **1b → base → Fases 2 e 3 (em paralelo)**. A base pode ser implementada
enquanto a 1b roda, mas **só mescla depois dela**, com rebase sobre a `main` que já tem a 1b, e
reaproveita o que a 1b criou (§1.1). As Fases 2 e 3 partem da `main` com 1b e base.

**Precedência e regras gerais:** as da [spec da Fase 1](../fase-1/SPEC.md) (cabeçalho). As specs
das Fases 0 e 1 continuam valendo onde esta não as altera.

**Anexos — contrato literal** (usados pelas três PRs):
- [`anexos/schema.prisma`](anexos/schema.prisma) — schema completo (Fases 0–3; blocos novos
  marcados `// FASE 2-3`). `prisma validate` 7.5.0; a migration contra a `main` **só acrescenta**:
  14 tabelas, 3 índices parciais e relações em `Clube, Usuario, Desbravador, Classe,
  SecaoRequisito, Requisito, Especialidade, Arquivo`. Nada em tabelas da 1a/1b.
- [`anexos/contratos.ts`](anexos/contratos.ts) — contratos das duas fases, `tsc --strict` contra o
  `packages/shared` real.

## 1. O que a base entrega

1. Schema e migration `fase2_3_instrutor_adm`; os 14 modelos em `MODELOS_DE_CLUBE`.
2. Contratos no `shared`; `PacoteSaida.instrutor` (`.nullable().default(null)`) e `instrutor: null`
   acrescentado **à mão** onde o tipo de saída é montado: `apps/api/src/sync/sync.service.ts`
   (`PacoteSemVersao`) e `apps/web/src/testes/handlers/offline.ts` (`criarPacote`) — o `.default`
   só vale no parse, o tipo continua exigindo o campo. `RequisitoSaida` ganha `oficial` e
   `ajustado` opcionais.
3. **Fórmulas do calendário** no `shared` (§3).
4. API: `ServicoCalendario` (leitura), `GET /classes/:id/cronograma` (§4), `ServicoNotificacoes` e
   as rotas do sino (§5), `ServicoAtividade` (§6), `instrutoresDaClasse` (§4.1), e a **rota de
   arquivos para documentos** (§7).
5. Web: sino e `/notificacoes` para **INSTRUTOR e ADM** (o conselheiro continua sem sino — C1 da
   1b); rota reservada `/cronograma/montar` com "Em breve"; componentes `AreaTexto` e `CampoData`
   em `ui/`; fábricas e semeador do e2e (§8).
6. `apps/web/nginx.conf`: `location /api/materiais/arquivo` com `client_max_body_size 21m`.

### 1.1 Reaproveitar o que a 1b criou (conferir no rebase)

- **Tipos da fila**: a 1b criou `apps/web/src/offline/tipos/todos.ts` (importa `./reuniao` e
  `./foto`) e o `main.tsx` importa `./offline/tipos/todos`. **Esse é o mecanismo**: a Fase 2
  acrescenta uma linha `import './aula'` nele. A base não cria outro.
- **Layout por papel**: a 1b criou `LayoutDoPapel` em `rotas.tsx` (sob uma guarda que deixa
  passar os três papéis). As rotas `/notificacoes` e `/cronograma/montar` são declaradas **uma
  vez**, num bloco próprio com `GuardaRota papeis={['INSTRUTOR','ADM']}` envolvendo o
  `LayoutDoPapel` (Adm → `LayoutAdm`; instrutor → `LayoutCelular`) — o conselheiro não chega a elas.
- Se, no rebase, algum desses nomes for outro, vale o que a 1b fez — ajuste a base, não a 1b.

**Fora da base:** telas e regras próprias de cada fase; escrever eventos; montar cronograma;
registrar aula.

## 2. Decisões travadas (valem para as Fases 2 e 3)

| # | Decisão | Por quê |
|---|---|---|
| B1 | Ordem de merge **1b → base → Fases 2 e 3**. Nenhuma das três toca no schema depois da base. Quem mergeia por último faz rebase e resolve **só acréscimos** em `rotas.tsx`, `app.module.ts`, layouts, `fabricas.ts`, `index.ts` do shared | Paralelo sem migration concorrente |
| B2 | Um cronograma por **classe** e ano do clube (a avançada é outra classe, com o seu). Quem monta edita o **vivo**; quem não monta vê a **última publicação** daquele cronograma (`CronogramaPublicacao` mais recente — o retrato JSON). Toda edição no vivo põe `RASCUNHO`; Enviar (instrutor liberado) → `ENVIADO`; Publicar (só Adm) grava o retrato e põe `PUBLICADO` | O instrutor não vê meia montagem |
| B3 | **Quem monta** = Adm sempre; instrutor da classe só se `ClasseClube.quemMontaCronograma = INSTRUTOR`. Publicar só Adm. Montagem só online | Trava única (D12) |
| B4 | **Situação de uma data** (`situacaoDaData`): basta um evento não removido que cubra a data com `bloqueiaAula`/`bomParaCampo`/`cancelaReuniao` para a marcação valer; evento de vários dias vale para **todas** as datas do intervalo | MODELO §5 |
| B5 | **Datas de aula das individuais** = dias de reunião do período (dia `diaReuniao` sem `cancelaReuniao`) **mais** datas com `bomParaCampo` — sempre sem `bloqueiaAula`. Assim o domingo do acampamento aceita aula de campo. **Agrupadas**: qualquer data; evento na data só gera aviso | Design (aula de campo no acampamento) + VISAO decisão 11 |
| B6 | **Conflito** — função única `emConflito({ trilha, temRequisitos, temRegistro, data, hoje, situacaoDaData })` = trilha INDIVIDUAL **e** tem requisitos **e** sem registro **e** `data ≥ hoje` **e** (`bloqueiaAula` **ou** (`cancelaReuniao` **e não** `bomParaCampo`)) — isto é, a data deixou de ser data de aula (B5). Agrupadas nunca estão em conflito. Leitura, montagem e avisos de evento usam **esta** função. **"Tem registro"** = existe `RegistroAula` da mesma (clube, classe, data) — nunca pelo `aulaPlanejadaId` | Três definições divergiam; um registro por data |
| B7 | **Pontos** de requisito e especialidade só por `ServicoPontos.sincronizar`, origem `REQUISITO`/`ESPECIALIDADE`, `origemId = "<dbvId>:<requisitoId\|especialidadeId>"`, critério padrão do gatilho; data do lançamento = data da conclusão. Só DBV tipo `DBV` pontua. **Critério inativo**: não se chama `sincronizar` ao criar a conclusão (não lança); ao remover, chama com `devidos: []` (estorna o que houver). Declarado: desmarcar em outubro uma conclusão de setembro altera setembro | Mesma regra da chamada (E8) |
| B8 | Tipos da fila: o `todos.ts` da 1b (§1.1) | Um mecanismo só |
| B9 | Notificações só **no app**; as 50 mais recentes por pessoa. **Link escolhido pelo destinatário**: quem monta → `/cronograma/montar?classe=`; quem não monta → `/cronograma?classe=`; Adm em pedido de liberação → `/adm/classes?classe=`. Declarado: `/cronograma` (Fase 2) e `/adm/classes` (Fase 3) dão "Página não encontrada" até a fase dona mesclar | Nenhum link leva a tela proibida |
| B10 | **Instrutores de uma classe** = `Vinculo` INSTRUTOR **ativo do clube** com `VinculoClasse` naquela classe — sempre por `instrutoresDaClasse(clubeId, classeId)` (§4.1). `VinculoClasse` não tem `clubeId` e a classe oficial é compartilhada: consultar só por `classeId` traria gente de outros clubes | Vazamento entre clubes |
| B11 | **Escopo do instrutor** passa a olhar o status da matrícula: `filtroDesbravadores` do `ServicoEscopo` só considera matrículas `CURSANDO`, `CONCLUIDA` ou `INVESTIDA` no ano do clube (nunca `DESISTIU`). Vale para perfil, ranking (nome/frequência), progresso e marcações | DBV que saiu não fica visível ao ex-instrutor |
| B12 | Consultas de observação e de material **não** são guardadas no aparelho; `sair()` também limpa o cache do TanStack Query (`queryClient.clear()`) | Celular compartilhado |

## 3. Fórmulas do calendário (`packages/shared/src/formulas/calendario.ts`, com testes)

- `situacaoDaData(data, eventos) → SituacaoData` — B4. Casos: sem evento → tudo falso; acampamento
  16–18/10 cobre 18/10 com `bomParaCampo`; dois eventos, um bloqueia → bloqueia; removido ignorado.
- `diasDeReuniao(inicio, fim, diaReuniao, eventos) → DataCivil[]`. Caso: out/2026, domingo, "sem
  reunião" em 25/10 → [04, 11, 18].
- `datasDeAula(inicio, fim, diaReuniao, eventos) → DataCivil[]` — B5 (individuais). Caso: out/2026
  com acampamento 16–18/10 (`cancelaReuniao`, `bomParaCampo`) → [04, 11, 16, 17, 18, 25].
- `emConflito(...)` — B6.
- `situacaoDaAula({ temRegistro, emConflito, data, hoje })` → `DADA` se tem registro; `CONFLITO`
  se `emConflito`; `HOJE` se `data === hoje`; `NAO_REGISTRADA` se `data < hoje`; senão `PLANEJADA`.

## 4. Leitura do cronograma

`GET /api/classes/:id/cronograma?anoClube` → `CronogramaLeitura`. `@Logado`; Adm qualquer classe;
instrutor só as do vínculo (senão 404); conselheiro 403.
- Quem pode montar recebe o **vivo** (`fonte: 'VIVO'`, `status` real); os demais recebem a última
  publicação (`fonte: 'PUBLICADO'`, `status: 'PUBLICADO'`); sem publicação → `aulas: []`, `status`
  null.
- Aulas do cronograma (`origem: 'PLANEJADA'`) com requisitos (CAMPO já com o ajuste do clube),
  `situacao` (§3) e `registroAulaId` = o `RegistroAula` da mesma (classe, data); **mais** os
  `RegistroAula` da classe no ano cuja data **não tem aula planejada ativa** (`origem: 'EXTRA'`,
  `id: null`, `DADA`). Ordem por data.
- Serviços reaproveitáveis: `ServicoCronograma.leitura(sessao, classeId, anoClube)`,
  `ServicoCronograma.ultimaPublicacao(clubeId, cronogramaId)` (o retrato, com `aulas` deduplicadas
  por id), `ServicoCalendario.situacoes(clubeId, inicio, fim) → Map<data, SituacaoData>`.

### 4.1 `instrutoresDaClasse(clubeId, classeId) → { usuarioId, nome }[]`

Em `cronogramas/`; B10. Teste de isolamento com a **mesma classe oficial** vinculada a instrutores
de dois clubes.

## 5. Notificações

`ServicoNotificacoes.notificar(tx, { clubeId, destinos: { usuarioId, link }[], tipo, titulo, texto })`
grava uma linha por pessoa (deduplica), apaga da mesma pessoa o que passar das 50 mais recentes.
Rotas `@Logado`, só as do próprio usuário no clube ativo: `GET /notificacoes` → `NotificacoesSaida`;
`POST /notificacoes/:id/lida`; `POST /notificacoes/lidas`. Web: `SinoNotificacoes` no cabeçalho
para INSTRUTOR (LayoutCelular) e ADM (LayoutAdm) — contador de não lidas; `/notificacoes` com
título, texto, data relativa e link (abrir marca lida); busca na abertura e a cada 2 min com a aba
visível; sem conexão esconde o contador.

## 6. Atividade

`ServicoAtividade.registrar(tx, { clubeId, autorId, tipo, descricao, link })`. Tipos:
`AULA_REGISTRADA` (Fase 2), `CRONOGRAMA_ENVIADO`, `CRONOGRAMA_PUBLICADO`, `EVENTO_CRIADO`
(Fase 3). A 1b não registra atividade; o feed da visão geral mostra só esses tipos (declarado).

## 7. Arquivos para documentos (API e nginx)

- `Armazenamento` ganha `gravarDeArquivo(caminho, origemTemporaria)` (move por `rename`, ou copia
  em *stream* se em outro volume) — sem ler o arquivo para a memória; atualizar os *fakes* de
  `arquivos.spec.ts`.
- `GET /api/arquivos/:id` passa a selecionar `mime` e servir com ele. PDF: `Content-Disposition:
  inline`; demais: `attachment`. Nome: `filename="<ASCII seguro>"; filename*=UTF-8''<encodeURIComponent(título.ext)>`
  (aspas, controles e barras removidos do título). Cabeçalhos: `X-Content-Type-Options: nosniff`
  sempre; `Content-Security-Policy: sandbox` **só nos não-PDF** (o visualizador de PDF do navegador
  não abre sob `sandbox`). Material removido → 404, como foto removida.
- `caminhoDoMaterial(clubeId, arquivoId, ext)` = `clube/<clubeId>/materiais/<AAAA>/<arquivoId>.<ext>`.
- nginx: `location /api/materiais/arquivo` com `client_max_body_size 21m`, repetindo `set $api`,
  `proxy_pass` e os cabeçalhos do `/api/` (location não herda); **sem** CSP própria (o teste
  `nginx-csp.test.ts` conta 4 blocos). Nota de deploy: o nginx do **host** (HTTPS, fora do repo)
  também precisa de `client_max_body_size 21m`.

## 8. Fábricas e e2e (assinaturas fixas — as Fases 2 e 3 só usam)

Em `apps/api/test/fabricas.ts`: `criarEvento({ clubeId, tipo, inicio, fim?, marcacoes? })`,
`criarCronograma({ clubeId, classeId, anoClube?, status?, aulas?: { data, requisitoIds }[] })`,
`publicarCronograma({ cronogramaId, publicadoPorId })` (grava o retrato do vivo),
`criarRegistroAula({ clubeId, classeId, data, presencas?, concluidos? })`,
`criarRequisitoConcluido({ clubeId, dbvId, requisitoId, concluidoEm?, registroAulaId? })`,
`criarEspecialidadeConcluida({ clubeId, dbvId, especialidadeId, concluidaEm? })`,
`criarNotificacao(...)`. Em `e2e/apoio/semear.ts`: um cliente Prisma para o banco do e2e com as
mesmas fábricas (os specs da Fase 2 e 3 semeiam por ele; só a base mexe em `e2e/global-setup.ts`).

## 9. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Fórmulas do §3 | Vitest | BA1 |
| Guarda: 14 modelos sem `clubeId` lançam | Jest | BA1 |
| Leitura: vivo × publicado por papel (status mascarado), aulas EXTRA, conflito só em individuais futuras sem registro, NAO_REGISTRADA, conselheiro 403, outra classe 404, isolamento | Jest | BA1 |
| `instrutoresDaClasse`: mesma classe oficial em dois clubes não se mistura; inativo fora | Jest | BA1 |
| Escopo B11: DESISTIU some do perfil/progresso do instrutor | Jest | BA1 |
| Notificações: por pessoa, dedupe, limite 50, só as suas, lida | Jest | BA1 |
| Arquivos: PDF inline sem `sandbox`, DOCX attachment com `sandbox`, nome com "Lição — 1" não quebra (500) e sai em `filename*`; `nosniff`; material removido 404; `gravarDeArquivo` não carrega o arquivo | Jest | BA1 |
| `nginx.conf`: o bloco novo tem o limite e o `proxy_pass`; os 4 de CSP continuam | Vitest | BA2 |
| Sino só para instrutor e Adm; lista; marcar lida; sem conexão; `sair()` limpa o cache | Vitest | BA2 |

## 10. Plano da base

Regras de execução: as do [PLANO da Fase 1](../fase-1/PLANO.md). **Rodar suíte**: os bancos de
teste são por execução (D11) — três sessões podem rodar ao mesmo tempo, mas a máquina é pequena:
no máximo 1 suíte completa por sessão de cada vez, com as flags de pouca memória do Jest.

**Onda 0 [principal]:** copia o schema e gera a migration (confere: sem DROP, 3 índices parciais,
nada em tabelas da 1a/1b); 14 modelos na guarda; contratos (+ `instrutor: null` nos dois lugares
do §1 item 2; `RequisitoSaida` com `oficial`/`ajustado` opcionais); `nginx.conf` (§7) e o teste;
módulos vazios `calendario, cronogramas, notificacoes, atividades` no `app.module.ts`; rotas
reservadas `/notificacoes` e `/cronograma/montar` no `rotas.tsx`. Baseline por nomes. Commit.

**Onda 1 [2 subagentes]:**

| Pacote | PODE TOCAR | NÃO TOCAR |
|---|---|---|
| BA1 · API da base | `packages/shared/src/formulas/calendario.ts` (+ teste); `apps/api/src/{calendario,cronogramas,notificacoes,atividades}/**`; `apps/api/src/arquivos/**`; `apps/api/src/desbravadores/escopo.service.ts` (B11, com teste); `apps/api/test/fabricas.ts` (só acrescentar §8) | web; módulos da 1b (`reunioes, ranking, inicio, fotos, pedidos, perfil`) |
| BA2 · Web da base | `apps/web/src/modulos/{notificacoes,cronograma-montagem}/**`, `apps/web/src/api/notificacoes.ts`, `testes/handlers/notificacoes.ts`, `ui/{AreaTexto,CampoData}.tsx`, o sino nos cabeçalhos de `LayoutCelular`/`LayoutAdm` (só acrescentar, só instrutor/Adm), `sessao/` (só o `queryClient.clear()` no sair), `e2e/apoio/semear.ts` | API; telas da 1b |

**Onda 2 — espera e fechamento:** se a 1b ainda não mesclou, **pare aqui** e avise ("base pronta,
esperando a 1b"). Com a 1b na `main`: rebase (§1.1, B1), suíte inteira contra um baseline novo
tirado da `main` com a 1b, revisão (opus) até limpa, `gestor-pr` tira do rascunho.

**Pronto:** `npm ci && npm run lint && npm run tipos && npm run teste && npm run build` verdes;
`npm run teste:e2e` (os da `main` no momento do rebase) verde; revisão limpa.

**Comando** — sessão nova em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a BASE das Fases 2 e 3.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/fase-2-3 · branch
feature/fase-2-3-base · commit-base main@b966352 · continue nesta branch e na PR em rascunho que já existe.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-2-3/SPEC.md (spec e plano da base). As specs das
Fases 0 e 1 valem onde esta não altera. Anexos de docs/fases/fase-2-3/anexos/ são contrato literal.

DECISÕES TRAVADAS: B1–B12 desta spec, E1–E22 da Fase 1, D1–D24 da Fase 0.
FORA DE ESCOPO: o que é próprio das Fases 2 e 3. Não mexa em módulos da 1b (que pode estar rodando).

EXECUÇÃO: SPEC §10, ondas 0 a 2 — a onda 2 só fecha depois do merge da 1b (rebase sobre ela; §1.1);
no máximo 2 implementadores (sonnet); revisões com opus; commit por onda; push e saída do rascunho
só pelo gestor-pr no fim.
GATE: "Pronto" do SPEC §10.
RETORNO: relatório de fechamento da skill orquestrador, com decisões fora da spec em PENDÊNCIAS.
```

---

## ONDE FICA (`main@b966352` — no rebase, compare com a `main` e acrescente o que a 1b mudou)

- fila offline: `apps/web/src/offline/tipos.ts:8-135` (`TipoFila`, `ItemFila`, `EntradaFila` 88-94, `ContextoEnvio` 57-63, `ContextoAposEnvio` 65-74); `registro.ts:9`; `fila.ts:33-95,97,148,253`; `motor.ts:100-258`; `tempos.ts:4,16,17`; público em `offline/index.ts:3-8`
- pacote: `apps/api/src/sync/sync.service.ts:12,30-71` (`PacoteSemVersao` 12 e 48; por papel na 46; `versao` na 69); contrato `packages/shared/src/contratos/sync.ts:16-43`; mock `apps/web/src/testes/handlers/offline.ts:9`
- pontos: `apps/api/src/pontos/servico-pontos.ts:11-28`; critérios REQUISITO/ESPECIALIDADE criados em `apps/api/src/scripts/clube-criar.ts:32-33,53`
- arquivos: `apps/api/src/arquivos/armazenamento.ts:8-12`; `servico-arquivos.ts:22` (`urlAssinada(clubeId, arquivoId, variante, agora?)`); `arquivos.controller.ts:44-47` (select sem `mime`), `:52` (JPEG fixo); fakes em `arquivos.spec.ts`
- guarda: `apps/api/src/comum/prisma/guarda-clube.ts:4-23`
- escopo: `apps/api/src/desbravadores/escopo.service.ts:19,25,33,41,50,56-58` (o filtro do instrutor só olha `classeId` e `anoClube`)
- shared: `index.ts:1-23`; `formulas/pontos.ts:36,58`; `formulas/progresso.ts:1-12`; `datas.ts:9,19,30`; `enums.ts:34` (`Horario`)
- web: `ui/` (sem textarea nem data); `layouts/LayoutCelular.tsx:11-18,27-32`; `layouts/LayoutAdm.tsx:12-20,40-41`; `rotas.tsx:17-42`; `sessao/ProvedorSessao.tsx`; `main.tsx:31` (`createRoot`)
- e2e: `e2e/offline.spec.ts:12`, `e2e/fundacao.spec.ts:55,66`, `e2e/global-setup.ts:14-60`
- produção: `apps/web/nginx.conf:9,16,30,50,59,69`; `apps/web/src/testes/nginx-csp.test.ts`; `docker-compose.prod.yml:28,37-38,48`; `apps/api/Dockerfile:38,43`
- conferido em `desbravadores@b966352`
