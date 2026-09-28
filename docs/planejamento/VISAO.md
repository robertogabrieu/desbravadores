# Aplicativo do Desbravador — Visão

## Objetivo

Tirar do papel e do WhatsApp a rotina de domingo do Clube de Desbravadores: a chamada das
unidades, o registro das aulas de classe e o acompanhamento de quem está perto de investir.
De quebra, dar aos DBVs um motivo visível para chegar na hora, de uniforme e com a Bíblia: o
ranking **DBV Destaque**.

O app é bom se, num domingo comum, o conselheiro faz a chamada em menos de 2 minutos no
celular, mesmo sem internet, e o instrutor registra a aula sem voltar ao caderno de papel.

## Para quem

| Perfil | Onde usa | O que faz |
|---|---|---|
| **Adm** (diretoria/secretaria) | Computador | Cadastros, calendário do clube, cronogramas, regras do ranking, permissões, relatórios |
| **Conselheiro** | Celular | Chamada da unidade, histórico de frequência, fotos da unidade |
| **Instrutor** | Celular | Cronograma, registro de aula, progresso, especialidades, materiais, observações |
| **Visitante** (sem login) | Celular | Só o ranking público, com nomes abreviados |

**Uma pessoa, vários papéis.** Uma conta pode ser conselheira de uma unidade e instrutora de uma
classe ao mesmo tempo (comum em clube pequeno). O papel vem da conta — não é escolhido no
login — e quem tem mais de um troca de papel dentro do app.

**Vários clubes.** O sistema nasce separando os dados por clube, mesmo começando com um só. Custa
pouco agora e evita reescrever tudo se outro clube do distrito quiser usar.

## Decisões de produto já tomadas

1. App **separado** do Desbravadores Finance, com a mesma stack e no mesmo servidor. O cadastro de
   DBVs não é compartilhado nesta versão (ver RISCOS, item de cadastro duplicado).
2. Pronto para **vários clubes** desde o início.
3. **Uma conta com vários vínculos**; sem seletor de perfil na tela de login.
4. **Ranking público** mostra só primeiro nome + inicial do sobrenome, sem link para o perfil. O
   DBV tem **autorização de imagem**; sem ela, foto dele não entra na galeria.
5. **Montar cronograma** só no computador nesta versão. No celular o instrutor vê o cronograma.
6. **Frequência**: atraso conta como presença; falta justificada existe e não sofre desconto de
   pontos; o cálculo segue o período escolhido; o limiar do vermelho é configurável (padrão 70%).
7. **Requisito** é feito/não feito; pode ser marcado fora da aula prevista; **pronto para
   investidura = 100%**; o histórico de classe fica guardado por ano do clube.
8. Mudar o valor de um critério do ranking vale **daqui para a frente**; o que já foi lançado não
   muda.
9. **Offline**: chamada da reunião e registro de aula. Nenhuma tela do Adm.
10. Os **cadernos oficiais** (requisitos de todas as classes) vêm carregados no app.

## Escopo do MVP

O MVP é o que faz o domingo funcionar e o Adm conseguir preparar o ano:

- **Fundação**: login por e-mail/senha, convite por e-mail, recuperação de senha, vínculos e
  permissões, cadastros de DBVs, unidades e usuários, cadernos carregados, instalação como PWA.
- **Conselheiro**: Início, Minha unidade, **chamada offline**, histórico (por reunião e por DBV),
  galeria da unidade com upload pela câmera.
- **Instrutor**: Início, Minhas classes, cronograma (leitura), **registro de aula offline**,
  progresso da classe, especialidades, observações, materiais.
- **Adm**: visão geral, desbravadores, usuários e permissões, unidades, classes e especialidades,
  calendário do clube, montar cronograma (com publicação), configuração do ranking.
- **Comum**: ranking DBV Destaque (logado e público), perfil do DBV.
- **Relatórios**: frequência mensal, especialidades mais concluídas, tabela por classe, exportar
  Excel.

## Fica para depois

| Item | Por que espera |
|---|---|
| Montar cronograma no celular | A tela desenhada é de computador; o fluxo de arrastar requisitos no celular precisa de desenho próprio |
| Notificação push no celular | O sino com lista dentro do app resolve o MVP; push exige permissão por aparelho e não funciona igual no iPhone |
| Exportar relatório em PDF | Excel resolve a secretaria; PDF bonito é trabalho de layout |
| Importar planilha de DBVs e calendário da Associação | Com ~60 DBVs, digitar é viável; importação precisa de formato combinado |
| Integração com o Desbravadores Finance (cadastro único de DBVs) | Exige mexer nos dois apps; decidir depois de ver o uso real |
| Tela para o próprio DBV ou para os pais | Não foi pedida; muda o desenho de privacidade |
| Visualizador de fotos avançado (zoom, álbum compartilhável) | Uma visualização simples em tela cheia basta |
| Lançamento de pontos por evento em massa (ex.: todos que foram ao acampamento) | O MVP lança por DBV; em massa é conforto |
| Dark mode | Não desenhado |
| Classes avançadas completas | Entram se os cadernos as trouxerem; senão, o Adm cadastra |

## Como saber que deu certo (3 meses após o lançamento)

- Todas as unidades fazendo a chamada pelo app em pelo menos 3 de cada 4 domingos.
- Todos os instrutores registrando aula pelo app.
- Nenhuma chamada perdida por falta de internet.
- O Adm monta o cronograma do semestre sem planilha paralela.
