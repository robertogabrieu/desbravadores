# Regras de pontuação — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** executar a [SPEC](SPEC.md). Tela do Adm que reúne e edita tudo que dá ponto no ranking, e
remoção do desconto por falta (pontos só são acrescidos).

**Architecture:** API nova `GET /api/ranking/regras` e `PATCH /api/ranking/regras/:gatilho`
(`apps/api/src/ranking/regras/`), contratos e tabela de rótulos fixos por gatilho em `packages/shared`.
Tela nova em `apps/web/src/modulos/adm/ranking-regras/`, painel por `FolhaLateral`, um componente novo
em `ui/` (campo de pontos com − e +). Saem as rotas e a seção da Classe Bíblica de Configurações, o
desconto por falta (fórmula, contrato, servidor, chamada, banco) e, por D5/D6, a regra `MANUAL` e 3
colunas sem uso. Uma migração.

**Tech Stack:** NestJS 11 + Prisma 7 (Jest sem checagem de tipos → `npm run tipos`), React 19 + React
Router 7 + TanStack Query 5 (Vitest + MSW 2), Zod 4 em `packages/shared`, Postgres 17.

**Spec e mockup:** [SPEC.md](SPEC.md) e [modelo/Regras-de-Pontuacao.html](modelo/Regras-de-Pontuacao.html) —
**o mockup vence a SPEC** (estrutura, ordem e texto; nunca CSS). **Branch:** `spec/ranking-pontuacao` ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/ranking-pontuacao` · **PR:** em draft
(aberto com a spec; a implementação entra na mesma branch) · **Base:** `d8663b4`.

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared`; toda operação de
  modelo de clube leva `clubeId` (outro clube → 404, nunca 403) e teste de isolamento; toda rota declara
  `@Pode`/equivalente; `LancamentoPontos` só por `ServicoPontos.sincronizar`; nunca apagar linha com
  histórico; tela com carregando, vazio, erro e sem conexão (`useConexao`); sem CSS inline do design;
  e2e **não roda local**.
- **Do mockup copia-se estrutura, ordem e texto, nunca CSS.** Componentes de `apps/web/src/ui/`; cor nova
  vira token em `ui/tokens.css` (a SPEC não pede nenhuma).
- **Nenhum elemento `fixed`/`sticky` novo** além do painel (`FolhaLateral`).
- **Testes antes da implementação, dentro de cada pacote:** escritos primeiro e vistos falhando; depois
  implementar; depois verde. Rode só os arquivos do pacote (`pesado testar <arquivos>`); `npm run tipos`
  antes de devolver. **Suíte inteira não se roda no pacote.**
- **Subagente não roda `git`.** Quem versiona é o principal.

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** contratos e constantes compartilhados | agente principal (inline) | — |
| 1 | **P1** API: regras de pontuação | `implementador` | P0 |
| 2 | **P2** desconto por falta e regra desligada: shared, API e chamada do celular | `implementador` | P0, P1 (mesmo banco de teste, por isso em sequência) |
| 2½ | **P2m** schema e migração (tira as 5 colunas e o enum) | agente principal (inline) | P2 (só depois que nada mais lê as colunas, para a branch compilar em cada onda) |
| 3 | **P3a** web: tela nova | `implementador` | P0, P1 |
| 3 | **P3b** web: sair de Configurações, link no Ranking, e2e | `implementador` | P0 (disjunto de P3a; ambos sem banco, podem ir em paralelo, **sem git**) |
| 3½ | **P0c** rota e item de menu | agente principal (inline) | P3a |
| 4 | **P4** fechamento: revisão, CI, docs, QA | principal + `gestor-pr` + `documentador` + `qa-runner` | todos |

Commit local por onda (skill `commit`). **Push só no fim da onda 4** (`gestor-pr`, push de revisão), exceto
o push inicial da spec, que já foi feito.

## Conta do fatiamento

