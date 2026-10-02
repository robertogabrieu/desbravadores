# Tarefa para casa — SPEC

Hoje o instrutor marca no registro da classe quem cumpriu cada requisito, e o que ficou por fazer
some quando ele salva: a seção "O que falta fazer" (`FormularioAula.tsx:208-220`) é só leitura e
não vira nada. Esta SPEC deixa o instrutor **passar para casa** requisitos da classe e
especialidades, **lembra** que há o que cobrar, e faz da cobrança o próprio ato de cumprir: marcar
"Entregou" conclui o requisito ou a especialidade.

O modelo aprovado está em `modelo/` (`.dc.html`; o cartão do início do instrutor, o registro da classe com a presença no topo e a cobrança logo abaixo, a seção "Para casa" e a busca de especialidade). **Ele é o alvo:** se esta SPEC e o modelo divergirem, vale o modelo. Do modelo copia-se estrutura, ordem e texto, **nunca CSS**: as classes saem dos tokens e dos componentes de `ui/`.

Textos ao usuário usam **"classe"** onde hoje a interface diz "aula" (a SPEC do calendário,
`docs/fases/calendario-ferias-extras/SPEC.md`, faz a troca no resto do app). Nomes internos
(`RegistroAula`, `AulaPlanejada`, rotas `/aulas/...`) não mudam.

## O que muda para quem usa

- **Passar.** No registro da classe, nova seção **"Para casa"**, depois de "O que falta fazer":
  "+ Requisito" (os da classe), "+ Especialidade" (busca no catálogo) e o atalho **"Passar o que
  faltou"** (os requisitos do dia que algum presente não cumpriu). Vai junto com o registro, no
  mesmo "Salvar", com ou sem internet.
- **Para quem vale.** Todo desbravador cursando a classe no ano do clube, menos quem já cumpriu o
  item. Quem cumpriu na própria classe do dia não fica devendo; quem faltou, fica.
- **Lembrete no início.** No cartão da classe (`TelaInicioInstrutor.tsx:44-86`), uma linha que só
  informa: **"Para cobrar: 2 requisitos · 5 desbravadores"**. Não é link: o caminho para cobrar é o
  "Registrar classe" que já aparece em dia de classe (`:78-81`).
- **Cobrar no registro.** Ao registrar a classe, **logo abaixo da presença** aparecem as tarefas em aberto, a mais
  recente aberta ("Cobrar tarefa de 27/09") e as outras recolhidas ("+2 tarefas anteriores").
  Um item por vez: chips com o nome curto de cada item, o nome inteiro do escolhido, e a lista de
  quem deve com um botão **"Entregou"** por linha. Ao salvar, o requisito fica cumprido ou a
  especialidade concluída, com a data deste registro.
- **Quem não entregou** continua devendo e reaparece no próximo registro. **Quem está ausente**
  neste registro tem "Entregou" desabilitado, com "faltou hoje", e continua devendo.
- **Desfazer.** Quem entregou neste registro continua na lista, com "Entregue" e a opção de
  desfazer — mesmo que a tarefa já esteja encerrada ou não tenha mais ninguém devendo.
- **Encerrar tarefa.** No rodapé do bloco: tira a tarefa do lembrete e do registro. Não desfaz nada
  que já foi entregue.
- **Sem internet** passar, cobrar e encerrar funcionam e entram na fila do registro.

## Regras

1. **A tarefa é da classe**, não de quem a passou: qualquer instrutor da classe a vê e cobra
   (a classe pode ter vários instrutores, `VinculoClasse`, `schema.prisma:310-319`).
2. **Uma tarefa por registro.** Nasce no registro em que foi passada; os itens mudam enquanto esse
   registro puder ser corrigido: instrutor até 30 dias depois da data e envio feito há até 7 dias;
   Adm sem prazo (`aulas-envio.service.ts:198-205`).
3. **Item é requisito ativo da classe** (com o ajuste do clube, `aulas-envio.service.ts:374-382`)
   **ou especialidade ativa, oficial ou deste clube** (`especialidades-dbv.service.ts:50-53`). Sem
   texto livre. Item que deixa de ser válido some da pendência e do lembrete.
