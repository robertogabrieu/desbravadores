# Férias, reunião extra, "classe" no lugar de "aula" e tarefa para casa — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** executar as duas SPECs aprovadas na mesma branch — o calendário passa a ter marcações
afirmativas, Férias e Reunião extra, com uma regra só do dia em `packages/shared`, e todo texto
visível troca "aula" por "classe"; o instrutor passa requisitos e especialidades para casa no
registro da classe, é lembrado no início e cobra no registro seguinte.

**Architecture:** calendário — `situacaoDaData(data, diaReuniao, eventos)` no shared vira a única
regra; API e web passam a chamá-la com o dia de reunião do clube; uma migration converte as duas
colunas negativas em `temReuniao`/`temClasse` e acrescenta dois valores ao enum; o pacote offline
ganha `calendario` para o início do conselheiro calcular sem rede. Tarefa — duas tabelas novas
(`TarefaCasa`, `TarefaItem`) e `EspecialidadeConcluida.registroAulaId`; tudo trafega no envio do
registro que já existe (`PUT /sync/aulas/:uuid`), por diferenças; a pendência é derivada, nunca
guardada; o pacote do instrutor traz tarefas, conclusões de especialidade e o catálogo.

**Tech Stack:** NestJS 11 + Prisma 7 (API, Jest sem checagem de tipos), React 19 + React Router 7 +
TanStack Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`, Postgres 17, Playwright
(e2e, headless).

**Specs:** [calendario-ferias-extras/SPEC.md](SPEC.md) e
[tarefa-de-casa/SPEC.md](../tarefa-de-casa/SPEC.md), com os modelos em [modelo/](modelo/) e
[../tarefa-de-casa/modelo/](../tarefa-de-casa/modelo/) — **o modelo vence a SPEC** (estrutura,
ordem e texto; nunca CSS). **Branch:** `feature/calendario-e-tarefas` · **Worktree:**
`/home/robertogabrieu/desbravadores/.claude/worktrees/calendario` · **PR:** #25 (rascunho) ·
**Base:** `main` em `8f142ef` (a branch está em `7ddb020`; os três commits dela só tocam `docs/`,
então nada de merge da main).

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared`; toda operação
  de modelo de clube leva `clubeId` (fora do clube ou do escopo, 404) e `include` aninhado leva
  `clubeId` no `where`, com teste de isolamento; ids do Prisma Client (o da tarefa vem do aparelho
  no primeiro envio, como o do registro); nunca apagar linha com histórico (`removidoEm`);
  `LancamentoPontos` só por `ServicoPontos.sincronizar` (a especialidade entregue no registro usa a
  mesma origem da ficha, `ESPECIALIDADE` + `<dbvId>:<especialidadeId>`); modelo novo de clube em
  `MODELOS_DE_CLUBE` no mesmo pacote da migration; conflito por `versao`; conexão só por
  `useConexao`; tela com carregando, vazio, erro e sem conexão.
- **Código da tarefa vai em `apps/api/src/aulas/`**, nunca em `src/tarefas/` (trabalhos agendados).
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** Cor nova vira token em `ui/tokens.css`.
- **Nenhum elemento `fixed`/`sticky` novo** — o usuário prefere telas sem barra presa.
- **Nomes internos não mudam** (`RegistroAula`, `AulaPlanejada`, rotas `/aulas`, `aula.registrar`).
- **Testes antes da implementação, dentro de cada pacote:** todos escritos primeiro e vistos
  falhando; depois implementar; depois verde. Nada de intercalar teste por passo.
- **Validação pesada só no P10** (suíte inteira, lint, e2e, build, medição, QA). Por pacote: só os
  testes do pacote e `tipos` do workspace.
- **Baseline por nomes já existe**, de suítes verdes na `main`: API e web sem falhas; e2e com 1
  falha pré-existente (`e2e/fundacao.spec.ts`, "a instalação PWA existe: manifesto e service worker
  registrados"). **Não recolher baseline completo.**
- **Máquina fraca** — tudo pelo `pesado`, uma suíte pesada por vez:
  `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; testes de dentro do pacote,
  `cd apps/web|apps/api|packages/shared && pesado testar --script teste -- <caminhos>` (já usa 1
  worker; **não** passar `--maxWorkers`); tipos `pesado -- npm run tipos -w web|api|packages/shared`
  ou da raiz; lint `NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`; a
  espera da fila conta no tempo do Bash (`timeout: 600000` ou segundo plano).
- **`packages/shared` é consumido pelo `dist/` na API** (o web usa o `src/` por alias,
  `apps/web/vite.config.ts:70`): mudou contrato ou fórmula, `pesado -- npm run build -w packages/shared`
  antes de testar a API.
- **Banco de teste da API é próprio por execução** (`test/global-setup.ts:13` → `test/banco.ts:24-45`
  cria `teste_<pid>_<hex>` e roda `prisma migrate deploy`): duas suítes da API ao mesmo tempo não
  disputam banco, só memória, que o `pesado` enfileira. Migration só o principal escreve (P0, P0b),
  sem subagente no ar.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`), com o título
  sugerido no fim de cada pacote.

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** calendário: contratos, regra do dia, migration, fábrica, handlers | agente principal (inline) | — |
| 1 | **P1** API: gravar evento, calendário do ano, conflito, troca do dia | subagente `implementador` | P0 |
| 1 | **P3** Adm web: formulário, ficha e calendário | subagente `implementador` | P0 |
| 2 | **P2** montagem do cronograma (API + web) | subagente `implementador` | P0 |
| 2 | **P4** conselheiro: próxima reunião, pacote e chamada (API + web) | subagente `implementador` | P0 |
| 3 | **P5a** "aula" → "classe": telas do instrutor (web) — mecânico | subagente `implementador` | P1–P4 fechados |
| 3 | **P5b** "aula" → "classe": cronograma, observações, mensagens da API — mecânico | subagente `implementador` | P1–P4 fechados |
| 4 | **P0b** tarefa: contratos, migration, guarda, fábrica, handlers | agente principal (inline) | onda 3 |
| 5 | **P6** API: envio do registro — passar, cobrar, encerrar | subagente `implementador` | P0b |
| 5 | **P8** web: passar para casa (estado, fila, seção "Para casa") | subagente `implementador` | P0b, P5a |
| 6 | **P7** lembrete: pacote e início do instrutor (API + web) | subagente `implementador` | P0b |
| 6 | **P9** web: cobrar no registro (estado, fila, bloco de cobrança) | subagente `implementador` | P8 |
| 7 | **P10** fase final: e2e, suítes, lint, build, medição, revisão, QA, docs | `implementador` (e2e) → `testador` → revisão → `qa-runner` → `documentador` → `gestor-pr` | todos |

**Paralelo, no máximo dois implementadores de cada vez**, e só pacotes de arquivos disjuntos
(conferido nas listas de cada pacote):

| Onda | Par | Por que não se tocam |
|---|---|---|
| 1 | P1 ‖ P3 | P1 só em `apps/api/src/{calendario,clube,cronogramas/servico-cronograma.ts}`; P3 só em `apps/web/src/modulos/adm/calendario/` e `ui/tokens.css` |
| 2 | P2 ‖ P4 | P2 em `cronogramas/montagem/` e `modulos/cronograma-montagem/`; P4 em `inicio/`, `sync/sync.*`, `modulos/inicio/`, `modulos/reunioes/chamada/` |
| 3 | P5a ‖ P5b | P5a só web do instrutor (`inicio-instrutor`, `classes`, `aulas`, `api/aulas.ts`, `offline/tipos/aula*`, `SeloPapel`); P5b em `cronograma/`, `observacoes/`, `permissoes*`, `contratos/observacoes.ts`, `api/src/{aulas,observacoes}` |
| 5 | P6 ‖ P8 | P6 só `apps/api/src/aulas/`; P8 só `apps/web/src/{modulos/aulas,offline}` |
| 6 | P7 ‖ P9 | P7 em `apps/api/src/{sync/pacote-instrutor*,sync/sync.spec.ts,instrutor,aulas/tarefas-leitura.ts}` e `modulos/inicio-instrutor/`; P9 em `modulos/aulas/` e `offline/tipos/aula*` |

**Compilação entre as ondas** (esperado, não é defeito do pacote; cada implementador olha só os
erros de `tipos` **nos arquivos do próprio pacote**):
- Depois do P0 a API não compila (colunas renomeadas) até P1, P2 e P4; o web, em
  `adm/calendario/tipos.ts` (o `Record` ganhou dois tipos) até o P3 e em `cronograma-montagem/datas.ts`
  até o P2. **Fim da onda 2: `pesado -- npm run tipos` da raiz verde**, conferido pelo principal.
- Depois do P0b a API não compila em `aulas-envio.service.ts` (saída sem os campos novos) até o P6,
  nem em `pacote-instrutor.service.ts`/`instrutor.service.ts` até o P7; o web, em `estado.ts`
  (corpo do envio) até o P8. **Fim da onda 6: `tipos` da raiz verde.**

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 15 (shared 7, prisma 2, API 2, handlers 4) | principal — dono compartilhado |
| P1 | 7 | implementador |
| P2 | 11 | implementador |
| P3 | 9 | implementador |
| P4 | 8 | implementador |
| P5a | 13 | implementador (mecânico) |
| P5b | 13 | implementador (mecânico) |
| P0b | 11 (shared 3, prisma 2, guarda 2, fábrica 1, handlers 3) | principal — dono compartilhado |
| P6 | 7 | implementador |
| P7 | 8 | implementador |
| P8 | 11 | implementador |
| P9 | 8 | implementador |
| P10 | 4 (e2e) + roteiro de QA | implementador + testador + qa-runner + documentador |
| **Total** | **~125** | 11 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U — **591k com 1–2
arquivos, 256k com 6–10, 559k com 21+**. Os pacotes ficam entre 7 e 13 (teto 15). Juntar P1+P2
(18) ou P8+P9 (19, e os mesmos arquivos) cairia no braço caro; partir P2 em API e web (3 + 8)
repagaria o piso de ~27k para arquivos que se leem juntos (a montagem só faz sentido com as duas
pontas). Nenhum pacote delegado tem menos de 6: a regra do dia no shared (3 arquivos) ficou no P0,
inline, porque todos os pacotes do calendário a consomem. P0 e P0b passam de 6 mas ficam com o
principal porque são todos de dono compartilhado (contratos, `schema.prisma`, migration,
`MODELOS_DE_CLUBE`, fábrica e handlers que vários pacotes importam) — escritos antes de delegar,
eliminam dois pacotes editando o mesmo arquivo. P10 tem só 4 arquivos e ainda assim é delegado:
a saída do e2e não pode entrar no contexto do principal (§3, eixo do contexto).

### A troca "aula" → "classe": dividida por dono, com um pacote mecânico próprio

- **Onde um pacote funcional já reescreve o arquivo, a troca vai junto** (os textos vêm do modelo e
  os testes do pacote os conferem): P1 (`servico-eventos.ts:303-304`, `clube.service.ts:58`), P2
  (`servico-montagem.ts` e as telas da montagem), P3 (`FormularioEvento`, `FichaEvento`,
  `EditarEvento`). Em outro pacote, dois pacotes editariam o mesmo arquivo e o mesmo teste.
- **O resto é pacote mecânico próprio, com commit separado** (`refactor(textos): ...`), para a
  revisão ver só substituição de texto: P5a e P5b, disjuntos, em paralelo — juntos dariam 26
  arquivos, o braço caro do U.
- **Onda 3, depois do calendário e antes da tarefa:** P5a toca `FormularioAula.tsx`,
  `TelaInicioInstrutor.tsx`, `offline/tipos/aula.ts`, e P5b toca `aulas-envio.service.ts` — os
  mesmos arquivos que P6–P9 reescrevem. Indo antes, a tarefa já nasce testando "Registrar classe",
  "Salvar classe", "Requisitos desta classe", sem colisão e sem segunda passada.
- **e2e** com texto antigo (`adm.spec.ts:108,113-114`, `instrutor.spec.ts:85,94`) fica no P10, junto
  com o resto do e2e.

Orçamento por implementador: **~80 turnos**.

---

## P0 — calendário: contratos, regra do dia, migration · agente principal (inline), onda 0

**Por que inline:** a regra do dia, os contratos e as colunas são consumidos por P1–P4; os
handlers e a fábrica, por quase todos os testes do calendário.

**Files:**
- Modify: `packages/shared/src/enums.ts:37,57-62` (`TIPOS_EVENTO` + dois valores no fim; `MARCACOES_PADRAO` positivo)
- Modify: `packages/shared/src/contratos/calendario.ts:6-23` (positivas, sem `refine`)
- Modify: `packages/shared/src/contratos/cronograma.ts:44-47` (`SituacaoData` nova, `ExtraDoDia`)
- Modify: `packages/shared/src/contratos/inicio.ts:8-20` (`proximaReuniao.nome`, `feriasAte`)
- Modify: `packages/shared/src/contratos/sync.ts:42-71` (`EventoDoPacote`, `PacoteSaida.calendario`)
- Modify: `packages/shared/src/formulas/calendario.ts` (inteiro — regra do dia)
- Modify: `packages/shared/src/formulas/calendario.test.ts` (reescrito no positivo)
- Modify: `apps/api/prisma/schema.prisma:131-136,829-851` (enum e colunas)
- Create: `apps/api/prisma/migrations/20261002120000_calendario_ferias_extras/migration.sql`
- Modify: `apps/api/test/fabricas.ts:407-427` (`Marcacoes` positivo)
- Modify: `apps/api/src/calendario/servico-calendario.ts:12-23` (lê `diaReuniao` por dentro; seleciona `tipo`, `horario`, `local`, positivas) — dono compartilhado de P1 e P2
- Modify: `apps/web/src/testes/handlers/calendario.ts:16-17` (fixture positiva)
- Modify: `apps/web/src/testes/handlers/montagem.ts:31,146-152` (situação nova)
- Modify: `apps/web/src/testes/handlers/inicio.ts:12` (`nome: null`, `feriasAte: null`)
- Modify: `apps/web/src/testes/handlers/offline.ts:9-29` (`calendario: []` no pacote)

**Interfaces (produz):** as funções do Passo 4 (assinaturas lá); `horarioELocalDoDia` foi
acrescentada para que início (API e offline) e chamada usem a mesma conta do "horário e local do
dia"; `ServicoCalendario.situacoes(clubeId, inicio, fim)` com a mesma assinatura e a situação nova.

- [ ] **Passo 1: conferir o banco antes de escrever** (CLAUDE.md: o banco é a fonte da verdade).

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
docker exec desbravadores-postgres-1 psql -U postgres -d desbravador -c '\d "EventoCalendario"' -c '\dT+ "TipoEvento"'
```
Esperado: colunas `cancelaReuniao`, `bloqueiaAula`, `bomParaCampo` booleanas `NOT NULL`; enum com
`SEM_REUNIAO, ACAMPAMENTO, EVENTO, FERIADO`. Se o banco de dev não existir/estiver vazio, conferir
na criação: `migrations/20260930120000_fase2_3_instrutor_adm/migration.sql:2,17-34`.

- [ ] **Passo 2: contratos e enums.**

```ts
// enums.ts
export const TIPOS_EVENTO = ['SEM_REUNIAO', 'ACAMPAMENTO', 'EVENTO', 'FERIADO', 'FERIAS', 'REUNIAO_EXTRA'] as const
/** Padrão das marcações por tipo. Férias: a API grava sempre este; Reunião extra: campo é sempre não. */
export const MARCACOES_PADRAO = {
  SEM_REUNIAO: { temReuniao: false, temClasse: false, bomParaCampo: false },
  EVENTO: { temReuniao: true, temClasse: false, bomParaCampo: false },
  ACAMPAMENTO: { temReuniao: false, temClasse: true, bomParaCampo: true },
  FERIADO: { temReuniao: true, temClasse: true, bomParaCampo: false },
  FERIAS: { temReuniao: false, temClasse: true, bomParaCampo: false },
  REUNIAO_EXTRA: { temReuniao: true, temClasse: true, bomParaCampo: false },
} as const

