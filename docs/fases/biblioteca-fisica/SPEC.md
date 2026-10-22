# Biblioteca: livros físicos e empréstimos — SPEC (rascunho 4, após as revisões 1 e 2)

Estado: mockup e rascunho 2 aprovados pelo cliente. Este rascunho corrige as revisões 1 (3 revisores:
factual, desenho/segurança, completude) e 2 (conferência dos consertos; desenho contra contrato). O mockup
ganhou correções de coerência (números entre telas, nomes de unidade, devolução só de leitura) e a tela 9
(estados). Falta o PLANO. **Nenhum código foi tocado.**

O desenho aprovado está em [`modelo/Biblioteca-Fisica.html`](modelo/Biblioteca-Fisica.html) (9 telas).
**Ele é o alvo:** se esta spec e o desenho divergirem, vale o desenho. Dele se copia estrutura, ordem e
texto, nunca CSS: as classes saem dos tokens e de `apps/web/src/ui/` (`Cartao`, `Botao`, `EstadoVazio`,
`MenuCabecalho`, `EstadosDeCarga`).

**Glossário.** "Diretoria" nesta spec são os três papéis de acesso (Adm, conselheiro, instrutor),
não o tipo de pessoa `DIRETORIA` da ficha do desbravador. "Quem pode emprestar" = quem tem a permissão
`biblioteca.emprestar`.

## O que muda para quem usa

Hoje a Biblioteca é uma estante de PDFs (`docs/fases/biblioteca/SPEC.md`). O clube também tem livros de
papel, requisitos de classe, emprestados em planilha. Passa a existir, na mesma Biblioteca:

- O **Adm** cadastra um **livro físico** (nome, descrição, categoria, capa, quantidade de exemplares).
- **Qualquer um da diretoria** vê se há exemplar disponível e **empresta** para **qualquer desbravador
  do clube**, de qualquer unidade ou classe. A data de devolução é calculada pelo sistema, sempre 14
  dias depois do empréstimo, e quem empresta não a escolhe.
- **Qualquer um da diretoria** registra a devolução.
- Toda a diretoria vê **com quem está** cada exemplar emprestado.
- O **Adm** tem uma aba com todos os empréstimos, os atrasados no topo, e os atrasados aparecem como
  pendência na **Visão Geral**.
- Cada desbravador fica com **um livro por vez**.
- Fica o **histórico**: quem já devolveu cada livro, e quando.

## Decisões

