# Classe Bíblica — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** executar a [SPEC](SPEC.md). Edição da Classe Bíblica em três etapas, guardada no servidor;
encontros em lote no calendário; chamada por grupo com e sem internet; pontos no ranking; evidência
nos requisitos "participar ativamente".

**Architecture:** módulo novo na API (`apps/api/src/classe-biblica/`), com seis modelos novos numa
migration. A chamada trafega pela fila offline que já existe, por um tipo novo
(`offline/tipos/classe-biblica.ts`) e uma rota `PUT /sync/classe-biblica/...` idempotente por
`envioId`. O pacote de sync ganha `classeBiblica` para quem tem a permissão. Pontos só por
`ServicoPontos.sincronizar`. No web, um módulo do Adm (`modulos/adm/classe-biblica/`), uma tela de
chamada comum aos papéis (`modulos/classe-biblica/chamada/`) e um componente novo em `ui/`
(`IndicadorDeEtapas`).

**Tech Stack:** NestJS 11 + Prisma 7 (API, Jest sem checagem de tipos), React 19 + React Router 7 +
TanStack Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`, Postgres 17, Playwright (e2e,
headless, só no CI).

**Spec e modelo:** [SPEC.md](SPEC.md) e [modelo/](modelo/) — **o modelo vence a SPEC** (estrutura,
ordem e texto; nunca CSS). **Branch:** `fase/classe-biblica` · **Worktree:**
`/home/robertogabrieu/desbravadores/.claude/worktrees/classe-biblica` · **PR:** em draft
#<a definir> · **Base:** `6bc7e05`.

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared`; toda operação de
  modelo de clube leva `clubeId` (fora do clube ou do escopo, 404) e `include` aninhado leva
  `clubeId` no `where`, com teste de isolamento; ids do Prisma Client; nunca apagar linha com
  histórico (`removidoEm`); `LancamentoPontos` só por `ServicoPontos.sincronizar`; modelo novo de
  clube em `MODELOS_DE_CLUBE` na mesma migration; conflito de chamada por `versao`; conexão só por
  `useConexao`; tela com carregando, vazio, erro e sem conexão; imagem/arquivo só por URL assinada.
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** Componentes de `apps/web/src/ui/`
  nomeados na SPEC §Desenho; cor nova vira token em `ui/tokens.css` (a SPEC não pede nenhuma: a
  Classe Bíblica usa `--cal-evento-*`).
- **Nenhum elemento `fixed`/`sticky` novo.**
- **Testes antes da implementação, dentro de cada pacote:** escritos primeiro e vistos falhando;
  depois implementar; depois verde.
- **Validação pesada só no P9.** Por pacote: os testes do pacote e `tipos` do workspace, olhando só os
  erros nos arquivos do próprio pacote.
- **Não recolher baseline completo.** Falhou algo fora do pacote na rodada final: o testador confere
  só aquele arquivo na base `6bc7e05`.
- **Máquina fraca** — tudo pelo `pesado`, uma suíte pesada por vez:
  `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; testes de dentro do pacote,
  `cd apps/web|apps/api|packages/shared && pesado testar --script teste -- <caminhos>` (não passar
  `--maxWorkers`); tipos `pesado -- npm run tipos -w web|api|packages/shared`; lint
  `NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`; a espera da fila conta
  no tempo do Bash (`timeout: 600000` ou segundo plano).
- **`packages/shared` é consumido pelo `dist/` na API** (o web usa o `src/` por alias): mudou contrato
  ou fórmula, `pesado -- npm run build -w packages/shared` antes de testar a API.
- **Banco de teste da API é próprio por execução** (`apps/api/test/banco.ts`): duas suítes da API ao
  mesmo tempo não disputam banco, só memória. Migration só o principal escreve (P0), sem subagente no
  ar.
- **e2e nunca roda na máquina local**: só no CI.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`).

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| — | Abrir worktree, branch e PR em draft com SPEC + PLANO + modelo | **sessão** (já feita: esta worktree) / **agente principal** (commit e `gestor-pr`) | — |
| 0 | **P0** contratos, permissões, schema, migration, guarda, fábricas, cadernos, rotas, menu, handlers | **agente principal** (inline) | — |
| 1 | **P1** calendário à parte (shared + API + web do calendário) | subagente `implementador` | P0 |
| 1 | **P2** API: edição (rascunho, grupos, datas, terminar), painel, material | subagente `implementador` | P0 |
| 2 | **P3** API: encontros (remarcar/cancelar) e chamada (leitura, envio, pontos, pacote) | subagente `implementador` | P2 |
| 2 | **P5** web: lista, etapas, fechamento, `IndicadorDeEtapas`, cliente da API | subagente `implementador` | P0 |
| 3 | **P4** API: pontos configuráveis, carga, evidência na ficha | subagente `implementador` | P3 |
| 3 | **P6** web: painel, frequência, material, remarcar/cancelar | subagente `implementador` | P5 |
| 4 | **P7** web: tela da chamada e tipo da fila offline | subagente `implementador` | P3, P5 |
| 4 | **P8** web: cartão da chamada no início, quadro na ficha, seção de pontos | subagente `implementador` | P4, P5 |
| 5 | **P9** fase final: e2e, suítes, lint, build, medição, revisão, QA, docs, PR | `implementador` (e2e) → `gestor-pr` (push de revisão) → revisão → `testador` → `qa-runner` → `documentador` → `gestor-pr` | todos |

