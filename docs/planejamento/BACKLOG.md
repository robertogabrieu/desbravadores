# Aplicativo do Desbravador — Backlog

Histórias por perfil, com critérios de aceite e a tela de referência em `docs/design/telas/`.
A coluna **Fase** remete ao [ROADMAP](ROADMAP.md). Código da história: F = fundação, T = todos,
C = conselheiro, I = instrutor, A = Adm.

As telas são referência visual e de comportamento; onde a regra abaixo contradiz o desenho, vale
a regra (as divergências estão em [INCONSISTENCIAS](INCONSISTENCIAS.md)).

---

## Fundação e comuns

### F1 · Entrar no app — `Main.dc.html` · Fase 0
Como líder, quero entrar com e-mail e senha para usar o app do meu papel.
- Não há seletor de perfil: o papel vem da conta. Com mais de um papel, após o login aparece
  "Entrar como: Conselheiro (Águias) · Instrutor (Amigo)"; a escolha fica lembrada.
- Senha errada: mensagem única "E-mail ou senha incorretos" (não diz qual).
- "Esqueci minha senha" envia o link; a tela confirma mesmo que o e-mail não exista.
- "Ver ranking DBV Destaque" aparece só se o Adm deixou o ranking visível no login.
- Continua logado por 30 dias no mesmo aparelho, mesmo sem abrir o app.

### F2 · Aceitar convite — (sem tela desenhada) · Fase 0
Como líder convidado, quero definir minha senha pelo link do e-mail.
- Link de uso único, válido por 7 dias; vencido → "Peça um novo convite ao Adm do clube".
- Após definir a senha, entra direto no Início do seu papel e vê o convite para instalar o app.

### F3 · Instalar no celular — (sem tela) · Fase 0
- Android: botão "Instalar app" no Início até instalar. iPhone: instrução curta
  "Compartilhar → Adicionar à Tela de Início", mostrada uma vez.

### F4 · Trocar de papel — (sem tela) · Fase 0
- Quem tem mais de um vínculo vê o papel atual no topo do Início e troca com dois toques; a
  barra inferior muda para a do papel escolhido. Adm no celular vê aviso "o painel do Adm é
  melhor no computador", com link.

### T1 · Ver o ranking DBV Destaque — `Ranking.dc.html` · Fases 1 e 4
Como líder, quero ver quem está pontuando mais para incentivar os DBVs.
- Abas Mês/Trimestre/Ano **recalculam** a lista; o título mostra o período ("setembro", "3º tri").
- Pódio com os 3 primeiros; lista completa com rolagem (não para no 10º).
- Filtro por unidade quando `rankingPorUnidade` está ligado.
- Variação: "+2", "−1" ou "mantém", em relação ao dia de reunião anterior.
- Empate: maior frequência, depois nome.
- Tocar num DBV abre o perfil **só se** ele estiver no escopo do usuário (conselheiro: sua
  unidade; instrutor: suas classes; Adm: todos).
- A barra inferior é a do papel ativo.

### T2 · Ranking público — `Ranking.dc.html` (variação) · Fase 4
Como visitante, quero ver o ranking sem entrar.
- Mostra só `nomePublico` ("Ana C."), unidade e pontos; sem avatar de iniciais que identifique,
  sem classe, sem link para perfil.
- Sem barra inferior; botão "Entrar" no topo.
- Desligado pelo Adm → a página diz "Ranking indisponível".

### T3 · Ver o perfil do DBV — `Perfil-DBV.dc.html` · Fases 1 e 2
- Mostra idade, unidade, classe atual, posição, pontos do período, frequência do período.
- Anel com o % da classe **regular** atual e, ao lado, um anel menor com o % da **avançada**
  correspondente (com o selo "recomendada" enquanto não concluída); o instrutor da classe (se
  houver mais de um, os nomes separados por vírgula).
- "Pronto para investidura" aparece com 100% da regular, independente da avançada.
- Progresso por seção: todas as seções da classe, na ordem do caderno; barra verde em 100%, cinza
  abaixo (não vermelho: vermelho parece erro do DBV).
- Classes investidas com o ano; especialidades concluídas.
- Responsável e telefone só para quem tem `dbv.ver_contato`.
- "Voltar" retorna à tela de onde veio.
- Nunca mostra observações.

---

## Conselheiro

### C1 · Início do conselheiro — `Inicio-Conselheiro.dc.html` · Fase 1
- Card da próxima reunião com data, hora e local vindos do calendário (pula domingos sem
  reunião); se hoje é dia de reunião e a chamada não foi feita, o botão "Fazer chamada" é o
  destaque.
