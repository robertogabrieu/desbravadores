# Fase 3 — Adm · Spec

**Status:** revisada em duas rodadas · **Branch:** `feature/fase-3-adm`, criada da `main` **com a 1b e a
[base 2·3](../fase-2-3/SPEC.md) mescladas** · PR própria · pode rodar junto com a Fase 2

Precedência, regras gerais e anexos: os da [base 2·3](../fase-2-3/SPEC.md). As specs das Fases 0 e
1 valem onde esta não as altera.

## 1. Entrega

Visão geral (A0), classes e especialidades do clube (A5), **calendário** (A6), **montar
cronograma** no computador (A7) e no celular pelo instrutor liberado (I3b), enviar e publicar,
**avisos de conflito** e demais notificações (A8), configurações do clube.

**Fora da Fase 3:** A1–A3 continuam as da Fase 0; classe e requisito criados pelo clube (só ajuste
dos oficiais); importar calendário da Associação; e-mail ou push; relatórios (Fase 4); feed de
atividade com reuniões, fotos e especialidades (a atividade só tem os tipos da base §6).

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| G1 | Montagem pela base: datas de aula B5, conflito B6, quem monta B3 | Base 2·3 |
| G2 | **Colocar requisito** (`PUT /cronogramas/:id/requisitos/:rid {data}`): move se já está em outra data; cria a aula da data se não existir (só individuais; Agrupadas precisam da aula criada antes por `POST /cronogramas/:id/aulas` — data que já tem aula ativa → 409 `CONFLITO`); individuais: data fora de `datasDeAula` ou do período → 422. Aula que fica sem requisito é removida (`removidaEm`) — em Agrupadas só por remoção explícita. **Aula dada** (existe `RegistroAula` da mesma classe e data — base B6) não é editada, movida, esvaziada nem recebe requisito → 422 "Esta aula já foi dada." | Um requisito numa data só; o que foi dado não se reescreve |
| G3 | **Concorrência**: toda mutação de montagem faz `SELECT … FOR UPDATE` no cronograma **e termina com `update` na linha do `Cronograma`** (status `RASCUNHO`, `atualizadoEm` novo) — mesmo que já estivesse em rascunho; violação de unicidade (`(cronogramaId, requisitoId)`, aula ativa por data) → 409 `CONFLITO` "Outra pessoa acabou de mudar esta data. Atualize a tela."; **Enviar e Publicar** recebem `atualizadoEmVisto` e respondem 409 "O cronograma mudou desde que você abriu. Revise antes de publicar." se diferir | Adm não publica meia montagem |
| G4 | Toda edição no vivo → `RASCUNHO`; Enviar só instrutor liberado e só de `RASCUNHO`; Publicar só Adm, de `RASCUNHO` ou `ENVIADO`, grava `CronogramaPublicacao` (`{ aulas: [{ id, data, horario, local, titulo, requisitoIds }] }`, só aulas ativas) e põe `PUBLICADO` | Base B2 |
| G5 | **Cronograma novo**: a **tela** preenche o período padrão = o ano do clube (`inicioAnoClube` até a véspera do próximo) — o contrato exige `inicio` e `fim`; editável por `PATCH` se nenhuma aula ficar fora (senão 422 listando as datas) | Nada fica fora do período |
| G6 | **Evento** criado/editado/removido: calcula com `emConflito` (B6) o conjunto de aulas em conflito **antes e depois**, sobre o vivo e a última publicação (deduplicado por aula), e só as que **entraram** em conflito vão em `aulasAfetadas` e geram `CONFLITO_CRONOGRAMA` — **uma** notificação por (pessoa, classe) por gravação, para os instrutores da classe (`instrutoresDaClasse`) e, se `quemMonta=ADM`, para os Adms ativos; link por destinatário (B9) | Sem spam; sem vazar para outro clube |
| G7 | Notificações: `CRONOGRAMA_ENVIADO` (Adms), `CRONOGRAMA_PUBLICADO` (instrutores da classe), `CONFLITO_CRONOGRAMA` (G6). `ServicoAtividade.registrar` em enviar, publicar e criar evento | Base B9 |
| G8 | **A5**: por classe oficial, `ClasseClube` (ativa; quem monta); por requisito, `RequisitoAjuste` (ativo e CAMPO; `null` = volta ao oficial), com `RequisitoSaida.oficial`/`ajustado` para a tela; especialidade do clube = `Especialidade` com `clubeId`, `origem=CLUBE`, nome único na área, num **controller separado** `especialidades-clube.controller.ts`. Desativar classe com matrícula `CURSANDO` → 422 | Fase 0 D12 |
| G9 | **Configurações**: dia e hora da reunião, local padrão, limiares e meta. Mudar `diaReuniao` com aula **futura** planejada em classe individual → 422 "Há aulas marcadas no dia atual de reunião: <classes>. Mova-as antes." `fuso` e `inicioAnoClube` não editáveis | Não deixa cronograma em dia que já não é de reunião |
| G10 | **Visão geral** lê as tabelas direto (sem usar código da 1b ou da Fase 2): `dbvsAtivos` = tipo DBV ativo; `variacaoTrimestre` = ativos hoje − DBVs com `entradaEm ≤ hoje−3 meses` e (`saidaEm` nulo ou `> hoje−3 meses`); `frequenciaMes` = E13 da Fase 1 sobre as chamadas das reuniões do mês até hoje; `variacaoFrequencia` = contra o mês anterior inteiro; `especialidadesAno` = conclusões ativas com `concluidaEm` no ano do clube; `especialidadesPorDbv` = `especialidadesAno / dbvsAtivos` com 1 casa (0 se sem DBV); `classesCobertas` = classes ativas do clube com ≥ 1 instrutor (`instrutoresDaClasse`) | Números com fórmula fechada |
| G11 | Montagem só online; o Adm monta no computador (A7) e o instrutor liberado no celular (I3b); as duas telas usam `MontagemSaida`. `GET /classes/:id/cronograma/montagem` sem cronograma → 200 com `cronograma: null` (a tela oferece "Criar"); fora do escopo → 404 | Distingue "criar" de "sem acesso" |
| G12 | Rota `/cronograma/montar` (reservada pela base, sob a guarda INSTRUTOR+ADM): Adm → A7 (em tela estreita, A7 com a faixa "O painel do Adm é melhor no computador"); instrutor que monta → I3b; instrutor que não monta → redireciona para `/cronograma?classe=`; conselheiro não chega (guarda) | Um endereço, a tela certa |