// contratos/calendario.ts — o refine de datas sai daqui e vai para validarEvento (roda depois do padrão do tipo)
export const EventoEntrada = z.object({
  nome: TextoCurto, tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
  horario: Horario.nullable(), local: z.string().trim().max(120).nullable(),
  temReuniao: z.boolean(), temClasse: z.boolean(), bomParaCampo: z.boolean(),
})
export const EventoSaida = z.object({
  id: Uuid, nome: z.string(), tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
  horario: Horario.nullable(), local: z.string().nullable(),
  temReuniao: z.boolean(), temClasse: z.boolean(), bomParaCampo: z.boolean(),
})

// contratos/cronograma.ts (importar Horario de ../enums)
export const ExtraDoDia = z.object({
  nome: z.string(), temReuniao: z.boolean(), temClasse: z.boolean(), horario: Horario.nullable(), local: z.string().nullable(),
})
export const SituacaoData = z.object({
  reuniaoMantida: z.boolean(), classeLiberada: z.boolean(), bomParaCampo: z.boolean(),
  temReuniao: z.boolean(), temClasse: z.boolean(), ferias: z.boolean(),
  extra: ExtraDoDia.nullable(),
  eventos: z.array(z.string()), // nomes, inclusive o da extra
})

// contratos/inicio.ts — proximaReuniao ganha `nome: z.string().nullable()` (da extra) e fica null
// também sem reunião em 120 dias; InicioConselheiroSaida ganha:
/** Fim das férias em que cai o próximo dia normal sem reunião; null fora das férias e sem unidade. */
feriasAte: DataCivil.nullable(),

// contratos/sync.ts
export const EventoDoPacote = EventoSaida.omit({ id: true })
// em PacoteSaida, depois de albunsRecentes:
/** Eventos não removidos com inicio <= hoje+120 e fim >= hoje. O default mantém válidos pacotes guardados antes. */
calendario: z.array(EventoDoPacote).default([]),
```

- [ ] **Passo 3: testes da regra do dia primeiro** — `packages/shared/src/formulas/calendario.test.ts`
  reescrito no positivo (a função `evento()` do teste ganha `tipo`, `horario: null`, `local: null`
  e espalha `MARCACOES_PADRAO[tipo]`; datas de out/2026, domingo = 0). Casos, um por linha:

| describe › caso | asserção-chave |
|---|---|
| situacaoDaData › sem evento num domingo | `{ reuniaoMantida, classeLiberada: true, temReuniao, temClasse: true, bomParaCampo, ferias: false, extra: null }` |
| › sem evento numa quarta | `temReuniao` e `temClasse` falsos, `reuniaoMantida` verdadeiro |
| › entre comuns, qualquer um que tire, tira | Feriado + Sem reunião → `reuniaoMantida: false`; Feriado + Evento → `classeLiberada: false`; Acampamento + Feriado → `bomParaCampo: true` |
| › `temClasse` por campo fora do dia normal | sábado do acampamento → `temClasse: true`, `temReuniao: false` |
| › Férias no domingo | `ferias: true`, `temReuniao: false`, `temClasse: false`, `classeLiberada: true` |
| › acampamento dentro das férias | domingo e sábado do acampamento → `temClasse: true` |
| › extra numa quarta com reunião | `temReuniao: true`, `extra.nome`, `extra.horario` da extra |
| › a extra vence: dentro das férias (sábado e domingo); com classe num feriado sem classe | `temReuniao: true` nas duas; `temClasse: true` |
| › extra com Terá reunião = não num domingo normal | `temReuniao: true` (o dia normal segue) |
| › evento removido ignorado; nomes | igual ao "sem evento"; `eventos` traz comuns e a extra |
| equivalência › 8 combinações × (domingo, quarta) | para cada `(c, b, f)` num evento só: nova `temClasse` = `!b && (f \|\| (domingo && !c))`; `emConflito` novo = `b \|\| (c && !f)` (fórmula antiga copiada no teste) |
| emConflito › data sem evento numa quarta; extra com classe sobre "Sem reunião"; domingo em férias | `false`; `false`; `true` |
| diasDeReuniao › inclui extra de quarta e tira domingos de férias | lista exata de out/2026 |
| datasDeClasse › renomeada, mesma lista de hoje para eventos antigos | igual ao teste atual de `datasDeAula` |
| datasDaMontagem › domingo em férias some; domingo "Sem reunião" fica | lista exata |
| › acampamento em férias e extra com classe entram; extra só com reunião não | lista exata |
| proximaReuniao › hoje inclusive; pula férias | domingo hoje → `{ data: hoje, extra: null }`; férias 7/12–1/02, hoje 10/12 → `2/02` |
| › extra numa quarta antes do domingo | `{ data: quarta, extra: { nome, ... } }` |
| › nada em 120 dias | `null`; com `limiteEmDias = 7` e férias de 10 dias → `null` |
| feriasAte › primeiro domingo em férias | fim das férias |
| › encadeadas (A até 15/01, B 16/01–1/02) e separadas por "Sem reunião" | fim de B |
| › separadas por domingo com reunião | fim de A |
| › extra no primeiro domingo; primeiro domingo sem evento | `null`; `null` |
| horarioELocalDoDia › extra com reunião e horário; extra só com classe | horário da extra e local do clube se o dela é nulo; os dois do clube |
| validarEvento › fim antes do início | `[{ campo: 'fim', mensagem: 'O fim não pode ser antes do início' }]` |
| › extra de dois dias | `[{ campo: 'fim', mensagem: 'A reunião extra é de um dia só.' }]` |
| › extra sem as duas caixas; evento válido | `[{ campo: 'temReuniao', mensagem: 'Marque Terá reunião, Terá classe ou as duas.' }]`; `[]` |

```bash
cd packages/shared && pesado testar --script teste -- src/formulas/calendario.test.ts   # esperado: vermelho
```

- [ ] **Passo 4: a regra do dia** — `packages/shared/src/formulas/calendario.ts` (mantém
  `UM_DIA_MS`, `instante`, `datasDoIntervalo`, `diaDaSemana`, `EntradaEmConflito`, `situacaoDaAula`):

```ts
import type { z } from 'zod'
import type { SITUACOES_AULA, SituacaoData } from '../contratos/cronograma'
import type { TipoEvento, Trilha } from '../enums'

export type SituacaoDeData = z.infer<typeof SituacaoData>
export type ExtraDaData = NonNullable<SituacaoDeData['extra']>
export type SituacaoAula = (typeof SITUACOES_AULA)[number]

/** O que as fórmulas precisam de um evento; `removido` = já removido (ignorado). */
export interface EventoDoCalendario {
  nome: string; tipo: z.infer<typeof TipoEvento>; inicio: string; fim: string
  horario: string | null; local: string | null
  temReuniao: boolean; temClasse: boolean; bomParaCampo: boolean
  removido?: boolean
}

/** Janela da próxima reunião e do calendário do pacote: cobre férias de dezembro a fevereiro. */
export const JANELA_DO_CALENDARIO_EM_DIAS = 120

function somarDias(data: string, dias: number): string {
  return new Date(instante(data) + dias * UM_DIA_MS).toISOString().slice(0, 10)
}

function cobre(data: string) {
  return (evento: EventoDoCalendario): boolean => !evento.removido && evento.inicio <= data && data <= evento.fim
}

/**
 * A regra do dia. Comuns (tudo menos a Reunião extra): qualquer um que tire, tira. A extra só
 * acrescenta e vence a sobreposição. Férias é gravada com Terá classe = sim para não derrubar o
 * acampamento no meio dela: sem reunião e sem campo, não há classe.
 */
export function situacaoDaData(data: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): SituacaoDeData {
  const doDia = eventos.filter(cobre(data))
  const comuns = doDia.filter((evento) => evento.tipo !== 'REUNIAO_EXTRA')
  const extra = doDia.find((evento) => evento.tipo === 'REUNIAO_EXTRA') ?? null
  const reuniaoMantida = comuns.every((evento) => evento.temReuniao)
  const classeLiberada = comuns.every((evento) => evento.temClasse)
  const bomParaCampo = comuns.some((evento) => evento.bomParaCampo)
  const reuniaoDoDiaNormal = diaDaSemana(data) === diaReuniao && reuniaoMantida
  return {
    reuniaoMantida, classeLiberada, bomParaCampo,
    temReuniao: reuniaoDoDiaNormal || (extra?.temReuniao ?? false),
    temClasse: (classeLiberada && (reuniaoDoDiaNormal || bomParaCampo)) || (extra?.temClasse ?? false),
    ferias: comuns.some((evento) => evento.tipo === 'FERIAS'),
    extra: extra && { nome: extra.nome, temReuniao: extra.temReuniao, temClasse: extra.temClasse, horario: extra.horario, local: extra.local },
    eventos: doDia.map((evento) => evento.nome),
  }
}

export function diasDeReuniao(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => situacaoDaData(data, diaReuniao, eventos).temReuniao)
}

/** Trilha individual: datas em que cabe classe (ex-`datasDeAula`). */
export function datasDeClasse(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => situacaoDaData(data, diaReuniao, eventos).temClasse)
}

/** Linhas da montagem: dias normais fora das férias (bloqueados ou não), datas boas para campo e extras com classe. */
export function datasDaMontagem(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => {
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    return (diaDaSemana(data) === diaReuniao && !situacao.ferias) || situacao.bomParaCampo || (situacao.extra?.temClasse ?? false)
  })
}

/** Só evento que tira a classe gera conflito: data sem evento nunca é conflito (igual a antes da SPEC). */
export function emConflito(entrada: EntradaEmConflito): boolean {
  const { situacaoDaData: situacao } = entrada
  const extraSegura = situacao.extra?.temClasse ?? false
  const deixouDeSerDataDeClasse = !extraSegura && (!situacao.classeLiberada || (!situacao.reuniaoMantida && !situacao.bomParaCampo))
  return entrada.trilha === 'INDIVIDUAL' && entrada.temRequisitos && !entrada.temRegistro && entrada.data >= entrada.hoje && deixouDeSerDataDeClasse
}

/** Hoje inclusive. `extra` só vem quando é ela que dá a reunião do dia. */
export function proximaReuniao(
  hoje: string, diaReuniao: number, eventos: readonly EventoDoCalendario[], limiteEmDias = JANELA_DO_CALENDARIO_EM_DIAS,
): { data: string; extra: ExtraDaData | null } | null {
  for (let dias = 0; dias <= limiteEmDias; dias++) {
    const data = somarDias(hoje, dias)
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    if (situacao.temReuniao) return { data, extra: situacao.extra?.temReuniao ? situacao.extra : null }
  }
  return null
}

/**
 * Do primeiro dia normal >= hoje: se ele não tem reunião e está em férias, o fim delas. Férias seguidas
 * se juntam enquanto nenhum dia normal COM reunião fica entre elas. Primeiro dia normal com reunião: null.
 */
export function feriasAte(hoje: string, diaReuniao: number, eventos: readonly EventoDoCalendario[], limiteEmDias = JANELA_DO_CALENDARIO_EM_DIAS): string | null {
  let ate: string | null = null
  for (let dias = 0; dias <= limiteEmDias; dias++) {
    const data = somarDias(hoje, dias)
    if (diaDaSemana(data) !== diaReuniao) continue
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    if (situacao.temReuniao) return ate
    if (!situacao.ferias) { if (ate === null) return null; continue }
    for (const evento of eventos.filter(cobre(data))) {
      if (evento.tipo === 'FERIAS' && (ate === null || evento.fim > ate)) ate = evento.fim
    }
  }
  return ate
}

/** Horário e local do dia: os da extra que dá a reunião, campo a campo; senão os do clube. */
type HorarioELocal = { horario: string; local: string | null }
export function horarioELocalDoDia(situacao: Pick<SituacaoDeData, 'extra'>, padrao: HorarioELocal): HorarioELocal {
  const extra = situacao.extra?.temReuniao ? situacao.extra : null
  return { horario: extra?.horario ?? padrao.horario, local: extra?.local ?? padrao.local }
}

export interface ProblemaDeEvento { campo: 'fim' | 'temReuniao'; mensagem: string }

/** Roda DEPOIS do padrão do tipo (API e formulário). "Duas extras na data" é da API, dentro da transação. */
export function validarEvento(entrada: Pick<EventoDoCalendario, 'tipo' | 'inicio' | 'fim' | 'temReuniao' | 'temClasse'>): ProblemaDeEvento[] {
  const problemas: ProblemaDeEvento[] = []
  if (entrada.fim < entrada.inicio) problemas.push({ campo: 'fim', mensagem: 'O fim não pode ser antes do início' })
  else if (entrada.tipo === 'REUNIAO_EXTRA' && entrada.fim !== entrada.inicio) problemas.push({ campo: 'fim', mensagem: 'A reunião extra é de um dia só.' })
  if (entrada.tipo === 'REUNIAO_EXTRA' && !entrada.temReuniao && !entrada.temClasse) {
    problemas.push({ campo: 'temReuniao', mensagem: 'Marque Terá reunião, Terá classe ou as duas.' })
  }
  return problemas
}
```

```bash
cd packages/shared && pesado testar --script teste -- src/formulas/calendario.test.ts   # verde
cd ../.. && pesado -- npm run tipos -w packages/shared && pesado -- npm run build -w packages/shared
```

- [ ] **Passo 5: schema e migration.** `schema.prisma`: `enum TipoEvento` ganha `FERIAS` e
  `REUNIAO_EXTRA` no fim; em `EventoCalendario`, `cancelaReuniao`/`bloqueiaAula` saem e entram
  `temReuniao Boolean` e `temClasse Boolean` (antes de `bomParaCampo`).
  `apps/api/prisma/migrations/20261002120000_calendario_ferias_extras/migration.sql`, no estilo de
  `20261001180000_tipo_diretoria`:

```sql
-- Marcacoes afirmativas e os tipos Ferias e Reuniao extra (SPEC calendario-ferias-extras). Escrita a mao:
-- o Prisma apagaria e recriaria as colunas, perdendo os valores. Nada aqui usa FERIAS nem REUNIAO_EXTRA:
-- o Postgres aceita ADD VALUE dentro da transacao desde que o valor nao seja usado nela.
-- So de ida. A volta minima esta registrada na PR #25.
ALTER TYPE "TipoEvento" ADD VALUE 'FERIAS';
ALTER TYPE "TipoEvento" ADD VALUE 'REUNIAO_EXTRA';

ALTER TABLE "EventoCalendario"
  ADD COLUMN "temReuniao" BOOLEAN,
  ADD COLUMN "temClasse" BOOLEAN;

UPDATE "EventoCalendario" SET "temReuniao" = NOT "cancelaReuniao", "temClasse" = NOT "bloqueiaAula";

ALTER TABLE "EventoCalendario"
  ALTER COLUMN "temReuniao" SET NOT NULL,
  ALTER COLUMN "temClasse" SET NOT NULL,
  DROP COLUMN "cancelaReuniao",
  DROP COLUMN "bloqueiaAula";
