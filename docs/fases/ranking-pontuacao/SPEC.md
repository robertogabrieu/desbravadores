# Regras de pontuação — Spec

Uma tela do Adm que reúne **tudo que dá ponto no ranking**, com o valor de cada regra e o jeito de
mudá-lo. Hoje a configuração está espalhada: só os 2 pontos da Classe Bíblica têm tela; os outros 7
critérios só mudam no banco; os pontos de evento ficam no formulário do calendário. Junto com a tela,
sai do sistema o **desconto por falta**: pontos só são acrescidos.

**O alvo visual é o mockup versionado ao lado**:
[modelo/Regras-de-Pontuacao.html](modelo/Regras-de-Pontuacao.html) (aprovado pelo Roberto). **Se a SPEC e
o mockup divergirem, o mockup vence** em estrutura, ordem e texto — nunca em CSS (o mockup tem estilo
próprio; as classes saem dos componentes de `apps/web/src/ui/`). Única exceção, já decidida: o menu
(§3.1).

Base: `d8663b4` · Branch: `spec/ranking-pontuacao` · Plano: [PLANO.md](PLANO.md).

## 1. Decisões travadas

Nenhuma se reabre na implementação. Cada uma diz o que se perderia na outra escolha.

| # | Decisão | Por que não a outra |
|---|---|---|
| D1 | A tela **edita** as regras que hoje não têm tela, num painel lateral. | Só conferir e linkar deixaria o clube sem como mudar 7 dos 9 valores. |
| D2 | Os 2 pontos da Classe Bíblica **saem** de Configurações do clube e passam a ser editados só aqui. | Dois lugares para o mesmo valor: ninguém sabe qual vale. |
| D3 | Pontos de **evento especial** não são regra fixa: cada evento tem os seus (por ir, por uniforme), definidos no formulário do calendário. A tela os **lista** e o "Editar" leva ao calendário. | Editar no painel duplicaria a regra de refazer pontos já lançados que o formulário do evento já tem. |
| D4 | **Desconto por falta sai por inteiro** (tela, fórmula, contrato, banco). Ponto nunca é negativo. | Só esconder deixaria código pronto para descontar se alguém ligasse no banco. |
| D5 | A regra antiga "Participação em evento" (+20, gatilho `MANUAL`) deixa de ser criada e a existente é removida quando nenhum lançamento a referencia. Nenhum código de produção a lê. | Fica no banco parecendo valer. |
| D6 | As 3 colunas de ranking sem uso (período, no login, por unidade) são removidas. | Sugerem uma configuração que não existe. |
| D7 | Rótulo, descrição, grupo e ordem de cada regra são **fixos por gatilho, no código compartilhado**, não vêm do campo `nome` do banco. | O `nome` do banco varia (sufixo quando já existe) e não é editável. |
| D8 | Editar uma regra **vale daqui em diante**. Mudar o **valor** já é assim (`ServicoPontos.sincronizar` mantém o valor da época). **Desligar** hoje não é: ao reabrir e salvar uma chamada antiga, a regra desligada some dos pontos devidos e o lançamento é estornado (`servico-pontos.ts:33`, `pontos.ts:60-62`). Passa a valer: **nas chamadas (reunião e Classe Bíblica), regra desligada não estorna o que o desbravador ainda conquista na marcação e já recebeu, e não cria ponto novo.** | Deixar como está tornaria falsa a frase que a tela promete ("o que já foi lançado não mudou") e tiraria pontos do ranking de meses fechados sem ninguém perceber. |
| D9 | `GET` é `@Logado()` com recusa no serviço para quem não é `ADM` (mesmo padrão de `servico-montagem.ts:352`); `PATCH` exige `@Pode('ranking.configurar')`. A API **não** devolve flags de permissão: o web usa `pode(...)` da sessão (`ProvedorSessao.tsx:360-367`). | `@Logado()` sozinho deixaria conselheiro e instrutor lerem as regras; exigir `ranking.configurar` no GET impediria de conferir quem só vê. |
| D10 | O "Editar no calendário" só aparece quando `pode('calendario.gerenciar')`; sem ela, o texto do mockup. | Oferecer link que dá 403. Nota: o Adm sempre tem as duas permissões ("ADM não aceita ajuste", `permissoes.ts`), então os estados sem permissão só são alcançáveis em teste de tela, não no navegador. |

## 2. Escopo

