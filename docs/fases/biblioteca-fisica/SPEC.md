# Biblioteca: livros físicos e empréstimos — SPEC (rascunho 2)

Estado: **rascunho com as respostas do cliente incorporadas, aguardando aprovação do mockup.** Depois dele vêm duas revisões desta
spec e só então o PLANO. Nenhum código foi tocado.

## O que muda para quem usa

Hoje a Biblioteca é uma estante de PDFs (`docs/fases/biblioteca/SPEC.md`). O clube também tem
livros de papel, requisitos de classe, emprestados em planilha. Passa a existir, na mesma
Biblioteca:

- O **Adm** cadastra um **livro físico** (nome, descrição, categoria, capa, quantidade de
  exemplares), do mesmo jeito que cadastra um PDF.
- **Qualquer Adm, conselheiro ou instrutor** vê se há exemplar disponível e **empresta** para
  **qualquer desbravador do clube**, de qualquer unidade ou classe. A data de devolução já vem
  preenchida com 14 dias depois.
- Quem empresta (ou o Adm) **registra a devolução**.
- O **Adm** vê numa tela só com quem está cada livro, o que está atrasado e o que vence hoje, e
  os atrasados aparecem como pendência na **Visão Geral**, a primeira tela que ele abre.
- Cada desbravador pode estar com **um livro por vez**.
- Fica o **histórico**: quem já pegou cada livro, e quando devolveu.

## Decisões

| # | Decisão | Por quê / alternativa |
|---|---|---|
| D1 | Livro físico é um **item da biblioteca com tipo** (`DIGITAL` ou `FISICO`), não um módulo à parte. Mesma estante, mesmas categorias. | Alternativa: módulo separado. Duplicaria categoria, capa e tela, e o Adm teria duas estantes para arrumar. |
| D2 | **Exemplar** é uma linha própria (Exemplar 1, 2, 3…). Empréstimo e devolução são por exemplar. | Contar só "quantidade" não diria com quem está cada cópia nem qual voltou. |
| D3 | **Empréstimo nunca se apaga.** Devolver preenche a data de devolução; o histórico é o próprio empréstimo. | CLAUDE.md: nunca apagar linha com histórico. |
| D4 | **Atrasado é calculado**, não gravado: tem devolução prevista antes de hoje e ainda não foi devolvido. Sem tarefa agendada. | Evita estado que envelhece sozinho e um job a mais. |
| D5 | **Prazo padrão de 14 dias**, vem preenchido e o emprestador pode mudar a data na hora do empréstimo. | O pedido diz "automaticamente 2 semanas". Editável porque a realidade tem exceção. |
| D6 | Nova permissão **`biblioteca.emprestar`**, padrão ADM, CONSELHEIRO e INSTRUTOR (ajustável por vínculo como as outras). Cadastrar livro físico segue em `biblioteca.gerenciar`. | Emprestar é de toda a diretoria; montar a estante continua só do Adm. |
| D7 | Para escolher o desbravador, uma **busca própria do clube inteiro**, que devolve só nome e unidade. Não reaproveita a lista de desbravadores, que filtra por unidade/classe do papel. | O pedido exige emprestar fora da própria unidade/classe. A busca nova não abre mais nenhum dado da ficha. |
| D8 | **Toda a diretoria** (Adm, conselheiro, instrutor) **vê com quem está** cada exemplar emprestado. *Confirmado pelo cliente.* | Quem empresta precisa saber a quem cobrar. Dado exposto: nome e unidade. |
| D9 | "**Quem já leu**" = tem empréstimo **devolvido** daquele livro. Não há marcação separada de leitura. | Evita um segundo registro que ninguém vai manter. Limite: devolver não prova que leu. |
| D10 | **Tirar exemplar do acervo** (perdido, estragado) é "dar baixa": só o Adm, só se o exemplar não estiver emprestado, e o histórico fica. | Nunca apagar. |
| D11 | Dois empréstimos do mesmo exemplar ao mesmo tempo **não podem existir**: trava no banco e na API. Quem chegou segundo vê "Esse exemplar acabou de ser emprestado". | Dois instrutores abrindo a mesma tela é o caso comum. |
| D13 | **Um livro por desbravador por vez.** A API recusa o segundo empréstimo aberto do mesmo desbravador; a busca mostra o desbravador apagado, com "já está com <livro>". *Confirmado pelo cliente.* | Sem a trava, o limite dependeria de a pessoa lembrar. Trava só na API deixaria a tela oferecer o que vai falhar. |
| D14 | **Atraso não gera aviso**: só aparece na aba Empréstimos e como terceira pendência da Visão Geral do Adm. *Confirmado pelo cliente.* | Notificação ficou de fora a pedido. |
| D12 | Empréstimo e devolução **exigem internet** (aviso padrão `DisponivelComInternet`); não entram no modo sem conexão. | Registro offline de estoque duplicaria exemplar. |

