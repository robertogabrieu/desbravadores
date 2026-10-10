# Eventos especiais — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar. Este plano **aponta**: o porquê
> de cada decisão está em [SPEC.md](SPEC.md), e o aspecto de cada tela, em [modelo/](modelo/).

**Goal:** o Adm cadastra eventos especiais (de gala ou de campo) no calendário do clube, registra numa lista
única quem foi e quem foi com o uniforme pedido, e os pontos entram no ranking do mês; conselheiro e instrutor
veem o calendário e o próximo evento no início.

**Architecture:** um tipo novo de evento (`EVENTO_ESPECIAL`) com quatro colunas no evento (`uniforme`,
`pontosParticipacao`, `pontosUniforme`, `listaConcluidaEm`), um modelo novo por clube (`PresencaEventoEspecial`) e
um módulo novo na API (`eventos-especiais/`: lista, marcas, conclusão, pontos). Os pontos saem só por
`ServicoPontos.sincronizar`, com dois critérios novos criados sob demanda. A regra de quem entra na lista é a do
ranking, extraída numa função que recebe o client da transação. No web: o formulário e a ficha ganham o grupo
"Uniforme e pontos", há uma tela nova da lista (`PresencaDoEvento`) e, para conselheiro e instrutor, o item
"Calendário" na barra e o cartão "Próximo evento" no início. Um rádio comum novo (`EscolhaUnica`).

**Tech Stack:** NestJS 11 + Prisma 7 + PostgreSQL (API, Jest), React 19 + React Router 7 + TanStack Query 5 (web,
Vitest + MSW 2), Zod 4 em `packages/shared`, Playwright (e2e, headless, só no CI).

**Spec:** [SPEC.md](SPEC.md) e o modelo em [modelo/](modelo/) — também no quadro
https://claude.ai/artifact/EtDbsBDcYzULoSKxJReR12. **O modelo vence a SPEC no empate.**
**Branch:** `feature/eventos-especiais` · **Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/spec-eventos-festivos`
· **Base:** `origin/main` em `c55ea66` · **PR:** a abrir em rascunho pelo `gestor-pr` (a PR da entrega é esta mesma,
a implementação empilha commits nela). **Não há issue ligada**: o corpo da PR não leva `Closes #N`.

## Global Constraints

- **Zero `any`.** Tipo específico, `unknown` com type guard, ou generic (CLAUDE.md).
- **Contratos só em `packages/shared`.** Nada de redeclarar o evento, a lista ou a conclusão na API ou no web.
- **Toda operação de modelo de clube leva `clubeId`**, inclusive em `include` aninhado (a guarda não o cobre).
  Recurso de outro clube, apagado ou de outro tipo: **404, nunca 403**; a guarda de permissão devolve 403 antes
  para quem não pode. Id malformado: 400 `VALIDACAO`.
- **Toda rota declara `@Publica`, `@Autenticado`, `@Logado` ou `@Pode`.** Presença e conclusão:
  `@Pode('ranking.lancar_manual')`; gravar evento: `calendario.gerenciar` (já existe). **Nenhuma chave de
  permissão nova**: o catálogo continua em 25.
- **Nunca apague linha com histórico: desative.** Desmarcar quem foi grava `foi=false` e `comUniforme=false`;
  a linha de `PresencaEventoEspecial` nunca é apagada.
- **Pontos só por `ServicoPontos.sincronizar`**, origem `EVENTO_ESPECIAL`, `origemId = <eventoId>:<dbvId>`,
  `data = inicio` do evento. Refazer valor é `devidos: []` e depois os novos, **na mesma transação**.
- **Ids vêm do Prisma Client**; nada de INSERT em SQL cru (exceto o SQL da migration gerada pelo Prisma).
- **Tudo que a transação lê, lê pelo `tx`**: a função do roster recebe o client; outra conexão dentro da
  transação esgota o pool. Ordem das travas: a do clube (`'eventos-do-clube'`, só nas gravações do evento), depois a
  do evento (`hashtext('presenca-especial'), hashtext(eventoId)`), depois a de critérios. Presença **não** toma a
  trava do clube.
- **`.nullable().optional()` em todo campo novo do contrato do evento** (molde `classeBiblica`,
  `contratos/calendario.ts:23-25`): só `.optional()` rejeita o `null` que o banco devolve e derruba a resposta.
- **O resumo da lista (`lista`) nunca entra no pacote**: `EventoDoPacote = EventoSaida.omit({ id, lista })`.
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** As classes saem dos tokens e de `ui/` (`Cartao`,
  `Botao`, `Confirmacao`, `Campo`, `CampoData`, `Selecao`, `CaixaMarcacao`, `Selo`, `Chip`, `EstadoVazio`,
  `EstadosDeCarga`, `Esqueleto`, `FaixaAviso`, `ListaDePares`, `RodapeDoFormulario`, `LinhaQueNavega`,
  `EstadoNaoEncontrado`, `CabecalhoDaPagina`). Os apelidos de cor do CSS dos quadros (`--color-on-primary` e
  companhia) **não existem no app**.
- **Tela trata carregando, vazio, erro e sem conexão**; conexão só por `useConexao`. **Nada informado só pela cor**;
  alvo de toque ≥ 44 px; `prefers-reduced-motion` respeitado; confirmação de fim não some sozinha.