**Paralelo: no máximo dois implementadores por vez**, só com arquivos disjuntos (conferido nas listas):

| Onda | Par | Por que não se tocam |
|---|---|---|
| 1 | P1 ‖ P2 | P1 em `packages/shared/src/formulas/calendario*`, `apps/api/src/calendario/`, `apps/web/src/modulos/adm/calendario/`; P2 em `apps/api/src/classe-biblica/`, `app.module.ts`, `scripts/clube-criar.ts`, `apps/web/nginx.conf` |
| 2 | P3 ‖ P5 | P3 só API (`classe-biblica/` encontros e chamada, `sync/sync.*`); P5 só web (`ui/IndicadorDeEtapas*`, `api/classe-biblica.ts`, `modulos/adm/classe-biblica/` lista e etapas) |
| 3 | P4 ‖ P6 | P4 só API (`classe-biblica/pontos*`, módulo, `scripts/carga*`, `progresso/`); P6 só web (`modulos/adm/classe-biblica/` painel, frequência, material, remarcar) |
| 4 | P7 ‖ P8 | P7 em `modulos/classe-biblica/chamada/` e `offline/tipos/`; P8 em `modulos/inicio/`, `modulos/inicio-instrutor/`, `modulos/perfil/SecaoProgresso*`, `modulos/adm/configuracoes/` |

**Compilação entre as ondas** (esperado; não é defeito do pacote):
- Depois do P0 o web não compila em `adm/calendario/tipos.ts` (os `Record` por tipo ganharam
  `CLASSE_BIBLICA`) até o P1. `modulos/adm/classe-biblica/rotas.tsx` e
  `modulos/classe-biblica/rotas.tsx` importam telas que só existem depois de P5, P6 e P7. A API
  compila (enums novos não quebram `switch` existente, que não há).
- **Fim da onda 4: `pesado -- npm run tipos` da raiz verde**, conferido pelo principal.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 24 (shared 9, prisma 2, API 3, cadernos 4, web 6) — declarações e dados | agente principal — dono compartilhado |
| P1 | 10 | implementador |
| P2 | 12 | implementador |
| P3 | 9 | implementador |
| P4 | 8 | implementador |
| P5 | 10 | implementador |
| P6 | 6 | implementador |
| P7 | 7 | implementador |
| P8 | 8 | implementador |
| P9 | 1 (e2e) + roteiro de QA | implementador + testador + qa-runner + documentador + gestor-pr |
| **Total** | **~95** | 8 subagentes de pacote + os do P9 |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U, com 591k para 1–2
arquivos, 256k para 6–10 e 559k para 21+. Os pacotes delegados ficam entre 6 e 12 (teto 15).
Fatiado por **fluxo vertical** onde dá. P3 junta leitura e envio da chamada, que se testam juntos.
P8 junta três telas pequenas (de 2 arquivos cada) que sozinhas cairiam abaixo do piso. Juntar P3+P4
(17) ou P5+P6 (16) cairia no braço caro. Partir P2 em rascunho e painel (6 + 6) repagaria o piso
para arquivos que dividem o mesmo serviço e o mesmo módulo. P0 passa de 15, mas fica com o
principal: são contratos, schema, migration, `MODELOS_DE_CLUBE`, permissões, fábricas, handlers,
rotas e menu — os ímãs de conflito que três ou mais pacotes importam (§8). P9 tem 1 arquivo e mesmo
assim é delegado: a saída de suíte e e2e não pode entrar no contexto do principal.

Orçamento por implementador: **~80 turnos**.

---

## P0 — contratos, schema, migration, rotas · agente principal (inline), onda 0

**Por que inline:** todos os pacotes importam estes arquivos; escritos antes, nenhum par de pacotes
edita o mesmo.