## Regras (tabela de estados do exemplar)

| Situação do exemplar | Aparece como | Ações |
|---|---|---|
| Sem empréstimo aberto, não baixado | Disponível | Emprestar |
| Empréstimo aberto, devolução prevista de hoje em diante | Emprestado até DD/MM | Devolver |
| Empréstimo aberto, devolução prevista antes de hoje | Atrasado há N dias | Devolver |
| Baixado | não aparece na estante; aparece no histórico | nenhuma |

- Livro com **zero exemplares disponíveis** mostra "Todos emprestados" e o botão Emprestar fica
  desligado, com o motivo escrito ao lado (não só apagado).
- Devolução prevista não pode ser **antes** da data do empréstimo. Data do empréstimo não pode ser
  futura.
- Um desbravador tem **no máximo um empréstimo aberto** (D13). Trava no banco (único parcial por desbravador) e na API; devolver libera. A resposta de recusa diz com qual livro ele está.
- Desbravador inativo não aparece na busca para empréstimo novo; o empréstimo que já tinha continua
  visível e devolvível.
- Data é de calendário (sem hora), no fuso do clube. "Hoje" vem do servidor, nunca do relógio do
  aparelho.

## Dados (proposta)

- `ItemBiblioteca` ganha `tipo` e `arquivoId` passa a ser opcional (só digital tem PDF). Livro físico
  usa capa como hoje.
- `ExemplarBiblioteca`: `clubeId`, `itemId`, `numero`, `baixadoEm?`, `baixadoPorId?`.
- `EmprestimoBiblioteca`: `clubeId`, `exemplarId`, `desbravadorId`, `emprestadoEm`, `devolverAte`,
  `devolvidoEm?`, `emprestadoPorId`, `devolvidoPorId?`. Único parcial: um empréstimo aberto por
  exemplar.
- Todas as operações levam `clubeId`; `include` aninhado de exemplares/empréstimos entra nos testes
  de isolamento (CLAUDE.md). Modelos novos entram em `MODELOS_DE_CLUBE` na mesma migration.

## API (proposta)

| Rota | Permissão | O que faz |
|---|---|---|
| `GET /biblioteca` (já existe) | `@Logado` | passa a trazer o tipo e, nos físicos, disponíveis/total |
| `POST /biblioteca/itens` (já existe) | `biblioteca.gerenciar` | aceita `tipo: FISICO` com quantidade |
| `POST /biblioteca/itens/:id/exemplares` e `POST .../exemplares/:id/baixa` | `biblioteca.gerenciar` | acrescenta exemplar; dá baixa |
| `GET /biblioteca/itens/:id/exemplares` | `@Logado` | exemplares, com quem estão, devolução prevista, histórico |
| `POST /biblioteca/emprestimos` | `biblioteca.emprestar` | empresta (exemplar, desbravador, datas) |
| `POST /biblioteca/emprestimos/:id/devolucao` | `biblioteca.emprestar` | registra a devolução |
| `GET /biblioteca/emprestimos` | `@Logado` com `biblioteca.emprestar` | abertos, atrasados, filtro (D8: toda a diretoria vê; só o Adm tem a aba, os demais veem pelo livro) |
| `GET /biblioteca/desbravadores?busca=` | `biblioteca.emprestar` | busca do clube todo (D7) |

Recurso de outro clube ou inexistente responde 404. Toda escrita pega o `travarBiblioteca` que já
existe.

## Telas (alvo: `mockup` aprovado, vence a spec em caso de divergência)

1. **Biblioteca, Adm, aba "Livros físicos"**: mesma estante de cartões; cada cartão mostra
   disponibilidade ("2 de 3 disponíveis") e o botão primário é **Emprestar**.
2. **Biblioteca, Adm, aba "Empréstimos"**: tabela com quem está com o quê; atrasados no topo.
3. **Biblioteca no celular (conselheiro/instrutor)**: alternador "Digitais | Físicos", busca por nome.
4. **Detalhe do livro físico**: exemplares um por um, com Emprestar / Devolver.
5. **Diálogo Emprestar**: busca do desbravador, data do empréstimo (hoje), devolver até (+14).
6. **Diálogo Adicionar livro físico**: escolha do tipo, quantidade de exemplares.
7. **Diálogo Devolver**: confirma e mostra se estava atrasado.
8. **Visão Geral do Adm**: terceiro cartão em Pendências, "Livros atrasados", no formato dos dois que já existem (`docs/fases/visao-geral-adm/mockup.html:159-171`). Bloco sem atraso mostra "Nenhum livro atrasado"; clube sem livro físico não mostra o cartão. Os campos novos vêm do servidor, como os outros (decisão D3 daquela spec), e a lista é a de atrasados com livro, desbravador, unidade e dias.