- **`Campo.tsx` não muda** (a letra de 14 px é achado à parte). **A Classe Bíblica não muda**: nenhum arquivo dela
  é tocado e os testes dela seguem verdes.
- **Nenhum elemento `fixed`/`sticky` novo.**
- **Testes antes da implementação, dentro de cada pacote:** todos os testes do pacote escritos primeiro e vistos
  falhando; depois implementar; depois verde. Nada de intercalar teste por passo.
- **Validação pesada só na fase final (P7).** Por pacote: só os testes do pacote, `npm run tipos` e `npm run lint`,
  pelo `pesado`.
- **Máquina fraca:** uma suíte pesada por vez, sempre pelo `pesado` (`pesado testar -- <arquivo>`); Node 22
  (`export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`); Vitest com `--maxWorkers=2`; Playwright só
  headless; **e2e nunca roda local**, é do CI e **neste projeto o CI não roda e2e**: o e2e é escrito e não
  executado.
- **`packages/shared` é consumido pelo `dist/` na API:** mudou contrato ou fórmula,
  `npm run build -w packages/shared` antes de testar a API.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`). Push só pelo `gestor-pr`.

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** contratos, enums, schema + migration, guarda, fábricas, tokens e `tipos.ts` mínimo | agente principal (inline) | — |
| 1 | **P1** API: módulo `eventos-especiais` (lista, marcas, conclusão, pontos, critérios) e roster do ranking | subagente `implementador` | P0 |
| 1 | **P3** web Adm: formulário, ficha e o rádio comum | subagente `implementador` | P0 |
| 2 | **P2** API: evento (gravação, calendário, pacote), Visão geral e regra de pendência | subagente `implementador` | P0, P1 |
| 2 | **P4** web Adm: a tela da lista `PresencaDoEvento` | subagente `implementador` | P0, P3 |
| 3 | **P5** web Adm: calendário e Visão geral | subagente `implementador` | P0, P2, P3 |
| 3 | **P6** web leitura: calendário, cartão e barra | subagente `implementador` | P0, P2 |
| 4 | **P7** fase final: e2e, revisão, CI, QA, docs, PR pronta | `implementador` (e2e) → `gestor-pr` → revisão → CI → `qa-runner` → `documentador` → `gestor-pr` | P1–P6 |

P1 (Jest) e P3 (Vitest) tocam arquivos disjuntos e runners diferentes: correm em paralelo. P2 e P4, e P5 e P6,
idem. **No máximo dois implementadores de cada vez**, e o `pesado` enfileira as rodadas. P2 só começa depois de P1
**fechada e commitada**, porque o evento chama a função de "refazer pontos do evento" que o P1 exporta.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 15 | principal: todos de dono compartilhado |
| P1 | 11 | implementador |
| P2 | 10 | implementador |
| P3 | 11 | implementador |
| P4 | 11 | implementador |
| P5 | 7 | implementador |
| P6 | 13 | implementador |
| P7 | 2 (e2e) + roteiro de QA + 5 docs | implementador + `qa-runner` + `documentador` |
| **Total** | **~85** | 6 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U, com o ótimo entre 6 e 10 arquivos e o
dobro acima de 21. API (21 fora do P0) e web (42 fora do P0) caem em pacotes de 7 a 13; o P6 é o maior porque o
calendário de leitura, o cartão e a barra se testam juntos. Juntar P1 e P2 daria 20 e
cairia no braço caro; partir P4 ou P6 repagaria o piso de ~27k por arquivos que se testam juntos. A divisão é por
**fluxo vertical** onde dá (a lista inteira é um pacote; o calendário de leitura inteiro é outro), e o P0 fica com o
principal porque todos os arquivos dele são ímãs de conflito e seis pacotes dependem deles.
Orçamento por implementador: **~80 turnos**.

## Contrato de retorno (vale para todo pacote)

O relatório do implementador tem até 15 linhas, sem diff e sem trecho de código: (1) pacote concluído; (2) arquivos
tocados, **só caminhos**; (3) testes do pacote: verdes e nomes que falharam; (4) decisões que teve de tomar sozinho,
uma linha cada; (5) pendências. A linha `GIT: não rode git` vai em todo briefing.

---

## P0 — agente principal (inline), onda 0

**Por que inline:** contratos, enums, schema, migration, guarda do clube, fábricas e tokens são de dono
compartilhado e seis pacotes dependem deles. Deixa a árvore **compilando** (`tipos.ts` ganha o mínimo para o
`Record` por tipo fechar).

**Files:**
- Modify: `packages/shared/src/enums.ts` — `TIPOS_EVENTO` + `EVENTO_ESPECIAL` **logo depois de `EVENTO`** (a legenda do
  calendário segue essa ordem); `MARCACOES_PADRAO.EVENTO_ESPECIAL = { temReuniao: true, temClasse: true, bomParaCampo: false }`;
  enum Zod novo `UniformeEvento` (`GALA`, `CAMPO`).
- Modify: `packages/shared/src/contratos/calendario.ts` — `EventoEntrada` e `EventoSaida` ganham `uniforme`,
  `pontosParticipacao`, `pontosUniforme` (todos `.nullable().optional()`; pontos inteiros de 0 a 1000); `EventoSaida`
  ganha `lista: ResumoDaLista.nullable().optional()` (`concluidaEm`, `foram`, `uniformizados`).
- Create: `packages/shared/src/contratos/presenca-evento.ts` — `PresencaDoEventoSaida` (`unidades` com `unidadeId`
  nulo para "Sem unidade", `nome` e `linhas` de `{ dbvId, nome, foi, comUniforme }`; `resumo` com `foram`,
  `uniformizados`, `total`; `aberta`; `listaConcluidaEm`), `PresencaDoEventoEntrada` (`marcas` de
  `{ dbvId, foi?, comUniforme? }`, ao menos uma), `PresencaDoEventoResposta` (linhas autoritativas das pessoas
  tocadas, `resumo`, `listaConcluidaEm`, `avisos`), `ConclusaoEntrada` (`foram`, `uniformizados`), `ConclusaoSaida`.
- Modify: `packages/shared/src/contratos/sync.ts:55` — `EventoDoPacote = EventoSaida.omit({ id, lista })`.
- Modify: `packages/shared/src/contratos/visao-geral.ts:18` — `eventosSemLista` **com `.default([])`**
  (`eventoId`, `nome`, `inicio`, `fim`).
- Modify: `packages/shared/src/formulas/calendario.ts` — `EventoDoCalendario` ganha os campos; `validarEvento`
  ganha as chaves planas `uniforme`, `pontosParticipacao`, `pontosUniforme` (o evento especial exige o uniforme;
  pontos de 0 a 1000; fora do tipo especial os campos são descartados por quem grava, não por esta função).
- Modify: `packages/shared/src/formulas/pontos.ts:3-14` — gatilhos `EVENTO_ESPECIAL_PARTICIPACAO` e
  `EVENTO_ESPECIAL_UNIFORME` e a constante `GATILHOS_DO_EVENTO`.
- Modify: `packages/shared/src/index.ts` — export do contrato novo.
- Modify: `apps/api/prisma/schema.prisma` — enums: `TipoEvento` + `EVENTO_ESPECIAL`, `GatilhoCriterio` + os dois
  gatilhos, `OrigemPontos` + `EVENTO_ESPECIAL`, e o enum **novo** `UniformeEvento`; `EventoCalendario` + as quatro
  colunas; modelo `PresencaEventoEspecial` (`clubeId`, `eventoId`, `dbvId`, `foi`, `comUniforme`, `alteradaPorId`,
  `alteradaEm`; `@@unique([eventoId, dbvId])`; `@@unique([clubeId, id])` e FKs compostas `(clubeId, id)`, como
  `PresencaClasseBiblica`).
- Create: `apps/api/prisma/migrations/<timestamp>_eventos_especiais/migration.sql` — gerada pelo Prisma, com
  timestamp **maior que `20261010120000`** (a da Classe Bíblica); `ALTER TYPE … ADD VALUE` **sem usar o valor na
  mesma migration**; `CREATE TYPE` do `UniformeEvento` pode usar o enum novo na coluna.
- Modify: `apps/api/src/comum/prisma/guarda-clube.ts:4-50` e `guarda-clube.spec.ts:71-124` — `PresencaEventoEspecial` na
  lista e na lista exata do teste.
- Modify: `apps/api/test/fabricas.ts:486-505` — `criarEvento` aceita `uniforme`, `pontosParticipacao`, `pontosUniforme` e
  `listaConcluidaEm`; fábrica `criarPresencaEvento`.
- Modify: `apps/web/src/ui/tokens.css:39-45` — `--cal-especial-bg` e `--cal-especial-fg`, **os únicos tokens novos**
  (claro: `#F5DC86` e `#5A3F00`; os valores do desenho estão em `modelo/` e foram medidos com 7,21:1).
