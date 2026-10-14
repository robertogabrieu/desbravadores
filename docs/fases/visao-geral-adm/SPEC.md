# Visão geral do Adm: atalhos do dia a dia — SPEC

A visão geral do Adm (`/adm`) hoje é um relatório: cinco números do clube, progresso por classe,
atividade recente e a lista de unidades com frequência (`apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:284-326`).
Quem abre a tela para resolver algo precisa ir a outro lugar. Esta SPEC troca o conteúdo por
**atalhos para o que o Adm faz toda semana e por pendências que ele pode resolver na hora**. Os
números e gráficos ficam para a tela de Relatórios (item A11 do backlog, `docs/planejamento/BACKLOG.md:344`).

O desenho aprovado está em [`mockup.html`](mockup.html). **Ele é o alvo:** se esta SPEC e o
desenho divergirem, vale o desenho. Dele se copia estrutura, ordem e texto, **nunca CSS** — as
classes saem dos tokens e de `apps/web/src/ui/` (`Cartao`, `Botao`/`estiloDoBotao`, `Selo`,
`LinhaQueNavega`, `FolhaLateral`, `EstadoVazio`, `EstadosDeCarga`).

| Bloco do desenho | O que é | Onde |
|---|---|---|
| Atalhos (3 botões) | gerar link de substituto, novo evento, chamada da Classe Bíblica | `Conteudo` da `VisaoGeral` |
| Próximo evento | cartão com data, nome, horário | idem |
| Pendências | duas listas: classes sem cronograma; unidades sem chamada | idem |
| Ranking das unidades | as 5 primeiras | idem |
| Folha "Qual chamada lançar?" | escolha quando há mais de uma chamada pendente; versão vazia | aberta pelo 3º atalho |

Menu lateral, barra do topo e gaveta do celular **não mudam**.

## Decisões travadas (discutidas com o usuário; não se reabrem)

1. **Ordem = importância**, de cima para baixo e igual no celular: link de substituto, novo
   evento, chamada da Classe Bíblica, próximo evento, classes sem cronograma, unidades sem
   chamada, prévia do ranking.
2. **Só o primeiro atalho é verde.** Os outros dois são brancos com contorno.
3. **Saem da tela:** os 5 números do clube, progresso por classe, atividade recente, lista de
   unidades com frequência, "Cronogramas aguardando publicação", "Eventos sem lista de presença"
   e "Precisa de atenção".
4. **"Lançar chamada da Classe Bíblica" abre a chamada direto** quando há uma só pendente; com
   várias, abre uma folha curta para escolher; sem nenhuma, a folha diz que não há e leva às edições.
5. **Pendências em tom de alerta**, nunca na cor verde de ação. Bloco sem pendência não some:
   mostra "tudo em dia".

## Decisões tomadas pelo autor da spec (o usuário pode reverter)

