# Inconsistências e lacunas encontradas

Resultado da leitura do `docs/design/` (LEIA-ME + 25 telas) e dos cadernos oficiais. Cada item diz
o problema e **o que o planejamento adotou**. Itens marcados **[decidir]** ainda esperam você.

Os números de exemplo das telas (contagens, percentuais, pontos) não batem entre si em vários
lugares — normal em protótipo. Esses não estão listados um a um; a regra geral é: **toda
contagem vem do banco, nenhuma é digitada**.

## 1. Regras que se contradiziam

| # | Onde | Problema | Adotado |
|---|---|---|---|
| 1 | Login | A tela pede para escolher o perfil, mas o papel vem da conta | Seletor sai; quem tem 2 papéis escolhe após entrar (F1) |
| 2 | Usuários × Montar cronograma | Duas travas para a mesma ação: permissão "Montar cronograma" no usuário e "Quem monta" na classe | Uma trava só, na classe (A5) |
| 3 | Montar cronograma | O LEIA-ME diz que bloqueio e sugestão vêm das marcações do evento; o protótipo decide pelo **tipo** | Vale a marcação (editável), o tipo só preenche o padrão |
| 4 | Calendário | Acampamento tira a "Reunião 9h" do dia mas não bloqueia aula — "sem reunião" e "sem aula" eram a mesma coisa | Terceira marcação `cancelaReuniao` |
| 5 | Início Adm × LEIA-ME | Unidade em vermelho abaixo de 75% no painel e abaixo de 70% no resto | Um limiar do clube, padrão 70% |
| 6 | Reunião | 9h no calendário, 9h15 no cronograma, 8h30 no Início do conselheiro | Dia e hora da reunião na configuração do clube; aula pode ter horário próprio |
| 7 | Registro de aula × LEIA-ME | Requisito "(reposição)" aparece numa aula diferente da agendada, mas "cada requisito fica em uma data só" | O cronograma continua com uma data por requisito; o **registro** aceita qualquer requisito (reposição) |
| 8 | Progresso × Relatórios | "Prontos para investidura" com 90% na tela, sem critério no LEIA-ME | 100% da classe regular; a avançada tem progresso próprio e não conta (decisão 7) |
| 9 | Perfil do DBV | Barra vermelha em qualquer seção abaixo de 100% (parece erro do DBV) | Cinza abaixo de 100%, verde em 100% |
| 10 | Frequência | Três cálculos diferentes (período, últimas 8, denominador fixo 8) e "frequência" de reunião × de aula misturadas nos relatórios | Frequência de reunião = período; grade = últimas 8, rotulada; relatório separa "reunião" de "aula" |
| 11 | Montar cronograma | Desenhada só para computador, mas acessada pelo botão do instrutor no celular | **Resolvido na 2ª rodada:** tela de celular para o instrutor (I3b) |
| 12 | Usuários | Adm com 6 permissões editáveis, mas o LEIA-ME diz "Adm: tudo" | Adm tem tudo, não editável |
| 13 | Ranking público | Mostra nome completo de menores e leva ao perfil | Nome abreviado, sem perfil (decisão 4) |
| 14 | Perfil do DBV | 8 seções na tela, 9 no LEIA-ME | Cada classe mostra as seções que o caderno dela tem (Excursionista não tem "Enriquecendo a vida") |

## 2. Telas que faltam

| # | Tela | Por que precisa |
|---|---|---|
| 1 | Aceitar convite / definir senha | Não existe cadastro aberto |
| 2 | Esqueci / redefinir senha | O link existe no login e não leva a nada |
| 3 | Seleção de papel e troca de papel | Uma pessoa com dois papéis |
| 4 | Notificações (lista do sino) | O sino existe no Início, sem destino |
| 5 | Detalhe da reunião / correção da chamada | O histórico não abre nada |
| 6 | Visualizar foto em tela cheia e enviar fotos (câmera, marcar quem aparece) | Botões sem comportamento |
| 7 | Lançamento manual de pontos (critério do Adm, ex.: evento) | O critério existe e ninguém lança |
| 8 | Novo desbravador, novo usuário, nova unidade, editar/excluir evento, editar requisito | Os botões existem sem formulário |
| 9 | Montar cronograma na visão do instrutor liberado (sem o menu e os controles do Adm) | A tela atual é do Adm |
| 10 | Marcar requisito fora da aula (no perfil do DBV) | Reposição e atividade em casa |
| 11 | Estados vazios, carregamento, erro, "sem conexão", "esperando envio" | Nenhuma tela mostra; a chamada offline depende deles |
| 12 | Aviso de privacidade | Exigência da LGPD para dados de menores |