**Dentro:** tela nova; API de leitura/edição das regras; remoção da seção de Classe Bíblica em
Configurações e das rotas antigas de pontos da Classe Bíblica; remoção do desconto; limpeza do que
D5/D6 pedem; docs.

**Fora (não conserte de passagem):**
- Criar, apagar ou reordenar regra (critério personalizado). Não existe hoje e continua não existindo.
- Período do ranking (hoje sempre mensal) e abas Trimestre/Ano do ranking.
- Lançamento manual avulso de ponto.
- Mexer no formulário de evento do calendário ou no cálculo do ranking.
- Remover os campos do desconto do contrato do pacote offline (fase 2, §5.2).

## 3. A tela

Rota `/adm/ranking/regras`, módulo novo `apps/web/src/modulos/adm/ranking-regras/`.

### 3.1 Entrada e navegação
- Item novo no menu do Adm, **logo abaixo de "Ranking"**: "Regras de pontuação" (o menu não tem
  subitens, então o mockup, que mostra só "Ranking" ativo, é a exceção). Na tela, a migalha
  "Ranking › Regras de pontuação" leva a `/ranking`.
- Na tela `/ranking`, para o Adm, um link "Regras de pontuação" (descoberta por quem chega pelo ranking).

### 3.2 Conteúdo (ordem do mockup)
1. Título "Regras de pontuação" e a frase de apoio do mockup.
2. **Resumo:** "N de 9 regras fixas estão ligadas" e "N pontos é o que um desbravador ganha numa
   reunião perfeita" (soma das regras **ligadas** do grupo "Na reunião de domingo").
3. Quatro grupos, nesta ordem, cada um com título e a linha "Quem lança":
   - **Na reunião de domingo** (conselheiro, na chamada): Presença, Pontualidade, Uniforme completo, Bíblia, Lição ou devocional em dia.
   - **Nas aulas** (instrutor): Requisito de classe concluído, Especialidade concluída.
   - **Na Classe Bíblica** (responsável pela chamada): Presença na Classe Bíblica, Participação ativa na Classe Bíblica.
   - **Em eventos especiais**: uma linha por evento (§3.4).
   O mockup é a fonte dos textos de cada linha. Não há grupo de descontos.
4. Cada regra fixa: selo **Ligada/Desligada** (texto + ícone, nunca só cor), nome, descrição,
   "+N pontos", botão **Editar** (com texto; `aria-label` "Editar <nome>").

### 3.3 Painel de edição (`FolhaLateral`)
Abre ao tocar Editar. Conteúdo, nesta ordem (como no mockup): "Lançado por …", título, descrição;
campo **Pontos** com botões − e + de 48px e sufixo "pontos"; opção **"Esta regra dá ponto"**
(liga/desliga; o valor fica guardado ao desligar); caixa "Uma reunião perfeita vai de X para Y pontos"
(só nas regras da reunião; nas outras, "Cada vez que isso acontecer, o desbravador ganha N pontos"),
que se atualiza ao digitar; logo acima do botão, a frase **"Vale a partir de agora. Os pontos que já
foram lançados não mudam."**; botão primário **"Salvar pontos"** e "Cancelar".
- Validação ao sair do campo e ao salvar: inteiro de 0 a 1000; erro "Use um número inteiro entre 0 e 1000."
  junto do campo, com foco nele. Salvar com erro não envia.
- Esc e clique fora fecham (sem salvar). Foco inicial no campo de pontos; ao fechar, volta ao botão Editar.
- Ao salvar: painel fecha, a linha fica destacada, e aparece no topo a confirmação:
  "<Nome> agora vale N pontos. Vale a partir de agora; o que já foi lançado não mudou." (ou, se desligada:
  "<Nome> foi desligada. Ninguém mais ganha ponto por isso a partir de agora."). O resumo recalcula.
- `Botao` com `carregando` durante o envio; falha de rede ou 5xx mantém o painel aberto com a mensagem
  de erro acima do botão.

### 3.4 Eventos especiais
Uma linha por evento especial do **ano civil corrente (fuso do clube)**, por data de início. Cada linha:
selo "Pontos lançados" (lista concluída) ou "Ainda vai ser"; nome; data; "mais N pontos com o uniforme
de <tipo>"; se concluído, "· N foram"; "+N por ir"; ação **"Editar no calendário"** →
`/adm/calendario/eventos/:id/editar`. Sem evento: estado vazio "Nenhum evento especial neste ano" com
botão "Criar evento no calendário" (`/adm/calendario/eventos/novo`; só com `calendario.gerenciar`).