**Arquivos (lista fechada):**
- `packages/shared/src/enums.ts:36` — `TIPOS_EVENTO` + `'CLASSE_BIBLICA'` no fim.
- `packages/shared/src/formulas/pontos.ts:3-11` — `GatilhoCriterio` + `CLASSE_BIBLICA_PRESENCA`, `CLASSE_BIBLICA_PARTICIPACAO`.
- `packages/shared/src/permissoes.ts:12-33` — `classebiblica.chamada` (`{ ADM: true, CONSELHEIRO: false, INSTRUTOR: false }`) e `classebiblica.gerenciar` (`{ ADM: true }`), rótulos da SPEC §Permissões.
- `packages/shared/src/permissoes.test.ts:7` — total de 22 para 24; um caso: Conselheiro com ajuste `classebiblica.chamada` concedida a recebe; `classebiblica.gerenciar` não se aplica a ele.
- Criar `packages/shared/src/contratos/classe-biblica.ts` — entradas e saídas de todas as rotas da SPEC §API (lista, rascunho, grupos, datas, terminar, painel, frequência, material, encontros, chamada GET/PUT com `versaoVista` e conflitos, pontos) e `PacoteClasseBiblica`.
- `packages/shared/src/index.ts` — exporta o contrato novo.
- `packages/shared/src/contratos/sync.ts:56-87` — `classeBiblica: PacoteClasseBiblica.nullable().default(null)`.
- `packages/shared/src/contratos/progresso.ts:23-27` — `RequisitoDoDbv.classeBiblica` (SPEC §API, ficha) `.nullable().default(null)`.
- `packages/shared/src/contratos/calendario.ts:19` — evento ganha `classeBiblica: { edicaoId, grupos, cancelado, motivo } | null` com default `null`.
- `apps/api/prisma/schema.prisma` — enums (`:87-96`, `:118-123`, `:131-138`), `Requisito.classeBiblica` (`:542-559`), os seis modelos da SPEC §Dados e as relações de volta (`Clube`, `Unidade`, `Desbravador`, `Usuario`, `Arquivo`, `EventoCalendario`).
- Criar `apps/api/prisma/migrations/20261010120000_classe_biblica/migration.sql` — gerada por `prisma migrate dev --create-only`, mais o `UPDATE "Requisito"` das quatro marcas (join `SecaoRequisito`/`Classe` por trilha, nome da classe, código da seção e do requisito).
- `apps/api/src/comum/prisma/guarda-clube.ts:4-38` e `guarda-clube.spec.ts` — os seis modelos.
- `apps/api/test/fabricas.ts` — `criarEdicaoCB`, `criarGrupoCB` (com unidades), `criarEncontroCB` (cria o evento junto), `criarPresencaCB`, no molde de `criarEvento` (`:412`).
- `docs/planejamento/dados/cadernos/{amigo,companheiro,pesquisador}.json:47` e `agrupadas.json:101` — `"classeBiblica": true` nesses requisitos.
- `apps/web/src/layouts/LayoutAdm.tsx:16-27` — item "Classe Bíblica" (ícone `BookOpen`) depois de "Cronogramas".
- `apps/web/src/rotas.tsx:60-110` — `rotasAdmClasseBiblica` no grupo do Adm; `rotasClasseBiblica` (chamada) no grupo `CONSELHEIRO`/`INSTRUTOR` com `LayoutDoPapel`.
- Criar `apps/web/src/modulos/adm/classe-biblica/rotas.tsx` e `apps/web/src/modulos/classe-biblica/rotas.tsx` — os caminhos da SPEC §Telas, apontando para os componentes com os nomes dos pacotes (`ListaEdicoes`, `EtapaDados`, `EtapaGrupos`, `EtapaDatas`, `EdicaoPronta`, `PainelEdicao`, `RemarcarEncontro`, `TelaChamadaCB`).
- Criar `apps/web/src/testes/handlers/classe-biblica.ts` e ajustar `apps/web/src/testes/handlers/offline.ts` (`classeBiblica: null` no pacote) — fixtures com os nomes e números do modelo (Grupo Daniel: Águias 10, Leões 10, Gaviões 11; Grupo Ester: Falcões 9, Panteras 10; Tigres de fora).

- [ ] **Passo 1:** escrever os arquivos acima.
- [ ] **Passo 2:** `pesado -- npm run build -w packages/shared`; aplicar a migration num banco de dev e conferir `\d "PresencaClasseBiblica"` e o `UPDATE` (4 linhas afetadas num banco com a carga).
- [ ] **Passo 3:** `cd packages/shared && pesado testar --script teste -- src/permissoes.test.ts`; `cd apps/api && pesado testar --script teste -- src/comum/prisma/guarda-clube.spec.ts`.
- [ ] **Passo 4:** commit `feat(classe-biblica): contratos, permissões e migration`.

**Pronto quando:** migration aplica, as duas suítes acima ficam verdes e `tipos -w packages/shared`
e `tipos -w api` ficam verdes.

---

## P1 — calendário à parte · implementador, onda 1

**Cobre os critérios:** 12, 13, 14 e a parte de calendário do 16 (riscado).

**Arquivos que pode alterar (lista fechada):**
- `packages/shared/src/formulas/calendario.ts:56-62` — `situacaoDaData` ignora `CLASSE_BIBLICA` (não entra em `comuns` nem em `extra`).
- `packages/shared/src/formulas/calendario.test.ts`.
- `apps/api/src/calendario/servico-eventos.ts:81,103-141` — a listagem preenche `classeBiblica` (edição, grupos, cancelado, motivo) pelo encontro do evento; criar, editar e remover evento `CLASSE_BIBLICA` respondem `ErroApp` "Este encontro é da Classe Bíblica: remarque ou cancele pela edição.".
- `apps/api/src/calendario/eventos.spec.ts`.
- `apps/web/src/modulos/adm/calendario/tipos.ts:10-48` — rótulo "Classe Bíblica", `--cal-evento-*`, `BookOpen`, ponto.
- `apps/web/src/modulos/adm/calendario/CalendarioDoCelular.tsx:19,130` — cartão riscado com "Cancelado: <motivo>"; linha com grupos (`Calendario-Adm`, `Calendario-Celular`).
- `apps/web/src/modulos/adm/calendario/FichaEvento.tsx:97` — "Abrir a edição" no lugar de Editar/Remover para `CLASSE_BIBLICA`.
- `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:41,122-123` — o seletor não oferece `CLASSE_BIBLICA`.
- `apps/web/src/modulos/adm/calendario/calendario-celular.test.tsx` e `ficha.test.tsx`.

**Não pode tocar:** `packages/shared/src/contratos/`, `enums.ts`, `schema.prisma`, migrations,
`apps/api/src/classe-biblica/`, qualquer arquivo de `cronograma-montagem/` ou `inicio/` (eles só
consomem `situacaoDaData`).

