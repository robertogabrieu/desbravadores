# Férias, reunião extra e marcações afirmativas no calendário — SPEC

Hoje o calendário do clube só sabe **tirar**: um evento cancela a reunião ou bloqueia a aula, e a
"próxima reunião" do conselheiro é só o próximo dia da semana do clube, mesmo no meio das férias.
Esta SPEC faz três coisas: as marcações do evento passam a ser **afirmativas** ("Terá reunião",
"Terá classe"); entram dois tipos novos, **Férias** e **Reunião extra**; e todas as telas que
dizem "quando é a próxima reunião" ou "em que data cabe uma classe" passam a usar **uma regra só**,
em `packages/shared`. De quebra, todo texto que o usuário lê troca **"aula" por "classe"**.

## O que muda para quem usa

- **Adm, formulário do evento:** dois tipos novos. Os tipos de sempre têm as caixas no positivo —
  **Terá reunião**, **Terá classe**, **Terá atividade de campo** —, já marcadas pelo tipo.
  **Férias** não tem caixa nenhuma. **Reunião extra** tem uma data só e duas caixas (Terá
  reunião, Terá classe), ao menos uma marcada. Sob o seletor de Tipo, uma linha explica o tipo
  escolhido.
- **Adm, calendário:** férias aparecem como faixa no período, e o dia de reunião dentro delas
  deixa de ser pintado como reunião; a reunião extra aparece na data dela com o selo "Reunião
  extra 19h" (ou "Classe extra 19h"), com ícone próprio.
- **Adm, ficha do evento:** "O que muda no calendário" diz, por exemplo, **"Terá reunião: Não
  (domingo 18)"** em vez de "Cancela a reunião de domingo 18: Sim".
- **Conselheiro, início:** a próxima reunião respeita o calendário, com ou sem internet. Nas
  férias: **"Férias até 31/01 · próxima reunião domingo 2/02"**. Numa reunião extra de quarta, o
  cartão mostra a quarta, com nome, horário e local da extra, e "Fazer chamada" aparece nesse dia;
  a chamada já vem com o horário e o local da extra.
- **Instrutor e Adm, montagem do cronograma:** os dias normais dentro das férias somem da lista
  (acampamento dentro das férias continua aceitando classe); a reunião extra com "Terá classe"
  aparece como data de classe. Criar férias sobre classe já marcada avisa o instrutor, como hoje.
- **App inteiro:** "aula" vira "classe" em todo texto visível (inventário abaixo). Nomes internos
  (rotas `/aulas`, `AulaPlanejada`, `RegistroAula`) ficam.
- Nenhum evento já gravado muda de comportamento: a conversão inverte os valores.

## A regra do dia (uma só, em `packages/shared/src/formulas/calendario.ts`)

Para uma data, olham-se os eventos não removidos que a cobrem, em dois grupos: **comuns** (Evento,
Feriado, Acampamento, Sem reunião, Férias) e **a extra** (a Reunião extra da data — no máximo uma).
"Dia normal" = o dia da semana é o `diaReuniao` do clube.

| Nome | Conta |
|---|---|
| `reuniaoMantida` | todo comum tem Terá reunião |
| `classeLiberada` | todo comum tem Terá classe |
| `bomParaCampo` | algum comum é bom para campo |
| `temReuniao` | (dia normal **e** `reuniaoMantida`) **ou** extra com Terá reunião |
| `temClasse` (trilha individual) | (`classeLiberada` **e** ((dia normal **e** `reuniaoMantida`) **ou** `bomParaCampo`)) **ou** extra com Terá classe |
| `emConflito` (data deixou de ser de classe) | **não** há extra com Terá classe **e** (`!classeLiberada` **ou** (`!reuniaoMantida` **e** `!bomParaCampo`)) |
| horário e local do dia | os da extra, quando preenchidos; senão os do clube |

- **Entre comuns, qualquer um que tire, tira** (como hoje, `calendario.ts:36-45`).
- **A extra só acrescenta e vence a sobreposição.** Extra dentro de férias, ou num feriado com
  "Terá classe: não", acontece como marcada: o Adm a criou de propósito sobre aquela data, e
  deixar um comum apagá-la faria a extra sumir calada. Extra com "Terá reunião: não" num dia
  normal não cancela o dia; quem quer tirar usa "Sem reunião".
- **Férias** é gravada como Terá reunião = não, Terá classe = **sim**, campo = não. Assim tira
  reunião e classe dos dias normais (sem reunião e sem campo não há classe) e **não** derruba a
  data boa para campo de um acampamento no meio das férias (`classeLiberada` continua verdadeira).