Telas irmãs usadas como base: `TelaBiblioteca.tsx` (cabeçalho, seção por categoria, grade de
cartões), `CartaoDoItem.tsx` (capa 3:4, botões), `DialogosDaBiblioteca.tsx` (diálogos). Desvios:
abas no topo (a tela de hoje não tem abas) e uma tabela (não há tabela na Biblioteca); a tabela
parte da listagem de desbravadores do Adm.

## Descobribilidade (as quatro perguntas)

- **Pré-requisito.** Para emprestar: livro físico cadastrado com ao menos 1 exemplar, e
  desbravador cadastrado e ativo. Se o clube não tem livro físico, o Adm vê "Cadastre o primeiro
  livro físico" com o botão; conselheiro/instrutor vê "O Adm ainda não cadastrou livros físicos".
- **Vazio.** Aba Físicos vazia: texto acima. Aba Empréstimos vazia: "Nenhum livro emprestado agora".
  Busca sem resultado: "Nenhum desbravador com esse nome" e o botão de limpar.
- **Bloqueio.** "Todos emprestados" é estado impossível (texto basta, mostra quando volta o próximo).
  "Sem permissão para emprestar" não aparece: quem não tem a permissão não vê o botão.
- **Perfil e escopo.** Adm: tudo. Conselheiro/instrutor: ver, emprestar e devolver, sem cadastrar,
  sem baixa e sem a aba Empréstimos (D8: veem o "com quem" no detalhe do livro). Outro clube: 404.

## Fora de escopo

- Renovar empréstimo, multa, reserva de livro, fila de espera.
- Aviso automático de atraso (e-mail/notificação), a pedido do cliente.
- Código de barras / etiqueta de exemplar.
- Importar a planilha atual: o cliente tem poucos livros e prefere cadastrar à mão.
- Livro físico sem categoria; empréstimo para quem não é desbravador do clube.

## Respostas do cliente

1. Toda a diretoria vê com quem está o livro (D8).
2. O Adm não precisa de aviso; só ver no sistema, com destaque na Visão Geral (D14, tela 8).
3. Um livro por desbravador por vez (D13).
4. Sem importação da planilha.

## Critério de pronto (rascunho)

- Migration, lint, tipos e suítes da API e do web passando; e2e verde no CI.
- Teste de isolamento: exemplar e empréstimo de outro clube nunca aparecem, inclusive por `include`.
- Teste de concorrência: dois empréstimos simultâneos do mesmo exemplar, um falha com mensagem.
- Teste de permissão: conselheiro e instrutor emprestam para desbravador de outra unidade/classe;
  nenhum dos dois cadastra, dá baixa ou abre a aba Empréstimos.
- Teste do limite: segundo empréstimo do mesmo desbravador é recusado, com o título do livro que ele já tem; depois de devolver, o empréstimo passa.
- Visão Geral: cartão de atrasados aparece só com livro físico no clube, só traz empréstimo do próprio clube, e o número do selo bate com a aba Empréstimos (mesma função calcula os dois).
- Medido no DOM em 390, 820 e 1280 px, sem rolagem lateral.
- Cada tela do mockup vira item do roteiro de QA.

## ONDE FICA

```
- tela da Biblioteca (cabeçalho, seção, grade)  apps/web/src/modulos/biblioteca/TelaBiblioteca.tsx:32-103, :105-184
- cartão do item e capa                          apps/web/src/modulos/biblioteca/CartaoDoItem.tsx:14-62
- modelos de biblioteca                          apps/api/prisma/schema.prisma:1206, :1224
- rotas e permissões da biblioteca               apps/api/src/biblioteca/biblioteca.controller.ts:33-126
- lock do clube                                  apps/api/src/biblioteca/constantes.ts:7
- permissões (catálogo)                          packages/shared/src/permissoes.ts:12, :31
- contratos de biblioteca                        packages/shared/src/contratos/biblioteca.ts
- lista de desbravadores e escopo por papel      apps/api/src/desbravadores/desbravadores.controller.ts:23 ; escopo.service.ts
- atrasos/pendências do Adm (padrão)             apps/api/src/visao-geral/
- spec da biblioteca atual e mockups             docs/fases/biblioteca/SPEC.md ; docs/fases/biblioteca/modelo/
- conferido em                                   4fe1c9c (ponteiros vindos do mapeamento; ainda não reconferidos linha a linha)
```