4. **Pendência é derivada, não guardada:** deve um item ativo quem está cursando a classe no ano
   do clube da tarefa (o filtro dos membros da classe, `aulas-envio.service.ts:207-220`) e não tem
   conclusão ativa dele (`RequisitoConcluido`, `schema.prisma:989-1011`; `EspecialidadeConcluida`,
   `:1014-1034`). Concluir por qualquer caminho — na classe, na ficha, na tela de especialidades —
   tira a pendência.
5. **A ficha do próprio instrutor não conta para ele** (outro instrutor ou o Adm a marca, como na
   grade, `FormularioAula.tsx:274-275`; `estado.ts:212-221`; `conclusoes.ts:26-28`).
6. **Tarefa some sozinha** quando ninguém deve mais nada ou o ano do clube vira; antes disso, só
   por "Encerrar tarefa". Desconcluir um item depois faz a tarefa voltar a cobrar.
7. **Entregou requisito = marcar no registro** (vai em `requisitosMarcados`,
   `aulas-envio.service.ts:308-369`): se já concluído, vale a data mais antiga (`:341-353`).
   **Entregou especialidade** conclui com a data do registro; se já concluída, **não move a data**
   e volta como aviso.
8. **Ausência:** "Entregou" exige presente. O servidor decide pela presença **gravada no banco
   depois de aplicar o envio** — hoje decide só pelas presenças do próprio envio (`:321`), e numa
   correção, que só manda as tocadas (`estado.ts:238`), um ausente gravado passaria. Marcar alguém
   ausente depois desfaz as entregas dele **neste** registro (requisito e especialidade).
9. **Desfazer** tira só o que foi concluído **neste** registro, como o resto do registro já faz
   com requisito (`aulas-envio.service.ts:293-306`). Conclusão de outra origem fica.
10. **Sem duplicar:** requisito que é item de tarefa anterior da classe aparece **só no bloco de
    cobrança** — não vira coluna em "Requisitos desta aula" nem entra em "O que falta fazer", a menos
    que esteja planejado para a data. "Passar" ignora item que já está em tarefa aberta da classe.
    O lembrete conta itens distintos.
11. **Pontos:** especialidade já dá pontos quando marcada fora da classe
    (`especialidades-dbv.service.ts:64-75`); entregue no registro dá os mesmos, entra no total
    devolvido pelo envio (hoje só soma requisito, `aulas-envio.service.ts:426-434`) e na prévia da
    tela (hoje só de requisito, `estado.ts:197-210`, com `pontosRequisito` do pacote,
    `pacote-instrutor.service.ts:42-49`).

## Decisões

