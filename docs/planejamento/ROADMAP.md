# Aplicativo do Desbravador — Roadmap

Cinco fases, na ordem sugerida: fundação → Conselheiro → Instrutor → Adm → ranking e relatórios.
Cada fase termina **em produção e usada por alguém de verdade**, não só com o código pronto. O
critério de pronto é o que se verifica, por quem usa.

Estimativas em **semanas de voluntário** (~8 h/semana). Servem para comparar fases, não como
prazo.

Os números entre colchetes são as histórias do [BACKLOG](BACKLOG.md).

---

## Fase 0 — Fundação (4–5 semanas)

**Entrega:** o esqueleto no ar, com login, cadastros mínimos e os cadernos carregados.

- Monorepo, CI, `docker-compose`, deploy no VPS, HTTPS, backup diário com teste de restauração.
- Pacote `shared` com schemas, enums, catálogo de permissões e as fórmulas (pontos, %,
  frequência, bloqueio de data) com testes.
- Banco: clubes, usuários, vínculos, DBVs, unidades, membros, classes, seções, requisitos,
  especialidades, matrícula, configuração do clube.
- Carga inicial: cadernos das classes (`dados/cadernos/*.json`, revisados), catálogo de
  especialidades, critérios padrão do ranking.
- Login, convite por e-mail, recuperação de senha, troca de papel.
- Adm mínimo: cadastrar DBV, unidade (com membros) e usuário com vínculo [A1, A2, A3]. Pode ser
  a versão final dessas telas, se couber; senão, formulário simples que a Fase 3 refina.
- Layouts: celular (barra inferior por papel) e Adm (menu lateral), com os tokens do design.
- PWA instalável (ícone, nome, tela de abertura).

**Pronto quando:**
- Você convida um conselheiro de teste, ele recebe o e-mail, define a senha, instala o app no
  celular e vê a lista da unidade dele — e **não** vê a de outra unidade.
- Um teste automatizado prova que um usuário do clube A não lê nada do clube B.
- As 7 classes (+ avançadas) aparecem com as seções e requisitos revisados.
- O backup de ontem foi restaurado num banco limpo, e o app abriu com os dados.

## Fase 1 — Conselheiro (3–4 semanas)

**Entrega:** o domingo do conselheiro inteiro no app.

- Início do conselheiro, Minha unidade, perfil do DBV (versão sem progresso de classe).
- **Chamada** com pontos ao vivo, falta justificada e Lição (quando ligada) [C3].
- **Offline**: pacote do domingo, gravação local, **fila de envio** com estados e erro [C4, C9].
- Histórico por reunião e por DBV, detalhe da reunião, corrigir chamada com registro [C5, C5b, C6, C6b].
- Estados vazios [C10].
- Lançamento de pontos da chamada e ranking **logado** (mês) com os critérios padrão [T1].
- Galeria: álbum, envio de fotos pela fila com redução e legenda, aviso de quem não tem
  autorização de imagem, visualizar em tela cheia [C7, C8]. *Separável: se atrasar, vai para a
  Fase 4 e a fase fecha sem ela.*

**Pronto quando:**
- **Piloto**: duas unidades fazem a chamada pelo app por **3 domingos seguidos**, com a papelada
  em paralelo, e os números batem.
- Com o celular em modo avião, o conselheiro faz a chamada, fecha o app, reabre com internet e a
  chamada chega ao servidor **sem ele fazer nada** (ou com um toque em "Enviar agora").
- A chamada de uma unidade de 10 DBVs leva menos de 2 minutos.

## Fase 2 — Instrutor (4–5 semanas)

**Entrega:** o registro das aulas e o acompanhamento das classes.

