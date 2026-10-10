# Classe Bíblica — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** executar a [SPEC](SPEC.md). Edição da Classe Bíblica em três etapas, guardada no servidor;
encontros em lote no calendário; chamada por grupo com e sem internet; pontos no ranking; evidência
nos requisitos "participar ativamente".

**Architecture:** módulo novo na API (`apps/api/src/classe-biblica/`), com sete modelos novos numa
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
  mesmo tempo não disputam banco, só memória. Migration só o principal escreve (P0a), sem subagente no
  ar.
- **e2e nunca roda na máquina local**: só no CI.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`).

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| — | Worktree, branch e PR em draft com SPEC + PLANO + modelo | **sessão** (já existe) / **agente principal** (commit e `gestor-pr`) | — |
| 0 | **P0a** shared, permissões, schema, migration, guarda, tipos do calendário | **agente principal** (inline) | — |
| 0 | **P0b** fábricas da API e handlers da web da Classe Bíblica | **agente principal** (inline, 2 arquivos) | P0a |
| 1 | **P1** calendário à parte (shared + API + web do calendário) | subagente `implementador` | P0a |
| 1 | **P2** API: edição, painel, frequência, material, `garantirCriterios` | subagente `implementador` | P0b |
| 2 | **P3** API: encontros, chamada, pacote de sync | subagente `implementador` | P2 |
| 2 | **P5** web: lista, etapas, fechamento, `IndicadorDeEtapas`, cliente da API | subagente `implementador` | P0b |
| 3 | **P4** API: pontos, carga, cadernos, evidência na ficha | subagente `implementador` | P3 |
| 3 | **P6** web: painel, frequência, material, remarcar/cancelar | subagente `implementador` | P5 |
| 4 | **P7** web: tela da chamada e tipo da fila offline | subagente `implementador` | P3, P5 |
| 4 | **P8** web: cartão da chamada no início, quadro na ficha, seção de pontos | subagente `implementador` | P4, P5 |
| 4½ | **P0c** rotas e menu | **agente principal** (inline, 5 arquivos) | P5, P6, P7 |
| 5 | **P9** fase final | `implementador` (e2e) → `gestor-pr` (push de revisão) → revisão → `testador` → `qa-runner` → `documentador` → `gestor-pr` | todos |

**Paralelo: no máximo dois implementadores por vez**, só com arquivos disjuntos (conferido nas listas):

| Onda | Par | Por que não se tocam |
|---|---|---|
| 1 | P1 ‖ P2 | P1 em `packages/shared/src/formulas/calendario*`, `apps/api/src/calendario/`, `apps/web/src/modulos/adm/calendario/`, `testes/handlers/{calendario,montagem}.ts`; P2 em `apps/api/src/classe-biblica/`, `app.module.ts`, `apps/web/nginx.conf` |
| 2 | P3 ‖ P5 | P3 só API (`classe-biblica/` encontros e chamada, `sync/`); P5 só web (`ui/IndicadorDeEtapas*`, `api/classe-biblica.ts`, `modulos/adm/classe-biblica/` lista e etapas) |
| 3 | P4 ‖ P6 | P4 só API e dados (`classe-biblica/pontos*`, módulo, `scripts/carga*`, cadernos, `progresso/`); P6 só web (`modulos/adm/classe-biblica/` painel, frequência, material, remarcar) |
| 4 | P7 ‖ P8 | P7 em `modulos/classe-biblica/chamada/` e `offline/tipos/`; P8 em `modulos/inicio/`, `modulos/inicio-instrutor/`, `modulos/perfil/SecaoProgresso*`, `modulos/adm/configuracoes/` |

**Compilação entre as ondas:** P0a deixa `npm run tipos` e as suítes verdes. Os enums novos têm
entrada em `MARCACOES_PADRAO`, que destrava os quatro lugares que o indexam. Os três `Record` do
calendário web ganham a entrada mínima. E os campos novos de saída são `.optional()` (SPEC D22).
As telas novas ficam fora das rotas até o P0c, então `rotas.test.tsx:8` não vê arquivo faltando.
**Fim de cada onda: `pesado -- npm run tipos` da raiz verde**, conferido pelo principal.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0a | 15 (shared 9, prisma 2, API 3, web 1) | agente principal — dono compartilhado |
| P0b | 2 | agente principal — fixtures que 6 pacotes importam |
| P1 | 10 (+2 handlers só se os testes pedirem) | implementador |
| P2 | 11 | implementador |
| P3 | 11 | implementador |
| P4 | 12 (4 deles são os cadernos, uma linha cada) | implementador |
| P5 | 10 | implementador |
| P6 | 6 | implementador |
| P7 | 7 | implementador |
| P8 | 8 | implementador |
| P0c | 5 | agente principal — dono compartilhado |
| P9 | 1 (e2e) + roteiro de QA | implementador + testador + qa-runner + documentador + gestor-pr |
| **Total** | **~100** | 8 subagentes de pacote + os do P9 |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U, com 591k para 1–2
arquivos, 256k para 6–10 e 559k para 21+. Os pacotes delegados ficam entre 6 e 12 (teto 15).
Fatiado por **fluxo vertical** onde dá. P3 junta chamada e pacote, que se testam juntos. P8 junta
três telas de 2 arquivos que sozinhas ficariam abaixo do piso. Juntar P3+P4 (23) ou P5+P6 (16)
cairia no braço caro.

P0a fica no teto (15), com o principal, porque é todo dono compartilhado (§8): contratos, schema,
migration, `MODELOS_DE_CLUBE`, permissões. P0b e P0c ficam abaixo do piso de 6 e por isso são
inline, não pacote (§3): fixtures que P2–P8 importam, e rotas/menu, que são ímã de conflito. O
P0c vem depois das telas porque registrar rota de tela que não existe quebra
`rotas.test.tsx:8`. P9 tem 1 arquivo e mesmo assim é delegado: a saída de suíte e e2e não pode
entrar no contexto do principal.

Orçamento por implementador: **~80 turnos**.

**Teste por pacote** (de dentro do pacote; só os arquivos listados):
`cd apps/api && pesado testar --script teste -- <arquivos .spec.ts>` ·
`cd apps/web && pesado testar --script teste -- <arquivos .test.ts(x)>` ·
`cd packages/shared && pesado testar --script teste -- <arquivos>` · tipos:
`pesado -- npm run tipos -w api|web|packages/shared`. Mudou algo em `packages/shared`:
`pesado -- npm run build -w packages/shared` antes de testar a API.

---

## P0a — shared, permissões, schema, migration · agente principal (inline), onda 0

**Arquivos (lista fechada):**
1. `packages/shared/src/enums.ts:36,57-64` — `'CLASSE_BIBLICA'` no fim de `TIPOS_EVENTO`; `MARCACOES_PADRAO.CLASSE_BIBLICA = { temReuniao: true, temClasse: true, bomParaCampo: false }` (SPEC regra 6, D19).
2. `packages/shared/src/formulas/pontos.ts:3-11` — `GatilhoCriterio` + `CLASSE_BIBLICA_PRESENCA`, `CLASSE_BIBLICA_PARTICIPACAO`.
3. `packages/shared/src/permissoes.ts:12-33` — as duas chaves da SPEC §Permissões.
4. `packages/shared/src/permissoes.test.ts:7` — 22 → 24; caso: Conselheiro com ajuste concedido recebe `classebiblica.chamada`; `classebiblica.gerenciar` não se aplica a ele.
5. Criar `packages/shared/src/contratos/classe-biblica.ts` — **esqueleto completo**, porque os pacotes não podem mexer nele:
   - `EdicaoResumo`, `EdicoesSaida` (situação `NAO_TERMINADA | EM_ANDAMENTO | ENCERRADA`, etapa, contagens);
   - `EdicaoRascunhoEntrada` (todos opcionais), `EdicaoSaida` (com `atualizadaEm`);
   - `GruposEntrada` / `GruposSaida` (unidades com `ocupadaPor: { tipo: 'GRUPO' | 'EDICAO', nome, inicio?, fim? } | null`);
   - `DatasSaida` (`data`, `marcada`, `motivo`), `TerminarEntrada` (`datas: DataCivil[]`);
   - `PainelSaida` (cabeçalho, grupos com unidades, material `{ titulo, tipo: 'PDF' | 'LINK', url }` ou `null`, próximo encontro, frequência média, encontros feitos e cancelados/remarcados, `podeGerenciar`);
   - `FrequenciaGrupoSaida` (`dbvId`, `nome`, `encontros`, `presencas`, `participacoes`);
   - `MaterialLinkEntrada` (`url` https, reaproveitando a regra de `contratos/materiais.ts:7`), `MaterialArquivoDados`;
   - `RemarcarEntrada` (`data`, `horario?`), `CancelarEntrada` (`motivo`), `EncontroSaida`;
   - `ChamadaCBSaida` (encontro, grupo, unidades com desbravadores `{ dbvId, nome, entrouEm?, presente, participou, versao | null }`, `registrada`);
   - `ChamadaCBEnvio` (`envioId`, `linhas: { dbvId, presente, participou, versaoVista: InstanteIso | null }[]`, máx. 500);
   - `ChamadaCBEnvioSaida` (`linhas` com `versao`, `conflitos: { dbvId, nome }[]`, `ignorados: { dbvId, nome }[]`, `presentes`, `participaram`);
   - `PontosCBSaida` / `PontosCBEntrada` (dois itens `{ gatilho, nome, pontos, ativo }`);
   - `PacoteClasseBiblica` (encontros `{ id, edicaoId, edicaoNome, data, horario, local }`, grupos `{ id, encontroIds, nome, unidades: { id, nome, membros: { dbvId, nome, inicio, fim }[] }[] }`, presenças `{ encontroId, dbvId, presente, participou, versao }`, chamadas registradas `{ encontroId, grupoId }`);
   - `ClasseBiblicaDoRequisito` (`edicao`, `encontros`, `presencas`, `participacoes`, `grupo`, `semGrupo`, `anteriores: { edicao, encontros, presencas, participacoes }[]`).
6. `packages/shared/src/index.ts` — exporta o contrato novo.
7. `packages/shared/src/contratos/sync.ts:56-87` — `classeBiblica: PacoteClasseBiblica.nullable().optional()`.
8. `packages/shared/src/contratos/progresso.ts:23-27` — `classeBiblica: ClasseBiblicaDoRequisito.nullable().optional()`.
9. `packages/shared/src/contratos/calendario.ts:19` — `classeBiblica: { edicaoId, grupos, cancelado, motivo }.nullable().optional()`.
10. `apps/api/prisma/schema.prisma` — enums (`:87-96`, `:118-123`, `:131-138`), `Requisito.classeBiblica` (`:542-559`), os sete modelos da SPEC §Dados e as relações de volta (`Clube`, `Unidade`, `Desbravador`, `Usuario`, `Arquivo`, `EventoCalendario`).
11. Criar `apps/api/prisma/migrations/20261010120000_classe_biblica/migration.sql` — `prisma migrate dev --create-only` mais o `UPDATE "Requisito"` das quatro marcas (SPEC §Dados). Se outra migration entrar antes na base, renomeie o carimbo para depois dela.
12. `apps/api/src/comum/prisma/guarda-clube.ts:4-38` — os sete modelos.
13. `apps/api/src/comum/prisma/guarda-clube.spec.ts` — a lista esperada.
14. `apps/api/src/permissoes/permissoes.spec.ts:20,26` — 22 → 24.
15. `apps/web/src/modulos/adm/calendario/tipos.ts:10,22,46` — entrada mínima de `CLASSE_BIBLICA` nos três `Record` (rótulo "Classe Bíblica", cor e ponto de `EVENTO`). Se um teste do calendário web contar os itens da legenda, ajuste só esse número (`calendario.test.tsx`, `calendario-celular.test.tsx`) e conte-o como 16º arquivo.

- [ ] Passo 1: escrever os arquivos.
- [ ] Passo 2: `pesado -- npm run build -w packages/shared`.
- [ ] Passo 3: `cd packages/shared && pesado testar --script teste -- src/permissoes.test.ts`; `cd apps/api && pesado testar --script teste -- src/comum/prisma/guarda-clube.spec.ts src/permissoes/permissoes.spec.ts` — o banco de teste roda `migrate deploy` (`apps/api/test/banco.ts`), então isso também prova que a migration aplica. O `UPDATE` das marcas é provado por teste no P4.
- [ ] Passo 4: `pesado -- npm run tipos` da raiz e `cd apps/web && pesado testar --script teste -- src/modulos/adm/calendario` verdes.
- [ ] Passo 5: commit `feat(classe-biblica): contratos, permissões e migration`.

## P0b — fixtures · agente principal (inline), onda 0

1. `apps/api/test/fabricas.ts` — `criarEdicaoCB({ clubeId, terminada?, inicio?, fim?, nome? })`, `criarGrupoCB({ clubeId, edicaoId, unidadeIds, nome?, material? })`, `criarEncontroCB({ clubeId, edicaoId, data, cancelado? })` (cria o `EventoCalendario` junto, com `MARCACOES_PADRAO.CLASSE_BIBLICA`), `criarChamadaCB({ clubeId, encontroId, grupoId, linhas })` (grava `ChamadaClasseBiblica` e as presenças). Molde: `criarEvento` (`:412`).
2. Criar `apps/web/src/testes/handlers/classe-biblica.ts` — exportações, com os números do modelo (Grupo Daniel: Águias 10, Leões 10, Gaviões 11; Grupo Ester: Falcões 9, Panteras 10; Tigres de fora; Lívia em Águias):
   `criarEdicaoResumo`, `criarPainel`, `criarChamadaCB`, `criarPacoteClasseBiblica`, `criarClasseBiblicaDoRequisito`, `handlersClasseBiblica()` (lista, rascunho, grupos, datas, terminar, painel, frequência, material, encontros, chamada GET e PUT, pontos), `handlerChamadaCBRecusada(mensagem)`.

- [ ] `tipos -w api` e `tipos -w web` verdes; commit `test(classe-biblica): fábricas e handlers`.

---

## P1 — calendário à parte · implementador, onda 1

**Cobre os critérios da SPEC:** 15, 16, 17 e o riscado do 19.

**Arquivos que pode alterar (lista fechada):**
- `packages/shared/src/formulas/calendario.ts:56-62` — `situacaoDaData` ignora `CLASSE_BIBLICA` (fora de `comuns` e de `extra`).
- `packages/shared/src/formulas/calendario.test.ts`.
- `apps/api/src/calendario/servico-eventos.ts` — `doAno` (`:77`) e `obter` (`:89`) preenchem `classeBiblica` pelo encontro do evento; `criar` (`:95`), `editar` (`:99`) e `remover` (`:103`) recusam `CLASSE_BIBLICA` com "Este encontro é da Classe Bíblica: remarque ou cancele pela edição."; `gravar` (`:109`) é o caminho comum. `servico-calendario.ts` (`situacoes`, `:12`) não muda: ele só usa a regra do dia.
- `apps/api/src/calendario/eventos.spec.ts`.
- `apps/web/src/modulos/adm/calendario/tipos.ts` — `BookOpen` em `ICONE_DO_TIPO` (`:31`, `Partial`); ajusta a entrada mínima do P0a se precisar.
- `apps/web/src/modulos/adm/calendario/CalendarioDoCelular.tsx:19,130` — cartão riscado com "Cancelado: <motivo>"; linha com os grupos.
- `apps/web/src/modulos/adm/calendario/FichaEvento.tsx:97` — "Abrir a edição" no lugar de Editar/Remover.
- `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:122-123` — o seletor não oferece `CLASSE_BIBLICA`.
- `apps/web/src/modulos/adm/calendario/calendario-celular.test.tsx` e `ficha.test.tsx`.
- Só se os testes exigirem: `apps/web/src/testes/handlers/calendario.ts`, `montagem.ts`.

**Não pode tocar:** `packages/shared/src/{contratos,enums.ts}`, `schema.prisma`, migrations,
`apps/api/src/classe-biblica/`, `cronograma-montagem/`, `inicio/`.

**Testes (antes):** dia de reunião com evento Classe Bíblica tem `temReuniao`/`temClasse`/
`bomParaCampo` iguais ao dia sem ele; `datasDaMontagem` idêntica com e sem; API recusa POST,
PATCH e DELETE do tipo; `doAno` e `obter` trazem `classeBiblica` com cancelado e motivo; isolamento
de clube; web: lilás com livro e texto, cancelado riscado, ficha sem Editar e com "Abrir a edição",
seletor sem o tipo.

**Comando:** `cd packages/shared && pesado testar --script teste -- src/formulas/calendario.test.ts`;
`cd apps/api && pesado testar --script teste -- src/calendario/eventos.spec.ts`;
`cd apps/web && pesado testar --script teste -- src/modulos/adm/calendario`.

**Pronto quando:** testes verdes; `tipos` sem erro nos arquivos do pacote.

---

## P2 — API: edição, painel, material · implementador, onda 1

**Cobre os critérios:** 5–11, 13, 14, 34 (lado API), 38, 44, 45 (lado API).

**Arquivos que pode alterar (lista fechada):**
- Criar em `apps/api/src/classe-biblica/`: `classe-biblica.module.ts`; `edicoes.controller.ts`;
  `servico-edicoes.ts` (rascunho, grupos, datas, terminar com trava e idempotência — regras 1–5
  e 14); `servico-painel.ts` (lista, painel, frequência); `escopo-grupos.ts`; `frequencia.ts`;
  `criterios.ts`.
  - `escopo-grupos.ts` traz `gruposVisiveis(sessao, edicaoId)`, `dbvsNoEscopo(sessao, dbvIds)`
    (regra 9) e a guarda "gerenciar ou chamada com grupo no escopo", porque `@Pode` aceita uma
    chave só (`pode.decorator.ts:6`).
  - `criterios.ts` traz `garantirCriterios(tx, clubeId)` (regra 11).
- `apps/api/src/app.module.ts` — registra o módulo.
- `apps/web/nginx.conf:32-40` — `location ~ ^/api/classe-biblica/grupos/[^/]+/material/arquivo$` com `client_max_body_size 21m`, repetindo o proxy de `/api/materiais/arquivo`.
- Criar `apps/api/src/classe-biblica/edicoes.spec.ts` e `painel.spec.ts`.

**`frequencia.ts` entrega estas exportações, que P3 e P4 usam sem mudar:**
```ts
export interface ContagemDoDbv { encontros: number; presencas: number; participacoes: number; grupoId: string; grupoNome: string }
/** Por desbravador, só com as linhas gravadas (regra 13): Y = linhas em encontros não cancelados com chamada registrada. */
export function contarPorDbv(db: Prisma.TransactionClient | PrismaService, clubeId: string, edicaoId: string, dbvIds?: string[]): Promise<Map<string, ContagemDoDbv>>
/** Edições terminadas cujo período cruza [inicio, fim], da mais recente para a mais antiga. */
export function edicoesNoPeriodo(db: Prisma.TransactionClient | PrismaService, clubeId: string, inicio: string, fim: string): Promise<{ id: string; nome: string; inicio: string; fim: string }[]>
/** Encontros não cancelados com chamada registrada do grupo (painel). */
export function encontrosFeitos(db: Prisma.TransactionClient | PrismaService, clubeId: string, edicaoId: string, grupoId?: string): Promise<number>
```

**Não pode tocar:** `packages/shared` (se faltar campo, **pare e reporte**), `schema.prisma`,
migrations, `guarda-clube.ts`, `calendario/`, `sync/`, `progresso/`, `scripts/clube-criar.ts` (D20).

**Testes (antes):**
- Rascunho: criado só com o nome e retomado.
- Grupos e unidades: unidade repetida na edição é recusada. Unidade de edição terminada com
  período cruzado vem com `ocupadaPor` e é recusada ao terminar, com o texto da regra 3. Dois
  rascunhos com a mesma unidade convivem.
- Datas: 17 domingos, 2 desmarcadas com "Sem reunião: Páscoa".
- Terminar: cria N encontros e N eventos com as marcações neutras. Duas chamadas seguidas e duas
  concorrentes não duplicam (`terminadaEm` e trava).
- `garantirCriterios`: idempotente; reaproveita o critério padrão que já existe; nome colidindo
  ganha "(Classe Bíblica)"; `ordem` depois da maior.
- Edição terminada (regra 14): início, fim e dia são recusados; horário propaga só aos encontros
  futuros sem chamada; grupo com chamada não sai; grupo sem chamada sai com as unidades.
- Lista: as três situações; material faltando não muda a situação.
- Painel e frequência: cortados pelo escopo de quem só tem a chamada. Conselheiro sem grupo no
  escopo → 404.
- Material: PDF e link `https://`; 25 MB recusado; troca.
- Permissões e isolamento: sem gerenciar → 403; outro clube → 404.