| # | Decisão | Alternativa e o que o Adm veria |
|---|---|---|
| D1 | **"Última reunião" = o último dia de reunião do calendário do clube estritamente antes de hoje**, no fuso do clube (`diasDeReuniao`, `packages/shared/src/contratos/calendario.ts:49`, `packages/shared/src/formulas/calendario.ts:82`, que não conhece "hoje"). A reunião de hoje só passa a valer na manhã seguinte. | Incluir hoje: no domingo de manhã, antes de qualquer chamada, **todas** as unidades apareceriam como pendentes. Usar a data da última reunião que alguém lançou: se nenhuma unidade lançou nada, o bloco apontaria uma reunião antiga e diria "tudo em dia". |
| D2 | **"Classe sem cronograma" = classe ativa sem nenhum cronograma no ano do clube** (modelo `Cronograma`, `apps/api/prisma/schema.prisma:921`, uma linha por classe e ano). Cronograma em rascunho ou enviado já conta como existente. | Contar só os **publicados**: a classe com rascunho esquecido apareceria na lista, com a mesma ação "Montar". |
| D3 | **A chamada pendente da Classe Bíblica vem do servidor**, em campo novo da visão geral. | Reaproveitar o pacote offline do conselheiro (`chamadasPendentesCB`, `modulos/inicio/CartaoClasseBiblica.tsx:38`): se o pacote ainda não foi baixado no aparelho do Adm, o botão diria "nenhuma pendente" quando há. |
| D4 | **"Próximo evento" também vem em campo novo da visão geral**, não do hook do calendário. | `useCalendario(ano)` (`apps/web/src/api/calendario.ts:19`): na virada do ano precisaria de uma segunda chamada. |
| D5 | **O ranking mostra a média de pontos por desbravador**, que é o que a API devolve (`mediaPontos`, `packages/shared/src/contratos/ranking.ts:25`; o hook é `apps/web/src/api/ranking.ts:25`); o desenho original dizia "pts" sem dizer de quê, e foi corrigido. | Mostrar o total de pontos exigiria mudar a API do ranking. |
| D6 | **"Novo desbravador" sai da tela inicial** (hoje é botão do cabeçalho, `VisaoGeral.tsx:345`). O cadastro continua em "Desbravadores" no menu. | Mantê-lo no cabeçalho: o Adm teria um 4º atalho que ele não listou entre os mais usados. |
| D7 | **A API continua devolvendo os campos antigos** da visão geral; só a tela deixa de usá-los. Eles alimentam a tela de Relatórios depois. | Apagá-los agora: o Relatórios teria de recriar as mesmas consultas. |
| D8 | **Linha de unidade sem chamada leva à ficha da unidade** (`/adm/unidades/:id`). Não existe tela do Adm para lançar chamada de uma unidade que ainda não teve reunião registrada. | Criar essa tela: é outra SPEC. |

## Requisitos e critérios de pronto

### R1. Atalhos
- Três botões na ordem do desenho; no computador lado a lado e quebrando linha; no celular um por
  linha, largura total. Altura mínima 56px.
- "Gerar link de substituto": **o comportamento continua o mesmo** (abre a escolha de unidade ou
  classe; se não houver nenhuma, a orientação que já existe), mas **o componente muda de forma**: hoje
  é um `Cartao` com botão secundário que abre um painel dentro da página (`AtalhoDeSubstituto.tsx:34-69`);
  passa a ser um botão primário de 56px, na fila dos três, que abre a escolha em folha (`FolhaLateral`),
  como a folha da chamada. Os dados continuam vindo de `unidadesResumo` e `progressoClasses` (D7).
- "Novo evento no calendário": leva a `/adm/calendario/eventos/novo`
  (`apps/web/src/modulos/adm/calendario/rotas.tsx:9`), com o mesmo estado de volta que o resto da
  tela usa (`adm/navegacao.ts`), de modo que o "voltar" da tela de evento retorna à visão geral.
- "Lançar chamada da Classe Bíblica": ver R2.
- O Adm tem todas as permissões e elas não aceitam ajuste (`packages/shared/src/permissoes.ts:62-64`);
  portanto os três botões **sempre aparecem**.
- **Pronto quando:** teste de tela acha os três botões pelo nome acessível, na ordem; só o
  primeiro tem o estilo `primario`; cada um leva ao destino acima.

### R2. Chamada da Classe Bíblica
- Dado novo em `GET /api/visao-geral`: lista de pares (encontro, grupo) **sem chamada registrada**,
  de encontros com data **de hoje até 7 dias atrás** (a janela de `chamadasPendentesCB`,
  `CartaoClasseBiblica.tsx:22,38`), para **todos os grupos** (o Adm vê todos,
  `apps/api/src/classe-biblica/escopo-grupos.ts:53,66`). Ordem: encontro mais recente primeiro, depois
  nome do grupo (o cartão do conselheiro ordena do mais antigo; aqui o mais recente vem na frente porque é o que o Adm quer resolver).