```

Volta mínima (vai **só** no corpo da PR, não é passo do deploy):

```sql
ALTER TABLE "EventoCalendario" ADD COLUMN "cancelaReuniao" BOOLEAN, ADD COLUMN "bloqueiaAula" BOOLEAN;
UPDATE "EventoCalendario" SET "cancelaReuniao" = NOT "temReuniao", "bloqueiaAula" = NOT "temClasse";
UPDATE "EventoCalendario" SET tipo = 'SEM_REUNIAO', "cancelaReuniao" = true, "bloqueiaAula" = true, "bomParaCampo" = false WHERE tipo IN ('FERIAS', 'REUNIAO_EXTRA');
ALTER TABLE "EventoCalendario" ALTER COLUMN "cancelaReuniao" SET NOT NULL, ALTER COLUMN "bloqueiaAula" SET NOT NULL, DROP COLUMN "temReuniao", DROP COLUMN "temClasse";
-- O enum fica com os dois valores: o Postgres não remove valor de enum.
```

```bash
cd apps/api && pesado -- npx prisma generate
```

- [ ] **Passo 6: teste manual da conversão, num banco descartável** (nunca no banco de dev, que
  outras worktrees usam). Não existe `npm run db:migrate` neste repositório: as migrations sobem
  por `npx prisma migrate deploy` (é o que `test/banco.ts:36` faz). O passo a passo e o resultado
  vão para a PR.

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
cd /home/robertogabrieu/desbravadores/.claude/worktrees/calendario/apps/api
PSQL="docker exec -i desbravadores-postgres-1 psql -v ON_ERROR_STOP=1 -U postgres"
URL=postgresql://desbravador:desbravador@localhost:5442/migra_calendario

# (1) banco na migration anterior: tira a nova (e a do P0b, se já existir) só durante o deploy
$PSQL -c 'DROP DATABASE IF EXISTS migra_calendario' -c 'CREATE DATABASE migra_calendario OWNER desbravador'
mkdir -p /tmp/migra-nova && mv prisma/migrations/20261002120000_calendario_ferias_extras /tmp/migra-nova/
DATABASE_URL=$URL npx prisma migrate deploy
mv /tmp/migra-nova/20261002120000_calendario_ferias_extras prisma/migrations/

# (2) 4 tipos antigos x 8 combinações x (domingo, quarta), cada um numa data só dele
#     (banco descartável: a regra "ids do Prisma Client" do CLAUDE.md vale para código)
$PSQL -d migra_calendario <<'SQL'
INSERT INTO "Clube" (id, nome, slug, "atualizadoEm") VALUES (gen_random_uuid(), 'Migra', 'migra', now());
INSERT INTO "Usuario" (id, nome, email, "atualizadoEm") VALUES (gen_random_uuid(), 'Migra', 'migra@teste', now());
INSERT INTO "EventoCalendario" (id, "clubeId", nome, tipo, inicio, fim, "cancelaReuniao", "bloqueiaAula", "bomParaCampo", "criadoPorId", "atualizadoEm")
SELECT gen_random_uuid(), c.id, t.tipo || ' ' || m.n || ' +' || d.desloc, t.tipo::"TipoEvento",
       date '2026-11-01' + ((t.i * 8 + m.n) * 7 + d.desloc)::int, date '2026-11-01' + ((t.i * 8 + m.n) * 7 + d.desloc)::int,
       (m.n & 4) > 0, (m.n & 2) > 0, (m.n & 1) > 0, u.id, now()
FROM (SELECT id FROM "Clube" LIMIT 1) c, (SELECT id FROM "Usuario" LIMIT 1) u,
     unnest(ARRAY['SEM_REUNIAO','ACAMPAMENTO','EVENTO','FERIADO']) WITH ORDINALITY t(tipo, i),
     generate_series(0, 7) m(n), (VALUES (0), (3)) d(desloc);
-- (3) retrato pela fórmula antiga (2026-11-01 é domingo; desloc 0 = domingo, 3 = quarta)
CREATE TABLE antes AS
SELECT id, "cancelaReuniao" AS c, "bloqueiaAula" AS b, "bomParaCampo" AS f, EXTRACT(DOW FROM inicio) = 0 AS domingo,
       (NOT "bloqueiaAula" AND ("bomParaCampo" OR (EXTRACT(DOW FROM inicio) = 0 AND NOT "cancelaReuniao"))) AS classe_antiga,
       ("bloqueiaAula" OR ("cancelaReuniao" AND NOT "bomParaCampo")) AS conflito_antigo
FROM "EventoCalendario";
SELECT count(*) AS eventos FROM antes;  -- esperado: 64
SQL

# (4) aplica a migration nova
DATABASE_URL=$URL npx prisma migrate deploy

# (5) valores invertidos e a fórmula nova dando a mesma situação — esperado: 64 | 0 | 0
$PSQL -d migra_calendario <<'SQL'
SELECT count(*) AS total,
  count(*) FILTER (WHERE e."temReuniao" = a.c OR e."temClasse" = a.b OR e."bomParaCampo" <> a.f) AS nao_inverteu,
  count(*) FILTER (WHERE
    (e."temClasse" AND ((a.domingo AND e."temReuniao") OR e."bomParaCampo")) <> a.classe_antiga
    OR ((NOT e."temClasse") OR (NOT e."temReuniao" AND NOT e."bomParaCampo")) <> a.conflito_antigo) AS situacao_mudou
FROM antes a JOIN "EventoCalendario" e USING (id);
SQL

# deriva entre migrations e schema (esperado: nada a aplicar; se a flag não existir, `npx prisma migrate diff --help`)
DATABASE_URL=$URL npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
$PSQL -c 'DROP DATABASE migra_calendario'
```

- [ ] **Passo 7: fábrica e leitura compartilhada da API.** `test/fabricas.ts:407`:
  `type Marcacoes = { temReuniao: boolean; temClasse: boolean; bomParaCampo: boolean }` (nenhum
  chamador passa `marcacoes` hoje: só o tipo e o espalhamento mudam). `servico-calendario.ts`:
  ler, junto com os eventos, `configuracaoClube.diaReuniao` (`findUniqueOrThrow` por `clubeId`), o
  `select` passa a `nome, tipo, inicio, fim, horario, local, temReuniao, temClasse, bomParaCampo`, e
  cada data vira `situacaoDaData(data, configuracao.diaReuniao, doCalendario)` — quem chama não muda.

- [ ] **Passo 8: handlers do web.** Fixtures no formato novo, sem mudar o nome dos exports:
  `handlers/calendario.ts:16-17` (`temReuniao`, `temClasse` no lugar das negativas, com o padrão do
  tipo); `handlers/montagem.ts:31,146-152` (situação nova, montada por
  `situacaoDaData(data, 0, eventos)` para não duplicar a regra); `handlers/inicio.ts:12`
  (`nome: null` em `proximaReuniao`, `feriasAte: null`); `handlers/offline.ts:9-29`
  (`calendario: []` no pacote padrão).
- [ ] **Passo 9: conferir.**

```bash
cd /home/robertogabrieu/desbravadores/.claude/worktrees/calendario
pesado -- npm run tipos -w packages/shared            # verde
cd apps/api && pesado testar --script teste -- test/harness.spec.ts   # o banco temporário sobe com a migration nova
```
Esperado: shared verde; o harness da API sobe o banco (prova que a migration aplica do zero). API e
web **não** compilam ainda — ver "Compilação entre as ondas".

- [ ] **Passo 10: commit** (skill `commit`): `feat(calendario): regra do dia no positivo, férias e reunião extra no shared e no banco`.

---

## P1 — API: gravar evento, calendário do ano, conflito, troca do dia · subagente, onda 1

**Files:**
- Modify: `apps/api/src/calendario/eventos.controller.ts:10-31,52-69` (padrão do tipo, `validarEvento` depois dele, recusa de chaves antigas)
- Modify: `apps/api/src/calendario/servico-eventos.ts:46-63,77-87,141-198,303-304` (positivas; duas extras; `diaReuniao` no antes/depois; textos)
- Modify: `apps/api/src/cronogramas/servico-cronograma.ts:189` (valor de reserva com `diaReuniao`)
- Modify: `apps/api/src/clube/clube.service.ts:43-59` (extra com classe segura a data; texto `:58`)
- Modify: `apps/api/src/calendario/eventos.spec.ts` (`:83,91-92,106` e casos novos)
- Modify: `apps/api/src/clube/clube.spec.ts` (`:75-106` e o caso da extra)
- Modify: `apps/api/src/cronogramas/cronogramas.spec.ts` (só se algum caso quebrar pela situação nova; senão roda como regressão)

**Interfaces:** consome P0. Produz: erro `VALIDACAO` com `campos` para `fim`/`temReuniao`/`inicio`
e **sem** `campos` para aba antiga (P3 conta com isso).

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| eventos.spec › marcações omitidas valem o padrão do tipo, no positivo | EVENTO → `{ temReuniao: true, temClasse: false, bomParaCampo: false }` |
| › Férias grava sempre o padrão; extra grava campo = não | Férias com `temReuniao: true, bomParaCampo: true` → `false/true/false`; extra com `bomParaCampo: true` → `false` |
| › validação roda depois do padrão | extra sem marcações enviadas → 201 com `temReuniao/temClasse: true` |
| › extra com fim ≠ início; extra sem as duas caixas | 400 `VALIDACAO`, `campos.fim = 'A reunião extra é de um dia só.'`; 400, `campos.temReuniao = 'Marque Terá reunião, Terá classe ou as duas.'` |
| › fim antes do início (ex-`:83`) | 400 com `campos.fim`, nunca 500 |
| › aba antiga manda `cancelaReuniao` ou `bloqueiaAula` | 400 `mensagem = 'Atualize o app para salvar este evento.'` e `campos` ausente |
| › duas extras na mesma data | segunda → 400, `campos.inicio = 'Já há uma reunião extra nesta data.'` |
| › editar a própria extra na data dela; extra removida ou de outro clube não conta | 200/201 |
| › calendário do ano | `diasDeReuniao` inclui a quarta da extra com reunião e exclui os domingos das férias |
| › Férias sobre classe marcada num domingo | `aulasAfetadas` com a classe; notificação `titulo = 'Classe em conflito com o calendário'`, texto `'… deixou de ser dia de classe.'` |
| › acampamento dentro das férias; excluir extra com classe dentro das férias | classe no sábado do acampamento **não** entra em `aulasAfetadas`; a classe daquela data entra em conflito e avisa (antes/depois) |
| › `:91-92,106` (marcações nos testes antigos) | só trocam para as positivas |
| clube.spec › trocar o dia com classe num domingo que tem extra com Terá classe | 200 (não trava) |
| › trocar o dia com classe marcada (ex-`:75-106`) | 409 `REGRA`, `'Há classes marcadas no dia atual de reunião: …'` |
| cronogramas.spec › (regressão) | roda inteiro sem mudar expectativa |

```bash
cd apps/api && pesado testar --script teste -- src/calendario/eventos.spec.ts src/clube/clube.spec.ts src/cronogramas/cronogramas.spec.ts
```

- [ ] **Passo 2: controller.** Um pipe antes do Zod recusa as chaves antigas (hoje o objeto não é
  estrito e elas sumiriam caladas); `comMarcacoes` aplica o padrão e força Férias/extra;
  `validarEvento` roda depois:

```ts
class RecusarMarcacoesAntigas implements PipeTransform<unknown, unknown> {
  transform(corpo: unknown): unknown {
    const antiga = typeof corpo === 'object' && corpo !== null && ('cancelaReuniao' in corpo || 'bloqueiaAula' in corpo)
    if (antiga) throw new ErroApp('VALIDACAO', 'Atualize o app para salvar este evento.') // sem campos: mensagem geral
    return corpo
  }
}
// @Body(new RecusarMarcacoesAntigas(), new ZodValidationPipe(EventoGravar))

function comMarcacoes(entrada: z.infer<typeof EventoGravar>): z.infer<typeof EventoEntrada> {
  const padrao = MARCACOES_PADRAO[entrada.tipo]
  const completo = entrada.tipo === 'FERIAS' ? { ...entrada, ...padrao } : {
    ...entrada, temReuniao: entrada.temReuniao ?? padrao.temReuniao, temClasse: entrada.temClasse ?? padrao.temClasse,
    bomParaCampo: entrada.tipo === 'REUNIAO_EXTRA' ? false : (entrada.bomParaCampo ?? padrao.bomParaCampo),
  }
  const problemas = validarEvento(completo)
  if (problemas.length > 0) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', Object.fromEntries(problemas.map((p) => [p.campo, p.mensagem])))
  return completo
}
```
`EventoGravar` perde o `refine` (`:18`) e as três marcações ficam `.optional()`.

- [ ] **Passo 3: serviço.** `paraSaida` com as positivas; `paraCalendario` continua a identidade
  (a saída já tem `tipo`, `horario`, `local`). Em `transacao`, logo depois do lock (`:151`), se
  `depois?.tipo === 'REUNIAO_EXTRA'`: contar extras não removidas do clube com `inicio = depois.inicio`
  e `id ≠ antes?.id`; havendo, `ErroApp('VALIDACAO', 'Confira os campos informados.', { inicio: 'Já há uma reunião extra nesta data.' })`.
  `situacaoDaData(aula.data, configuracao.diaReuniao, eventos)` em `:181` (a configuração já é
  lida em `:160`). `doAno` passa o `diaReuniao` que já lê (`:85-86`). Textos de `:303-304`.
- [ ] **Passo 4:** `servico-cronograma.ts:189` — o valor de reserva vira
  `situacaoDaData(aula.data, diaReuniao, [])` com o `diaReuniao` da configuração que a leitura já
  tem (se não tiver, ler uma vez antes do laço). `clube.service.ts`: em
  `exigirSemAulaNoDiaDeReuniao`, ler as extras não removidas com `temClasse` nas datas das classes
  encontradas e pular a data que tem uma (`continue` ao lado de `:52`); texto de `:58`.
- [ ] **Passo 5:** testes do pacote verdes; `pesado -- npm run build -w packages/shared` (se o
  shared mudou desde o P0, não deve) e `pesado -- npm run tipos -w api` sem erro **nos arquivos do
  pacote**.
- [ ] **Passo 6: commit:** `feat(calendario): API grava férias e reunião extra no positivo e valida depois do padrão`.

---

## P2 — montagem do cronograma (API + web) · subagente, onda 2

**Files:**
- Modify: `apps/api/src/cronogramas/montagem/servico-montagem-leitura.ts:90-144` (datas por `datasDaMontagem` ∪ datas com classe; reserva `:124`)
- Modify: `apps/api/src/cronogramas/montagem/servico-montagem.ts:28,80,102,128,135,313,319,356-369` (`datasDeClasse`; textos)
- Modify: `apps/api/src/cronogramas/montagem/montagem.spec.ts` (`:135,545-546` e casos novos)
- Modify: `apps/web/src/modulos/cronograma-montagem/datas.ts:15-28` (`dataBloqueada`, rótulos)
- Modify: `apps/web/src/modulos/cronograma-montagem/LinhaData.tsx:61-119` (rótulo "reunião extra"; textos)
- Modify: `apps/web/src/modulos/cronograma-montagem/PainelInstrutor.tsx:86,90` (textos)
- Modify: `apps/web/src/modulos/cronograma-montagem/PainelAdm.tsx:111,117-118` (textos)
- Modify: `apps/web/src/modulos/cronograma-montagem/FormularioAula.tsx:43` (textos)
- Modify: `apps/web/src/modulos/cronograma-montagem/FolhasDoInstrutor.tsx:93` (texto)
- Modify: `apps/web/src/modulos/cronograma-montagem/montagem-adm.test.tsx` (`:245` e casos novos)
- Modify: `apps/web/src/modulos/cronograma-montagem/montagem-instrutor.test.tsx` (`:68` e casos novos)