**Testes (antes):** fórmula — dia de reunião com evento Classe Bíblica continua `temReuniao` e
`temClasse` iguais ao dia sem evento; `datasDaMontagem` idêntica com e sem o evento. API — POST,
PATCH e DELETE de evento Classe Bíblica recusados; listagem traz `classeBiblica` com cancelado e
motivo; isolamento de clube. Web — cartão lilás com livro e texto; cancelado riscado com motivo;
ficha sem Editar e com "Abrir a edição"; seletor sem o tipo.

**Pronto quando:** testes acima verdes; `tipos -w web` sem erro em `adm/calendario/`.

---

## P2 — API: edição, painel, material · implementador, onda 1

**Cobre os critérios:** 5, 6, 7, 8, 9, 10 (lado API), 34, 35 (lado API), e o "Em andamento/Encerrada" da lista.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/api/src/classe-biblica/classe-biblica.module.ts`, `edicoes.controller.ts`, `servico-edicoes.ts` (rascunho, grupos, datas da etapa 3, terminar), `servico-painel.ts` (lista, painel, frequência), `frequencia.ts` (conta X de Y por desbravador e data, regra 11 da SPEC — P4 a reaproveita), `escopo-grupos.ts` (grupos visíveis à sessão, regra 9), `criterios.ts` (garante os dois critérios, D3).
- `apps/api/src/app.module.ts` — registra o módulo.
- `apps/api/src/scripts/clube-criar.ts:27-34` — os dois critérios em clube novo.
- `apps/web/nginx.conf:32-40` — `location ~ ^/api/classe-biblica/grupos/[^/]+/material/arquivo$` com `client_max_body_size 21m`, repetindo o proxy do bloco de `/api/materiais/arquivo`. O nginx do host já aceita 21m (`scripts/nginx-host.conf:21`): nada a mudar fora do repo.
- Criar `apps/api/src/classe-biblica/edicoes.spec.ts` e `painel.spec.ts`.

**Não pode tocar:** `packages/shared` (contratos são do P0: se faltar campo, **pare e reporte**),
`schema.prisma`, migrations, `guarda-clube.ts`, `apps/api/src/calendario/`, `sync/`, `progresso/`.

**Regras a seguir:** SPEC §Regras 1–5, 7 (só a leitura do estado), 9, 12; datas pela `situacaoDaData`
e pelos eventos Férias/Feriado/Sem reunião; terminar numa transação (encontros + eventos +
critérios); upload como `materiais.controller.ts:45-52` (`FileInterceptor`, 20 MB, só PDF, mime da
tabela `FORMATOS_MATERIAL`), arquivo em `Arquivo`, URL assinada como `materiais.service.ts:248`.

**Testes (antes):** rascunho criado com só o nome e retomado; grupos com unidade repetida na edição
recusados; unidade em edição terminada com período cruzado recusada ao salvar grupos e ao terminar;
datas: 17 domingos com 2 desmarcadas e o motivo "Sem reunião: Páscoa"; terminar cria N encontros e
N eventos `CLASSE_BIBLICA`, cria os critérios uma vez só (duas edições → ainda 2 critérios); lista com
as três situações, e material faltando não muda a situação; painel com frequência média, encontros
feitos e cancelados; frequência por desbravador ordenada do menor para o maior; material PDF e link,
troca marca `removidoEm` no anterior; 25 MB recusado; Conselheiro sem grupo no escopo recebe 404 no
painel; sem `classebiblica.gerenciar`, 403; outro clube, 404.

**Pronto quando:** testes acima verdes; `tipos -w api` verde.

---

## P3 — API: encontros e chamada · implementador, onda 2

**Cobre os critérios:** 15, 16, 17, 18, 20 (idempotência), 21, 24, 25 (lado API), 26, 27, e o pacote do 22.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/api/src/classe-biblica/encontros.controller.ts` e `servico-encontros.ts` (remarcar, cancelar, desfazer — SPEC regra 7, mexendo também no `EventoCalendario` do encontro).
- Criar `apps/api/src/classe-biblica/chamada.controller.ts` e `servico-chamada.ts` (GET da lista da data, regra 8; `PUT /sync/classe-biblica/encontros/:id/grupos/:grupoId` com `envioId` em `EnvioClasseBiblicaProcessado`, conflito por `versaoVista`, pontos pela regra 10). Molde: `reunioes-envio.service.ts:71-98` (idempotência), `:205-216` (membro na data), `:319-351` (pontos).
- `apps/api/src/classe-biblica/classe-biblica.module.ts` — registra os dois controllers.
- `apps/api/src/sync/sync.service.ts:40-75` — `classeBiblica` no pacote para quem tem `classebiblica.chamada` (SPEC §API, pacote), pelos grupos de `escopo-grupos.ts` do P2.
- Criar `apps/api/src/classe-biblica/encontros.spec.ts` e `chamada.spec.ts`; ajustar `apps/api/src/sync/sync.spec.ts`.

**Não pode tocar:** `packages/shared`, `schema.prisma`, migrations, `servico-edicoes.ts`,
`servico-painel.ts`, `frequencia.ts` (do P2), `pontos/servico-pontos.ts`, `reunioes/`.