| # | Decisão | Por quê / alternativa |
|---|---|---|
| D1 | Livro físico é um **item da biblioteca com tipo** (`DIGITAL` ou `FISICO`), não módulo à parte. Mesma estante, mesmas categorias. | Módulo separado duplicaria categoria, capa e tela, e o Adm teria duas estantes. |
| D2 | **Exemplar** é uma linha própria (Exemplar 1, 2, 3…). Empréstimo e devolução são por exemplar. O número do exemplar novo é o maior já usado + 1, **contando os baixados**. | Só "quantidade" não diria com quem está cada cópia. Reaproveitar número de baixado confunde o histórico. |
| D3 | **Empréstimo nunca se apaga.** Devolver preenche a data de devolução. | CLAUDE.md: nunca apagar linha com histórico. |
| D4 | **Atraso é calculado**, não gravado, por **uma função só** em `packages/shared` (`situacaoDoEmprestimo(devolverAte, hoje)`), usada pela aba, pelo detalhe e pela Visão Geral. Devolve `NO_PRAZO`, `VENCE_HOJE` ou `ATRASADO` com os dias. Textos na seção "Textos". Sem tarefa agendada. | Duas cópias do cálculo divergem na primeira mudança. |
| D5 | **Prazo fixo de 14 dias**, só de leitura. O servidor grava `devolverAte = emprestadoEm + 14 dias`; o contrato de empréstimo **não tem campo de devolução**. Os 14 dias são uma constante única em `packages/shared`, com uma função de somar dias em data de calendário. *Definido pelo cliente.* | Prazo editável daria a cada emprestador uma regra, e "atrasado" deixaria de significar o mesmo. |
| D6 | Permissão nova **`biblioteca.emprestar`**, padrão ADM, CONSELHEIRO e INSTRUTOR, ajustável por vínculo como as outras. Cadastrar, dar baixa e remover seguem em `biblioteca.gerenciar`. Clubes já criados recebem o padrão sozinhos (o padrão é calculado no código, não gravado). | Emprestar é de toda a diretoria; montar a estante é do Adm. |
| D7 | **Busca própria de desbravadores** para empréstimo, do clube inteiro. Recorte fixo: mesmo clube, `ativo`, tipo `DBV`, mínimo 2 letras, no máximo 20 resultados. Devolve só `id`, `nome` (não o nome público), unidade atual (ou "sem unidade"), `entradaEm` e o livro que ele já tem em aberto, se tiver. Quem já tem livro vem na lista, apagado, com o motivo. | A lista existente filtra por unidade/classe do papel (`escopo.service.ts`); a busca nova não abre nenhum dado da ficha. |
| D8 | **Toda a diretoria vê com quem está** cada exemplar emprestado e quem já devolveu (nome e unidade), pelo detalhe do livro. A rota exige `biblioteca.emprestar`. *Confirmado pelo cliente.* | Quem empresta precisa saber a quem cobrar. A rota exige a permissão para quem tiver o ajuste desligado não ver os nomes. |
| D9 | "**Quem já leu**" = já **devolveu** aquele livro; uma linha por desbravador (a mais recente). O limite (devolver não prova leitura) fica escrito na tela, em ajuda curta. | Evita um segundo registro que ninguém manteria. |
| D10 | **Dar baixa** em exemplar (perdido, estragado): só quem tem `biblioteca.gerenciar`, só se não estiver emprestado. O histórico fica. Não há desfazer baixa nesta fase. | Nunca apagar. |
| D11 | **Dois empréstimos do mesmo exemplar não coexistem.** | Dois instrutores abrindo a mesma tela é o caso comum. |
| D12 | Empréstimo e devolução **exigem internet** (`DisponivelComInternet`); não entram no modo sem conexão. | Registro offline de estoque duplicaria exemplar. |
| D13 | **Um livro por desbravador por vez.** A busca mostra o desbravador apagado, com "já está com <livro>". *Confirmado pelo cliente.* | Só travar na API faria a tela oferecer o que vai falhar. |
| D14 | **Atraso não gera aviso**: aparece na aba Empréstimos e na Visão Geral. *Confirmado pelo cliente.* | Pedido do cliente. |
| D15 | **Como as garantias funcionam.** Toda escrita nova (emprestar, devolver, baixar, acrescentar exemplar, remover livro) roda no método `escrever` do serviço, que toma o lock do clube; **as conferências ficam dentro dele** (exemplar livre, não baixado, desbravador sem livro). Os dois índices únicos parciais (um aberto por exemplar; um aberto por desbravador) são a garantia final: se um escapar, o erro do banco vira 409 com a mesma mensagem, nunca 500. O mapeamento do erro para 409 acontece **fora** da transação (violação de índice aborta a transação), e a mensagem "já está com <livro>" exige uma leitura depois. | O lock é por clube (serializa empréstimos do clube inteiro, aceitável na escala do clube); o índice é o que não depende de ninguém ter lembrado. |
| D16 | **Devolução por qualquer um da diretoria** com a permissão, não só por quem emprestou. A devolução registra quem devolveu. | O instrutor de plantão recebe o livro que o conselheiro emprestou. |
| D17 | **`devolvidoEm` é sempre o "hoje" do servidor**, só de leitura no diálogo. **`emprestadoEm`**: padrão hoje, pode ser até **60 dias antes**, nunca futura, e não anterior à entrada do desbravador no clube. | Data livre demais cria atraso fictício de anos. |
| D18 | **Remover livro físico**: só `biblioteca.gerenciar`, recusado se houver exemplar emprestado ("Devolva os exemplares antes de remover"). Com tudo devolvido, o livro sai da estante (remoção suave) e **o histórico fica**. | Remover com empréstimo aberto deixaria o livro fora da estante e o atraso preso na Visão Geral. |
| D19 | **Desbravador inativado, ou que deixou de ser DBV, com livro em aberto**: o empréstimo continua aberto, devolvível e conta como atrasado, com "(inativo)" ou "(inativa)" ao lado do nome (campo `desbravadorAtivo` nas saídas). A unidade mostrada é sempre a **atual** (inativado fica "sem unidade"), não a da época. | Sumir dos atrasados esconderia um livro que ainda está fora. |
| D20 | O **cartão** da estante: "Emprestar" abre o diálogo já com o **menor número de exemplar livre**; "Exemplares" abre o detalhe, onde se escolhe o exemplar. | O diálogo do mockup mostra "Exemplar 1". |

