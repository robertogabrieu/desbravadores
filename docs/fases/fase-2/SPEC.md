# Fase 2 — Instrutor · Spec

**Status:** revisada em duas rodadas · **Branch:** `feature/fase-2-instrutor`, criada da `main` **com a 1b e a
[base 2·3](../fase-2-3/SPEC.md) mescladas** · PR própria · pode rodar junto com a Fase 3

Precedência, regras gerais e anexos (schema e contratos): os da [base 2·3](../fase-2-3/SPEC.md).
As specs das Fases 0 e 1 valem onde esta não as altera. O algoritmo de envio offline e de conflito
por versão é **o mesmo da chamada** (Fase 1 §4.3, §5.1–5.2) e o código da 1b é a referência de
padrão (ONDE FICA) — reimplementado para aula, não compartilhado (duplicação aceita e declarada).

## 1. Entrega

Início do instrutor (I1), Minhas classes (I2), cronograma em leitura (I3), **registro de aula
online e offline** (I4, I5), progresso da classe (I7), especialidades (I8), observações (I9),
materiais (I10), progresso no perfil com marcar/desmarcar requisito fora da aula (I6), pacote do
instrutor, pontos de requisito e especialidade, alerta de faltas, pedido de liberação.

**Fora da Fase 2:** montar cronograma (Fase 3); calendário; vídeo; requisito ou classe do clube;
relatórios; telas do instrutor para o Adm (o Adm usa só a API destas rotas por ora).

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| F1 | **Membros de uma aula** = matrículas `CURSANDO` na classe no ano do clube da data, DBV ativo, tipo DBV **ou** LIDER. Progresso lista `CURSANDO`, `CONCLUIDA` e `INVESTIDA`. Limite declarado: a matrícula não tem datas, então um DBV que trocou de classe há duas semanas não entra em aula retroativa da classe antiga | Base B11 |
| F2 | Uma aula por **(clube, classe, data)**; o id vem do celular na criação. Mesmo algoritmo da reunião: dedupe por `envioId` (`EnvioAulaProcessado`), `FOR UPDATE`, corrida → 503 `TEMPORARIO`, data travada na edição, prazo pelo `feitaNoAparelhoEm` (instrutor: 30 dias; Adm sem prazo) com folga de 7 dias, criação exige `feito ≥ agora − 7 dias`. Data: de (hoje − 30 dias) a hoje, qualquer dia | Aula extra e reposição existem |
| F3 | **Presença** com conflito por `versao` (como a linha de chamada; a última gravação vale). **Requisito** aditivo e validado contra a presença **do próprio envio** (quem o envio diz que faltou → `AUSENTE` sem efeito); já concluído → sem efeito, **salvo** se a data desta aula for mais antiga: aí a conclusão **muda** para esta aula e data (os pontos continuam com o valor e a data de quando foram lançados). Requisito que não é da classe ou ficou inativo → `REQUISITO_INVALIDO` sem efeito. **Nada disso recusa o envio**: vai em `requisitosSemEfeito` | Um domingo inteiro não se perde por um item |
| F4 | Presente→faltou (edição ou conflito) **não apaga** conclusões. Desmarcar pela aula só remove conclusão **desta** aula | BACKLOG I4 |
| F5 | `aulaPlanejadaId` que não está na **última publicação** da classe na mesma data (ou vem de quem vê o vivo) vira `null`, com aviso "Esta aula foi registrada fora do cronograma publicado." em `avisos`. Isso não muda nada na leitura: a aula planejada da data aparece como DADA porque "tem registro" é por (classe, data) — base B6 | Instrutor liberado vê o vivo |
| F6 | **Pontos** (base B7): LIDER não pontua; critério inativo não lança | Ranking só de DBVs |
| F7 | **Progresso** = conclusões ativas dos requisitos ativos (com ajuste) ÷ total, `percentualClasse` e `Math.round` na saída; média por `mediaTurma` | Fase 0 §7 |
| F8 | **Desmarcar** (requisito ou especialidade): qualquer instrutor da classe em que o DBV está matriculado no ano, ou Adm. Marcar: idem. `concluidoEm` entre o início do ano do clube corrente e hoje | Regra única; não prende a conclusão a quem saiu |
| F9 | **Materiais**: PDF, PPTX, ODP, DOCX, ODT até **20 MB**, ou link `https`. Conferência do conteúdo: PDF começa com `%PDF-`; PPTX/DOCX são ZIP (`PK\x03\x04`) cujo diretório tem entrada que começa com `ppt/` ou `word/`; ODP/ODT são ZIP com a entrada `mimetype` contendo o mime ODF correspondente. A extensão do nome precisa bater com o conteúdo; o `mime` gravado vem de `FORMATOS_MATERIAL`. Formatos antigos (.doc, .ppt) **não** entram. Upload `multer.diskStorage` para pasta temporária, `unlink` em `finally`, e `Armazenamento.gravarDeArquivo` (base §7). 413 do multer → 422 "O arquivo precisa ter até 20 MB." por filtro no controller. **Cota**: 1 GB de materiais ativos por clube → 422 "O espaço de materiais do clube acabou." Material apagado: arquivo removido do disco depois do commit + limpeza na subida da API (como a foto) | Container de 384 MB; ZIP renomeado não passa |
| F10 | **Observações**: autor vê e edita; outros instrutores da classe veem **só** com `observacao.ver_outros`; Adm vê e apaga (não edita). Apagar põe `titulo` nulo, `texto` como string vazia e marca `removidaEm`. Nunca em rota de conselheiro, perfil, ranking, pacote, atividade ou log | LGPD |
| F11 | **Pacote do instrutor** (`PacoteSaida.instrutor`): classes do vínculo, membros (F1) com os requisitos concluídos, requisitos ativos, aulas da **última publicação** nos próximos 14 dias, registros dos últimos 30 dias com as versões, `pontosRequisito` | Aula sem internet |
| F12 | Offline só o registro de aula (tipo `AULA`). Perfil, especialidades, observações e materiais sem conexão: "Disponível quando houver internet" | VISAO |
| F13 | **Alerta de faltas** = DBVs com `presente=false` nas 2 últimas aulas registradas da classe (menos de 2 aulas → sem alerta). Texto: "N desbravadores faltaram às duas últimas aulas de <classe>: <nomes>." | BACKLOG I1 |
| F14 | **Pedir liberação** (`POST /classes/:id/pedir-liberacao`, só se `quemMonta=ADM`): notifica os Adms ativos (`PEDIDO_LIBERAR_CRONOGRAMA`, link B9); repetição em 24 h → 204 sem notificar (consulta `Notificacao` do tipo com esse link nas últimas 24 h) | Sem mexer no módulo de pedidos da 1b |
| F15 | "Montar cronograma" aparece quando `podeMontar` e leva à rota reservada pela base; até a Fase 3 entrar, abre "Em breve" | Paralelo com a Fase 3 |
| F16 | **Início por papel**: `/inicio` passa a escolher a tela pelo papel ativo (conselheiro → a da 1b; instrutor → `modulos/inicio-instrutor`). Feito pelo principal na onda 0 em `rotas.tsx` | Duas fases no mesmo endereço |
| F17 | Título do cabeçalho: "Instrutora" se `genero = F`, senão "Instrutor" | Design mostra o feminino |