**Interfaces:** consome P0 (`datasDaMontagem`, `datasDeClasse`, handler `montagem.ts`).

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| montagem.spec › domingos das férias somem da montagem individual | nenhuma linha com data de domingo em férias |
| › domingo em férias com classe marcada aparece | linha presente, situação `temClasse: false` (conflito pela regra) |
| › acampamento dentro das férias; extra com classe numa quarta; extra só com reunião | sábado do acampamento na lista; lista exata |
| › agrupadas seguem livres (`:144`) | sem filtro por calendário |
| › criar dia de classe em data de férias; na quarta da extra com classe | 400/409 com `'Esta data não é dia de classe.'`; 201 |
| › situação no formato novo (ex-`:135,545-546`) | `toMatchObject({ temClasse, reuniaoMantida, extra: null })` |
| › mensagens renomeadas (`:28,80,102,128,135,313,319`) | cada `toThrow`/`mensagem` com "classe"/"dia de classe" do inventário |
| montagem-adm.test › "sem classe", "reunião mantida", "ótimo para campo", "reunião extra" | rótulos na linha da data |
| › data bloqueada só quando `!temClasse` e (sem classe marcada ou `!classeLiberada`) | botão de adicionar desabilitado/ausente conforme a regra |
| › "+ Novo dia de classe", "Nenhuma data de classe neste período", "Crie um dia de classe para…" (ex-`:245`) | textos |
| montagem-instrutor.test › remover, vazio e rótulo da extra (ex-`:68`) | textos; textos; rótulo |

```bash
cd apps/api && pesado testar --script teste -- src/cronogramas/montagem/montagem.spec.ts
cd ../web && pesado testar --script teste -- src/modulos/cronograma-montagem
```

- [ ] **Passo 2: API.** `servico-montagem-leitura.ts:98-101`: sai a regra à mão; `datasDoPeriodo`
  passa a ser `classe.trilha === 'INDIVIDUAL' ? datasDaMontagem(inicio, fim, configuracao.diaReuniao, eventos) : []`
  — os eventos vêm de uma leitura só (mesmo filtro de `ServicoCalendario.situacoes`); se o serviço
  não expõe os eventos, ler pelo Prisma com `clubeId` e o mesmo `select` do P0. `:102` continua a
  união com as datas que têm classe marcada. `:124`: reserva
  `situacaoDaData(data, configuracao.diaReuniao, [])`. `servico-montagem.ts:366`: `datasDeClasse`,
  selecionando `tipo`, `horario`, `local` e as positivas em `:356-365`.
- [ ] **Passo 3: web.** `datas.ts`: `dataBloqueada = !s.temClasse && (!temClasseMarcada || !s.classeLiberada)`;
  rótulos `'sem classe'`, `'ótimo para campo'`, `'reunião mantida'` (de `reuniaoMantida`) e
  `'reunião extra'` (de `extra?.temClasse`). Textos do inventário nos quatro componentes.
- [ ] **Passo 4:** verdes; `tipos -w api` e `tipos -w web` sem erro nos arquivos do pacote. **Commit:** `feat(montagem): férias tiram os domingos e reunião extra com classe entra como data`.

---

## P3 — Adm web: formulário, ficha e calendário · subagente, onda 1

**Files:**
- Modify: `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:24-45,51-104` (tipos, texto de apoio, caixas, campo Data, erro do grupo, `validarEvento`)
- Modify: `apps/web/src/modulos/adm/calendario/FichaEvento.tsx:25-46,87-97,118-129` ("O que muda no calendário"; "Classes afetadas")
- Modify: `apps/web/src/modulos/adm/calendario/EditarEvento.tsx:20-25` ("1 classe estava marcada…")
- Modify: `apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:70,108,124,196-246` (faixa de férias, selo da extra, legenda, vazio)
- Modify: `apps/web/src/modulos/adm/calendario/tipos.ts:6-21` (rótulos, cores, ícones)
- Modify: `apps/web/src/modulos/adm/calendario/datas.ts` (texto dos dias: "domingo 18", "domingos 11 e 18", "9 domingos, de 7/12 a 1/02", "sexta 16 a domingo 18")
- Modify: `apps/web/src/ui/tokens.css:39-43` (`--cal-ferias-bg/fg`)
- Modify: `apps/web/src/modulos/adm/calendario/calendario.test.tsx` (`:34,170-171` e casos novos)
- Modify: `apps/web/src/modulos/adm/calendario/ficha.test.tsx` (`:29,57-83` e casos novos)

**Interfaces:** consome P0 (`validarEvento`, `situacaoDaData`, `MARCACOES_PADRAO`, `TIPOS_EVENTO`,
handler `calendario.ts`). Alvo: `modelo/Main`, `FormEvento-*`, `FichaFerias`, `FichaExtra`.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| ficha.test › Férias | um par só: `'Sem reunião e sem classe nos domingos do período; acampamentos continuam valendo.'` |
| › extra numa quarta, Terá reunião sim, classe não | `'Terá reunião'` → `'Sim (quarta-feira 21)'`; `'Terá classe'` → `'Não'` (modelo FichaExtra: "Sim (sábado 25)") |
| › extra no domingo, sim / não | `'Sim — domingo 18 já tem reunião; vale o horário e o local deste evento'`; `'Não acrescenta — domingo 18 segue o calendário'` |
| › Evento comum num domingo | `'Terá reunião'` → `'Sim (domingo 18)'`; `'Terá classe'` → `'Não (domingo 18)'`; `'Terá atividade de campo'` → `'Não'` |
| › Acampamento sexta a domingo; mais de três dias; sem domingo no período | `'Terá classe'` → `'Sim (sexta 16 a domingo 18)'`; `'Não (9 domingos, de 7/12 a 1/02)'`; `'Não há domingo no período'` |
| › configuração carregando ou com erro | só `'Sim'`/`'Não'`, sem parênteses |
| › aviso depois de salvar (ex-`:57-83`) | região `'Classes afetadas'`; `'1 classe estava marcada nessas datas: …'` / `'2 classes estavam marcadas…'` |
| calendario.test › tipo Férias esconde as caixas e mostra o texto de apoio | nenhum `checkbox`; texto do modelo FormEvento-Ferias |
| › tipo Evento mostra o texto do modelo | `'Evento do clube: a reunião acontece e não há classe, salvo se você marcar. Para um período sem reuniões, escolha Férias; para uma reunião fora do domingo, Reunião extra.'` |
| › caixas no positivo, na ordem, com a legenda | `'Para a reunião e as classes'`; `'Terá reunião'`, `'Terá classe'`, `'Terá atividade de campo'` |
| › Reunião extra: campo Data, sem Início/Fim, duas caixas | `getByLabelText('Data')`; `queryByLabelText('Fim')` nulo; envia `fim === inicio` |
| › trocar para Reunião extra copia o início no fim; API recusa "duas extras" | corpo enviado com `fim` igual; erro sob a Data (`campos.inicio`) |
| › extra sem caixas: erro sob o grupo | `role="alert"` com `'Marque Terá reunião, Terá classe ou as duas.'` dentro do `fieldset`, que tem `aria-describedby` = id do alerta |
| › extra num domingo | `'Domingo já tem reunião: esta reunião extra só muda nome, horário e local.'` sob a Data |
| › Terá classe sem reunião e sem campo | `'Sem reunião e sem campo, não há classe nesses dias.'`; a caixa não muda sozinha |
| › API recusa aba antiga (400 sem campos) | `'Atualize o app para salvar este evento.'` no topo |
| › grade: férias como faixa com a cor de férias | célula do domingo em férias sem o selo "Reunião" (mock de `diasDeReuniao` sem ele) |
| › selo da extra | `'Reunião extra 19h30'`; extra só com classe: `'Classe extra 19h30'`; no domingo, só o selo da extra |
| › legenda; mês vazio; texto de apoio do fim | `'Reunião extra'` e `'Férias'` entre os tipos (modelo Main); `'Cadastre feriados, férias, acampamentos, dias sem reunião e reuniões extras para que o cronograma das classes os respeite.'`; `'…Se já houver classes marcadas no período, o instrutor é avisado.'` |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/adm/calendario
```

- [ ] **Passo 2: `tipos.ts`.** `ROTULOS_DO_TIPO` com `FERIAS: 'Férias'`, `REUNIAO_EXTRA: 'Reunião extra'`;
  `CORES_DO_TIPO.FERIAS = 'bg-[var(--cal-ferias-bg)] text-[var(--cal-ferias-fg)]'`,
  `CORES_DO_TIPO.REUNIAO_EXTRA = COR_DA_REUNIAO` (com borda tracejada da cor do texto, como no
  modelo). `TEXTO_DO_TIPO: Partial<Record<TipoDeEvento, string>>` com os três textos do modelo
  (Evento, Férias, Reunião extra; o dia vem de `useConfiguracaoClube`, "nos dias de reunião" sem
  ele). Ícones de `lucide-react`: `Sun` na faixa de férias, `CalendarPlus` no selo da extra.
  `tokens.css`: `--cal-ferias-bg: #DCEBF7; --cal-ferias-fg: #1D4E7A;` (cores do modelo Main).
- [ ] **Passo 3: formulário.** Estado `marcacoes` com as positivas; o grupo de caixas some em
  Férias e mostra só as duas primeiras em Reunião extra; em Reunião extra um `CampoData` "Data" no
  lugar de Início/Fim (`:90-93`) grava `fim = inicio`; a validação local chama
  `validarEvento({ ...entrada, ...marcacoesDoTipo })` (antes `EventoEntrada.safeParse`, `:61`) e o
  erro de `temReuniao` sai num `<p id role="alert">` dentro do `<fieldset aria-describedby>` (o
  `CaixaMarcacao` não tem erro, `ui/CaixaMarcacao.tsx:5-7`; o mapa `MENSAGENS_DE_CAMPO` não vale
  para esse campo). Erro de `campos.inicio` no modo extra aparece sob a Data.
- [ ] **Passo 4: ficha e calendário.** A ficha calcula com
  `situacaoDaData(d, diaReuniao, [evento])` para cada data do evento e monta os pares pelas tabelas
  da SPEC ("Ficha do evento"); `datas.ts` ganha o texto dos dias. No calendário, o selo de reunião
  (`:219-228`) usa a extra do dia (horário dela, senão o do clube) e não duplica o regular; no
  celular, como hoje, o selo é só para leitor de tela (`:222`) e a lista sob a grade já diz o tipo.
- [ ] **Passo 5:** verdes; `tipos -w web` sem erro nos arquivos do pacote. **Commit:** `feat(calendario): formulário, ficha e calendário do Adm com férias e reunião extra`.

---

## P4 — conselheiro: próxima reunião, pacote e chamada (API + web) · subagente, onda 2

**Files:**
- Modify: `apps/api/src/inicio/inicio.service.ts:15-21,44,65-76` (`proximaData` sai; `proximaReuniao` e `feriasAte` do shared)
- Modify: `apps/api/src/inicio/inicio.spec.ts` (`:48-117`, `:220-228` e casos novos)
- Modify: `apps/api/src/sync/sync.service.ts:50-71` (`calendario` na janela)
- Modify: `apps/api/src/sync/sync.spec.ts` (calendário e filtro da janela)
- Modify: `apps/web/src/modulos/inicio/InicioConselheiro.tsx:49-63,70-101` (do pacote pela regra; "Férias até"; nome; "calendário de")
- Modify: `apps/web/src/modulos/inicio/inicio.test.tsx`
- Modify: `apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:107,130` (cabeçalho padrão do dia)
- Modify: `apps/web/src/modulos/reunioes/chamada/chamada.test.tsx`

**Interfaces:** consome P0 (`proximaReuniao`, `feriasAte`, `horarioELocalDoDia`,
`JANELA_DO_CALENDARIO_EM_DIAS`, `PacoteSaida.calendario`, `InicioConselheiroSaida`). Alvo:
`modelo/InicioConselheiro-{Ferias,Extra,ExtraOffline}`.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| inicio.spec › hoje em férias | `proximaReuniao.data` = domingo depois do fim; `feriasAte` = fim das férias |
| › extra numa quarta antes do domingo | `data` = quarta, `nome` da extra, `horario`/`local` da extra (campo nulo cai no do clube) |
| › extra no dia de hoje | `ehHoje: true`; `chamadaFeita` pela reunião gravada nessa data |
| › nada em 120 dias; conselheiro sem unidade (ex-`:220-228`) | `proximaReuniao: null`, `feriasAte` preenchido; `feriasAte: null` |
| › dia normal sem evento (ex-`:48-117`) | igual a hoje, com `nome: null`, `feriasAte: null` |
| › evento de outro clube e evento removido não contam | `proximaReuniao.data` = domingo normal |
| sync.spec › pacote traz `calendario` | eventos com `inicio <= hoje+120` e `fim >= hoje`, com tipo, nome, datas, horário, local e marcações |
| › fora da janela, removido ou de outro clube; vai para os três papéis | ausentes; ADM, CONSELHEIRO e INSTRUTOR recebem `calendario` |
| › `versao` muda quando o calendário muda | duas leituras, evento novo no meio → versões diferentes |
| inicio.test › com internet, em férias (modelo InicioConselheiro-Ferias) | `'Férias até 01/02'` acima de `'Domingo, 2 de fevereiro'` |
| › com internet, extra (modelo InicioConselheiro-Extra) | data da extra, `'Encontro de início de ano'`, `'15h · Parque Ecológico do Tietê'`, `'Fazer chamada'` no dia |
| › sem internet, pelo pacote (modelo ExtraOffline) | mesma data e nome calculados de `pacote.calendario`; `'calendário de 24/01'` (de `baixadoEm`) |
| › pacote gravado no IndexedDB **sem** `calendario` | cai na regra do dia da semana de hoje, sem quebrar |
| › nada em 120 dias | `'Nenhuma reunião marcada.'`; com férias: `'Férias até 15/03 · nenhuma reunião marcada nos próximos 4 meses.'` |
| chamada.test › chamada numa data com extra de horário próprio | campo Horário e Local iniciam com os da extra |
| › rascunho ou fila vencem o padrão; pacote sem `calendario` | valor do rascunho, não o da extra; padrão do clube, como hoje |

```bash
cd apps/api && pesado testar --script teste -- src/inicio/inicio.spec.ts src/sync/sync.spec.ts
cd ../web && pesado testar --script teste -- src/modulos/inicio src/modulos/reunioes/chamada
```

- [ ] **Passo 2: API.** `inicio.service.ts`: `proximaData` sai; ler eventos não removidos do clube
  com `inicio <= hoje+120` e `fim >= hoje`; `const proxima = proximaReuniao(hoje, diaReuniao, eventos)`
  e `feriasAte(hoje, diaReuniao, eventos)`; `horarioELocalDoDia(situacaoDaData(proxima.data, …), clube)`;
  `nome: proxima.extra?.nome ?? null`. O retorno sem unidade (`:44`) ganha `feriasAte: null`.
  `sync.service.ts`: mesma leitura (um helper local, não um contrato novo), mapeada para
  `EventoDoPacote`, em `calendario`, para todos os papéis.
- [ ] **Passo 3: web.** `proximaReuniaoDoPacote` (`InicioConselheiro.tsx:49-63`) chama
  `proximaReuniao`/`feriasAte` com `pacote.calendario ?? []` (pacote guardado antes da mudança não
  tem o campo) e `horarioELocalDoDia`; o cartão (`:70-101`) põe "Férias até dd/mm" acima da data,
  o nome da extra abaixo, e "calendário de dd/mm" quando veio do pacote. `FormularioChamada.tsx:130`:
  `cabecalhoPadrao` usa `horarioELocalDoDia(situacaoDaData(props.data, pacote.clube.diaReuniao, pacote.calendario ?? []), …)`.
- [ ] **Passo 4:** verdes; `tipos -w api` e `-w web` sem erro nos arquivos do pacote. **Commit:** `feat(inicio): próxima reunião do conselheiro pelo calendário, com e sem internet`.

**Fim da onda 2 (principal):** `pesado -- npm run tipos` da raiz verde antes do commit do último
pacote da onda.

---

## P5a — "aula" → "classe": telas do instrutor (web) · subagente (mecânico), onda 3