## Regras

### Estados do exemplar

| Situação | Aparece como | Ações permitidas |
|---|---|---|
| Sem empréstimo aberto, não baixado | Disponível | Emprestar; baixa (gerenciar) |
| Empréstimo aberto, devolução depois de hoje | "No prazo" (tabela) ou "Emprestado até DD/MM" (detalhe) | Devolver |
| Empréstimo aberto, devolução hoje | "Vence hoje" | Devolver |
| Empréstimo aberto, devolução antes de hoje | Atrasado há N dias | Devolver |
| Baixado | Fora da estante e do total; só no histórico | nenhuma |

### O que a API recusa (e o texto da mensagem)

| Tentativa | Resposta | Mensagem |
|---|---|---|
| Emprestar exemplar já emprestado (inclusive perdendo a corrida) | 409 | "Esse exemplar acabou de ser emprestado." |
| Emprestar exemplar baixado | 409 | "Esse exemplar foi retirado do acervo." |
| Emprestar a desbravador que já tem livro | 409 | "<Nome> já está com <livro>. Peça a devolução antes." |
| Emprestar a desbravador inativo, de outro clube ou que não é DBV | 404 | "Desbravador não encontrado." |
| Exemplar de outro clube, ou que não pertence ao item da URL | 404 | "Livro não encontrado." |
| Data do empréstimo futura ou com mais de 60 dias | 400 | "Escolha uma data de hoje até 60 dias atrás." |
| Devolver empréstimo já devolvido | 409 | "Este livro já foi devolvido." |
| Dar baixa em exemplar emprestado | 409 | "Esse exemplar está emprestado. Registre a devolução antes." |
| Dar baixa em exemplar já baixado | 409 | "Esse exemplar já foi retirado." |
| Remover livro com exemplar emprestado | 409 | "Devolva os exemplares antes de remover." |
| Data do empréstimo anterior à entrada do desbravador | 400 | "Essa data é anterior à entrada de <Nome> no clube." |
| Livro físico removido, ou id de outro clube, em qualquer rota | 404 | "Livro não encontrado." |
| Quantidade fora de 1 a 50, ou que passe de 50 exemplares ativos no livro | 400 | "Um livro pode ter de 1 a 50 exemplares." |
| Enviar qualquer campo de devolução na criação de empréstimo | 400 | (contrato recusa campo desconhecido) |
| Falta de permissão em qualquer rota | 403 | (mensagem padrão do app) |

### Números e datas

- Datas de empréstimo, devolução prevista e devolução são **datas de calendário** (sem hora), no
  fuso do clube. "Hoje" vem do servidor (`hojeNoFuso`), nunca do relógio do aparelho.
- Total do cartão = exemplares **não baixados**. Zero exemplares ativos mostra "Sem exemplares" e
  desliga Emprestar com o motivo escrito.
- Quantidade ao cadastrar: de 1 a 50.

## Dados (proposta)

- `ItemBiblioteca` ganha `tipo` (`DIGITAL` por padrão, para as linhas que já existem) e `arquivoId`
  passa a aceitar nulo. **Restrição no banco: `tipo = FISICO` se e somente se `arquivoId` é nulo.**
- `ExemplarBiblioteca`: `clubeId`, `itemId`, `numero`, `baixadoEm?`, `baixadoPorId?`. Único
  `(itemId, numero)`.
- `EmprestimoBiblioteca`: `clubeId`, `exemplarId`, `desbravadorId`, `emprestadoEm`, `devolverAte`
  (gravada pelo servidor), `devolvidoEm?`, `emprestadoPorId`, `devolvidoPorId?`. Dois únicos parciais
  **onde `devolvidoEm` é nulo**: um por `exemplarId`, um por `desbravadorId`.
- Os dois modelos novos levam `@@unique([clubeId, id])` e FKs compostas por `clubeId`, como os demais, e
  entram em `MODELOS_DE_CLUBE` **na mesma migration**.
