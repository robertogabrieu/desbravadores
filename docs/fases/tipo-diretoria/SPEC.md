# Diretoria como valor do Tipo — SPEC e plano

Hoje o cadastro tem **Tipo** (Desbravador ou Líder em formação), escolhido à mão e gravado, e a
**Diretoria** é uma marca calculada à parte, mostrada como selo. O dono do produto quer **um conceito
só**: a Diretoria passa a ser um **valor do Tipo**, gravado no cadastro.

## Decisões do dono do produto (não se reabrem)

1. O Tipo passa a ter três valores: **Desbravador**, **Diretoria** e **Líder**.
2. A Diretoria é **automática, e o Adm pode ajustar**: o sistema muda o Tipo sozinho (pela idade em
   janeiro e ao ganhar ou perder o papel de conselheiro/instrutor), e o Adm também pode marcar
   Diretoria à mão para quem não se encaixa na regra.
3. Regra de entrada automática (já implementada em `diretoriaPelaIdade`): completa **16 anos até
   30/06** do ano civil — vale o ano todo, desde 1º de janeiro — **ou** é conselheiro/instrutor ativo
   no clube. Conselheiro é obrigatoriamente Diretoria.
4. **Nenhuma Diretoria participa da chamada nem do ranking — só desbravadores.** A Diretoria continua
   **cursando classe** (ex.: Agrupadas) normalmente.
5. Líder e Diretoria são coisas diferentes.

## Pré-requisito

**A PR #16 (convite de acesso por link) precisa estar na `main` antes de começar.** Na `main` sem ela,
só Líder pode ter conta de usuário (`desbravadores.service.ts:202,275`), e Líder nunca muda sozinho:
o gatilho "ganhou papel de conselheiro → vira Diretoria" não aconteceria com ninguém. A #16 tira essa
trava. **Diretoria pode ter conta** (é o caso normal: conselheiros e instrutores têm conta).

## Por que isto fica barato

O que **lista pessoas** — chamada do conselheiro, membros da unidade, ranking, visão geral, pontos das
aulas, fotos, perfil, especialidades, pedidos — já filtra por `tipo: 'DBV'` (ver `ONDE FICA`). Com a
Diretoria gravada como `DIRETORIA` e fora da unidade, ela sai desses lugares sem lógica nova. Duas
exceções, tratadas abaixo: o **envio** da chamada e o **ranking de meses passados**. O trabalho real é: o valor novo no banco, a **sincronização automática** do Tipo e os poucos
lugares que precisam **incluir** a Diretoria (aulas e progresso, porque ela cursa classe).

## Regras

### Valores e transições

- `TipoPessoa` ganha `DIRETORIA` (Prisma e `packages/shared`). `Desbravador` ganha
  `diretoriaPeloAdm Boolean @default(false)` (foi o Adm que marcou) e `diretoriaDesde DateTime? @db.Date`
  (data em que entrou na Diretoria; nula fora dela). A migration só cria o valor e as colunas e **não
  usa** `DIRETORIA` no mesmo arquivo (Postgres 17 aceita `ADD VALUE` em transação, desde que o valor
  não seja usado nela).
- `Desbravador` ganha também a **véspera da entrada**, que o ranking lê (ver "Ranking e frequência"):
  `diretoriaVeioDeDbv Boolean @default(false)` (era DBV no momento da troca) e
  `diretoriaUnidadeAnteriorId String? @db.Uuid` (a unidade aberta no momento da troca; nula se não
  tinha), com chave composta `(clubeId, diretoriaUnidadeAnteriorId)` para `Unidade`, `RESTRICT` —
  unidade é desativada, nunca apagada. Migration própria, `20261001200000_diretoria_vespera`.
- **Transições automáticas só entre DBV e DIRETORIA. Líder nunca muda sozinho** (decisão desta SPEC:
  Líder é escolha do Adm; um Líder que ganhe papel de conselheiro continua Líder — e Líder já fica
  fora de chamada e ranking).
