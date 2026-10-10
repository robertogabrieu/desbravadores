# Eventos festivos — SPEC

> **RASCUNHO — layout não aprovado.** Esta é a spec parcial da fase 1: diagnóstico, mecânicas, desenho e
> rascunho técnico, já corrigida pela revisão adversarial contra o código. Critérios de pronto, "Como saber
> se funcionou" e "Fora de escopo" só se escrevem depois que o usuário aprovar o desenho em `modelo/`.
> Tudo marcado **a revisar** é proposta, não decisão.

O Adm cadastra **eventos festivos** no calendário do clube (cultos, aniversário, jantar de Natal…), diz
em cada um quantos pontos vale ir e se pede **uniforme de gala**, e depois do evento marca numa lista
quem foi e quem foi de gala. Os pontos entram no ranking do mês. Conselheiro e instrutor veem o
calendário (só leitura) e um aviso do próximo evento na tela inicial, com o sinal de gala.

## Pedido e decisões do usuário (não se reabrem)

Pedido: *"No calendário do clube existem eventos 'festivos' e/ou sazonais que não constam como reunião,
nem dia de classe, mas contam para o ranking com participação e uniforme. Cada evento contabiliza pontos
diferentes. E é importante constarem no calendário para que o usuário não perca os eventos. É importante
uma sinalização se é necessário o uso de uniforme de gala."*

1. **Quem vê.** Conselheiro e instrutor ganham uma tela de Calendário só para ler e o aviso do próximo
   evento na tela inicial. Só o Adm cria, edita e apaga. Desbravador e responsável ficam de fora.
2. **Presença.** Só o Adm registra quem foi, numa **lista única** (todos os desbravadores). Sem chamada do
   conselheiro, sem fila offline, sem rota de sync de presença de evento.
3. **Pontos.** O Adm define, **em cada evento**, os pontos de participação e os de uniforme (qualquer um
   pode ser zero). Nada de valor fixo no sistema.
4. **Uniforme.** O calendário mostra "Uniforme de gala" quando o evento exige. Na lista, o Adm marca quem
   foi com o uniforme pedido, e só esses ganham os pontos de uniforme do evento. (O usuário respondeu
   imaginando o conselheiro marcando; com a decisão 2, quem marca é o Adm, na mesma lista.)

## Problema

O clube tem eventos festivos que valem pontos no ranking, mas o app não sabe que eles existem:

- **O Adm não tem como dar os pontos.** Não há rota nem tela para lançar pontos de evento; o critério de
  fábrica "Participação em evento" (20 pontos, lançado pelo Adm) nunca é usado por nada.
- **Quem lidera os desbravadores não vê o evento.** O calendário é só do Adm; o conselheiro só vê a
  próxima reunião, e o instrutor só enxerga um evento quando monta o cronograma (a montagem lista nomes de
  evento por data, `apps/web/src/modulos/cronograma-montagem/datas.ts:41-51`), nunca num calendário.
  Perder um evento, ou esquecer o uniforme de gala, é o que o pedido quer evitar.
- **"Uniforme de gala" não existe no app.** Hoje só há "uniforme" como uma caixa da chamada de reunião.
- **Se o Adm esquecer de registrar quem foi, ninguém fica sabendo:** os pontos simplesmente não chegam.

O que muda para quem usa:

- **Adm:** um tipo novo no calendário, "Evento festivo", com três perguntas a mais (pontos por ir, pede
  gala?, pontos por ir de gala); depois do dia, uma lista "Quem foi" com duas marcas por pessoa (foi / de
  gala), que se salva sozinha; ao concluir, os pontos entram no ranking do mês do evento. Corrigir a lista
  depois de concluída é possível e pede confirmação que diz quantos pontos saem.
- **Conselheiro e instrutor:** um cartão "Próximo evento" no início e um item "Calendário" na barra
  inferior, com a lista dos eventos que ainda vão acontecer. "Uniforme de gala" aparece em texto e ícone.
- **Ninguém mais muda.** Reunião, classe, Classe Bíblica e ranking seguem como estão. O instrutor passa a
  ver o festivo também na montagem do cronograma, como já vê os outros eventos.

## Diagnóstico

**Não há dado de uso**: o projeto não tem analytics nem tabela de rascunho, e nenhum evento tem presença
hoje. O diagnóstico é do código. O que não foi medido: tempo para marcar uma lista, presença típica
num evento, número de eventos festivos por ano, tamanho real do clube (o planejamento assume ~60
desbravadores, `docs/planejamento/VISAO.md:78`, e unidades de 10, `docs/planejamento/ROADMAP.md:59`).

### Atritos, do maior para o menor

| # | O que trava | Onde | Medida |
|---|---|---|---|
| A1 | Os pontos do evento não chegam ao ranking | A escrita de pontos é só `ServicoPontos.sincronizar` (`apps/api/src/pontos/servico-pontos.ts:28`), chamada em 8 lugares de 6 arquivos (requisitos-dbv:44,73; especialidades-dbv:68,96; reunioes-envio:334; aulas-envio:407; tarefas-envio:280; classe-biblica/servico-chamada:196), todos com origem de reunião, requisito, especialidade ou Classe Bíblica (`OrigemPontos`, `apps/api/prisma/schema.prisma:126-132`) e **nenhum de evento**; `ranking.lancar_manual` existe sem rota (`packages/shared/src/permissoes.ts:26`; promessa em `docs/planejamento/API.md:186-187`); o critério "Participação em evento" (`apps/api/src/scripts/clube-criar.ts:34`) não tem tela | 0 rotas, 0 telas, 1 critério parado. **Todo** evento festivo do ano pega |
| A2 | Lista de presença é trabalho de escala | Não existe lista de evento. A mais parecida, a chamada da reunião, começa sem marca e exige todas (`apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:185-190`) | **Conta de cenário, não medida:** com 62 na lista (7 blocos), 41 que foram e 12 de gala, são 41 + 12 = **53 toques**; no pior caso (todos, todos de gala) 62 + 62 = **124**. Pega o Adm em toda lista |
| A3 | Perder o que marcou | No modo do Adm a chamada da reunião não guarda rascunho: "sem fila nem rascunho do aparelho" (`FormularioChamada.tsx:31`; `:144` e `:194` pulam a leitura e a gravação do rascunho quando é envio direto) | Toda marca ainda não enviada se perde ao recarregar, quando a tela é descartada ou ao trocar de aparelho (decorre de `:31`; não testado no navegador) |
| A4 | Não saber onde está numa lista de 62 | A chamada da reunião mostra "Marque os N que faltam" (`FormularioChamada.tsx:251`) porque exige todos; na lista do evento quem não foi não leva toque, então esse contador não existe e nada o substitui. A lista da Classe Bíblica já divide por unidade com contagem (`apps/web/src/modulos/classe-biblica/chamada/TelaChamadaCB.tsx:225-299`) | No cenário: 62 linhas seguidas contra 7 blocos de 2 a 11 |
| A5 | Esquecer de registrar, sem aviso | A Visão geral só chama atenção para unidade abaixo do limite e cronograma enviado (`apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:156-158`); nada marca evento passado sem lista | 0 sinais. Atrito silencioso: os pontos nunca chegam |
| A6 | Cadastro com decisões que valem para todos | O formulário tem 6 campos e 3 caixas (`apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:124-170`); o festivo soma 3 controles (12) e **3 deles decidem os pontos de todos**. A validação roda só ao enviar (`:92-111`); `useErrosAVista` só leva o foco ao erro depois do envio (`apps/web/src/ui/ErrosDoFormulario.tsx:30-45`) | Erro de digitação (200 em vez de 20) só aparece no ranking |
| A7 | Conselheiro e instrutor não veem o evento | Rotas do calendário só no grupo ADM (`apps/web/src/rotas.tsx:86-105`); barra do celular sem calendário (`apps/web/src/layouts/LayoutCelular.tsx:18-22`); início do conselheiro só "Próxima reunião" (`apps/web/src/modulos/inicio/InicioConselheiro.tsx:102-142`); o do instrutor não mostra evento (`apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:224` é só o cartão da Classe Bíblica). **O dado já chega:** `GET /calendario` é `@Logado` (`apps/api/src/calendario/eventos.controller.ts:54-55`) e o pacote offline leva 120 dias de eventos para todo papel (`apps/api/src/sync/sync.service.ts:90-111`) | Todos os conselheiros e instrutores |
| A8 | O sinal de gala se perderia no calendário | Célula do computador: nome com `truncate` e no máximo 2 eventos (`apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:25`, `:237-253`); no celular o tipo é só um ponto colorido (`apps/web/src/modulos/adm/calendario/CalendarioDoCelular.tsx:115-118`) | Texto longo é cortado; cor sozinha não conta |