- **Conflito mantém a semântica de hoje** (`calendario.ts:75`: `bloqueiaAula || (cancelaReuniao
  && !bomParaCampo)`): só há conflito quando um evento que cobre a data tira a classe. Data sem
  evento nunca é conflito, então classes antigas e cronogramas publicados não mudam. Excluir ou
  encurtar um evento que tornava a data de classe (acampamento, extra) entra pelo antes/depois que
  já existe (`servico-eventos.ts:150-190`), que compara os dois estados com a mesma função.
- **Equivalência:** com `temReuniao = !cancelaReuniao` e `temClasse = !bloqueiaAula`, `temClasse`
  é o `datasDeAula` de hoje (`calendario.ts:55-61`) e `emConflito` é o de hoje (`:73-83`). O teste
  percorre as 8 combinações das três marcações antigas num evento só, num dia normal e num dia
  fora dele, e compara fórmula antiga (copiada no teste) com a nova.

### Funções do shared

| Hoje | Passa a ser |
|---|---|
| `EventoDoCalendario` (`calendario.ts:9-17`) | ganha `tipo`, `horario`, `local`; `temReuniao`, `temClasse` no lugar das negativas |
| `situacaoDaData(data, eventos)` (`:37-45`) | `situacaoDaData(data, diaReuniao, eventos)` → `reuniaoMantida`, `classeLiberada`, `bomParaCampo`, `temReuniao`, `temClasse`, `ferias`, `extra` (`{ nome, temReuniao, temClasse, horario, local }` ou `null`), `eventos` (nomes) |
| `diasDeReuniao` (`:48-52`) | usa `temReuniao` (inclui extras fora do dia normal) |
| `datasDeAula` (`:55-61`) | renomeada `datasDeClasse`; usa `temClasse` |
| `emConflito` (`:73-83`) | recebe a situação nova; conta da tabela |
| — | `datasDaMontagem(inicio, fim, diaReuniao, eventos)`: dias normais fora de férias, datas boas para campo e datas de extra **com Terá classe** |
| — | `proximaReuniao(hoje, diaReuniao, eventos, limiteEmDias = 120)` → `{ data, extra }` ou `null`; hoje inclusive |
| — | `feriasAte(hoje, diaReuniao, eventos)` → ver "Início do conselheiro" |
| — | `validarEvento(entrada)` → lista de `{ campo, mensagem }` (regras abaixo) |

`SituacaoData` (`contratos/cronograma.ts:44-47`) passa a ser o retorno novo. Toda chamada muda:

| Onde | Como fica |
|---|---|
| `ServicoCalendario.situacoes` (`servico-calendario.ts:12-23`) | lê o `diaReuniao` do clube por dentro (quem chama não muda) e seleciona `tipo`, `horario`, `local`, `temReuniao`, `temClasse` |
| `servico-eventos.ts:181` (aulas afetadas) | passa `configuracao.diaReuniao` (já lida em `:160`) |
| `servico-cronograma.ts:189` | o valor de reserva `situacaoDaData(aula.data, [])` ganha o `diaReuniao` |
| `servico-cronograma.ts:213-216` | sem mudança: vem de `ServicoCalendario.situacoes` |
| `servico-montagem-leitura.ts:124` | o valor fixo no formato antigo vira `situacaoDaData(data, diaReuniao, [])` |
| `servico-montagem-leitura.ts:98-101` | a regra duplicada à mão sai; datas = `datasDaMontagem` ∪ datas com classe marcada (`:102`) |
| `servico-montagem.ts:356-369` | `datasDeClasse`; seleciona `tipo` e as positivas |
| `cronograma-montagem/datas.ts:16-27` (web) | `dataBloqueada` = `!temClasse` **e** (sem classe marcada **ou** `!classeLiberada`); "reunião mantida" usa `reuniaoMantida` |

## Banco e migration

- Conferido no schema (`schema.prisma:131-136`, `:829-851`) e na criação
  (`migrations/20260930120000_fase2_3_instrutor_adm/migration.sql:2,17-34`): tabela
  `"EventoCalendario"`, enum `"TipoEvento"`. Conferir de novo no banco antes de escrever.
- Migration `20261002120000_calendario_ferias_extras`, escrita à mão (o Prisma geraria apagar e
  recriar as colunas, perdendo os valores):
  1. `ALTER TYPE "TipoEvento" ADD VALUE 'FERIAS'` e `'REUNIAO_EXTRA'` (nada na migration usa os
     valores novos, o que o Postgres 17 exige dentro da transação).
  2. Colunas `temReuniao`, `temClasse` (`BOOLEAN`); `UPDATE` com `NOT "cancelaReuniao"` e `NOT
     "bloqueiaAula"`; `SET NOT NULL`; `DROP` das antigas. Nenhum `INSERT`; nenhum modelo novo.