| Impasse | Escolha |
|---|---|
| Observação curta junto da tarefa? | **Não.** O item já diz o que fazer; texto livre pediria campo, limite e exibição que ninguém pediu. |
| Pendência: tabela por desbravador ou derivada? | **Derivada** (regra 4). Uma tabela teria de acompanhar matrícula, desistência e conclusão por fora — e erraria. |
| Quem se matricula depois da tarefa | **Passa a dever** também, como quem faltou no dia em que ela foi passada. "Encerrar" resolve se incomodar. |
| Como a tarefa trafega | **No envio do registro** (`PUT /sync/aulas/:uuid`, `aulas.controller.ts:19-27`), por diferenças, como as marcações (`aulas-envio.service.ts:288-306`). Nenhuma rota de escrita nova. |
| Idempotência | O envio já é idempotente por `envioId` (`aulas-envio.service.ts:99-100,128`). Acrescentar item que já existe ou retirar o que não existe não faz nada. |
| Dois aparelhos passam tarefa no mesmo registro offline | O registro já se funde pela (classe, data) (`:163-164,176-177`); um segundo id de tarefa no mesmo registro é **fundido** na tarefa que existe (itens somam). Nunca recusa o envio. |
| Dois instrutores cobram a mesma tarefa offline | Nada novo: o segundo "Entregou" vira "já concluído" (`:341-353`). |
| Desfazer especialidade entregue | `EspecialidadeConcluida` ganha **`registroAulaId`**, como `RequisitoConcluido` (`schema.prisma:995`). |
| Permissão | Requisito: **`aula.registrar`**, como hoje no registro (`aulas.controller.ts:19`). Especialidade (passar e entregar): também **`requisito.marcar`** (`permissoes.ts:22`, a que a ficha exige, `especialidades-dbv.controller.ts:21`); sem ela, volta `SEM_PERMISSAO` e a tela esconde a parte de especialidade. |
| Data da especialidade fora do ano do clube | **Aceita.** A data é a do registro, já validada pelo prazo do envio — como o requisito no registro, que também não passa por `exigirDataDoAnoCorrente` (`conclusoes.ts:14-19`). |
| Fonte das tarefas no registro | **O pacote, rebaixado ao abrir com conexão** (`baixarPacote`, `offline/pacote.ts:14-25`; a tela se atualiza sozinha, `usePacote.ts:14,24`). Um só caminho de código com e sem internet; o início lê o mesmo banco. Trazer pela API do registro exigiria uma segunda fonte para o modo sem conexão. |
| Onde encerrar | **Só no bloco de cobrança**, no envio do registro: funciona offline e sempre acontece num registro real. |
| Item retirado ao corrigir o registro de origem | `TarefaItem` ganha `removidoEm` (nunca se apaga linha). |
| Item inválido, repetido ou sem permissão; tarefa de outra classe em "encerrar" | **Não grava e volta como aviso** (`tarefaItensSemEfeito`, `especialidadesSemEfeito`), como a marcação inválida já volta (`offline/tipos/aula.ts:92-95`). O envio nunca é recusado por isso. |

## Dados (uma migration)

- **`TarefaCasa`**: `id`, `clubeId`, `classeId`, `registroAulaId` (de origem), `anoClube`,
  `criadaPorId`, `criadaEm`, `encerradaEm?`, `encerradaPorId?`. Únicos `(clubeId, registroAulaId)`
  e `(clubeId, id)`; índice `(clubeId, classeId, anoClube)`. O id vem do aparelho no primeiro
  envio, como o do registro (`aulas-envio.service.ts:168-170`); se o registro já tem tarefa, vale a
  existente.
- **`TarefaItem`**: `id`, `clubeId`, `tarefaId`, `requisitoId?`, `especialidadeId?`,
  `criadoPorId`, `removidoEm?`, `removidoPorId?`. FK composta `(clubeId, tarefaId)` para a tarefa
  (como `PresencaAula`, `schema.prisma:967`), FK para `Requisito` e para `Especialidade`. Únicos
  parciais por (tarefa, requisito) e (tarefa, especialidade) onde `removidoEm` é nulo.
- **CHECK "exatamente um de `requisitoId` e `especialidadeId`"** em SQL escrito à mão na
  migration. Não há precedente de CHECK nas migrations do repositório: o teste de integração
  confere que o banco recusa os dois e nenhum.
- **`EspecialidadeConcluida.registroAulaId?`** com FK composta para `RegistroAula` e índice
  `(clubeId, registroAulaId)` — o espelho de `schema.prisma:995,1004,1010`.
- Relações de volta: `Clube`, `Classe`, `RegistroAula` (`schema.prisma:933-954`), `Usuario`
  (criada, encerrada, item criado e retirado: relações nomeadas), `Requisito`, `Especialidade`.
- **`TarefaCasa` e `TarefaItem` entram em `MODELOS_DE_CLUBE`** (`guarda-clube.ts:4-38`) na mesma
  migration, e na lista esperada de `guarda-clube.spec.ts:72-73`.
- O código novo **não** vai em `apps/api/src/tarefas/` (pasta dos trabalhos agendados, com regra
  própria de `PrismaSistema` no CLAUDE.md). Vai em `apps/api/src/aulas/`.

## API

Nenhuma rota nova.