- Números: DBVs ativos na unidade, frequência do mês, posição da unidade no ranking de unidades.
- Top 3 da unidade no período, cada um levando ao perfil.
- Selo "N aguardando envio" quando há fila, levando à fila de envio (C9).
- O atalho duplicado "Registro de reunião" sai; fica "Galeria" no lugar.

### C2 · Minha unidade — `Minha-Unidade.dc.html` · Fase 1
- Lista dos DBVs ativos em ordem alfabética: classe atual, idade, frequência do período.
- Frequência abaixo do limiar do clube (padrão 70%) em vermelho.
- Busca por nome filtra enquanto digita.
- Tocar no DBV abre o perfil.

### C3 · Fazer a chamada — `Registro-Reuniao.dc.html` · Fase 1
Como conselheiro, quero marcar presença, atraso, uniforme e Bíblia de cada DBV para registrar a
reunião e somar os pontos.
- Todos começam **sem marcação**. Tocar no nome = presente. Tocar de novo alterna para ausente.
- Presente mostra os chips Atrasou / Uniforme / Bíblia (e Lição, se o critério estiver ligado).
- Ausente mostra o chip "Justificada".
- Pontos por DBV calculados ao vivo com os **valores dos critérios ativos** (não fixos):
  Presença + Pontualidade (se não atrasou) + Uniforme + Bíblia + Lição. Ausente = 0, ou o
  desconto configurado se não justificada.
- Resumo no topo: presentes X/N, atrasos, uniformes, Bíblias.
- Campo de observações da reunião.
- "Salvar chamada · N pts" grava no aparelho e envia; a tela confirma "Chamada salva" e
  indica se já foi enviada.
- Só uma chamada por unidade por data; abrir de novo edita a mesma.
- Só DBVs membros da unidade na data da reunião.

### C4 · Chamada sem internet — `Estado-Offline.dc.html` · Fase 1
- Sem conexão, a chamada funciona **igual à online** (atraso, uniforme, Bíblia, observações) e
  grava no aparelho — a tela de referência simplifica a lista só para mostrar a faixa e o fluxo.
- Faixa "Sem conexão" no topo; carimbo "lista atualizada hoje às 8h12". Sem lista guardada no
  aparelho: "Abra o app com internet uma vez antes da reunião para baixar a unidade".
- Botão "Salvar no aparelho"; depois, card "aguardando envio · ver fila".
- Pontos aparecem como provisórios até o envio.
- Selo "Salva no celular — será enviada" até o envio; depois "Enviada às 9h42".
- Envia sozinha quando a internet volta com o app aberto, ou ao reabrir o app.
- Nada se perde ao fechar o app, reiniciar o celular ou o login expirar.
- Mexer na chamada depois de salva exige salvar de novo (o card volta a "alterações não salvas").

### C5 · Histórico por reunião — `Historico-Reunioes.dc.html` · Fase 1
- Lista das reuniões do período: data, presentes/total **da data**, atrasos, uniformes, %.
- % abaixo do limiar em vermelho.
- Tocar abre o detalhe da reunião (C5b); reunião ainda na fila tem a marca "não enviado".

### C5b · Detalhe da reunião — `Detalhe-Reuniao.dc.html` · Fase 1
- Resumo (presentes, atrasos, uniformes, pontos), "registrada por X às HH:MM" e, se corrigida,
  "alterada por Y às HH:MM".
- Filtro Todos/Presentes/Ausentes com contagens reais; por DBV: situação (inclusive falta
  justificada e Lição, quando ligada) e pontos **lançados pelo servidor**.
- Observações; fotos da reunião ("Ver álbum" abre **o álbum dela**; "+" abre o envio com esse
  álbum já escolhido).
- "Editar" só aparece dentro do prazo de correção (C6b).

### C6 · Histórico por DBV — `Historico-Reunioes.dc.html` · Fase 1
- Grade das últimas 8 reuniões: P (presente), A (atraso), F (falta), J (justificada).
- % por DBV nas 8 reuniões exibidas, com o rótulo "últimas 8 reuniões" (difere da frequência do
  período mostrada na lista da unidade).

### C6b · Corrigir chamada — `Registro-Reuniao.dc.html` em modo edição · Fase 1
- O conselheiro corrige qualquer chamada dos últimos 30 dias; o Adm, qualquer uma.
- A correção regrava os lançamentos de pontos daquela chamada e guarda o antes/depois de cada DBV
  alterado (quem e quando).
- Funciona offline; uma correção na fila substitui a versão anterior da mesma chamada.

