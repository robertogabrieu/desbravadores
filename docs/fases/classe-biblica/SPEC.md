# Classe Bíblica — SPEC

O Adm cria por semestre uma **edição da Classe Bíblica**: grupos de unidades, um material de
estudo opcional por grupo e os encontros, que vão para o calendário do clube em lote. Quem tem a
permissão faz a chamada de cada grupo, com ou sem internet. Presença e participação dão pontos no
ranking. Os requisitos "participar ativamente da classe bíblica" passam a mostrar quantos encontros
o desbravador frequentou.

O modelo aprovado está em `modelo/` (`.dc.html`, 15 quadros). **Ele é o alvo:** se esta SPEC e o
modelo divergirem, vale o modelo. Do modelo copia-se estrutura, ordem e texto, **nunca CSS**: as
classes saem dos tokens e dos componentes de `apps/web/src/ui/`.

## Problema

O clube faz Classe Bíblica por semestre: grupos de unidades estudam um material, em encontros
semanais, e três classes (e as agrupadas) exigem "participar ativamente da classe bíblica". Hoje
o app não sabe que ela existe. O Adm que quiser os encontros no calendário cria um evento por
vez; ninguém registra quem foi; e o requisito é marcado no escuro, sem nenhum número que diga se
o desbravador participou.

O que muda para quem usa (decisões já tomadas pelo usuário, não se reabrem):

- **Adm cria uma edição** em três etapas — dados, grupos, datas — que fica guardada no servidor
  enquanto não termina. Horário começa vazio. Item "Classe Bíblica" no menu do Adm, depois de
  "Cronogramas".
- **Grupos:** o Adm escolhe as unidades de cada grupo; uma unidade fica em no máximo um grupo por
  edição; duas edições ao mesmo tempo não podem cobrir a mesma unidade.
- **Material de estudo:** por grupo, para a edição inteira, PDF ou link, **opcional** — pode ser
  anexado depois, e a falta dele não deixa a edição "não terminada".
- **Datas em lote:** lista revisável; datas em férias, feriado ou "sem reunião" vêm desmarcadas
  com o motivo; cada data marcada vira um evento novo do calendário, tipo Classe Bíblica (lilás
  de "Evento do clube" + ícone de livro). Encontro isolado pode ser remarcado ou cancelado;
  **encontro com chamada não pode**. Cancelado aparece riscado, com motivo.
- **Chamada por grupo e encontro:** todos começam presentes; marca-se quem faltou e quem
  "participou ativamente". Cada desbravador aparece na unidade em que estava **na data**.
  Funciona sem internet para quem tem a permissão de registrar.
- **Permissões novas:** registrar a chamada (padrão só Adm, ajustável) e gerenciar edições.
- **Ranking:** dois critérios novos (presença e participação na Classe Bíblica), com pontos
  configuráveis; entram no ranking individual e no de unidade do mês; falta não desconta.
- **Requisitos "participar ativamente da classe bíblica"** mostram "Classe Bíblica <edição>: X de
  Y encontros" + "participou ativamente em N". A marcação continua manual.

## Diagnóstico

Módulo novo: não há fluxo de Classe Bíblica para medir abandono, e o projeto não tem dado de uso
de nenhum fluxo parecido. O diagnóstico mede o **trabalho que existe hoje** para fazer o mesmo
com o que o app já tem, e o que no código impede reaproveitar o óbvio.

### Atritos, do maior para o menor

| # | O que trava | Onde | Medida |
|---|---|---|---|
| A1 | Pôr os encontros no calendário | `POST /eventos` cria **um** evento por chamada (`apps/api/src/calendario/eventos.controller.ts:69-76`) | Semestre do desenho: 17 domingos, 15 encontros → **15 formulários** de evento preenchidos à mão |
| A2 | Chamada de um grupo grande | A chamada da reunião começa **sem marca** (`apps/web/src/modulos/reunioes/chamada/estado.ts:41`, `SEM_MARCA` com `situacao: null`) | Grupo Daniel do desenho, 31 desbravadores e 2 faltas: **31 toques** começando vazio contra **2** começando presente (+ os de participação, que existem nos dois casos) |
| A3 | Marcar o requisito sem evidência | A ficha mostra só "Concluído em …" ou "Ainda não concluído" (`apps/web/src/modulos/perfil/SecaoProgresso.tsx:131`) | 4 requisitos afetados: Amigo G6, Companheiro G6, Pesquisador G6 (`docs/planejamento/dados/cadernos/{amigo,companheiro,pesquisador}.json:47`), Agrupadas G15 (`agrupadas.json:101`) |
| A4 | Criar edição sem ter o material à mão | — | **Não medido** (sem dado de uso). É o motivo de o material ser opcional e de a edição se guardar sozinha |

### O que o código já decide (e muda o desenho técnico)

- **A fila offline se reaproveita, a tabela de idempotência não como está:** `EnvioProcessado`
  tem `reuniaoId` obrigatório (`apps/api/prisma/schema.prisma:828-838`). O registro da classe
  resolveu o mesmo com tabela própria, `EnvioAulaProcessado` (`schema.prisma:992`). Ver D2.
- **O material de classe não serve:** `Material.classeId` é obrigatório (`schema.prisma:1131`).
  `Arquivo` (`schema.prisma:748-767`) serve. O upload de PDF hoje só passa de 3 MB no nginx em
  `/api/materiais/arquivo` (`apps/web/nginx.conf:16`, `:34-35`): rota nova de upload precisa de
  `location` próprio (regra do `CLAUDE.md`).
- **Um evento novo no calendário muda a reunião do dia se ninguém cuidar:** `situacaoDaData`
  trata todo evento que não é `REUNIAO_EXTRA` como "comum", e um comum com `temReuniao` ou
  `temClasse` falso derruba a reunião ou a classe daquele dia
  (`packages/shared/src/formulas/calendario.ts:56-62`). Ver D5.
- **Tipos de evento:** `TipoEvento` no banco (`schema.prisma:131-138`) e no pacote compartilhado
  (`packages/shared/src/enums.ts:36-37`); rótulos, cores e pontos do front são `Record` por tipo
  (`apps/web/src/modulos/adm/calendario/tipos.ts:10`, `:22`, `:46`), então o compilador cobra o tipo
  novo; ícone e texto de apoio são `Partial` (`:31`, `:37`). `MARCACOES_PADRAO` é indexado pelo tipo
  em quatro lugares (`eventos.controller.ts:33`, `apps/api/test/fabricas.ts:426`,
  `apps/web/src/testes/handlers/montagem.ts:27`, `FormularioEvento.tsx:73`): o tipo novo precisa de
  entrada lá (regra 6).
  O tipo "Evento do clube" usa `--cal-evento-*` (`tipos.ts:27`).
- **Pontos:** só por `ServicoPontos.sincronizar` (`apps/api/src/pontos/servico-pontos.ts:28`);
  a origem é um enum fechado (`OrigemPontos`, `schema.prisma:118-123`) e o par
  origem/critério é único (`schema.prisma:742-743`). A chamada da reunião usa
  `origemId = "<reunião>:<dbv>"` (`apps/api/src/reunioes/reunioes-envio.service.ts:333`).