- Início do instrutor, Minhas classes, cronograma (leitura do publicado).
- **Registro de aula** offline: presença + requisitos cumpridos, "o que falta fazer" [I4, I5].
- Marcar requisito fora da aula (reposição) e desmarcar com estorno [I6].
- Progresso da classe e perfil do DBV completo (anel, seções, classes investidas) [I7, T3].
- Especialidades por DBV [I8].
- Observações (privadas) e materiais de apoio [I9, I10].
- Alerta "DBVs com 2 faltas seguidas nas aulas".
- Progresso de regular e avançada separados em todas as telas.
- Agrupadas usando as mesmas telas: registro de aula e progresso (sem ranking, com líderes
  cursando).

**Pronto quando:**
- Os instrutores de duas classes registram **4 aulas seguidas** pelo app.
- O % de um DBV no app bate com o caderno de papel dele (conferência de 3 DBVs por classe).
- Um conselheiro, logado, não consegue ver uma observação nem pela API.

*Enquanto a Fase 3 não chega, o cronograma da Fase 2 é montado pelo Adm numa tela provisória
simples (lista de datas × requisitos), ou por carga de planilha feita por você.*

## Fase 3 — Adm (5–6 semanas)

**Entrega:** o Adm prepara e administra o ano sem precisar de você.

- Visão geral [A0].
- Desbravadores, usuários e permissões, unidades — versões finais das telas [A1–A3].
- Classes e especialidades: acrescentar requisito/especialidade do clube, marcar CAMPO,
  "quem monta o cronograma" [A5].
- **Calendário do clube** com eventos de vários dias e as duas marcações [A6].
- **Montar cronograma** com datas bloqueadas, sugestão de campo, publicar; instrutor liberado
  monta **pelo celular** e envia para o Adm publicar; Agrupadas com datas livres [A7, I3b].
- Notificação de conflito quando um evento cai em cima de aula agendada (sino) [A8].
- Configurações do clube (dia e hora da reunião, limiares).

**Pronto quando:**
- O Adm (não você) cadastra o calendário do próximo semestre e monta o cronograma de uma classe
  do zero, sem pedir ajuda, em uma sessão.
- Criar um "sem reunião" num domingo com aula agendada faz o instrutor ver a notificação e a aula
  marcada em conflito.
- Nenhuma data bloqueada aceita requisito, nem pela API.

## Fase 4 — Ranking e relatórios (3 semanas)

**Entrega:** o ranking completo e os números para a diretoria.

- Configuração do ranking: ligar/desligar, valores, critério personalizado, período, desconto
  por falta, simulação [A9].
- Lançamento manual (ex.: participação em evento) para vários DBVs de uma vez [A10].
- Ranking por trimestre e ano, variação de posição, filtro por unidade, ranking de unidades [T1].
- **Ranking público** com nome abreviado, desligável [T2].
- Relatórios: frequência mensal, especialidades mais concluídas, tabela por classe, exportar
  Excel [A11].
- (Galeria, se saiu da Fase 1.)

**Pronto quando:**
- Mudar o valor de "Presença" de 10 para 12 altera só as chamadas feitas depois — as de antes
  continuam com 10.
- O ranking público, aberto numa janela anônima, mostra só primeiro nome + inicial e não leva a
  perfil nenhum.
- O Excel de frequência do trimestre abre no celular e no computador, com os mesmos números da
  tela.

---

## Depois do MVP (sem ordem fixa)

Montar cronograma no celular · notificações push · relatórios em PDF · importar planilha de DBVs ·
importar calendário da Associação · integração com o Desbravadores Finance · tela para
pais/DBV · lançamento em massa a partir de um evento do calendário.

## Marcos de uso

| Marco | Quando |
|---|---|
| Piloto com 2 unidades | Fim da Fase 1 |
| Todas as unidades na chamada | 1 mês após a Fase 1 |
| Todas as classes no registro de aula | Fim da Fase 2 |
| Adm autônomo no calendário e cronograma | Fim da Fase 3 |
| Ranking público na tela do login | Fim da Fase 4 |

**Total estimado:** 19–23 semanas de voluntário. O melhor momento para ligar a Fase 1 em
produção é o início de um semestre, quando o clube já está reorganizando as unidades.