- **`AulaEnvio`** (`contratos/aulas.ts:9-19`): campos novos com padrão, para que itens antigos da
  fila continuem válidos (`versaoPayload` segue 1). Limites como os de `:16-18`.
  - `tarefaId: Uuid | null` (padrão `null`) — a tarefa passada **neste** registro.
  - `tarefaItensAcrescentados` / `tarefaItensRetirados`: `({ requisitoId } | { especialidadeId })[]`,
    máx. 100 cada. Ausentes ou vazios: a tarefa não muda.
  - `especialidadesMarcadas` / `especialidadesDesmarcadas`: `{ dbvId, especialidadeId }[]`,
    máx. 2000 cada.
  - `tarefasEncerradas: Uuid[]`, máx. 50.
- **`AulaEnvioSaida`** (`:20-36`) ganha `tarefaId: Uuid | null` (o id real, para os itens
  seguintes da fila, como `atualizarSeguintes` faz com o registro, `offline/tipos/aula.ts:100-113`),
  `tarefaItensSemEfeito` (motivos `ITEM_INVALIDO`, `JA_EM_TAREFA`, `SEM_PERMISSAO`) e
  `especialidadesSemEfeito` (`JA_CONCLUIDA`, `ESPECIALIDADE_INVALIDA`, `AUSENTE`, `PROPRIA_FICHA`,
  `SEM_PERMISSAO`). `totalPontos` passa a somar também as especialidades deste registro.
- **`AulasEnvioService.aplicar`** (`aulas-envio.service.ts:89-138`), na mesma transação: presenças;
  ausentes relidos do banco (regra 8); requisitos; tarefa (cria ou acha a do registro, aplica as
  diferenças com a validação da regra 3); especialidades (permissão, validade, presença, própria
  ficha, pontos); encerra as tarefas de `tarefasEncerradas` que são **desta classe e clube** e
  estão abertas.
- **`AulaDetalhe`** (`aulas.service.ts:69-90`): `requisitosDaAula` deixa de incluir requisito que é
  item de tarefa anterior da classe, salvo se planejado para a data (regra 10; hoje inclui todo
  marcado, `:72`).
- **Pacote do instrutor** (`contratos/sync.ts:17-40`; `pacote-instrutor.service.ts:33-67`), no
  nível do instrutor:
  - `tarefas: { id, registroAulaId, data, encerrada, itens }[]` por classe — as abertas do ano do
    clube e as encerradas com entrega em algum registro recente (para corrigir sem rede);
  - em cada membro, `especialidades: { especialidadeId, registroAulaId }[]` — conclusões das
    especialidades que estão nessas tarefas;
  - `especialidades: { id, nome, area }[]` — o catálogo ativo, oficial e do clube, ao lado de
    `classes`; e `pontosEspecialidade`, ao lado de `pontosRequisito`.
- **Início do instrutor** (`contratos/instrutor.ts:6-14`; `instrutor.service.ts:43-71`): cada
  classe ganha `paraCobrar: { requisitos, especialidades, desbravadores } | null`, itens ativos
  distintos com alguém devendo e desbravadores distintos, sem a própria ficha.
- **Isolamento:** toda leitura e escrita leva `clubeId`; classe fora do escopo do instrutor é 404
  na entrada (`aulas/apoio.ts:14-29`). Os `include` novos levam `clubeId` no `where`.
- **Quem usa:** a parte do instrutor do pacote só vai para o papel INSTRUTOR (`sync.service.ts:70`)
  e o registro depende dela (`TelaRegistroAula.tsx:31,42`): o Adm não passa nem cobra tarefa pelo
  app. Aceito.

## Telas

Tudo dentro do registro (`FormularioAula.tsx`) e do início. Nenhum elemento fixo ou preso na tela.

**Ordem do registro** (pedido do usuário: presença primeiro):

1. cabeçalho (`:148-152`);
2. **presença e requisitos** — a lista de hoje (`:183-206`), com a linha de códigos (`:186-191`)
   como legenda das marcações;
3. **cobrança** (novo);
4. "Requisitos desta aula" — textos e "+ Requisito" (`:154-181`, sobe de lugar só no código);
5. "O que falta fazer" (`:208-220`);
6. **"Para casa"** (novo);
7. salvar (`:222-240`).

Escolha: a linha do desbravador (`LinhaDbv`, `:256-311`) **fica como está**, com presença e
marcações juntas, e só as seções mudam de ordem — separar presença e marcações em duas listas
mudaria o componente e faria o instrutor percorrer os nomes duas vezes.