- **Só de ida.** Volta mínima, guardada como registro na PR (não é passo do deploy): recriar
  `cancelaReuniao`/`bloqueiaAula` com `NOT` das positivas e converter Férias e Reunião extra em
  "Sem reunião" (o enum fica com os valores; o Postgres não remove valor de enum).
- **Teste da migration** (no banco local, registrado na PR): (1) na base `8f142ef`, `npm run
  db:migrate` até a migration anterior; (2) criar, pela fábrica `criarEvento`
  (`test/fabricas.ts:410-427`), um evento de cada um dos 4 tipos antigos em cada uma das 8
  combinações de marcações; (3) guardar `situacaoDaData` de cada data pela fórmula antiga; (4) na
  branch, aplicar a migration; (5) conferir por `SELECT` os valores invertidos e que a fórmula nova
  dá as mesmas situações.
- Prisma: `TipoEvento` ganha os dois valores; `EventoCalendario` troca as colunas. Shared:
  `TIPOS_EVENTO` (`enums.ts:37`) ganha `'FERIAS', 'REUNIAO_EXTRA'` no fim; `MARCACOES_PADRAO`
  (`enums.ts:57-62`) invertido e acrescido:

| Tipo | Terá reunião | Terá classe | Terá atividade de campo | No formulário |
|---|---|---|---|---|
| Sem reunião | não | não | não | três caixas |
| Evento do clube | sim | não | não | três caixas |
| Acampamento / campo | não | sim | sim | três caixas |
| Feriado | sim | sim | não | três caixas |
| **Férias** | não | sim (interno) | não | nenhuma; a API grava sempre estes |
| **Reunião extra** | sim | sim | não (sempre) | Terá reunião e Terá classe |

## Contrato e API

- **Evento** (`contratos/calendario.ts:6-23`): `EventoEntrada` e `EventoSaida` trocam as
  negativas por `temReuniao`, `temClasse`. O `refine` de datas (`:18`) sai do objeto e vai para
  `validarEvento`, junto com as regras novas:
  - fim antes do início → "O fim não pode ser antes do início" (`fim`);
  - Reunião extra com `fim ≠ inicio` → "A reunião extra é de um dia só." (`fim`; só a API vê,
    porque o formulário tem um campo Data);
  - Reunião extra sem Terá reunião e sem Terá classe → "Marque Terá reunião, Terá classe ou as
    duas." (`temReuniao`).
- **Gravar** (`eventos.controller.ts:10-31`): marcações continuam opcionais, com o padrão do
  tipo; Férias grava sempre o padrão e Reunião extra grava campo = não, ignorando o enviado.
  `validarEvento` roda **depois** de `comMarcacoes` (`:23-31`; hoje o `refine` roda antes, `:18`)
  e erro vira `ErroApp('VALIDACAO', 'Confira os campos informados.', campos)`, o mesmo formato do
  pipe (`zod-validation.pipe.ts:12-17`) — nunca 500.
- **Aba antiga:** corpo com `cancelaReuniao` ou `bloqueiaAula` → `ErroApp('VALIDACAO', 'Atualize o
  app para salvar este evento.')` **sem** `campos`, para cair na mensagem geral do formulário
  (`adm/desbravadores/erros.ts:36-37`). Hoje o objeto não é estrito e as chaves sumiriam caladas.
- **Duas extras na mesma data:** recusada dentro da transação com a trava do clube
  (`servico-eventos.ts:149-151`): "Já há uma reunião extra nesta data." (`VALIDACAO`, campo
  `inicio`, que é o campo Data do formulário).
- **Calendário do ano** (`servico-eventos.ts:77-87`): `diasDeReuniao` inclui as extras com Terá
  reunião e exclui dias em férias, pela fórmula; contrato igual.
- **Situação da data na montagem:** ver tabela de chamadas acima.
- **Início do conselheiro** (`inicio.service.ts:15-21,65-76`; `contratos/inicio.ts:8-20`):
  `proximaData` sai; a API lê os eventos com `inicio <= hoje+120` e `fim >= hoje` e usa
  `proximaReuniao` e `feriasAte`. `proximaReuniao` ganha `nome` (da extra, ou `null`), com horário
  e local do dia (tabela da regra). `InicioConselheiroSaida` ganha `feriasAte` (data ou `null`),
  também no retorno do conselheiro sem unidade (`inicio.service.ts:44`, `null`).
- **Pacote offline** (`sync.service.ts:50-71`; `contratos/sync.ts:42-71`): `PacoteSaida` ganha
  `calendario` — eventos não removidos com `inicio <= hoje+120` e `fim >= hoje` (mesmo filtro do
  início), com tipo, nome, datas, horário, local e marcações — com `.default([])`, como
  `instrutor` (`sync.ts:70`). Vai para todos os papéis; muda a `versao` quando o calendário muda
  (`sync.service.ts:72`), o que é o desejado.