Cerca de 50 arquivos alterados. P1 ≈ 11, P2 ≈ 14, P3a ≈ 10, P3b ≈ 8; P0, P2m e P0c são ≈ 9 juntos e ficam
inline (abaixo de 6 arquivos de código cada, e são arquivos de dono compartilhado). Os quatro pacotes
delegados caem na faixa 6–14 da curva de custo (`spec-e-plano` §3); juntar P3a e P3b passaria de 15,
separá-los mais ficaria abaixo de 6. A migração só entra depois de P2 (P2m) para que `npm run tipos` feche em cada pacote: tirar as colunas do schema antes quebraria o que ainda as lê. P2 não se divide: a assinatura da fórmula compartilhada muda e a
API e a chamada do celular dependem dela no mesmo commit.

## P0 — contratos e constantes · agente principal (inline), onda 0

**Arquivos:** `packages/shared/src/contratos/ranking-regras.ts` (novo) e seu `export` no índice;
`packages/shared/src/formulas/regras-de-pontuacao.ts` (novo: os 9 gatilhos, grupo, ordem, rótulo, descrição,
quem lança, valor inicial e se nasce ligado).

- [ ] Contrato: `RegrasSaida` (`regras[{gatilho,pontos,ativo}]`, `eventos[{id,nome,inicio,fim,uniforme,pontosParticipacao,pontosUniforme,listaConcluida,foram|null}]`),
      `RegraEntrada` (`pontos` inteiro 0–1000, `ativo`), `RegraSaida`. **Sem** flags de permissão (o web usa `pode(...)`).
      Reaproveite o tipo de uniforme do contrato de calendário (`GALA|CAMPO`).
- [ ] Tabela de rótulos/valores iniciais com os textos **do mockup** (`modelo/Regras-de-Pontuacao.html`, constantes
      `R` e `G` do script; ignore o ramo `externo`, que é código morto).
- [ ] `npm run tipos` limpo. Nada de schema aqui.

> Se o Roberto cortar D5 e/ou D6, retire de P1 a parte de `clube-criar.ts` que para de criar `MANUAL`, e de P2m as
> linhas correspondentes (apagar `MANUAL`; as 3 colunas `ranking*` e o `DROP TYPE "PeriodoRanking"`). Nada mais depende delas.

## P1 — API: regras de pontuação · implementador, onda 1

**Entregar:** `GET /api/ranking/regras` e `PATCH /api/ranking/regras/:gatilho` (SPEC §4); `garantir` das 7
linhas básicas (função nova, mesma trava consultiva de `classe-biblica/criterios.ts`), usando as constantes
de P0; `clube-criar.ts` passa a semear pelas mesmas constantes e não cria `MANUAL`; saem `GET`/`PATCH
/classe-biblica/pontos`, o spec e o contrato `PontosCB*`.

**Critério de pronto:** SPEC §7, itens 1, 2, 3, 4 (lado da API: as rotas antigas dão 404), 10 e 12.

**Mapa (arquivos que ele altera):**
- `apps/api/src/ranking/regras/regras.controller.ts` (novo) — `@Logado()` no GET, com recusa `SEM_PERMISSAO` no serviço se `sessao.papel !== 'ADM'` (modelo: `cronogramas/montagem/servico-montagem.ts:352`); `@Pode('ranking.configurar')` no PATCH
- `apps/api/src/ranking/regras/regras.service.ts` (novo) — garante linhas (no GET **e dentro da transação do PATCH**, 404 se a contagem do `updateMany` for 0), lê, atualiza por (clubeId, gatilho, padrao); eventos: reaproveita `calendario/servico-eventos.ts` `doAno(clubeId, ano, true)` filtrando `tipo === 'EVENTO_ESPECIAL'` e `removidoEm` nulo (torne público o que precisar de `resumosDasListas :190`), ano por `hojeNoFuso` (`packages/shared/src/datas.ts:30`)
- `apps/api/src/ranking/regras/criterios-basicos.ts` (novo) — `garantirCriteriosBasicos`, com **chave própria** de trava consultiva e `nomeLivre` (`classe-biblica/criterios.ts:35-43`)
- `apps/api/src/ranking/regras/regras.spec.ts` (novo) — SPEC §7 critérios 1, 2, 3 e 12: inclui conselheiro/instrutor no GET → recusado, outro clube → 404, nome "Presença" já tomado, PATCH em clube sem linhas
- módulo do ranking (onde `ranking.controller.ts` está registrado) — registra o controller novo
- `apps/api/src/scripts/clube-criar.ts` — semeia pelas constantes; sem `MANUAL` (`:26-56`); e `clube-criar.spec.ts:5-26` passa a esperar 7 critérios
- `apps/api/src/classe-biblica/pontos.controller.ts` e `pontos.spec.ts` — **apagar** (modelo do que construir: `:13-59` e `:33-110`)
- `apps/api/src/classe-biblica/classe-biblica.module.ts` — tira o controller