- `regraDaDiretoria(ficha, hoje) = diretoriaPelaIdade(nascimento, hoje) || temPapelAtivo(CONSELHEIRO|INSTRUTOR)`.
- DBV → DIRETORIA quando a regra vale.
- DIRETORIA → DBV automaticamente só quando a regra **não** vale **e** `diretoriaPeloAdm` é falso
  (casos reais: menor de 16 que perdeu o papel; Adm que corrigiu a data de nascimento). Com a data
  certa, a idade só cresce: na prática, pela idade, uma vez Diretoria, sempre Diretoria.
- **Adm:** pode pôr Diretoria em quem não tem a regra (grava `diretoriaPeloAdm = true`). Pode tirar
  (voltar a Desbravador) **só** se a regra não vale; se vale, 422 com o motivo: "Tem 16 anos até
  junho: é Diretoria automaticamente." / "É conselheiro ou instrutor: é Diretoria obrigatoriamente."
  Pode escolher **Líder** para qualquer um, mesmo quando a regra da Diretoria vale (Líder também fica
  fora de chamada e ranking); zera `diretoriaPeloAdm` e `diretoriaDesde`. Um Líder que é conselheiro
  continua Líder, e a tela não mostra motivo de Diretoria para ele (`motivosDiretoria` vazio).
- O Tipo passa a ser **editável na edição** (hoje fica travado depois do cadastro).

### Ao entrar na Diretoria (ou em Líder)

- O vínculo aberto com a unidade (`MembroUnidade` com `fim` nulo) é **encerrado** com `fim` = data da
  troca, na mesma transação que grava o tipo — nunca apagado. A pessoa já não entra na reunião desse
  dia (o envio aceita quem tem `fim` depois da data), some da lista de membros e o histórico fica.
  (Líder já não pode ter unidade: mesma regra.)
- `diretoriaDesde` = data da troca (no fuso do clube).
- Na mesma gravação, a véspera: `diretoriaVeioDeDbv` = o tipo anterior era DBV, e
  `diretoriaUnidadeAnteriorId` = a unidade da passagem aberta, **lida antes de encerrá-la** (nula se
  não havia; também nula vindo de Líder). Vale para os dois caminhos da troca — a escolha do Adm e a
  sincronização pela regra. Quem já era Diretoria guarda a da entrada. **Ao sair** da Diretoria (para
  DBV ou Líder) os dois zeram; numa reentrada vale a nova véspera. Cadastro e importação direto como
  Diretoria ficam com `false`/nula: nunca foram DBV no clube.
- Matrículas de classe **continuam**: a Diretoria cursa classe.
- Ao **voltar** a Desbravador, a pessoa fica sem unidade; o Adm escolhe. A tela avisa.

### Quando o sistema sincroniza

O Tipo é gravado; ele precisa ser recalculado nestes momentos (todos idempotentes):