- Toda relação aninhada de exemplar ou empréstimo leva `where: { clubeId }` (o `include` aninhado não
  passa pela guarda de clube).

## Contratos (`packages/shared`)

- `ItemBibliotecaSaida` vira **união por `tipo`**: `DIGITAL` mantém `bytes`, `urlLer`, `urlBaixar`;
  `FISICO` traz `total` e `disponiveis` e nenhum dos três. Os dois têm `capaUrl`.
- Constante `PRAZO_DE_EMPRESTIMO_EM_DIAS = 14`, função de somar dias a data de calendário
  (`datas.ts` só tem `hojeNoFuso`, `idade`, `anoClube` hoje) e `situacaoDoEmprestimo`.
- Contrato da Visão Geral: campo novo `livrosAtrasados`, `null` quando o clube **não tem livro físico**
  (o cartão some) ou `{ total, itens }` com no máximo 5 itens e `total` real ("E mais N" quando passa).
  `total: 0` mostra "Nenhum livro atrasado".

## API (proposta)

| Rota | Decorador | O que faz |
|---|---|---|
| `GET /biblioteca` (existe) | `@Logado` | itens por categoria; físico traz só `total` e `disponiveis`, **sem nomes de pessoas** |
| `POST /biblioteca/itens-fisicos` | `@Pode('biblioteca.gerenciar')` | cria livro físico (JSON: nome, descrição, categoria, quantidade); a capa vai depois, pela rota de capa que já existe, como no livro digital |
| `POST /biblioteca/itens/:id/exemplares` | `@Pode('biblioteca.gerenciar')` | acrescenta exemplares |
| `POST /biblioteca/itens/:id/exemplares/:exemplarId/baixa` | `@Pode('biblioteca.gerenciar')` | dá baixa |
| `GET /biblioteca/itens/:id/exemplares` | `@Pode('biblioteca.emprestar')` | exemplares, com quem estão, devolução prevista e quem já devolveu (D8) |
| `POST /biblioteca/emprestimos` | `@Pode('biblioteca.emprestar')` | empresta (exemplar, desbravador, data do empréstimo) |
| `POST /biblioteca/emprestimos/:id/devolucao` | `@Pode('biblioteca.emprestar')` | registra a devolução |
| `GET /biblioteca/emprestimos` | `@Pode('biblioteca.gerenciar')` | aba do Adm: abertos, atrasados, filtro |
| `GET /biblioteca/desbravadores` | `@Pode('biblioteca.emprestar')` | busca do D7 |
| `DELETE /biblioteca/itens/:id` (existe) | `biblioteca.gerenciar` | ganha a regra D18 |

Rotas irmãs do item que **não mudam** para livro físico (usam `exigirItemAtivo`): renomear/editar,
trocar e tirar capa, mover. O `tipo` não se altera depois de criado; editar ignora o campo. Recurso de
outro clube ou inexistente responde 404.

A Visão Geral é só do Adm (`relatorio.geral`, que o Adm sempre tem); o campo `livrosAtrasados` vem para
ele. Cada item traz `emprestimoId`, título do livro, nome do desbravador, `desbravadorAtivo`, unidade e
dias de atraso.

## O que o campo `arquivoId` nulo quebra no que já existe (a mudança precisa tratar cada um)

| Onde | O problema |
|---|---|
| `biblioteca.service.ts:455-466` (`saidaDoItem`) | lê `arquivo.bytes` e assina `urlLer`/`urlBaixar`; chamada por listar, renomear, editar, tirar e gravar capa, gravar item |
| `biblioteca.service.ts:55-60` (SELECT) e `:74-77` (`LinhaDoItem`) | pedem `arquivo{bytes,caminho}` e tipam `arquivo` como obrigatório; raiz dos pontos desta tabela |
| `biblioteca.service.ts:204-205` (criar item) | exige PDF ("Envie o arquivo."): o livro físico tem **método e rota próprios** (`itens-fisicos`), não reaproveita esta |
| `biblioteca.service.ts:276-290` (`removerItem`) | lê `arquivo.caminho` |
| `materiais/limpeza-de-materiais.ts:58-70` | lê `item.arquivo.caminho` na limpeza de itens removidos |
| `contratos/biblioteca.ts:32-45` | exige `bytes`, `urlLer`, `urlBaixar` |
| `CartaoDoItem.tsx:45-49` | renderiza Ler e Baixar sempre |
| `api/biblioteca.ts:127` e `testes/handlers/biblioteca.ts:10-11` | validam a resposta com o contrato; dados de teste |
| `biblioteca.spec.ts:115,268,710` | tipos (o Jest não checa; quebra no `npm run tipos`) |