**2ª rodada (29/09):** chegaram as telas 5 (Detalhe da reunião), 6 (Enviar fotos), 9 (Montar
cronograma no celular) e 11 (estados vazio, sem conexão e fila de envio). Seguem sem desenho:
carregamento/erro de servidor, visualizador de foto em tela cheia e as versões de computador do
detalhe da reunião e da galeria — todas podem seguir o padrão existente.

## 3. Lacunas de regra que o planejamento preencheu

Cada uma com a decisão tomada — discorde de qualquer uma e eu ajusto os documentos.

| # | Pergunta que ficou aberta | Adotado |
|---|---|---|
| 1 | Pontualidade é dada a quem não foi marcado como atrasado? | Sim: presente e não atrasado = pontualidade |
| 2 | Desconto por falta: quanto? | Valor configurável, só para falta não justificada |
| 3 | Evento de vários dias: qual domingo bloqueia? | Todos os domingos do intervalo |
| 4 | Dois eventos no mesmo dia com marcações diferentes | Basta um bloquear; basta um ser bom para campo |
| 5 | Evento criado em cima de aula agendada: o que acontece com o requisito? | Fica na data, marcado como **conflito**; responsável é avisado e move |
| 6 | Instrutor que falta à aula de alguém: marcar "faltou" apaga requisitos antigos? | Não; só impede marcar nesta aula |
| 7 | "DBVs atrasados" no Início do instrutor | "Faltaram às 2 últimas aulas da classe" (não é prazo de cronograma) |
| 8 | Quem pode marcar especialidade | Instrutor, para DBVs das suas classes; Adm para todos |
| 9 | Ranking de unidade | Média de pontos por DBV ativo |
| 10 | Variação de posição | Comparada ao dia de reunião anterior |
| 11 | Desempate no ranking | Frequência, depois nome |
| 12 | Unidade masculina com DBV do sexo feminino | Aviso, não bloqueio |
| 13 | Classe × idade | Aviso se não bater; a classe é escolha do Adm |
| 14 | Quanto tempo o conselheiro pode corrigir uma chamada | 30 dias; Adm sem limite |
| 15 | Chamada e pontos: qual é a fonte? | `LancamentoPontos`; a chamada não guarda pontos |
| 16 | A avançada precisa de matrícula própria? | Sim; matricular na regular cria a da avançada junto, e o Adm pode remover |
| 17 | Líder cursando Agrupadas: onde fica? | Cadastro de desbravador com tipo "líder": sem unidade, chamada, frequência nem ranking |
| 18 | Avançada agrupada de 15+ exige as seis avançadas? | Sim, pela caixa de idade do caderno (todas brancas para 15+). Conferir com quem conhece o supletivo |

## 3b. Segunda rodada de telas — onde divergiam do plano