- **Critérios de ranking padrão** nascem só na criação do clube
  (`apps/api/src/scripts/clube-criar.ts:27-34`), um padrão por gatilho
  (`schema.prisma:644`), e o `CLAUDE.md` proíbe INSERT em SQL cru. Ver D3.
- **Permissões:** papel ausente no padrão = "não se aplica" e não aceita ajuste
  (`packages/shared/src/permissoes.ts:6-8`, `:44-49`, `:65`). Para "só Adm, ajustável", o padrão precisa
  listar os outros papéis com `false`. Ver D4.
- **Unidade na data:** `MembroUnidade` guarda `inicio` e `fim` (`schema.prisma:472-473`).
- **O pacote de sync** monta a parte de cada papel (`apps/api/src/sync/sync.service.ts:48`, `:71`;
  a do instrutor num provider próprio, `sync.module.ts`, `pacote-instrutor.service.ts`)
  e é baixado ao abrir o app com conexão (`apps/web/src/offline/pacote.ts:14`).
- **Configuração do clube** dá dia e local padrão (`schema.prisma:224`, `:226`); `horaReuniao`
  (`:225`) não é usada nesta feature — o horário começa vazio.
- **Não existe componente de etapas** em `apps/web/src/ui/`; existe `BarraProgresso`
  (`apps/web/src/ui/BarraProgresso.tsx:11`), com `role="progressbar"`.
- **Requisito oficial não tem marca de assunto**: `Requisito` tem código, texto e `campo`
  (`schema.prisma:542-559`); a carga lê esses campos do caderno
  (`apps/api/src/scripts/carga.ts:10-15`, `:232-238`). Ver D1.

## Mecânicas

Calibragem (`gamificacao` §5): a edição é **rara** e longa (6 campos + grupos + 15–17 datas) —
cabe o catálogo; a chamada é **de uso frequente** por quem já conhece — só pedir menos e
confirmar.

### M1 — Etapas nomeadas com o fim visível (resolve A1 e A4)
"Etapa 2 de 3 — Grupos · depois: Datas", em texto, com a barra como reforço. O total é sempre 3.
Usa `BarraProgresso` e um **componente novo de etapas em `ui/`** (o primeiro do projeto; nasce
comum, esta tela é a primeira a usar). Não muda: o calendário e o formulário de evento avulso.

### M2 — Salvar sozinho no servidor e continuar depois (resolve A4)
"Salvo às 15:42. Pode sair e continuar depois de onde parou."; na lista, cartão "Não terminada ·
Parou na etapa 2 de 3 — Grupos" com "Continuar de onde parou". Guardado no servidor (troca de
aparelho não perde). "Não terminada" = as três etapas ainda não foram concluídas; **material
faltando não conta**.

### M3 — Pedir menos agora (resolve A1, A2, A4)
Dia e local vêm da configuração do clube; as datas são geradas e as que caem em férias, feriado
ou sem reunião vêm desmarcadas com o motivo; material opcional, anexável no painel da edição;
chamada começa com todos presentes.

### M4 — Confirmação no campo
Erro ao sair do campo, junto dele ("O fim precisa ser depois do início (07/03/2027)"), com
`CampoRotulado`/`useErrosAVista`.

### M5 — Tempo estimado na entrada e fechamento com o próximo passo
"Leva uns 5 minutos" na etapa 1; ao criar, uma tela que diz o que foi feito (encontros no
calendário, grupos e se têm material) e um único botão, "Ver a edição". Nada some sozinho.

### M6 — Evidência ao lado do requisito (resolve A3)
"Classe Bíblica 2026 · 2º semestre: 6 de 8 encontros · Participou ativamente em 5 · Grupo
Daniel" sob o requisito na ficha. Não marca nada sozinho.

## Descobribilidade

- **Pré-requisitos:** unidades cadastradas (condicional: sem unidade, a lista mostra o bloqueio
  "Antes, cadastre as unidades" com "Cadastrar unidade"); desbravadores nas unidades na data do
  encontro.
- **Vazio:** nenhuma edição → estado educativo com o que é uma edição e "Criar a primeira
  edição"; chamada de grupo sem ninguém na data → "Nenhum desbravador no Grupo Ester em 11/10"
  com volta à edição; grupo sem material → "Ainda sem material de estudo" com "Anexar PDF ou
  link".
- **Bloqueio:** sem unidades = pré-requisito ausente (caminho para cadastrar); encontro com
  chamada não remarca nem cancela = estado impossível (só o texto); chamada fora do aparelho sem
  conexão = pré-requisito ausente ("Abra o app uma vez com internet antes do encontro").
- **Perfil e escopo:** só quem gerencia vê "Nova edição", remarcar, cancelar e anexar material;
  a chamada aparece só para quem tem a permissão de registrar; o desbravador só vê os encontros
  no calendário.

## Desenho

`docs/fases/classe-biblica/modelo/` — 15 telas (`*.dc.html`) e o quadro `canvas.json`. **Se esta
SPEC e o desenho divergirem, o desenho vence.** Do desenho copia-se estrutura, ordem e texto,
**nunca CSS**: as classes saem dos tokens e destes componentes de `apps/web/src/ui/`:
`CabecalhoDaPagina`, `Cartao`, `Campo`/`CampoRotulado`, `CampoData`, `Selecao`, `CaixaMarcacao`,
`Botao`, `Selo`, `Chip`, `EstadoVazio`, `Carregando`/`ErroDeCarga`/`DisponivelComInternet`
(`EstadosDeCarga`), `FaixaAviso`, `Confirmacao`, `BarraProgresso`, `useErrosAVista`/`ResumoDosErros`
(`ErrosDoFormulario`), `RodapeDoFormulario`, `LinhaQueNavega`.

Ajustes desta rodada (material opcional):

- `Edicao-1-Dados` — "O material de estudo de cada grupo (um PDF ou um link) pode ir agora ou
  depois." no lugar de "Tenha à mão o material".
- `Edicao-2-Grupos` — "Material de estudo (opcional)"; no grupo sem material, "Se ainda não
  tiver, pode anexar depois, na página da edição."
- `Edicao-Pronta` — Grupo Ester "ainda sem material", com "A edição já está valendo sem ele."
- `Lista-Edicoes` — a edição não terminada diz só a etapa em que parou.
- `Painel-Edicao` — "Trocar o material" no grupo que tem; quadro novo do grupo sem material com
  "Anexar PDF ou link".
- `Chamada-Encontro` e `Chamada-SemConexao` — quem faltou mostra "Participou ativamente"
  desmarcado e desabilitado (resposta 4).
- `Progresso-Requisito` — linha menor "Antes: Classe Bíblica 2026 · 1º semestre — 12 de 16
  encontros · participou ativamente em 9" (resposta 3).
- `Chamada-Estados` (revisão adversarial) — vazio ganha "Se o grupo se reuniu assim mesmo, registre a
  chamada vazia: o encontro conta como feito." e o botão "Registrar a chamada sem ninguém" (D24).
- `Chamada-Estados` — sem conexão: "Abra o app uma vez com internet" (a chamada vem no pacote de
  sync, que baixa ao abrir o app), no lugar de "Abra a página da edição".

## Regras