**Não toca:** `packages/shared/src/contratos/classe-biblica.ts` (o `PontosCB*` sai em P3b, junto dos hooks e do handler MSW que o usam, para o `npm run tipos` fechar), `AdmConfiguracoes.tsx`, `AW/api/classe-biblica.ts` (P3b), nada de desconto (P2), nada do calendário.
**Gotchas:** `garantirCriterios` da Classe Bíblica já existe (`criterios.ts:12-32`): chame-o, não o copie. O
Jest da API não checa tipos. `foram` vem da lista de presença do evento (`PS/contratos/presenca-evento.ts`
descreve o resumo); só quando `listaConcluidaEm` não é nulo.
**Orçamento:** ~80 turnos.

## P2 — desconto por falta · implementador, onda 2

**Entregar:** SPEC §5.1, §5.2 e a regra desligada nas chamadas (D8, §4 último ponto). Fórmula sem `ConfigPontos` e sem o ramo FALTA; `PontosDoItem.gatilho` deixa de
aceitar 'FALTA'; envio da chamada e servidor de sync sem ler o desconto; **o servidor continua enviando
`descontarFalta:false` e `pontosDescontoFalta:0`**, marcados `@deprecated`, e o contrato os aceita como
opcionais; `ServicoPontos.sincronizar` falha com valor negativo e ganha a entrada opcional "conquistado mas desligado" (mantém o lançamento existente, nunca cria); o envio da chamada de reunião e a chamada da Classe Bíblica a preenchem; resumo da chamada do celular sem o parâmetro.

**Critério de pronto:** SPEC §7, itens 5, 6, 10 e 11.

**Mapa:**
- `packages/shared/src/formulas/pontos.ts` (`:26-29,43-51,65-71`) e `pontos.test.ts` (27 linhas citam) — remover config/FALTA
- `packages/shared/src/contratos/sync.ts` (`:66`) — campos opcionais e `@deprecated`
- `apps/api/src/sync/sync.service.ts` (`:67-68`) — monta os 2 campos como constantes; `sync.spec.ts`
- `apps/api/src/reunioes/reunioes-envio.service.ts` (`:318-345`) — sem `config` e sem o ramo FALTA; `reunioes.spec.ts` (6 linhas)
- `apps/api/src/pontos/servico-pontos.ts` (`:5-9,28-47`) — recusa negativo e mantém o conquistado-mas-desligado; `servico-pontos.spec.ts`: **reescrever o teste da `:106`** (hoje sincroniza −3 e passaria a falhar) para esperar a recusa, mais os testes da regra desligada
- `apps/api/src/classe-biblica/servico-chamada.ts` (`:187`, hoje filtra `ativo: true`) — preenche o conquistado-mas-desligado; teste em `chamada.spec.ts` (o `:181` só cita desconto no título do `it`: renomear)
- `apps/api/src/eventos-especiais/pontos-evento.spec.ts` (`:188` faz `configuracaoClube.update` com os campos do desconto) — ajuste de teste
- `apps/web/src/modulos/reunioes/chamada/estado.ts` (`:158-174`) — sem `config` em `resumir`
- `apps/web/src/testes/handlers/offline.ts` (`:23-24`) — fixture

**Não toca:** `AW/offline/pacote.ts` (continua válido), `PartesDaReuniao.tsx` (inofensivo), schema e migração (P2m). Requisito, especialidade e evento ficam como estão (SPEC §9).
**Gotcha crítico:** **não** remova os 2 campos do contrato nem pare de enviá-los (SPEC §5.2): o app instalado
valida o pacote com o contrato antigo e, sem os campos, fica com o pacote velho sem avisar.
**Orçamento:** ~90 turnos (14 arquivos, a maioria teste). As contagens de linhas citadas são aproximadas: use `grep -n` no arquivo, não o número.

## P2m — schema e migração · agente principal (inline), onda 2½

Só depois de P2, porque aí nada mais lê as colunas.