- Modify: `apps/web/src/modulos/adm/calendario/tipos.ts:10-60` — o mínimo para o `Record` por tipo fechar (rótulo
  "Evento especial", cor `--cal-especial-*`, ponto, ícone `Sparkles`); o texto de apoio e o resto são do P3.

- [ ] **Step 1:** escrever os arquivos de `packages/shared` e `npm run build -w packages/shared`.
- [ ] **Step 2:** schema e migration; `npx prisma generate`; conferir que a migration cria o enum novo e acrescenta os
  três valores sem usá-los.
- [ ] **Step 3:** guarda, fábricas, tokens e `tipos.ts`.
- [ ] **Step 4:** `npm run tipos` **pelo `pesado`** (API e web) verde, e **um** commit: "feat(eventos-especiais): a base
  de contratos, banco e tokens". Anotar a base e o commit para todo briefing.

---

## P1 — API: eventos-especiais (lista, marcas, conclusão, pontos), onda 1

**Objetivo:** o Adm lista, marca e conclui a presença de um evento especial, e os pontos entram no ranking pela
única escrita permitida. **Critérios:** C15–C18 (lado servidor), C21, C23–C26, C28–C30, C35, C41–C44.

**Files (todos na API):**
- Create: `apps/api/src/eventos-especiais/eventos-especiais.module.ts` — importa os módulos que exportam
  `ServicoPontos`, `CalculoRanking` e `ServicoAtividade` (hoje `PontosModule`, o do ranking e `AtividadesModule`);
  **não** importa `EventosModule` (o sentido é eventos → eventos-especiais).
- Create: `apps/api/src/eventos-especiais/presenca.controller.ts` — `GET`, `PUT` e `POST …/concluir` em
  `/calendario/eventos/:id/presenca`, todos `@Pode('ranking.lancar_manual')`.