## 3. Pacote e fila

- `GET /sync/pacote` para INSTRUTOR preenche `instrutor` (F11); conselheiro e Adm inalterados.
  `versao` cobre o conteúdo novo com ordem estável (classes por `ordem`, membros e requisitos por
  nome/código, aulas por data).
- Tipo **`AULA`** em `apps/web/src/offline/tipos/aula.ts` (payload declarado **nesse** arquivo, não
  em `offline/tipos.ts`), importado por uma linha nova em `offline/tipos/todos.ts`. Chave
  `aula:<classeId>:<data>`; `fundir` junta presenças por `dbvId` (a nova vence) e marcações por par
  (a última ação vence: marcar depois de desmarcar = marcado); `rotulo` "Aula · <classe> · dd/mm" /
  "Correção na aula · …"; `detalhe` "N presentes · N requisitos"; `aoEnviar` rebaseia versões,
  invalida `aulas`, `aula`, `progresso`, `inicio-instrutor`, `ranking` e baixa o pacote.

## 4. Regras de servidor

### 4.1 `PUT /api/sync/aulas/:uuid` (`@Pode('aula.registrar')`)

Instrutor: classes do vínculo; Adm: qualquer. Ordem: dedupe por `envioId` → acha/cria o
`RegistroAula` por `(clubeId, classeId, data)` (F2) → `FOR UPDATE` → prazo → presenças (§5.2 da
Fase 1, com `PresencaAula`) → `aulaPlanejadaId` (F5) → requisitos (F3) → pontos (F6) →
`EnvioAulaProcessado` → `ServicoAtividade.registrar(AULA_REGISTRADA, "<instrutor> registrou a aula
de <classe>")` só na criação → `AulaEnvioSaida`. Membros fora de F1 → `ignorados`.