1. **Cadastro e edição da ficha** (nascimento muda a regra) — na mesma transação.
2. **Papel dado, alterado ou desativado** (criar/editar/desativar vínculo em Usuários; aceite de
   convite por link, se a PR #16 já estiver na main) — recalcula a ficha ligada à conta
   (`Desbravador.usuarioId`) no clube do vínculo.
3. **Importação de planilha** — o tipo é decidido **antes** de gravar, pela mesma função pura: quem tem
   16+ entra direto como Diretoria, **sem** unidade (a prévia avisa "Diretoria não entra em unidade"
   e a unidade da linha é ignorada). Gravar como DBV e recalcular depois criaria uma passagem falsa
   pela unidade, aberta e fechada no mesmo dia.
4. **Virada de ano** — a API não tem agendador hoje. Decisão desta SPEC: um serviço da API recalcula
   **todos os clubes ao subir** e **a cada 6 horas** (`setInterval` no `onModuleInit`, sem dependência
   nova, com trava para não rodar duas vezes no mesmo processo; há um só container de API em
   produção). Em 1º de janeiro os novos 16 entram na Diretoria em até 6 horas. Uma função pura em
   `packages/shared` decide o Tipo; a API só aplica.
   - **Gravação condicional:** a varredura lê a ficha e grava com `updateMany` filtrando pelo `tipo` e
     pelo `diretoriaPeloAdm` que leu; se o Adm mudou no meio, a varredura não sobrescreve.
   - **Desligável e testável:** liga só com `TAREFAS_PERIODICAS=1` no ambiente (ligado em
     `docker-compose.prod.yml` e no `.env.exemplo`; desligado no `.env.teste`), e expõe
     `sincronizarTodos(hoje)` para o teste chamar com a data que quiser (virada de ano simulada).
   - **Fora de sessão:** listar todos os clubes exige o client sem guarda (`PrismaSistema`), que o
     CLAUDE.md só permite em `sessao/`, `auth/` e `scripts/`. Decisão: o serviço fica em
     `apps/api/src/tarefas/` e esta entrega acrescenta `tarefas/` à lista do CLAUDE.md (e à regra de
     lint, se houver uma que imponha isso — conferir). Ele só lista os ids de clube com o client sem
     guarda; o resto roda pelo client com guarda, clube a clube, com `clubeId`.
5. Depois da migration, a primeira subida da API já faz o **preenchimento inicial** (a mesma
   recalculação) — a migration só cria o valor e a coluna.

### Chamada: vale a unidade na data da reunião

Hoje o **envio** da chamada aceita só `tipo 'DBV'` (`reunioes-envio.service.ts:213`). Com a Diretoria,
isso apagaria em silêncio a linha de quem virou Diretoria depois da reunião — uma chamada da semana
passada enviada offline, ou a correção de uma chamada antiga. Decisão: o envio passa a aceitar quem
**era membro da unidade na data da reunião** (passagem com `inicio <= data` e `fim` nulo ou `> data`),
**sem olhar o tipo atual**. Como a pessoa sai da unidade ao virar Diretoria, as reuniões seguintes já
não a incluem.

### Ranking e frequência: o passado não muda

- **Frequência** (visão geral, `visao-geral.service.ts:144`, e da unidade, `calculo-ranking.ts:131`,
  usada no início em `inicio.service.ts:56`) conta as chamadas registradas, sem olhar o tipo. Isso já
  é o desejado: as presenças antigas de quem virou Diretoria continuam valendo para o período delas, e
  dali em diante ela não está mais em chamada nenhuma. **Não mudar.**
- **Ranking** é calculado na hora pelo tipo atual (`calculo-ranking.ts:67`): sem cuidado, quem vira
  Diretoria some também dos meses anteriores e muda a média da unidade retroativamente. Decisão: o
  ranking de um mês inclui a ficha se ela era DBV naquele mês — `tipo = 'DBV'` **ou**
  (`tipo = 'DIRETORIA'` e `diretoriaDesde` depois do fim do mês). Meses anteriores à entrada na
  Diretoria ficam como estavam.
- **O ranking de meses anteriores mostra a Diretoria como mostrava na véspera da entrada.** O ranking
  não guarda histórico de unidade: o desbravador comum aparece em todos os meses com a unidade atual.
  Para entrar na Diretoria não mudar o passado, a ficha DIRETORIA conta num mês anterior a
  `diretoriaDesde` **se e somente se** `diretoriaVeioDeDbv`, e conta **com
  `diretoriaUnidadeAnteriorId` em todos esses meses** — inclusive nula, como o DBV sem unidade aparece.
  Assim quem esteve na unidade A de janeiro a março, na B desde julho e virou Diretoria em outubro
  aparece na B de janeiro a setembro — antes e depois da entrada —, e a média da B nesses meses é a
  mesma consultada em setembro ou em outubro. Quem chega de Líder não aparecia no ranking da véspera e
  não aparece em mês nenhum, nem nos meses em que foi DBV.
- A véspera é **gravada na troca**, não deduzida das passagens de unidade: a dedução pela passagem que
  terminou no dia da entrada errava quando o Adm mudava ou tirava a unidade no mesmo dia (duas
  passagens terminam nesse dia), quando a passagem aberta começava no futuro (termina no início dela,
  não na data da entrada) e no DBV sem unidade (sumia, em vez de continuar sem unidade).

### Lugares que precisam INCLUIR a Diretoria

A Diretoria cursa classe, então onde hoje está `tipo in ['DBV','LIDER']` passa a incluir
`DIRETORIA`: membros da aula e o pacote do instrutor. **Pontos de ranking continuam só para `DBV`**
(as aulas já só pontuam DBV). O resto, que filtra `tipo: 'DBV'`, **fica como está** — é exatamente a
exclusão pedida.

### O que sai

- A marca calculada `diretoria { membro, motivos }` na saída e o filtro `diretoria=sim|nao` (PR #15)
  são substituídos: a saída mantém só os **motivos** (`motivosDiretoria: ('IDADE' | 'CONSELHEIRO' |
  'INSTRUTOR' | 'ADM')[]`, vazio quando não é Diretoria) para a tela explicar o porquê, e o filtro
  vira o filtro por **Tipo**, que o contrato já aceita (`tipo` opcional no filtro).
- O selo "Diretoria" ao lado do nome sai; a coluna Tipo mostra Desbravador / Diretoria / Líder.

## Tela (Adm → Desbravadores)

- **Lista:** coluna Tipo com os três valores; filtro **Tipo** (Todos / Desbravador / Diretoria /
  Líder) no lugar do filtro "Diretoria".
- **Painel do desbravador:** o campo **Tipo** com os três valores, editável; abaixo, a ajuda diz o
  motivo quando é Diretoria ("Diretoria pela idade (16 anos até junho)", "… porque é conselheiro",
  "… marcado pelo Adm"). A linha separada "Membro da Diretoria" sai. Escolher Desbravador quando a
  regra vale mostra o erro do 422 no próprio campo. Trocar para Diretoria ou Líder avisa: "Sai da
  unidade e da chamada; continua cursando a classe."

## Critério de pronto

- Função pura: cada transição (DBV↔DIRETORIA por idade, por papel, por Adm; Líder nunca muda sozinho;
  idade é irreversível; menor sem papel volta).
- API: migration aplica no banco real; sincronização em cada gatilho (cadastro, edição de nascimento,
  papel dado/desativado, importação, varredura periódica com virada de ano simulada pelo relógio);
  membro de unidade encerrado ao virar Diretoria; Diretoria fora da chamada, da frequência, do ranking
  e da visão geral (testes que já existem para `DBV` continuam e ganham o caso Diretoria); Diretoria
  na aula e no pacote do instrutor, sem pontuar; Adm marca/tira com as recusas; filtro por tipo;
  isolamento entre clubes.
- Web: lista, filtro, campo Tipo editável com motivo e erros, aviso de saída da unidade.
- Chamada: envio aceita quem era membro na data da reunião, mesmo que hoje seja Diretoria; recusa quem
  não era; reunião do dia da troca já não inclui a pessoa.
- Ranking: mês anterior à entrada na Diretoria inclui a pessoa; mês da entrada em diante, não; média
  da unidade de meses passados não muda.
- Importação: 16+ entra como Diretoria sem unidade, com o aviso na prévia; nenhuma passagem falsa.
- Varredura: desligada nos testes; `sincronizarTodos(hoje)` com virada de ano; gravação condicional
  não sobrescreve escolha do Adm feita no meio.
- Lint, tipos e suítes passam (uma por vez, `--maxWorkers=1` na API).

## Restrição conhecida: celular com a versão antiga do app

O app confere cada resposta contra o contrato, e os contratos do pacote do instrutor e do progresso
listam os tipos (`packages/shared/src/contratos/sync.ts:21`, `progresso.ts:17`). Um celular com a
versão antiga em cache recusa o pacote em que apareça `DIRETORIA` até o app atualizar (o que acontece
ao reabrir, com o service worker novo). Isso **fica, declarado**: não há como mudar o app velho já
instalado, e o efeito some sozinho na atualização.

## Fora desta entrega

- Agendador de verdade (cron/fila). A varredura de 6 h resolve a virada de ano; um agendador próprio
  é outra issue.
- Mudar regra de Líder (continua manual).

## Execução

- **Nível sessão:** uma sessão nova, nesta branch (`feature/tipo-e-diretoria`, PR em rascunho).
  Antes de começar, traga a `main` atual para a branch (merge, sem rebase): as PRs do convite (#16) e
  de "cursa × instrui" mexem nos mesmos arquivos de desbravadores.
- **Nível agente principal:** escreve a migration e o enum (arquivos de dono compartilhado) antes de
  delegar; commita por pacote; roda git.
- **Nível subagente:** dois pacotes, em sequência (o web depende do contrato):
  1. **API + shared** (~10 arquivos alterados): função pura, contrato, sincronização e gatilhos,
     serviço periódico, inclusão da Diretoria em aulas/pacote, regras do Adm, testes.
  2. **Web** (~6 arquivos): lista, filtro, campo Tipo, motivos, avisos, handlers e testes.
- Testes sempre pelo `testador`, dentro da trava `flock /tmp/desbravadores-suite.lock`.
- Retorno de cada pacote: arquivos tocados (caminhos), verdes e nomes que falharam, decisões tomadas
  sozinho, pendências — sem diff colado.

## ONDE FICA

```
- enum do Tipo (banco)                      apps/api/prisma/schema.prisma:42-45
- enum do Tipo (shared)                     packages/shared/src/enums.ts:6,16
- contrato do desbravador (tipo, saída)     packages/shared/src/contratos/desbravadores.ts:20,35,59,72,81,83
- regra de idade (pura)                     packages/shared/src/formulas/diretoria.ts:2-10
- marca calculada e filtro "diretoria"      apps/api/src/desbravadores/desbravadores.service.ts:45,81-114,159
- regras de tipo no cadastro/edição         apps/api/src/desbravadores/desbravadores.service.ts:199,202,275-276,336,493
- conselheiro vê só DBV                     apps/api/src/desbravadores/escopo.service.ts:57
- chamada (pacote do conselheiro)           apps/api/src/sync/sync.service.ts:83
- membros da unidade                        apps/api/src/unidades/unidades.service.ts:100,124,166
- ranking só DBV                            apps/api/src/ranking/calculo-ranking.ts:67
- perfil: ranking só DBV                    apps/api/src/desbravadores/perfil.service.ts:41
- visão geral só DBV                        apps/api/src/visao-geral/visao-geral.service.ts:126,128,222
- membros da aula (DBV+LIDER) e pontos      apps/api/src/aulas/aulas-envio.service.ts:214,293,356
- pacote do instrutor (membros)             apps/api/src/sync/pacote-instrutor.service.ts:69
- requisitos: só DBV pontua                 apps/api/src/progresso/requisitos-dbv.service.ts:40,71,95
- fotos (filtro por tipo)                   apps/api/src/fotos/fotos.service.ts:244
- envio da chamada exige DBV                apps/api/src/reunioes/reunioes-envio.service.ts:213
- frequência do clube (sem filtro de tipo)  apps/api/src/visao-geral/visao-geral.service.ts:144,171
- frequência da unidade e uso no início     apps/api/src/ranking/calculo-ranking.ts:131 · apps/api/src/inicio/inicio.service.ts:56
- especialidades e pedidos (só DBV)         apps/api/src/especialidades/especialidades-dbv.service.ts:64,94 · apps/api/src/pedidos/pedidos.service.ts:35
- importação: tipo e unidade                apps/api/src/desbravadores/importacao.service.ts:200-205
- tipo fixo 'DBV'|'LIDER' no retorno        apps/api/src/progresso/servico-progresso.ts:42 · apps/api/src/progresso/requisitos-dbv.service.ts:95
- contratos do celular com a lista de tipos packages/shared/src/contratos/sync.ts:21 · packages/shared/src/contratos/progresso.ts:17
- client sem guarda (regra do repo)         CLAUDE.md ("PrismaSistema ... só em sessao/, auth/ e scripts/")
- testes que vão quebrar                    apps/api/src/desbravadores/diretoria.spec.ts · apps/web/src/modulos/adm/desbravadores/desbravadores.test.tsx · apps/web/src/testes/handlers/{desbravadores,perfil}.ts · apps/web/src/modulos/adm/usuarios/usuarios.test.tsx
- importação grava DBV                      apps/api/src/desbravadores/importacao.service.ts:200
- tela: coluna Tipo, selo e filtro          apps/web/src/modulos/adm/desbravadores/ListaDesbravadores.tsx:35,59,86,91,93,190-196
- tela: campo Tipo e linha Diretoria        apps/web/src/modulos/adm/desbravadores/FormularioDesbravador.tsx:18,43-54,106,217-220
- conferido em                              11114a7
```
