# Fase 2 — Instrutor · Spec

**Status:** rascunho para revisão · **Branch:** `feature/fase-2-instrutor`, criada da `main`
**depois do merge da [base 2·3](../fase-2-3/SPEC.md)** · PR própria

Transforma a Fase 2 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas. Precedência,
regras gerais e anexos (schema e contratos): os da [base 2·3](../fase-2-3/SPEC.md), que já estão
na `main` quando esta fase começa. As specs das Fases 0 e 1 valem onde esta não as altera. A regra
de envio offline e de conflito é **a mesma da chamada** (spec da Fase 1 §4.3 e §5.1–5.2) — aqui só
o que muda.

## 1. Entrega

Início do instrutor (I1), Minhas classes (I2), cronograma em leitura (I3), **registro de aula
online e offline** (I4, I5), progresso da classe (I7), especialidades (I8), observações (I9),
materiais (I10), pacote do instrutor, pontos de requisito e especialidade, alerta de faltas,
pedido de liberação do cronograma; e, **só depois do merge da 1b**, o progresso no perfil do DBV
com marcar/desmarcar requisito fora da aula (I6).

**Fora da Fase 2:** montar cronograma (Fase 3 — o botão aponta para a rota reservada pela base);
calendário; notificações novas (a base já dá o sino); vídeo em materiais; requisito ou classe do
clube; relatórios.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| F1 | **Membros de uma aula** = matrículas `CURSANDO` na classe no ano do clube da data, DBV ativo, tipo DBV **ou** LIDER. Progresso lista `CURSANDO`, `CONCLUIDA` e `INVESTIDA` (nunca `DESISTIU`) | O escopo atual do instrutor não olha o status da matrícula |
| F2 | Uma aula registrada por **(classe, data)**, com o id vindo do celular na criação — mesma lógica da reunião (Fase 1 §5.1: dedupe por `envioId` em `EnvioAulaProcessado`, `FOR UPDATE`, corrida → 503 `TEMPORARIO`, data travada na edição, prazo pelo `feitaNoAparelhoEm` com folga de 7 dias). Data: de (hoje − 30 dias) a hoje, qualquer dia da semana | Aula extra e reposição existem; o prazo é o mesmo da chamada |
| F3 | **Presença** por DBV com conflito por `versao` (igual à linha de chamada). **Requisito** é aditivo: marcar um já concluído não muda nada (vale a data mais antiga; vem em `jaConcluidos`); marcar só vale para quem está **presente** nesta aula (senão vai para `ignorados`); desmarcar pela aula só remove conclusão **feita nesta aula** (`registroAulaId` igual) | Duas pessoas marcando não apagam o trabalho uma da outra |
| F4 | Presente→faltou **não apaga** requisitos já concluídos (nem desta aula): só impede marcar novos. Para desfazer uma conclusão errada, desmarca-se explicitamente | BACKLOG I4 |
| F5 | **Pontos** (base B7): requisito concluído → critério `REQUISITO`; especialidade → `ESPECIALIDADE`; desmarcar estorna. LIDER não pontua | Ranking só de DBVs |
| F6 | **Progresso** de uma matrícula = requisitos concluídos (ativos) entre os requisitos **ativos** da classe com o ajuste do clube ÷ total, `percentualClasse` e `Math.round` na saída; média da turma por `mediaTurma` | Fase 0 §7 |
| F7 | **Materiais**: PDF, apresentação (PPT/PPTX/ODP) e documento (DOC/DOCX/ODT) até **20 MB**, ou link `https`. Sem vídeo — vídeo vai como link. Tipo conferido pelos bytes (`%PDF`; ZIP `PK\x03\x04` com extensão `.pptx/.docx/.odp/.odt`; OLE `D0 CF 11 E0` com `.ppt/.doc`). Upload com `multer.diskStorage` para uma pasta temporária (nunca na memória) e depois movido pelo `Armazenamento` para `clube/<clubeId>/materiais/<AAAA>/<arquivoId>.<ext>` | Container de 384 MB; vídeo de 50 MB pediria outro servidor |
| F8 | A rota de arquivos passa a servir o `mime` gravado em `Arquivo` (em vez de fixar JPEG) com `Content-Disposition: inline; filename="<título>.<ext>"`; o nginx ganha `location /api/materiais/arquivo` com `client_max_body_size 21m` | Hoje só serve foto |
| F9 | **Observações**: visíveis ao autor, aos outros instrutores da classe **só** com `observacao.ver_outros`, e ao Adm. Nunca aparecem em rota de conselheiro, perfil, ranking ou pacote. Autor edita e apaga (remoção lógica, texto apagado) | LGPD e BACKLOG I9 |
| F10 | **Pacote do instrutor** (`PacoteSaida.instrutor`, anexo): classes do vínculo, membros (F1) com os requisitos concluídos, requisitos ativos, aulas **publicadas** dos próximos 14 dias e registros dos últimos 30 dias com as versões | Registrar aula sem internet |
| F11 | Registrar aula, marcar especialidade e observar funcionam só **online**, exceto o registro de aula (offline pela fila, tipo `AULA`). Perfil (I6), especialidades e observações sem conexão mostram "Disponível quando houver internet" | Escopo offline decidido na visão |
| F12 | **Alerta de faltas** = DBVs com `presente=false` nas **2 últimas** aulas registradas da classe (classe com menos de 2 aulas não alerta) | BACKLOG I1 |
| F13 | **Pedir liberação** (estado vazio do cronograma, `Estado-Vazio.dc.html`): `POST /classes/:id/pedir-liberacao` notifica cada Adm ativo (`PEDIDO_LIBERAR_CRONOGRAMA`, link `/adm/classes/<id>`); uma vez por classe por 24 h (repetição → 204 sem notificar) | Sem mexer no módulo de pedidos da 1b |
| F14 | O botão **"Montar cronograma"** aparece quando `podeMontar` e leva a `/cronograma/montar?classe=<id>` — rota reservada pela base; até a Fase 3 entrar, abre "Em breve" | Fases 2 e 3 em paralelo sem link quebrado |