### C7 · Ver a galeria — `Galeria.dc.html` · Fase 1 (separável)
- Álbuns por reunião/evento, com capa e contagem; o total do cabeçalho é a soma real.
- Tocar numa foto abre em tela cheia, com deslizar para a próxima.

### C8 · Enviar fotos — `Enviar-Fotos.dc.html` · Fase 1 (separável)
- Álbum: reunião de hoje (padrão), reunião vinda do detalhe, evento do calendário ou **álbum novo
  com campo de nome**.
- Antes da seleção, aviso "Não fotografe: Ana C., Pedro H." com os DBVs da unidade sem
  autorização de imagem (some se todos têm).
- Câmera ou galeria, várias de uma vez; remover antes de enviar; uma legenda opcional para o lote.
- Fotos reduzidas no aparelho (≤ 2 MB) e colocadas na fila; funciona sem internet.
- Progresso por foto; ao terminar, "N fotos enviadas" e botão "Ver álbum"; foto recusada mostra o
  motivo e fica na fila com erro.
- "Pode sair desta tela — o envio continua enquanto o app estiver aberto."

### C9 · Fila de envio — `Estado-Pendente.dc.html` · Fase 1
- Status geral: sem conexão / enviando / tudo enviado, com "Tentar enviar agora".
- Itens (chamadas, correções, aulas, fotos) com estado na fila / enviando % / enviado / erro.
- Item com erro mostra o motivo; "Tentar de novo" volta para "enviando"; "Descartar" pede
  confirmação.
- Aviso de não sair da conta; o botão Sair, com fila, pede confirmação na própria tela.

### C10 · Estados vazios — `Estado-Vazio.dc.html` · Fases 1 e 2
- Ícone, título, uma frase e no máximo uma ação que leva ao próximo passo real.
- Galeria vazia → "Enviar primeiras fotos"; reuniões vazias → "Fazer a primeira chamada".
- Unidade sem DBVs → "Avisar o Adm" (envia um pedido ao Adm e confirma "Adm avisado").
- Cronograma não publicado (instrutor) → se a classe está com o Adm, "Pedir para eu montar"
  (pedido ao Adm para liberar); se está liberada, "Montar cronograma".
- Carregamento e erro de servidor seguem o mesmo padrão (sem tela desenhada).

---

## Instrutor

### I1 · Início do instrutor — `Inicio-Instrutor.dc.html` · Fase 2
- Próxima aula de **cada** classe dele: data, hora, seção, nº de requisitos e de DBVs. Classes
  das Agrupadas aparecem depois das individuais, num bloco mais discreto.
- Aula hoje → "Registrar aula" em destaque para aquela classe.
- Progresso médio por classe.
- Alerta "N DBVs faltaram às 2 últimas aulas" com os nomes e a classe.

### I2 · Minhas classes — `Minhas-Classes.dc.html` · Fase 2
- Um card por classe, na cor oficial: idade, nº de DBVs, progresso médio, próxima aula, aulas
  dadas no ano.
- Botões Cronograma, Progresso e Materiais já **na classe do card**.

### I3 · Ver o cronograma — `Cronograma.dc.html` · Fase 2
- Chips para trocar de classe.
- Linha do tempo: Dada (tem registro), Hoje, Planejada, **Conflito** (data bloqueada depois do
  agendamento, em vermelho).
- Requisitos com código e texto; etiqueta CAMPO visível.
- "Montar cronograma" só aparece se a classe está com "instrutor monta" (senão, o estado vazio
  de C10 oferece pedir ao Adm).
- Cronograma em rascunho não aparece para quem não monta.

### I3b · Montar cronograma no celular — `Montar-Cronograma-Instrutor.dc.html` · Fase 3
- Só para instrutor liberado. Selo Rascunho / Enviado ao Adm / Publicado.
- Abas "Por data" e "Sem data (N)", e alternador **Regular / Avançada**; contador real "N de total
  com data", barra neutra (sem vermelho).
- Datas bloqueadas hachuradas, sem "+"; datas de campo com "+" verde; na folha de requisitos, os
  CAMPO vêm primeiro como "Sugerido para este dia". Folha sem requisitos restantes: "Todos os
  requisitos já têm data".
- Aula em conflito (bloqueada depois de agendada) aparece em vermelho com "Mover".
- Mover = tirar o chip e escolher outra data; horário, local e título da aula editáveis.
- "Salvar rascunho" e "Enviar para o Adm publicar" (confirma e notifica o Adm). Editar depois de
  enviar devolve a rascunho.

### I4 · Registrar a aula — `Registro-Aula.dc.html` · Fase 2
Como instrutor, quero marcar quem foi e quem cumpriu cada requisito para acompanhar o progresso.
- Abre com os requisitos planejados para a aula; "+ Requisito" acrescenta qualquer requisito da
  classe (reposição).