1. **Edição** tem nome, início, fim, dia da semana, horário e local. Obrigatórios: nome, início,
   fim (depois do início), dia e horário; local é opcional (D18). Dia e local vêm preenchidos da
   configuração do clube (`schema.prisma:224`, `:226`); o horário começa vazio.
2. **Situação da edição**, derivada e nunca guardada: **Não terminada** enquanto a etapa 3 não foi
   concluída; **Em andamento** de terminada até o dia do fim; **Encerrada** depois do fim. Material
   de estudo não entra na conta.
3. **Grupos**: cada um com nome, uma ou mais unidades ativas e, se quiser, um material de estudo
   (PDF de até 20 MB ou link `https://`, como `contratos/materiais.ts:7`). Uma unidade fica em no
   máximo um grupo da edição. Uma unidade não pode estar em duas edições **terminadas** com
   períodos cruzados. Dois rascunhos podem pegar a mesma unidade. O conflito aparece na etapa 2 ao
   abrir (caixa desabilitada com "na <nome da outra edição>") e ao terminar, com o texto
   **"A unidade Águias já está na edição <nome>, de 07/03 a 27/06. Tire-a deste grupo para
   continuar."**.
4. **Datas**: toda ocorrência do dia da semana entre início e fim. A data coberta por evento
   Férias, Feriado ou Sem reunião (`TipoEvento`, `schema.prisma:131-138`) vem desmarcada, com
   "<rótulo do tipo>: <nome do evento>". Qualquer data pode ser marcada ou desmarcada. Terminar
   exige ao menos uma data marcada.
5. **Terminar** ("Criar N encontros") roda numa transação com trava por clube
   (`pg_advisory_xact_lock`, como `servico-eventos.ts:151`, chave `classe-biblica:<clubeId>`).
   Ela reconfere a regra 3 contra as edições terminadas, cria um encontro por data marcada e um
   `EventoCalendario` do tipo `CLASSE_BIBLICA` por encontro, com as marcações de
   `MARCACOES_PADRAO.CLASSE_BIBLICA` (regra 6), e chama `garantirCriterios` (regra 11). **É
   idempotente:** se `terminadaEm` já está preenchido, devolve a mesma edição sem criar nada.
6. **Encontro do calendário não altera a reunião nem a classe do dia** (D5, D19):
   `MARCACOES_PADRAO.CLASSE_BIBLICA = { temReuniao: true, temClasse: true, bomParaCampo: false }`
   (`enums.ts:57-64`). São os valores neutros das três contas de `situacaoDaData`: `every` de
   `temReuniao` e `temClasse` não muda com `true`, e `some` de `bomParaCampo` não muda com
   `false`. Quem lê o evento sem passar pela regra também não muda de resultado. Além disso,
   `situacaoDaData` ignora o tipo, como já separa a reunião extra
   (`packages/shared/src/formulas/calendario.ts:58-59`).
7. **Remarcar** muda a data (e, se quiser, o horário) do encontro e do evento. A nova data fica
   entre início e fim da edição, não antes de hoje, e não pode ser a de outro encontro **não
   cancelado** da edição. Se cair em Férias, Feriado ou Sem reunião, mostra aviso
   ("<data> cai em <rótulo>: <nome>.") e deixa seguir. **Cancelar** pede o motivo, que aparece no
   calendário e no painel, e o encontro sai das contas. **Desfazer o cancelamento** vale até a
   data do encontro e é recusado se outro encontro não cancelado ocupa a data. Os três valem para
   todos os grupos. **Encontro com chamada de qualquer grupo não remarca nem cancela.** Encontro
   da Classe Bíblica não se edita nem se apaga pela tela do calendário (D6).
8. **Chamada** é por encontro e grupo, a partir da data atual do encontro (no fuso do clube), e
   nunca em encontro cancelado. Entram os desbravadores ativos cuja unidade **na data** é do
   grupo (`MembroUnidade` com `inicio <= data` e `fim` nulo ou `> data`, o filtro da reunião,
   `reunioes-envio.service.ts:205-216`), **cortados pelo escopo** da regra 9. Todos começam
   presentes. "Participou ativamente" só vale para presente: na tela fica desmarcado e
   desabilitado em quem faltou, e a API grava `false` para ausente, seja o que vier. Grupo sem
   ninguém na data pode salvar a chamada sem linhas, e ela conta como "chamada registrada".
   A gravação é por chave `(encontroId, dbvId)`, com upsert (nunca P2002). Cada linha guarda o
   grupo e a unidade do dia: mover a unidade de grupo depois não muda o passado. Linha de
   desbravador que não é da lista (inativado, saiu da unidade, fora do escopo) é descartada e
   volta como aviso com o nome, como a reunião (`reunioes-envio.service.ts:216-222`).
9. **Escopo da chamada** (R1): quem tem `classebiblica.chamada`.
   - **Adm**: todos os grupos e todos os desbravadores.
   - **Conselheiro**: vê o grupo que tem ao menos uma unidade dele. A lista, o envio e o pacote
     levam **só** os desbravadores das unidades do escopo dele (`escopo.service.ts:36`, `:55-58`);
     os outros nem aparecem.
   - **Instrutor**: vê o grupo que tem ao menos um desbravador com matrícula **CURSANDO** numa
     classe dele no ano do clube corrente (`escopo.service.ts:44`, `:59-65`), e lista, envia e
     leva no pacote só esses desbravadores.
   - Grupo fora do escopo responde 404. Linha enviada fora do escopo é recusada e volta como
     aviso.
10. **Não existe "desfazer chamada"** (R2, decisão do usuário). Chamada salva por engano se
    corrige marcando as faltas. Os pontos se ajustam por `sincronizar`, o encontro continua
    travado para remarcar e cancelar, e a chamada corrigida conta em X de Y como qualquer outra.
11. **Pontos**: na chamada salva, por desbravador: presente → "Presença na Classe Bíblica";
    participou → "Participou ativamente da Classe Bíblica". Só contam se ativos. Falta não
    desconta. Antes de pontuar, o envio chama `garantirCriterios`.
    - Gravação só por `ServicoPontos.sincronizar` (`servico-pontos.ts:28`), com
      `origemTipo: CLASSE_BIBLICA` e `origemId: "<encontroId>:<dbvId>"`, como a reunião
      (`reunioes-envio.service.ts:333`). Corrigir para falta estorna.
    - **`garantirCriterios(tx, clubeId)`** é idempotente (D3, R6). Para cada gatilho novo: se já
      existe critério `padrao: true` com o gatilho, reaproveita. Senão cria com `padrao: true`,
      `lancadoPor: ADM`, `ordem` = maior ordem do clube + 1, pontos 10 (presença) e 5
      (participação), ativo. Se o nome colide com critério não padrão (`@@unique([clubeId,
      nome])`, `schema.prisma:642`), usa "<nome> (Classe Bíblica)". `clube-criar.ts` **não**
      muda (D20).
    - Ranking: o individual e o de unidade somam `LancamentoPontos` do mês
      (`calculo-ranking.ts:149-157`). O de unidade usa a **unidade atual** do desbravador
      (`calculo-ranking.ts:63-90`, `:122`): comportamento existente, declarado, não muda.