- **A regra completa não está em `chamadasPendentesCB`** (que só corta por data), e sim na montagem do
  pacote (`apps/api/src/sync/pacote-classe-biblica.service.ts:35-60`). Devem valer os mesmos filtros:
  encontro **não cancelado**; só **edição terminada**; só grupo **não removido** (`escopo-grupos.ts:57`);
  a data do encontro é a **efetiva** (um encontro remarcado vale pela data nova); par "sem chamada" =
  sem linha em `ChamadaClasseBiblica`. Sem esses filtros o botão levaria a chamadas que a API recusa.
- Grupo sem desbravadores na data **conta**, como no pacote do conselheiro; o servidor aceita chamada vazia.
- Como o isolamento entre clubes não vale em `include` aninhado (`CLAUDE.md`), a consulta segue o modelo do
  pacote: **consultas separadas, cada uma com `clubeId`**.
- O botão que leva direto à chamada usa o mesmo estado de volta de "Novo evento" (R1), para o "voltar" retornar à visão geral.
- Exatamente **1 par**: o botão leva a `/adm/classe-biblica/encontros/<encontro>/grupos/<grupo>/chamada`
  (`adm/classe-biblica/rotas.tsx:37`; o caminho já se monta em `PainelEdicao.tsx:28`).
- **2 ou mais**: abre a folha "Qual chamada lançar?" (`FolhaLateral`), uma linha por par com nome do
  grupo e "Encontro de domingo, 11/10" (dia da semana e data); cada linha leva à chamada daquele par.
- **Nenhum**: abre a folha "Nenhuma chamada pendente", com "As chamadas dos últimos 7 dias estão
  lançadas." e o botão "Ver edições da Classe Bíblica" (→ `/adm/classe-biblica`).
- Em ambas as folhas "Fechar" é botão separado e sozinho, abaixo, alinhado à direita; o foco volta ao
  botão que abriu a folha.
- **Pronto quando:** testes cobrem 0, 1 e 2+ pares; que o par com chamada já registrada **não** aparece;
  e, na API, que **não** aparecem encontro cancelado, edição não terminada e grupo removido, que encontro
  remarcado vale pela data nova e que um clube não enxerga pares de outro.

### R3. Próximo evento
- Dado novo em `GET /api/visao-geral`: o primeiro evento do calendário com `fim >= hoje` (hoje no
  fuso do clube), **consultado por intervalo de datas, não por ano** (a virada do ano não importa),
  considerando os tipos que o cartão do instrutor já usa (evento especial, acampamento e evento;
  `modulos/calendario/CartaoProximoEvento.tsx:11`). **Fora:** evento cancelado e o tipo Classe Bíblica.
  O dado traz também `horario` e `local` (ambos podem ser nulos; `contratos/calendario.ts:15-16`).
- Cartão com mês e dia, selo do tipo, nome, "Sábado, 17 de outubro · 19h" (o horário só aparece se existir; o
  local, se existir, vem depois) e o link "Abrir calendário". O cartão inteiro leva à ficha do evento
  (`/adm/calendario/eventos/:id`, `rotas.tsx:10`).
- A frase da data é a do cartão do instrutor (`CartaoProximoEvento.tsx:11-20`): futuro "Sábado, 31 de outubro";
  evento de um dia que é hoje "Hoje, sábado, 17 de outubro"; evento de vários dias em andamento "Até domingo, 15 de novembro".
- **Vazio:** "Nenhum evento marcado à frente." + link "Abrir calendário".
- **Pronto quando:** testes da API cobrem evento hoje, evento de vários dias em andamento, virada de
  ano, evento cancelado, tipo Classe Bíblica e nenhum evento; teste de tela cobre cartão (com e sem horário) e vazio.

