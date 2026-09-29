# Fase 3 — Adm · Spec

**Status:** rascunho para revisão · **Branch:** `feature/fase-3-adm`, criada da `main` **depois do
merge da [base 2·3](../fase-2-3/SPEC.md)** · PR própria

Transforma a Fase 3 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas. Precedência,
regras gerais e anexos: os da [base 2·3](../fase-2-3/SPEC.md). As specs das Fases 0 e 1 valem
onde esta não as altera.

## 1. Entrega

Visão geral (A0), classes e especialidades do clube (A5), **calendário do clube** (A6), **montar
cronograma** no computador (A7) e no celular pelo instrutor liberado (I3b), enviar e publicar,
**avisos de conflito** e demais notificações (A8), configurações do clube.

**Fora da Fase 3:** as telas de cadastro A1–A3 continuam as da Fase 0 (já completas); classe e
requisito criados pelo clube (só ajuste dos oficiais); importar calendário da Associação;
notificação por e-mail ou push; relatórios (Fase 4).

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| G1 | Montagem conforme a base (B2, B3, B5): individuais só em **dias de reunião** que não bloqueiam aula; Agrupadas em qualquer data, com aviso se houver evento | Base 2·3 |
| G2 | **Colocar requisito** (`PUT /cronogramas/:id/requisitos/:rid {data}`): se já está em outra data, **move**; cria a aula da data se não existir (só individuais — Agrupadas precisam da aula criada antes por `POST /cronogramas/:id/aulas`); data bloqueada (individuais) → 422 "Não há aula de classe nesta data."; data fora do período ou que não é dia de reunião (individuais) → 422. Aula que fica sem requisito é removida (`removidaEm`) — exceto em Agrupadas, onde só sai por remoção explícita | Um requisito numa data só (índice do schema) |
| G3 | Toda edição no vivo põe `RASCUNHO` (B2); **Enviar** só pelo instrutor liberado, e só com `RASCUNHO` (senão 422); **Publicar** só pelo Adm, de `RASCUNHO` ou `ENVIADO`, grava `CronogramaPublicacao` com o retrato do anexo (`{ aulas: [{ id, data, horario, local, titulo, requisitoIds }] }`) e põe `PUBLICADO` | Base B2 |
| G4 | **Cronograma novo**: período padrão = o ano do clube (`inicioAnoClube` até a véspera do próximo); editável (`PATCH` com período) desde que nenhuma aula fique fora (senão 422 listando as datas) | Evita requisito perdido fora do período |
| G5 | **Evento** criado, editado ou removido: a resposta traz as `aulasAfetadas` (aulas com requisito, vivas ou publicadas, cuja data passou a bloquear aula) e cada uma gera `CONFLITO_CRONOGRAMA` para os instrutores da classe e, se `quemMonta=ADM`, para os Adms ativos — link `/cronograma/montar?classe=<id>`. Remover um evento que causava conflito não notifica | A8 |
| G6 | Notificações da fase: `CRONOGRAMA_ENVIADO` (para os Adms, link `/cronograma/montar?classe=`), `CRONOGRAMA_PUBLICADO` (para os instrutores da classe, link `/cronograma?classe=`), `CONFLITO_CRONOGRAMA` (G5). `PEDIDO_LIBERAR_CRONOGRAMA` é criada pela Fase 2; aqui o link leva a A5 | Base B9 |
| G7 | **Visão geral** lê as tabelas diretamente (reuniões e chamadas da 1a/1b, aulas e conclusões da Fase 2), sem depender de código dessas fases; frequência pelas regras E13 da Fase 1; atividade = últimas 10 `Atividade` | Paralelo com 1b e Fase 2 |
| G8 | **A5**: por classe oficial, `ClasseClube` (ativa; quem monta) e, por requisito, `RequisitoAjuste` (ativo e CAMPO, com "voltar ao oficial" = `null`); especialidade do clube = `Especialidade` com `clubeId` e `origem=CLUBE` (nome único na área). Desativar classe com matrículas CURSANDO → 422 "Há desbravadores cursando esta classe." | Fase 0 D12 |
| G9 | Configurações do clube: dia e hora da reunião, local padrão, limiares e meta. `fuso` e `inicioAnoClube` **não** são editáveis nesta fase (mudar o ano do clube reordenaria matrículas e cronogramas) | Seguro por padrão |
| G10 | Montagem só **online** (B3); o instrutor liberado monta **no celular** (I3b); o Adm, no computador (A7). Ambas as telas usam o mesmo `MontagemSaida` | Uma API, duas telas |

## 3. API

Todas `@Pode(...)`/`@Logado` conforme o escopo abaixo; contratos no anexo da base.

| Rota | Quem |
|---|---|
| `GET /calendario?ano` | `@Logado` (todos do clube — o conselheiro vê o calendário do clube na Fase 4; aqui, leitura liberada) |
| `POST /calendario/eventos`, `PATCH /calendario/eventos/:id`, `DELETE /calendario/eventos/:id` | `calendario.gerenciar` (Adm) |
| `GET /classes/:id/cronograma/montagem`, `POST /cronogramas`, `PATCH /cronogramas/:id`, `PUT/DELETE /cronogramas/:id/requisitos/:rid`, `POST /cronogramas/:id/aulas`, `PATCH /aulas-planejadas/:id` | quem monta (B3) |
| `POST /cronogramas/:id/enviar` | instrutor liberado da classe |
| `POST /cronogramas/:id/publicar` | Adm |
| `PATCH /classes/:id`, `PATCH /requisitos/:id/ajuste`, `POST /especialidades` | `classe.gerenciar` (Adm) |
| `GET /visao-geral` | Adm |
| `GET/PATCH /clube/configuracao` | `clube.configurar` (Adm) |