### 3.5 Estados (os quatro do CLAUDE.md, mais um)
- **Carregando:** esqueleto de linhas, com `aria-busy` e rótulo "Carregando as regras".
- **Erro:** "Não deu para carregar as regras" + "Nada foi alterado…" + **Tentar de novo**.
- **Sem conexão:** com dados em cache, a lista aparece, a faixa do mockup avisa, e os botões Editar ficam
  desabilitados com o motivo; sem dados, `DisponivelComInternet`. (O mockup vence o padrão de esconder tudo.)
- **Sem permissão para editar** (`!pode('ranking.configurar')`; defensivo, coberto só por teste de tela): aviso "Você pode conferir tudo, mas não editar…", e no
  lugar de cada Editar, "Só quem tem a permissão “Configurar o ranking” pode editar."
- **Vazio:** só os eventos podem estar vazios (§3.4). As 9 regras sempre existem.

### 3.6 Pisos de acessibilidade (medidos no DOM na QA)
Contraste ≥ 4,5:1; letra de corpo ≥ 16px; área de toque ≥ 44px; nada só por cor; foco visível; tudo
operável por teclado; nenhum elemento `fixed`/`sticky` novo além do painel (que usa `FolhaLateral`).

## 4. API

Módulo em `apps/api/src/ranking/regras/`. Contratos em `packages/shared/src/contratos/ranking-regras.ts`
(zod; o web e a API importam dele — CLAUDE.md).

**Gatilhos fixos (9):** `PRESENCA, PONTUALIDADE, UNIFORME, BIBLIA, LICAO, REQUISITO, ESPECIALIDADE,
CLASSE_BIBLICA_PRESENCA, CLASSE_BIBLICA_PARTICIPACAO`. O compartilhado exporta, por gatilho: grupo, ordem,
rótulo, descrição, quem lança e valor inicial (Presença 10, Pontualidade 5, Uniforme 5, Bíblia 3, Lição 3
**desligada**, Requisito 4, Especialidade 15, Classe Bíblica 10 e 5).

- `GET /api/ranking/regras` → `{ regras: [{ gatilho, pontos, ativo }], eventos: [...] }`. Quem não é `ADM` recebe a
  recusa padrão (`SEM_PERMISSAO`). Antes de ler, **garante as linhas**: as 2 da Classe Bíblica (função existente) e
  as 7 básicas (função nova, **com chave própria** de trava consultiva e `nomeLivre` como em
  `classe-biblica/criterios.ts:35-43`, porque `(clubeId, nome)` é único e um critério personalizado chamado
  "Presença" derrubaria o GET com 500). Clubes antigos podem não ter as 7 (as migrations nunca as
  criaram). Cada evento: `id, nome, inicio, fim, uniforme, pontosParticipacao, pontosUniforme,
  listaConcluida, foram` (`foram` nulo se a lista não foi concluída). **Só `tipo = EVENTO_ESPECIAL` e `removidoEm` nulo**;
  reaproveita `doAno(clubeId, ano, true)` (`servico-eventos.ts:167`, `resumosDasListas :190`) em vez de refazer a regra do
  `foram`; o ano civil vem de `hojeNoFuso` (`packages/shared/src/datas.ts:30`).
- `PATCH /api/ranking/regras/:gatilho` com `{ pontos: 0..1000 inteiro, ativo: boolean }`, `@Pode('ranking.configurar')`
  → `{ gatilho, pontos, ativo }`. Gatilho fora dos 9 → 404. Roda a mesma **garantia das linhas** dentro da transação
  (clube antigo que edita antes de qualquer GET não leva 404 indevido) e atualiza só `(clubeId, gatilho, padrao: true)`;
  contagem 0 → 404; outro clube → 404 (nunca 403, CLAUDE.md).
- **Saem:** `GET`/`PATCH /api/classe-biblica/pontos` e o contrato `PontosCB*`. Web e API sobem juntos.
- `scripts/clube-criar.ts` passa a semear as 7 básicas **pelas mesmas constantes** (fonte única) e deixa de
  criar a regra `MANUAL` (`clube-criar.spec.ts` passa a esperar 7).