- Grade DBV × requisito. Tocar no nome alterna presente/faltou; requisito só marcável se
  presente.
- Marcar faltou **não apaga** requisitos já concluídos em aulas anteriores; só impede marcar
  nesta aula.
- Requisito já concluído antes aparece como feito e travado, com a data.
- "O que falta fazer" lista, por requisito, os presentes que ainda não cumpriram.
- "Salvar aula" grava, gera +pontos por requisito concluído (valor do critério ativo), volta ao
  Início do instrutor com confirmação.

### I5 · Aula sem internet — `Registro-Aula.dc.html` · Fase 2
- Mesmo comportamento de C4.

### I6 · Marcar requisito fora da aula — `Perfil-DBV.dc.html` (seção) · Fase 2
- No perfil do DBV, por seção, o instrutor da classe marca ou desmarca um requisito com a data.
- Desmarcar pede confirmação e estorna os pontos.

### I7 · Progresso da classe — `Progresso-Classe.dc.html` · Fase 2
- Chips de classe; alternador **Regular / Avançada** — os dois progressos nunca se somam.
- Média da turma (média dos % exatos, arredondada só no fim).
- Regular: "N prontos para investidura" (100%) e "N abaixo de 40%" (limiar configurável).
  Avançada: "N concluíram a avançada".
- Lista por DBV em ordem decrescente de %, com "faltam N req."; abaixo do limiar em laranja.
- Tocar abre o perfil do DBV.

### I8 · Especialidades — `Especialidades.dc.html` · Fase 2
- Escolhe o DBV entre os das suas classes; busca por nome de especialidade.
- Especialidades agrupadas por área; marcar pede a data (padrão hoje), desmarcar pede confirmação.
- "Concluída em 12/09 · marcada por Priscila" com o nome real de quem marcou.
- Marca/desmarca gera/estorna os pontos de especialidade.

### I9 · Observações — `Observacoes.dc.html` · Fase 2
- Chips de classe; abas "Por aula" e "Por DBV".
- Nova observação: "Sobre uma aula" (escolhe a aula, padrão a de hoje) ou "Sobre um DBV"
  (escolhe na lista da classe); título opcional; texto.
- Cada nota mostra autor e data; o autor edita e apaga.
- Notas de outros instrutores só com a permissão `observacao.ver_outros`.
- Selo fixo "Visível só para instrutores e Adm".

### I10 · Materiais de apoio — `Materiais.dc.html` · Fase 2
- Chips de classe; materiais agrupados por seção do caderno; contagem real no cabeçalho.
- "Enviar arquivo" (PDF, PPTX, ODP, DOCX ou ODT até 20 MB; sem vídeo e sem os formatos antigos .doc/.ppt; 1 GB por clube) e "Adicionar link" (título + URL `https`).
- Menu do item: abrir, renomear, mover de seção, apagar (autor ou Adm).

---

## Adm

### A0 · Visão geral — `Adm-Inicio.dc.html` · Fase 3
- Indicadores: DBVs ativos (e variação no trimestre), unidades, instrutores e classes cobertas,
  frequência do mês (e variação), especialidades no ano.
- Progresso por classe; unidades com frequência (limiar do clube, um valor só em todo o app).
- Atividade recente real (chamadas registradas, aulas, publicações).

### A1 · Cadastro de desbravadores — `Adm-Desbravadores.dc.html` · Fases 0 e 3
- Tabela com busca e filtros de unidade e classe **funcionando**; "Novo desbravador".
- Painel: nome, nascimento (seletor de data), sexo, unidade, classe do ano, responsável,
  telefone, e-mail do responsável, **autorização de imagem**, nome público.
- Inativar (saída do clube), com data; o histórico permanece.
- Cadastro de **líder em formação** (para as Agrupadas): sem unidade, sem ranking, opcionalmente
  ligado à conta de usuário dele.
- Matricular na regular já matricula na avançada correspondente; o Adm pode desmarcar.
- Aviso (não bloqueio) se a unidade é masculina/feminina e o sexo não bate, ou se a idade não
  corresponde à classe.

### A2 · Usuários e permissões — `Adm-Usuarios.dc.html` · Fases 0 e 3
- Abas com contagem real; "Novo usuário" envia convite com **um papel** (outros se acrescentam depois, na ficha).
- Ficha com **um cartão por papel** (a pessoa pode ter vários): Alterar (vínculo — unidades ou
  classes, múltipla escolha — e as caixas de permissão do papel, com os padrões do catálogo) e
  Remover papel, com confirmação. "Acrescentar papel" em dois passos: papel, depois escopo e ajustes.