### 4.2 Progresso e requisitos fora da aula

`GET /classes/:id/progresso` (`@Pode('classe.ver_relatorio')`); `GET /desbravadores/:id/progresso`
(`@Pode('dbv.ver')`; conselheiro recebe sem `podeMarcar`); `PUT/DELETE
/desbravadores/:id/requisitos/:requisitoId` (`@Pode('requisito.marcar')`, F8). PUT em já concluído
→ 409 `CONFLITO` "Já concluído em dd/mm."; DELETE remove a conclusão ativa (qualquer origem) e
estorna.

### 4.3 Especialidades

`GET /desbravadores/:id/especialidades` e `PUT/DELETE /desbravadores/:id/especialidades/:espId`
num **controller separado**, `apps/api/src/especialidades/especialidades-dbv.controller.ts`
(a Fase 3 cria o dela). Regras F8; PUT em já concluída → 409.

### 4.4 Observações e materiais

Rotas do anexo. Observação: classe do vínculo; `registroAulaId`/`dbvId` da mesma classe (senão
404). Material: classe do vínculo; seção da mesma classe; F9; renomear e mover = autor ou Adm;
apagar = autor ou Adm.

### 4.5 Início

`GET /inicio/instrutor`: por classe do vínculo (individuais pela `ordem`, depois Agrupadas):
`proximaAula` = primeira aula da **última publicação** com data ≥ hoje; `aulaHoje`/`aulaHojeRegistrada`;
`aulasDadas` = registros no ano; alerta F13.

### 4.6 Escopo e respostas de erro

| Rota | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|
| `PUT /sync/aulas/:uuid`, `GET /classes/:id/aulas`, `GET /aulas/:id` | qualquer | 403 | do vínculo; outra classe 404 |
| `GET /classes/:id/progresso` | qualquer | 403 | do vínculo |
| `GET /desbravadores/:id/progresso` | qualquer | DBV das suas unidades | matriculados (F1) |
| marcar/desmarcar requisito e especialidade | qualquer | 403 | F8 |
| observações | todas (apaga, não edita) | 403 | F10 |
| materiais | todos | 403 | do vínculo |
| `GET /inicio/instrutor`, `POST /classes/:id/pedir-liberacao` | 403 | 403 | sim |

## 5. Telas (só INSTRUTOR; quatro estados de E21 da Fase 1)