## Telas

1. **Biblioteca, Adm**: abas **Livros digitais | Livros físicos | Empréstimos**. As duas primeiras
   mostram todas as categorias (categoria sem item do tipo diz "Nenhum item nesta categoria"); para
   conselheiro e instrutor, categoria sem item do tipo é escondida, em cada aba.
2. **Empréstimos (Adm)**: tabela com atrasados no topo, filtro e botão Devolver por linha.
3. **Biblioteca no celular (diretoria)**: alternador Digitais | Físicos, busca por nome na aba Físicos.
   Os quatro estados (carregando, vazio, erro, sem conexão) valem para as duas abas.
4. **Detalhe do livro físico**: cada exemplar com situação e ação; "Quem já leu" e o aviso do D9.
5. **Diálogo Emprestar**: busca, data do empréstimo (padrão hoje) e "devolver até" **só de leitura**.
6. **Diálogo Adicionar à biblioteca**: escolha do tipo no topo. Só o tipo físico troca PDF por quantidade.
7. **Diálogo Devolver**: "Devolvido em" só de leitura (hoje), com o aviso de atraso.
8. **Visão Geral do Adm**: terceiro cartão em Pendências, "Livros atrasados", **empilhado** como os dois
   que existem (`Pendencias.tsx`). Tocar na linha ou em "E mais N" abre a aba Empréstimos já filtrada em
   "Atrasados".
9. **Estados**: carregando, vazio (nada cadastrado; busca sem resultado), erro e sem conexão, em todas as
   telas de celular e nos diálogos Emprestar e Devolver (que ficam desligados sem internet).

### Comportamentos que o desenho não mostra

- **Empréstimo sempre nasce de um livro**: do cartão ("Emprestar") ou do exemplar no detalhe. Não há botão
  "Registrar empréstimo" no cabeçalho da aba.
- **Detalhe do livro** tem URL própria (`/biblioteca/livros/:id`) e carrega pela rota de exemplares, que
  também devolve o cabeçalho do item (nome, descrição, categoria, capa, `total`, `disponiveis`).
- **Adm no detalhe**: botão "Acrescentar exemplares" no topo e "Dar baixa" em cada exemplar disponível,
  cada um com diálogo de confirmação. **"Opções" do cartão físico**: Editar, Mover para cima/baixo,
  Remover (com a recusa do D18), igual ao cartão digital.
- **Capa** do livro físico segue o passo de hoje: o diálogo cria o livro e depois oferece enviar a capa.
- **Abas** valem para o Adm em qualquer largura; o alternador Digitais | Físicos é de quem não tem
  `biblioteca.gerenciar`.
- Quem empresta ou devolve vê as mensagens de recusa dentro do próprio diálogo, junto do botão.
- `emprestadoPorId`, `devolvidoPorId`, `baixadoPorId` ficam só para auditoria; nenhuma tela os mostra.

Telas irmãs de base: `TelaBiblioteca.tsx` (cabeçalho, seção, grade), `CartaoDoItem.tsx`,
`DialogosDaBiblioteca.tsx`, `Pendencias.tsx` (`CartaoDePendencia`). **Desvios** e por quê: abas no topo
(a tela de hoje tem uma lista só e agora há três conjuntos); alternador no celular (no celular a aba não
cabe); tabela na aba Empréstimos (não há tabela na Biblioteca; vem da listagem de desbravadores do Adm);
diálogo com escolha de tipo (os dois tipos têm campos diferentes); pendências empilhadas na Visão Geral
(igual às irmãs, sem desvio); detalhe do livro (o cartão não cabe
a lista de exemplares). Textos que mudam: o vazio "colocar o primeiro PDF" (`TelaBiblioteca.tsx:102`)
passa a falar do tipo da aba.

## Aba Empréstimos: contrato

`GET /biblioteca/emprestimos?situacao=&busca=` devolve `{ totais, itens }`:

- `totais`: `emprestados`, `atrasados`, `vencemHoje` (os três chips). O selo "N atrasados" na aba vem do
  mesmo `totais`, buscado também com a aba fechada; some quando é 0.
- `itens`: `emprestimoId`, título do livro, `numeroDoExemplar`, nome do desbravador, `desbravadorAtivo`,
  unidade atual, `emprestadoEm`, `devolverAte`, `situacao` e `dias`.
- Ordem: do mais atrasado ao mais no prazo, empate pela data de devolução. Filtro `situacao`: todas,
  atrasados, vencem hoje, no prazo. A busca procura no título do livro e no nome do desbravador.

## Textos (cópia exata)

| Onde | Texto |
|---|---|
| Disponibilidade | "N de M disponíveis" (M > 1) ou "1 de 1 disponível"; "Todos emprestados"; "Sem exemplares" |
| Situação | "No prazo"; "Vence hoje"; "Atrasado há 1 dia" / "Atrasado há N dias" |
| Resumo da aba Físicos | "N livros físicos · M exemplares disponíveis" (singular com 1) |
| Pendência da Visão Geral | título "Livros atrasados"; em dia: "Nenhum livro atrasado."; dias: "1 dia" / "N dias" |
| Busca do desbravador | "Digite ao menos 2 letras"; "Nenhum desbravador com esse nome" + botão "Limpar a busca"; linha apagada: "já está com “<livro>”. Peça a devolução antes." |
| Diálogo Emprestar | título "Emprestar “<livro>”"; "Exemplar N · disponível"; "A devolução é sempre 14 dias depois do empréstimo. Esta data não pode ser alterada."; botão "Registrar empréstimo" |
| Diálogo Devolver | título "Registrar devolução"; "“<livro>”, exemplar N, volta de <Nome> (<unidade>)."; no prazo: sem aviso; atrasado: "Devolução prevista para DD/MM: N dias de atraso." (singular "1 dia de atraso"); botão "Registrar devolução" |
| Diálogo Adicionar | "Cada exemplar vira uma linha para emprestar e devolver. Você pode acrescentar mais depois." |
| Detalhe | "Aparece quem já devolveu o livro. Devolver não prova que leu."; vazio do histórico: "Ninguém devolveu este livro ainda." |

## Descobribilidade (as quatro perguntas)

- **Pré-requisito.** Para emprestar: livro físico com ao menos 1 exemplar ativo, e desbravador ativo. Sem
  livro físico: o Adm vê "Cadastre o primeiro livro físico" com o botão; os demais, "O Adm ainda não
  cadastrou livros físicos".
- **Vazio.** Físicos vazia: texto acima. Empréstimos vazia: "Nenhum livro emprestado agora". Busca
  sem resultado: "Nenhum desbravador com esse nome" e botão de limpar.
- **Bloqueio.** Cartão com **0 disponíveis** é um estado real: pílula "Todos emprestados", Emprestar desligado e o motivo escrito; "Sem exemplares" (todos baixados) igual. Desbravador
  que já tem livro aparece apagado com o motivo, não some.
- **Perfil e escopo.** Adm: tudo. Conselheiro/instrutor: ver, emprestar, devolver e ver com quem está;
  sem cadastrar, baixa, remover nem a aba Empréstimos (a rota responde 403, como toda rota `@Pode`). Sem
  `biblioteca.emprestar` (ajuste do vínculo): o cartão físico mostra só a pílula de disponibilidade, sem
  "Emprestar" nem "Exemplares", e a rota de exemplares responde 403. Outro clube: 404.

## Fora de escopo

- Renovar empréstimo, multa, reserva, fila de espera; aviso de atraso; código de barras.
- Importar a planilha atual (o cliente tem poucos livros).
- Desfazer baixa e desfazer devolução; trocar o tipo de um livro depois de criado.
- Livro físico sem categoria; empréstimo a quem não é desbravador do clube.

## Critério de pronto

- Migration (próxima depois de `20261013120000_passkeys`), `MODELOS_DE_CLUBE` na mesma entrega, lint,
  tipos (`npm run tipos`) e suítes de API e web passando; e2e verde no CI.