- [ ] `apps/api/prisma/schema.prisma`: tirar `descontarFalta`, `pontosDescontoFalta`, `rankingPeriodo`, `rankingNoLogin`,
      `rankingPorUnidade` (`:262-266`), o enum `PeriodoRanking` (`:87`, só a coluna `rankingPeriodo` o usa) e ajustar o comentário de `:775`.
- [ ] Migração (SPEC §5.3), nesta ordem: contar e `RAISE NOTICE` lançamentos `pontos < 0` não estornados; estorná-los;
      `DROP COLUMN` das 5 colunas e `DROP TYPE "PeriodoRanking"`; apagar `CriterioRanking` com `gatilho='MANUAL'` e `padrao`
      **sem** nenhum lançamento referenciando (a chave estrangeira é `Restrict`); `CHECK (pontos >= 0) NOT VALID`. Idempotente.
- [ ] `prisma generate` e `npm run tipos` limpos; teste da migração com 0 e com 2 lançamentos negativos, e com um lançamento
      (inclusive estornado) apontando para a regra `MANUAL` (SPEC §7 item 7). Comita junto de P2.

## P3a — web: tela nova · implementador, onda 3

**Entregar:** SPEC §3 inteira, conforme o mockup.

**Critério de pronto:** SPEC §7, itens 8 e 10.

**Leia as strings do script do mockup** (`modelo/Regras-de-Pontuacao.html`: `R`, `G`, `EV` e as funções `efeito`, `abrir`, `salvar`, `render`), não só a SPEC §3. O painel tem três textos de efeito (inclui "Desligada: <nome> deixa de dar ponto." e "Corrija o valor para ver o efeito."), o rótulo "Pontos por <nome em minúsculas>", o texto do evento sem permissão "Só quem edita o calendário pode mudar.", o botão Editar do evento também desabilitado sem conexão ("indisponível sem conexão") e o vazio "Os pontos de um evento especial são definidos ao criá-lo no calendário.". O mockup é o alvo.

**Mapa:**
- `apps/web/src/api/ranking-regras.ts` (novo) — `useRegras`, `useSalvarRegra` (TanStack Query; invalida e atualiza a lista)
- `apps/web/src/modulos/adm/ranking-regras/RegrasDePontuacao.tsx` (novo) — a página: resumo, grupos, estados
- `…/ranking-regras/LinhaDeRegra.tsx` e `…/GrupoDeEventos.tsx` (novos) — linha de regra fixa; lista de eventos com estado vazio
- `…/ranking-regras/PainelDaRegra.tsx` (novo) — `FolhaLateral` com campo, opção ligar/desligar, efeito, aviso e botões
- `…/ranking-regras/rotas.tsx` (novo) — exporta `rotasAdmRankingRegras` (rota `/adm/ranking/regras`); **não** edite `AW/rotas.tsx` (P0c)
- `apps/web/src/ui/CampoComPasso.tsx` (novo) — número inteiro com − e + de 48px, sufixo, erro e ajuda (não existe equivalente em `ui/`)
- `apps/web/src/testes/handlers/` — handlers MSW das 2 rotas novas
- `…/ranking-regras/RegrasDePontuacao.test.tsx` — os 4 grupos e textos do mockup; carregando, erro, sem conexão (lista em cache com Editar desabilitado), sem permissão; eventos vazio; resumo recalcula
- `…/ranking-regras/PainelDaRegra.test.tsx` — validação 0–1000 ao sair e ao salvar, − e +, Esc, foco, confirmação após salvar, falha de rede mantém aberto