### O que o código já decide (e molda o desenho)

- **A regra do dia fica como está.** `situacaoDaData` trata todo evento, menos a reunião extra e a Classe
  Bíblica, como "comum" (`packages/shared/src/formulas/calendario.ts:57-75`). O festivo entra como comum
  com marcações neutras (`temReuniao`, `temClasse` ligadas, campo desligado: não muda nenhuma das três
  contas do dia). Diferente da Classe Bíblica, **não sai da conta** (`:59`), porque o Adm pode desmarcar
  "Terá reunião" se o evento toma o lugar dela.
- **O aviso ao instrutor só nasce quando a classe do dia se perde.** `perdeuAClasse` e `entrouEmConflito`
  (`apps/api/src/calendario/servico-eventos.ts:230-240`) ficam falsos com as marcações neutras: o festivo,
  como nasce, **não avisa ninguém**. O texto fixo do formulário, "Se já houver classes marcadas no período, o
  instrutor é avisado" (`FormularioEvento.tsx:171`), passa a aparecer só quando o Adm desmarca "Terá classe".
- **Ranking:** soma `LancamentoPontos` do mês pela `data` do lançamento e usa a **unidade atual**
  (`apps/api/src/ranking/calculo-ranking.ts:122-136`, `:149-157`), **exceto a Diretoria que veio de DBV, que
  usa a unidade em que estava antes** (`:90`, `diretoriaUnidadeAnterior`). Quem aparece: DBV ativo, ou
  Diretoria que veio de DBV (`:67-73`). A regra **não olha a data de entrada** (`entradaEm`,
  `apps/api/prisma/schema.prisma:447`).
- **`sincronizar` não troca o valor de um lançamento que já existe** (`servico-pontos.ts:28-60`: o que é
  igual por critério "não é tocado"), nunca lê `criterio.pontos` e ignora `criterio.ativo`. Mudar os pontos
  de um evento já concluído exige estornar e lançar de novo, na mesma transação.
- **`criterioId` nulo já quer dizer "desconto por falta"** (`apps/api/prisma/schema.prisma:757`;
  `apps/api/src/reunioes/reunioes-envio.service.ts:330`). Por isso os pontos do evento usam critérios
  próprios (ver rascunho técnico).
- **O pacote offline monta os campos do evento à mão** (`sync.service.ts:100-110`) e tem o mesmo desenho do
  evento do Adm (`EventoDoPacote = EventoSaida.omit({ id })`, `packages/shared/src/contratos/sync.ts:55`).
  Campo novo do evento precisa entrar ali; e o pacote sai também pelo **link de substituição**
  (`apps/api/src/sync/sync.controller.ts:12`, `LogadoOuSubstituto`; o `calendario` fica fora do
  `substituicao ?` em `sync.service.ts:77`). Qualquer coisa que só o Adm deva ver **não pode** estar no
  `EventoSaida`, senão cada toque do Adm muda a versão (hash) do pacote de todos.
- **Salvar sozinho existe, mas não se reaproveita.** A edição da Classe Bíblica grava a cada saída de campo
  e mostra "Salvo às HH:MM" em região viva, mas o hook está preso às mutações dela e guarda um único erro
  (`apps/web/src/modulos/adm/classe-biblica/useRascunhoDaEdicao.ts:2,41-83`; `EtapaDados.tsx:29-42`). Vale a
  ideia; o hook da lista é novo (M1, D24).
- **`Tabela` não serve para a lista:** é paginada e vira cartão no celular (`apps/web/src/ui/Tabela.tsx:36-62`).
- **`Campo` e `CampoRotulado` usam rótulo, apoio e erro em 14 px** (`apps/web/src/ui/Campo.tsx:21,26,31`),
  abaixo do piso de 16 px. O desenho **segue o componente** (14 px), porque o componente é o que vai ser
  usado; subir a letra de todos os formulários é achado à parte (D19).
- **A trava de gravação do evento é do clube inteiro** (`servico-eventos.ts:187`, chave `'eventos-do-clube'`),
  não por evento; e tudo dentro dela lê pela própria transação (`:198`), porque outra conexão esgotaria o pool.
- **A legenda do calendário é a lista inteira dos tipos**, na ordem de `ROTULOS_DO_TIPO`
  (`AdmCalendario.tsx:60-69`; `tipos.ts:10-18`); o tipo novo entra onde for posto no `Record`.
- **O pacote não expõe erro de leitura:** `usePacote` engole o erro (`apps/web/src/offline/usePacote.ts:26`;
  `UsePacote` sem campo de erro, `offline/tipos.ts:143-150`). Por isso a tela de leitura não tem estado de erro.

### Achados do caminho (a fase 2 decide o que vira "Fora de escopo")

- O critério de fábrica "Participação em evento" (MANUAL, 20 pontos) continua sem uso depois desta entrega.
- `ranking.lancar_manual` e as rotas `POST/DELETE /ranking/lancamentos` seguem sem implementação.
- O desenho do ranking descreve "Uniforme completo" como *"Uniforme de gala ou atividade, conforme o dia"*
  (`docs/design/telas/Adm-Ranking.dc.html:86`): a reunião já fala em gala, mas o código só tem uma caixa.
- Rótulos da barra inferior em 12 px (`apps/web/src/layouts/ItemNavegacao.tsx`, `BASE.barra`): abaixo de 16 px.
- **Letra dos formulários em 14 px** (`Campo.tsx:21,26,31`, ~43 arquivos de tela usam o componente): abaixo do
  piso de 16 px. Achado para issue própria, **fora desta entrega**.
- Duplicação consciente: a lista de presença terá componentes próprios, parecidos com os da Classe Bíblica
  (D24); unificar os dois é trabalho futuro.

## Mecânicas

**Calibragem (`gamificacao` §5).** O cadastro do evento é de uso eventual e curto (12 controles): só pedir
menos, confirmar no campo e fechar com o próximo passo. A lista "Quem foi" também é eventual, mas longa e
feita por quem pode ter pouca intimidade com tecnologia: o catálogo de uso pesado cabe (salvar sozinho,
capítulos, confirmação imediata, fechamento). As telas de leitura (calendário, cartão) **não levam
mecânica**: são informação. Os pontos do evento são regra do ranking que já existe; **nenhuma mecânica usa
ponto, medalha, sequência ou contador de ganho** (`gamificacao` §3). Mostrar quanto vale o evento é dado, não
recompensa.

### M1 — Salvar sozinho, com "Salvo às" (resolve A3)
Cada toque grava no servidor, em fila, uma gravação por vez. A linha "Salvo às 16:42." (hora no fuso do
clube, `ConfiguracaoClube.fuso`) fica sob o título, em região viva educada, sem roubar o foco. **A marca só
vira marcada depois que o servidor confirma:** até lá a linha mostra "Salvando…". Se uma gravação falha, a
linha vira "Não salvou a marca de Enzo Barros" com "Tentar de novo", e as outras marcas seguem salvas. Sem
internet, os toques novos desligam (não existe fila offline, decisão 2); as marcas que ainda não tinham sido
confirmadas ficam como "Não salvou ainda", e a faixa diz quantas são e que **se a tela fechar antes, elas se
perdem**. A tela nunca diz "está salvo" enquanto houver marca pendente.
O hook é **novo** (D24): a interface está em "Rascunho técnico". A edição da Classe Bíblica não muda.

### M2 — Começar pela maioria (resolve A2)
A lista começa **sem ninguém marcado**. Dois botões em massa: "Marcar todos como presentes" e "Marcar de
gala todos que foram". Compensam quando a maioria foi: no cenário do desenho (41 de 62, 12 de gala) o
primeiro custa 1 + 21 = 22 toques contra 41; o segundo **não** compensa (1 + 29 contra 12), e o Adm
decide. Cada botão em massa é **uma** gravação, tudo ou nada. O botão "de gala" só liga a gala de quem foi
(quem não foi não entra). Depois de concluída a lista, os botões em massa saem da tela. O que NÃO muda: a
chamada da reunião segue começando sem marca.