### R4. Classes sem cronograma
- Dado novo: classes do clube sem cronograma no ano do clube (D2). **"Classe" aqui é a que a montagem de
  cronograma oferece** (`MontagemAdm.tsx:31-34`): a regular ativa e a avançada **sem par**; a avançada
  pareada não é contada à parte, porque o cronograma é da regular (`classes/par-regular-avancada.ts:33`).
  "Ativa" exige as duas coisas: a classe ativa e a classe ativa **no clube** (`ativaNoClube`). Classes
  pareadas aparecem **uma vez**, com o nome das duas, como em `cronogramasAguardando`
  (`apps/api/src/visao-geral/visao-geral.service.ts:259-276`, `avancadasPareadas`/`nomeDoPar`).
- Cada linha: nome e idade, ação "Montar", leva a `/adm/cronogramas?classe=<id>`
  (`VisaoGeral.tsx:181`). Contador no selo de alerta.
- **Vazio:** "Todas as classes têm cronograma."
- **Pronto quando:** o teste da API cobre classe com rascunho (conta como tendo), classe sem nenhum,
  par contado uma vez, classe inativa ignorada (no catálogo e no clube) e avançada pareada não contada à parte.
  A abertura da montagem de uma classe sem cronograma a partir do `?classe=` já está confirmada
  (`MontagemAdm.tsx:21,31,56`); um teste de tela do clique "Montar" basta.

### R5. Unidades sem chamada
- Dado novo: a data da última reunião (D1) e as unidades ativas **sem nenhuma linha de `Chamada` na
  `Reuniao` daquela data** (modelos `Reuniao`, `schema.prisma:691`, e `Chamada`, `:723`; uma `Reuniao` pode
  existir só com álbum ou cabeçalho, sem chamada), cada uma com nome e conselheiros (`resumoDasUnidades`,
  `visao-geral.service.ts:238`).
- Cabeçalho do cartão traz a data: "Reunião de domingo, 11/10". Mostra até **5** unidades; havendo
  mais, a linha final "E mais N unidades" leva a `/adm/unidades`. Cada linha leva a `/adm/unidades/:id` (D8).
- **A última reunião procura também no ano anterior** (o calendário só devolve dias do ano pedido,
  `contratos/calendario.ts:49`): em janeiro, antes da primeira reunião do ano, vale o último domingo de dezembro.
  O cartão só deixa de aparecer em clube **sem nenhum dia de reunião** nos dois anos.
- **Vazio:** "Todas as unidades lançaram a chamada."
- Unidade que **não tinha desbravador ativo na data da reunião** não conta (`MembroUnidade` com `inicio <= data`
  e `fim` nulo ou posterior). Isso também evita acusar unidade criada depois da reunião.
- **Limitação aceita:** um dia de reunião do calendário que o clube não realizou e não marcou como cancelado ou
  férias aparece como pendência de todas as unidades até a próxima reunião. A saída é cancelar o dia no calendário.
- **Pronto quando:** testes da API cobrem unidade com chamada, sem chamada, **reunião existente sem linhas de chamada**,
  sem desbravadores na data, desbravador que entrou depois da reunião, hoje sendo dia de reunião (não conta), virada de
  ano, nenhum dia de reunião e mais de 5 pendentes; teste de tela cobre lista, vazio e "E mais N".

### R6. Prévia do ranking
- Reaproveita `useRankingUnidades(mes)` (`apps/web/src/api/ranking.ts:25`), sem `mes` (mês atual),
  cortando nas **5 primeiras** no cliente. Linha: posição, nome da unidade, "82,4 pts". Subtítulo
  "Média de pontos por desbravador · outubro". A API de unidades **não devolve o mês** (`RankingUnidadesSaida` é
  só a lista, `contratos/ranking.ts:24-26`), então o nome do mês sai da mesma data de hoje no fuso do clube
  (`hojeNoFuso`) que o cabeçalho usa; nunca do relógio do navegador.
- Link "Ver ranking completo" → `/ranking` (não existe `/adm/ranking`, só `/adm/ranking/regras`).
- **Estados próprios:** o ranking carrega por requisição separada. Carregando e erro aparecem **dentro
  do cartão do ranking**, sem esconder o resto da tela. Sem pontos no mês: "Ainda não há pontos neste mês."