**Bloco de cobrança** — logo abaixo da presença:

- Entram as tarefas abertas com data **anterior** à do registro e as que têm entrega **neste**
  registro (mesmo encerradas). A mais recente aberta; as outras num botão "+N tarefas anteriores".
- Título "Tarefa de 27/09"; **chips** com o nome curto de cada item (código do requisito; nome da
  especialidade cortado) que quebram linha; abaixo, o nome inteiro do item escolhido.
- **Lista de quem deve o item escolhido**, mais quem o entregou neste registro. Por linha: nome e
  um botão — "Entregou" (aria-label "Entregou: <item> · <nome>"), "Entregue" com "Desfazer"
  (aria-label "Entregue em <data> · <nome> · desfazer"), ou, para quem
  está marcado ausente acima, "Entregou" desabilitado com "faltou hoje" (aria-label "Entregou:
  <item> · <nome> · faltou hoje").
  A linha não some ao marcar. Nenhuma grade e nenhuma rolagem lateral.
- Rodapé: "Encerrar tarefa" (secundário) com confirmação "Encerrar a tarefa de 27/09? Quem não
  entregou deixa de aparecer para cobrar. O que já foi entregue continua registrado." Antes de
  salvar: "Será encerrada ao salvar" com "Desfazer".
- Sem `requisito.marcar`, chips de especialidade não aparecem.

**Seção "Para casa"** — no fim, depois de "O que falta fazer" (`:208-220`) e antes de salvar:

- Itens passados com "Tirar"; "Passar o que faltou"; "+ Requisito" (`Selecao`, como `:167-179`,
  sem os que já estão em tarefa aberta); "+ Especialidade" (com `requisito.marcar`): campo de
  busca sobre o catálogo do pacote.
- Busca vazia: "Digite parte do nome da especialidade". Nada encontrado: "Nenhuma especialidade
  com esse nome". Pacote antigo, sem catálogo: o botão some e fica "Para passar especialidade,
  abra o app com internet uma vez".
- Sem itens: "Nada para casa." — os botões ao lado ensinam o resto.

**Estado e fila** (`estado.ts`, `offline/tipos/aula.ts`):

- `EstadoAula` (`estado.ts:40-49`) ganha itens acrescentados e retirados, ações de especialidade
  (chave `dbvId|especialidadeId`) e tarefas a encerrar; `RascunhoAula` (`:53-57`) os mesmos, com
  padrão. `requisitosVisiveis` (`:180-186`) e "+ Requisito" excluem os da regra 10.
  `alternarPresenca` (`:134-143`) para ausente também desfaz as entregas dele já gravadas neste
  registro. `montarEntrada` (`:235-260`) tem conteúdo também quando só a tarefa mudou.
- `fundir` (`offline/tipos/aula.ts:53-69`): itens e especialidades pela última ação por chave,
  como `fundirMarcacoes` (`:39-50`); encerradas, união; `tarefaId`, o do anterior.
- Leitura defensiva: item antigo da fila sem os campos novos lê `?? []` / `?? null`.
- O payload guarda o nome de cada especialidade (como `nomes` e `codigos`, `:14-16`) para os
  avisos. Textos novos em `avisar` (`:74-97`):
  - "Já estava concluída e ficou como estava: Ana (Primeiros socorros) em 12/09."
  - "Faltou ao encontro, então a entrega não valeu: Ana (Primeiros socorros)."
  - "Especialidade que não está mais ativa ficou de fora: Primeiros socorros."
  - "Sem permissão para marcar especialidades; elas ficaram de fora."
  - "Não entrou na tarefa porque não vale mais ou já está em outra tarefa: 3a, Nós e amarras."

**Início** (`TelaInicioInstrutor.tsx:44-86`): a linha "Para cobrar: …" (texto, não link), abaixo
do resumo da próxima classe; parte com zero não aparece. Só nos cartões das classes individuais
(`:160-166`).

**Estados:** o registro já trata carregando, vazio e sem conexão (`TelaRegistroAula.tsx:34-43`);
pacote antigo sem `tarefas` mostra o registro sem bloco. O início sem conexão cai em
`ClassesSemConexao` (`:187`), sem lembrete. Conexão só por `useConexao`.

**Envio recusado por prazo** (`aulas-envio.service.ts:199-205`): o envio inteiro é recusado, como
hoje; nada da tarefa grava (nem o encerramento) e o item fica na fila com o erro
(`offline/motor.ts:263-266`). A tarefa segue aberta e pode ser encerrada no próximo registro.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** classe com desbravadores matriculados (o registro já bloqueia,
  `TelaRegistroAula.tsx:66`); especialidade ativa no catálogo.
- **Vazio:** "Para casa" ensina com os próprios botões; sem tarefa, nem bloco nem lembrete.
- **Bloqueio:** "Entregou" de quem faltou fica desabilitado com "faltou hoje" — a
  presença já foi marcada acima; item que deixou de valer some e, se estava no envio,
  volta como aviso.
- **Perfil e escopo:** só o instrutor da classe vê e cobra; a própria ficha aparece como hoje,
  "Outro instrutor ou o Adm registra os seus requisitos" (`FormularioAula.tsx:275`); sem
  `requisito.marcar`, nada de especialidade.

## Testes

- **API** (integração, banco próprio):
  - passar: cria tarefa e itens; reenvio do mesmo `envioId` não duplica; segundo id de tarefa no
    mesmo registro funde os itens; retirar marca `removidoEm`; requisito de outra classe ou
    inativo, especialidade inativa ou de outro clube → `ITEM_INVALIDO`; item já em tarefa aberta →
    `JA_EM_TAREFA`; especialidade sem `requisito.marcar` → `SEM_PERMISSAO`; CHECK recusa os dois e
    nenhum;
  - cobrar: requisito entregue grava com o `registroAulaId` da cobrança; especialidade conclui com
    `registroAulaId` e pontos, e `totalPontos` os inclui; já concluída → `JA_CONCLUIDA` sem mudar a
    data; própria ficha → `PROPRIA_FICHA`; sem permissão → `SEM_PERMISSAO`;
  - ausência gravada: correção que não manda a presença de um ausente gravado → `AUSENTE`, para
    requisito e especialidade;
  - desfazer: requisito e especialidade desfazem só a deste registro e estornam pontos;
  - encerrar: some do início e do pacote; tarefa de outra classe ou clube fica intacta e volta
    aviso;
  - pendência: cumpriu no dia → não deve; concluiu pela ficha → sai; desistiu → sai; matriculado
    depois → deve; item inativo → não conta; ano virou → some; todos entregaram → `paraCobrar`
    nulo; contagem por item distinto;
  - detalhe: requisito só da cobrança fora de `requisitosDaAula`;
  - isolamento: tarefa de outro clube não aparece no pacote, no detalhe nem no início; instrutor
    de outra classe não a vê.
- **Web:** passar (manual, "Passar o que faltou", item já em tarefa ignorado); bloco só em data
  posterior, mais recente aberta e as outras recolhidas; chips trocam o item; "Entregou",
  "Desfazer" e quem entregou continua na lista; "Entregou" desabilitado para quem faltou e marcar ausente desfaz a
  entrega; requisito da cobrança fora da grade e de "O que falta fazer"; encerrar e desfazer;
  sem `requisito.marcar` nada de especialidade; busca (vazia, nada encontrado, pacote antigo);
  rascunho; `fundir`; **item antigo da fila** sem os campos novos; avisos novos; lembrete no
  início (com e sem especialidade, texto sem link); abrir com conexão rebaixa o pacote.
- **e2e:** passar um requisito sem rede, cobrar no registro seguinte, progresso sobe (ao lado de
  `e2e/instrutor.spec.ts:45`).
- **Testes existentes que mudam:** `apps/api/src/aulas/{aulas.spec.ts,aulas-leitura.spec.ts}`,
  `sync/{pacote-instrutor.spec.ts,sync.spec.ts}`, `instrutor/instrutor.spec.ts`,
  `comum/prisma/guarda-clube.spec.ts`; `apps/web/src/modulos/aulas/{aulas.test.tsx,estado.test.ts,fontes.test.ts}`,
  `offline/tipos/aula.test.ts`, `offline/usePacote.test.tsx`,
  `modulos/inicio-instrutor/inicio-instrutor.test.tsx`, e os handlers
  `testes/handlers/{aulas.ts,instrutor.ts,offline.ts}`.

## Critério de pronto

- Migration aplicada contra o banco (com `MODELOS_DE_CLUBE` na mesma); lint, `npm run tipos` e
  suítes de API e web passando; e2e verde no CI.
- Medido no DOM em 390, 820 e 1280 px, com três tarefas abertas de seis itens: sem rolagem
  lateral da página **nem dentro do bloco de cobrança**, e sem elemento `fixed`/`sticky` novo.
- QA no navegador: passar → início mostra o lembrete → registro seguinte cobra → lembrete some;
  ausente continua devendo; desfazer; encerrar; o mesmo sem conexão até o envio.

## Fora de escopo

- O desbravador ver a tarefa no app dele; lista de pendências para conselheiro ou Adm; histórico
  de tarefas encerradas; notificação push.
- Texto livre, observação ou prazo de entrega; reabrir tarefa encerrada.
- Lembrete nas classes agrupadas e no início sem conexão.
- Marcar especialidade pela ficha não barra a própria ficha (`especialidades-dbv.service.ts:46-82`
  não chama `exigirFichaDeOutraPessoa`, que o requisito chama, `requisitos-dbv.service.ts:117`):
  inconsistência conhecida, não corrigida aqui.

## ONDE FICA

```
- início do instrutor (cartão, registrar)   apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:44-86, :78-81, :160-166, :187
- registro da classe (telas, modos)         apps/web/src/modulos/aulas/TelaRegistroAula.tsx:26-54, :66, :103-130
- formulário: cabeçalho, grade, falta       apps/web/src/modulos/aulas/FormularioAula.tsx:148-152, :154-181, :183-206, :208-220, :256-311
- estado, rascunho, presença, envio         apps/web/src/modulos/aulas/estado.ts:40-57, :134-143, :180-221, :235-260
- fila da aula (fundir, avisos, seguintes)  apps/web/src/offline/tipos/aula.ts:8-18, :39-69, :74-97, :100-120
- pacote local e erro da fila               apps/web/src/offline/pacote.ts:14-25 ; usePacote.ts:14,24 ; motor.ts:263-266
- permissões na sessão (web)                apps/web/src/sessao/ProvedorSessao.tsx:296-303
- rota do envio / permissões                apps/api/src/aulas/aulas.controller.ts:19-27 ; packages/shared/src/permissoes.ts:21-22
- envio do registro                         apps/api/src/aulas/aulas-envio.service.ts:89-138, :163-178, :198-220, :275-382, :416-441
- detalhe do registro                       apps/api/src/aulas/aulas.service.ts:51-90
- escopo da classe                          apps/api/src/aulas/apoio.ts:14-29
- pacote do instrutor                       apps/api/src/sync/pacote-instrutor.service.ts:33-67, :69-121, :141-153 ; sync.service.ts:70
- início do instrutor (API)                 apps/api/src/instrutor/instrutor.service.ts:32-73
- especialidade fora da classe              apps/api/src/especialidades/especialidades-dbv.controller.ts:21-30 ; especialidades-dbv.service.ts:29, :46-82
- requisito fora da classe, própria ficha   apps/api/src/progresso/requisitos-dbv.service.ts:28-119 ; progresso/conclusoes.ts:13-31
- contratos                                 packages/shared/src/contratos/{aulas.ts:9-50,sync.ts:17-40,instrutor.ts:6-19,especialidades.ts:6-17}
- schema                                    apps/api/prisma/schema.prisma:310-319, :571-586, :596-611, :933-954, :967, :989-1034
- guarda de clube                           apps/api/src/comum/prisma/guarda-clube.ts:4-38 ; guarda-clube.spec.ts:72-73
- e2e de referência                         e2e/instrutor.spec.ts:45
- conferido em                              8f142ef
```