**Testes (antes):** remarcar move encontro e evento e guarda `dataOriginal`; nova data no passado ou
igual a outro encontro, recusada; cancelar com motivo, desfazer até a data e recusado depois;
remarcar/cancelar com chamada de qualquer grupo → 409; chamada antes da data ou em cancelado,
recusada; lista da data por unidade vigente (entrou dia 01/10 aparece em 11/10; saiu antes não);
`participou` de ausente grava `false`; mesmo `envioId` duas vezes não duplica nem relança pontos;
conflito por `versaoVista` velha; pontos 10 + 5, estorno ao virar falta, nada de desconto, critério
inativo não lança; Conselheiro só vê grupo com unidade dele (404 no outro), Instrutor pelos
desbravadores das classes dele; pacote: só com a permissão, janela hoje−7 a hoje+7, sem cancelados,
com presenças e versões; isolamento de clube em todos os `include`.

**Pronto quando:** testes acima verdes; `sync.spec.ts` verde; `tipos -w api` verde.

---

## P4 — API: pontos, carga, ficha · implementador, onda 3

**Cobre os critérios:** 28 (lado API), 29, 30, 31, 32 (lado API) e a marca D1 pela carga.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/api/src/classe-biblica/pontos.controller.ts` (`GET`/`PATCH /classe-biblica/pontos`, `ranking.configurar`, usa `criterios.ts`) e `pontos.spec.ts`.
- `apps/api/src/classe-biblica/classe-biblica.module.ts` — registra o controller e exporta o que a ficha usa.
- `apps/api/src/scripts/carga.ts:10-15,223-257` — `classeBiblica` opcional no requisito, gravado na criação e na atualização.
- `apps/api/src/scripts/carga.spec.ts`.
- `apps/api/src/progresso/servico-progresso.ts:160-200` — preenche `classeBiblica` nos requisitos com a marca (regra 11), com `frequencia.ts` do P2.
- `apps/api/src/progresso/progresso.module.ts` — importa o módulo da Classe Bíblica.
- `apps/api/src/progresso/progresso.spec.ts`.

**Não pode tocar:** `packages/shared`, `schema.prisma`, migrations, os outros arquivos de
`classe-biblica/`, `requisitos-dbv.service.ts`, `pontos/servico-pontos.ts`.

**Testes (antes):** PATCH muda pontos e ativo; os lançamentos antigos não mudam; GET em clube sem
critério os cria; carga com `"classeBiblica": true` liga a marca, e rodar de novo não muda nada;
ficha: edição mais recente com encontro feito; "feito" exige chamada do grupo; troca de unidade no
meio conta o grupo da data; sem grupo em nenhuma data → `semGrupo`; anteriores só com Y > 0;
requisito sem a marca → `null`; conselheiro fora do escopo não vê a ficha (já é 404 hoje).

**Pronto quando:** testes acima verdes; `tipos -w api` verde.

---

## P5 — web: lista, etapas, fechamento · implementador, onda 2

**Cobre os critérios:** 1, 2, 3, 4, 5, 6, 7 (tela), 8, 9, 10, 11.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/web/src/ui/IndicadorDeEtapas.tsx` (SPEC §Telas) e `apps/web/src/ui/IndicadorDeEtapas.test.tsx`.
- Criar `apps/web/src/api/classe-biblica.ts` — **todas** as funções de cliente das rotas de leitura e gestão da SPEC §API (inclusive painel, material, encontros e pontos, que P6 e P8 usam). O envio da chamada não entra: ele é da fila.
- Criar `apps/web/src/modulos/adm/classe-biblica/ListaEdicoes.tsx` (`Lista-Edicoes`, `Lista-Vazia`), `EtapaDados.tsx` (`Edicao-1-Dados`, `Edicao-1-Erro`), `EtapaGrupos.tsx` (`Edicao-2-Grupos`), `EtapaDatas.tsx` (`Edicao-3-Datas`), `EdicaoPronta.tsx` (`Edicao-Pronta`), `useRascunhoDaEdicao.ts` (salva ao sair do campo e ao trocar de etapa; "Salvo às HH:MM" em região viva educada; sem conexão, o aviso da D11) e `edicao.test.tsx`.

**Não pode tocar:** `rotas.tsx` (do P0), `LayoutAdm.tsx`, outros arquivos de `ui/`,
`testes/handlers/` (se faltar fixture, **reporte**: é do principal), `modulos/adm/calendario/`.

**Componentes:** `CabecalhoDaPagina`, `Cartao`, `Campo`/`CampoRotulado`, `CampoData`, `Selecao`,
`CaixaMarcacao`, `Botao`, `Selo`, `EstadoVazio`, `Carregando`/`ErroDeCarga`/`DisponivelComInternet`,
`useErrosAVista`/`ResumoDosErros`, `BarraProgresso` (se o indicador a usar por dentro).

**Testes (antes):** os critérios acima, um caso cada, com MSW; o indicador com `role`, `aria-valuenow`
e `aria-valuetext`; total sempre 3; caixa de unidade desabilitada com "no Grupo …" e "na <edição>";
grupo sem material segue sem aviso; fechamento com "ainda sem material" e um botão só.

**Pronto quando:** testes acima verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P6 — web: painel e encontro · implementador, onda 3