- **Regra desligada nas chamadas (D8):** `ServicoPontos.sincronizar` ganha uma entrada opcional com os pontos que o
  desbravador **conquistou na marcação mas cuja regra está desligada**. Quem já tem lançamento ativo por eles é
  mantido (valor da época); nenhum novo é criado. Quem deixou de conquistar (a marcação mudou) é estornado como hoje.
  Quem chama: envio da chamada de reunião e chamada da Classe Bíblica. Requisito, especialidade e evento ficam
  como estão (§9).

## 5. Remoção do desconto por falta

### 5.1 O que sai
Fórmula (`ConfigPontos`, parâmetro `config`, ramo FALTA), contrato do pacote offline, leitura no envio da
chamada, no servidor de sync e no resumo da chamada do celular, colunas `descontarFalta` e
`pontosDescontoFalta`, testes e docs vivas. `ServicoPontos.sincronizar` passa a **recusar** pontos
negativos (guarda no código) e o banco ganha `CHECK (pontos >= 0) NOT VALID` em `LancamentoPontos`
(vale só para linhas novas).

### 5.2 Duas fases, por causa do app offline
O app instalado valida o pacote com o contrato antigo, que **exige** os dois campos do desconto; se o
servidor parar de enviá-los, a validação falha e o app **segue com o pacote velho, sem aviso**
(`offline/pacote.ts:33-35`). Então:
1. **Esta entrega:** o contrato aceita os campos como opcionais e o servidor continua enviando
   `descontarFalta: false` e `pontosDescontoFalta: 0` (valores mortos, marcados `@deprecated`). Nenhum
   código lê esses campos.
2. **Depois, em entrega própria** (fora deste plano): remover os campos quando os apps instalados já
   estiverem na versão desta entrega. Fica **declarado como resíduo**, não como passo.

### 5.3 Migração (uma, em `apps/api/prisma/migrations`)
Ordem: (a) contar e registrar (`RAISE NOTICE`) lançamentos com `pontos < 0` não estornados; (b) **estornar**
esses lançamentos (`estornadoEm = now()`), porque a regra de produto é "só acrescenta" — o ranking já
ignora estornados; (c) `DROP COLUMN` das 2 colunas do desconto e das 3 sem uso, e `DROP TYPE "PeriodoRanking"` (só a coluna `rankingPeriodo` o usa; sem isso o próximo `migrate dev` gera um `DROP TYPE` espúrio); (d) apagar a linha
`MANUAL` padrão de cada clube **só se nenhum lançamento a referencia**; (e) `CHECK (pontos >= 0) NOT VALID` (sem `VALIDATE`: os negativos antigos, se houver, ficam como histórico estornado; o Prisma não modela nem apaga CHECK, e o repositório já tem CHECK à mão em outras migrações).
Idempotente. Se o banco não tiver nenhum lançamento negativo (o esperado: o desconto nasce desligado e
não tinha tela), (a) e (b) não mudam nada. O valor `MANUAL` do enum permanece (Postgres não remove valor de enum).

## 6. As quatro perguntas de UX

- **Pré-requisitos.** Nenhum para ver. Clube antigo sem as 7 linhas básicas: a API as cria na leitura (§4);
  a tela nunca mostra "vazio" por isso.
- **Vazio.** Só em eventos especiais: ensina como os pontos de evento nascem e oferece o próximo passo
  (criar evento), se o perfil puder.
- **Bloqueio.** "Sem permissão para editar" é estado impossível para o perfil: o texto basta e diz qual
  permissão falta. "Sem conexão" é estado impossível: o texto diz que volta ao ligar a internet.
- **Perfil e escopo.** Tudo é do clube (`clubeId`); Adm vê; `ranking.configurar` edita; `calendario.gerenciar`
  libera os links do calendário. A tela não afirma ausência global (ela só vê o próprio clube).

## 7. Critérios de pronto (cada um se verifica por teste, comando ou medição)

1. `GET /api/ranking/regras` em clube com **nenhuma** linha de critério devolve as 9 regras com os valores
   iniciais e cria as linhas (teste de API).
2. `GET` por conselheiro e por instrutor → recusado; `PATCH` atualiza só o clube do usuário; clube alheio → 404; sem `ranking.configurar` → 403; pontos
   fora de 0–1000 ou não inteiro → 400; gatilho fora dos 9 → 404 (testes de API, incluindo isolamento por clube).
3. Mudar o valor de Presença não altera lançamentos antigos e vale na próxima chamada (teste de API).
4. A seção "Pontos da Classe Bíblica" não existe mais em Configurações; os 4 testes dela migram para a
   tela nova; `GET`/`PATCH /classe-biblica/pontos` respondem 404 (teste).