12. **Envio da fila contra o estado do servidor** (R3). O servidor recusa (RECUSA, a fila guarda
    o erro, `offline/motor.ts:259-268`) e a fila mostra o motivo na página da fila, como as
    recusas da reunião:
    - encontro cancelado → "O encontro de 18/10 foi cancelado; a chamada não foi registrada.";
    - encontro remarcado para data que ainda não chegou → "O encontro de 18/10 foi remarcado para
      24/10; a chamada só pode ser feita a partir desse dia.";
    - encontro remarcado para data que já chegou → a chamada é aceita: vale para o encontro
      (`encontroId`), não para a data.
    Conflito de versão (outra pessoa mudou a mesma linha) segue a reunião: a versão que chega por
    último vale, e o aparelho avisa com os nomes (`offline/tipos/reuniao.ts:44-52`, D21).
13. **Requisito "participar ativamente"** (marca `Requisito.classeBiblica`, D1; R4, R5). A
    contagem fica no quadro de cada matrícula da ficha e considera só as edições cujo período
    cruza o ano do clube daquela matrícula (`anoClube`, `packages/shared/src/datas.ts:9`).
    - Para cada edição: **Y** = encontros não cancelados com chamada registrada **em que o
      desbravador tem linha**; **X** = linhas presentes; **N** = linhas com participação.
    - Quem entrou depois não ganha falta implícita. "Grupo" é o da linha mais recente.
    - Em destaque, a edição mais recente com Y > 0. As outras do mesmo ano com Y > 0 vão na
      linha menor "Antes: …".
    - Sem linha em nenhuma edição do ano: "a unidade dele(a) não está em nenhum grupo" se a
      unidade atual não está em grupo de edição em andamento; senão, nenhum quadro.
    - Nada marca o requisito sozinho.
14. **Edição terminada** (R8): início, fim e dia da semana ficam travados. Nome, horário e local
    se editam; horário e local mudam os encontros futuros sem chamada e os eventos deles. Grupo
    com chamada não pode ser removido. Grupo sem chamada removido leva junto as linhas de
    `GrupoUnidadeClasseBiblica`. Unidade pode sair de um grupo ou entrar nele (regra 3), e isso
    afeta só encontros futuros: as linhas gravadas guardam o grupo do dia.
15. **Material**: o arquivo é guardado como `Arquivo` e servido por URL assinada (CLAUDE.md;
    `materiais.service.ts:248`). Trocar substitui o anterior no grupo; o `Arquivo` antigo fica.

## Dados (uma migration, `apps/api/prisma/migrations/20261010120000_classe_biblica/`)

- Enums: `TipoEvento` + `CLASSE_BIBLICA`; `GatilhoCriterio` + `CLASSE_BIBLICA_PRESENCA`,
  `CLASSE_BIBLICA_PARTICIPACAO`; `OrigemPontos` + `CLASSE_BIBLICA`.
- `Requisito.classeBiblica Boolean @default(false)` e, na mesma migration, `UPDATE` que liga a
  marca em Amigo G6, Companheiro G6, Pesquisador G6 e Agrupadas G15, achados por trilha, nome da
  classe, código da seção e código do requisito (a chave que `conferirFreio` monta,
  `carga.ts:101-110`). Em banco ainda sem carga, ela não acha nada e quem liga é a carga (D1).
- **`EdicaoClasseBiblica`**: `id`, `clubeId`, `nome`, `inicio?`, `fim?`, `diaSemana`, `horario?`,
  `local?`, `etapa` (1–3, onde parou), `terminadaEm?`, `criadaPorId`, `criadaEm`, `atualizadaEm`.
  Os campos ficam opcionais no banco porque o rascunho nasce incompleto; terminar exige a regra 1.
  Único `(clubeId, id)`.
- **`GrupoClasseBiblica`**: `id`, `clubeId`, `edicaoId`, `nome`, `ordem`, `materialTitulo?`,
  `materialArquivoId?` (FK composta para `Arquivo`), `materialUrl?`, `removidoEm?`.
- **`GrupoUnidadeClasseBiblica`**: `clubeId`, `edicaoId`, `grupoId`, `unidadeId`. Único
  `(edicaoId, unidadeId)` (regra 3).
- **`EncontroClasseBiblica`**: `id`, `clubeId`, `edicaoId`, `data`, `horario`, `local?`,
  `dataOriginal?` (quando remarcado), `eventoId` (único, FK para `EventoCalendario`),
  `canceladoEm?`, `motivoCancelamento?`, `canceladoPorId?`. Índice `(clubeId, data)`.
- **`ChamadaClasseBiblica`**: `clubeId`, `encontroId`, `grupoId`, `registradaPorId`,
  `registradaEm`. Chave `(encontroId, grupoId)`. Marca "chamada registrada", inclusive a sem
  linhas (regra 8).
- **`PresencaClasseBiblica`**: `clubeId`, `encontroId`, `grupoId`, `dbvId`, `unidadeId` (a da
  data), `presente`, `participou`, `versao` (Timestamptz(3)), `alteradaPorId`, `envioId`. Chave
  `(encontroId, dbvId)`.
- **`EnvioClasseBiblicaProcessado`**: `envioId` (id), `clubeId`, `encontroId`, `grupoId`,
  `processadoEm` — o molde de `EnvioAulaProcessado` (`schema.prisma:992`) (D2).
- Os sete modelos novos entram em `MODELOS_DE_CLUBE` (`guarda-clube.ts:4-38`) **na mesma
  migration**, e na lista esperada de `guarda-clube.spec.ts`.
- Nada de INSERT em SQL: critérios pelo código (regra 11); ids pelo Prisma Client.

## Permissões (`packages/shared/src/permissoes.ts`)

- `classebiblica.chamada` — "Registrar a chamada da Classe Bíblica" —
  `{ ADM: true, CONSELHEIRO: false, INSTRUTOR: false }` (ajustável, `permissoes.ts:44-49`).
- `classebiblica.gerenciar` — "Gerenciar a Classe Bíblica" — `{ ADM: true }` (sem ajuste).
- Configurar os pontos usa a `ranking.configurar` que já existe (`permissoes.ts:31`).
- O catálogo passa de 22 para 24 chaves: `permissoes.test.ts:7` (shared) e
  `permissoes.spec.ts:20,26` (API) mudam o número.

## API (módulo novo `apps/api/src/classe-biblica/`)