- Create: `apps/api/src/eventos-especiais/servico-presenca.ts` — lista agrupada (unidade em ordem alfabética, "Sem
  unidade" por último), marcas, conclusão, tudo sob as travas na ordem dita.
- Create: `apps/api/src/eventos-especiais/servico-pontos-evento.ts` — `sincronizar` por pessoa, `refazer` e `estornar`
  do evento inteiro, **exportado** para o P2.
- Create: `apps/api/src/eventos-especiais/criterios.ts` — `garantirCriteriosDeEvento(tx, clubeId)` idempotente, no molde
  de `apps/api/src/classe-biblica/criterios.ts`.
- Create: `presenca.spec.ts`, `pontos-evento.spec.ts`, `criterios.spec.ts` na mesma pasta.
- Modify: `apps/api/src/ranking/calculo-ranking.ts:60-91` — extrai a regra de `doMes` numa função que **recebe o client
  da transação**; `doMes` passa a chamá-la com `this.prisma`. Acrescenta a variante com `entradaEm <= inicio`.
- Modify: `apps/api/src/ranking/ranking.spec.ts` — o comportamento de hoje não muda; casos novos do roster.
- Modify: `apps/api/src/app.module.ts` — registra o módulo.

- [ ] **Step 1: testes (todos, falhando).** `presenca.spec.ts`: lista agrupada e ordenada; "Sem unidade" por último; roster
  exclui inativo, quem entrou depois do `inicio` e o tipo fora do ranking; Diretoria que veio de DBV com a unidade
  anterior; evento de outro clube, apagado ou de outro tipo: 404; conselheiro e instrutor: 403; `aberta` falso antes do
  dia e `PUT` recusado antes do dia; `PUT` grava `foi` e `comUniforme`, recusa `comUniforme` sem `foi`, `foi:false` **mantém
  a linha** e zera o uniforme, `comUniforme` omitido não mexe, lote é tudo ou nada, devolve as linhas autoritativas, aviso
  só para id que existe no clube (sem eco de nome de id desconhecido); **com a lista não concluída nenhum
  `LancamentoPontos` é criado**; concluir: totais divergentes → `REGRA`, antes de `inicio` → `REGRA`, sincroniza só o
  roster com aviso das linhas fora dele, participação e uniforme, 0 não gera lançamento, repetir não duplica nem regrava
  `listaConcluidaEm`; depois de concluída, `PUT` ajusta os pontos na hora, na mesma transação, e grava `Atividade`;
  dois `PUT` simultâneos na mesma pessoa terminam com a última marca e sem estourar o pool. `pontos-evento.spec.ts`:
  refazer troca valor por estorno e relançamento; estornar tira tudo; mudar o uniforme não muda pontos; evento de
  vários dias pontua uma vez no mês de `inicio`; ninguém perde ponto por faltar; Diretoria usa a unidade anterior.
  `criterios.spec.ts`: cria os dois critérios uma vez, para clube novo e para clube que já existia, `padrao`, `ativo`,
  `pontos` 0, `lancadoPor: ADM`, sem herdar o sufixo "(Classe Bíblica)". `ranking.spec.ts`: o resultado de `doMes`
  idêntico ao de antes; a função extraída roda com o client de uma transação sem tomar outra conexão.
- [ ] **Step 2:** implementar até verde (`pesado testar -- apps/api/src/eventos-especiais apps/api/src/ranking`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`. **Não** rodar a suíte inteira.

**Não mexer:** `servico-eventos.ts` e tudo de `calendario/` (é do P2), `sync/`, `visao-geral/`, qualquer arquivo de
`classe-biblica/`.

---

## P3 — web Adm: formulário, ficha e o rádio comum, onda 1

**Objetivo:** cadastrar, editar e ver o evento especial. **Critérios:** C1–C11, C46–C49.

**Files:**
- Create: `apps/web/src/ui/EscolhaUnica.tsx` — rádio comum: `fieldset` + `legend`, com `id` e `data-com-erro` (o que
  `ErrosDoFormulario.tsx:11-27` já trata), alvo `min-h-[var(--touch-min)]`, contorno só com `border-borda-controle`,
  nenhuma letra abaixo de 12 px (o `ui/contraste.test.tsx` varre `ui/`).
- Modify: `apps/web/src/ui/componentes-novos.test.tsx` — testes do rádio (grupo com legenda, erro anunciado e com foco).
- Modify: `apps/web/src/modulos/adm/calendario/tipos.ts` — texto de apoio do tipo (o do P0 é só o mínimo).
- Modify: `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx` — grupo "Uniforme e pontos" só no tipo especial, com
  `EscolhaUnica` ("Uniforme de gala", "Uniforme de campo", **sem marca ao abrir**), os dois campos de pontos sempre,
  validação ao sair **só dos dois campos de pontos**, em **estado local separado** que não alimenta `erros` nem
  `useErrosAVista`; a frase de efeito; a frase "o instrutor é avisado" só com "Terá classe" desmarcada (`:171`);
  o aviso de refazer pontos e o de trocar o uniforme.
- Modify: `apps/web/src/modulos/adm/calendario/FichaEvento.tsx` — cartão "Quem foi ao evento" nos quatro estados, "Pontos e
  uniforme", "Editar" secundário quando há botão primário, a confirmação de excluir que diz quantos pontos saem
  (`:166-175`), a recusa de data futura.
- Modify: `apps/web/src/modulos/adm/calendario/EditarEvento.tsx` e `apps/web/src/modulos/adm/navegacao.ts:5-19` — o
  aviso "Evento salvo." **lido uma vez** (campo novo `salvo` no estado de navegação; `lerEstado` hoje ignora chave
  nova e `useAvisosDaFicha` limpa o estado).
- Modify: `apps/web/src/testes/handlers/calendario.ts` — handlers com o evento especial.
- Create: `apps/web/src/modulos/adm/calendario/formulario-especial.test.tsx`.
- Modify: `apps/web/src/modulos/adm/calendario/ficha.test.tsx` e `formulario-erros.test.tsx`.

- [ ] **Step 1: testes (todos, falhando).** C1 a C11 como casos de Vitest com MSW: o formulário abre sem uniforme marcado
  e sem pontos; salvar sem uniforme leva o foco e mostra "Escolha o uniforme do evento." também no resumo de erros;
  as quatro mensagens do campo de pontos; a frase de efeito; as marcações neutras; a frase do instrutor só com a classe
  desmarcada; "Evento salvo." uma vez; os diálogos de refazer pontos e de excluir (botão primário seguro); a ficha nos
  quatro estados da lista, cada um com o botão certo; o rádio.
- [ ] **Step 2:** implementar até verde (`pesado testar -- apps/web/src/modulos/adm/calendario apps/web/src/ui`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`; medir no DOM (jsdom não mede toque: ver C46 no P7).

**Não mexer:** `Campo.tsx`, `ErrosDoFormulario.tsx`, qualquer coisa da Classe Bíblica, `AdmCalendario.tsx` e
`CalendarioDoCelular.tsx` (P5), a tela da lista (P4).

---

## P2 — API: evento, calendário, pacote e Visão geral, onda 2

**Objetivo:** gravar o evento especial, devolver os campos a todos e o resumo só ao Adm, manter o pacote íntegro e
avisar da lista pendente. **Critérios:** C4–C5, C8–C11, C13–C14, C32 (dado), C35, C37, C39–C40, C45.

**Files:**
- Modify: `apps/api/src/calendario/servico-eventos.ts` — `paraSaida` com os campos planos; `gravar` **mapeia para colunas**
  (hoje faz spread de `entrada` direto no Prisma: `:146-151`) com `null` explícito ao trocar o tipo; `doAno` e `obter`
  devolvem `lista` **só para sessão Adm e só para evento especial**; regras do evento concluído: mudar pontos ou data
  (para outra já passada) chama o `refazer` do P1, mudar `inicio` para o futuro com lista começada ou concluída é
  `REGRA`, apagar chama o `estornar`, mudar o tipo de ou para especial com linhas ou lista concluída é `REGRA`,
  trocar o uniforme com lista concluída vai para `Atividade`. Trava do clube como hoje.
- Modify: `apps/api/src/calendario/eventos.controller.ts` — `EventoGravar` com os campos novos; `RecusarMarcacoesAntigas`
  (`:11-18`) continua; o evento especial sai de `comMarcacoes` com os descartes.
- Modify: `apps/api/src/calendario/eventos.module.ts` — importa o `EventosEspeciaisModule` (para o `refazer`).
- Modify: `apps/api/src/calendario/eventos.spec.ts`.
- Modify: `apps/api/src/sync/sync.service.ts:100-110` — o mapeamento à mão do pacote **lista os três campos novos** e emite
  `null` para evento que não é especial; `lista` fora.
- Modify: `apps/api/src/sync/sync.spec.ts:206-216` — o `toContainEqual` exato passa a ter os três campos.
- Modify: `apps/api/src/visao-geral/visao-geral.service.ts:86-122` e `visao-geral.spec.ts` — `eventosSemLista`.
- Modify: `packages/shared/src/formulas/calendario.ts` — a regra única `pendenciaDeLista(evento, hoje)`: evento especial,
  `fim` antes de hoje, no máximo 60 dias, soma dos dois pontos maior que 0, lista não concluída.
- Modify: `packages/shared/src/formulas/calendario.test.ts`.

- [ ] **Step 1: testes (todos, falhando).** `eventos.spec.ts`: criar com campos planos; `uniforme` obrigatório (erro de
  validação na chave `uniforme`); pontos de 0 a 1000; campos descartados fora do tipo especial; marcações neutras
  (a reunião e a classe do dia seguem) e **nenhuma `Notificacao`**, e só com "Terá classe" desmarcada o instrutor é
  avisado; mudar o tipo com lista é `REGRA`; mudar `inicio` para o futuro com lista é `REGRA`; mudar pontos com a lista
  concluída refaz os lançamentos; apagar com lista estorna; trocar o uniforme com a lista concluída grava `Atividade`;
  `lista` só na sessão Adm; conselheiro e instrutor recebem os pontos e **não** a lista; bundle antigo recusado;
  evento de outro clube: 404; a montagem do cronograma lista o evento especial pelo nome na data (C38). `sync.spec.ts`: o pacote traz os campos, com `null` para os outros tipos; **sem `lista`**; o
  substituto recebe os pontos e nunca a lista; a versão do pacote **não muda** depois de tocar a lista; um pacote
  guardado antes continua válido no parse. `visao-geral.spec.ts` e `calendario.test.ts`: C13 e C14 (em andamento, mais de
  60 dias, 0/0, concluída: nada; no prazo: aparece), e a regra única usada pelos dois.
- [ ] **Step 2:** implementar até verde (`npm run build -w packages/shared`, depois
  `pesado testar -- apps/api/src/calendario apps/api/src/sync apps/api/src/visao-geral packages/shared`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`.

**Não mexer:** o módulo `eventos-especiais/` e `calculo-ranking.ts` (P1), qualquer arquivo de `classe-biblica/`.

---

## P4 — web Adm: a tela da lista, onda 2

**Objetivo:** a tela "Quem foi" inteira, celular e computador. **Critérios:** C15–C28, C46–C49.

**Files:**
- Create: `apps/web/src/modulos/adm/calendario/presenca/PresencaDoEvento.tsx` — a tela, com os quatro estados e os
  quadros de bloqueio (antes do dia, evento não encontrado, sem internet ao abrir).
- Create: `…/presenca/SecaoDaUnidade.tsx` e `LinhaDeMarca.tsx` — **componentes novos** (a Classe Bíblica não é tocada), com a
  pílula do uniforme que diz "De gala" ou "De campo".
- Create: `…/presenca/TabelaDePresenca.tsx` — a tabela do computador (≥ 900 px), com **botão de verdade** também na
  coluna do uniforme (desligado, com o motivo escrito, para quem não foi).
- Create: `…/presenca/DialogosDaPresenca.tsx` — concluir sem ninguém, lista mudada, tirar alguém, tirar só o uniforme.
- Create: `…/presenca/useMarcasDaPresenca.ts` — o hook novo (interface na SPEC, "Desenho técnico").
- Create: `apps/web/src/api/presenca.ts` e `apps/web/src/testes/handlers/presenca.ts`.
- Create: `…/presenca/presenca.test.tsx` e `marcas.test.tsx` (o hook).
- Modify: `apps/web/src/modulos/adm/calendario/rotas.tsx:6-11` — a rota `/adm/calendario/eventos/:id/presenca`.

- [ ] **Step 1: testes (todos, falhando).** `marcas.test.tsx`: fila de **uma** gravação por vez; a marca só vira marcada
  depois do servidor confirmar (`salvando` antes); falha por marca com "Tentar de novo" por item; em massa é **uma**
  requisição; reconcilia com as linhas devolvidas e refaz a leitura ao voltar o foco; sem internet `marcar` não aceita
  toque novo; marcas pendentes contadas. `presenca.test.tsx`: C15–C22 e C24–C28 (lista sem ninguém marcado, ordem das
  unidades, só a primeira aberta, "Salvo às", busca e "Limpar a busca", concluir com os totais vistos, recusa de lista
  mudada, concluída: tirar alguém e tirar o uniforme com a confirmação e o botão primário seguro), o rótulo
  "de gala" ou "de campo" conforme o evento, os quatro estados, o estado "antes do dia", o 404.
- [ ] **Step 2:** implementar até verde (`pesado testar -- apps/web/src/modulos/adm/calendario/presenca`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`.

**Não mexer:** `useRascunhoDaEdicao.ts`, `TelaChamadaCB.tsx` e tudo da Classe Bíblica; `Tabela.tsx` (é paginada e vira
cartão: não serve); `FichaEvento.tsx` (P3).

---

## P5 — web Adm: calendário e Visão geral, onda 3

**Objetivo:** o evento especial e o uniforme legíveis no calendário; o aviso de lista pendente em todos os lugares.
**Critérios:** C12–C14, C46.

**Files:**
- Modify: `apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:25, :54-71, :237-253` — pílula especial que quebra linha,
  uniforme em segunda linha (`Uniforme de gala` contorno cheio; `Uniforme de campo` tracejado, em cor neutra), a
  **legenda na ordem real** de `ROTULOS_DO_TIPO` com os dois uniformes como itens à parte (não entram no `Record`), o
  cartão com "Falta registrar quem foi".
- Modify: `apps/web/src/modulos/adm/calendario/CalendarioDoCelular.tsx:19-54, :85-126` — o losango, o painel do dia e a lista
  do mês; **mede no DOM** a célula do dia (hoje `gap-0.5`, `:93`) e ajusta para 44 px.
- Modify: `apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:90-109, :156-158` — item em "Precisa de atenção" (celular) e o
  cartão **próprio** "Eventos sem lista" no computador (`CronogramasAguardando` não serve: tem título próprio e some se
  vazio); o total soma os dois.
- Modify: `apps/web/src/modulos/adm/calendario/calendario.test.tsx`, `calendario-celular.test.tsx`; o teste existente da
  Visão geral; `apps/web/src/testes/handlers/visao-geral.ts:5-21` (o `.default([])` do P0 já cobre o parse).

- [ ] **Step 1: testes (todos, falhando).** Legenda na ordem real com os dois uniformes à parte; célula do computador sem
  cortar o texto do uniforme; cartão com a pendência pela regra única (no prazo aparece; em andamento, mais de 60 dias,
  0/0 e concluída: não); item e cartão da Visão geral e o total.
- [ ] **Step 2:** implementar até verde (`pesado testar -- apps/web/src/modulos/adm`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`.

**Não mexer:** a lista (P4), o formulário e a ficha (P3), `tipos.ts` além do que o P3 deixou.

---

## P6 — web leitura: calendário, cartão e barra, onda 3

**Objetivo:** conselheiro e instrutor veem o calendário e o próximo evento. **Critérios:** C31–C38, C46–C49.

**Files:**
- Create: `apps/web/src/modulos/calendario/CalendarioDeLeitura.tsx` — lê o `usePacote`; lista **todo** evento que ainda vai
  acontecer, por mês, **exceto Classe Bíblica**; sem estado de erro (o pacote não expõe erro); o instrutor lê "As datas
  das suas classes estão em Cronograma".
- Create: `apps/web/src/modulos/calendario/CartaoProximoEvento.tsx` — evento especial, acampamento e evento do clube; data
  em extenso ("Hoje, …", "Até <dia>"); a linha de pontos só com o que vale; o uniforme pedido sempre no especial; some
  sem evento e enquanto carrega.
- Create: `apps/web/src/modulos/calendario/rotas.tsx`, `calendario-leitura.test.tsx`, `proximo-evento.test.tsx`.
- Modify: `apps/web/src/rotas.tsx:69-87` — a rota `/calendario` no grupo CONSELHEIRO + INSTRUTOR (junto de
  `...rotasBiblioteca` e `...rotasClasseBiblica`); nenhuma colisão (as da Biblioteca são `/biblioteca` e
  `/adm/biblioteca`).
- Modify: `apps/web/src/modulos/inicio/InicioConselheiro.tsx:290` e `inicio.test.tsx`; `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:233`
  e `inicio-instrutor.test.tsx` — o cartão entra **ao lado de `<CartaoClasseBiblica />`**, fora de `corpo`.
- Modify: `apps/web/src/rotas.test.tsx` — a rota `/calendario` nos dois papéis e o Adm que cai no início do painel.
- Modify: `apps/web/src/layouts/LayoutCelular.tsx:18-22` — o 5º item "Calendário", ícone `CalendarRange` (`CalendarDays` já é
  "Reuniões" e "Cronograma"); `apps/web/src/layouts/layouts.test.tsx:60-84` — os itens, e a **Biblioteca continua fora da
  barra** (as asserções de `:71` e `:84` seguem).

- [ ] **Step 1: testes (todos, falhando).** C31 a C38: a barra com 5 itens e o novo leva a `/calendario`; a lista por mês,
  todos os tipos menos a Classe Bíblica, sem botão de escrita; offline com e sem pacote e vazio, com a data de
  atualização; o cartão (hoje, em andamento, só o que vale nos pontos, sem pontos, sem evento: some); o Adm em
  `/calendario` cai no início do painel; conselheiro e instrutor na rota da lista voltam ao início; o link de
  substituição sem lista.
- [ ] **Step 2:** implementar até verde (`pesado testar -- apps/web/src/modulos/calendario apps/web/src/modulos/inicio apps/web/src/modulos/inicio-instrutor apps/web/src/layouts apps/web/src/rotas.test.tsx`).
- [ ] **Step 3:** `npm run tipos` e `npm run lint` pelo `pesado`.

**Não mexer:** `Inicio.tsx` provisório do instrutor além do cartão, o `Atalhos` da Biblioteca, qualquer rota de `/adm`.

---

## P7 — fase final, onda 4

Em ordem, porque a revisão invalida a suíte (`rules/pr-pronta.md`):

- [ ] **1. e2e escrito, não executado** (`implementador`): `e2e/eventos-especiais.spec.ts` (Adm cria o evento, abre a lista,
  marca, conclui e vê o ranking; conselheiro e instrutor leem o calendário) e o que couber em `e2e/adm.spec.ts`. Roda
  `npm run tipos` e `npm run lint` nele; **não** roda o Playwright.
- [ ] **2. Push de revisão:** `gestor-pr` sobe a branch e abre a PR **em rascunho** ("push de revisão", sem suíte).
- [ ] **3. Revisão da PR inteira** contra `origin/main`: skill `code-review` e a checklist de
  `~/.claude/rules-sob-demanda/revisao-de-codigo.md`, até **nenhum Critical ou Important em aberto** (no máximo três
  rodadas); consertos ficam em commits locais.
- [ ] **4. Suba o que falta** (`gestor-pr`) e **espere o CI** (`gh pr checks`): **o CI é o gate**, a suíte local não roda.
  CI vermelho: um `saneador` com todas as falhas, nunca um agente por erro.
- [ ] **5. `documentador`** com a branch e a base: `README.md:36, :100`, `docs/planejamento/MODELO-DE-DADOS.md:149, :334`,
  `docs/planejamento/API.md:95-103, :186-187, :257`, `docs/planejamento/INCONSISTENCIAS.md:39`.
- [ ] **6. QA de interface:** `qa-roteiro` escreve o roteiro **a partir de C1–C49** da SPEC, cada bloco do modelo vira um
  item; `qa-runner` executa no localhost, headless; **medindo no DOM** (alvo, rolagem, contraste), nunca por captura de
  tela.
- [ ] **7. `gh pr ready`** e confirmar relendo `isDraft`. A linha da PR no fechamento é uma destas duas:
  `PR: <url> — pronta para revisão · revisão limpa em <n> rodada(s)` ou
  `PR: <url> — RASCUNHO, porque <achado ou bloqueio> · <o que destrava>`.

---

## O que NÃO quebra

- **A Classe Bíblica:** nenhum arquivo dela é tocado; a lista de presença tem hook e componentes próprios. Os testes
  dela (427 linhas na chamada) seguem verdes sem edição.
- **A chamada da reunião e o ranking dos outros gatilhos:** `pontosPorCriterio` ignora gatilho novo, os consumidores de
  lançamento filtram `origemTipo`, e o desempate do ranking não muda. A frequência continua vindo só de `Chamada` de reunião.
- **A regra do dia:** o evento especial cai no grupo "comuns" com marcações neutras; reunião, classe, cronograma e
  montagem não mudam (verificado em `situacaoDaData`).
- **O catálogo de permissões fica em 25**; `permissoes.test.ts` e `permissoes.spec.ts` não mudam. `clube-criar.spec.ts:25`
  segue em 8 critérios (os dois novos nascem sob demanda). `carga.ts` não toca critério nem evento.
- **`eventos.spec.ts`** usa `toMatchObject`: campos novos no evento não o quebram. **A Biblioteca** não toca calendário,
  ranking, pontos nem pacote, e continua fora da barra do celular.
- **O índice das migrations:** a de eventos vem depois de `20261010120000_classe_biblica`; a da Biblioteca
  (`20261010113048`) já está na base.

## ONDE FICA (por pacote, conferido em `c55ea66`)

Recorte para o briefing de cada pacote. **Diz onde olhar, nunca o que é verdade**: confirme na faixa indicada.

```
P0  tipos de evento e marcações            packages/shared/src/enums.ts:37, :57-66
    contrato do evento / pacote            packages/shared/src/contratos/calendario.ts:7-26 ; contratos/sync.ts:55, :85 ; contratos/visao-geral.ts:18
    validação e regra do dia               packages/shared/src/formulas/calendario.ts:57-75, :183-188 ; formulas/pontos.ts:3-14
    gatilhos e origem de pontos            apps/api/prisma/schema.prisma:93-104, :126-132, :140-148, :885-906
    molde de modelo de clube               apps/api/prisma/schema.prisma:1396 (PresencaClasseBiblica) ; guarda-clube.ts:4-50 ; guarda-clube.spec.ts:71-124
    fábricas                               apps/api/test/fabricas.ts:486-505
    tokens e tipos (web)                   apps/web/src/ui/tokens.css:39-45 ; modulos/adm/calendario/tipos.ts:10-60
P1  única escrita de pontos                apps/api/src/pontos/servico-pontos.ts:6-60
    molde de critérios e de chamada        apps/api/src/classe-biblica/criterios.ts ; classe-biblica/servico-chamada.ts:177-210
    ranking e roster                       apps/api/src/ranking/calculo-ranking.ts:60-91, :122-136, :149-157
    registro de atividade                  apps/api/prisma/schema.prisma:1260 ; apps/api/src/atividades/servico-atividade.ts
    permissão reaproveitada                packages/shared/src/permissoes.ts:26, :63-64
P2  API do evento                          apps/api/src/calendario/eventos.controller.ts:11-45, :54-94 ; servico-eventos.ts:80-94, :112-164, :177-198, :230-248
    aviso ao instrutor                     apps/api/src/calendario/servico-eventos.ts:230-240
    pacote offline                         apps/api/src/sync/sync.service.ts:77, :90-111 ; sync.controller.ts:12 ; sync.spec.ts:206-216
    visão geral                            apps/api/src/visao-geral/visao-geral.service.ts:86-122, :239-250
P3  formulário e ficha                     apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:42, :46-120, :124-179 ; FichaEvento.tsx:87-175 ; EditarEvento.tsx:43-50
    navegação da ficha                     apps/web/src/modulos/adm/navegacao.ts:5-19
    erros do formulário                    apps/web/src/ui/ErrosDoFormulario.tsx:11-45 ; ui/contraste.test.tsx
P4  molde visual da lista (não reaproveitar) apps/web/src/modulos/classe-biblica/chamada/TelaChamadaCB.tsx:225-299, :327-371
    chamada da reunião (Adm sem rascunho)  apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:31, :144, :185-190, :194, :251
    salvar sozinho (ideia, não reaproveitado) apps/web/src/modulos/adm/classe-biblica/useRascunhoDaEdicao.ts:2, :34-83
    rotas do calendário do Adm             apps/web/src/modulos/adm/calendario/rotas.tsx:6-11
P5  calendário do Adm                      apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:25, :54-71, :237-253 ; CalendarioDoCelular.tsx:19-54, :85-126
    visão geral                            apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:90-109, :156-158, :269 ; apps/web/src/testes/handlers/visao-geral.ts:5-21
P6  cartões do início                      apps/web/src/modulos/inicio/InicioConselheiro.tsx:103-143, :290 ; inicio-instrutor/TelaInicioInstrutor.tsx:233
    barra e rotas                          apps/web/src/layouts/LayoutCelular.tsx:18-22 ; layouts.test.tsx:60-84 ; apps/web/src/rotas.tsx:45-49, :69-108
    pacote no web                          apps/web/src/offline/usePacote.ts:26 ; offline/tipos.ts:143-150 ; offline/pacote.ts:27-48
P7  docs                                   README.md:36, :100 ; docs/planejamento/MODELO-DE-DADOS.md:149, :334 ; docs/planejamento/API.md:95-103, :186-187, :257 ; docs/planejamento/INCONSISTENCIAS.md:39
    testes e2e existentes                  e2e/adm.spec.ts:124, :144
- conferido em   c55ea66
```