**Cobre os critérios:** 15, 16, 17 (tela), 35 (tela), e os itens de painel do 8.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/web/src/modulos/adm/classe-biblica/PainelEdicao.tsx` (`Painel-Edicao`: abas por grupo, próximo encontro, frequência, material, encontros feitos e cancelados; "Ver" abre a chamada, D13; "Editar edição" abre as etapas 1 e 2, D14), `FrequenciaDoGrupo.tsx` (lista na própria página, D12), `MaterialDoGrupo.tsx` (anexar, trocar e o estado sem material), `RemarcarEncontro.tsx` (`Encontro-Remarcar`: remarcar, cancelar com motivo, desfazer, estado com chamada), `painel.test.tsx` e `remarcar.test.tsx`.

**Não pode tocar:** `api/classe-biblica.ts` (do P5: se faltar função, **reporte**), os arquivos do
P5, `rotas.tsx`, `ui/`, `testes/handlers/`.

**Testes (antes):** painel com os números do modelo; aba troca o grupo; grupo sem material mostra
"Ainda sem material de estudo" e "Anexar PDF ou link"; PDF acima de 20 MB mostra o erro sem perder
nada; remarcar e cancelar com confirmação que diz o que muda; encontro com chamada mostra o texto e
nenhuma ação; cancelado mostra "Desfazer" só até a data; quatro estados.

**Pronto quando:** testes acima verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P7 — web: chamada e fila offline · implementador, onda 4

**Cobre os critérios:** 18, 19, 20, 22, 23, 24 (lado web).

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/web/src/modulos/classe-biblica/chamada/TelaChamadaCB.tsx` (`Chamada-Encontro`, `Chamada-Estados`, `Chamada-SemConexao`; lê do pacote e, com conexão, da API), `estado.ts` (todos presentes; alternar falta trava e desmarca a participação; totais), `estado.test.ts`, `chamada.test.tsx`.
- Criar `apps/web/src/offline/tipos/classe-biblica.ts` (tipo da fila, no molde de `offline/tipos/reuniao.ts`: envio, fusão por última ação por desbravador, conflito por versão, rebaixar o pacote no fim, `:74`) e `classe-biblica.test.ts`.
- `apps/web/src/offline/tipos/todos.ts` — importa o tipo novo.

**Não pode tocar:** `offline/motor.ts`, `fila.ts`, `pacote.ts`, `tipos/reuniao.ts`, `tipos/aula.ts`,
`modulos/reunioes/`, `api/classe-biblica.ts`, `rotas.tsx`.

**Testes (antes):** começa com todos presentes; tocar no nome alterna; participação desabilitada e
desmarcada em quem faltou, com o `aria-label`; totais ao vivo; salvar sem conexão mostra "Chamada
guardada no aparelho" com os totais; item da fila com mesmo `envioId` não duplica; sem a chamada no
pacote e sem conexão, o estado do modelo; grupo vazio na data; erro com "Tentar de novo"; conexão só
por `useConexao`.

**Pronto quando:** testes acima verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P8 — web: início, ficha e pontos · implementador, onda 4

**Cobre os critérios:** 25 (tela), 28 (tela), 29, 30 (tela), 33 (lado web: nada a fazer além de
conferir que a tela de permissões lista a chave nova).

**Arquivos que pode alterar (lista fechada):**
- `apps/web/src/modulos/inicio/InicioConselheiro.tsx` e `inicio.test.tsx` — cartão "Classe Bíblica · <data>" com "Fazer a chamada do <grupo>" (D9), lido do pacote, só com `pode('classebiblica.chamada')`.
- `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:193` e `inicio-instrutor.test.tsx` — o mesmo cartão.
- `apps/web/src/modulos/perfil/SecaoProgresso.tsx:110-131` e `SecaoProgresso.test.tsx` — quadro do `Progresso-Requisito`, com a linha "Antes: …".
- `apps/web/src/modulos/adm/configuracoes/AdmConfiguracoes.tsx:118-214` e `configuracoes.test.tsx` — seção "Pontos da Classe Bíblica" (D15), com `Campo` numérico e `Interruptor`.

**Não pode tocar:** `api/classe-biblica.ts` (do P5), `offline/`, `modulos/classe-biblica/`,
`rotas.tsx`, `ui/`.

**Testes (antes):** cartão aparece no dia e até 7 dias depois enquanto não há chamada, some com a
chamada feita, não aparece sem a permissão nem para grupo fora do escopo, e funciona sem conexão
(pacote); ficha com os números do modelo, a linha "Antes" e o caso sem grupo; requisito sem a marca
sem quadro; seção de pontos salva e mostra "Salvo".

**Pronto quando:** testes acima verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P9 — fase final

- [ ] **e2e** (implementador; escreve, não roda): `e2e/classe-biblica.spec.ts` — Adm cria a edição
  com dois grupos e um sem material, vê os encontros no calendário, faz a chamada sem rede, a
  conexão volta e o painel e o ranking mostram o resultado. Molde: `e2e/offline.spec.ts`.