| Rota | Guarda | O que faz |
|---|---|---|
| `GET /classe-biblica/edicoes` | `@Pode('classebiblica.gerenciar')` | Lista: situação (regra 2), contagens do cartão, etapa onde parou |
| `POST /classe-biblica/edicoes` · `PATCH /classe-biblica/edicoes/:id` | gerenciar | Rascunho: cria com o que houver e salva a cada saída de campo; devolve `atualizadaEm` ("Salvo às …"). Em edição terminada, só o que a regra 14 deixa |
| `PUT /classe-biblica/edicoes/:id/grupos` | gerenciar | Grupos e unidades (regras 3 e 14); erro por unidade em conflito, com o texto da regra 3 |
| `GET /classe-biblica/edicoes/:id/datas` | gerenciar | Datas da etapa 3 com marcada/motivo (regra 4) |
| `POST /classe-biblica/edicoes/:id/terminar` | gerenciar | Regra 5; body: datas marcadas |
| `GET /classe-biblica/edicoes/:id` | `@Logado` + **guarda própria**: gerenciar **ou** chamada com grupo no escopo (o `@Pode` aceita uma chave só, `pode.decorator.ts:6`) | Painel. Para quem só tem a chamada: só os grupos do escopo, o material deles e a frequência só dos desbravadores do escopo |
| `GET /classe-biblica/grupos/:grupoId/frequencia` | guarda própria, como acima | Lista na página do painel (D12): desbravador, X de Y, participou em N, do menor para o maior; cortada pelo escopo |
| `POST /classe-biblica/grupos/:grupoId/material/arquivo` · `.../material/link` | gerenciar | Anexa ou troca (regras 3 e 15) |
| `POST /classe-biblica/encontros/:id/remarcar` · `/cancelar` · `/desfazer-cancelamento` | gerenciar | Regra 7; 409 "já tem chamada" |
| `GET /classe-biblica/encontros/:id/grupos/:grupoId/chamada` | `@Pode('classebiblica.chamada')` + escopo | Lista da data (regras 8 e 9), com marcas e versões |
| `PUT /sync/classe-biblica/encontros/:id/grupos/:grupoId` | chamada + escopo | Envio da fila (regras 8–12): `envioId` idempotente (D2), `versaoVista`, avisos de ignorados e conflitos |
| `GET /classe-biblica/pontos` · `PATCH /classe-biblica/pontos` | `@Pode('ranking.configurar')` | Os dois critérios: pontos e ativo; `garantirCriterios` antes |

- **Pacote de sync** (`contratos/sync.ts:56-87`; `sync.service.ts:40-75`): campo novo
  `classeBiblica: PacoteClasseBiblica.nullable().optional()` (D22; ausente nos pacotes guardados
  antes). Montado por um provider próprio, `PacoteClasseBiblicaService`, no
  padrão de `pacote-instrutor.service.ts`, para quem tem `classebiblica.chamada`. Leva os
  encontros não cancelados de hoje−7 a hoje+7 das edições terminadas, os grupos do escopo, os
  desbravadores de cada unidade **cortados pela regra 9** com `inicio`/`fim` da unidade, e as
  presenças já gravadas com `versao`.
- **Ficha** (`contratos/progresso.ts:23-27`; `servico-progresso.ts:160-200`): `RequisitoDoDbv`
  ganha `classeBiblica: { edicao, encontros, presencas, participacoes, grupo, semGrupo,
  anteriores } .nullable().optional()` (D22). Preenchido só nos requisitos com a marca, pela
  regra 13.
- **Calendário** (`contratos/calendario.ts:19`): evento ganha `classeBiblica: { edicaoId,
  grupos, cancelado, motivo } .nullable().optional()` (D22), preenchido em `doAno` e `obter`
  (`servico-eventos.ts:77`, `:89`). `criar` (`:95`), `editar` (`:99`) e `remover` (`:103`)
  recusam evento `CLASSE_BIBLICA` (D6); `gravar` (`:109`) é o caminho comum de criar e editar.
- **Carga** (`carga.ts:10-15`, `:223-257`): o caderno aceita `"classeBiblica": true` no
  requisito, e a carga grava a marca.
- Isolamento: toda leitura e escrita leva `clubeId`; `include` aninhado com `clubeId` no `where`;
  recurso de outro clube ou fora do escopo responde 404.

## Telas

O desenho manda na estrutura, na ordem e no texto. Aqui ficam só as decisões que ele não mostra.

- **Menu do Adm**: "Classe Bíblica", ícone de livro, depois de "Cronogramas"
  (`LayoutAdm.tsx:23`). Rotas do Adm: `/adm/classe-biblica` (lista), `/adm/classe-biblica/nova`,
  `/adm/classe-biblica/:id/etapa/:n`, `/adm/classe-biblica/:id/pronta`, `/adm/classe-biblica/:id`
  (painel), `/adm/classe-biblica/encontros/:id/remarcar`,
  `/adm/classe-biblica/encontros/:id/grupos/:grupoId/chamada`. Conselheiro e Instrutor:
  `/classe-biblica/encontros/:id/grupos/:grupoId/chamada`.
- **Componente novo comum `apps/web/src/ui/IndicadorDeEtapas.tsx`**: "Etapa N de M — <nome> ·
  depois: <próximas>" em texto e as M faixas, com `role="progressbar"`, `aria-valuenow` e
  `aria-valuetext` igual ao texto. M nunca muda.
- **Salvar sozinho**: a cada saída de campo e ao trocar de etapa. A linha "Salvo às HH:MM. Pode
  sair e continuar depois de onde parou." é região viva educada e não rouba o foco. Sem conexão:
  "Sem internet: o que você preencher agora não fica salvo." no mesmo lugar (D11).
- **Conselheiro e Instrutor com a permissão** (D9): no início deles (`InicioConselheiro.tsx:295`,
  `TelaInicioInstrutor.tsx:193`), um cartão "Classe Bíblica · domingo 11/10" com "Fazer a chamada
  do Grupo Daniel" para cada encontro de hoje ou dos últimos 7 dias, de grupo do escopo, ainda
  sem chamada. É lido do pacote e funciona sem conexão.
- **Painel**: "Ver" de um encontro feito abre a chamada dele (D13); "Editar edição" abre as
  etapas 1 e 2 com o que a regra 14 trava desabilitado (D14).
- **Chamada vazia** (`Chamada-Estados`, ajustado nesta rodada): além de "Voltar à edição", o
  botão "Registrar a chamada sem ninguém" (regra 8).
- **Recusas da fila** (regra 12): o texto do servidor aparece no item da fila, na página da fila
  (`apps/web/src/modulos/fila/PaginaFila.tsx`), como as recusas da reunião.
- **Configurações do clube** (`AdmConfiguracoes.tsx`, ao lado das seções de `:118` e `:154`):
  seção "Pontos da Classe Bíblica", com dois `Campo` numéricos e um `Interruptor` "Contar" cada
  (D15).
- **Ficha** (`SecaoProgresso.tsx:110-131`): o quadro do desenho `Progresso-Requisito` abaixo do
  "Ainda não concluído"/"Concluído em", também em requisito concluído.
- **Calendário** (`tipos.ts:10-48`; `ICONE_DO_TIPO` e `TEXTO_DO_TIPO` são `Partial`, `:31`,
  `:37`; `CalendarioDoCelular.tsx`): rótulo "Classe Bíblica", cores de "Evento do clube"
  (`--cal-evento-*`), ícone de livro. O cancelado aparece riscado com "Cancelado: <motivo>". A
  ficha do evento mostra "Abrir a edição" no lugar de Editar (`FichaEvento.tsx:97`). O seletor de
  tipo do formulário não oferece Classe Bíblica (`FormularioEvento.tsx:123`). O calendário é só
  do Adm (`rotas.tsx`, grupo `ADM`), e o Adm sempre gerencia. Por isso o botão "levar à chamada
  para quem não gerencia" (R1) não tem onde aparecer (D23).
- **Quatro estados** em toda tela que lê da API: carregando, vazio, erro e sem conexão
  (`Chamada-Estados`; `Carregando`, `ErroDeCarga`, `DisponivelComInternet`). Conexão só por
  `useConexao`.