**Comando:** `cd apps/api && pesado testar --script teste -- src/classe-biblica/edicoes.spec.ts src/classe-biblica/painel.spec.ts`.

**Pronto quando:** testes verdes; `tipos -w api` verde.

---

## P3 — API: encontros, chamada, pacote · implementador, onda 2

**Cobre os critérios:** 18–21, 23, 24, 26–33, 35, 36, e o pacote do 25 e do 31.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/api/src/classe-biblica/encontros.controller.ts` e `servico-encontros.ts` (regra 7, mexendo no `EventoCalendario` junto).
- Criar `apps/api/src/classe-biblica/chamada.controller.ts` e `servico-chamada.ts` — GET da lista (regras 8, 9); `PUT /sync/classe-biblica/encontros/:id/grupos/:grupoId` com:
  - `envioId` em `EnvioClasseBiblicaProcessado`;
  - upsert por `(encontroId, dbvId)`, gravando `ChamadaClasseBiblica` mesmo sem linhas;
  - conflito por `versaoVista` (D21);
  - recusas da regra 12, com os textos da SPEC;
  - linhas fora da lista ou do escopo em `ignorados`;
  - `garantirCriterios` e pontos (regra 11).
  Molde: `reunioes-envio.service.ts:71-98` (idempotência), `:205-222` (lista e ignorados),
  `:319-351` (pontos).
- `apps/api/src/classe-biblica/classe-biblica.module.ts` — registra os dois controllers e exporta `escopo-grupos`.
- Criar `apps/api/src/sync/pacote-classe-biblica.service.ts` — provider no padrão de `pacote-instrutor.service.ts`: só com `classebiblica.chamada`, janela hoje−7 a hoje+7, sem cancelados, desbravadores cortados pela regra 9.
- `apps/api/src/sync/sync.module.ts` — provider novo e import do módulo da Classe Bíblica.
- `apps/api/src/sync/sync.service.ts:40-75` — `classeBiblica` no pacote, pelo provider.
- Criar `apps/api/src/classe-biblica/encontros.spec.ts`, `chamada.spec.ts` e `apps/api/src/sync/pacote-classe-biblica.spec.ts`.

**Não pode tocar:** `packages/shared`, `schema.prisma`, migrations, `servico-edicoes.ts`,
`servico-painel.ts`, `frequencia.ts`, `criterios.ts`, `escopo-grupos.ts` (do P2 — se faltar algo,
reporte), `pontos/servico-pontos.ts`, `reunioes/`, `sync/pacote-instrutor.service.ts`.

**Testes (antes):**
- Remarcar e cancelar (regra 7): remarcar guarda `dataOriginal` e move o evento. Nova data fora
  do período, no passado ou igual a outro encontro não cancelado é recusada. Feriado devolve
  aviso. Cancelar, desfazer até a data, e desfazer recusado com a data ocupada. Encontro com
  chamada → 409.
- Chamada (regras 8–10): antes da data ou em cancelado, recusada. Lista pela unidade na data.
  `participou` de ausente grava `false`. Chamada sem linhas grava `ChamadaClasseBiblica`. Mesmo
  `envioId` duas vezes não duplica. Conflito pela versão. Linhas de inativo e fora do escopo
  voltam em `ignorados`. Não há rota de desfazer.
- Recusas da fila (regra 12): encontro cancelado com a fila parada; remarcado para o futuro
  recusado com o texto; data nova já chegada é aceita.
- Pontos (regra 11): 10 + 5, estorno ao virar falta, sem desconto, critério inativo não lança.
- Escopo (regra 9): Conselheiro só com os desbravadores das unidades dele, Instrutor só com
  CURSANDO no ano corrente, 404 em grupo fora.
- Pacote: só com a permissão, cortado pelo escopo, presenças com versão, chamadas registradas.
  Isolamento de clube em todos os `include`.

**Comando:** `cd apps/api && pesado testar --script teste -- src/classe-biblica/encontros.spec.ts src/classe-biblica/chamada.spec.ts src/sync/pacote-classe-biblica.spec.ts src/sync/sync.spec.ts`.

**Pronto quando:** testes verdes (inclusive o `sync.spec.ts` que já existe, sem mudança); `tipos -w api` verde.

---

## P4 — API: pontos, carga, ficha · implementador, onda 3

**Cobre os critérios:** 37, 38 (rota), 39–42, 47.

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/api/src/classe-biblica/pontos.controller.ts` e `pontos.spec.ts` (`GET`/`PATCH /classe-biblica/pontos`, `ranking.configurar`, com `garantirCriterios`).
- `apps/api/src/classe-biblica/classe-biblica.module.ts` — registra o controller e exporta `frequencia`.
- `apps/api/src/scripts/carga.ts:10-15,223-257` — `classeBiblica` opcional no requisito, gravado na criação e na atualização.
- `apps/api/src/scripts/carga.spec.ts` — (a) carga liga a marca exatamente nos 4 requisitos e em nenhum outro (critério 47); (b) o trecho `UPDATE` lido de `migrations/20261010120000_classe_biblica/migration.sql`, rodado depois de zerar a marca, liga os mesmos 4.
- `docs/planejamento/dados/cadernos/{amigo,companheiro,pesquisador}.json:47` e `agrupadas.json:101` — `"classeBiblica": true` (4 arquivos).
- `apps/api/src/progresso/servico-progresso.ts:160-200` — `classeBiblica` nos requisitos com a marca, pela regra 13, com `edicoesNoPeriodo` e `contarPorDbv` do P2, no período do ano do clube da matrícula (`anoClube`, `packages/shared/src/datas.ts:9`).
- `apps/api/src/progresso/progresso.module.ts` — importa o módulo.
- `apps/api/src/progresso/progresso.spec.ts`.