- **Trocar o dia de reunião** (`clube.service.ts:43-59`): a trava já ignora classe fora do dia
  normal (`:52`), então extra de quarta nunca travou. Muda só um caso: classe marcada num domingo
  (dia atual) que tem reunião extra com Terá classe deixa de travar — a extra segura a data
  mesmo com o dia trocado.
- **Chamada:** a API não muda; a criação aceita qualquer data entre hoje e 30 dias atrás, sem
  olhar o dia da semana (`reunioes-envio.service.ts:160-170`).

## Telas

### Formulário do evento (`FormularioEvento.tsx`)

- Tipos novos no seletor (`:83-89`, via `ROTULOS_DO_TIPO`, `tipos.ts:6-11`: "Férias", "Reunião
  extra"). Sob o seletor, texto de apoio por tipo; para os dois novos: "Férias: sem reunião e sem
  classe nos domingos do período; acampamentos continuam valendo." e "Reunião extra: uma data fora
  do domingo, com chamada da unidade, classe ou as duas." (o dia vem de `useConfiguracaoClube`, já
  usado em `FichaEvento.tsx:54`; sem ele, "nos dias de reunião").
- Legenda das caixas (`:99`): "Para a reunião e as classes". Caixas (`:100-102`) na ordem Terá
  reunião, Terá classe, Terá atividade de campo; Férias esconde o grupo; Reunião extra mostra
  só as duas primeiras.
- **Erro sob o grupo das caixas:** `CaixaMarcacao` não tem erro (`ui/CaixaMarcacao.tsx:5-7`). O
  erro de `temReuniao` sai num `<p id>` com `role="alert"` logo abaixo das caixas, dentro do
  `<fieldset>`, que ganha `aria-describedby` apontando para ele. A mensagem é a que veio de
  `validarEvento` (o mapa fixo `MENSAGENS_DE_CAMPO`, `:24-30,66`, não vale para este campo).
- O formulário chama `validarEvento` (hoje `EventoEntrada.safeParse`, `:61`) com as marcações do
  tipo já aplicadas.
- Reunião extra: um campo **Data** no lugar de Início e Fim (`:90-93`), gravando `fim = inicio`;
  trocar o tipo para Reunião extra copia o início no fim. Se a data cai no dia normal: aviso sob
  a Data "Domingo já tem reunião: esta reunião extra só muda nome, horário e local."
- Aviso "Sem reunião e sem campo, não há classe nesses dias." sob as caixas só quando Terá classe
  está marcada e Terá reunião e campo não estão (a caixa não muda sozinha).
- Texto de apoio do fim (`:104`): "…Se já houver classes marcadas no período, o instrutor é avisado."

### Ficha do evento (`FichaEvento.tsx:118-129`)

Valores calculados com a regra do dia aplicada só a este evento. Mais de três dias na lista vira
"Não (9 domingos, de 7/12 a 1/02)". Sem `diaReuniao` carregado (configuração carregando ou com
erro), só "Sim"/"Não", sem os parênteses — como o rótulo simples de hoje (`:42-43`).

| Tipo | Pares |
|---|---|
| Evento, Feriado, Acampamento, Sem reunião | **Terá reunião**: "Sim (domingo 18)", "Não (domingos 11 e 18)", "Não há domingo no período"; **Terá classe**: "Sim (sexta 16 a domingo 18)" com campo, "Não (domingo 18)"; **Terá atividade de campo**: Sim/Não |
| Férias | um par só: "Sem reunião e sem classe nos domingos do período; acampamentos continuam valendo." |
| Reunião extra | tabela abaixo |

| Reunião extra | Fora do dia normal (quarta 21) | No dia normal (domingo 18) |
|---|---|---|
| Terá reunião: sim | "Sim (quarta-feira 21)" | "Sim — domingo 18 já tem reunião; vale o horário e o local deste evento" |
| Terá reunião: não | "Não" | "Não acrescenta — domingo 18 segue o calendário" |
| Terá classe: sim | "Sim (quarta-feira 21)" | "Sim (domingo 18)" |
| Terá classe: não | "Não" | "Não acrescenta — domingo 18 segue o calendário" |

O aviso logo depois de salvar (`:87-97`) passa a "Classes afetadas".

### Calendário do Adm (`AdmCalendario.tsx`)

- Férias ganha cor própria (tokens `--cal-ferias-bg/fg` em `ui/tokens.css:39-43`, entrada em
  `CORES_DO_TIPO`, `tipos.ts:14-19`) e já sai como faixa pelo desenho atual (`:229-240`).