**Não toca:** `AdmConfiguracoes.tsx` e `AW/api/classe-biblica.ts` (P3b), `AW/rotas.tsx`, `LayoutAdm.tsx` (P0c).
**Gotchas:** selo "Ligada/Desligada" com texto e ícone: **use `Selo`** (`ui/Selo.tsx:18`, já existe; há também `Chip.tsx` e `FaixaAviso.tsx`), nunca crie outro. Ícones de `lucide-react` (Pencil, ExternalLink, Check, Minus). Permissão no web: `pode('ranking.configurar')` e `pode('calendario.gerenciar')` de `ProvedorSessao.tsx:360-367`; nos testes use `criarEu(..., permissoes)` de `testes/handlers/sessao.ts:32` para provar o estado "sem permissão" (inalcançável no navegador: o Adm sempre tem as duas). O rótulo do uniforme do evento vem da mesma tabela do formulário do calendário (`NOME_CURTO_DO_UNIFORME`), não do texto "atividade" do mockup. Datas "sábado, 04/04/2026" e "21 a 23/08/2026": não há formatador de intervalo; crie um pequeno ao lado da tela e teste. Valor digitado: inteiro 0–1000. O link "Editar no calendário" usa `/adm/calendario/eventos/:id/editar` e só aparece com
`pode('calendario.gerenciar')`. Rótulos e descrições vêm da tabela de P0, não do `nome` do banco. Pisos de §3.6 valem
para o `CampoComPasso` também (toque ≥ 44px).
**Orçamento:** ~90 turnos.

## P3b — sair de Configurações, link no Ranking, e2e · implementador, onda 3

**Entregar:** SPEC §1 D2 e §3.1; critério de pronto SPEC §7 item 4 (lado do web) e 10.

**Mapa:**
- `apps/web/src/modulos/adm/configuracoes/AdmConfiguracoes.tsx` — remove a seção `secao-pontos-cb` (`:224-248`), `PontoDaClasseBiblica` (`:273-309`), os hooks e o rascunho (`:96-103`), o trecho que monta e salva os pontos junto (`:121-128` e o salvamento conjunto até ~`:215`); o botão "Salvar configurações" passa a salvar só a configuração
- `…/configuracoes/configuracoes.test.tsx` — apaga o `describe` dos pontos (`:102-171`); o que sobrar continua verde
- `apps/web/src/api/classe-biblica.ts` — remove `usePontosCB`/`useSalvarPontosCB` (`:289-303`) e o tipo `PontosCB` (`:43`)
- `apps/web/src/testes/handlers/classe-biblica.ts` — remove `PontosCBSaida` (`:18`), `criarPontosCB` (`:296`) e as rotas `/api/classe-biblica/pontos` (`:381-384`)
- `packages/shared/src/contratos/classe-biblica.ts` — **agora** remove `PontosCB*` (`:254-260`) e `GATILHOS_CB` se nada mais os usar (grep antes)
- `apps/web/src/modulos/ranking/Ranking.tsx` + teste — link "Regras de pontuação" → `/adm/ranking/regras` quando `pode('ranking.configurar')` (a tela não usa sessão hoje: importe o hook de `ProvedorSessao.tsx:360-367`); o teste cobre uma sessão Adm (link aparece) e uma de conselheiro (não aparece)
- `e2e/regras-de-pontuacao.spec.ts` (novo) — abre a tela, edita Presença, vê a confirmação. **Escrito e não executado** (e2e só no CI; este projeto não roda e2e no CI hoje — fechar a PR assim, sem perguntar de novo)

**Não toca:** a tela nova (P3a), `AW/rotas.tsx`, `LayoutAdm.tsx`.
**Gotcha:** o ramo `salvar` de Configurações usa `Promise` conjunta de configuração + pontos; confirme que o fluxo
que sobra ainda trata erro e validação como antes (os testes que ficam provam isso).
**Orçamento:** ~60 turnos.

## P0c — rota e menu · agente principal (inline), onda 3½

- [ ] `apps/web/src/rotas.tsx` (`:92-109`): espalhar `rotasAdmRankingRegras` na guarda do Adm.
- [ ] `apps/web/src/layouts/LayoutAdm.tsx` (`ITENS_ADM`, `:16-29`): item "Regras de pontuação" logo após "Ranking" (`:27`), com ícone + texto.
- [ ] Ícone de `lucide-react` (ex.: `ListChecks`), sempre com texto.
- [ ] `apps/web/src/layouts/layouts.test.tsx` (`:59-168` lista os itens do menu do Adm por nome): item novo e "Ranking" ainda em `/ranking`.

## P4 — fechamento · principal, onda 4

Nesta ordem (`rules/pr-pronta.md`), porque a revisão pode pedir mudança de código e a suíte seria jogada fora:

- [ ] **Push de revisão** (`gestor-pr`, "push de revisão", rascunho). Antes dele só o barato: `npm run tipos`, lint e os testes dos arquivos tocados.
- [ ] **Pergunte ao Roberto se quer validar localmente** (junto do push); sim → peça ao dono do ambiente que suba com o propósito `validar` e entregue URL e acesso, em destaque.
- [ ] **Revisão da PR inteira** (skill `code-review`, diff contra a base) até não restar Critical/Important; até 3 rodadas; consertos locais.
- [ ] **Gate = CI do GitHub** (`gh pr checks`); não rode a suíte local para declarar pronto. Falhou → um `saneador` com o conjunto todo, nunca um agente por erro. (e2e não roda: ver P3b.)
- [ ] **`documentador`** com a branch e a base: atualizar as docs vivas que citam o desconto e o desenho (lista na SPEC, §ONDE FICA, "docs vivas com desconto"), incluindo uma nota em `docs/design/LEIA-ME.md` e em `Adm-Ranking.dc.html` de que a tela antiga foi **substituída** pela de `docs/fases/ranking-pontuacao`; documentos históricos de fase não se editam.
- [ ] **QA** (`qa-roteiro` → `qa-runner`) com o roteiro abaixo; os pisos são medidos no DOM.
- [ ] `grep` do critério 5 da SPEC: nenhum arquivo de produção cita `descontarFalta`, `pontosDescontoFalta` ou `ConfigPontos`, exceto os 2 campos `@deprecated`.
- [ ] `gestor-pr`: subir o que falta e `gh pr ready`; reler `isDraft`. Antes do fechamento, `ambiente listar` e perguntar o destino de cada um.

### Roteiro de QA (um item por bloco do mockup)

| # | Item | Bloco do mockup |
|---|---|---|
| Q1 | Menu do Adm tem "Regras de pontuação" abaixo de "Ranking"; a migalha leva a `/ranking`; `/ranking` mostra o link para o Adm | menu e migalha |
| Q2 | Resumo: "N de 9 regras fixas estão ligadas" e "N pontos … reunião perfeita" batem com as regras ligadas do grupo da reunião | resumo |
| Q3 | Quatro grupos, na ordem e com os textos do mockup; Lição aparece Desligada; sem grupo de descontos | grupos |
| Q4 | Editar Presença: muda o valor, o resumo recalcula na hora, a confirmação cita o nome e o valor, a linha fica destacada | painel e confirmação |
| Q5 | Valor 1001, vazio, "abc" e "1,5": erro ao sair do campo, foco no campo, Salvar não envia | validação |
| Q6 | Desligar uma regra: selo vira Desligada, resumo cai, mensagem de "foi desligada" | liga/desliga |
| Q7 | Esc e clique fora fecham sem salvar; foco volta ao botão Editar | painel |
| Q8 | Classe Bíblica editável aqui; **ausente** em Configurações do clube | D2 |
| Q9 | Eventos: uma linha por evento especial do ano, selo, "mais N com uniforme de …", "N foram"; Editar leva ao formulário do evento certo | eventos |
| Q10 | Ano sem evento especial: estado vazio com "Criar evento no calendário". (Sem o botão por falta de `calendario.gerenciar`: **só teste de tela**, o Adm sempre tem a permissão) | vazio |
| Q11 | Sem `ranking.configurar`: aviso e sem botões Editar, com o texto da permissão. **Só teste de tela** (MSW com `criarEu`); não é alcançável no navegador | sem permissão |
| Q12 | Desligar a rede: lista segue visível, faixa de aviso, Editar desabilitado com motivo | sem conexão |
| Q13 | Forçar erro da API: "Não deu para carregar as regras" + Tentar de novo funciona | erro |
| Q14 | Pisos medidos no DOM: contraste ≥ 4,5:1, corpo ≥ 16px, toque ≥ 44px (inclui − e +), nada só por cor, foco visível, tudo por teclado | acessibilidade |
| Q15 | Chamada de reunião no celular com falta sem justificativa: nenhum ponto negativo no resumo nem no ranking | D4 |
| Q16 | Desligar Presença, reabrir uma chamada antiga e salvar: os pontos de Presença dos desbravadores continuam no ranking daquele mês | D8 |

### Gate

Revisão limpa (nenhum Critical/Important) **e** CI verde **e** QA sem FALHOU **e** os 12 critérios da SPEC §7.
A linha da PR no fechamento é a de `rules/pr-pronta.md`: "pronta para revisão · revisão limpa em N rodadas"
ou "RASCUNHO, porque …".