**Não pode tocar:** `packages/shared`, `schema.prisma`, migrations, os outros arquivos de
`classe-biblica/`, `requisitos-dbv.service.ts`, `pontos/servico-pontos.ts`.

**Testes (antes):**
- Pontos: PATCH muda pontos e ativo; os lançamentos antigos ficam como estavam; GET em clube sem
  critério os cria.
- Carga e migration: a e b acima.
- Ficha: edição em destaque e "Antes"; só edições do ano da matrícula; entrou no meio não ganha
  falta; mover unidade de grupo não muda o passado; sem grupo → `semGrupo`; requisito sem a marca
  → ausente.

**Comando:** `cd apps/api && pesado testar --script teste -- src/classe-biblica/pontos.spec.ts src/scripts/carga.spec.ts src/progresso/progresso.spec.ts`.

**Pronto quando:** testes verdes; `tipos -w api` verde.

---

## P5 — web: lista, etapas, fechamento · implementador, onda 2

**Cobre os critérios:** 1–12 (tela).

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/web/src/ui/IndicadorDeEtapas.tsx` e `IndicadorDeEtapas.test.tsx`.
- Criar `apps/web/src/api/classe-biblica.ts` — **todas** as funções de cliente das rotas da SPEC
  §API **menos o PUT da chamada** (que é da fila):
  - lista, rascunho, grupos, datas e terminar;
  - painel e frequência;
  - material;
  - remarcar, cancelar e desfazer;
  - **a leitura da chamada** (`GET .../chamada`, usada pelo P7);
  - pontos (usados pelo P8).
- Criar `apps/web/src/modulos/adm/classe-biblica/`, um arquivo por tela do modelo:
  - `ListaEdicoes.tsx` (`Lista-Edicoes`, `Lista-Vazia`);
  - `EtapaDados.tsx` (`Edicao-1-Dados`, `Edicao-1-Erro`);
  - `EtapaGrupos.tsx` (`Edicao-2-Grupos`);
  - `EtapaDatas.tsx` (`Edicao-3-Datas`);
  - `EdicaoPronta.tsx` (`Edicao-Pronta`);
  - `useRascunhoDaEdicao.ts` (salvar ao sair do campo e ao trocar de etapa, região viva, aviso
    D11);
  - `edicao.test.tsx`.

**Não pode tocar:** `rotas.tsx`, `LayoutAdm.tsx`, outros arquivos de `ui/`, `testes/handlers/`
(fixture faltando: **reporte**), `modulos/adm/calendario/`.

**Componentes:** `CabecalhoDaPagina`, `Cartao`, `Campo`/`CampoRotulado`, `CampoData`, `Selecao`,
`CaixaMarcacao`, `Botao`, `Selo`, `EstadoVazio`, `Carregando`/`ErroDeCarga`/`DisponivelComInternet`,
`useErrosAVista`/`ResumoDosErros`, `BarraProgresso`. As telas se testam renderizadas direto
(sem rota), com caminhos literais da SPEC §Telas nos links.

**Testes (antes):** os critérios acima, um caso cada, com MSW (`handlersClasseBiblica`); o indicador
com `role`, `aria-valuenow` e `aria-valuetext`; o total sempre 3; caixa de unidade com "no Grupo …" e
"na <edição>"; erro do terminar com o texto da regra 3; link sem https; duplo clique em "Criar" faz
um envio só.

**Comando:** `cd apps/web && pesado testar --script teste -- src/ui/IndicadorDeEtapas.test.tsx src/modulos/adm/classe-biblica/edicao.test.tsx`.

**Pronto quando:** testes verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P6 — web: painel e encontro · implementador, onda 3

**Cobre os critérios:** 13, 14, 18–20 (tela), 34 (tela), 45 (tela).

**Arquivos que pode alterar (lista fechada):**
- Criar em `apps/web/src/modulos/adm/classe-biblica/`:
  - `PainelEdicao.tsx` (`Painel-Edicao`; sem "Editar edição", remarcar, cancelar e anexar para quem
    não tem `podeGerenciar`; "Ver" abre a chamada, D13; "Editar edição" volta às etapas 1 e 2,
    D14);
  - `FrequenciaDoGrupo.tsx` (D12);
  - `MaterialDoGrupo.tsx`;
  - `RemarcarEncontro.tsx` (`Encontro-Remarcar`, com o aviso de feriado e as recusas);
  - `painel.test.tsx` e `remarcar.test.tsx`.

**Não pode tocar:** `api/classe-biblica.ts` e os arquivos do P5 (função faltando: **reporte**),
`rotas.tsx`, `ui/`, `testes/handlers/`.

**Testes (antes):** painel com os números do modelo; abas; painel recortado para quem só tem a
chamada; sem material; PDF acima de 20 MB; remarcar e cancelar com confirmação; aviso de feriado;
encontro com chamada sem ações; "Desfazer" só até a data; quatro estados.

**Comando:** `cd apps/web && pesado testar --script teste -- src/modulos/adm/classe-biblica/painel.test.tsx src/modulos/adm/classe-biblica/remarcar.test.tsx`.

**Pronto quando:** testes verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P7 — web: chamada e fila offline · implementador, onda 4

**Cobre os critérios:** 21–30 (tela), 31 (lista recortada).

**Arquivos que pode alterar (lista fechada):**
- Criar `apps/web/src/modulos/classe-biblica/chamada/`:
  - `TelaChamadaCB.tsx` (`Chamada-Encontro`, `Chamada-Estados`, `Chamada-SemConexao`): lê do
    pacote e, com conexão, de `api/classe-biblica.ts` (P5). Grupo vazio mostra "Registrar a
    chamada sem ninguém";
  - `estado.ts`: todos presentes; falta trava e desmarca a participação; totais;
  - `estado.test.ts` e `chamada.test.tsx`.
- Criar `apps/web/src/offline/tipos/classe-biblica.ts` e `classe-biblica.test.ts` — no molde de
  `offline/tipos/reuniao.ts`:
  - rótulo "Chamada da Classe Bíblica · <grupo> · <data>";
  - fusão pela última ação por desbravador;
  - avisos de conflito e de ignorados (`:44-52`);
  - passar as versões aos itens seguintes;
  - rebaixar o pacote (`:74`).
  A recusa do servidor fica no item e a página da fila já mostra a mensagem
  (`PaginaFila.tsx:64`).
- `apps/web/src/offline/tipos/todos.ts` — importa o tipo novo.

**Não pode tocar:** `offline/{motor,fila,pacote}.ts`, `tipos/{reuniao,aula}.ts`, `modulos/reunioes/`,
`modulos/fila/`, `api/classe-biblica.ts`, `rotas.tsx`.

**Testes (antes):** os critérios acima; item com mesmo `envioId` não duplica; recusa
`handlerChamadaCBRecusada` fica como erro com a mensagem; conexão só por `useConexao`.

**Comando:** `cd apps/web && pesado testar --script teste -- src/modulos/classe-biblica src/offline/tipos/classe-biblica.test.ts`.

**Pronto quando:** testes verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P8 — web: início, ficha e pontos · implementador, onda 4

**Cobre os critérios:** 31 (cartão), 37 (tela), 39–41 (tela), 43 (conferir que a tela de permissões
lista a chave nova; nada a mudar nela).

**Arquivos que pode alterar (lista fechada):**
- `apps/web/src/modulos/inicio/InicioConselheiro.tsx:295` e `inicio.test.tsx` — cartão da D9, do pacote, só com `pode('classebiblica.chamada')`, link `/classe-biblica/encontros/:id/grupos/:grupoId/chamada`.
- `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:193` e `inicio-instrutor.test.tsx` — o mesmo cartão.
- `apps/web/src/modulos/perfil/SecaoProgresso.tsx:110-131` e `SecaoProgresso.test.tsx` — quadro do `Progresso-Requisito`, com "Antes: …".
- `apps/web/src/modulos/adm/configuracoes/AdmConfiguracoes.tsx:118-214` e `configuracoes.test.tsx` — seção "Pontos da Classe Bíblica" (D15).

**Não pode tocar:** `api/classe-biblica.ts`, `offline/`, `modulos/classe-biblica/`, `rotas.tsx`, `ui/`.

**Testes (antes):** cartão do dia até 7 dias depois, some com a chamada registrada, nada sem a
permissão nem para grupo fora do escopo, funciona sem conexão; ficha com os números do modelo,
"Antes" e "sem grupo"; requisito sem a marca sem quadro; seção de pontos salva.

**Comando:** `cd apps/web && pesado testar --script teste -- src/modulos/inicio src/modulos/inicio-instrutor src/modulos/perfil/SecaoProgresso.test.tsx src/modulos/adm/configuracoes`.

**Pronto quando:** testes verdes; `tipos -w web` sem erro nos arquivos do pacote.

---

## P0c — rotas e menu · agente principal (inline), onda 4½

1. `apps/web/src/layouts/LayoutAdm.tsx:16-27` — "Classe Bíblica" (`BookOpen`) depois de "Cronogramas".
2. Criar `apps/web/src/modulos/adm/classe-biblica/rotas.tsx` — os caminhos do Adm da SPEC §Telas.
3. Criar `apps/web/src/modulos/classe-biblica/rotas.tsx` — a chamada de Conselheiro e Instrutor.
4. `apps/web/src/rotas.tsx:60-110` — as do Adm no grupo `ADM`/`LayoutAdm`; a da chamada no grupo `CONSELHEIRO`/`INSTRUTOR`.
5. `apps/web/src/rotas.test.tsx` — um caso por grupo (Adm abre a lista; Conselheiro abre a chamada; Conselheiro não abre `/adm/classe-biblica`).

- [ ] `pesado -- npm run tipos` da raiz e `cd apps/web && pesado testar --script teste -- src/rotas.test.tsx` verdes; commit.

---

## P9 — fase final

- [ ] **e2e** (implementador; escreve, não roda): `e2e/classe-biblica.spec.ts`. Roteiro: o Adm
  cria a edição com dois grupos, um deles sem material; vê os encontros no calendário; faz a
  chamada sem rede; a conexão volta; o painel e o ranking mostram o resultado. Molde:
  `e2e/offline.spec.ts`.
- [ ] **Push de revisão** (`gestor-pr`, PR em draft #<a definir>) e **revisão da PR inteira**
  (`rules/pr-pronta.md` passos 3–4), até três rodadas.
- [ ] **Suíte completa uma vez** (`testador`, `pesado testar --tudo`), lint, `tipos` da raiz,
  `build`. Falha fora de pacote: conferir só aquele arquivo na base `6bc7e05`.
- [ ] **Medição no DOM** (critério 48) e **QA** pelo roteiro abaixo (`qa-runner`).
- [ ] **`documentador`** com a branch e a base.
- [ ] **`gestor-pr`**: sobe o resto e tira do rascunho; o e2e é o do CI.

### Roteiro de QA (um item por grupo de critérios; quadro do modelo entre parênteses)

1. Lista vazia e bloqueio sem unidades (`Lista-Vazia`) — 1, 2.
2. Etapa 1 com o dia e o local vindos da configuração, horário vazio e erro de data (`Edicao-1-*`) — 3, 4.
3. "Salvo às…", fechar e retomar; repetir em outro navegador (`Lista-Edicoes`) — 5.
4. Etapa 2: unidade travada em outro grupo e em outra edição, link sem https, grupo sem material (`Edicao-2-Grupos`) — 6, 7, 8.
5. Etapa 3 e criação; duplo clique em "Criar" (`Edicao-3-Datas`, `Edicao-Pronta`) — 9, 10, 11, 12.
6. Editar a edição terminada — 13, 14.
7. Calendário: lilás, ficha, seletor; domingo com reunião e Classe Bíblica (`Calendario-Adm`, `Calendario-Celular`) — 15, 16, 17.
8. Remarcar (feriado e recusas), cancelar, desfazer, encontro com chamada (`Encontro-Remarcar`, `Painel-Edicao`) — 18, 19, 20.
9. Chamada: todos presentes, falta trava a participação, totais, salvar, corrigir (`Chamada-Encontro`) — 21–24, 30.
10. Chamada sem rede, volta da conexão, estados e grupo vazio (`Chamada-SemConexao`, `Chamada-Estados`) — 25, 26, 27.
11. Fila: chamada guardada de encontro cancelado e de remarcado (página da fila) — 28, 29.
12. Conselheiro e Instrutor com a permissão: cartão, lista recortada, 404 fora, painel recortado — 31–34.
13. Ranking do mês e pontos em Configurações — 35–38.
14. Ficha de Lívia, edição de outro ano, quem entrou no meio, mudança de grupo (`Progresso-Requisito`) — 39–42.
15. Permissões de um Conselheiro; 403 sem gerenciar — 43, 44.
16. Material: PDF de 15 MB com a imagem web refeita e de 25 MB — 45.
17. Medição em 360/390/820/1280 px — 48.

### Gate

```
PR: <url> — pronta para revisão · revisão limpa em <n> rodada(s)
```

A PR só sai do rascunho com:
- revisão sem achado Critical ou Important em aberto;
- suítes de API e web verdes (falha fora do pacote conferida na base);
- lint, `tipos` e `build` verdes;
- e2e verde no CI;
- roteiro de QA todo PASSOU;
- no corpo da PR, o que a mudança precisa para funcionar no ar: a migration roda antes do código
  novo; o `nginx.conf` do web só vale com a imagem web refeita (`apps/web/Dockerfile:24`); o
  nginx do host já aceita 21 MB (`scripts/nginx-host.conf:21`); a carga não precisa rodar de
  novo, porque a migration liga as quatro marcas.

Se ficar em rascunho, o motivo vai para a PR e para o fechamento.

## O que não quebra (verificado)

- **Reunião e chamada da reunião:** nenhum arquivo de `reunioes/` nem `EnvioProcessado` muda (D2).
- **Registro da classe e tarefa para casa:** nada em `aulas/`, `RegistroAula`, `TarefaCasa`.
- **Material de classe:** `Material` e `materiais/` intactos (D7). O `location` novo não muda o de
  `/api/materiais/arquivo`.
- **Regra do dia:** `situacaoDaData` só muda para o tipo novo, e as marcações dele são neutras
  (D19). Os casos atuais de `calendario.test.ts` não mudam de resultado.
- **Contratos:** os três campos novos de saída são `.optional()` (D22). `criarPacote`
  (`testes/handlers/offline.ts:10`), os 7 handlers com literais tipados e o pacote montado em
  `sync.service.ts` compilam sem mudança, e pacote guardado antes continua válido.
- **Ranking:** `calculo-ranking.ts` não muda, porque soma todo `LancamentoPontos` do mês
  (`:149-157`). O de unidade segue pela unidade atual (`:122`).
- **Critérios e clube novo:** `clube-criar.ts`, `clube-criar.spec.ts:10-25` e `fabricas.ts:74`
  (8 critérios) não mudam (D20).
- **Adm:** `permissoesEfetivas` devolve todas as chaves ao Adm (`permissoes.ts:57-58`). Só os
  totais dos testes (22 → 24) mudam.
- **Rotas:** nada é registrado antes de as telas existirem (P0c), então `rotas.test.tsx` segue
  verde em todas as ondas.

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

DECISÕES TRAVADAS (não reabrir): as 30 da tabela "Decisões" da SPEC e as 5 "Regras de negócio
respondidas pelo usuário". Em especial:
- módulo próprio: não reaproveita Reuniao/Chamada nem RegistroAula;
- material opcional;
- encontro com chamada não remarca nem cancela, e não existe "desfazer chamada";
- o calendário não edita encontro da Classe Bíblica;
- participação travada em quem faltou;
- escopo da chamada cortado por desbravador (Conselheiro: unidades dele; Instrutor: CURSANDO no
  ano), inclusive no pacote;
- X de Y só pelas linhas gravadas;
- garantirCriterios idempotente, com 10 e 5 pontos; falta não desconta;
- o requisito continua de marcação manual.

FORA DE ESCOPO: a seção "Fora de escopo" da SPEC — visitantes, tela da Classe Bíblica para o
desbravador, desconto por falta, marcação automática de requisito, requisitos "ajudar a organizar"
e "convidar pessoas", relatórios além do painel, encontro avulso, tela geral de critérios do ranking.
Achado fora disso vira pendência no fechamento, não conserto de passagem.

EXECUÇÃO:
- P0a e P0b pelo agente principal, inline, antes de delegar, com tipos e testes verdes.
- Depois as ondas 1–4 do plano, com no máximo dois implementadores em paralelo e só nos pares
  listados. Commit por pacote.
- P0c (rotas e menu) pelo principal depois da onda 4.
- P9 no fim, na ordem do plano (revisão antes da suíte).
- Nenhum subagente roda git.

GATE: o bloco "Gate" do plano — revisão limpa, suítes de API e web verdes, lint, tipos e build
verdes, e2e verde no CI, roteiro de QA todo PASSOU, e a PR fora do rascunho.

REPORTE: o fechamento do orquestrador (FEITO por pacote, SUÍTE, DOCS, PENDÊNCIAS, PR) e as
decisões que algum pacote tomou sozinho, uma linha cada.
```