- **Pronto quando:** testes cobrem carregando, erro, vazio e mais de 5 unidades (aparecem só 5).

### R7. Estados da tela e responsividade
- A tela mantém os estados de carregando, erro e sem conexão via `EstadosDeCarga` (importado em
  `VisaoGeral.tsx:14`) — `CLAUDE.md:34`.
- **O vazio de página inteira deixa de existir.** Hoje a tela troca tudo por "cadastre o primeiro desbravador" quando
  não há desbravadores nem unidades (`VisaoGeral.tsx:~287`). Como os atalhos valem mesmo num clube novo, essa condição
  sai: os atalhos continuam, e cada bloco mostra seu próprio vazio (sem unidades ativas, o cartão de chamada não aparece).
  O teste desse vazio (`visao-geral.test.tsx:28-56`) é reescrito para isso.
- **Nome acessível dos contadores:** o selo diz o número e o cartão diz o que ele conta ("2 classes sem
  cronograma", "2 unidades sem chamada"), em singular e plural.
- **A tela atualiza depois das ações que mudam seus blocos.** Gravar uma chamada da Classe Bíblica, criar, editar
  ou excluir evento do calendário, criar cronograma e registrar chamada de reunião invalidam a chave de cache
  `chavesVisaoGeral.todas` (as duas últimas já invalidam, `api/presenca.ts:17,55`, `api/reunioes.ts:20,117`; confirmar as demais
  em `api/classe-biblica*` e `api/calendario.ts`). Sem isso o Adm volta à visão geral e vê a chamada recém-lançada ainda pendente.
- Computador: duas colunas abaixo dos atalhos (evento + pendências à esquerda; ranking à direita).
  Celular (`LARGURA_DO_CELULAR`): uma coluna, na ordem da decisão 1.
- Toda área de toque tem pelo menos 44px; texto de corpo 16px; nada comunicado só pela cor (o selo de
  alerta traz o número; a linha atrasada traz a data).
- Data do cabeçalho ("Terça-feira, 13 de outubro") calculada no **fuso do clube** (`hojeNoFuso`).
- **Pronto quando:** `margemDoAdm.test.ts` continua verde e os testes de tela rodam nos dois layouts.

## As quatro perguntas de UX

- **Pré-requisitos.** Para "Gerar link de substituto" é preciso ter unidade ou classe cadastrada; o
  atalho já orienta quando não há (`AtalhoDeSubstituto.tsx:53-54`). Os demais não dependem de cadastro prévio.
- **Vazio.** Cada bloco tem seu texto (R3 a R6); nenhum some em silêncio.
- **Bloqueio.** Nenhum botão fica desabilitado: o que não tem o que fazer abre uma folha dizendo isso (R2).
- **Perfil e escopo.** A tela é só do Adm, que vê o clube inteiro; nada é filtrado por escopo. Conselheiro
  e instrutor continuam com os inícios deles (`InicioConselheiro.tsx`, `TelaInicioInstrutor.tsx`), sem mudança.

## Verificar antes de implementar

1. Limites do ano do clube na virada: o campo novo de classes sem cronograma usa `anoClube`
   (`packages/shared/src/datas.ts:9`, mesmo critério da tela de montagem). Nos primeiros dias do ano do clube toda classe
   aparece sem cronograma, o que é verdade; o teste fixa esse comportamento.
2. Os hooks de gravar chamada da Classe Bíblica e de criar/editar/excluir evento invalidam a visão geral? (R7.)

*Já confirmado na revisão:* `/adm/cronogramas?classe=<id>` abre a montagem de uma classe sem cronograma.

## O que não quebra

- **Os campos antigos de `GET /api/visao-geral`** continuam iguais (D7); quem os consome fora da tela
  não percebe a mudança. Campos novos entram com `.default` no contrato, então resposta antiga ainda é válida.
- **Os inícios do conselheiro e do instrutor**, o menu do Adm e o atalho de substituto.
- **As telas de destino** (calendário, cronogramas, Classe Bíblica, ranking, unidades) não são alteradas,
  salvo o item 1 de "Verificar antes de implementar".

## Fora de escopo

- Tela de Relatórios (com os números, progresso por classe e exportação).
- Limpar do servidor as consultas que a tela deixa de usar (D7).
- Tela do Adm para lançar chamada de unidade sem reunião registrada (D8).
- Chamada da Classe Bíblica com mais de 7 dias de atraso: continua pelo painel da edição.
- Mudar o início do conselheiro e do instrutor.

## ONDE FICA

- a tela atual e a ordem celular/computador  `apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:284-345`
- o atalho de substituto (reaproveitado)  `apps/web/src/modulos/adm/visao-geral/AtalhoDeSubstituto.tsx:1-69`
- o contrato da visão geral  `packages/shared/src/contratos/visao-geral.ts`
- o serviço que monta a resposta  `apps/api/src/visao-geral/visao-geral.service.ts` (`cronogramasAguardando` :259, `resumoDasUnidades` :238, `anoClube` :61)
- a regra de chamada pendente da Classe Bíblica  só o corte de data em `apps/web/src/modulos/inicio/CartaoClasseBiblica.tsx:22-52`; **os filtros de verdade** (cancelado, edição terminada) em `apps/api/src/sync/pacote-classe-biblica.service.ts:35-60`; escopo e grupo removido `apps/api/src/classe-biblica/escopo-grupos.ts:53,57,66`; a API recusa chamada antes do dia e encontro cancelado em `exigirAberto`, `apps/api/src/classe-biblica/servico-chamada.ts:~215-229`
- dias de reunião  fórmula pura `packages/shared/src/formulas/calendario.ts:82` (nenhum arquivo da API a chama hoje; o servidor precisa dos eventos do clube e do dia de reunião do clube, `clube.service.ts`)
- fuso e "hoje"  `hojeNoFuso`, `packages/shared/src/datas.ts:30`; ano do clube `datas.ts:9`
- montagem de cronograma  `apps/web/src/modulos/cronograma-montagem/MontagemAdm.tsx:21,31-38,56`; classes pareadas `apps/api/src/classes/par-regular-avancada.ts:33`
- a frase da data do evento  `apps/web/src/modulos/calendario/CartaoProximoEvento.tsx:11-20`
- rotas de destino  `modulos/adm/calendario/rotas.tsx:9-10`, `modulos/adm/classe-biblica/rotas.tsx:37`, `modulos/ranking/rotas.tsx:4`, `modulos/adm/unidades/rotas.tsx:10`
- próximo evento hoje (cartão do instrutor)  `apps/web/src/modulos/calendario/CartaoProximoEvento.tsx:11`
- ranking das unidades  `apps/web/src/api/ranking.ts:25`
- permissões do Adm  `packages/shared/src/permissoes.ts:35-38,62-64`
- testes que mudam  `apps/web/src/modulos/adm/visao-geral/visao-geral.test.tsx` (blocos 59-263 e 332-378 saem; o de vazio em 28-56 é reescrito; o de substituto em 296-330 se adapta ao novo formato), mocks em `apps/web/src/testes/handlers/visao-geral.ts` (único consumidor de `criarVisaoGeral`), `apps/web/src/layouts/margemDoAdm.test.ts` (varre os `.tsx` novos por padding lateral)
- testes que **devem continuar verdes sem mudança**  `apps/api/src/visao-geral/visao-geral.spec.ts` (397 linhas), `apps/web/src/modulos/adm/reunioes/reunioes-adm.test.tsx:258-261`, `apps/web/src/modulos/adm/calendario/presenca/marcas.test.tsx:297` (dependem só da chave de cache)
- conferido em  `61f95b6`