5. Nenhum arquivo de produção cita `descontarFalta`, `pontosDescontoFalta`, `ConfigPontos` nem o ramo FALTA,
   exceto os 2 campos `@deprecated` do contrato do pacote (`grep` no gate).
6. Chamada com falta (sem justificativa) não gera lançamento nenhum; `ServicoPontos.sincronizar` com valor
   negativo falha (testes).
7. A migração roda em banco com 0 e com 2 lançamentos negativos (teste de migração ou fixture): no segundo
   caso eles ficam estornados e o ranking não os soma.
8. Tela: os 4 grupos, os selos, os textos e a ordem do mockup; painel com os comportamentos de §3.3;
   quatro estados + sem permissão (testes de tela com MSW).
9. QA no navegador (roteiro no PLANO) com os pisos de §3.6 **medidos no DOM**, nunca por olhar print.
10. `npm run tipos` limpo (o Jest da API não checa tipos) e os testes dos arquivos tocados verdes.
11. **Regra desligada, chamada reaberta:** Presença desligada, chamada antiga reaberta e salva com o desbravador presente →
    o lançamento de Presença continua; mudar a marcação para falta o estorna; regra desligada sem lançamento prévio
    não cria ponto (testes de API da reunião e da Classe Bíblica).
12. Critério personalizado já chamado "Presença" não derruba o GET (teste de `nomeLivre`); `PATCH` em clube sem as
    linhas as cria e atualiza.

## 8. O que não quebra (verificado)

- `ServicoPontos.sincronizar` continua a única escrita de `LancamentoPontos`; aceita `criterioId` nulo (o
  código tolera) — não mexemos.
- Os pontos de evento especial seguem pelo calendário; `servico-pontos-evento.ts` não muda.
- Os dois e2e que visitam `/ranking` conferem 10+5 e 20+10, valores que não mudam.
- Nenhum e2e cita Configurações do clube, critérios ou desconto.
- O `versao` (hash) do pacote offline não muda por causa do desconto: os 2 campos continuam no pacote com
  valores constantes (§5.2).

## 9. Resíduos declarados

- Campos mortos do desconto no contrato do pacote offline (§5.2, fase 2).
- Requisito, especialidade e evento: desligar a regra e depois desfazer/refazer o mesmo item ainda estorna (comportamento
  atual; só as chamadas ganham D8).
- Evento que cruza a virada do ano (ex.: 30/12 a 02/01) aparece na lista do ano em que **começa**; um evento de dezembro
  com a lista ainda aberta some da tela em 1º de janeiro e continua acessível pelo calendário.
- Documentos históricos de fase (`docs/fases/fase-0`, `fase-1`, `eventos-especiais`) continuam citando o
  desconto: são registro de decisão antiga; só as docs vivas e o desenho antigo `Adm-Ranking.dc.html` são
  atualizados.
- Não há como saber, deste ambiente, se algum clube de produção tem lançamento negativo; a migração
  trata os dois casos (§5.3) e registra a contagem no log.

## ONDE FICA

Conferido em `d8663b4`. Caminhos relativos à raiz; `AC` = `apps/api/src`, `AW` = `apps/web/src`,
`PS` = `packages/shared/src`.

- critérios e lançamentos (modelos) — `apps/api/prisma/schema.prisma:677-696` (CriterioRanking, único
  parcial por gatilho com `padrao`), `:774-799` (LancamentoPontos, `estornadoEm`, sem trava de sinal), enum de gatilhos `:93-106`