- Nenhum elemento `fixed`/`sticky` novo.

## Critérios de pronto

Cada um: ação → resultado observável. Os do desenho se conferem contra o quadro citado.

**Edição — criar (M1–M5)**
1. Clube sem unidade: abrir Classe Bíblica mostra "Antes, cadastre as unidades" e o botão
   "Cadastrar unidade" leva a `/adm/unidades` (`Lista-Vazia`).
2. Clube com unidades e sem edição: mostra "Nenhuma edição da Classe Bíblica ainda" e "Criar a
   primeira edição" (`Lista-Vazia`).
3. "Nova edição" abre "Etapa 1 de 3 — Dados da edição · depois: Grupos e Datas", com o dia e o
   local da configuração do clube já preenchidos e o horário vazio (`Edicao-1-Dados`).
4. Com início 07/03/2027 e fim 01/03/2027, sair do campo Fim mostra "O fim precisa ser depois do
   início (07/03/2027)" junto do campo, sem limpar nada (`Edicao-1-Erro`).
5. Preencher o nome e sair do campo mostra "Salvo às HH:MM". Fechar a aba e reabrir a lista mostra
   o cartão "Não terminada · Parou na etapa 1 de 3 — Dados da edição" com "Continuar de onde
   parou", que reabre a etapa com o nome preenchido. O mesmo em outro navegador, com o mesmo
   usuário.
6. Na etapa 2, marcar Águias no Grupo 1 deixa Águias no Grupo 2 desabilitada com "no <nome do
   Grupo 1>".
7. Com uma edição terminada de 07/03 a 27/06 tendo Águias, abrir a etapa 2 de um rascunho de
   01/06 a 20/12 mostra Águias desabilitada com "na <nome da outra>". Se a outra terminar depois
   que o rascunho marcou Águias, "Criar N encontros" mostra "A unidade Águias já está na edição
   <nome>, de 07/03 a 27/06. Tire-a deste grupo para continuar." e não cria nada.
8. Grupo sem material segue para a etapa 3 sem aviso de pendência. A edição terminada sem
   material aparece "Em andamento", nunca "Não terminada" (`Edicao-2-Grupos`, `Lista-Edicoes`).
   Link sem `https://` mostra "Use um link https://".
9. Com evento "Sem reunião: Páscoa" em 28/03, a etapa 3 mostra "domingo 28/03 · não terá · Sem
   reunião: Páscoa" desmarcada. Marcá-la soma 1 ao "Criar N encontros" (`Edicao-3-Datas`).
10. Em "Criar 15 encontros", o calendário do clube passa a ter 15 eventos Classe Bíblica nas
    datas marcadas, e a tela "<nome> criada" lista os grupos, com "ainda sem material" no que não
    tem, e um único botão "Ver a edição" (`Edicao-Pronta`).
11. Dois cliques em "Criar 15 encontros" (ou duas abas) deixam 15 encontros e 15 eventos, não 30.
12. O indicador de etapas expõe `role="progressbar"` com `aria-valuetext` "Etapa 2 de 3 — Grupos",
    e o total exibido é 3 em todas as etapas.

**Edição — editar depois de terminada**
13. "Editar edição" mostra início, fim e dia desabilitados. Mudar o horário para 15h muda os
    encontros futuros sem chamada e os eventos deles; os com chamada ficam como estavam.
14. Remover um grupo que tem chamada é recusado com o motivo. Remover um sem chamada tira o grupo e
    as unidades dele.

**Calendário**
15. Num domingo com reunião às 9h e Classe Bíblica às 14h, a reunião do dia continua aparecendo e
    tendo chamada (início do conselheiro), e a montagem do cronograma não perde a data.
16. O evento Classe Bíblica aparece em lilás com ícone de livro e o texto "Classe Bíblica". A
    ficha dele mostra "Abrir a edição" e nenhum "Editar". `POST`, `PATCH` e `DELETE` de evento
    desse tipo em `/eventos` respondem erro (`Calendario-Adm`).
17. O seletor de tipo do formulário de evento não tem "Classe Bíblica".

**Encontro**
18. Remarcar o encontro de 18/10 para 24/10 move o evento no calendário para 24/10, e o painel
    mostra "domingo 18/10 · remarcado para sábado 24/10" (`Encontro-Remarcar`). Data fora do
    período, no passado ou de outro encontro não cancelado é recusada. Data em feriado mostra o
    aviso e deixa seguir.
19. Cancelar com motivo "chuva forte" deixa o evento riscado com "Cancelado: chuva forte" no
    calendário e tira o encontro das contas. "Desfazer" antes da data o devolve; depois da data,
    ou com a data ocupada por outro encontro, o desfazer não aparece e a API recusa.
20. Encontro com chamada de qualquer grupo mostra "já tem chamada feita, por isso não dá para
    remarcar nem cancelar", e a API recusa os dois.

**Chamada**
21. Abrir a chamada do Grupo Daniel em 11/10 lista por unidade, todos "Presente". Noah, que entrou
    nas Águias em 01/10, aparece em Águias com "Entrou nas Águias em 01/10"; quem saiu da unidade
    antes de 11/10 não aparece (`Chamada-Encontro`).
22. Tocar no nome de Enzo muda para "Faltou" e deixa "Participou ativamente" desmarcado e
    desabilitado, com `aria-label` dizendo que ele faltou. Tocar de novo volta a "Presente" com o
    marcador desmarcado e habilitado.
23. O rodapé conta "29 presentes · 2 faltas · 4 participaram ativamente" ao vivo. "Salvar chamada"
    grava, e um envio repetido com o mesmo `envioId` não duplica linha nem ponto.
24. Enviar `participou: true` para ausente pela API grava `participou: false`.
25. Sem conexão, salvar mostra "Chamada guardada no aparelho" com os totais e envia sozinho quando
    a conexão volta (`Chamada-SemConexao`). Sem conexão e sem a chamada no pacote, mostra "Esta
    chamada ainda não está no aparelho" (`Chamada-Estados`).
26. Grupo sem ninguém na data mostra "Nenhum desbravador no Grupo Ester em 11/10" e "Registrar a
    chamada sem ninguém". Registrar trava o encontro para remarcar e cancelar (`Chamada-Estados`).
27. Duas pessoas corrigem a mesma linha sem conexão: a que chega por último vale, e o aparelho
    dela avisa com o nome do desbravador. A decisão sai da `versao`, nunca do relógio do aparelho.
28. Chamada guardada sem conexão para um encontro que, nesse meio-tempo, foi cancelado: ao enviar,
    o item fica com erro na página da fila (`PaginaFila.tsx:64`), com "O encontro de 18/10 foi cancelado; a chamada não
    foi registrada.", e nada é gravado.
29. Chamada guardada para o encontro de 18/10, remarcado para 24/10. Enviada em 20/10, o item fica
    com erro, "O encontro de 18/10 foi remarcado para 24/10; a chamada só pode ser feita a partir
    desse dia.". Enviada em 24/10 ou depois, é aceita.
30. Salvar a chamada de novo marcando faltas corrige: os pontos se ajustam e o encontro segue
    travado. Não existe botão nem rota de "desfazer chamada".