## ONDE FICA

```
- regra do dia (reunião extra à parte)             packages/shared/src/formulas/calendario.ts:56-92
- enums, marcações por tipo                        packages/shared/src/enums.ts:36-37, :57-64 ; apps/api/prisma/schema.prisma:87-96, :118-123, :131-138
- quem indexa MARCACOES_PADRAO pelo tipo           apps/api/src/calendario/eventos.controller.ts:33 ; apps/api/test/fabricas.ts:426 ; apps/web/src/testes/handlers/montagem.ts:27 ; apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:73
- gatilhos (shared)                                packages/shared/src/formulas/pontos.ts:3-11
- catálogo de permissões e testes do total         packages/shared/src/permissoes.ts:12-75 ; permissoes.test.ts:7 ; apps/api/src/permissoes/permissoes.spec.ts:20,26
- guarda de permissão (uma chave só)               apps/api/src/comum/decorators/pode.decorator.ts:6
- contratos: pacote, ficha, calendário, link https packages/shared/src/contratos/sync.ts:56-87 ; progresso.ts:23-27 ; calendario.ts:19 ; materiais.ts:7
- configuração do clube (dia, hora, local)         apps/api/prisma/schema.prisma:221-237
- unidade na data e linhas fora da lista           apps/api/prisma/schema.prisma:467-483 ; apps/api/src/reunioes/reunioes-envio.service.ts:205-222
- requisito, carga, chave do freio, cadernos       apps/api/prisma/schema.prisma:542-559 ; apps/api/src/scripts/carga.ts:10-22, :101-110 (conferirFreio), :223-257 ; docs/planejamento/dados/cadernos/{amigo,companheiro,pesquisador}.json:47 ; agrupadas.json:101
- critérios: modelo, unicidade, clube novo         apps/api/prisma/schema.prisma:627-648 (:642 nome, :644 gatilho) ; apps/api/src/scripts/clube-criar.ts:27-48 ; clube-criar.spec.ts:10-25 ; apps/api/test/fabricas.ts:74
- única escrita de pontos                          apps/api/src/pontos/servico-pontos.ts:28-60 ; schema.prisma:724-746
- envio idempotente, pontos e conflito da reunião  apps/api/src/reunioes/reunioes-envio.service.ts:71-98, :319-351 ; schema.prisma:682-722, :828-838, :992
- ranking do mês: unidade atual, soma              apps/api/src/ranking/calculo-ranking.ts:63-90, :122, :149-157
- escopo (conselheiro, instrutor, permissões)      apps/api/src/desbravadores/escopo.service.ts:15, :28-65
- ano do clube                                     packages/shared/src/datas.ts:9
- ficha do DBV                                     apps/api/src/progresso/servico-progresso.ts:160-200 ; apps/web/src/modulos/perfil/SecaoProgresso.tsx:110-131
- eventos: rotas e serviço                         apps/api/src/calendario/eventos.controller.ts:30-36, :69-94 ; servico-eventos.ts:77 doAno, :89 obter, :95 criar, :99 editar, :103 remover, :109 gravar, :151 trava por clube
- trava por clube (molde)                          apps/api/src/calendario/servico-eventos.ts:151 ; apps/api/src/materiais/materiais.service.ts:182
- calendário do Adm (web)                          apps/web/src/modulos/adm/calendario/tipos.ts:10, :22, :31, :37, :46 ; CalendarioDoCelular.tsx:19,130,170 ; FichaEvento.tsx:97 ; FormularioEvento.tsx:41,73,122-123
- upload de material e URL assinada                apps/api/src/materiais/materiais.controller.ts:16, :39-64 ; materiais.service.ts:248 ; schema.prisma:748-767
- nginx (repo e host)                              apps/web/nginx.conf:16, :32-40 ; scripts/nginx-host.conf:21
- pacote de sync e provider por papel              apps/api/src/sync/sync.service.ts:15, :40-75 ; sync.module.ts ; pacote-instrutor.service.ts ; apps/web/src/offline/pacote.ts:14-47 ; apps/web/src/sessao/ProvedorSessao.tsx:116-118
- fila offline: tipo, avisos, recusa, página       apps/web/src/offline/tipos/reuniao.ts:40-75 ; tipos/todos.ts ; offline/motor.ts:259-268 ; apps/web/src/modulos/fila/PaginaFila.tsx
- chamada da reunião (molde de estado)             apps/web/src/modulos/reunioes/chamada/estado.ts:41, :130
- permissão no front                               apps/web/src/sessao/useSessao.ts:20 ; ProvedorSessao.tsx:349-356
- rotas, menu, teste de rotas                      apps/web/src/rotas.tsx:60-110 ; apps/web/src/rotas.test.tsx:8 ; apps/web/src/layouts/LayoutAdm.tsx:16-27
- início do conselheiro e do instrutor             apps/web/src/modulos/inicio/InicioConselheiro.tsx:295 ; apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:193
- configurações do clube (web)                     apps/web/src/modulos/adm/configuracoes/AdmConfiguracoes.tsx:118-214
- componentes de tela                              apps/web/src/ui/ (BarraProgresso.tsx:11, Campo.tsx:18-51, EstadoVazio.tsx:10, EstadosDeCarga.tsx:10-30, ErrosDoFormulario.tsx:37-58)
- guarda de clube                                  apps/api/src/comum/prisma/guarda-clube.ts:4-40
- fábricas e banco de teste                        apps/api/test/fabricas.ts:74, :109-440 ; apps/api/test/banco.ts
- e2e de referência (offline)                      e2e/offline.spec.ts
- conferido em                                     6bc7e05
```