- Reunião extra: a faixa usa `COR_DA_REUNIAO` (`tipos.ts:21`). Na célula, o selo de reunião
  (`:219-228`, hoje "Reunião 19h") vira **"Reunião extra 19h30"** (horário da extra, senão do
  clube), com ícone de calendário com "+" antes do texto; extra só com classe: **"Classe extra
  19h30"**. No dia normal, só o selo da extra (sem o regular duplicado). No celular o selo é só
  para leitor de tela (`:222`); lá a distinção fica na lista de eventos sob a grade, que já diz
  o tipo (`:124`).
- Legenda (`:70`) acompanha os tipos. Vazio (`:108`): "Cadastre feriados, férias, acampamentos,
  dias sem reunião e reuniões extras para que o cronograma das classes os respeite."

### Início do conselheiro (`InicioConselheiro.tsx`)

- Com internet, a resposta da API; sem internet, `proximaReuniaoDoPacote` (`:49-63`) chama
  `proximaReuniao` e `feriasAte` com `pacote.calendario ?? []` (pacote guardado antes da mudança
  não tem o campo; lista vazia dá a regra do dia da semana de hoje).
- Vindo do pacote, o cartão diz embaixo "calendário de 28/01" (de `baixadoEm`,
  `offline/usePacote.ts:33`).
- `feriasAte`: a partir do primeiro dia normal ≥ hoje **sem reunião**, se ele está em férias,
  devolve o fim delas; férias seguidas se juntam quando **nenhum dia normal com reunião** fica
  entre elas. Se o primeiro dia normal tem reunião (uma extra nele), `null`.
- Cartão (`:70-101`): acima da data, "Férias até 31/01" quando houver; abaixo da data, o nome da
  extra. Sem reunião em 120 dias: "Nenhuma reunião marcada." (`:71`), ou, com férias,
  "Férias até 15/03 · nenhuma reunião marcada nos próximos 4 meses."

### Chamada (`reunioes/chamada/FormularioChamada.tsx`)

O cabeçalho padrão (`:130`, hoje sempre `pacote.clube.horaReuniao` e `localReuniaoPadrao`) usa o
horário e o local do dia (`situacaoDaData` com `pacote.calendario ?? []` e `props.data`, `:107`):
os da extra quando houver, senão os do clube. Rascunho e fila continuam vencendo o padrão.

### Montagem (`cronograma-montagem/`)