**Escopo**
31. Conselheiro com a permissão e Águias no escopo vê no início "Fazer a chamada do Grupo Daniel"
    no dia do encontro. Abrindo, a lista mostra só os desbravadores de Águias: Leões e Gaviões não
    aparecem, nem no pacote. O Grupo Ester (sem unidade dele) não aparece, e a URL dele responde
    404. Sem a permissão, nenhum aparece.
32. Envio do Conselheiro com uma linha de um desbravador de Leões grava as outras linhas e devolve
    aviso com o nome recusado.
33. Instrutor com a permissão vê só os desbravadores com matrícula CURSANDO numa classe dele no ano
    do clube, nos grupos onde há algum.
34. O painel aberto por quem só tem a chamada mostra só os grupos do escopo, o material deles e a
    frequência só dos desbravadores do escopo, sem "Editar edição", remarcar, cancelar nem anexar.

**Pontos e ranking**
35. Salvar a chamada com Ana presente e "participou ativamente" lança 10 + 5 pontos para ela na
    data do encontro. Corrigir para "Faltou" estorna os dois, e falta não lança desconto.
36. Os pontos aparecem no ranking individual e no de unidade do mês do encontro.
37. Em Configurações do clube, mudar "Presença na Classe Bíblica" para 8 faz a próxima chamada
    lançar 8. Os lançamentos antigos ficam com 10. Desligar "Contar" faz não lançar.
38. Clube com critério não padrão chamado "Presença na Classe Bíblica" ganha "Presença na Classe
    Bíblica (Classe Bíblica)". Chamar `garantirCriterios` duas vezes deixa dois critérios novos, não
    quatro.

**Requisito**
39. Na ficha de Lívia (Águias, Amigo), G6 mostra "Classe Bíblica 2026 · 2º semestre: 6 de 8
    encontros · Participou ativamente em 5 · Grupo Daniel" e, com uma edição anterior do mesmo ano
    do clube, a linha "Antes: …" (`Progresso-Requisito`). Edição de outro ano do clube não entra.
    O requisito continua não marcado.
40. Desbravador que entrou em Águias no meio da edição tem Y contado só dos encontros em que tinha
    linha: os anteriores não viram falta.
41. Desbravador cuja unidade não está em nenhum grupo mostra "a unidade dele(a) não está em nenhum
    grupo". Requisito sem a marca não mostra quadro.
42. Mover Águias do Grupo Daniel para o Grupo Ester depois de 3 chamadas não muda o grupo nem as
    contas dessas 3.

**Permissões**
43. A tela de permissões de um Conselheiro mostra "Registrar a chamada da Classe Bíblica"
    desligada e ligável; "Gerenciar a Classe Bíblica" não aparece.
44. Sem `classebiblica.gerenciar`, as rotas de edição, remarcar, cancelar e material respondem 403
    pela guarda de permissão. Edição de outro clube responde 404.

**Material**
45. Anexar um PDF de 15 MB pelo painel funciona atrás do nginx do web, com a imagem web refeita
    (`apps/web/Dockerfile:24` copia o `nginx.conf`), sem 413, e o link
    abre por URL assinada. Um de 25 MB mostra "O PDF passa de 20 MB" sem perder o resto.

**Técnicos**
46. Migration aplicada com os sete modelos em `MODELOS_DE_CLUBE`. Lint, `npm run tipos` e as
    suítes de API e web passam, e o e2e passa no CI.
47. Rodar a carga num banco de teste liga `classeBiblica` exatamente em Amigo G6, Companheiro G6,
    Pesquisador G6 e Agrupadas G15, e em nenhum outro requisito.
48. Medido no DOM em 360, 390, 820 e 1280 px: nenhuma tela nova com rolagem lateral e nenhum
    `fixed`/`sticky` novo. Área de toque dos botões novos ≥ 44×44 px.

## Como saber se funcionou

- **Edições não terminadas**: `EdicaoClasseBiblica` com `terminadaEm` nulo e `atualizadaEm` com
  mais de 7 dias, pela `etapa` onde parou. Isso mede o abandono por etapa sem instrumentação
  nova.
- **Chamadas feitas no dia**: encontros não cancelados com data passada e sem `ChamadaClasseBiblica`
  do grupo.
- Tempo até concluir a edição (`criadaEm` → `terminadaEm`) está no banco. Não há analytics de tela
  no projeto, e instrumentar fica fora desta entrega.

## Fora de escopo

- Visitantes; tela da Classe Bíblica para o desbravador (ele só vê no calendário); desconto por
  falta; marcação automática de requisito; requisitos "ajudar a organizar" (Pesquisador OL2,
  Agrupadas OL7) e "convidar pessoas" (Pesquisador AV3, Agrupadas DE27 e PC3, Pioneiro DE5);
  relatórios novos além do painel.
- Encontro avulso fora das datas da edição; mudar início e fim de edição terminada (usa-se
  remarcar); apagar edição.
- Tela de configuração geral do ranking (só a seção dos dois critérios novos entra).

## Considerado e descartado

| Mecânica / caminho | Motivo |
|---|---|
| Pontos, medalha ou sequência como mecânica de adesão à edição ou à chamada | Proibido (`gamificacao` §3). Os dois critérios novos de ranking **não** são mecânica desta SPEC: são regra do clube, num ranking que já existe (`schema.prisma:627-648`), decididos pelo usuário |
| Material obrigatório para terminar a edição | Decidido pelo usuário: a falta do material travaria a edição inteira por um item que só se usa no encontro |
| Lembrete de "falta material" na lista | Culpa e insistência; o painel do grupo já mostra "Ainda sem material" no lugar onde se anexa |
| Reaproveitar `Reuniao`/`Chamada` ou `RegistroAula` | Decidido pelo usuário: reunião é por unidade (`schema.prisma:652-680`), e a Classe Bíblica junta várias |
| Chamada começando vazia, como a da reunião | A2: 31 toques contra 2 |
| Uma pergunta por tela na criação da edição | A etapa 3 é uma lista de datas que se revisa junta; quebrá-la em telas obrigaria a guardar de cabeça o que ficou para trás |
| Visitantes, tela da Classe Bíblica para o desbravador, desconto por falta, marcação automática de requisito, requisitos "ajudar a organizar" e "convidar pessoas", relatórios além do painel | Fora de escopo por decisão do usuário |

## Decisões

Confirmadas pelo usuário (D1–D8), tomadas na fase 2 (D9–D18) e tomadas na revisão adversarial
(D19–D30; as marcadas "usuário" vieram dele, as outras do coordenador ou de quem escreveu). Cada
uma: impasse → escolha | alternativa e o que mudaria para quem usa.