| # | Tela | Divergência | Adotado |
|---|---|---|---|
| 1 | Montar cronograma (celular) | "Enviar para o Adm publicar" cria um passo que o plano não tinha | Status novo **Enviado**; notifica o Adm; editar volta a rascunho |
| 2 | Montar cronograma (celular) | Sem abas regular/avançada, sem conflito, sem editar horário; barra de progresso vermelha | Plano mantém os três; barra neutra |
| 3 | Enviar fotos | Não tem "marcar quem aparece" nem bloqueio por autorização de imagem | Aviso "Não fotografe: …" antes da seleção; marcação fica para depois |
| 4 | Enviar fotos | "Novo álbum" pede nome sem campo; não dá para escolher reunião passada | Campo de nome; vindo do detalhe, a reunião já vem escolhida |
| 5 | Enviar fotos | Legenda única para o lote, que o modelo não tinha | `Foto.legenda`, copiada do lote |
| 6 | Enviar fotos / Fila | Fotos offline e "envio continua em segundo plano" | Fotos entram na fila; sobem com o app aberto em qualquer tela, não com ele fechado (limite do iPhone) |
| 7 | Detalhe da reunião | "Alterações ficam registradas" sem estrutura no modelo | `ChamadaAlteracao` com antes/depois por DBV |
| 8 | Detalhe da reunião | "Editar" sempre visível; pontos calculados na tela com valores fixos | Editar só no prazo (30 dias, Adm sem limite); pontos vêm dos lançamentos |
| 9 | Chamada offline | Lista reduzida a presente/ausente, já pré-marcada | Offline funciona igual à online, começando sem marcação |
| 10 | Fila de envio | Estado "erro" com Tentar de novo / Descartar, sem regra | Erro = recusa do servidor; falha de rede volta à fila sozinha; descartar pede confirmação |
| 11 | Fila de envio | Correção de chamada como item separado da chamada | Correção ainda na fila substitui a versão anterior (mesmo id) |
| 12 | Conflito entre aparelhos | LEIA-ME sugere "vale a última, Adm vê o conflito" | Adotado, por DBV, com registro em `ChamadaAlteracao` |
| 13 | Estados vazios | "Avisar o Adm" e "Pedir para eu montar" sem destino | Pedido ao Adm vira notificação (`PEDIDO_AO_ADM`) |
| 14 | Início | Selo "N aguardando envio" × faixa amarela do plano | Selo, como no desenho |

## 4. Cadernos oficiais

Os requisitos foram extraídos dos PDFs para `dados/cadernos/*.json`. **Precisam de revisão humana
antes da carga.** Contagens em [dados/cadernos/LEIA-ME.md](dados/cadernos/LEIA-ME.md).

| # | Problema | O que falta |
|---|---|---|
| 1 | As **classes avançadas não têm seções** no caderno — vêm numeradas de 1 a N | Padronizadas numa seção única "Classe avançada" (código `AV`), na ordem do caderno. **[decidir]** se prefere distribuí-las nas seções da regular |
| 2 | **Excursionista**: faltam as páginas impressas 44 e 45 no PDF — some o requisito 1 da avançada e o nome dela ("Excursionista na Mata" foi deduzido). A versão do caderno de Agrupadas sugere o texto que falta | Conferir no caderno de papel e completar |
| 2b | O caderno de **Agrupadas** traz as 6 avançadas numa versão diferente da dos cadernos regulares | **Resolvido:** Agrupadas é supletivo com requisitos próprios. As avançadas dele viraram 5 "avançadas agrupadas" (uma por idade, acumulando as anteriores pela caixa de idade), todas na carga |
| 3 | **Amigo da Natureza, AV8**: enunciado ausente no PDF; o texto no arquivo foi **reconstruído** e marcado nos avisos | Conferir no caderno de papel |
| 4 | Requisitos "Completar a especialidade X": só o enunciado entrou, não o conteúdo da especialidade | Nada — é o esperado |
| 5 | Etiqueta **CAMPO** foi inferida pelo assunto; os duvidosos ficaram sem e estão nos avisos | Um instrutor experiente revisar (15 min por classe) |
| 6 | O caderno chama a seção IX de "Estilo de vida" em algumas classes; usamos "Enriquecendo a vida" | **[decidir]** qual nome exibir |
| 7 | As telas mostram 44–53 requisitos por classe; os cadernos têm **23–29** na regular | Nada — os números das telas eram fictícios |
| 8 | **Catálogo de especialidades** (~500 itens, por área) não veio com o material | **[decidir]** fonte: lista oficial da DSA/CPB em planilha, ou o Adm cadastra só as que o clube usa |