**Files:**
- Modify: `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:29,48,57,64,70,75,80,129`
- Modify: `apps/web/src/modulos/classes/TelaClasses.tsx:43-44`
- Modify: `apps/web/src/modulos/aulas/RegistroSemConexao.tsx:23,34,37,54`
- Modify: `apps/web/src/modulos/aulas/FormularioAula.tsx:147,149,156,158,223,238`
- Modify: `apps/web/src/modulos/aulas/TelaRegistroAula.tsx:40,139,153`
- Modify: `apps/web/src/modulos/aulas/EstadosAula.tsx:9`
- Modify: `apps/web/src/api/aulas.ts:78`
- Modify: `apps/web/src/offline/tipos/aula.ts:31,90`
- Modify: `apps/web/src/layouts/SeloPapel.tsx:15`
- Modify: `apps/web/src/modulos/inicio-instrutor/inicio-instrutor.test.tsx`
- Modify: `apps/web/src/modulos/classes/classes.test.tsx`
- Modify: `apps/web/src/modulos/aulas/aulas.test.tsx`
- Modify: `apps/web/src/offline/tipos/aula.test.ts`

**Regra:** só a tabela "'Aula' → 'classe' (inventário)" da SPEC do calendário, linha a linha;
"classe" onde o contexto é o encontro, "dia de classe" onde "classe" se leria como a do caderno.
Nenhum nome de variável, rota, chave de fila ou `aria` de teste muda além do texto. Se um teste de
outra pasta (ex.: `rotas.test.tsx`) procurar um desses textos, entra aqui e o relatório diz.

- [ ] **Passo 1: testes primeiro** — trocar nos quatro testes cada expectativa de texto do
  inventário (ex.: `'Registrar classe'`, `'Próxima classe · 17/10'`, `'Registro de classe'`,
  `'Salvar classe · 1 presentes'`, `'Classe salva'`, `'Correção na classe'`, `'Faltaram à classe…'`)
  e ver falhar.

```bash
cd apps/web && pesado testar --script teste -- src/modulos/inicio-instrutor src/modulos/classes src/modulos/aulas src/offline/tipos/aula.test.ts
```

- [ ] **Passo 2:** trocar os textos. **Passo 3:** a busca que sobra no escopo deste pacote deve vir
  vazia de texto visível (nomes internos e comentários podem ficar):

```bash
grep -rnE "(['\"\`>]|aria-label=)[^'\"\`<]*\b[Aa]ulas?\b" apps/web/src/modulos/{inicio-instrutor,classes,aulas} apps/web/src/api/aulas.ts apps/web/src/offline/tipos/aula.ts apps/web/src/layouts/SeloPapel.tsx | grep -v '\.test\.'
```
Texto quebrado em várias linhas de JSX escapa da busca: conferir à mão os componentes listados.
- [ ] **Passo 4:** verdes; `tipos -w web`. **Commit:** `refactor(textos): "classe" no lugar de "aula" nas telas do instrutor`.

---

## P5b — "aula" → "classe": cronograma, observações, mensagens da API · subagente (mecânico), onda 3

**Files:**
- Modify: `apps/web/src/modulos/cronograma/TelaCronograma.tsx:30,80,91,142` ("Aula extra" → **"Fora do cronograma"**)
- Modify: `apps/web/src/modulos/observacoes/TelaObservacoes.tsx:29,38,99,126,132,134,136`
- Modify: `packages/shared/src/permissoes.ts:21` ("Registrar classes")
- Modify: `packages/shared/src/contratos/observacoes.ts:15`
- Modify: `apps/api/src/aulas/aulas.service.ts:17` ("Registro de classe não encontrado.")
- Modify: `apps/api/src/aulas/aulas-envio.service.ts:41,178,182,183,190,194,203,402`
- Modify: `apps/api/src/observacoes/observacoes.service.ts:79`
- Modify: `apps/web/src/modulos/cronograma/cronograma.test.tsx`
- Modify: `apps/web/src/modulos/observacoes/observacoes.test.tsx`
- Modify: `packages/shared/src/permissoes.test.ts` (se conferir o rótulo)
- Modify: `apps/api/src/aulas/aulas.spec.ts` (mensagens)
- Modify: `apps/api/src/aulas/aulas-leitura.spec.ts` (mensagens)
- Modify: `apps/api/src/observacoes/observacoes.spec.ts` (mensagem)

**Regra:** a mesma do P5a. `apps/web/src/modulos/adm/configuracoes/configuracoes.test.tsx` usa um
mock da mensagem de `clube.service.ts:58` (trocada no P1): atualizar o mock aqui só se o teste
procurar o texto.

- [ ] **Passo 1: testes primeiro** (expectativas de texto e de `mensagem` nos seis testes), vistos falhando.

```bash
cd packages/shared && pesado testar --script teste -- src/permissoes.test.ts
cd ../../apps/web && pesado testar --script teste -- src/modulos/cronograma src/modulos/observacoes
cd ../.. && pesado -- npm run build -w packages/shared && cd apps/api && pesado testar --script teste -- src/aulas/aulas.spec.ts src/aulas/aulas-leitura.spec.ts src/observacoes/observacoes.spec.ts
```

- [ ] **Passo 2:** trocar os textos; `npm run build -w packages/shared` antes da API.
- [ ] **Passo 3: busca do repositório inteiro** (o critério de pronto da SPEC): depois de P5a e
  P5b, esta busca só pode trazer nome interno, comentário, teste ou e2e (o e2e é do P10):

```bash
grep -rnE "(['\"\`>]|aria-label=|titulo: |texto: |descricao: )[^'\"\`<]*\b[Aa]ulas?\b" apps/web/src apps/api/src packages/shared/src | grep -vE '\.(test|spec)\.'
```
O relatório lista o que sobrou e por quê.
- [ ] **Passo 4:** verdes; `tipos` da raiz. **Commit:** `refactor(textos): "classe" no lugar de "aula" no cronograma, nas observações e nas mensagens da API`.

---

## P0b — tarefa: contratos, migration, guarda, fábrica, handlers · agente principal (inline), onda 4

**Por que inline:** `schema.prisma` e `MODELOS_DE_CLUBE` são de dono único; os contratos do envio,
do pacote e do início, a fábrica e os handlers são consumidos por P6–P9.

**Files:**
- Modify: `packages/shared/src/contratos/aulas.ts:6-36` (`ItemTarefa`, `MarcaEspecialidade`, campos novos)
- Modify: `packages/shared/src/contratos/sync.ts:17-40` (tarefas, especialidades do membro, catálogo, pontos)
- Modify: `packages/shared/src/contratos/instrutor.ts:6-14` (`paraCobrar`)
- Modify: `apps/api/prisma/schema.prisma:310-319,571-586,596-611,933-954,989-1034` (dois modelos, `EspecialidadeConcluida.registroAulaId`, relações de volta)
- Create: `apps/api/prisma/migrations/20261002130000_tarefa_casa/migration.sql`
- Modify: `apps/api/src/comum/prisma/guarda-clube.ts:4-38` (`TarefaCasa`, `TarefaItem`)
- Modify: `apps/api/src/comum/prisma/guarda-clube.spec.ts:72-73` (lista esperada)
- Modify: `apps/api/test/fabricas.ts` (`criarTarefa`, `criarTarefaItem`)
- Modify: `apps/web/src/testes/handlers/aulas.ts` (saída do envio com os campos novos)
- Modify: `apps/web/src/testes/handlers/instrutor.ts` (`paraCobrar: null`)
- Modify: `apps/web/src/testes/handlers/offline.ts` (pacote do instrutor: `tarefas: []`, `especialidades` do membro, catálogo, `pontosEspecialidade`)

- [ ] **Passo 1: conferir o banco** (`\d "EspecialidadeConcluida"`, `\d "RegistroAula"`, como no
  P0 Passo 1). Esperado: sem `registroAulaId` em `EspecialidadeConcluida`; único
  `("clubeId","id")` em `RegistroAula` (alvo da FK composta).
- [ ] **Passo 2: contratos.**

```ts
// contratos/aulas.ts
/** Item de tarefa: um requisito da classe OU uma especialidade — nunca os dois (o banco tem CHECK). */
export const ItemTarefa = z.union([z.object({ requisitoId: Uuid }).strict(), z.object({ especialidadeId: Uuid }).strict()])
export const MarcaEspecialidade = z.object({ dbvId: Uuid, especialidadeId: Uuid })
export const AulaEnvio = z.object({
  versaoPayload: z.literal(1), // segue 1: os campos novos têm padrão e itens antigos da fila continuam válidos
  // ...campos de hoje (:10-18)...
  /** Tarefa passada NESTE registro; o id vem do aparelho no primeiro envio. */
  tarefaId: Uuid.nullable().default(null),
  tarefaItensAcrescentados: z.array(ItemTarefa).max(100).default([]),
  tarefaItensRetirados: z.array(ItemTarefa).max(100).default([]),
  especialidadesMarcadas: z.array(MarcaEspecialidade).max(2000).default([]),
  especialidadesDesmarcadas: z.array(MarcaEspecialidade).max(2000).default([]),
  tarefasEncerradas: z.array(Uuid).max(50).default([]),
})
// em AulaEnvioSaida:
/** Id real da tarefa deste registro (a fila corrige os itens seguintes, como faz com o registro). */
tarefaId: Uuid.nullable(),
tarefaItensSemEfeito: z.array(z.object({ item: ItemTarefa, motivo: z.enum(['ITEM_INVALIDO', 'JA_EM_TAREFA', 'SEM_PERMISSAO']) })),
especialidadesSemEfeito: z.array(z.object({
  dbvId: Uuid, especialidadeId: Uuid,
  motivo: z.enum(['JA_CONCLUIDA', 'ESPECIALIDADE_INVALIDA', 'AUSENTE', 'PROPRIA_FICHA', 'SEM_PERMISSAO']),
  concluidaEm: DataCivil.nullable(),
})),
// totalPontos passa a somar também as especialidades deste registro (comentário no campo)

// contratos/sync.ts — em PacoteInstrutor.classes[]:
/** Abertas do ano do clube e encerradas com entrega num registro recente (para corrigir sem rede). */
tarefas: z.array(z.object({
  id: Uuid, registroAulaId: Uuid, data: DataCivil, encerrada: z.boolean(), itens: z.array(ItemTarefa),
})).default([]),
// em membros[] (ao lado de conclusoes):
/** Conclusões ativas das especialidades que estão nas tarefas da classe. */
especialidades: z.array(z.object({ especialidadeId: Uuid, registroAulaId: Uuid.nullable() })).default([]),
// em PacoteInstrutor, ao lado de classes e pontosRequisito:
/** Catálogo ativo (oficial e do clube). Ausente = pacote de antes desta mudança: a tela pede internet. */
especialidades: z.array(z.object({ id: Uuid, nome: z.string(), area: z.string() })).optional(),
pontosEspecialidade: z.object({ pontos: z.number().int(), ativo: z.boolean() }).default({ pontos: 0, ativo: false }),

// contratos/instrutor.ts — em ClasseDoInstrutor:
/** Itens ativos distintos com alguém devendo e desbravadores distintos, sem a própria ficha; null = nada. */
paraCobrar: z.object({ requisitos: z.number().int(), especialidades: z.number().int(), desbravadores: z.number().int() }).nullable(),
```

O catálogo é `.optional()` (e não `.default([])`) porque a tela precisa distinguir "pacote antigo,
sem catálogo" ("Para passar especialidade, abra o app com internet uma vez") de "catálogo vazio".

- [ ] **Passo 3: schema.** Os dois modelos espelham a migration do Passo 4 campo a campo, no
  estilo de `RegistroAula`/`RequisitoConcluido` (`id @default(uuid(7)) @db.Uuid`, datas
  `@db.Timestamptz`, `onDelete: Restrict`):
  - `TarefaCasa`: relações `clube`, `classe` (só `classeId`, como `RegistroAula.classe`),
    `registro RegistroAula @relation(fields: [clubeId, registroAulaId], references: [clubeId, id])`,
    `criadaPor`/`encerradaPor` (`"TarefaCriadaPor"`, `"TarefaEncerradaPor"`), `itens TarefaItem[]`;
    `@@unique([clubeId, registroAulaId])`, `@@unique([clubeId, id])`, `@@index([clubeId, classeId, anoClube])`.
  - `TarefaItem`: `tarefa TarefaCasa @relation(fields: [clubeId, tarefaId], references: [clubeId, id])`,
    `requisito Requisito?`, `especialidade Especialidade?`, `criadoPor`/`removidoPor`
    (`"TarefaItemCriadoPor"`, `"TarefaItemRemovidoPor"`);
    `@@unique([tarefaId, requisitoId], where: { removidoEm: null }, map: "tarefa_item_requisito_ativo")`,
    o mesmo para `especialidadeId` (`"tarefa_item_especialidade_ativo"`), `@@index([clubeId, tarefaId])`.
Em `EspecialidadeConcluida` (`:1014-1034`): `registroAulaId String? @db.Uuid`,
`registro RegistroAula? @relation(fields: [clubeId, registroAulaId], references: [clubeId, id], onDelete: Restrict)`
e `@@index([clubeId, registroAulaId])` — espelho de `RequisitoConcluido` (`:995,1004,1010`).
Relações de volta: `Clube.tarefas`, `Clube.tarefaItens`, `Classe.tarefas`,
`RegistroAula.tarefa TarefaCasa?` e `RegistroAula.especialidades EspecialidadeConcluida[]`,
`Usuario` (quatro nomeadas acima), `Requisito.tarefaItens`, `Especialidade.tarefaItens`.

- [ ] **Passo 4: migration** `20261002130000_tarefa_casa/migration.sql`:

```sql
-- Tarefa para casa (SPEC tarefa-de-casa). Modelos de clube: entram em MODELOS_DE_CLUBE junto.
-- O CHECK "exatamente um de requisitoId e especialidadeId" e escrito a mao: o Prisma nao modela CHECK
-- (e nao o apaga). Nao ha precedente de CHECK no repositorio: o teste de integracao confere que o banco
-- recusa os dois e nenhum. Unicos parciais em (tarefa, item) so entre itens nao retirados.
CREATE TABLE "TarefaCasa" (
    "id" UUID NOT NULL, "clubeId" UUID NOT NULL, "classeId" UUID NOT NULL, "registroAulaId" UUID NOT NULL,
    "anoClube" INTEGER NOT NULL, "criadaPorId" UUID NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "encerradaEm" TIMESTAMPTZ, "encerradaPorId" UUID,
    CONSTRAINT "TarefaCasa_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TarefaItem" (
    "id" UUID NOT NULL, "clubeId" UUID NOT NULL, "tarefaId" UUID NOT NULL,
    "requisitoId" UUID, "especialidadeId" UUID,
    "criadoPorId" UUID NOT NULL, "removidoEm" TIMESTAMPTZ, "removidoPorId" UUID,
    CONSTRAINT "TarefaItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tarefa_item_exatamente_um" CHECK (("requisitoId" IS NULL) <> ("especialidadeId" IS NULL))
);

ALTER TABLE "EspecialidadeConcluida" ADD COLUMN "registroAulaId" UUID;

CREATE UNIQUE INDEX "TarefaCasa_clubeId_registroAulaId_key" ON "TarefaCasa"("clubeId", "registroAulaId");
CREATE UNIQUE INDEX "TarefaCasa_clubeId_id_key" ON "TarefaCasa"("clubeId", "id");
CREATE INDEX "TarefaCasa_clubeId_classeId_anoClube_idx" ON "TarefaCasa"("clubeId", "classeId", "anoClube");
CREATE INDEX "TarefaItem_clubeId_tarefaId_idx" ON "TarefaItem"("clubeId", "tarefaId");
CREATE UNIQUE INDEX "tarefa_item_requisito_ativo" ON "TarefaItem"("tarefaId", "requisitoId") WHERE ("removidoEm" IS NULL);
CREATE UNIQUE INDEX "tarefa_item_especialidade_ativo" ON "TarefaItem"("tarefaId", "especialidadeId") WHERE ("removidoEm" IS NULL);
CREATE INDEX "EspecialidadeConcluida_clubeId_registroAulaId_idx" ON "EspecialidadeConcluida"("clubeId", "registroAulaId");

ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_encerradaPorId_fkey" FOREIGN KEY ("encerradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_clubeId_tarefaId_fkey" FOREIGN KEY ("clubeId", "tarefaId") REFERENCES "TarefaCasa"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Requisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_removidoPorId_fkey" FOREIGN KEY ("removidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Conferir contra o banco real, num descartável (mesmo `$PSQL`/`URL` do P0 Passo 6):
`CREATE DATABASE migra_tarefa`, `DATABASE_URL=… npx prisma migrate deploy` (todas), o
`migrate diff --from-config-datasource --to-schema` sem saída, e o CHECK à mão:
`INSERT INTO "TarefaItem" … ("requisitoId","especialidadeId") VALUES (NULL, NULL)` →
`violates check constraint "tarefa_item_exatamente_um"`. Depois `DROP DATABASE`.

- [ ] **Passo 5: guarda e fábrica.** `'TarefaCasa'` e `'TarefaItem'` em `MODELOS_DE_CLUBE` e na lista
  esperada de `guarda-clube.spec.ts:72-73`. Fábricas, no estilo de `criarEvento`:
  `criarTarefa({ clubeId, classeId, registroAulaId, anoClube, itens?, encerrada? })` (um
  `TarefaItem` por item `{ requisitoId } | { especialidadeId }`) e
  `criarTarefaItem({ clubeId, tarefaId } & ({ requisitoId } | { especialidadeId }))`.

- [ ] **Passo 6: handlers do web.** `handlers/aulas.ts`: a saída do envio ganha
  `tarefaId: null, tarefaItensSemEfeito: [], especialidadesSemEfeito: []`; `handlers/instrutor.ts`:
  `paraCobrar: null` na fixture da classe; `handlers/offline.ts`: `tarefas: []` por classe,
  `especialidades: []` por membro, `especialidades: []` (catálogo) e
  `pontosEspecialidade: { pontos: 0, ativo: false }` no pacote do instrutor, mais um
  `criarPacoteInstrutorAntigo()` sem catálogo e sem tarefas (para os testes de "pacote antigo").
- [ ] **Passo 7: conferir.**

```bash
pesado -- npm run build -w packages/shared && pesado -- npm run tipos -w packages/shared
cd apps/api && pesado -- npx prisma generate && pesado testar --script teste -- src/comum/prisma/guarda-clube.spec.ts
```
Esperado: verde. API e web não compilam em `aulas-envio.service.ts`, `pacote-instrutor.service.ts`,
`instrutor.service.ts` e `modulos/aulas/estado.ts` até P6–P8.
- [ ] **Passo 8: commit:** `feat(tarefa): tabelas da tarefa para casa, contratos do envio, do pacote e do início`.

---

## P6 — API: envio do registro — passar, cobrar, encerrar · subagente, onda 5

**Files:**
- Modify: `apps/api/src/aulas/aulas-envio.service.ts:89-138,275-382,416-441` (ausência relida do banco; tarefa; especialidades; encerrar; saída)
- Create: `apps/api/src/aulas/tarefas-envio.ts` (aplicar a tarefa, as especialidades e o encerramento dentro da transação)
- Modify: `apps/api/src/aulas/aulas.service.ts:51-90` (`requisitosDaAula` sem os itens de tarefa anterior, regra 10)
- Modify: `apps/api/src/aulas/aulas.module.ts` (provider, se `tarefas-envio.ts` for classe injetável)
- Create: `apps/api/src/aulas/tarefas.spec.ts` (integração: passar, cobrar, ausência, desfazer, encerrar, CHECK, isolamento do envio)
- Modify: `apps/api/src/aulas/aulas.spec.ts` (saída com os campos novos; ausente gravado)
- Modify: `apps/api/src/aulas/aulas-leitura.spec.ts` (detalhe, regra 10)

**Interfaces:** consome P0b (contratos, schema, `criarTarefa`). Produz o comportamento do envio
que P8/P9 assumem (os testes deles usam handler, não a API).

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| tarefas.spec › passar cria tarefa e itens | `TarefaCasa` com o `tarefaId` do aparelho, `anoClube` do clube, itens ativos |
| › reenvio do mesmo `envioId` | nada duplica; saída igual (`estadoAtual` também traz `tarefaId`) |
| › segundo id de tarefa no mesmo registro | itens fundidos na tarefa existente; `tarefaId` da saída = o existente |
| › retirar; acrescentar o que já existe ou retirar o que não existe | `removidoEm` e `removidoPorId` preenchidos; linha continua; nada muda, sem aviso |
| › requisito de outra classe ou inativo (ajuste do clube) | `tarefaItensSemEfeito` com `ITEM_INVALIDO` |
| › especialidade inativa ou de outro clube; item já em tarefa aberta; especialidade sem `requisito.marcar` | `ITEM_INVALIDO`; `JA_EM_TAREFA`; `SEM_PERMISSAO` |
| › CHECK | `prisma.tarefaItem.create` com os dois e com nenhum → rejeita (`P2010`/erro do Postgres) |
| › cobrar requisito | `RequisitoConcluido` com o `registroAulaId` **da cobrança** e pontos de requisito |
| › cobrar especialidade | `EspecialidadeConcluida` com `registroAulaId`, `concluidaEm` = data do registro; `LancamentoPontos` origem `ESPECIALIDADE`; `totalPontos` inclui |
| › especialidade já concluída; própria ficha; especialidade sem permissão | `JA_CONCLUIDA` com `concluidaEm` antiga; a data **não** muda; `PROPRIA_FICHA` (requisito e especialidade); `SEM_PERMISSAO` |
| › data fora do ano do clube, no prazo | especialidade aceita (não passa por `exigirDataDoAnoCorrente`) |
| › ausência gravada | correção que **não** manda a presença de um ausente gravado → `AUSENTE` para requisito e especialidade |
| › desfazer | requisito e especialidade desfazem só a conclusão **deste** registro e estornam pontos; conclusão de outra origem fica |
| › encerrar; encerrar tarefa de outra classe ou clube | `encerradaEm`/`encerradaPorId`; entregas já feitas continuam; intacta; `avisos` traz o texto do encerramento recusado |
| › envio recusado por prazo | nada da tarefa grava, nem o encerramento |
| aulas.spec › saída de hoje | campos novos vazios/nulos; `totalPontos` igual ao de antes sem especialidade |
| aulas-leitura.spec › requisito só da cobrança fica fora de `requisitosDaAula` | ausente; planejado para a data, presente |
| › detalhe de outro clube / instrutor de outra classe | 404 (isolamento já existente segue verde) |

```bash
pesado -- npm run build -w packages/shared && cd apps/api && pesado testar --script teste -- src/aulas
```

- [ ] **Passo 2: ordem dentro de `aplicar`** (`aulas-envio.service.ts:89-138`), na mesma transação:
  presenças → **ausentes relidos do banco** (`presencaAula` do registro, `presente = false`, depois
  das presenças aplicadas; substitui o conjunto de `:321`, que só olha o próprio envio) →
  requisitos → tarefa (acha a do registro pelo único `(clubeId, registroAulaId)` ou cria com o
  `tarefaId` do envio; aplica `retirados` e `acrescentados` com a validação da regra 3 e o
  `JA_EM_TAREFA` contra as outras tarefas **abertas** da classe) → especialidades (permissão por
  `escopo.permissoes(sessao)` incluir `requisito.marcar`; ativa, oficial ou do clube; presente pelo
  banco; não é a própria ficha; cria com `registroAulaId`; pontos por `ServicoPontos.sincronizar`
  com a mesma origem da ficha, `especialidades-dbv.service.ts:64-75`; desmarcar só onde
  `registroAulaId = registro.id`) → encerramento (só tarefas abertas **desta classe e clube**).
  `gravouAlgo` passa a contar tarefa e especialidade. Texto do aviso de encerramento recusado:
  `'Uma tarefa que não é desta classe ficou como estava.'`
- [ ] **Passo 3: saída.** `montarSaida` (`:416-441`) devolve `tarefaId` (da tarefa deste
  registro, ou `null`), os dois `*SemEfeito`, e soma em `totalPontos` os lançamentos
  `ESPECIALIDADE` das conclusões com `registroAulaId` deste registro. `estadoAtual` (reenvio)
  devolve o mesmo formato, com os `*SemEfeito` vazios.
- [ ] **Passo 4: detalhe.** `aulas.service.ts:72`: tirar de `requisitosDaAula` o requisito que é
  item ativo de tarefa **anterior** da classe, salvo se planejado para a data. Todo `include` novo
  leva `clubeId` no `where`.
- [ ] **Passo 5:** verdes; `tipos -w api` sem erro em `src/aulas/`. **Commit:** `feat(tarefa): envio do registro passa, cobra e encerra tarefa para casa`.

---

## P7 — lembrete: pacote e início do instrutor (API + web) · subagente, onda 6

**Files:**
- Create: `apps/api/src/aulas/tarefas-leitura.ts` (pendência derivada; tarefas da classe para o pacote; contagem do lembrete)
- Modify: `apps/api/src/sync/pacote-instrutor.service.ts:33-67,69-121,141-153` (tarefas, especialidades do membro, catálogo, `pontosEspecialidade`)
- Modify: `apps/api/src/sync/pacote-instrutor.spec.ts`
- Modify: `apps/api/src/sync/sync.spec.ts` (forma do pacote do instrutor)
- Modify: `apps/api/src/instrutor/instrutor.service.ts:32-73` (`paraCobrar`)
- Modify: `apps/api/src/instrutor/instrutor.spec.ts`
- Modify: `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:44-86,160-166` (linha "Para cobrar: …")
- Modify: `apps/web/src/modulos/inicio-instrutor/inicio-instrutor.test.tsx`

**Interfaces:** consome P0b. `tarefas-leitura.ts` exporta, para o pacote e o início:
`devedoresPorItem(tx, clubeId, classeId, anoClube, sessao)` → por item ativo, os `dbvId` que
devem (regra 4, sem a própria ficha, regra 5) e `tarefasDaClasse(...)` (abertas do ano + encerradas
com entrega em registro dos últimos 30 dias, o mesmo `DIAS_DE_REGISTROS` do pacote). Só leitura;
o P6 não depende dele.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| pacote-instrutor.spec › tarefas da classe | abertas do ano com `itens`; encerrada com entrega recente presente com `encerrada: true`; encerrada sem entrega recente ausente |
| › item inválido some; ano virou; todos entregaram | requisito inativado ou especialidade desativada fora de `itens`; tarefa do ano anterior ausente; tarefa aberta sem ninguém devendo ausente |
| › especialidades do membro | conclusões das especialidades das tarefas, com `registroAulaId` |
| › catálogo e pontos | `especialidades` ativas (oficial e do clube, sem outro clube) com `area`; `pontosEspecialidade` do critério |
| › isolamento | tarefa de outro clube ausente; instrutor de outra classe não a vê |
| sync.spec › pacote do instrutor tem as chaves novas; ADM e CONSELHEIRO com `instrutor: null` | forma |
| instrutor.spec › cumpriu no dia não deve | `paraCobrar` sem ele |
| › concluiu pela ficha ou desistiu; matriculado depois da tarefa | sai da contagem; deve |
| › item inativo, ano virou; todos entregaram ou tarefa encerrada | contagem; `paraCobrar: null` |
| › contagem por item distinto entre tarefas | `{ requisitos: 2, especialidades: 1, desbravadores: 5 }` |
| › própria ficha não conta; outro clube ou instrutor de outra classe | desbravador ligado à conta fora de `desbravadores`; não aparece |
| inicio-instrutor.test › lembrete (modelo InicioInstrutor) | `'Para cobrar: 2 requisitos · 1 especialidade · 5 desbravadores'` abaixo do resumo da próxima classe |
| › parte com zero não aparece | `'Para cobrar: 2 requisitos · 5 desbravadores'` |
| › texto, não link; agrupadas ou `paraCobrar: null`; sem conexão (`ClassesSemConexao`, `:187`) | `queryByRole('link', { name: /Para cobrar/ })` nulo; sem a linha; sem lembrete |

```bash
cd apps/api && pesado testar --script teste -- src/sync/pacote-instrutor.spec.ts src/sync/sync.spec.ts src/instrutor/instrutor.spec.ts
cd ../web && pesado testar --script teste -- src/modulos/inicio-instrutor
```

- [ ] **Passo 2:** `tarefas-leitura.ts` — deve um item ativo quem está cursando a classe no ano do
  clube da tarefa (o filtro de membros de `aulas-envio.service.ts:207-220`) e não tem conclusão
  ativa (`RequisitoConcluido`/`EspecialidadeConcluida`), sem a ficha ligada à conta de quem lê
  (`ehFichaDaSessao`). Item ativo = requisito válido da classe com ajuste do clube
  (`requisitosValidos`, `:374-382`) ou especialidade ativa oficial/do clube. Tudo com `clubeId`.
- [ ] **Passo 3:** pacote e início consomem a leitura; a tela mostra a linha só nos cartões
  individuais (`:160-166`), juntando as partes não nulas com " · ".
- [ ] **Passo 4:** verdes; `tipos -w api` e `-w web` sem erro nos arquivos do pacote. **Commit:** `feat(tarefa): lembrete "Para cobrar" no início e tarefas no pacote do instrutor`.

---

## P8 — web: passar para casa · subagente, onda 5

**Files:**
- Modify: `apps/web/src/modulos/aulas/estado.ts:40-57,235-260` (itens acrescentados/retirados, `tarefaId`; rascunho; `montarEntrada`)
- Modify: `apps/web/src/modulos/aulas/estado.test.ts`
- Modify: `apps/web/src/offline/tipos/aula.ts:8-18,53-69,74-97,100-120` (fundir itens; `tarefaId` nos seguintes; aviso dos itens; leitura defensiva)
- Modify: `apps/web/src/offline/tipos/aula.test.ts`
- Modify: `apps/web/src/modulos/aulas/fontes.ts` (tarefas e catálogo da classe a partir do pacote)
- Modify: `apps/web/src/modulos/aulas/FormularioAula.tsx:148-240` (nova ordem das seções; "Para casa" antes de salvar)
- Create: `apps/web/src/modulos/aulas/ParaCasa.tsx` (itens com "Tirar", "Passar o que faltou", "+ Requisito", busca de especialidade)
- Create: `apps/web/src/modulos/aulas/para-casa.test.tsx`
- Modify: `apps/web/src/modulos/aulas/TelaRegistroAula.tsx:26-54` (abrir com conexão rebaixa o pacote; permissão de especialidade)
- Modify: `apps/web/src/modulos/aulas/aulas.test.tsx` (ordem das seções; rebaixar o pacote)
- Modify: `apps/web/src/offline/usePacote.test.tsx` (a tela se atualiza com o pacote rebaixado)

**Interfaces:** consome P0b (contrato, handlers). Produz para o P9: `EstadoAula` com
`itensAcrescentados`, `itensRetirados`, `tarefaId` e as funções `passarItem`, `tirarItem`,
`passarOQueFaltou`; `fontes.ts` com `tarefasDaClasse(classe)` e `catalogoDeEspecialidades(pacote)`
(`null` = pacote antigo). Alvo: `modelo/Registro-ParaCasa`, `Registro-BuscaEspecialidade`,
`Registro-BuscaNada`.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| estado.test › passar e tirar | `itensAcrescentados`/`itensRetirados` refletem a última ação por item |
| › `tarefaId`; `montarEntrada` só com a tarefa mudando | gerado uma vez por registro novo; mantido na edição; entrada não vazia, com `tarefaItensAcrescentados` |
| › rascunho | `RascunhoAula` guarda e relê os itens; rascunho antigo sem os campos lê `[]` |
| › "Passar o que faltou" | só os requisitos do dia que algum **presente** não cumpriu; ignora os que já estão em tarefa aberta |
| aula.test (fila) › `fundir` itens | última ação por item vence, como `fundirMarcacoes` (`:39-50`); `tarefaId` do anterior |
| › item antigo da fila sem os campos novos | lê `?? []`/`?? null` e envia sem quebrar |
| › `atualizarSeguintes` | troca o `tarefaId` dos itens seguintes pelo id real da saída |
| › aviso `ITEM_INVALIDO`/`JA_EM_TAREFA` | `'Não entrou na tarefa porque não vale mais ou já está em outra tarefa: 3a, Nós e amarras.'` |
| para-casa.test › sem itens | `'Nada para casa.'` e os botões ao lado |
| › "+ Requisito" | `Selecao` "Escolha um requisito" sem os que estão em tarefa aberta da classe |
| › item passado com "Tirar" (modelo ParaCasa) | `'II.1 · Ler os capítulos 1 a 3 de Gênesis…'` + botão `'Tirar'` |
| › busca de especialidade (modelo BuscaEspecialidade) | campo `'Buscar especialidade'`; resultado com nome, área e `'Passar'`; `'Fechar busca'` |
| › busca vazia / nada encontrado | `'Digite parte do nome da especialidade'` / `'Nenhuma especialidade com esse nome'` |
| › pacote antigo, sem catálogo | botão some; `'Para passar especialidade, abra o app com internet uma vez'` |
| › sem `requisito.marcar`; salvar sem internet | nada de especialidade; o item da fila leva `tarefaItensAcrescentados` |
| aulas.test › ordem das seções | cabeçalho → presença → `'Requisitos desta classe'` → `'O que falta fazer'` → `'Para casa'` → salvar (`compareDocumentPosition`) |
| › abrir com conexão rebaixa o pacote | `GET /api/sync/pacote` chamado ao abrir; sem conexão, não |
| usePacote.test › pacote rebaixado reemite | a tela recebe a versão nova |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/aulas src/offline/tipos/aula.test.ts src/offline/usePacote.test.tsx
```