## 3. API

| Rota | Quem |
|---|---|
| `GET /calendario?ano` | `@Logado` |
| `POST /calendario/eventos`, `PATCH`/`DELETE /calendario/eventos/:id` | `calendario.gerenciar` |
| `GET /classes/:id/cronograma/montagem`, `POST /cronogramas`, `PATCH /cronogramas/:id`, `PUT/DELETE /cronogramas/:id/requisitos/:rid`, `POST /cronogramas/:id/aulas`, `PATCH /aulas-planejadas/:id` | quem monta (B3) |
| `POST /cronogramas/:id/enviar` | instrutor liberado da classe |
| `POST /cronogramas/:id/publicar` | Adm |
| `PATCH /classes/:id`, `PATCH /requisitos/:id/ajuste`, `POST /especialidades` | `classe.gerenciar` |
| `GET /visao-geral` | Adm |
| `GET`/`PATCH /clube/configuracao` | `clube.configurar` |

`MontagemSaida.datas` (individuais): `datasDeAula` do período **mais** as datas com aula (inclusive
as que ficaram bloqueadas, com `conflito`); Agrupadas: só as datas com aula. `requisitos`: todos os
ativos com ajuste, na ordem do caderno, com a data atual. Texto de cada data na tela = nome(s) do
evento + rótulo pelas marcações: "sem aula de classe" (`bloqueiaAula`), "ótimo para campo"
(`bomParaCampo`), "reunião mantida" (evento sem `cancelaReuniao` nem `bloqueiaAula`).