`MontagemSaida.datas` (individuais): dias de reunião do período (B5) **mais** datas que já têm aula
(inclusive as que ficaram bloqueadas — aparecem com `conflito`). `requisitos`: todos os ativos
da classe com o ajuste do clube, na ordem do caderno, com a data atual. Aula de campo sugerida: a
tela destaca `situacao.bomParaCampo` quando o requisito selecionado tem CAMPO.

## 4. Telas

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/adm` (Visão geral) | A0 | `Adm-Inicio.dc.html` | cartões (DBVs e variação no trimestre, unidades, instrutores e classes cobertas, frequência do mês e variação, especialidades no ano e por DBV); progresso por classe; unidades com frequência (limiar do clube); cronogramas enviados aguardando publicação (link para montar); atividade recente |
| `/adm/classes` | A5 | `Adm-Classes.dc.html` | aba Classes: lista na ordem, seções e requisitos com contagem real; por classe "Ativa" e "Quem monta o cronograma: Adm / Instrutores da classe"; por requisito, caixas "Ativo" e "Campo" com "voltar ao oficial". Aba Especialidades: por área (lista real), busca, "Nova especialidade do clube" |
| `/adm/calendario` | A6 | `Adm-Calendario.dc.html` | mês a mês (abas de mês); grade dom–sáb com os dias de reunião implícitos ("Reunião 9h") e até 2 eventos por dia (+N); painel: nome, tipo, início, fim, horário, local, e as três caixas com o padrão do tipo (`MARCACOES_PADRAO`) editáveis; editar e excluir (confirmação); ao salvar com `aulasAfetadas`, faixa "Isto afeta N aulas (Amigo 18/10, …). Os instrutores foram avisados." |
| `/adm/cronogramas` e `/cronograma/montar?classe=` no computador | A7 | `Montar-Cronograma.dc.html` | seletor de classe e ano; sem cronograma: "Criar cronograma" (período padrão G4); alternador Regular/Avançada (a avançada ligada); coluna de requisitos com "agendado · dd/mm" ou "sem data" e contador real; coluna de datas: bloqueadas hachuradas sem "Colocar aqui", campo em verde quando o requisito selecionado é CAMPO, conflito em vermelho; "Colocar aqui" move; "remover"; editar horário/local/título da aula; Agrupadas: "+ Nova aula" com data livre; selo Rascunho/Enviado/Publicado; "Publicar" (Adm); "Quem monta" mostra a escolha da classe com link para A5 |
| `/cronograma/montar?classe=` no celular | I3b | `Montar-Cronograma-Instrutor.dc.html` | só para quem monta; abas Por data / Sem data (N); alternador Regular/Avançada; contador e barra neutra; "+" numa data abre a folha com os requisitos sem data (CAMPO primeiro com "Sugerido para este dia" em data de campo; "Todos os requisitos já têm data" quando vazia); data bloqueada sem "+"; conflito em vermelho com "Mover"; mover = tirar o chip e escolher outra data; editar horário/local/título; "Salvar" não existe (cada ação grava); "Enviar para o Adm publicar" (confirmação) |
| `/adm/configuracoes` | — | padrão do painel | formulário G9; item novo no menu lateral "Configurações do clube" |

Menu lateral do Adm: esta fase habilita Visão geral, Classes e especialidades, Calendário do clube,
Cronogramas e Configurações do clube (só `para`). Ranking e Relatórios ficam com a 1b/Fase 4.
A página `/cronograma/montar` substitui o "Em breve" da base, escolhendo a tela pelo papel e pela
largura (≥ 900 px e Adm → A7; senão I3b).

## 5. Testes (escritos antes)

| Teste | Tipo | Pacote |
|---|---|---|
| Eventos: CRUD, padrão das marcações, `aulasAfetadas` (vivo e publicado, só com requisito), notificações para os destinatários certos, evento removido não conta | Jest | G3-A1 |
| Montagem: colocar, mover, tirar (aula vazia some; Agrupadas não), data bloqueada → 422, fora do período → 422, não-dia de reunião → 422 em individuais e aceito em Agrupadas; um requisito numa data só; RASCUNHO em toda edição; enviar só instrutor liberado; publicar só Adm e grava o retrato; leitura da base passa a mostrar o publicado aos demais; período que exclui aula → 422; isolamento | Jest | G3-A2 |
| A5: ajuste ativo/CAMPO reflete em `GET /classes/:id` e no total de requisitos; `null` volta ao oficial; desativar classe com CURSANDO → 422; especialidade do clube única na área | Jest | G3-A3 |
| Visão geral: números com dados de reunião, aula e especialidade semeados pelas fábricas; frequência pela regra E13 | Jest | G3-A3 |
| Configurações: só os campos G9; conselheiro 403 | Jest | G3-A3 |
| Telas (quatro estados, erros) | Vitest | G3-B1…B3 |
| e2e: Adm cria um "Sem reunião" num domingo com aula → instrutor vê a notificação e a aula em conflito; instrutor liberado monta no celular e envia; Adm publica; o outro instrutor da classe passa a ver o publicado | Playwright | G3-B4 |

## 6. ONDE FICA

O da [base 2·3](../fase-2-3/SPEC.md#onde-fica); o orquestrador desta fase **atualiza este bloco**
na onda 0 com o código da base (`ServicoCronograma`, `ServicoCalendario`, `ServicoNotificacoes`,
`ServicoAtividade`, fórmulas de calendário, sino, rota reservada).