Datas pela tabela de chamadas (só trilha individual; as agrupadas seguem livres,
`servico-montagem-leitura.ts:144`). Rótulos (`datas.ts:24-26`): "sem classe" (hoje "sem aula de
classe"), "ótimo para campo", "reunião mantida", e o novo "reunião extra". Dia normal em férias
não aparece; com classe marcada, aparece (em conflito, pela regra).

Nenhum elemento `fixed`/`sticky` novo; "Voltar" com destino explícito; as telas tocadas mantêm
carregando, vazio, erro e sem conexão.

## "Aula" → "classe" (inventário)

"classe" onde o contexto deixa claro que é o encontro; **"dia de classe"** onde "classe" seria
lido como a do caderno (Amigo, Companheiro…), sobretudo em listas, escolhas e no criar/remover da
montagem. "LS" = lido só por leitor de tela (`aria-label`). Nomes internos ficam.

| Tela | Onde | Hoje → passa a ser |
|---|---|---|
| Início do instrutor | `TelaInicioInstrutor.tsx:29,80` | "Registrar aula" → "Registrar classe" |
| | `:48` (LS), `:57` | "Próxima aula de X" / "Próxima aula · 17/10" → "Próxima classe de X" / "Próxima classe · 17/10" |
| | `:64`, `:70`, `:75` | "Aula sem título" / "Nenhuma aula publicada ainda" / "Aula de hoje registrada" → "Classe…" / "Nenhuma classe…" / "Classe de hoje registrada" |
| | `:129` | "faltaram às duas últimas aulas de X" → "…últimas classes de X" |
| Classes do instrutor | `classes/TelaClasses.tsx:43-44` | "Próxima aula: …" / "Nenhuma aula publicada ainda" / "N aulas dadas" → "Próxima classe: …" / "Nenhuma classe…" / "N classes dadas" |
| Registro sem conexão | `aulas/RegistroSemConexao.tsx:23,34,37,54` | "registrar a aula", "Próxima aula · …", "Registrar aula", "Registrar aula de hoje" → "classe" |
| Registro de aula | `aulas/FormularioAula.tsx:147,149,156,158,223,238` | "A aula fica guardada…", "Registro de aula", "Requisitos desta aula", "Nenhum requisito nesta aula…", "…não perder aulas guardadas", "Salvar aula · N presentes" → "classe" |
| | `aulas/TelaRegistroAula.tsx:40,139,153` | "registro de aula", "Esta aula não está neste aparelho" → "classe" |
| | `aulas/EstadosAula.tsx:9` (LS) | "Carregando a aula" → "Carregando a classe" |
| | `api/aulas.ts:78` | "Aula salva" → "Classe salva" |
| Fila / envios | `offline/tipos/aula.ts:31,90` | "Correção na aula" / "Aula · X" / "Faltaram à aula…" → "classe" |
| | `layouts/SeloPapel.tsx:15` | "da aula" → "da classe" |
| Cronograma (leitura) | `cronograma/TelaCronograma.tsx:30` | "Aula extra" → **"Fora do cronograma"** (não colide com Reunião extra) |
| | `:80` (LS), `:91`, `:142` | "Aula de …" / "Aula sem título" / "Nenhuma aula neste cronograma." → "Classe…" |
| Montagem | `LinhaData.tsx:61` | "Conflito: não há aula de classe nesta data." → "Conflito: não há classe nesta data." |
| | `:63` | "Aula dada" → "Classe dada" |
| | `:101,110,119` | "Remover aula" / "Remover esta aula?" / "…desta aula voltam…" → "Remover dia de classe" / "Remover este dia de classe?" / "…deste dia de classe voltam…" |
| | `PainelInstrutor.tsx:86`, `PainelAdm.tsx:111` | "+ Nova aula" → "+ Novo dia de classe" |
| | `PainelInstrutor.tsx:90`, `PainelAdm.tsx:117-118` | "Nenhuma aula ainda" / "Nenhuma data de aula neste período" / "Crie uma aula para…" → "Nenhum dia de classe ainda" / "Nenhuma data de classe…" / "Crie um dia de classe para…" |
| | montagem `FormularioAula.tsx:43` | "Nova aula" / "Editar aula" → "Novo dia de classe" / "Editar dia de classe" |
| | `FolhasDoInstrutor.tsx:93`, `datas.ts:24` | "Nenhuma outra data aceita aula." / "sem aula de classe" → "…aceita classe." / "sem classe" |
| Observações | `observacoes/TelaObservacoes.tsx:29,126` | "Por aula" / "Sobre uma aula" → "Por dia de classe" / "Sobre um dia de classe" |
| | `:38`, `:99`, `:136` | "Aula · 17/10" / "Escolha a aula." / rótulo "Aula" → "Classe · 17/10" / "Escolha o dia de classe." / "Dia de classe" |
| | `:132,134` | "Carregando aulas…" / "Nenhuma aula registrada ainda: registre a aula…" → "classes" / "classe" |
| Calendário do Adm | `EditarEvento.tsx:23` | "1 aula estava marcada" / "N aulas estavam marcadas" → "1 classe estava…" / "N classes estavam…" |
| | `FichaEvento.tsx:88` (LS), `:89` | "Aulas afetadas" → "Classes afetadas" |
| | `FormularioEvento.tsx:99,101,104`, `FichaEvento.tsx:124` | ver Telas |
| Permissões | `shared/src/permissoes.ts:21` | "Registrar aulas" → "Registrar classes" |
| Erros e avisos da API | `servico-montagem.ts:28`, `:80`, `:135` | "Esta aula já foi dada." / "Há aulas fora do novo período…" / "Já existe uma aula nesta data." → "Esta classe…" / "Há classes…" / "Já existe dia de classe nesta data." |
| | `:102`, `:128`, `:367` | "Crie a aula desta data…" / "Só as classes agrupadas criam aula em qualquer data." / "Esta data não é dia de aula." → "Crie o dia de classe desta data…" / "Só as classes agrupadas aceitam qualquer data." / "…dia de classe." |
| | `:313,319` | "Aula não encontrada." → "Dia de classe não encontrado." |
| | `aulas/aulas.service.ts:17`, `aulas-envio.service.ts:182`, `observacoes.service.ts:79` | "Aula não encontrada." → **"Registro de classe não encontrado."** |
| | `aulas-envio.service.ts:41,178,183,190,194,203` | "Esta aula foi registrada fora…", "Esta aula não pôde…", "A data de uma aula registrada…", "…há mais de 7 dias…", "A data da aula deve…", "Esta aula já não pode…" → "classe" |
| | `aulas-envio.service.ts:402` (atividade) | "registrou a aula de X" → "registrou a classe de X" |
| | `clube/clube.service.ts:58` | "Há aulas marcadas no dia atual de reunião…" → "Há classes marcadas…" |
| | `calendario/servico-eventos.ts:303-304` (notificação) | "Aula em conflito com o calendário" / "…deixou de ser dia de aula." → "Classe em conflito…" / "…dia de classe." |
| | `shared/src/contratos/observacoes.ts:15` (só via API: a tela valida antes, `TelaObservacoes.tsx:99`) | "Escolha a aula ou o desbravador" → "Escolha o dia de classe ou o desbravador" |

Levantado por busca da palavra em `apps/web/src`, `apps/api/src` e `packages/shared/src`; a
implementação repete a busca (texto quebrado em várias linhas de JSX escapa dela).

## Exceções e decisões

- **Sobreposição:** a extra vence os comuns; entre comuns, qualquer um que tire, tira.
- **Extra não tira nada:** "não" numa extra em dia normal não cancela o dia.
- **Extra no dia normal:** horário e local do dia passam a ser os da extra (chamada e início).
- **Férias com Terá classe = sim interno:** é o que deixa o acampamento no meio das férias valer.
- **Conflito igual ao de hoje:** só evento que tira a classe gera conflito.
- **Férias na montagem:** os dias normais somem da lista (não aparecem cinza), porque férias
  cobrem semanas; "Sem reunião" e afins continuam aparecendo bloqueados.
- **Janela de 120 dias** para a próxima reunião e para o calendário do pacote: cobre férias de
  dezembro a fevereiro sem pesar no pacote.
- **"Terá classe" sem reunião e sem campo:** guardado como está (conversão idêntica); o formulário
  avisa, a ficha mostra o efeito real.
- **Envio de campo/marcação proibida:** Férias e Reunião extra ignoram o que vier e gravam o
  padrão, em vez de recusar — não há tela que mande outro valor.
- **"Aula extra"** do cronograma vira "Fora do cronograma".
- **Desbravador sem tela:** não existe papel nem início do desbravador (`enums.ts:3`;
  `Inicio.tsx:36-39`); a próxima reunião muda só no conselheiro.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** nenhum novo. Férias e reunião extra se criam pelo "Novo evento"; o texto sob
  o Tipo diz o que cada uma faz; o dia normal vem das configurações, como hoje.
- **Vazio:** mês sem evento já explica para que serve (texto novo). Conselheiro sem reunião em 120
  dias: "Nenhuma reunião marcada.", com "Férias até …" se for o caso.
- **Bloqueio:** extra sem caixa, duas extras na data, aba antiga: a mensagem diz o que fazer, no
  campo ou no topo do formulário. Trocar o dia com classe marcada: mensagem atual, com "classes".
- **Perfil e escopo:** criar e editar evento só com `calendario.gerenciar`
  (`eventos.controller.ts:52-71`); ler o calendário, qualquer logado (`:37-50`).

## Testes que mudam

- Shared `formulas/calendario.test.ts`: reescrito no positivo; um caso por linha da tabela da
  regra; equivalência das 8 combinações (dia normal e fora dele) para `temClasse` e `emConflito`;
  acampamento dentro de férias; extra em férias, em feriado sem classe e com "não" em dia normal;
  `proximaReuniao` (férias, extra numa quarta, hoje inclusive, nada em 120 dias); `feriasAte`
  (encadeadas, extra no primeiro domingo); `datasDaMontagem` (extra sem classe fica de fora);
  `validarEvento` (cada mensagem).
- API: `calendario/eventos.spec.ts` (`:83,91-92,106`; padrões de Férias e extra, validações
  depois do padrão, chaves antigas, duas extras na data); `cronogramas/montagem/montagem.spec.ts`
  (`:135,545-546`; férias e extra); `clube/clube.spec.ts` (`:75-106` e o caso da extra no dia
  normal); `inicio/inicio.spec.ts` (`:48-117`, e `:220-228` com `feriasAte: null`);
  `sync/sync.spec.ts` (calendário e filtro da janela); fábrica `test/fabricas.ts:407-427`
  (tipo `Marcacoes` em `:407`, padrão em `:424`).
- Web: `adm/calendario/calendario.test.tsx` (`:34,170-171`; selo da extra),
  `adm/calendario/ficha.test.tsx` (`:29,57-83`; fichas de férias e extra),
  `cronograma-montagem/montagem-adm.test.tsx:245`, `montagem-instrutor.test.tsx:68`,
  `inicio/inicio.test.tsx` (internet, sem internet, férias, "calendário de", pacote gravado no
  IndexedDB **sem** `calendario`), testes da chamada (horário da extra); handlers
  `testes/handlers/calendario.ts:16-17`, `montagem.ts:31,146-152`, `inicio.ts:12`,
  `offline.ts:9-29`; e todo teste de tela que procura texto do inventário.
- e2e: `adm.spec.ts:108,113-114` (textos); `instrutor.spec.ts:85,94` ("Registro de classe",
  "Salvar classe"); `fichas.spec.ts:107-125` ganha criar Férias e Reunião extra pelo formulário
  e ver as fichas; `fichas.spec.ts:189` mede também ficha de férias, ficha de extra, formulário
  com tipo Reunião extra e `/adm/calendario` num mês com férias.

## Documentação a atualizar

- `README.md:97` e `docs/planejamento/MODELO-DE-DADOS.md:139-144,266` citam `cancelaReuniao` e
  `bloqueiaAula`: passam às positivas e aos tipos novos.

## Fora de escopo

- Renomear código, banco ou rotas de "aula" para "classe".
- Repetição de eventos (férias todo ano, reunião extra semanal).
- Tela do desbravador (não existe). Mudar a validação da chamada.
- `docs/fases/fase-2-3/anexos/`, que guarda o desenho da época.

## Critério de pronto

- Um teste por regra da tabela, por decisão de sobreposição e por validação; equivalência das 8
  combinações; migration testada no banco local pelo passo a passo acima, registrado na PR.
- Instrutor: datas em férias somem, extra com classe aparece, férias sobre classe marcada notifica.
- Nenhuma ocorrência de "aula" em texto visível (busca repetida no fim).
- Lint, tipos (`npm run tipos`) e suítes (shared, API, web) passando; e2e no CI.
- Medição no e2e em 390, 820 e 1280 px (lista acima): sem rolagem lateral e sem `fixed`/`sticky`
  novo.
- QA no navegador: criar férias e extra; calendário e fichas; **início do conselheiro em férias e
  com extra, com e sem internet, fica no QA** (o e2e não controla o relógio do aparelho); chamada
  numa extra com horário próprio.

## ONDE FICA

```
- regra do dia (fórmulas)                 packages/shared/src/formulas/calendario.ts:9-17,37-45,48-52,55-61,73-83
- tipos e padrão das marcações            packages/shared/src/enums.ts:3,37-38,57-62
- contrato do evento                      packages/shared/src/contratos/calendario.ts:6-31
- situação da data (montagem)             packages/shared/src/contratos/cronograma.ts:44-47
- contrato do início / do pacote          packages/shared/src/contratos/inicio.ts:8-20 ; contratos/sync.ts:42-71
- textos de permissão / observações       packages/shared/src/permissoes.ts:21 ; contratos/observacoes.ts:15
- schema e criação da tabela              apps/api/prisma/schema.prisma:131-136,829-851 ; migrations/20260930120000_fase2_3_instrutor_adm/migration.sql:2,17-34
- API do evento                           apps/api/src/calendario/eventos.controller.ts:10-31 ; servico-eventos.ts:46-63,77-87,141-198,303-304 ; servico-calendario.ts:12-23
- formato de erro de validação            apps/api/src/comum/pipes/zod-validation.pipe.ts:12-17 ; apps/web/src/modulos/adm/desbravadores/erros.ts:32-39
- montagem (leitura, gravação)            apps/api/src/cronogramas/montagem/servico-montagem-leitura.ts:90-144 ; servico-montagem.ts:356-369
- leitura do cronograma (conflito)        apps/api/src/cronogramas/servico-cronograma.ts:179-216
- início do conselheiro                   apps/api/src/inicio/inicio.service.ts:15-21,44,65-76
- pacote offline                          apps/api/src/sync/sync.service.ts:36-73 ; apps/web/src/offline/usePacote.ts:33
- trava do dia de reunião                 apps/api/src/clube/clube.service.ts:35-59
- chamada                                 apps/api/src/reunioes/reunioes-envio.service.ts:160-170 ; apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:107,130
- formulário / ficha / editar evento      apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:24-30,41-45,61-104 ; FichaEvento.tsx:25-46,87-97,118-129 ; EditarEvento.tsx:20-25 ; apps/web/src/ui/CaixaMarcacao.tsx:5-19
- calendário do Adm                       apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:50,70,98,108,124,196-246 ; tipos.ts:6-21 ; apps/web/src/ui/tokens.css:39-43
- início do conselheiro (web)             apps/web/src/modulos/inicio/InicioConselheiro.tsx:49-63,70-101 ; Inicio.tsx:36-39
- montagem (web)                          apps/web/src/modulos/cronograma-montagem/datas.ts:15-28 ; LinhaData.tsx:61-119
- fábrica de teste                        apps/api/test/fabricas.ts:407-427
- documentação com os campos antigos      README.md:97 ; docs/planejamento/MODELO-DE-DADOS.md:139-144,266
- inventário aula → classe                tabela "Aula → classe" acima
- conferido em                            8f142ef
```