- [ ] **Passo 2:** estado, fila e fontes; leitura defensiva de todo campo novo vindo do pacote ou
  da fila (`?? []`, `?? null`); o payload da fila guarda o nome de cada especialidade (como `nomes`
  e `codigos`, `offline/tipos/aula.ts:14-16`) para o aviso.
- [ ] **Passo 3:** `FormularioAula`: a linha do desbravador (`LinhaDbv`, `:256-311`) **fica como
  está**; só as seções mudam de ordem (a SPEC, "Ordem do registro"). `ParaCasa` usa os componentes
  de `ui/` e nenhum elemento preso. `TelaRegistroAula`: com `modo === 'CONECTADO'`, chamar
  `baixarPacote` ao abrir (a tela já se atualiza sozinha por `usePacote.ts:14,24`).
- [ ] **Passo 4:** verdes; `tipos -w web` sem erro nos arquivos do pacote. **Commit:** `feat(tarefa): passar requisitos e especialidades para casa no registro da classe`.

---

## P9 — web: cobrar no registro · subagente, onda 6

**Files:**
- Modify: `apps/web/src/modulos/aulas/estado.ts:134-143,180-221` (ações de especialidade; tarefas a encerrar; ausente desfaz entregas; `requisitosVisiveis` sem os da cobrança; prévia de pontos)
- Modify: `apps/web/src/modulos/aulas/estado.test.ts`
- Modify: `apps/web/src/offline/tipos/aula.ts:53-97` (fundir especialidades e encerradas; avisos de especialidade)
- Modify: `apps/web/src/offline/tipos/aula.test.ts`
- Modify: `apps/web/src/modulos/aulas/fontes.ts` (base: especialidades concluídas neste registro)
- Modify: `apps/web/src/modulos/aulas/FormularioAula.tsx:154-220` (bloco logo abaixo da presença; regra 10 na grade e em "O que falta fazer")
- Create: `apps/web/src/modulos/aulas/BlocoCobranca.tsx`
- Create: `apps/web/src/modulos/aulas/cobranca.test.tsx`

**Interfaces:** consome P8 (`EstadoAula`, `fontes.ts`) e P0b. Alvo: `modelo/Registro-Cobrar`.
Entregar requisito = marcar o par no registro (vai em `requisitosMarcados`); entregar
especialidade = `especialidadesMarcadas`; chave de especialidade `dbvId|especialidadeId`.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| cobranca.test › só tarefas anteriores à data | registro da própria data de origem não mostra o bloco |
| › a mais recente aberta; as outras recolhidas | `'Cobrar tarefa de 27/09'`; botão `'+1 tarefa anterior'` (plural `'+2 tarefas anteriores'`) |
| › tarefa encerrada com entrega aqui aparece; chips trocam o item | aparece; chips `'I.3'`, `'II.4'`, `'Arte de Contar Hi…'`; abaixo, o nome inteiro do escolhido |
| › quem deve + quem entregou aqui | lista do item escolhido; a linha **não some** ao marcar |
| › Entregou → Entregue + Desfazer | `aria-label` `'Entregou: I.3 · Ana Beatriz Souza'` → `'Entregue em 04/10 · Ana Beatriz Souza · desfazer'` |
| › ausente marcado acima | `'Entregou'` desabilitado e `'Faltou hoje'` (texto do modelo), `aria-label` `'Entregou: I.3 · Carla Mendes · faltou hoje'` |
| › marcar ausente depois desfaz a entrega deste registro | requisito e especialidade voltam a "Entregou" desabilitado; envio leva a desmarcação |
| › Encerrar tarefa | confirmação `'Encerrar a tarefa de 27/09? Quem não entregou deixa de aparecer para cobrar. O que já foi entregue continua registrado.'`; depois `'Será encerrada ao salvar'` com `'Desfazer'` |
| › sem `requisito.marcar`; pacote antigo sem `tarefas` | chips de especialidade não aparecem; registro sem o bloco |
| › requisito da cobrança fora da grade e de "O que falta fazer" | coluna e linha ausentes, salvo planejado para a data |
| › ordem; sem rolagem lateral no bloco | o bloco fica entre a presença e `'Requisitos desta classe'`; nenhuma grade; lista de linhas (o e2e mede) |
| estado.test › ações de especialidade e encerrar | `montarEntrada` com `especialidadesMarcadas`/`Desmarcadas` e `tarefasEncerradas` |
| › `alternarPresenca` para ausente | desfaz as entregas já gravadas neste registro |
| › prévia de pontos | soma `pontosEspecialidade` das entregas de DBV (modelo: `'24 pts'`) |
| aula.test › `fundir` especialidades e encerradas | última ação por chave; encerradas por união |
| › avisos novos | os quatro textos da SPEC (já concluída com data, faltou, não está mais ativa, sem permissão) |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/aulas src/offline/tipos/aula.test.ts
```

- [ ] **Passo 2:** estado, fila e fontes. **Passo 3:** `BlocoCobranca` com chips que quebram linha,
  lista de linhas (nome + botão), rodapé "Encerrar tarefa" secundário; nenhum `fixed`/`sticky`,
  nenhuma grade.
- [ ] **Passo 4:** verdes; `tipos -w web`. **Commit:** `feat(tarefa): cobrar a tarefa no registro, um item por vez, com "Entregou"`.

**Fim da onda 6 (principal):** `pesado -- npm run tipos` da raiz verde.

---

## P10 — fase final · onda 7

**Files (implementador):**
- Modify: `e2e/fichas.spec.ts:107-125,189-230` (criar Férias e Reunião extra pelo formulário e ver as fichas; medir as telas novas)
- Modify: `e2e/adm.spec.ts:108,113-114` ("1 classe estava marcada…", "Classe em conflito com o calendário", "…dia de classe.")
- Modify: `e2e/instrutor.spec.ts:45,85,94` ("Registro de classe", "Salvar classe"; teste novo da tarefa ao lado de `:45`)
- Modify: `e2e/apoio/semear.ts` (só se precisar de semente nova; ele já reexporta as fábricas, `:12`)

- [ ] **Passo 1 (implementador): e2e.**
  - `fichas.spec.ts`: pelo formulário, criar Férias (sem caixas) e Reunião extra (campo Data, duas
    caixas) e conferir as fichas com os textos do modelo.
  - Medição, no laço de `:223` (larguras 390, 820 e 1280), acrescentando: ficha de férias, ficha de
    extra, formulário com o tipo Reunião extra escolhido (`/adm/calendario/eventos/novo` e depois
    `selectOption`), `/adm/calendario?mes=AAAA-MM` num mês com férias.
  - `instrutor.spec.ts`, ao lado de `:45`: passar um requisito sem rede, salvar, reconectar;
    abrir o registro seguinte, "Entregou", salvar; progresso sobe. Medição do registro com **três
    tarefas abertas de seis itens** (semeadas por `criarTarefa`) em 390/820/1280: rolagem lateral
    da página e do bloco (`scrollWidth - clientWidth` da região "Cobrar tarefa de …") igual a 0, e
    nenhum `fixed`/`sticky`.

  Rodar um arquivo por vez, headless: `pesado -- npm run teste:e2e -- e2e/<arquivo>.spec.ts`.
  **Atenção:** o CLAUDE.md diz que o e2e não roda na máquina local e o `pesado` anuncia "e2e nunca:
  só no CI" — mas o CI (`.github/workflows/ci.yml:32-36`) não roda e2e. Se o `pesado` recusar, não
  contornar: vira `PRECISO DE VOCÊ` no fechamento (onde rodar o e2e).

- [ ] **Passo 2 (`testador`):** um de cada vez, contra o baseline por nomes (API e web sem falhas;
  e2e só com a falha pré-existente de `e2e/fundacao.spec.ts`): lint
  (`NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`), `pesado -- npm run tipos`,
  `pesado testar --script teste --tudo` de dentro de `packages/shared`, `apps/api` e `apps/web`,
  `pesado -- npm run teste:e2e`, `pesado -- npm run build`. Falhas → `saneador`, todas de uma vez.
- [ ] **Passo 3 (principal): busca final de "aula"** (comando do P5b Passo 3) e de elemento preso
  novo: `git diff main -- apps/web/src | grep -nE "\b(fixed|sticky)\b"` vazio.
- [ ] **Passo 4 (principal): revisão da PR inteira** (skill `code-review`, opus) contra a `main`,
  até nenhum achado Critical/Important (até 3 rodadas; Minor vira pendência).
- [ ] **Passo 5: QA** — `qa-roteiro` escreve o roteiro com **um item por bloco de cada artboard**
  dos dois modelos (Main, FormEvento-Evento/Acampamento/Ferias/Extra/ExtraDomingo, FichaFerias,
  FichaExtra, InicioConselheiro-Ferias/Extra/ExtraOffline; InicioInstrutor, Registro-Cobrar,
  Registro-ParaCasa, Registro-BuscaEspecialidade, Registro-BuscaNada), mais os fluxos do critério
  de pronto: criar férias e extra; calendário e fichas; **início do conselheiro em férias e com
  extra, com e sem internet** (o e2e não controla o relógio do aparelho); chamada numa extra com
  horário próprio; passar → início mostra o lembrete → registro seguinte cobra → lembrete some;
  ausente continua devendo; desfazer; encerrar; o mesmo sem conexão até o envio. `qa-runner`
  executa, headless.
- [ ] **Passo 6:** `documentador` com a branch e a base — `README.md:97` (positivas, tipos novos,
  pacote com `calendario` e tarefas) e `docs/planejamento/MODELO-DE-DADOS.md:139-144,266` (colunas
  e tabelas novas); `docs/fases/fase-2-3/anexos/` fica como está. `gestor-pr` sobe e, pelo ritual
  de `rules/pr-pronta.md`, tira a PR #25 do rascunho, com o teste da migration (P0 Passo 6), a
  conferência do P0b e a volta mínima no corpo.

**Pronto:** lint, tipos, suítes de shared, API e web, e2e e build verdes contra o baseline por
nomes; medição sem rolagem lateral e sem `fixed`/`sticky` em 390/820/1280; busca de "aula" sem
texto visível; revisão limpa; QA sem FALHOU ancorado nos modelos; PR #25 fora do rascunho.

---

## O que NÃO quebra (conferido no código em 7ddb020)

| Medo | Por que não quebra |
|---|---|
| A chamada do conselheiro muda junto com a extra | A API da chamada não muda: a criação aceita qualquer data entre hoje e 30 dias atrás, sem olhar o dia da semana (`reunioes-envio.service.ts:160-170`). No web só o **padrão** do cabeçalho troca (`FormularioChamada.tsx:130`); rascunho e fila continuam vencendo (`comporEstado`, `:126-132`). Pacote sem `calendario` dá o padrão do clube, como hoje. |
| Frequência e ranking passam a contar as férias | O cálculo lê só as chamadas registradas (`ranking/calculo-ranking.ts:2,31`, `frequencia(situacoes)`) e não lê calendário nem `diaReuniao` (nenhuma ocorrência em `src/ranking/`). Férias não criam nem apagam reunião. |
| Classes antigas e cronogramas publicados entram em conflito | `emConflito` novo é idêntico ao de hoje com uma marcação por evento (teste das 8 combinações, P0) e data sem evento nunca é conflito; a conversão inverte os valores (P0 Passo 6, `situacao_mudou = 0`). |
| A fábrica `criarEvento` quebra dezenas de testes | Nenhum chamador passa `marcacoes` (busca em `apps/api/src`, `apps/api/test`, `e2e`); os três specs da API e o e2e (`fichas.spec.ts:109,156,196`, via `e2e/apoio/semear.ts:12`) usam só o padrão do tipo, que o P0 inverte junto. |
| Pacote offline guardado antes da mudança | `calendario` tem `.default([])` e a tela lê `?? []`; `tarefas` e `membros[].especialidades` também com padrão; o catálogo ausente vira o aviso "abra o app com internet uma vez" (P8). O IndexedDB não reprocessa o pacote guardado (`usePacote.ts:33` devolve o registro como está), por isso a leitura defensiva. |
| Item antigo da fila de envio da aula | `versaoPayload` segue 1 e todo campo novo de `AulaEnvio` tem `.default` (P0b); `fundir` lê `?? []`/`?? null` (P8, teste "item antigo da fila"). |
| Guarda de clube deixa passar a tabela nova | `TarefaCasa` e `TarefaItem` entram em `MODELOS_DE_CLUBE` no mesmo pacote da migration (P0b) e na lista que `guarda-clube.spec.ts:72-73` confere; o `describe.each` de `:113` passa a testar os dois sozinho. `include` aninhado leva `clubeId` no `where` e tem teste de isolamento (P6, P7). |
| Marcar requisito no registro muda | "Entregou requisito" usa o mesmo `requisitosMarcados` e a mesma regra da data mais antiga (`aulas-envio.service.ts:341-353`); o que muda é só de onde vêm os ausentes (relidos do banco, regra 8), que endurece um caso que hoje passava errado. |
| Pontos de especialidade em dobro | O registro usa a mesma origem da ficha (`ESPECIALIDADE`, `<dbvId>:<especialidadeId>`, `especialidades-dbv.service.ts:64-75`) e `sincronizar` é por origem: marcar pela ficha depois de entregue no registro cai em "já concluída" (`:58-59`). Desmarcar pela ficha (`:84-106`) remove a conclusão qualquer que seja o `registroAulaId` e estorna pela mesma origem. |
| O Adm passa a ver tarefas no app | A parte do instrutor do pacote só vai para INSTRUTOR (`sync.service.ts:70`) e o registro depende dela (`TelaRegistroAula.tsx:31,42`): aceito pela SPEC. |
| Trocar o dia de reunião fica mais permissivo do que devia | Só o caso da classe num domingo coberto por extra com Terá classe deixa de travar; a trava já ignorava classe fora do dia normal (`clube.service.ts:52`). |
| Notificações e atividades antigas | Só título e texto das **novas** mudam (`servico-eventos.ts:303-304`, `aulas-envio.service.ts:402`); o tipo `CONFLITO_CRONOGRAMA` e os links ficam. Nomes internos e rotas `/aulas` não mudam, então links gravados continuam abrindo. |
| Conselheiro sem unidade | `inicio.service.ts:44` continua devolvendo tudo vazio, agora com `feriasAte: null` (teste em P4). |

## Contrato de retorno do subagente

Cada `implementador` devolve, em até 15 linhas, sem diff e sem trecho de código:

1. pacote concluído (P1…P10) e se fechou inteiro;
2. arquivos tocados — caminhos, nunca conteúdo;
3. testes do pacote: quantos verdes, os nomes que falharam, e **se o vermelho inicial foi visto**
   (todos os testes escritos antes da implementação);
4. erros de `tipos` que ficaram **fora** do pacote (esperados pela seção "Compilação entre as
   ondas"), em uma linha;
5. decisões tomadas sozinho, uma linha cada, no formato `DECISÃO / IMPASSE / ALTERNATIVA`;
6. pendências, uma linha cada.

O principal confere com `git diff --stat` e um `git diff <arquivo>` dirigido no ponto que o
relatório disse ter sido difícil, antes do commit. Briefing de cada pacote: worktree, branch,
commit-base, a seção do pacote neste plano, as linhas do ONDE FICA do assunto, o modelo-alvo,
"não rode git", "~80 turnos", contrato acima.

## ONDE FICA

```
ONDE FICA
- regra do dia (fórmulas)                    packages/shared/src/formulas/calendario.ts:9-17,37-45,48-52,55-61,73-83 ; formulas/index.ts:6 ; calendario.test.ts
- tipos e padrão das marcações               packages/shared/src/enums.ts:37-38,57-62
- contratos                                  packages/shared/src/contratos/{calendario.ts:6-31,cronograma.ts:44-47,inicio.ts:8-20,sync.ts:8-71,aulas.ts:6-50,instrutor.ts:6-19,especialidades.ts:6-17}
- permissões e observações (textos)          packages/shared/src/permissoes.ts:21-22 ; contratos/observacoes.ts:15
- shared pelo dist na API / src no web       packages/shared/package.json (main: dist) ; apps/web/vite.config.ts:70
- schema e migrations de referência          apps/api/prisma/schema.prisma:131-136,310-319,571-586,596-611,829-851,933-954,967,989-1034 ; migrations/20261001180000_tipo_diretoria ; 20260930120000_fase2_3_instrutor_adm/migration.sql:2,17-34,144-155,267-276,354-387
- banco de teste por execução                apps/api/test/global-setup.ts:13 ; test/banco.ts:24-45
- guarda de clube                            apps/api/src/comum/prisma/guarda-clube.ts:4-38 ; guarda-clube.spec.ts:72-73,113
- fábricas da API (e2e reexporta)            apps/api/test/fabricas.ts:407-427 ; e2e/apoio/semear.ts:12
- API do evento                              apps/api/src/calendario/eventos.controller.ts:10-31,52-69 ; servico-eventos.ts:46-63,77-87,141-198,303-304 ; servico-calendario.ts:12-23
- formato de erro de validação               apps/api/src/comum/pipes/zod-validation.pipe.ts:9-17 ; comum/erros.ts:27-35 ; apps/web/src/modulos/adm/desbravadores/erros.ts:32-39
- montagem (leitura, gravação)               apps/api/src/cronogramas/montagem/servico-montagem-leitura.ts:90-144 ; servico-montagem.ts:28,80,102,128,135,313,319,356-369
- leitura do cronograma (conflito)           apps/api/src/cronogramas/servico-cronograma.ts:179-216
- trava do dia de reunião                    apps/api/src/clube/clube.service.ts:35-59
- início do conselheiro                      apps/api/src/inicio/inicio.service.ts:15-21,44,65-76
- pacote offline                             apps/api/src/sync/sync.service.ts:36-73 ; pacote-instrutor.service.ts:33-67,69-121,141-153
- envio do registro                          apps/api/src/aulas/aulas-envio.service.ts:89-138,163-178,198-220,275-382,416-441 ; aulas.controller.ts:19-27 ; apoio.ts:14-29
- detalhe do registro / início do instrutor  apps/api/src/aulas/aulas.service.ts:51-90 ; apps/api/src/instrutor/instrutor.service.ts:32-73
- especialidade fora da classe; própria ficha apps/api/src/especialidades/especialidades-dbv.service.ts:46-106 ; especialidades-dbv.controller.ts:21-30 ; progresso/conclusoes.ts:13-31
- chamada (API e web)                        apps/api/src/reunioes/reunioes-envio.service.ts:160-170 ; apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:107,126-132
- formulário / ficha / editar evento         apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:24-45,51-104 ; FichaEvento.tsx:25-46,87-97,118-129 ; EditarEvento.tsx:20-25 ; apps/web/src/ui/CaixaMarcacao.tsx:5-19
- calendário do Adm                          apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:50,70,98,108,124,196-246 ; tipos.ts:6-21 ; apps/web/src/ui/tokens.css:38-43
- início do conselheiro (web)                apps/web/src/modulos/inicio/InicioConselheiro.tsx:49-63,70-101 ; apps/web/src/offline/usePacote.ts:14,24,33
- montagem (web)                             apps/web/src/modulos/cronograma-montagem/{datas.ts:15-28,LinhaData.tsx:61-119,PainelInstrutor.tsx:86-90,PainelAdm.tsx:111-118,FormularioAula.tsx:43,FolhasDoInstrutor.tsx:93}
- início do instrutor (web)                  apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:29-129,160-166,187
- registro da classe                         apps/web/src/modulos/aulas/{TelaRegistroAula.tsx:26-54,66,103-130 ; FormularioAula.tsx:147-311 ; estado.ts:40-57,134-143,180-221,235-260 ; fontes.ts}
- fila da aula e pacote local                apps/web/src/offline/tipos/aula.ts:8-18,39-69,74-97,100-120 ; offline/pacote.ts:14-25 ; motor.ts:263-266
- inventário aula → classe                   docs/fases/calendario-ferias-extras/SPEC.md, tabela "'Aula' → 'classe' (inventário)"
- handlers de teste (web)                    apps/web/src/testes/handlers/{calendario.ts:16-17,montagem.ts:31,146-152,inicio.ts:12,offline.ts:9-29,aulas.ts,instrutor.ts}
- e2e afetados                               e2e/fichas.spec.ts:107-125,189-230 ; e2e/adm.spec.ts:108,113-114 ; e2e/instrutor.spec.ts:45,85,94
- documentação com os campos antigos         README.md:97 ; docs/planejamento/MODELO-DE-DADOS.md:139-144,266
- conferido em                               7ddb020 (código igual ao de 8f142ef: os três commits da branch só tocam docs/)
```

## Cobertura da SPEC (autorrevisão)

| SPEC › seção | Onde |
|---|---|
| Calendário › O que muda para quem usa | P1 (gravar), P3 (formulário, calendário, ficha), P4 (conselheiro), P2 (montagem), P1–P3 + P5a/P5b ("classe") |
| Calendário › A regra do dia; Funções do shared | P0 (fórmulas, testes, `servico-calendario`) |
| Calendário › tabela de chamadas | P1 (`servico-eventos:181`, `servico-cronograma:189`); P2 (montagem, API e web) |
| Calendário › Banco e migration (só de ida, volta, teste da conversão) | P0 Passos 1, 5, 6; resultado e volta na PR (P10 Passo 6) |
| Calendário › Contrato e API: evento, gravar, aba antiga, duas extras, calendário do ano, trocar o dia | P0 (contrato); P1 |
| Calendário › Contrato e API: início, pacote offline, chamada | P0 (contrato); P4 |
| Calendário › Telas: formulário, ficha, calendário do Adm / início e chamada / montagem | P3 / P4 / P2 |
| Calendário › "Aula" → "classe" (inventário) | P1, P2, P3 (arquivos que já reescrevem); P5a, P5b (resto); P10 (e2e e busca final) |
| Calendário › Exceções e decisões | P0 (sobreposição, Férias, conflito, janela); P1 (Férias/extra ignoram o enviado); P2 (férias somem); P5b ("Fora do cronograma") |
| Calendário › Descobribilidade | P3 (vazio, texto sob o Tipo, erros no campo e no topo); P4 (sem reunião em 120 dias); P1 (troca do dia) |
| Calendário › Testes que mudam; Documentação; Critério de pronto | P0–P4 (tabelas de teste); P10 (e2e, docs, medição, QA) |
| Tarefa › O que muda para quem usa | P8 (passar), P7 (lembrete), P9 (cobrar, desfazer, encerrar), P6 (servidor) |
| Tarefa › Regras 1–3, 7–9 | P6 (servidor); P9 (tela e estado de 7–9) |
| Tarefa › Regras 4–6 (pendência derivada, própria ficha, some sozinha) | P7 (`tarefas-leitura.ts`); P6 (própria ficha no envio) |
| Tarefa › Regra 10 (sem duplicar) | P6 (detalhe); P8 ("Passar" ignora); P9 (grade e "O que falta fazer"); P7 (itens distintos) |
| Tarefa › Regra 11 (pontos) | P6 (`totalPontos`); P7 (`pontosEspecialidade`); P9 (prévia) |
| Tarefa › Decisões | P0b (contrato); P6 (diferenças, idempotência, fusão, permissão, `removidoEm`, avisos); P8 (pacote rebaixado ao abrir); P9 (encerrar no bloco) |
| Tarefa › Dados (uma migration, CHECK, `MODELOS_DE_CLUBE`, código em `aulas/`) | P0b; teste do CHECK no P6 |
| Tarefa › API: envio, saída, `aplicar`, detalhe / pacote, início, isolamento, quem usa | P0b + P6 / P0b + P7 |
| Tarefa › Telas: ordem do registro, "Para casa", busca / bloco de cobrança / início | P8 / P9 / P7 |
| Tarefa › Estado e fila, avisos, estados, envio recusado por prazo | P8 (itens, `tarefaId`, pacote antigo); P9 (especialidades, encerradas, avisos); P6 (prazo recusa tudo) |
| Tarefa › Descobribilidade | P8 (vazio que ensina); P9 ("Faltou hoje"); P7 (só o instrutor da classe) |
| Tarefa › Testes; Critério de pronto (3 tarefas × 6 itens, QA) | P0b, P6–P9; P10 |
| Ambas › Fora de escopo | não planejado (lista no Comando de execução) |

## Comando de execução

```
Aja como orquestrador (skill orquestrador) e execute o plano "Férias, reunião extra, 'classe' no
lugar de 'aula' e tarefa para casa".