## O que não quebra (verificado)

- `ServicoPontos.sincronizar` segue a única escrita de lançamento; já tolera `criterioId` nulo.
- `servico-pontos-evento.ts` e o formulário de evento do calendário não mudam; os dois e2e que visitam
  `/ranking` (`classe-biblica.spec.ts:138-139`, `eventos-especiais.spec.ts:76-77`) conferem 10+5 e 20+10, que
  não mudam; nenhum e2e cita Configurações, critérios ou desconto.
- O app instalado (offline) continua aceitando o pacote: os campos do desconto seguem presentes (P2).
- O `versao` (hash) do pacote não muda por causa deles.

## Contrato de retorno (todo subagente)

Até 15 linhas: (1) pacote concluído; (2) arquivos tocados — **caminhos, nunca conteúdo**; (3) testes do
pacote: verdes e nomes que falharam; resultado do `npm run tipos`; (4) decisões que tomou sozinho, uma linha
cada; (5) pendências. Sem diff, sem trecho de código, sem recapitular a spec.

## Comando de execução

Cole numa sessão nova, na raiz do repositório:

```
Aja como orquestrador (skill orquestrador) e execute o plano de Regras de pontuação.

ONDE RODA: continue na worktree existente
  /home/robertogabrieu/desbravadores/.claude/worktrees/ranking-pontuacao
  branch spec/ranking-pontuacao, base d8663b4, PR em draft já aberto (a implementação entra nessa branch).
  Antes de começar: git fetch origin e confira git rev-list --count HEAD..origin/main.

LEIA PRIMEIRO (uma vez, inteiro):
  docs/fases/ranking-pontuacao/PLANO.md
  docs/fases/ranking-pontuacao/SPEC.md
  docs/fases/ranking-pontuacao/modelo/Regras-de-Pontuacao.html  (alvo visual; vence a SPEC; do mockup não se copia CSS)

DECISÕES TRAVADAS (não reabrir):
  - A tela edita as regras no painel; Classe Bíblica sai de Configurações e passa a ser editada só aqui.
  - Pontos de evento especial não são regra fixa: a tela lista os eventos e o Editar leva ao calendário.
  - Desconto por falta sai por inteiro, mas o servidor CONTINUA enviando descontarFalta=false e
    pontosDescontoFalta=0 no pacote offline (fase 2 fica fora deste plano).
  - Lançamentos negativos existentes são estornados na migração; CHECK (pontos >= 0) NOT VALID.
  - Rótulos e valores iniciais por gatilho vêm do compartilhado, não do campo nome do banco.
  - GET: @Logado com recusa no serviço para quem não é ADM; PATCH exige ranking.configurar. A API não devolve flags de permissão.
  - Regra desligada não estorna, nas chamadas (reunião e Classe Bíblica), o que o desbravador ainda conquista e já recebeu.
  - Quatro grupos na tela (reunião, aulas, Classe Bíblica, eventos). Não há grupo de descontos.

FORA DE ESCOPO: criar/apagar/reordenar regra, período do ranking, lançamento manual avulso, mexer no
  formulário de evento, remover os campos mortos do pacote offline.

COMO: P0, P2m e P0c você faz inline (arquivos compartilhados). P1, P2, P3a e P3b vão para o subagente
  implementador, um briefing por pacote com caminhos e papéis do mapa do PLANO, orçamento de turnos e a
  linha "GIT: não rode git". P3a e P3b podem ir em paralelo. Commit local por onda; push só no P4.

GATE E RETORNO: revisão limpa + CI verde (não rode a suíte local) + QA sem FALHOU + os 12 critérios da SPEC §7.
  Reporte no formato do passo 5 do orquestrador, com a linha da PR de rules/pr-pronta.md.
```

## ONDE FICA

Os ponteiros por assunto estão no bloco **ONDE FICA da [SPEC](SPEC.md)** (conferido em `d8663b4`);
cada briefing leva só as linhas do seu pacote, já copiadas nos "Mapa" acima. Confirme na faixa indicada
(`sed -n 'a,bp'`) antes de editar: o bloco diz onde olhar, não o que é verdade.