- [ ] **Push de revisão** (`gestor-pr`, PR em draft #<a definir>) e **revisão da PR inteira**
  (`rules/pr-pronta.md` passos 3–4), até três rodadas.
- [ ] **Suíte completa uma vez** (`testador`, `pesado testar --tudo`), lint, `tipos` da raiz,
  `build`. Falha fora de pacote: conferir só aquele arquivo na base `6bc7e05`.
- [ ] **Medição no DOM** (critério 37) e **QA** pelo roteiro abaixo (`qa-runner`).
- [ ] **`documentador`** com a branch e a base.
- [ ] **`gestor-pr`**: sobe o resto e tira do rascunho; o e2e é o do CI.

### Roteiro de QA (um item por critério; quadro do modelo entre parênteses)

1. Lista vazia e bloqueio sem unidades (`Lista-Vazia`) — critérios 1, 2.
2. Etapa 1 com o dia e o local vindos da configuração, o horário vazio e o erro de data ao sair do campo (`Edicao-1-*`) — 3, 4.
3. "Salvo às…", fechar a aba e retomar pela lista; repetir em outro navegador (`Lista-Edicoes`) — 5.
4. Etapa 2: unidade travada em outro grupo e em outra edição; grupo sem material (`Edicao-2-Grupos`) — 6, 7, 8.
5. Etapa 3: datas desmarcadas com motivo; remarcar uma (`Edicao-3-Datas`) — 9.
6. Criar e ver o fechamento; o calendário com os encontros em lilás (`Edicao-Pronta`, `Calendario-Adm`, `Calendario-Celular`) — 10, 11, 13, 14.
7. Domingo com reunião e Classe Bíblica: a reunião continua — 12.
8. Remarcar, cancelar e desfazer; encontro com chamada travado (`Encontro-Remarcar`, `Painel-Edicao`) — 15, 16, 17.
9. Chamada: todos presentes, falta trava a participação, totais, salvar (`Chamada-Encontro`) — 18, 19, 20.
10. Chamada sem rede e volta da conexão; estados (`Chamada-SemConexao`, `Chamada-Estados`) — 22, 23.
11. Conselheiro com a permissão: cartão no início, só o grupo dele — 25.
12. Ranking do mês com os pontos; mudar os pontos em Configurações — 26, 27, 28.
13. Ficha de Lívia: G6 com os números e a linha "Antes" (`Progresso-Requisito`) — 29, 30, 31.
14. Permissões de um Conselheiro — 33.
15. Material: PDF de 15 MB em produção e de 25 MB recusado — 35.
16. Medição em 360/390/820/1280 px — 37.

### Gate

```
PR: <url> — pronta para revisão · revisão limpa em <n> rodada(s)
```

Ela só sai do rascunho com: revisão sem achado Critical ou Important em aberto; suíte de API e web
verde (falha fora do pacote conferida na base); lint, `tipos` e `build` verdes; e2e verde no CI;
roteiro de QA com todos os itens PASSOU; corpo da PR com o aviso de deploy (migration antes do
código novo; `scripts/carga.sh` só se a carga rodar de novo — a migration já liga as quatro
marcas). Se ficar em rascunho, o motivo vai para a PR e para o fechamento.

## O que não quebra (verificado)

- **Reunião e chamada da reunião:** nenhum arquivo de `reunioes/` nem `EnvioProcessado` muda (D2).
  Os testes de `apps/api/src/reunioes/` e `apps/web/src/modulos/reunioes/` não precisam mudar.
- **Registro da classe e tarefa para casa:** nada em `aulas/`, `RegistroAula`, `TarefaCasa`.
- **Material de classe:** `Material` e `materiais/` intactos (D7); o `location` novo do nginx não
  muda o de `/api/materiais/arquivo`.
- **Regra do dia:** `situacaoDaData` só muda para o tipo novo. Os casos atuais de
  `calendario.test.ts` não mudam de resultado, porque nenhum evento existente é `CLASSE_BIBLICA`.
- **Pacotes guardados antes:** `classeBiblica` com `default(null)` mantém válidos os pacotes e os
  mocks antigos, como `instrutor` (`contratos/sync.ts:86`).
- **Ficha:** `RequisitoDoDbv.classeBiblica` com `default(null)`; requisitos sem a marca não mudam.
- **Ranking:** `calculo-ranking.ts` não muda — ele soma todo `LancamentoPontos` do mês.
- **Adm:** `permissoesEfetivas` devolve todas as chaves ao Adm (`permissoes.ts:57-58`); só o total do
  teste (22 → 24) muda.
- **Nginx do host:** já aceita 21 MB (`scripts/nginx-host.conf:21`).

## Contrato de retorno (todo subagente)

1. Pacote e critérios da SPEC que fechou (pelos números).
2. Arquivos tocados — caminhos, nunca conteúdo.
3. Testes: quantos verdes e os nomes que falharam.
4. Decisões que tomou sozinho, uma linha cada (impasse → escolha).
5. Pendências, inclusive o que faltou em arquivo que não podia tocar.

Sem diff colado, sem trecho de arquivo, sem recapitular a SPEC.

## Comando de execução

```
Use a skill `orquestrador`.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/classe-biblica, branch
fase/classe-biblica, PR em draft #<a definir> (continue nelas; não crie branch nem PR novos).
Base 6bc7e05.

LEIA PRIMEIRO: docs/fases/classe-biblica/PLANO.md (inteiro) e docs/fases/classe-biblica/SPEC.md
(inteiro, uma vez). O modelo em docs/fases/classe-biblica/modelo/ vence a SPEC; dele não se copia CSS.

DECISÕES TRAVADAS (não reabrir): as 18 da tabela "Decisões" da SPEC e as 5 "Regras de negócio
respondidas pelo usuário". Em especial: módulo próprio (não reaproveita Reuniao/Chamada nem
RegistroAula); material opcional; encontro com chamada não remarca nem cancela; calendário não
edita encontro da Classe Bíblica; participação travada em quem faltou; chamada offline pelo pacote
para quem tem classebiblica.chamada; critérios 10 e 5 criados pelo código; falta não desconta;
requisito continua de marcação manual.

FORA DE ESCOPO: a seção "Fora de escopo" da SPEC — visitantes, tela da Classe Bíblica para o
desbravador, desconto por falta, marcação automática de requisito, requisitos "ajudar a organizar"
e "convidar pessoas", relatórios além do painel, encontro avulso, tela geral de critérios do ranking.
Achado fora disso vira pendência no fechamento, não conserto de passagem.

EXECUÇÃO: P0 pelo agente principal, inline, antes de delegar. Depois as ondas 1–4 do plano, com no
máximo dois implementadores em paralelo e só nos pares listados; commit por pacote. P9 no fim, na
ordem do plano (revisão antes da suíte). Nenhum subagente roda git.

GATE: o bloco "Gate" do plano — revisão limpa, suítes de API e web verdes, lint, tipos e build
verdes, e2e verde no CI, roteiro de QA todo PASSOU, e a PR fora do rascunho.

REPORTE: o fechamento do orquestrador (FEITO por pacote, SUÍTE, DOCS, PENDÊNCIAS, PR) e as
decisões que algum pacote tomou sozinho, uma linha cada.
```

## ONDE FICA

```
- regra do dia (reunião extra à parte)             packages/shared/src/formulas/calendario.ts:56-92
- enums e tipos de evento                          packages/shared/src/enums.ts:36-37 ; apps/api/prisma/schema.prisma:87-96, :118-123, :131-138
- gatilhos (shared)                                packages/shared/src/formulas/pontos.ts:3-11
- catálogo de permissões e teste                   packages/shared/src/permissoes.ts:12-75 ; permissoes.test.ts:7
- contratos: pacote, ficha, calendário             packages/shared/src/contratos/sync.ts:56-87 ; progresso.ts:23-27 ; calendario.ts:19
- configuração do clube (dia, hora, local)         apps/api/prisma/schema.prisma:221-237
- unidade na data                                  apps/api/prisma/schema.prisma:467-483 ; apps/api/src/reunioes/reunioes-envio.service.ts:205-216
- requisito, carga, cadernos                       apps/api/prisma/schema.prisma:542-559 ; apps/api/src/scripts/carga.ts:10-22, :110, :223-257 ; docs/planejamento/dados/cadernos/{amigo,companheiro,pesquisador}.json:47 ; agrupadas.json:101
- critérios padrão e única escrita de pontos       apps/api/src/scripts/clube-criar.ts:27-48 ; apps/api/src/pontos/servico-pontos.ts:28-60 ; schema.prisma:627-648, :724-746
- envio idempotente, pontos e conflito da reunião  apps/api/src/reunioes/reunioes-envio.service.ts:71-98, :319-351 ; schema.prisma:682-722, :828-838, :992
- ranking do mês                                   apps/api/src/ranking/calculo-ranking.ts:63-90
- escopo (conselheiro, instrutor, permissões)      apps/api/src/desbravadores/escopo.service.ts:28-60
- ficha do DBV                                     apps/api/src/progresso/servico-progresso.ts:160-200 ; apps/web/src/modulos/perfil/SecaoProgresso.tsx:110-131
- eventos: rotas e serviço                         apps/api/src/calendario/eventos.controller.ts:69-94 ; servico-eventos.ts:81, :103-141
- calendário do Adm (web)                          apps/web/src/modulos/adm/calendario/tipos.ts:10-48 ; CalendarioDoCelular.tsx:19,130,170 ; FichaEvento.tsx:97 ; FormularioEvento.tsx:41,122-123
- upload de material e URL assinada                apps/api/src/materiais/materiais.controller.ts:16, :39-64 ; materiais.service.ts:248 ; schema.prisma:748-767
- nginx (repo e host)                              apps/web/nginx.conf:16, :32-40 ; scripts/nginx-host.conf:21
- pacote de sync                                   apps/api/src/sync/sync.service.ts:15, :40-75 ; apps/web/src/offline/pacote.ts:14-47 ; apps/web/src/sessao/ProvedorSessao.tsx:116-118
- fila offline (molde)                             apps/web/src/offline/tipos/reuniao.ts:74 ; tipos/todos.ts
- chamada da reunião (molde de estado)             apps/web/src/modulos/reunioes/chamada/estado.ts:41, :130
- permissão no front                               apps/web/src/sessao/useSessao.ts:20 ; ProvedorSessao.tsx:349-356
- rotas, menu, layouts                             apps/web/src/rotas.tsx:60-110 ; apps/web/src/layouts/LayoutAdm.tsx:16-27
- início do conselheiro e do instrutor             apps/web/src/modulos/inicio/InicioConselheiro.tsx:68 ; apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:193
- configurações do clube (web)                     apps/web/src/modulos/adm/configuracoes/AdmConfiguracoes.tsx:118-214
- componentes de tela                              apps/web/src/ui/ (BarraProgresso.tsx:11, Campo.tsx:18-51, EstadoVazio.tsx:10, EstadosDeCarga.tsx:10-30, ErrosDoFormulario.tsx:37-58)
- guarda de clube                                  apps/api/src/comum/prisma/guarda-clube.ts:4-40
- fábricas e banco de teste                        apps/api/test/fabricas.ts:109-440 ; apps/api/test/banco.ts
- e2e de referência (offline)                      e2e/offline.spec.ts
- conferido em                                     6bc7e05
```