## 4. Telas

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/adm` (Visão geral) | A0 | `Adm-Inicio.dc.html` | cartões G10; progresso por classe (média, DBVs, instrutores); unidades com frequência (limiar do clube); "Cronogramas aguardando publicação" (link); atividade recente (só os tipos da base §6) |
| `/adm/classes?classe=` | A5 | `Adm-Classes.dc.html` | aba Classes: lista na ordem; seções e requisitos com contagem real; "Ativa" e "Quem monta o cronograma: Adm / Instrutores da classe"; por requisito, "Ativo" e "Campo" com o valor oficial ao lado e "voltar ao oficial" quando `ajustado`; `?classe=` abre a classe. Aba Especialidades: por área (lista real), busca, "Nova especialidade do clube" |
| `/adm/calendario` | A6 | `Adm-Calendario.dc.html` | abas de mês; grade dom–sáb com "Reunião <hora>" nos dias de reunião e até 2 eventos por dia (+N); painel: nome, tipo, início, fim, horário, local, as três caixas com o padrão do tipo (`MARCACOES_PADRAO`) editáveis; editar, excluir (confirmação); com `aulasAfetadas`: "Isto afeta N aulas (Amigo 18/10, …). Os instrutores foram avisados." |
| `/adm/cronogramas` e `/cronograma/montar` (Adm) | A7 | `Montar-Cronograma.dc.html` | seletor de classe e ano; sem cronograma: "Criar cronograma" (G5); alternador Regular/Avançada; requisitos com "agendado · dd/mm"/"sem data" e contador real; datas: bloqueadas hachuradas sem "Colocar aqui", campo em verde quando o requisito selecionado é CAMPO, conflito em vermelho, aula dada travada ("Aula dada"); "Colocar aqui" move; "remover"; editar horário/local/título; Agrupadas: "+ Nova aula"; selo Rascunho/Enviado/Publicado; "Publicar" (G3); "Quem monta" **somente leitura**, com link para A5; 409 → faixa com "Atualizar" |
| `/cronograma/montar` (instrutor que monta) | I3b | `Montar-Cronograma-Instrutor.dc.html` | abas Por data / Sem data (N); alternador Regular/Avançada; contador e barra neutra; "+" numa data abre a folha com os requisitos sem data (CAMPO primeiro com "Sugerido para este dia" em data de campo; "Todos os requisitos já têm data" quando vazia); bloqueada sem "+"; conflito em vermelho com "Mover"; aula dada travada; editar horário/local/título; cada ação grava; "Enviar para o Adm publicar" (confirmação, G3) |
| `/adm/configuracoes` | — | padrão do painel | formulário G9; item novo no menu "Configurações do clube" |

Menu lateral: esta fase habilita Visão geral, Classes e especialidades, Calendário do clube,
Cronogramas e Configurações do clube (só `para`; Ranking é da 1b; Relatórios, da Fase 4).

## 5. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Eventos: CRUD; padrão das marcações; acampamento sem "bom para campo" (só cancela a reunião) põe em conflito aula individual futura daquela data; `aulasAfetadas` só as que **entraram** em conflito (editar o mesmo evento 3 vezes gera notificação uma vez); Agrupadas nunca; aula dada ou passada nunca; destinatários certos e links por destinatário; instrutor de outro clube com a mesma classe oficial **não** é notificado | Jest | A1 |
| Montagem: colocar, mover, tirar (individuais esvaziam, Agrupadas não); data fora de `datasDeAula` → 422; acampamento com `bomParaCampo` aceita; Agrupadas em qualquer data; aula dada (registro na mesma classe e data, mesmo sem `aulaPlanejadaId`) travada; RASCUNHO e `atualizadoEm` novo em toda edição, inclusive já em rascunho; enviar/publicar com `atualizadoEmVisto` velho → 409; `POST /cronogramas/:id/aulas` em data com aula ativa → 409; publicar grava o retrato e a leitura da base passa a mostrá-lo; período que exclui aula → 422; isolamento | Jest | A2 |
| A5: ajuste reflete em `GET /classes/:id` (`oficial`, `ajustado`, total); `null` volta; desativar com CURSANDO → 422; especialidade do clube única na área | Jest | A3 |
| Visão geral: cada número de G10 com dados semeados (reunião, chamada, aula, especialidade, entrada e saída de DBV) | Jest | A3 |
| Configurações: G9 (dia com aula futura → 422); conselheiro 403 | Jest | A3 |
| Telas (quatro estados, erros, 409) | Vitest | B1–B3 |
| e2e (pela API e pelo sino, sem depender das telas da Fase 2): Adm cria "Sem reunião" num domingo com aula → o instrutor recebe a notificação e `GET /classes/:id/cronograma` mostra CONFLITO; instrutor liberado monta no celular (I3b) e envia; Adm publica em A7; `GET /classes/:id/cronograma` de outro instrutor da classe passa a trazer o publicado | Playwright | B4 |

## 6. ONDE FICA

- web, rotas: `apps/web/src/rotas.tsx:24-27` (`LayoutDoPapel`: ADM → `LayoutAdm`, senão `LayoutCelular`); `:62-65` (bloco INSTRUTOR+ADM: `rotasNotificacoes` e `rotasCronogramaMontagem`); `:52-56` (bloco só ADM, sob `LayoutAdm`)
- web, /adm/* hoje: só `/adm/desbravadores`, `/adm/unidades`, `/adm/usuarios` (`modulos/adm/{desbravadores,unidades,usuarios}/rotas.tsx`, importadas em `rotas.tsx:5-7`); nenhuma de visão geral, classes, calendário, cronogramas ou configurações
- web, "Em breve": `apps/web/src/modulos/cronograma-montagem/rotas.tsx:4` (única rota, `/cronograma/montar`); `PaginaEmBreve.tsx:3` (o componente, com `EstadoVazio`, renderiza dentro do `LayoutDoPapel`)
- web, menu: `apps/web/src/layouts/LayoutAdm.tsx:12-22` (`ITENS_ADM`, 9 itens); Visão geral, Classes e especialidades, Calendário do clube, Cronogramas e Relatórios sem `para`; `ItemNavegacao.tsx:8,32-34` (sem `para` = `aria-disabled` + "em breve"; com `para` = link); "Configurações do clube" (item novo, `para: '/adm/configuracoes'`) entra entre Cronogramas e Ranking (`LayoutAdm.tsx:19-20`)
- web, API e testes: `apps/web/src/api/leitura.ts:24,34-35` (chave `classes`, `useClasses` com `ClasseSaida`); hook de exemplo `api/notificacoes.ts:9-30` (chaves + `useQuery`/`useMutation` + `requisitar`); handlers MSW em `apps/web/src/testes/handlers/` (`leitura.ts:5,51,63` com `criarClasse`/`handlerClasses`; `notificacoes.ts`), registrados em `testes/servidor.ts:10`; `testes/renderizar.tsx:9` (`renderizarRotas`)
- web, `ui/`: Abas, AreaTexto, Avatar, BarraProgresso, Botao, CaixaMarcacao, Campo, CampoData, Cartao, Chip, Confirmacao, Esqueleto, EstadoVazio, EstadosDeCarga, FaixaAviso, FolhaLateral, MenuCabecalho, Selecao, Selo, Tabela
- API, cronograma: `apps/api/src/cronogramas/servico-cronograma.ts:59` (`ServicoCronograma`); `leitura` 68; `ultimaPublicacao` 103; `instrutoresDaClasse` 116; módulo exporta o serviço (`cronogramas.module.ts:10-11`); controller só tem `GET /classes/:id/cronograma` (`cronogramas.controller.ts:9,14`)
- API, calendário: `apps/api/src/calendario/servico-calendario.ts:8,12` (`ServicoCalendario.situacoes`, só leitura); `calendario.module.ts:5-6` exporta; não há controller: falta todo o CRUD de eventos e `GET /calendario`
- API, avisos: `notificacoes/servico-notificacoes.ts:18` (`notificar(tx, {clubeId, destinos, tipo, titulo, texto})`, dedupe por pessoa, poda a 50); `atividades/servico-atividade.ts:18` (`registrar(tx, ...)`, tipos `AULA_REGISTRADA|CRONOGRAMA_ENVIADO|CRONOGRAMA_PUBLICADO|EVENTO_CRIADO` na linha 5); ambos exportados pelos módulos
- API, classes e especialidades: `classes/classes.controller.ts:14,20` (só `GET /classes` e `GET /classes/:id`, `@Logado`); `especialidades/especialidades.controller.ts:14` (só `GET /especialidades`); módulos sem `exports` (`classes.module.ts:5`, `especialidades.module.ts:5`); `app.module.ts:39-53` já lista Classes, Especialidades, Calendario, Cronogramas, Notificacoes, Atividades; falta módulo de visão geral e de clube/configuração
- API, permissões: `packages/shared/src/permissoes.ts:29,30,33` (`classe.gerenciar`, `calendario.gerenciar`, `clube.configurar`, padrão só ADM); decorator `apps/api/src/comum/decorators/pode.decorator.ts:6` (`@Pode(chave)`, exige vínculo ativo com a permissão); uso de exemplo `desbravadores.controller.ts:23,79`
- shared, fórmulas: `packages/shared/src/formulas/calendario.ts` — `EventoDoCalendario` 9, `datasDoIntervalo` 26, `situacaoDaData` 37, `diasDeReuniao` 48, `datasDeAula` 55, `EntradaEmConflito` 63, `emConflito` 73, `situacaoDaAula` 85; `MARCACOES_PADRAO` fica em `enums.ts:57` (não nas fórmulas), com `TIPOS_EVENTO` em `enums.ts:37`
- shared, contratos que já existem: `contratos/cronograma.ts` (`MontagemSaida` 64, `DataMontagem` 48, `RequisitoMontagem` 61, `CronogramaCriarEntrada` 38, `CronogramaPeriodoEntrada` 41, `ColocarRequisitoEntrada` 77, `EnviarPublicarEntrada` 78, `AulaCriarEntrada` 79, `AulaEditarEntrada` 80); `contratos/calendario.ts` (`EventoEntrada` 6, `EventoSaida` 19, `CalendarioSaida` 25, `AulaAfetada` 29, `EventoGravadoSaida` 31 com `aulasAfetadas`); `contratos/classes.ts` (`ClasseClubeEditarEntrada` 35, `RequisitoAjusteEntrada` 37, `RequisitoSaida.oficial`/`ajustado` 21-26); `contratos/especialidades.ts:18` (`EspecialidadeClubeEntrada`); `contratos/clube.ts` (`ConfiguracaoClubeEntrada` 4, `ConfiguracaoClubeSaida` 12); `contratos/visao-geral.ts` (`AtividadeSaida` 5, `VisaoGeralSaida` 6). Nenhum contrato da §3 falta
- fábricas (`apps/api/test/fabricas.ts`): `criarEvento` 405, `criarCronograma` 432, `publicarCronograma` 472, `criarRegistroAula` 496, `criarRequisitoConcluido` 539, `criarEspecialidadeConcluida` 558, `criarNotificacao` 575; úteis: `criarClube` 68 (já cria `ClasseClube` por classe oficial), `criarAcesso` 198 (instrutor com `classeIds`), `criarVinculo` 108, `criarDbv` 135, `criarMatricula` 165 (aceita `status`), `classeOficial` 161, `criarReuniao` 257 (com `chamada`), `criarUnidade` 102, `criarMembro` 216, `configurarClube` 235
- e2e: `e2e/apoio/semear.ts:12` (só reexporta as fábricas, apontadas ao banco do e2e); `e2e/global-setup.ts:14-60` (banco temporário, `carga`, build, sobe API e web; não semeia usuário nem clube: cada spec cria o seu, ver `fundacao.spec.ts:66-77` via `clube:criar`)
- conferido em `desbravadores@32a0c86`