- colunas a remover — `apps/api/prisma/schema.prisma:262-266`; criadas em `apps/api/prisma/migrations/20260929174342_fase0_fundacao/migration.sql:65-69`; última migração: `20261011120000_eventos_especiais`
- rota/serviço de pontos da Classe Bíblica (a sair; modelo para a nova) — `AC/classe-biblica/pontos.controller.ts:13-59`, teste `AC/classe-biblica/pontos.spec.ts:33-110`, módulo `AC/classe-biblica/classe-biblica.module.ts`
- garantir linhas — `AC/classe-biblica/criterios.ts:12-32`, `AC/eventos-especiais/criterios.ts:4-34`; semente dos 8 — `AC/scripts/clube-criar.ts:26-56` (regra `MANUAL` em `:35`)
- contrato antigo — `PS/contratos/classe-biblica.ts:12-13,254-260`; hooks web — `AW/api/classe-biblica.ts:43,289-303`
- permissões — `PS/permissoes.ts:11-40` (`ranking.lancar_manual :26`, `calendario.gerenciar :30`, `ranking.configurar :32`, `clube.configurar :34`)
- fórmula do desconto — `PS/formulas/pontos.ts:26-29,39,43-51,65-71`; teste `PS/formulas/pontos.test.ts`
- contrato do pacote offline — `PS/contratos/sync.ts:57-59,66`; cliente — `AW/offline/pacote.ts:14-35`
- servidor de sync — `AC/sync/sync.service.ts:44-47,67-68`; envio da chamada — `AC/reunioes/reunioes-envio.service.ts:318-345`; serviço — `AC/pontos/servico-pontos.ts:5-9,28-47`
- chamada no celular — `AW/modulos/reunioes/chamada/estado.ts:158-174`; detalhe — `AW/modulos/reunioes/detalhe/PartesDaReuniao.tsx:61`; fixture — `AW/testes/handlers/offline.ts:23-24`
- testes que citam o desconto — `AC/reunioes/reunioes.spec.ts`, `AC/sync/sync.spec.ts`, `AC/eventos-especiais/pontos-evento.spec.ts`, `AC/classe-biblica/chamada.spec.ts:181`, `AC/pontos/servico-pontos.spec.ts:106`
- seção a remover — `AW/modulos/adm/configuracoes/AdmConfiguracoes.tsx:96-103,121-128,224-248,273-309`; testes — `AW/modulos/adm/configuracoes/configuracoes.test.tsx:102-171`
- rotas e menu do Adm — `AW/rotas.tsx:92-109`, `AW/layouts/LayoutAdm.tsx:16-29` (Ranking em `:27`), `AW/layouts/ItemNavegacao.tsx:5-12`
- componentes — `AW/ui/FolhaLateral.tsx:5-9`, `Interruptor.tsx:15`, `Campo.tsx:44-51`, `Botao.tsx:23-27`, `EstadoVazio.tsx:3-10`, `EstadosDeCarga.tsx:10,25,30`, `Confirmacao.tsx:5-13`; sem conexão — `AdmConfiguracoes.tsx:55-59`; não existe campo numérico com passo
- calendário — rotas `AW/modulos/adm/calendario/rotas.tsx:8-12`; contrato `PS/contratos/calendario.ts:22-23,41-42`; lista de presença `PS/contratos/presenca-evento.ts:34,52,65`
- docs vivas com desconto — `docs/planejamento/MODELO-DE-DADOS.md:21-23,265`, `API.md:194,198`, `BACKLOG.md:41,95,337`, `INCONSISTENCIAS.md:58`, `VISAO.md:39`, `docs/design/LEIA-ME.md:114` (a `:78` só descreve a tela antiga); `ROADMAP.md:109` cita a configuração do ranking sem desconto: conferir, `docs/design/telas/Adm-Ranking.dc.html:68,72`
- desligar e estornar — `PS/formulas/pontos.ts:60-62`, `AC/pontos/servico-pontos.ts:33`, `AC/reunioes/reunioes-envio.service.ts:327-330`, `AC/classe-biblica/servico-chamada.ts:187`
- guarda de papel no serviço — modelo: `AC/cronogramas/montagem/servico-montagem.ts:352`; decoradores: `AC/ranking/ranking.controller.ts:14-23`
- eventos do ano — `AC/calendario/servico-eventos.ts:167,190`; ano no fuso — `PS/datas.ts:30`; rótulos de uniforme do formulário — `AW/modulos/adm/calendario/FormularioEvento.tsx` (`NOME_CURTO_DO_UNIFORME`); enum `GALA|CAMPO` — `schema.prisma:143`
- permissão no web — `AW/…/ProvedorSessao.tsx:360-367` (`pode`), `AW/testes/handlers/sessao.ts:32` (`criarEu`)
- já existem em `AW/ui/`: `Selo.tsx`, `Chip.tsx`; ícones de `lucide-react` (como `LayoutAdm.tsx:1`)
- testes extras afetados — `AC/scripts/clube-criar.spec.ts:5-26`, `AW/testes/handlers/classe-biblica.ts:18,296,381-384`, `AW/layouts/layouts.test.tsx:59-168`
- enum a remover junto — `schema.prisma:87` (`PeriodoRanking`)
- regras do repositório — `CLAUDE.md` (38 linhas)