- **Testes que mudam por causa da entrega:** `permissoes.test.ts:6-7` e `permissoes.spec.ts:20,26`
  (catálogo de 25 para 26), `guarda-clube.spec.ts:70-90` (lista de modelos), `biblioteca.spec.ts`,
  `biblioteca.test.tsx`, handlers do web e `e2e/adm.spec.ts:253` (se o botão mudar de nome).
- Isolamento: exemplar, empréstimo e busca de outro clube nunca aparecem, nem por `include`.
- Concorrência: dois empréstimos do mesmo exemplar, um falha com a mensagem; dois empréstimos de
  **exemplares diferentes** ao mesmo desbravador, um falha com a mensagem (não 500); baixa cruzando
  com empréstimo; devolução dupla.
- Permissão: conselheiro e instrutor emprestam para desbravador de outra unidade e classe; nenhum
  cadastra, dá baixa, remove nem lê `GET /biblioteca/emprestimos` (403); com o ajuste desligado,
  também não leem `GET .../exemplares` nem a busca.
- Prazo: o contrato recusa campo de devolução; empréstimo de 21/10 devolve até 04/11; a constante e a
  função de atraso são as mesmas na API e na tela.
- Livro físico: listar, editar, trocar capa, remover e limpar arquivos não quebram sem PDF.
- Visão Geral: cartão só com livro físico no clube; o selo bate com a aba Empréstimos; mais de 5
  atrasados mostra "E mais N".
- Medido no DOM em 390, 820 e 1280 px, sem rolagem lateral, nas telas 1 a 8.
- Cada tela do mockup vira item do roteiro de QA. A semente de QA precisa de: um livro físico com 3
  exemplares, um emprestado no prazo, um atrasado, desbravadores de unidades diferentes, e um usuário
  conselheiro e um instrutor com a permissão padrão.
- README (linhas 81 e 139) deixa de descrever a biblioteca só como estante de PDFs.

## ONDE FICA

```
- modelos de biblioteca                          apps/api/prisma/schema.prisma:1246 (Categoria), :1263 (Item)
- serviço: lock do clube (escrever)              apps/api/src/biblioteca/biblioteca.service.ts:385-392 ; constantes.ts:7
- serviço: saída do item, remover item           biblioteca.service.ts:455-466, :276-290
- limpeza de itens removidos                     apps/api/src/materiais/limpeza-de-materiais.ts:58-70
- controller e decoradores                       apps/api/src/biblioteca/biblioteca.controller.ts:33-126
- contrato de biblioteca                         packages/shared/src/contratos/biblioteca.ts:19-45
- permissões (catálogo) e testes                 packages/shared/src/permissoes.ts:12-48 ; permissoes.test.ts:6-7 ; apps/api/src/permissoes/permissoes.spec.ts:20,26
- modelos de clube e teste                       apps/api/src/comum/prisma/guarda-clube.ts:4-50 ; guarda-clube.spec.ts:70-90
- datas do shared                                packages/shared/src/datas.ts:30 (hojeNoFuso)
- escopo da lista de desbravadores               apps/api/src/desbravadores/escopo.service.ts:60-64 ; desbravadores.controller.ts:23
- visão geral: serviço, controller, contrato     apps/api/src/visao-geral/visao-geral.service.ts:90-136 ; visao-geral.controller.ts:10 ; packages/shared/src/contratos/visao-geral.ts
- visão geral: pendência no front                apps/web/src/modulos/adm/visao-geral/Pendencias.tsx:10,24,112-120 ; testes/handlers/visao-geral.ts
- tela, cartão, diálogos da biblioteca           apps/web/src/modulos/biblioteca/TelaBiblioteca.tsx ; CartaoDoItem.tsx:14-62 ; DialogosDaBiblioteca.tsx
- cliente da API e mocks                         apps/web/src/api/biblioteca.ts:127 ; apps/web/src/testes/handlers/biblioteca.ts:10-11
- spec e mockups da biblioteca de hoje           docs/fases/biblioteca/SPEC.md ; docs/fases/biblioteca/modelo/
- mockup desta fase                              docs/fases/biblioteca-fisica/modelo/Biblioteca-Fisica.html
- pendências da visão geral (mockup)             docs/fases/visao-geral-adm/mockup.html:159-171
- última migration                               apps/api/prisma/migrations/20261013120000_passkeys
- conferido em                                   12edca5 (ponteiros reconferidos pela revisão 1)
```