ONDE: continue na worktree existente /home/robertogabrieu/desbravadores/.claude/worktrees/calendario,
branch feature/calendario-e-tarefas, PR #25 (rascunho). Não crie branch nem PR novos. Base: main em
8f142ef (a branch só tem commits de docs/ por cima: nada de merge).

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/calendario-ferias-extras/SPEC.md,
docs/fases/tarefa-de-casa/SPEC.md e docs/fases/calendario-ferias-extras/PLANO.md. Os modelos em
docs/fases/calendario-ferias-extras/modelo/*.dc.html e docs/fases/tarefa-de-casa/modelo/*.dc.html
são o alvo visual e vencem a SPEC (estrutura, ordem e texto; nunca CSS). CLAUDE.md da raiz vale
inteiro.

DECISÕES TRAVADAS (não reabrir):
- marcações no positivo: temReuniao e temClasse no lugar de cancelaReuniao/bloqueiaAula, com a
  migration escrita à mão que inverte os valores (só de ida; volta mínima registrada na PR);
- Férias não tem caixa nenhuma (grava Terá reunião não, Terá classe sim interno, campo não);
- Reunião extra tem uma data só e só duas caixas (Terá reunião, Terá classe), ao menos uma; campo
  sempre não; uma extra por data; a extra só acrescenta e vence a sobreposição;
- conflito mantém a semântica de hoje: só evento que tira a classe gera conflito;
- próxima reunião do conselheiro pelo calendário, inclusive sem internet (pacote com calendario,
  janela de 120 dias, "Férias até dd/mm");
- caixa de campo é "Terá atividade de campo";
- "classe" no lugar de "aula" em todo texto visível; nomes internos ficam;
- tarefa é da classe, com a cobrança no próprio registro: presença no topo e cobrança logo abaixo,
  um item por vez, "Entregou" cumpre o requisito ou conclui a especialidade;
- nenhum elemento fixed/sticky novo — o usuário prefere telas sem barra presa;
- as decisões do PLANO: regra do dia só no shared (com horarioELocalDoDia e validarEvento); a extra
  dá nome, horário e local só quando tem Terá reunião; texto sob o Tipo só onde o modelo o tem
  (Evento, Férias, Reunião extra); catálogo de especialidades opcional no pacote para detectar
  pacote antigo; "aula"→"classe" por dono (P1–P3) e o resto em P5a/P5b, commit mecânico próprio;
- testes antes da implementação dentro de cada pacote; validação pesada só no P10; baseline por
  nomes já existe (API e web sem falhas; e2e só com a falha de e2e/fundacao.spec.ts "a instalação
  PWA existe…") — não recolha;
- máquina fraca: tudo pelo `pesado`, uma suíte pesada por vez, Node 22, comandos da seção Global
  Constraints do PLANO (testes de dentro do pacote, sem --maxWorkers; build do shared antes da API).

FORA DE ESCOPO: renomear código, banco ou rotas de "aula" para "classe"; repetição de eventos;
tela do desbravador; mudar a validação da chamada; docs/fases/fase-2-3/anexos/; o desbravador ver a
tarefa; pendências para conselheiro ou Adm; histórico de tarefas encerradas; push; texto livre,
observação ou prazo na tarefa; reabrir tarefa encerrada; lembrete nas classes agrupadas e no
início sem conexão; a ficha não barrar a própria ficha ao marcar especialidade.

EXECUÇÃO: ondas 0 a 7 do PLANO. P0 e P0b são seus, inline (arquivos de dono compartilhado), antes
de delegar os pacotes que dependem deles; o teste da migration (P0 Passo 6) é seu, num banco
descartável. P1–P9 vão ao `implementador` (sonnet), no máximo dois em paralelo e só os pares
disjuntos da tabela de ondas, cada briefing com a seção do pacote, as linhas do ONDE FICA do
assunto e o modelo-alvo; nenhum subagente roda git; commit por pacote pela skill `commit`, com o
título do plano; `tipos` da raiz verde no fim das ondas 2 e 6; revisão com opus; push e saída do
rascunho só pelo `gestor-pr` no fim.

GATE: "Pronto" do P10 — lint, tipos, suítes de shared, API e web, e2e e build verdes contra o
baseline por nomes; medição sem rolagem lateral e sem fixed/sticky em 390/820/1280 (inclusive
dentro do bloco de cobrança com três tarefas de seis itens); busca de "aula" sem texto visível;
revisão da PR limpa; QA sem FALHOU ancorado nos modelos; PR #25 fora do rascunho.

RETORNO: relatório de fechamento da skill orquestrador, com as decisões tomadas fora do PLANO em
PENDÊNCIAS.
```