## 2.1 Pacote e fila

- `GET /sync/pacote` para INSTRUTOR preenche `instrutor` (F10) — conselheiro e Adm continuam como
  na 1a. `versao` cobre o conteúdo novo (classes por ordem, membros por nome, aulas por data).
- Tipo de fila **`AULA`** em `apps/web/src/offline/tipos/aula.ts` (base B8): chave
  `aula:<classeId>:<data>`; `fundir` junta presenças por `dbvId` (a nova vence) e une/subtrai
  marcações (marcar depois de desmarcar o mesmo par = marcado, e vice-versa); `rotulo` "Aula ·
  <classe> · dd/mm" ou "Correção na aula · …"; `detalhe` "N presentes · N requisitos"; `aoEnviar`
  atualiza versões dos seguintes da chave, invalida `aulas`, `aula`, `progresso`, `inicio-instrutor`,
  `ranking` e baixa o pacote.

## 3. Regras de servidor

### 3.1 `PUT /api/sync/aulas/:uuid` (`@Pode('aula.registrar')`)

Escopo: instrutor só classes do seu vínculo; Adm qualquer. Passos: os da reunião (Fase 1 §5.1) com
`(classeId, data)` no lugar de `(unidadeId, data)`; `aulaPlanejadaId`, se vier, precisa ser de
aula **publicada** da mesma classe na mesma data (senão 422 "Esta aula não está no cronograma
publicado."); presenças por §5.2 da Fase 1 com `PresencaAula`; depois requisitos (F3), com a
presença **já aplicada**; para cada conclusão criada ou removida, `ServicoPontos.sincronizar`;
`ServicoAtividade.registrar(AULA_REGISTRADA, "<instrutor> registrou a aula de <classe>")` só na
criação. Resposta `AulaEnvioSaida`.

Membros que não entram (F1) → `ignorados`. Requisito que não é da classe ou está inativo → 422
"Requisito fora desta classe.".

### 3.2 Progresso e requisitos fora da aula (I6 — depois da 1b)

`GET /classes/:id/progresso` (`@Pode('classe.ver_relatorio')` + escopo) → `ProgressoClasseSaida`.
`GET /desbravadores/:id/progresso` (`@Pode('dbv.ver')` + escopo; conselheiro vê sem `podeMarcar`)
→ `ProgressoDbvSaida`. `PUT/DELETE /desbravadores/:id/requisitos/:requisitoId`
(`@Pode('requisito.marcar')`): instrutor só de requisito de classe do seu vínculo em que o DBV
esteja matriculado no ano; data ≤ hoje; PUT em já concluído → 409 `CONFLITO` "Já concluído em
dd/mm."; DELETE remove qualquer conclusão ativa (com confirmação na tela) e estorna.

### 3.3 Especialidades

`GET /desbravadores/:id/especialidades`, `PUT/DELETE /desbravadores/:id/especialidades/:espId`
(`@Pode('requisito.marcar')`): instrutor para DBVs matriculados nas suas classes no ano; Adm todos;
especialidade oficial ou do clube; PUT em já concluída → 409; desmarcar só quem marcou ou Adm
(`podeDesmarcar`).

### 3.4 Observações e materiais

Rotas do anexo. Observação: `classeId` do vínculo; `registroAulaId`/`dbvId` precisam ser da mesma
classe (senão 404). Material: `classeId` do vínculo; `secaoId` da mesma classe; upload F7/F8;
link só `https`; renomear, mover de seção e apagar = autor ou Adm (apagar remove o arquivo do disco
depois do commit, como a foto).

### 3.5 Início e Minhas classes

`GET /inicio/instrutor` → `InicioInstrutorSaida`: uma entrada por classe do vínculo, individuais
na ordem da classe e depois Agrupadas; `proximaAula` = primeira aula publicada com data ≥ hoje;
`aulaHoje`/`aulaHojeRegistrada`; `aulasDadas` = registros no ano; alerta F12.

### 3.6 Escopo

| Rota | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|
| `PUT /sync/aulas/:uuid`, `GET /classes/:id/aulas`, `GET /aulas/:id` | qualquer classe | 403 | classes do vínculo |
| `GET /classes/:id/progresso` | qualquer | 403 | do vínculo |
| `GET /desbravadores/:id/progresso` | qualquer | DBV das suas unidades (sem `podeMarcar`) | matriculados nas suas classes |
| requisitos e especialidades (marcar) | qualquer | 403 | matriculados nas suas classes |
| observações | todas | 403 | as suas + outras com `observacao.ver_outros` |
| materiais | todos | 403 | classes do vínculo |
| `GET /inicio/instrutor`, `POST /classes/:id/pedir-liberacao` | 403 | 403 | sim |

## 4. Telas

Barra do instrutor: Início · Classes · Cronograma · Ranking (a 1b habilita Ranking; esta fase
habilita Classes e Cronograma). Todas tratam os quatro estados (E21 da Fase 1).

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/inicio` (instrutor) | I1 | `Inicio-Instrutor.dc.html` | por classe: próxima aula (data, hora, título, nº de requisitos e de DBVs); "Registrar aula" em destaque se `aulaHoje` e não registrada; progresso médio; Agrupadas num bloco depois, mais discreto; alerta de faltas com nomes e classe; atalhos Cronograma · Registrar aula · Materiais · Observações · Progresso · Especialidades; selo da fila |
| `/classes` | I2 | `Minhas-Classes.dc.html` | um cartão por classe na cor (`corToken`): tipo e idade, nº de DBVs, progresso médio, próxima aula, aulas dadas; botões Cronograma / Progresso / Materiais **já com a classe**; "As classes são atribuídas pelo Adm do clube." |
| `/cronograma?classe=` | I3 | `Cronograma.dc.html` | chips de classe; linha do tempo DADA / HOJE / PLANEJADA / CONFLITO (vermelho); requisitos com código, texto e CAMPO; aula DADA abre o registro; "Montar cronograma" (F14); sem publicação: vazio "O cronograma ainda não foi publicado." + "Pedir para eu montar" (F13) se a classe está com o Adm |
| `/aulas/nova?classe=&data=`, `/aulas/:id/editar` | I4, I5 | `Registro-Aula.dc.html` | abaixo |
| `/classes/:id/progresso` | I7 | `Progresso-Classe.dc.html` | chips de classe; alternador Regular/Avançada (a avançada ligada à regular); média; "N prontos para investidura" (regular) ou "N concluíram a avançada"; "N abaixo de X%" (limiar do clube); lista por % com "faltam N req." e laranja abaixo do limiar; tocar → perfil |
| `/especialidades?dbv=` | I8 | `Especialidades.dc.html` | seletor de DBV (os das classes do instrutor); busca sem acento; áreas com as especialidades; marcar abre data (padrão hoje); desmarcar com confirmação; "Concluída em dd/mm · marcada por <nome>"; contagem de concluídas |
| `/observacoes?classe=` | I9 | `Observacoes.dc.html` | chips de classe; abas Por aula / Por DBV; formulário: "Sobre uma aula" (lista das aulas registradas, padrão a de hoje) ou "Sobre um DBV" (lista da classe), título opcional, texto; autor e data em cada nota; editar/apagar do autor; selo "Visível só para instrutores e Adm" |
| `/classes/:id/materiais` | I10 | `Materiais.dc.html` | agrupados por seção do caderno, depois "Sem seção"; contagem real; "Enviar arquivo" (F7) e "Adicionar link"; menu do item: abrir (URL assinada ou link), renomear, mover de seção, apagar |
| `/dbv/:id` (seção nova) | I6 | `Perfil-DBV.dc.html` | **só depois da 1b**: anel do % da regular e anel menor da avançada ("recomendada"); "Pronto para investidura" em 100% da regular; seções com barras (verde em 100%, cinza abaixo); tocar numa seção abre os requisitos com a data, e o instrutor da classe marca (data) ou desmarca (confirmação) |

**Registro de aula** — mesma mecânica da chamada (Fase 1 §6): fonte = servidor ou
`registrosRecentes` do pacote, com a fila e o rascunho por cima; nova com **todos** marcados
presente/faltou antes de salvar; edição com data travada e só o que foi tocado.
- Abre com os requisitos da aula publicada da data (se houver); "+ Requisito" acrescenta qualquer
  requisito ativo da classe (reposição).
- Grade DBV × requisito. Tocar no nome alterna presente/faltou; requisito só marcável para
  presente (F3); já concluído antes aparece feito e travado, com a data.
- "O que falta fazer": por requisito, os presentes que ainda não cumpriram, ou "Todos concluíram".
- Pontos provisórios pelo `pontosRequisito` do pacote (só DBV tipo DBV).
- "Salvar aula" enfileira `AULA` e volta ao Início com "Aula salva" e o estado do envio; depois do
  envio, avisos de `conflitos`, `ignorados` e `jaConcluidos` com os nomes.

## 5. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Aula: cria; dedupe por `envioId`; conflito de presença por versão; requisito só para presente; já concluído → `jaConcluidos` sem mudar a data; desmarcar só o desta aula; faltou não apaga; `aulaPlanejadaId` fora do publicado → 422; prazo; corrida → 503; pontos só DBV; LIDER entra na aula e não pontua; isolamento | Jest | F2-A1 |
| Pacote do instrutor: classes do vínculo, membros F1, aulas publicadas de 14 dias, registros de 30 dias; conselheiro inalterado | Jest | F2-A1 |
| Início e alerta de faltas (2 últimas; menos de 2 aulas não alerta) | Jest | F2-A2 |
| Progresso da classe e do DBV: ajuste do clube conta, `DESISTIU` fora, média arredondada no fim, prontos e avançada | Jest | F2-A2 |
| Especialidades: marcar/desmarcar, 409, só quem marcou desmarca, pontos e estorno | Jest | F2-A2 |
| Observações: autor, `ver_outros`, Adm, **nunca** em rota de conselheiro/perfil/pacote (teste que varre essas respostas procurando o texto) | Jest | F2-A3 |
| Materiais: tipos pelos bytes (PDF real aceito; `.pdf` que é PNG recusado), 20 MB, link não https recusado, arquivo servido com o mime certo, apagar remove do disco | Jest | F2-A3 |
| Telas (quatro estados, erros) e o tipo `AULA` da fila (fundir) | Vitest | F2-B1…B3 |
| e2e: instrutor registra aula **sem rede** com 2 requisitos, reabre com rede, o progresso sobe e o ranking soma | Playwright | F2-B4 |

## 6. ONDE FICA

O da [base 2·3](../fase-2-3/SPEC.md#onde-fica), mais o que a base criou — o orquestrador desta fase
**atualiza este bloco** na onda 0 (investigador) com `arquivo:linha` de `ServicoCronograma`,
`ServicoCalendario`, `ServicoNotificacoes`, `ServicoAtividade`, fórmulas de calendário e o glob de
tipos da fila.