- Editar usuário mexe só em nome e gênero, e só de quem ainda está convidado.
- O clube nunca fica sem Adm ativo: a checagem vale também para duas remoções simultâneas.
- A permissão "Montar cronograma" **não** aparece aqui (fica na classe, A5).
- Reenviar convite; Desativar usuário no rodapé da ficha.

### A3 · Unidades — `Adm-Unidades.dc.html` · Fases 0 e 3
- Criar, editar (nome, tipo, grito de guerra), desativar unidade.
- Conselheiros da unidade (um ou mais).
- Mover DBVs entre "Na unidade" e "Sem unidade"; salva ao tocar, com desfazer.

### A5 · Classes e especialidades — `Adm-Classes.dc.html` · Fase 3
- Classes com seções e requisitos do caderno, contagem real.
- Requisito oficial: só marcar/desmarcar CAMPO e desativar. Requisito do clube: criar e editar.
- **Quem monta o cronograma**: Adm ou instrutores da classe.
- Especialidades: lista por área (não só as áreas), busca, criar especialidade do clube.

### A6 · Calendário do clube — `Adm-Calendario.dc.html` · Fase 3
- Mês a mês, com domingos de reunião implícitos no horário do clube.
- Evento: nome, tipo, início, fim, horário/local opcionais, e três marcações — "Terá reunião",
  "Terá classe", "Bom para requisitos de campo" — pré-preenchidas pelo tipo e editáveis. Tipos
  Férias e Reunião extra (um dia só, acrescenta reunião e/ou classe fora do dia normal).
- Editar e excluir evento.
- Ao salvar evento que cai em aulas agendadas: "Isto afeta 2 aulas (Amigo 18/10, Guia 18/10).
  Os instrutores serão avisados."

### A7 · Montar cronograma — `Montar-Cronograma.dc.html` · Fase 3
- Escolhe classe e ano; período início–fim.
- Lista de **todos** os requisitos da classe com status "agendado · data" ou "sem data" e o
  contador real "N/total agendados". Regular e avançada em abas separadas.
- Coluna de datas: todos os dias de reunião do período.
- **Agrupadas**: em vez dos dias de reunião, o responsável cria as datas livremente (qualquer dia
  e hora); evento do calendário na mesma data só gera aviso, não bloqueia.
- Data bloqueada (qualquer evento com "Não há aula"): hachurada, sem "Colocar aqui".
- Requisito CAMPO selecionado: datas "bom para campo" em verde.
- Evento de vários dias aparece no domingo que ele cobre.
- "Colocar aqui" move o requisito (cada requisito numa data só); "remover" tira.
- Estado **Rascunho / Enviado / Publicado** visível; cronograma enviado por instrutor aparece em
  destaque para o Adm; "Publicar" avisa os instrutores.
- Com "instrutor monta", o instrutor monta pelo celular (I3b); a publicação continua do Adm.

### A8 · Aviso de conflito — (sino, sem tela) · Fase 3
- Notificação ao instrutor (e ao Adm, se ele monta) com link para a aula em conflito.

### A9 · Configurar o ranking — `Adm-Ranking.dc.html` · Fase 4
- Critérios: ligar/desligar, pontos (digitar ou −/+), quem lança (fixo nos de fábrica).
- Critério personalizado: nome, descrição, pontos → lançamento manual pelo Adm.
- "Zerar pontuação": a cada mês, trimestre ou ano.
- Mostrar no login; exibir por unidade; descontar falta não justificada (com o valor).
- Simulação "reunião perfeita" = soma dos critérios de chamada ativos.
- Aviso ao salvar: "Os novos valores valem a partir de agora. Pontos já lançados não mudam."

### A10 · Lançar pontos manuais — (sem tela desenhada) · Fase 4
- Escolhe o critério manual, a data e vários DBVs (filtro por unidade); confirma.
- Lista de lançamentos manuais com estorno.

### A11 · Relatórios — `Adm-Relatorios.dc.html` · Fase 4
- Período selecionável.
- Frequência **de reunião** por mês com a meta do clube; tabela por classe com frequência **nas
  aulas** — os dois rótulos deixam claro qual é qual.
- Especialidades mais concluídas no período.
- Por classe: instrutores, DBVs, frequência nas aulas, progresso médio da **regular** e da
  **avançada** em colunas separadas, prontos para investidura (100% da regular), avançadas
  concluídas.
- Agrupadas numa tabela à parte, abaixo das individuais.
- Exportar Excel (PDF fica para depois).