### M3 — A lista em capítulos por unidade, com a contagem à vista (resolve A4)
Uma seção por unidade, em ordem alfabética, **"Sem unidade" por último** ("Águias · 8 de 10 foram · 6 de
gala"), só a primeira aberta; no topo, "41 de 62 foram · 12 de gala"; busca pelo nome. É a lista **única**
(decisão 2) vista em capítulos, não uma chamada por unidade. Conta de **pessoas**, nunca de pontos. Os
componentes são **novos** (seção por unidade, linha "nome + pílula de gala"), no molde visual da lista da
Classe Bíblica (`TelaChamadaCB.tsx:225-299`, `:327-371`) mas **sem tocá-la** (D24).

### M4 — Fechamento com o efeito dito antes e o próximo passo (resolve A5 em parte)
Logo acima do botão primário: *"Ao concluir, os 41 que foram ganham os pontos de ir ao evento, e os 12 de
gala ganham também os de gala. Depois você ainda pode corrigir a lista."* Concluir sem ninguém marcado pede
confirmação que diz o que acontece. Depois: "Lista concluída. 41 desbravadores foram, 12 de gala. Os pontos
já estão no ranking de outubro." e um único botão, "Voltar ao evento". Nada some sozinho, sem animação.
**Os pontos só entram aqui:** até concluir, as marcas são rascunho (D7).
O Adm conclui com os totais que está vendo; se a lista mudou nesse meio tempo (outro Adm marcou), o servidor
recusa e a tela diz: "A lista mudou desde que você abriu: agora são 42 que foram, e eram 41. Confira a lista
e conclua de novo."

**Corrigir depois de concluída** (D21). Cada toque ajusta os pontos na hora, mas **tirar alguém, ou tirar só
o uniforme, pede confirmação que diz o efeito**: *"Ana Clara perde 30 pontos do ranking de outubro: 20 de ir
ao evento e 10 de gala."* O botão primário é o seguro ("Manter na lista"); "Tirar os pontos" é secundário e
em cor de perigo. Desmarcar **nunca apaga a linha** de presença.

### M5 — Próximo passo à vista para o Adm (resolve A5)
Três lugares, todos em texto e ícone: (1) a ficha do evento tem o cartão "Quem foi ao evento" com o botão
certo para o estado (antes do dia: só o texto; sem marcas: "Registrar quem foi"; rascunho: "Continuar a
lista"; concluída: "Corrigir a lista"); (2) o cartão do evento no calendário diz "Falta registrar quem
foi"; (3) um item em "Precisa de atenção" na Visão geral do celular e um cartão "Eventos sem lista" na do
computador, que somam no total de "Precisa de atenção" e somem sozinhos quando a lista é concluída.
**Uma regra só para os três (D22):** o evento já **terminou** (`fim` antes de hoje, não `inicio`), faz **no
máximo 60 dias**, e vale pontos (a soma dos dois pontos é maior que zero). Evento antigo cadastrado de uma vez
não vira pendência eterna; evento de vários dias não cobra no meio dele; evento de 0 pontos não cobra nada.
É **um** lembrete, sem repetição, sem sino, sem e-mail. Não tem "dispensar" porque é pendência de trabalho,
como "Cronograma para publicar" no mesmo bloco; o evento sai dele por "Concluir sem ninguém", pelos 60 dias
ou apagando o evento.

### M6 — Pedir menos no cadastro (resolve A6)
As marcações do tipo já vêm prontas e neutras; "Pontos por ir de gala" só aparece quando o evento pede gala;
horário e local seguem opcionais. Os **pontos não têm valor pronto** (decisão 3): o campo vem vazio e
exige um número, zero incluído.

### M7 — Confirmação no campo e frase de efeito (resolve A6)
Ao sair do campo de pontos: "Informe os pontos de quem for ao evento. Pode ser 0." (ou "Use um número inteiro
de 0 a 1000"), junto do campo, sem limpar nada. Sob o grupo, uma frase repete o que foi digitado: *"Quem for
ganha 20 pontos. Quem for de gala ganha mais 10."* — o Adm lê o efeito antes de salvar. Valida ao sair
**só dos dois campos de pontos**; o resto do formulário continua validando ao enviar.
**Como não brigar com o foco:** `useErrosAVista` refoca o primeiro campo inválido a cada mudança de `erros`
(`ErrosDoFormulario.tsx:41`). O erro ao sair do campo vive em **estado local separado** que não alimenta o
`erros` do formulário nem o hook; o componente comum não muda.

### M8 — Sinal de gala que não depende da cor (resolve A7 e A8)
"Uniforme de gala" aparece **escrito, com ícone de camisa e contorno**, em toda parte onde o evento aparece:
legenda do calendário, célula do computador (em segunda linha, sem cortar), cartão do evento, ficha, cartão
"Próximo evento" e lista de leitura. O tipo "Evento festivo" também leva texto e ícone, além da cor nova.

### Telas sem mecânica (informação)
Calendário do Adm, calendário de leitura e cartão "Próximo evento": **sem mecânica**. Têm desenho porque o
sinal de gala é decisão de layout, não de adesão.

## Descobribilidade

- **Pré-requisitos.** Lista: precisa de desbravador ativo (condicional: sem nenhum, a lista mostra "Nenhum
  desbravador ativo no clube" com "Cadastrar desbravador"); unidade **não** é exigida (quem não tem fica em
  "Sem unidade", último bloco). Evento festivo: "Pontos por ir de gala" só existe se "Pede uniforme de gala"
  estiver marcado, e a segunda marca da lista só existe nesse caso. A lista abre no dia do evento.
- **Vazio.** Calendário de leitura sem evento: "Nenhum evento nos dados deste aparelho" com a data da última
  atualização (o texto **não afirma** que não há evento no clube, só no que o aparelho guarda), e diz que
  quem cadastra é o Adm (sem botão: quem lê não cria). Cartão "Próximo evento" sem evento, ou enquanto o app
  carrega: **não aparece** (mesmo molde do cartão da Classe Bíblica). Lista: "nada cadastrado" (sem
  desbravadores) ensina e oferece o cadastro; "busca sem resultado" oferece "Limpar a busca".
- **Bloqueio.** *Pré-requisito ausente:* sem desbravador → caminho "Cadastrar desbravador"; sem internet →
  "Disponível quando houver internet". *Estado impossível* (só o texto): lista antes do dia do evento ("A
  lista abre no dia do evento"); mudar o tipo do evento depois que a lista começou ("O tipo não muda depois
  que a lista é começada"); mudar o início para uma data que ainda não chegou com a lista começada ("Esta
  data ainda não chegou e a lista deste evento já tem marcas…"); concluir com a lista diferente da que o Adm
  viu; evento que não existe, é de outro clube ou não é festivo ("Não encontramos este evento", 404).
- **Perfil e escopo.** Criar, editar, apagar, listar e concluir: só Adm (`calendario.gerenciar` e
  `ranking.lancar_manual`, as duas só do Adm). Conselheiro e instrutor leem o calendário **do clube inteiro**
  (não é por unidade) e não veem botão de escrita. **Sem permissão não vira tela:** conselheiro e instrutor
  não têm o caminho da lista (o guarda de rota os devolve ao início, `apps/web/src/sessao/GuardaRota.tsx:22`) e
  a API responde 403; o Adm sempre tem a permissão (`packages/shared/src/permissoes.ts:62-63`) e, se abrir o
  calendário de leitura, cai no início do painel dele (`/` leva a `/adm/desbravadores`,
  `apps/web/src/modulos/acesso/papeis.ts:15`). **Pontos do evento:** o desenho mostra "Vale pontos no
  ranking…" a conselheiro e instrutor (pergunta 2). Se a resposta for "não", o servidor deixa de mandar os
  pontos em **três lugares** (`GET /calendario`, `GET /calendario/eventos/:id` e o calendário do pacote);
  filtrar só no cliente não vale. O **link de substituição nunca recebe pontos nem a lista**, qualquer que
  seja a resposta (só nome, data, horário, local e gala).

## Desenho

`docs/fases/eventos-festivos/modelo/` — 18 quadros (`*.dc.html`) e `canvas.json`. **Se esta SPEC e o desenho
divergirem, o desenho vence.** Do desenho copia-se estrutura, ordem e texto, **nunca CSS**: as classes saem
dos tokens (`apps/web/src/ui/tokens.css`, com `--cal-festivo-bg/fg` como **únicos tokens novos**) e destes
componentes de `apps/web/src/ui/`: `CabecalhoDaPagina`, `Cartao`, `Campo`/`CampoRotulado`, `CampoData`, `Selecao`,
`CaixaMarcacao`, `Botao`/`estiloDoBotao`, `Selo`, `Chip`, `EstadoVazio`, `Carregando`/`ErroDeCarga`/
`DisponivelComInternet` (`EstadosDeCarga`), `Esqueleto`, `FaixaAviso`, `Confirmacao`, `ListaDePares`,
`RodapeDoFormulario`, `LinhaQueNavega`, `EstadoNaoEncontrado`. Novos: o hook da lista, a seção por unidade
com linha "nome + pílula de gala", o cartão "Próximo evento".

O desenho tem **tema claro e escuro** e abre em 360 px; o app não tem modo escuro, o escuro é só do desenho.
Cada quadro abre sozinho no navegador (o `support.js` do canvas não é necessário para ver). O CSS dos quadros
usa nomes de cor que **não existem** no app (`--color-on-primary`, `--color-on-soft`, `--color-link`,
`--color-header`, `--color-on-header-muted`, `--color-nav-active`, `--color-disabled`, `--rotulo-bg`,
`--rotulo-fg`): são apelidos só dos quadros, para o escuro; a implementação usa os tokens existentes
(`apps/web/src/ui/tokens.css`) e não cria nenhum desses.

| Quadro | O que mostra |
|---|---|
| `Form-Festivo` (1280) | Novo evento, tipo Evento festivo, gala marcada: grupo "Uniforme e pontos" com a frase de efeito |
| `Form-Festivo-Celular` (360) | O mesmo sem gala, com o erro no campo de pontos ao sair dele |
| `Form-Festivo-Editar` (360) | Editar evento com a lista concluída: aviso, tipo travado, a confirmação "Refazer os pontos" (depende da pergunta 3) e a recusa de data futura |
| `Ficha-Festivo` (1280) | Ficha: cartão "Quem foi ao evento" (4 estados), "Pontos e uniforme", dados e "O que muda no calendário" |
| `Ficha-Festivo-Celular` (360) | Logo depois de salvar: "Evento salvo" e o cartão antes do dia |
| `Ficha-Festivo-Excluir` (360) | Excluir evento com a lista concluída: a confirmação diz que os pontos saem |
| `Calendario-Adm` (1280) | Mês com 3 festivos, gala em texto, **legenda completa na ordem real** e cartões com "Falta registrar quem foi" |
| `Calendario-Celular` (360) | Grade com losango para o festivo, painel do dia e lista do mês |
| `Presenca-Celular` (360) | "Quem foi": status "Salvo às", contagem, botões em massa, busca, sete blocos (o último, "Sem unidade") |
| `Presenca-Computador` (1280) | O mesmo, com tabela: nome, foi, foi de gala (os dois com botão de verdade) e as confirmações de correção |
| `Presenca-Estados` (360) | Carregando, vazio, busca sem resultado, erro ao abrir, marca sendo salva, erro ao salvar uma marca, sem internet (nada pendente, com marcas pendentes, ao abrir), antes do dia, concluir sem ninguém, concluir com a lista mudada, evento não encontrado, sem permissão |
| `Presenca-Concluida` (360) | Fechamento: efeito dito e "Voltar ao evento"; confirmações de tirar alguém e de tirar só o uniforme |
| `VisaoGeral-Pendencia` (360) | "Precisa de atenção" com o item novo |
| `VisaoGeral-Computador` (1280) | O cartão "Eventos sem lista" |
| `Inicio-Conselheiro` (360) | Cartão "Próximo evento" com gala (em 20/10), barra com "Calendário" |
| `Inicio-Instrutor` (360) | O mesmo sem gala; o cartão "hoje", em andamento e de evento sem pontos |
| `Calendario-Leitura` (360) | Lista por mês, só leitura, com feriado e férias |
| `Calendario-Leitura-Estados` (360) | Carregando, vazio, sem internet com e sem calendário guardado; sem permissão (não há estado de erro, ver "O que o código já decide") |

**Medido no desenho** (Chrome sem janela, 18 quadros, 46 medições entre 360 e 1280 px, claro e escuro): 0
rolagem lateral, 0 alvo de toque abaixo de 44 px, 0 texto abaixo de 4,5:1 (3:1 em texto grande). **Letra:** o
que decide (nomes, pontos, gala, botões, texto de corpo) fica em 16 px; rótulo, apoio, erro e chips ficam em
14 px, o `text-sm` do app (`Campo.tsx:21,26,31`), e os rótulos da barra inferior em 12 px, como no app. Isso
está abaixo do piso de 16 px e é o achado da D19, não escolha do desenho. **Não medido:** a célula do dia da
grade do celular só chega a 44 px de largura em 360 px com cartão de 8 px e sem vão, e a grade atual tem
`gap-0.5` (`CalendarioDoCelular.tsx:93`), então a implementação **mede no DOM e ajusta**; a barra inferior de 5
itens a 320 px (o layout trata 320 px) também fica para a implementação medir.

**Telas com desenho:** as quatro em jogo (cadastro e ficha, lista, calendário do Adm, leitura e cartão).
**Dispensáveis:** nenhuma; "sem permissão" não ganha quadro próprio porque não é tela (ver Descobribilidade).

## Rascunho técnico (a revisar)

Tudo abaixo é proposta, já confrontada com o código pela revisão. Os números de linha são da base `77755d2`.

**Banco** — uma migration `AAAAMMDDHHMMSS_eventos_festivos` (`ALTER TYPE … ADD VALUE` sem usar o valor na mesma
migration, como a de férias, `docs/fases/calendario-ferias-extras/SPEC.md:103-104`). O banco é PostgreSQL
(`schema.prisma:22`):
- Enums: `TipoEvento` + `EVENTO_FESTIVO` (`schema.prisma:140`); `GatilhoCriterio` +
  `EVENTO_FESTIVO_PARTICIPACAO`, `EVENTO_FESTIVO_UNIFORME` (`:93`); `OrigemPontos` + `EVENTO_FESTIVO` (`:126`).
- `EventoCalendario` (`:878`) + `exigeGala Boolean @default(false)`, `pontosParticipacao Int?`,
  `pontosUniforme Int?`, `listaConcluidaEm DateTime? @db.Timestamptz` (nulo = rascunho ou sem lista).
- **`PresencaEventoFestivo`**: `clubeId`, `eventoId`, `dbvId`, `foi Boolean`, `comUniforme Boolean @default(false)`,
  `alteradaPorId`, `alteradaEm`; chave `(eventoId, dbvId)`; FKs compostas `(clubeId, id)` como
  `PresencaClasseBiblica` (`:1344`). **Nunca se apaga linha** (`CLAUDE.md:20`): desmarcar grava `foi=false` e
  `comUniforme=false`, e cada alteração de lista concluída vai também para `Atividade` (`:1208`, via
  `apps/api/src/atividades/servico-atividade.ts`). Entra em `MODELOS_DE_CLUBE`
  (`apps/api/src/comum/prisma/guarda-clube.ts:4-48`) na mesma migration (`CLAUDE.md:30`) e na lista exata de
  `guarda-clube.spec.ts:71-122` (mais os `describe.each`/`it.each` por modelo, `:123`, `:340`, `:354`, `:402`).
- Critérios: sem INSERT em SQL; `garantirCriteriosDeEvento(tx, clubeId)` idempotente, no molde de
  `apps/api/src/classe-biblica/criterios.ts`, chamado sob demanda (ao concluir), o que cobre clube novo **e**
  clube existente; com "Participação em evento festivo" e "Uniforme de gala em evento festivo", `padrao: true`,
  `ativo: true`, `lancadoPor: ADM`, **pontos 0 e não usados** (o valor vem do evento; `sincronizar` nunca lê
  `criterio.pontos` e ignora `ativo`, então o `ativo` desses dois critérios não liga nem desliga nada). O
  `nomeLivre` não herda o sufixo "(Classe Bíblica)". `clube-criar.spec.ts:25` segue em 8; `carga.ts` não toca
  critério nem evento.
- **Fato sobre a migration:** o PostgreSQL não remove valor de enum, então ela só vai para a frente. Depois do
  primeiro evento festivo e do primeiro `concluir`, uma API antiga lê tipo e gatilho desconhecidos e quebra o
  calendário, o pacote e o envio de chamada (`reunioes-envio.service.ts:324`, `criterioRanking.findMany` por
  gatilho). Nota de volta: antes de reverter, `UPDATE "EventoCalendario" SET tipo = 'EVENTO' WHERE tipo =
  'EVENTO_FESTIVO'` e desativar os dois critérios.

**Compartilhado** (`packages/shared`): `TIPOS_EVENTO` + `EVENTO_FESTIVO` (`enums.ts:37`), **logo depois de
`EVENTO`** na ordem de `ROTULOS_DO_TIPO` (a legenda segue essa ordem);
`MARCACOES_PADRAO.EVENTO_FESTIVO = { temReuniao: true, temClasse: true, bomParaCampo: false }` (`enums.ts:57-66`;
o tipo é `Record` no front, então o compilador cobra `tipos.ts`); gatilhos em `formulas/pontos.ts:3-14`.
- **Contrato do evento, campos planos** (nomes planos também por causa do mapa de erros do formulário:
  `zod-validation.pipe.ts:14`, `FormularioEvento.tsx:101` e `validarEvento`, que hoje só conhece
  `'fim' | 'temReuniao'`, `formulas/calendario.ts:183`): `exigeGala`, `pontosParticipacao`, `pontosUniforme`,
  nulos fora do tipo festivo, `optional` na entrada e na saída (o pacote guardado antes continua válido; **não
  existe versão de schema do pacote**, só o hash, então `optional` basta). `validarEvento` (`:188`) ganha as
  chaves `pontosParticipacao` e `pontosUniforme` (inteiro de 0 a 1000; uniforme só com gala; fora do festivo,
  descartados).
- **O resumo da lista é só do Adm e fica fora do pacote:** `EventoSaida` ganha `lista: ResumoDaLista.nullish()`
  (`concluidaEm`, `foram`, `deGala`), preenchido **só para sessão Adm e só para festivo**; `EventoDoPacote`
  passa a ser `EventoSaida.omit({ id, lista })` (`contratos/sync.ts:55`). Assim a ficha, o cartão do calendário
  e a Visão geral têm o que o desenho mostra e o hash do pacote não oscila a cada toque.
- Contrato novo da presença (`PresencaDoEventoSaida`, `PresencaDoEventoEntrada`, `ConclusaoEntrada`,
  `ConclusaoSaida`); `VisaoGeralSaida` + `eventosSemLista` **com `.default([])`** (`contratos/visao-geral.ts:18`;
  sem o default quebram o handler `apps/web/src/testes/handlers/visao-geral.ts:5-21` e `visao-geral.spec.ts`).
**`situacaoDaData` não muda.**

**API** (módulo novo `apps/api/src/eventos-festivos/`):

| Rota | Guarda | O que faz |
|---|---|---|
| `GET /calendario/eventos/:id/presenca` | `@Pode('ranking.lancar_manual')` | Quem entra no ranking do mês do evento, agrupado pela unidade (ordem alfabética, "Sem unidade" por último), com `foi` e `comUniforme` de cada um, `resumo` (`foram`, `deGala`, `total`), `aberta` (hoje ≥ `inicio` no fuso do clube) e `listaConcluidaEm`. Evento de outro clube, apagado ou que não é festivo: 404 |
| `PUT /calendario/eventos/:id/presenca` | idem | Corpo `{ marcas: [{ dbvId, foi?, comUniforme? }] }`, só o que mudou; **uma gravação por toque**, e cada botão em massa é **uma** requisição, tudo ou nada. `foi: false` grava `foi=false` e `comUniforme=false` (não apaga); `comUniforme` só vale com `foi` e `exigeGala`; `comUniforme` omitido **não mexe**. Recusa antes do dia. Devolve as **linhas autoritativas** das pessoas tocadas, o `resumo` e `listaConcluidaEm`, e a tela reconcilia com isso; avisos só para ids que existem no clube (nunca ecoa nome de id desconhecido). **Com a lista não concluída, não toca em pontos.** Concluída: sincroniza os pontos de quem mudou, na mesma transação |
| `POST /calendario/eventos/:id/presenca/concluir` | idem | Corpo `{ foram, deGala }` com os totais que o Adm viu; se divergirem do servidor, recusa (`REGRA`). Antes de `inicio`, recusa (`REGRA`). Marca `listaConcluidaEm` (**chamar de novo não regrava o carimbo**), chama `garantirCriteriosDeEvento` e sincroniza as linhas **do roster** (ver abaixo), com aviso para as que estão fora dele; devolve "foram" e "de gala" |
| `POST/PATCH/DELETE /calendario/eventos…` | `calendario.gerenciar` (já existe, `eventos.controller.ts:69-94`) | Gravam os campos planos, **mapeados para colunas** (`gravar` hoje faz spread de `entrada` direto no Prisma, `servico-eventos.ts:146-151`: sem mapear, um campo desconhecido estoura em tempo de execução, e o Jest não checa tipo), com `null` explícito ao trocar o tipo; bundle antigo recusado como em `RecusarMarcacoesAntigas` (`eventos.controller.ts:11-18`). Evento **concluído**: mudar pontos, gala ou data (para outra já passada) estorna e relança todas as linhas na transação (`servico-eventos.ts:177`); **mudar `inicio` para o futuro com lista começada ou concluída: `REGRA`**; apagar estorna todas (confirmação forte, D22). Mudar o tipo de ou para festivo com linhas ou lista concluída: `REGRA`. Gala desligada depois: `comUniforme` fica guardado e é ignorado |
| `GET /calendario`, `GET /calendario/eventos/:id` | `@Logado` | Devolvem os campos planos (`paraSaida`, `servico-eventos.ts:80-94`) e `lista` **só para o Adm**. Se a pergunta 2 for "não", `doAno` e `obter` passam a receber o papel e devolvem `pontos*` nulos aos outros (hoje não recebem: `:112,125`) |
| `GET /sync/pacote` | já existe (`LogadoOuSubstituto`) | Campos planos entram no mapeamento à mão (`sync.service.ts:100-110`); `pontos*` nulos para o substituto sempre, e para conselheiro e instrutor se a pergunta 2 for "não" |
| `GET /visao-geral` | já existe | `eventosSemLista` pela regra única de M5/D22 (`visao-geral.service.ts:86-122`) |

- **Pontos:** só por `ServicoPontos.sincronizar` (`CLAUDE.md:29`), `origemTipo: EVENTO_FESTIVO`, `origemId:
  "<eventoId>:<dbvId>"`, `data` = `inicio` do evento, até dois devidos (participação; uniforme se
  `comUniforme && exigeGala`), valores do evento; devido de 0 não gera lançamento. Para refazer valores:
  `devidos: []` e depois os novos, na mesma transação (o índice único só vale para lançamento ativo). Refazer
  roda dentro de `transacao` com tempo-limite de 20 s (`servico-eventos.ts:246`) e cada pessoa custa 2 a 3
  consultas: com ~62 pessoas e dois lançamentos, o limite é folgado, mas a implementação o mede.
- **Quem entra na lista (roster):** a regra de `CalculoRanking.doMes` (`calculo-ranking.ts:67-91`) extraída
  numa função comum, que **recebe o client da transação por parâmetro** (hoje usa `this.prisma`, o que numa
  transação pega uma segunda conexão e esgota o pool, `servico-eventos.ts:198`), usada pelo ranking e pela
  lista. Acrescenta `entradaEm <= inicio` (`schema.prisma:447`), porque a regra do ranking não olha a data
  de entrada e o desbravador que entrou depois não pode receber pontos de um evento anterior. A unidade da
  Diretoria que veio de DBV é a **anterior** (`:90`). `concluir` conta e sincroniza **só o roster**; linha
  fora dele (virou Diretoria sem ser DBV, ficou inativo) fica guardada, vira aviso, e não entra na conta.
- **Concorrência:** três travas, **sempre nesta ordem**: a do clube (`'eventos-do-clube'`,
  `servico-eventos.ts:187`) só nas gravações do evento; a do evento, **chave própria**
  `hashtext('presenca-festivo'), hashtext(eventoId)`, em marcas, conclusão e regravação do evento; e a de
  critérios. Presença **não** toma a trava do clube (senão cada toque serializaria as edições de evento).
  Dois Adm na mesma lista: vale a última marca de cada linha (D20), e o PUT devolve as linhas autoritativas.
- **Isolamento:** toda leitura e escrita leva `clubeId`; `include` aninhado leva `clubeId` no `where`
  (`CLAUDE.md:9-10`); evento fora do clube responde 404 (`eventoDoClube` e `obter` já filtram `clubeId` e
  `removidoEm`); a guarda de permissão devolve 403 a conselheiro e instrutor antes do 404.
- **Módulos:** `EventosModule` não importa `PontosModule` (`apps/api/src/calendario/eventos.module.ts:10`) e o módulo novo precisa de
  `CalculoRanking` (`RankingModule`) e de `PontosModule`; o sentido é **eventos-festivos → eventos, pontos,
  ranking**, nunca o contrário, para não criar ciclo. O `eventos` chama o novo só por uma função de
  "refazer pontos do evento", passada por injeção.

**Permissão:** reusar `ranking.lancar_manual` (`permissoes.ts:26`, só Adm, sem ajuste). **O catálogo continua
com 24 chaves** (`permissoes.test.ts:6`): nenhum teste de contagem muda. **Risco a registrar:** quando
`POST /ranking/lancamentos` (`API.md:186`) existir, liberar essa chave a um conselheiro libera também a
lista de evento e o `concluir`, e o rótulo "Lançar pontos manuais" não diz isso. Recomendação e alternativa em D11.

**Web:**
- `tipos.ts:10-60` — rótulo "Evento festivo", cor `--cal-festivo-*` (a criar ao lado de
  `ui/tokens.css:39-45`), ícone `PartyPopper` e `Shirt` para a gala (existem em `lucide-react` 1.0.1),
  losango no celular, texto de apoio do tipo. Todo `Record` por tipo é cobrado pelo compilador.
- `FormularioEvento.tsx` — grupo "Uniforme e pontos" só no tipo festivo; marcações do tipo pelo `MARCACOES_PADRAO`
  (`:76` já cobre); validação ao sair dos dois campos de pontos (estado local, M7); frase de efeito; aviso de
  refazer pontos; a frase "o instrutor é avisado" (`:171`) só aparece quando "Terá classe" está desmarcada.
- `FichaEvento.tsx` — cartão "Quem foi ao evento" (4 estados), "Pontos e uniforme"; "Editar" fica secundário
  quando há botão primário; confirmação de excluir que diz quantos pontos saem (`:166-175`); "Evento salvo" por
  um campo novo `salvo` no estado de navegação (`apps/web/src/modulos/adm/navegacao.ts:5-19`; `lerEstado`
  ignora chave nova e `useAvisosDaFicha` limpa o estado, então o aviso precisa ser lido uma vez).
- `AdmCalendario.tsx` e `CalendarioDoCelular.tsx` — pílula festiva que quebra linha, gala em segunda linha,
  **legenda na ordem real de `ROTULOS_DO_TIPO`** com "Uniforme de gala" como item à parte (não entra no
  `Record`), cartão com "Falta registrar quem foi".
- Nova tela `PresencaDoEvento` em `/adm/calendario/eventos/:id/presenca` (`adm/calendario/rotas.tsx:6-11`).
  Computador (≥ 900 px, `ui/larguraDoCelular.ts:2`): tabela própria, com **botão de verdade** também na coluna
  "Foi de gala" (desligado, com o motivo escrito, para quem não foi); abaixo disso, cartões. Quatro estados em
  toda tela que lê da API: carregando, vazio, erro e sem conexão (`CLAUDE.md:34`); conexão só por `useConexao`.
- **Hook da lista** `useMarcasDaPresenca(eventoId)`: guarda, por pessoa, `{ foi, comUniforme, situacao:
  'salva' | 'salvando' | 'falhou' }`; fila de **uma** gravação por vez; `marcar(dbvId, mudanca)`, `marcarEmMassa(
  mudancas)`, `tentarDeNovo(dbvId)`, `salvoAs` (hora da última confirmação) e `pendentes` (quantas marcas ainda
  sem confirmação); só `situacao: 'salva'` desenha a caixa marcada; reconcilia com as linhas devolvidas pelo PUT
  e refaz a leitura ao voltar o foco. Sem internet, `marcar` não aceita toque novo.
- Leitura: `modulos/calendario/` com `CalendarioDeLeitura` (rota `/calendario` no grupo CONSELHEIRO + INSTRUTOR,
  `rotas.tsx:68-85`) lendo `usePacote`; lista **todo** evento do pacote que ainda vai acontecer (festivo,
  acampamento, evento do clube, feriado, férias, reunião extra, sem reunião), **exceto Classe Bíblica**, que
  tem cartão próprio; sem estado de erro (ver acima). `CartaoProximoEvento` em `InicioConselheiro.tsx:289` e
  `TelaInicioInstrutor.tsx:224`, ao lado de `<CartaoClasseBiblica />`: festivo, acampamento e evento do clube;
  a data diz "Hoje" no dia e "Até <dia>" em evento de vários dias já em andamento; a linha de pontos mostra só o
  que vale ("20 por ir", "mais 10 de gala"; só gala: "10 por ir de gala") e some se tudo for zero. Item
  "Calendário" em `LayoutCelular.tsx:18-22`: a barra passa de 4 para 5 itens, com `CalendarRange` (o
  `CalendarDays` já é "Reuniões" e "Cronograma", `:19-20`); `layouts.test.tsx:60-83` enumera os itens. O
  instrutor vê "Datas do clube. As datas das suas classes estão em Cronograma".
- `VisaoGeral.tsx` — item em `PrecisaDeAtencao` (`:156-158`, celular) e **cartão próprio** "Eventos sem lista"
  no computador (`CronogramasAguardando`, `:90-109`, tem título próprio e some se vazio: não serve), somando no
  total de "Precisa de atenção".
- **Cache:** depois de PUT e de concluir, invalidar `['calendario']` (`apps/web/src/api/calendario.ts:12-16`), `['visao-geral']`
  e o ranking.
- `Campo.tsx` **não muda** nesta entrega (D19).
- **Testes e infraestrutura que mudam** (a fase 2 os põe nos pacotes): `fabricas.criarEvento`
  (`apps/api/test/fabricas.ts:486-505`); handlers MSW de calendário, de presença (novo), de Visão geral e do
  pacote; `links-que-navegam.test.ts` (obriga `LinhaQueNavega`/`LinkDeFicha` em `modulos/`); testes de
  `calendario*.test.tsx`, `rotas.test.tsx`, `layouts.test.tsx`; `calendario.test.ts` e `permissoes.test.ts` no
  shared; e2e (só no CI) com um cenário do Adm e um de leitura. O contraste de `--cal-festivo-*` é conferido
  pelas medições do desenho e **repetido no DOM** na implementação.
- **Tamanho:** a revisão estima 78 a 85 arquivos alterados, em quatro camadas (shared + schema + migration ~12;
  API ~17; web do Adm ~30; web de conselheiro e instrutor ~14; docs ~5). **Não cabe num pacote só.** O
  fatiamento é da fase 2.

## Considerado e descartado

| Mecânica / caminho | Motivo |
|---|---|
| Pontos, medalha, sequência, nível, animação ou som ao concluir; contador de ganho ao vivo como o "Salvar chamada · N pts" da reunião (`FormularioChamada.tsx:207`) | Proibido (`gamificacao` §3) e é o pedido. Os pontos do evento são regra do ranking que já existe; a tela mostra **quanto vale o evento** e **quantas pessoas foram**, nunca o que alguém ganhou |
| Todos começam presentes (como a Classe Bíblica) | Presença em evento não foi medida; quem faltou ganharia pontos se o Adm esquecesse de desmarcar. Fica como alternativa em D8 |
| "Marcar a unidade toda" | No máximo 11 toques por unidade; o botão global cobre o caso comum; cada botão a mais é mais uma decisão para quem tem pouca intimidade |
| Etapas nomeadas ou uma pergunta por tela no cadastro | 12 controles, uso eventual: capítulo para 12 campos é burocracia (`gamificacao` §5); o grupo "Uniforme e pontos" já separa o que é novo |
| Valor de pontos pré-preenchido (fixo ou do último evento) | Decisão 3 (nada de valor fixo); um número pronto passa sem ser lido e vale para todos |
| Tempo estimado na entrada | O Adm já conhece a tarefa; não há "entrada" de cadastro a vencer |
| Rascunho só no aparelho (como `FormularioChamada.tsx:144,194`) | O Adm troca de celular para computador; guardado no servidor |
| Fila offline ou presença pelo conselheiro | Decisão 2 |
| Lembrete por sino, e-mail ou push | Culpa e insistência (`gamificacao` §3); tipo de notificação novo exige migration (`schema.prisma:172`); um item que some sozinho basta |
| Barra de progresso na lista | Não há total a cumprir (quem não foi não leva toque): uma barra "41 de 62" pareceria meta. Mostra-se contagem de pessoas |
| Calendário do conselheiro em grade mensal | No celular a lista por mês lê melhor e cabe sem rolagem; o Adm já tem a grade |
| Extrato de pontos por evento para o desbravador | O desbravador não tem login (decisão 1) |
| Subir a letra do `Campo` para 16 px nesta entrega | O componente é usado em ~43 arquivos de tela: seria regressão global dentro de uma feature de eventos. Achado separado (D19) |
| Refatorar a tela e o hook da Classe Bíblica para dividir com a lista | A Classe Bíblica já está entregue e coberta por 427 linhas de teste; tocá-la é risco sem pedido. Duplicação consciente (D24) |
| Recusar excluir evento com lista concluída | O Adm ficaria sem saída para um evento cadastrado errado; a confirmação que diz quantos pontos saem basta (D22) |

## Decisões a confirmar

Impasse → o que adotei | alternativa e o que mudaria para quem usa. As que mais mudam o que o usuário vê
estão primeiro (a numeração é a do texto, não a da ordem). As cinco **perguntas de regra** estão na seção seguinte, e nenhuma é decisão minha.

| # | Impasse → escolha | Alternativa (e o que mudaria) |
|---|---|---|
| D7 | Concluir é o que libera os pontos? → Marcas são **rascunho salvo sozinho**; os pontos só entram em "Concluir a lista"; depois, cada toque ajusta na hora e os botões em massa somem | Pontos a cada toque desde o começo: um passo a menos, mas o ranking (que pode ser público no login) mostraria pontos parciais e um "Marcar todos" errado apareceria nele. Nada salvo até concluir: perde tudo ao sair |
| D8 | Como a lista começa? → **Ninguém marcado**, com dois botões em massa | Todos presentes (como na Classe Bíblica): 1 toque a menos se quase todos foram; quem faltou e não foi desmarcado ganha pontos |
| D21 | Corrigir lista concluída → **desmarcar nunca apaga a linha**; tirar alguém ou o uniforme pede confirmação que diz quantos pontos saem | Sem confirmação (um toque errado tira 30 pontos de alguém, sem aviso e sem rastro) ou linha apagada (some o registro de quem marcou e quando) |
| D22 | Excluir evento com lista concluída e cobrança da lista → excluir **pede confirmação que diz quantos pontos saem** e não dá para desfazer; a cobrança ("Falta registrar quem foi") vale **depois do fim, por 60 dias, e só se o evento vale pontos** | Recusar a exclusão (o Adm sem saída para evento errado) / cobrar desde o início do evento, sem limite e mesmo com 0 pontos (evento de vários dias cobra no meio dele; evento antigo vira pendência eterna). **Os 60 dias são parâmetro meu** |
| D1 | Tipo novo ou campo no existente? → tipo **"Evento festivo"** (palavra do pedido); "Evento do clube" não tem pontos nem lista e por padrão tira a classe do dia (`tipos.ts:41-42`) | Opção "conta pontos" dentro de "Evento do clube": um tipo só, mas campos de pontos em eventos que não pontuam e padrão que tira a classe |
| D18 | Nome do tipo → "Evento festivo", com apoio escrito sob o seletor | "Evento com pontos": diz o que muda, mas foge da palavra do usuário |
| D2 | Marcações do tipo → neutras (reunião e classe do dia continuam) e **editáveis** | Fixas, como a Classe Bíblica: o Adm não conseguiria dizer "neste dia não há reunião" |
| D3 | Gala → sim ou não por evento | Tipos de uniforme: o formulário ganharia um seletor e a lista uma escolha por pessoa, em vez de um toque |
| D4 | Pontos de uniforme → só para quem foi (a pílula "De gala" só liga com "Foi") | Independente: dá para ter "de gala" sem "foi" |
| D5 | Mês e unidade → pontos no mês de `inicio`; ranking por unidade usa a **atual** (a Diretoria que veio de DBV usa a que tinha antes, como o ranking já faz) | Unidade da data do evento: precisa de histórico, e a média por unidade muda |
| D6 | Quando abre e quando conclui → a lista **abre no dia do evento** (`inicio`) e só se conclui de `inicio` em diante, mesmo em evento de vários dias; mudar `inicio` para o futuro com lista começada é recusado | Abrir desde o cadastro: o Adm pré-marcaria inscritos, mas "foi" perderia o sentido |
| D9 | Quem aparece → quem entra no ranking do mês do evento **e já estava no clube** (`entradaEm <= inicio`), agrupado pela unidade atual; sem unidade em "Sem unidade" | Sem o corte de entrada: quem entrou depois pode receber pontos de um evento anterior. Só tipo DBV: Diretoria que veio de DBV não apareceria, mas seus pontos de outros eventos contam |
| D10 | Corrigir → permitido depois do fato; apagar o evento retira os pontos; **mudar data, pontos ou gala de evento concluído refaz os pontos** com aviso (ligada à pergunta 3) | Travar esses campos depois de concluir: nada muda sozinho no ranking, mas erro de digitação só se corrige limpando a lista |
| D11 | Permissão → **reusar `ranking.lancar_manual`**: foi planejada para "participação em evento" (`API.md:186-187`), é só do Adm e sem ajuste, o catálogo fica em 24 chaves. **Risco:** liberá-la a um conselheiro no futuro libera também a lista de evento e o `concluir` | Chave própria `evento.presenca` com Conselheiro e Instrutor `false`: dá para delegar no futuro, mas +1 chave, testes de catálogo mudam e a tela de permissões ganha uma linha |
| D12 | Que critério leva os pontos? → dois critérios novos (gatilhos próprios) com pontos 0 e valor do evento | Lançar com `criterioId` nulo e dois `origemId`: sem migration de gatilho, mas mistura com o desconto por falta e o lançamento perde o nome |
| D13 | Teto dos pontos → inteiro de 0 a 1000 | Sem teto (um 200000 digitado vai ao ranking) ou outro teto |
| D14 | Que eventos entram no cartão "Próximo evento"? → festivo, acampamento e evento do clube. Feriado, férias, sem reunião e reunião extra **não** entram: o cartão da reunião só mostra data, reunião extra e "Férias até" (`InicioConselheiro.tsx:102-142`), e feriado e sem reunião só deslocam a data; a Classe Bíblica tem cartão próprio. O calendário de leitura lista **todos** | Todo tipo no cartão (repetiria férias e feriado) ou só festivo (acampamento não apareceria no início) |
| D15 | De onde lê o calendário de leitura → do pacote offline (`sync.service.ts:90-111`); o texto não promete número de meses | Ano inteiro online pela API: vê além da janela guardada, mas não abre sem internet |
| D16 | Onde mora o calendário → item "Calendário" na barra inferior (5 itens, ícone `CalendarRange`) | Só atalho no início e link no cartão: barra com 4 itens, calendário a um toque a mais |
| D17 | Aviso de lista pendente → ficha, cartão do calendário **e** Visão geral (celular e computador) | Sem aviso na Visão geral: o Adm só descobre abrindo cada evento passado |
| D19 | `Campo` em 14 px, abaixo do piso → o desenho **segue o componente** e a letra dos formulários vira achado separado | Subir rótulo, apoio e erro a 16 px no componente comum: vale para todos os formulários, ~43 arquivos de tela, regressão visual esperando acontecer |
| D20 | Dois Adm na mesma lista → vale a última marca de cada linha; o PUT devolve as linhas autoritativas, a tela refaz a leitura ao voltar o foco e `concluir` recusa se os totais divergirem | `versao` por linha, como na chamada (`CLAUDE.md:33`): mais código para um caso raro |
| D23 | O resumo da lista (`foram`, `deGala`, `concluidaEm`) → campo `lista` do evento do **Adm**, fora do pacote | No `EventoSaida` comum: todo conselheiro, instrutor e substituto o receberia, e o hash do pacote mudaria a cada toque |
| D24 | Reaproveitar o hook e a tela da Classe Bíblica? → **hook e componentes novos**; a Classe Bíblica não é tocada | Extrair comuns: menos código repetido, mas refatora uma tela entregue e coberta por 427 linhas de teste |
| D25 | O critério de fábrica "Participação em evento" (MANUAL, 20 pontos) → **fica como está**, sem uso, anotado para a futura tela de critérios | Desativá-lo ou apagá-lo: some uma linha que hoje não faz nada, mas é mexer em dado de todos os clubes |

## Perguntas de regra de negócio

Abertas. Nenhuma tem resposta sugerida; o desenho assume o que está dito.

1. **Um evento sem uniforme de gala pode dar pontos de uniforme** (o uniforme comum)? O desenho só tem
   pontos de uniforme quando o evento pede gala. Contexto: a reunião já tem "Uniforme completo" com pontos
   (`clube-criar.ts:29`).
2. **Conselheiro e instrutor devem ver quantos pontos vale cada evento?** O desenho mostra a linha "Vale
   pontos no ranking…" na lista de leitura e no cartão, porque hoje o calendário já entrega todos os campos a
   qualquer pessoa logada. Se a resposta for "não", o servidor filtra em três lugares (ver Descobribilidade).
3. **Se o Adm mudar os pontos, a data ou o uniforme de gala de um evento depois de concluir a lista, os pontos
   já dados mudam?** O quadro `Form-Festivo-Editar` desenha "sim, com aviso"; a resposta pode trocá-lo por
   campos travados.
4. **A falta num evento festivo desconta pontos**, como a falta na reunião quando o clube liga o desconto
   (`schema.prisma:252-253`)? O desenho não desconta nada.
5. **Em evento de mais de um dia, basta ter ido a um dia para ganhar os pontos?** O desenho tem uma marca por
   evento, com os pontos na data de início.

ONDE FICA

```
- tipos de evento, marcações padrão                  packages/shared/src/enums.ts:37, :57-66 ; apps/api/prisma/schema.prisma:140-148, :878-899
- regra do dia (festivo entra como comum)             packages/shared/src/formulas/calendario.ts:57-75 ; validarEvento :183-188
- contrato do evento e do pacote                      packages/shared/src/contratos/calendario.ts:7-26 ; contratos/sync.ts:55, :85
- gatilhos e origem de pontos                         apps/api/prisma/schema.prisma:93-104, :126-132 ; packages/shared/src/formulas/pontos.ts:3-14
- única escrita de pontos e quem a chama              apps/api/src/pontos/servico-pontos.ts:6-60 ; classe-biblica/servico-chamada.ts:177-210 ; reunioes/reunioes-envio.service.ts:315-343 ; progresso/requisitos-dbv.service.ts:44-76 ; especialidades/especialidades-dbv.service.ts:68, :96 ; aulas/aulas-envio.service.ts:407 ; aulas/tarefas-envio.ts:280
- critério de fábrica sem uso, rotas prometidas       apps/api/src/scripts/clube-criar.ts:26-35 ; docs/planejamento/API.md:186-187
- molde de critérios idempotentes                     apps/api/src/classe-biblica/criterios.ts
- ranking do mês (quem entra, unidade, soma)          apps/api/src/ranking/calculo-ranking.ts:60-91, :122-136, :149-157
- permissões                                          packages/shared/src/permissoes.ts:26, :30, :62-63 ; permissoes.test.ts:6
- API do evento                                       apps/api/src/calendario/eventos.controller.ts:12-45, :54-94 ; servico-eventos.ts:45, :80-94, :112-164, :177-198, :230-248, :250
- pacote offline                                      apps/api/src/sync/sync.service.ts:77, :90-111 ; sync.controller.ts:12 ; apps/web/src/offline/pacote.ts:27-48 ; offline/usePacote.ts:26 ; offline/tipos.ts:143-150 ; offline/tempos.ts:19
- visão geral                                         apps/api/src/visao-geral/visao-geral.service.ts:86-122, :239-250 ; packages/shared/src/contratos/visao-geral.ts:18 ; apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:90-109, :156-158, :269 ; apps/web/src/testes/handlers/visao-geral.ts:5-21
- guarda de clube                                     apps/api/src/comum/prisma/guarda-clube.ts:4-48 ; guarda-clube.spec.ts:71-122
- registro de atividade                               apps/api/prisma/schema.prisma:1208 ; apps/api/src/atividades/servico-atividade.ts
- calendário do Adm (web)                             apps/web/src/modulos/adm/calendario/tipos.ts:10-60 ; AdmCalendario.tsx:25, :54-71, :237-253 ; CalendarioDoCelular.tsx:19-54, :85-126 ; FichaEvento.tsx:87-175 ; FormularioEvento.tsx:42, :46-120, :124-179 ; EditarEvento.tsx:43-50 ; rotas.tsx:6-11 ; apps/web/src/ui/tokens.css:39-45
- navegação da ficha (estado de volta)                apps/web/src/modulos/adm/navegacao.ts:5-19
- chamada da reunião (Adm sem rascunho)               apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:31, :144, :185-190, :194, :207, :251
- lista por unidade da Classe Bíblica (molde visual)  apps/web/src/modulos/classe-biblica/chamada/TelaChamadaCB.tsx:225-299, :327-371
- salvar sozinho (ideia, não reaproveitado)           apps/web/src/modulos/adm/classe-biblica/useRascunhoDaEdicao.ts:2, :34-83 ; EtapaDados.tsx:29-42
- cartão do início que lê o pacote                    apps/web/src/modulos/inicio/CartaoClasseBiblica.tsx ; InicioConselheiro.tsx:102-142, :289 ; inicio-instrutor/TelaInicioInstrutor.tsx:224 ; inicio/Inicio.tsx:36-39
- montagem de cronograma (instrutor vê nomes)         apps/web/src/modulos/cronograma-montagem/datas.ts:41-51
- rotas, barra do celular, guarda de rota             apps/web/src/rotas.tsx:44-48, :68-105 ; layouts/LayoutCelular.tsx:18-22, :48-51 ; layouts.test.tsx:60-83 ; sessao/GuardaRota.tsx:22 ; modulos/acesso/papeis.ts:15 ; ui/larguraDoCelular.ts:2
- componentes comuns                                  apps/web/src/ui/Campo.tsx:18-51 ; Tabela.tsx:36-62 ; EstadosDeCarga.tsx ; ErrosDoFormulario.tsx:30-45
- fábricas e handlers de teste                        apps/api/test/fabricas.ts:486-505 ; apps/web/src/testes/handlers/
- regras do projeto                                   CLAUDE.md:9-10, :20, :29, :30, :33, :34
- tamanho do clube (premissa do planejamento)         docs/planejamento/VISAO.md:78 ; docs/planejamento/ROADMAP.md:59
- moldes de spec                                      docs/fases/classe-biblica/SPEC.md:203-211, :256-258, :289-291 ; docs/fases/calendario-ferias-extras/SPEC.md:103-104, :389-414
- desenho do ranking (única menção a "gala")          docs/design/telas/Adm-Ranking.dc.html:86
- docs que esta entrega deixa desatualizados          README.md:36, :98 ; docs/planejamento/MODELO-DE-DADOS.md:149, :325 ; docs/planejamento/API.md:95-103, :186-187, :239 ; docs/planejamento/INCONSISTENCIAS.md:39
- conferido em   77755d2
```