| # | Impasse → escolha | Alternativa (e o que mudaria) |
|---|---|---|
| D1 | Requisito sem marca de assunto → `Requisito.classeBiblica`, pela carga e por UPDATE na migration | Reconhecer pelo texto (a linha some se o caderno mudar a redação) |
| D2 | `EnvioProcessado` exige reunião → tabela própria `EnvioClasseBiblicaProcessado` | Afrouxar a tabela da reunião |
| D3 | Sem INSERT em SQL → `garantirCriterios` idempotente, chamado ao terminar, antes de pontuar a chamada e ao abrir a seção de pontos; 10 e 5, ativos, `padrao`, lançados por Adm, mudáveis (regra 11) | Começar desligados (ranking sem pontos de Classe Bíblica até alguém ligar) |
| D4 | "Só Adm, ajustável" exige o papel no padrão → `classebiblica.chamada` com Conselheiro e Instrutor `false`; `classebiblica.gerenciar` só Adm | Gerenciar ajustável |
| D5 | Evento novo derrubaria a reunião do dia → `situacaoDaData` ignora `CLASSE_BIBLICA` | Regra comum (reunião e montagem mudariam junto) |
| D6 | Encontro editável pelo calendário burlaria "com chamada não remarca" → calendário leva à edição | Editar pelo calendário |
| D7 | `Material.classeId` obrigatório → campos de material no grupo, sobre `Arquivo`, rota e `location` próprios | Afrouxar `Material` (apareceria nas telas de material de classe) |
| D8 | A chamada offline vem no pacote → "Abra o app uma vez com internet" | "Abra a página da edição" (segundo caminho offline) |
| D9 | O desenho só mostra a chamada a partir do painel do Adm; Conselheiro e Instrutor não chegam ao painel → cartão no início deles, do dia do encontro até 7 dias depois, enquanto não houver chamada | Item de menu com a lista de edições (mais um lugar para procurar, e não funciona sem conexão) |
| D10 | Instrutor não tem unidade no escopo → vê os grupos com algum desbravador CURSANDO numa classe dele no ano do clube corrente, e só esses desbravadores (regra 9) | Ver todos os grupos, ou nenhum (a permissão seria inútil para ele) |
| D11 | Rascunho vive no servidor e a etapa sem conexão não salva → aviso "Sem internet: o que você preencher agora não fica salvo." | Guardar no aparelho e enviar depois (um segundo caminho offline só para o Adm) |
| D12 | "Ver a frequência de cada um" não tem destino desenhado e relatório novo está fora → lista na própria página do painel, abaixo do bloco | Tela própria (seria um relatório novo) |
| D13 | "Ver" de encontro feito sem destino desenhado → abre a chamada daquele encontro, corrigível por quem tem a permissão | Detalhe só de leitura (corrigir exigiria outro caminho) |
| D14 | "Editar edição" sem desenho próprio → reabre as etapas 1 e 2 com início, fim e dia travados; horário e local mudam os encontros futuros sem chamada; grupo com chamada não sai (regra 14) | Reabrir as três etapas (recriaria encontros que já têm chamada) |
| D15 | Não existe tela de critérios de ranking → seção "Pontos da Classe Bíblica" em Configurações do clube | Valores fixos até existir tela de ranking (o Adm não conseguiria mudar) |
| D16 | O painel do desenho mostra motivo num remarcado, mas remarcar não pede motivo → linha "domingo 18/10 · remarcado para sábado 24/10" | Pedir motivo também ao remarcar (campo a mais) |
| D17 | Contar pela data deixaria todos "ausentes" num encontro sem chamada → "feito" exige chamada registrada do grupo | Contar pela data |
| D18 | O desenho não marca obrigatórios na etapa 1 → nome, início, fim, dia e horário obrigatórios; local opcional (a configuração permite local vazio, `schema.prisma:226`) | Local obrigatório (travaria clube sem local padrão) |
| D19 | O tipo novo precisa de marcações em `MARCACOES_PADRAO`, indexado em quatro lugares → `{ temReuniao: true, temClasse: true, bomParaCampo: false }`, os valores que não mudam nenhuma das três contas do dia, e `situacaoDaData` ignora o tipo (regra 6) | Valores "falsos" e só a exclusão na regra (quem lesse o evento por fora da regra derrubaria a reunião) |
| D20 | Critério para clube novo: mexer em `clube-criar.ts` muda a contagem de 8 critérios em `clube-criar.spec.ts:10-25` e `fabricas.ts:74` → `clube-criar.ts` não muda; o clube novo ganha os dois pelo `garantirCriterios` | Clube nascer com 10 critérios (os dois testes e a fábrica mudam junto) |
| D21 | Conflito de versão na chamada → a versão que chega por último vale e o aparelho avisa com os nomes, como a reunião; sem tabela de histórico | Histórico das alterações, como `ChamadaAlteracao` (uma tabela a mais para um caso raro) |
| D22 | `.default(null)` num contrato de saída obriga a mexer em todo literal tipado (o pacote montado em `sync.service.ts`, `criarPacote` e 7 arquivos de handlers) → `classeBiblica` do pacote, da ficha e do evento é `.nullable().optional()`: pacote guardado antes continua válido (ausente = sem Classe Bíblica) e nada fora dos pacotes muda | `.default(null)`, como `instrutor`, e editar todos esses literais no P0 |
| D23 | R1 pede que a ficha do evento leve à chamada para quem não gerencia, mas o calendário é só do Adm, que sempre gerencia → nada a fazer; quem não gerencia chega pela chamada do início (D9) | Abrir o calendário a outros papéis (fora desta entrega) |
| D24 | "Grupo vazio pode salvar sem linhas" (R4) precisa de um registro de "chamada feita" que não depende de linha → tabela `ChamadaClasseBiblica` por (encontro, grupo), e o botão "Registrar a chamada sem ninguém" no estado vazio (`Chamada-Estados` ajustado) | Deduzir "feito" das linhas (grupo vazio nunca contaria como feito e o encontro não travaria) |
| D25 | (revisão) Escopo da chamada do Conselheiro: só os desbravadores das unidades dele, inclusive no pacote; linha fora do escopo recusada (regra 9, R1) | Grupo inteiro visível (vazava nomes de outras unidades) |
| D26 | (revisão) Envio da fila contra encontro cancelado ou remarcado → recusa com motivo na fila; remarcado vale pelo encontro quando a data nova chega (regra 12, R3) | Gravar pela data original (chamada de um encontro que não aconteceu naquele dia) |
| D27 | (revisão) X de Y por linha gravada; grupo gravado na linha (regras 8 e 13, R4) | Contar pela unidade na data (quem entrou depois ganharia falta implícita) |
| D28 | (revisão) Ficha conta só edições que cruzam o ano do clube da matrícula exibida (regra 13, R5) | Todas as edições (a classe de um ano mostraria encontros de outro) |
| D29 | (revisão) Concorrência ao terminar: trava por clube, reconferência e idempotência por `terminadaEm`; rascunhos podem disputar a unidade (regras 3 e 5, R7) | Bloquear a unidade já no rascunho (um rascunho esquecido travaria a unidade) |
| D30 | (usuário) Não há "desfazer chamada"; corrige-se marcando as faltas (regra 10, R2) | Botão de desfazer (destravaria remarcar e cancelar depois de chamada feita) |

## Regras de negócio respondidas pelo usuário

1. Chamada de Conselheiro ou Instrutor: só grupos que contêm unidade do escopo dele; fora, 404. O
   Adm vê todos (o Instrutor, pela D10).
2. "X de Y": em cada data, o grupo da unidade vigente naquela data.
3. Mais de uma edição: a mais recente com encontro feito; as anteriores numa linha menor.
4. "Participou ativamente" travado (desmarcado e desabilitado) em quem faltou.
5. Cancelamento se desfaz até a data do encontro.

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