Barra: Início · Classes · Cronograma · Ranking (esta fase habilita Classes e Cronograma — só `para`).

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/inicio` (instrutor) | I1 | `Inicio-Instrutor.dc.html` | por classe: próxima aula (data, hora, título, nº de requisitos e de DBVs) ou "Nenhuma aula publicada ainda"; "Registrar aula" em destaque se `aulaHoje` e não registrada; progresso médio (ou "—" sem matriculados); Agrupadas em bloco depois, mais discreto; alerta F13; atalhos Cronograma · Registrar aula · Materiais · Observações · Progresso · Especialidades; selo da fila; sino (base). Sem classe: "Você ainda não tem classes. O Adm do clube as atribui." |
| `/classes` | I2 | `Minhas-Classes.dc.html` | cartão por classe na cor (`corToken`): tipo e idade, nº de DBVs, progresso médio, próxima aula, aulas dadas; botões Cronograma / Progresso / Materiais com a classe; rodapé "As classes são atribuídas pelo Adm do clube." |
| `/cronograma?classe=` | I3 | `Cronograma.dc.html` | chips de classe; linha do tempo com DADA, HOJE, PLANEJADA, NAO_REGISTRADA ("Sem registro"), CONFLITO (vermelho) e EXTRA ("Aula extra"); requisitos com código, texto, CAMPO; DADA abre o registro; NAO_REGISTRADA/HOJE abrem "Registrar"; "Montar cronograma" (F15); sem publicação: "O cronograma ainda não foi publicado." + "Pedir para eu montar" (F14) se `quemMonta=ADM`; `classe` inválida → 404 amigável |
| `/aulas/nova?classe=&data=`, `/aulas/:id/editar` | I4, I5 | `Registro-Aula.dc.html` | abaixo |
| `/classes/:id/progresso` | I7 | `Progresso-Classe.dc.html` | chips; alternador Regular/Avançada; média; prontos (regular) ou "concluíram a avançada"; "N abaixo de X%"; lista por %, "faltam N req.", laranja abaixo do limiar; tocar → perfil; sem matriculados: "Nenhum desbravador cursando esta classe." |
| `/especialidades?classe=&dbv=` | I8 | `Especialidades.dc.html` | chips de classe e lista de DBVs com busca; sem DBV escolhido: "Escolha um desbravador"; `dbv` fora do escopo → 404 amigável; áreas com especialidades, busca sem acento; marcar abre data (F8); desmarcar com confirmação; "Concluída em dd/mm · marcada por <nome>" |
| `/observacoes?classe=` | I9 | `Observacoes.dc.html` | chips; abas Por aula / Por DBV; formulário ("Sobre uma aula" — aulas registradas, padrão a de hoje; "Sobre um DBV" — lista da classe; título opcional; `AreaTexto`); autor e data; editar (autor), apagar (autor); selo "Visível só para instrutores e Adm" |
| `/classes/:id/materiais` | I10 | `Materiais.dc.html` | por seção do caderno e "Sem seção"; contagem; "Enviar arquivo" (F9, com a lista de formatos) e "Adicionar link"; menu: abrir, renomear, mover de seção, apagar |
| `/dbv/:id` (seção nova) | I6 | `Perfil-DBV.dc.html` | anel do % da regular e anel menor da avançada ("recomendada"); "Pronto para investidura" em 100% da regular; seções (verde em 100%, cinza abaixo); tocar numa seção abre os requisitos com a data; o instrutor marca (`CampoData`) ou desmarca (confirmação) |

**Registro de aula** — mesma mecânica da chamada (Fase 1 §6): fonte = servidor ou
`registrosRecentes`, com a fila e o rascunho por cima; nova com **todos** marcados antes de salvar;
edição com data travada e só o tocado.
- Abre com os requisitos da aula publicada da data (se houver); "+ Requisito" acrescenta qualquer
  requisito ativo da classe.
- Grade DBV × requisito; tocar no nome alterna presente/faltou; requisito só marcável para
  presente; concluído antes aparece feito e travado, com a data.
- "O que falta fazer": por requisito, os presentes que não cumpriram, ou "Todos concluíram".
- Pontos provisórios por `pontosRequisito` (só DBV tipo DBV).
- "Salvar aula" enfileira `AULA` e volta ao Início com "Aula salva"; depois do envio, avisos de
  `conflitos`, `ignorados`, `requisitosSemEfeito` (por motivo) e `avisos`, com os nomes.

## 6. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Aula: cria; dedupe; mesma classe oficial em dois clubes na mesma data não colide; conflito de presença; requisito validado pela presença do envio; já concluído sem efeito; data mais antiga move a conclusão; requisito inválido e aula fora do publicado não recusam (vêm em `requisitosSemEfeito`/`avisos`); desmarcar só o desta aula; faltou não apaga; prazo; corrida → 503; LIDER entra e não pontua; critério inativo não lança; isolamento | Jest | A1 |
| Pacote do instrutor (F11); conselheiro inalterado | Jest | A1 |
| Início e alerta F13 | Jest | A2 |
| Progresso: ajuste do clube, `DESISTIU` fora, arredondamento, prontos e avançada | Jest | A2 |
| Marcar/desmarcar requisito e especialidade por outro instrutor da classe (F8); 409; data fora do ano → 422; pontos e estorno | Jest | A2 |
| Observações: autor, `ver_outros`, Adm apaga e não edita; o texto de uma observação **não** aparece nas respostas de `/desbravadores/*`, `/desbravadores/:id/perfil`, `/desbravadores/:id/progresso`, `/ranking`, `/sync/pacote`, `/unidades/*`, `/inicio/*` (teste que busca a string) | Jest | A3 |
| Materiais: PDF real (buffer `%PDF-1.4…`) aceito; PNG com extensão `.pdf` recusado; ZIP com `word/document.xml` e extensão `.docx` aceito; ZIP qualquer com `.docx` recusado; ODT com `mimetype` certo aceito; 20 MB → 422; cota → 422; link http recusado; temporário apagado depois de erro; apagar remove do disco | Jest | A3 |
| Telas (quatro estados, erros) e `fundir` do tipo `AULA` | Vitest | B1–B3 |
| e2e: instrutor registra aula **sem rede** com 2 requisitos, reabre com rede, o progresso sobe; os pontos conferidos pela API (`GET /ranking`), sem depender da tela de ranking | Playwright | B4 |

## 7. ONDE FICA (`main@32a0c86` — acrescenta ao da [base](../fase-2-3/SPEC.md#onde-fica); o que a base já lista continua valendo)

- fila (tipo novo `AULA` entra aqui): `apps/web/src/offline/tipos/todos.ts:3-4` (um `import` por tipo; falta `./aula`); modelo `offline/tipos/reuniao.ts` — payload `:8-12`, chave só no `enfileirar` de `api/reunioes.ts:93` (REUNIAO = `unidade:data`), `rotulo :21`, `detalhe :24`, `fundir :28`, `enviar :39`, `aoEnviar :71` (invalida raízes `:14`, `baixarPacote`), `registrarTipo :78`; contrato do tipo `offline/tipos.ts:77-87`, `EntradaFila :89`, `PayloadReuniao :157`
- rotas: `apps/web/src/rotas.tsx:24-27` (`LayoutDoPapel`: ADM vira `LayoutAdm`, o resto `LayoutCelular`); `:31-65` bloco de rotas; `/inicio` vem de `rotasInicio` em `:41` (`modulos/inicio/rotas.tsx:4`); INSTRUTOR/ADM (`/notificacoes`, `/cronograma/montar`) em `:61-64`; 404 `PaginaNaoEncontrada` em `:65`; bloco CONSELHEIRO-only em `:44-46` (rotas do instrutor novas entram num bloco `papeis={['INSTRUTOR']}` dentro de `LayoutCelular`, ao lado de `:44-46`)
- barra: `apps/web/src/layouts/LayoutCelular.tsx:15-19` (`ITENS_POR_PAPEL`; INSTRUTOR tem Início, Classes, Cronograma, Ranking); Classes e Cronograma estão sem `para` (`:17`) = desabilitados "em breve" (`layouts/ItemNavegacao.tsx:8-9,32-34`); habilitar = dar `para`; sino só para INSTRUTOR `:34`; selo da fila `:33` (`SeloAguardandoEnvio`)
- `PUT /sync/reunioes/:uuid` (padrão): controller `apps/api/src/reunioes/reunioes.controller.ts:19-29` (`@Pode('reuniao.registrar')`, uuid `:12`, corpo por zod); service `reunioes-envio.service.ts:56` (`enviar`) — transação `:60`, corrida vira `TEMPORARIO` `:64`, dedupe por `envioId` `:71,79,92,97-100`, `FOR UPDATE` `:78`, prazo `:83,172-180`, presenças com `versaoVista` × versão gravada `:246`, grava `versao` `:264,282`; teste-modelo `reunioes.spec.ts:39`
- serviços da API: `cronogramas/servico-cronograma.ts:67` `leitura(sessao, classeId, anoClube?)`, `:103` `ultimaPublicacao(clubeId, cronogramaId)`, `:116` `instrutoresDaClasse(clubeId, classeId): {usuarioId,nome}[]` (módulo exporta `cronogramas.module.ts:11`); `calendario/servico-calendario.ts:12` `situacoes(clubeId, inicio, fim): Map<string, SituacaoDeData>` (exportado `calendario.module.ts:6`); `notificacoes/servico-notificacoes.ts:18` `notificar(tx, EntradaNotificar :7)`; `atividades/servico-atividade.ts:18` `registrar(tx, EntradaAtividade :7)`; `pontos/servico-pontos.ts:28` `sincronizar(tx, EntradaSincronizar :11)`; `arquivos/armazenamento.ts:12` `gravarDeArquivo(caminho, origemTemporaria)` (impl `:34`); `arquivos/servico-arquivos.ts:27` `urlAssinada(clubeId, arquivoId, variante, agora?)` (variantes só `original|miniatura` `:5`), `:16` `caminhoDoMaterial(clubeId, arquivoId, ext, ano?)`; `arquivos.module.ts:13` exporta `ARMAZENAMENTO` e `ServicoArquivos`
- pacote: `apps/api/src/sync/sync.service.ts:34-46` (`pacote`; unidades só de CONSELHEIRO `:46`), `:48` monta `conteudo`, `:68` `instrutor: null` (é aqui que o pacote do instrutor entra); contrato `packages/shared/src/contratos/sync.ts:17` `PacoteInstrutor` (já existe: classes, membros com `concluidos`, requisitos, `aulasProximas`), `:61` campo `instrutor`
- fábricas: `apps/api/test/fabricas.ts` — `criarEvento :405`, `anoCorrente :427`, `criarCronograma :432`, `publicarCronograma :472`, `criarRegistroAula :496`, `criarRequisitoConcluido :539`, `criarEspecialidadeConcluida :558`, `criarNotificacao :575`; antigas: `criarClube :68`, `criarUsuario :78`, `criarUnidade :102`, `criarVinculo :108`, `criarDbv :135`, `classeOficial :161`, `criarMatricula :165`, `criarSessao :184`, `criarAcesso :198`, `criarMembro :216`, `configurarClube :235`, `criarReuniao :257`, `criarLancamento :309`, `criarArquivo :335`, `criarAlbum :357`, `criarFoto :378`; estilo: `async function criarX(dados: {...objeto nomeado, opcionais com ?}): Promise<ModeloPrisma>`; relógio `test/relogio.ts:2` `congelarRelogio`
- e2e: `e2e/apoio/semear.ts:12` só reexporta `apps/api/test/fabricas` apontando `DATABASE_URL` para o banco do e2e (`:9-10`); modelo de login/semeadura `e2e/domingo.spec.ts` — cria clube por `dist/scripts/clube-criar.js` `:23-31`, senha do convite `:13-18` (`definirSenhaDoConvite`, `caminhoDoConvite` de `e2e/mailpit.ts`), `test.use({ baseURL })` `:10`
- perfil do DBV (1b): tela `apps/web/src/modulos/perfil/PerfilDbv.tsx` — `Conteudo` `:27-83` (seções em `<section>`: cabeçalho `:29`, números `:43`, "Classes concluídas" `:53`, "Contato do responsável" `:73`; seção nova entra entre `:53` e `:73`), `PerfilDbv` `:85`; rota `modulos/perfil/rotas.tsx:4` (`/dbv/:id`); hook `api/perfil.ts:12` `usePerfilDbv`; API `apps/api/src/desbravadores/perfil.controller.ts:12-13` (`GET desbravadores/:id/perfil`, `@Pode('dbv.ver')`), `perfil.service.ts`
- início: `apps/web/src/modulos/inicio/Inicio.tsx:36` (`Inicio`: CONSELHEIRO → `InicioConselheiro` `InicioConselheiro.tsx:245`, senão `InicioProvisorio` `Inicio.tsx:9` "Em construção" — é o que o instrutor vê hoje e o que a Fase 2 troca); rota `modulos/inicio/rotas.tsx:4`; API `apps/api/src/inicio/inicio.controller.ts:14` (`GET inicio/conselheiro`; falta `inicio/instrutor`)
- api web: leitura `apps/web/src/api/reunioes.ts:20` (`chavesReunioes`), `:33` `useReunioes`, `:41` `useReuniao`; mutação que enfileira `:70` `useSalvarChamada` (`networkMode: 'always'` `:75`, `enfileirar` `:93`, toast e navegação `:97-103`); `api/leitura.ts:23` `chavesLeitura`, `:32` `useClasses`, `:66` `useMembrosUnidade`; `api/inicio.ts:9,13`; MSW: `testes/servidor.ts:12` (`setupServer` com handlers base), cada teste acrescenta `servidor.use(...)` (ex. `modulos/inicio/inicio.test.tsx:64`); handlers-modelo `testes/handlers/reunioes.ts:65` `handlerReunioes`, `:73`, `:77` erro; fábrica `:10`; pacote mock `testes/handlers/offline.ts`
- módulos API: `apps/api/src/app.module.ts:27-52` (`imports`, um módulo por linha; imports `:2-25`; último `AtividadesModule :51`); NÃO existem `apps/api/src/{aulas,progresso,observacoes,materiais,instrutor}`; `especialidades/` existe (controller, module, service, spec)
- shared: contratos em `packages/shared/src/contratos/` — `aulas.ts` (`PresencaEnvio :6`, `MarcaRequisito :7`, `AulaEnvio :9`, `AulaEnvioSaida :20`, `AulaResumo :36`, `AulaDetalhe :39`, `AulasFiltro :50`), `progresso.ts` (`ProgressoClasseFiltro :7`, `ProgressoClasseSaida :8`, `RequisitoDoDbv :21`, `ProgressoDbvSaida :26`, `MarcarConclusaoEntrada :40`), `instrutor.ts` (`ClasseDoInstrutor :6`, `InicioInstrutorSaida :15`), `observacoes.ts` (`ObservacaoEntrada :5`, `Filtro :18`, `Saida :19`), `materiais.ts` (`MaterialLinkEntrada :5`, `ArquivoDados :10`, `Saida :12`), `cronograma.ts`, `calendario.ts`, `notificacoes.ts`; `enums.ts:41` `ALVOS_OBSERVACAO`, `:45` `FORMATOS_MATERIAL` (pdf, pptx, odp, docx, odt), `:52` `TipoMaterial`, `:53` `TIPOS_NOTIFICACAO`; `permissoes.ts:21` `aula.registrar`, `:22` `requisito.marcar`, `:23` `material.enviar`, `:24` `classe.ver_relatorio`, `:25` `observacao.ver_outros`; fórmulas `formulas/progresso.ts:1` `percentualClasse`, `:6` `mediaTurma`; `formulas/calendario.ts:73` `emConflito`, `:85` `situacaoDaAula`; tudo reexportado em `index.ts:1-33`
- testes filtrados: API `npm run teste -w api -- <padrão do arquivo> --maxWorkers=1` (jest, `apps/api/jest.config.cjs`, `maxWorkers: 2` `:10`; `test/global-setup.ts:10-30` cria um banco temporário e roda `src/scripts/carga.ts` a cada execução, precisa de `DATABASE_URL` e `DATABASE_URL_ADMIN`); web `npm run teste -w web -- <arquivo>` (vitest run, `apps/web/vite.config.ts:56-57`: setup `src/testes/setup.ts`, `src/**/*.test.{ts,tsx}`); shared `npm run teste -w packages/shared -- <arquivo>`; e2e `npm run teste:e2e` (raiz)
- conferido em `desbravadores@32a0c86`
