# Biblioteca do clube — SPEC

Hoje o clube não tem onde guardar o que a liderança consulta o ano inteiro: cadernos de classe,
livros, manuais, comunicados. O que existe é o material **de cada classe** (`Material`,
`schema.prisma:1128-1151`), enviado por instrutor e Adm e preso a uma classe. Esta SPEC cria a
**Biblioteca**: uma estante de PDFs com capa, dividida em categorias, que **o Adm do clube monta** e
que **toda a liderança do clube** (Adm, conselheiros e instrutores) lê no app ou baixa. A referência
visual pedida é a Desbravateca do Clube Guardiões do Advento: prateleiras por categoria, cartão com
capa, nome, uma linha abaixo dele e os botões "Ler" e "Baixar".

O modelo aprovado está em `modelo/` (`Main.dc.html` é o índice; capas, nomes e números são
fictícios). **Ele é o alvo:** se esta SPEC e o modelo divergirem, vale o modelo. Do modelo copia-se
estrutura, ordem e texto, **nunca CSS**: as classes saem dos tokens e dos componentes de `ui/`.

Textos ao usuário usam **"Biblioteca"**, **"categoria"** e **"item"**. Não há i18n: os textos vão
direto no componente, como no resto do app.

## O que muda para quem usa

- **Ver.** Nova tela **Biblioteca**: uma seção por categoria, na ordem que o Adm definiu, e dentro
  dela os cartões dos itens — capa, **nome**, descrição curta (se houver), **"Ler"** e **"Baixar"**.
  "Ler" abre o PDF no visualizador do navegador, numa aba nova; "Baixar" salva o arquivo com o nome
  do item.
- **Onde fica.** Adm: item **"Biblioteca"** no menu lateral, depois de "Cronogramas". Conselheiro e
  instrutor: atalho **"Biblioteca"** na tela Início, junto dos outros atalhos. A barra inferior do
  celular (`layouts/LayoutCelular.tsx:18-22`) não muda.
- **Adicionar (só Adm).** Botão **"Adicionar à biblioteca"**: escolhe o PDF (até 50 MB), escreve o
  **nome** (obrigatório — o campo vem preenchido com o nome do arquivo, sem a extensão, e o Adm
  edita), a descrição curta (opcional), a categoria, e a capa (opcional: JPG, PNG ou WebP, até
  5 MB). Enquanto envia, uma barra mostra o andamento.
- **Editar (só Adm).** No menu de cada item: "Editar" (nome, descrição, categoria, trocar ou tirar a
  capa), "Mover para cima", "Mover para baixo", "Remover".
- **Categorias (só Adm).** Todo clube começa com **Cadernos de Classes**, **Livros** e **Manuais &
  Documentos**. "Nova categoria"; no menu de cada categoria: "Renomear", "Mover para cima", "Mover
  para baixo", "Excluir" (só aparece com a categoria vazia).
- **Sem capa**, o cartão mostra o nome do item sobre um fundo liso, no mesmo formato de capa.
- **Sem internet**, a tela mostra "Disponível com internet", como Materiais (`useConexao` e
  `DisponivelComInternet`, `modulos/materiais/TelaMateriais.tsx:16,22`).

## Regras

1. **A biblioteca é do clube.** Categoria e item levam `clubeId`; ninguém de outro clube lê, baixa
   ou altera. Item ou categoria de outro clube responde 404 (CLAUDE.md, "Toda rota declara…").
2. **Quem lê:** todo usuário com vínculo ativo no clube da sessão — Adm, conselheiro, instrutor.
   `@Logado()` já confere o vínculo ativo no banco a cada requisição. Sem chave de leitura, como a
   lista de materiais (`materiais.controller.ts:33-37`).
3. **Quem altera:** quem tem **`biblioteca.gerenciar`**, chave nova com `padrao: { ADM: true }`
   (como `calendario.gerenciar`, `permissoes.ts:30`). Só Adm: a chave não se aplica a conselheiro e
   instrutor (`permissaoSeAplica`, `permissoes.ts:46-48`) e some dos ajustes deles.
4. **Item = um PDF.** O conteúdo é conferido pelos bytes (`%PDF-`,
   `conferencia-de-documento.ts:6,87-90`), nunca pelo nome nem pelo mime declarado. Até **50 MB**.
5. **Nome do item é do Adm:** obrigatório, 1 a 120 caracteres. O contrato tira espaços das pontas e
   **remove caracteres de controle, de direção de texto (U+202A–202E, U+2066–2069) e de largura zero**
   — o nome vira nome de arquivo baixado (`disposicao.ts:19-24`), e esses caracteres disfarçam a
   extensão. Descrição: até 120, opcional, mesma limpeza.
6. **Capa:** JPG, PNG ou WebP, **até 5 MB**, enviada **em rota própria** (decisão abaixo) e
   processada por `processarFoto` (`fotos/processamento-de-imagem.ts:35-46`; 1600 px e miniatura de
   400 px, `:10-11`). O cartão usa a miniatura.
7. **Categoria:** nome de 1 a 60 caracteres, mesma limpeza do item, único entre as categorias
   **ativas** do clube, sem diferença de maiúsculas. Só se exclui categoria **sem item ativo**.
8. **Ordem:** categorias e itens (dentro da categoria) têm `ordem` inteira. "Mover" troca a posição
   com o vizinho ativo, buscado por `(ordem, id)`; no topo, "para cima" não aparece (no fim, "para
   baixo" também não). Item novo ou que muda de categoria entra no **fim** dela (`max(ordem) + 1`).
9. **Toda escrita da biblioteca roda na transação com o lock do clube** — o mesmo
   `pg_advisory_xact_lock` dos materiais (`materiais.service.ts:182`), com chave própria
   `biblioteca:<clubeId>`. Dentro dele, a escrita **reconfere** o que a tela já tinha mostrado:
   categoria ativa, categoria vazia, nome livre, cota, vizinho. Isso cobre dois "mover" ao mesmo
   tempo, "excluir categoria" contra "adicionar item nela" e o fim calculado duas vezes.
10. **Remover nunca apaga linha** (CLAUDE.md, "Nunca apague linha com histórico"): item e categoria
    ganham `removidoEm`/`removidaEm`. O **PDF e a capa do item removido saem do disco** (`caminho` e
    `miniaturaCaminho`), como no material (`materiais.service.ts:144-158`). Não há restaurar.
11. **Cota:** **2 GB por clube** para a biblioteca, somando os `Arquivo` cujo dono é item ativo,
    **seja como PDF, seja como capa** (`OR` das duas relações). Separada da cota de 1 GB dos
    materiais (`materiais.service.ts:23,208-216`), que não muda.
12. **Os links expiram.** As URLs são as assinadas de 10 minutos que o app já usa
    (`servico-arquivos.ts:7,27-31`); a tela rebusca a lista antes de vencerem e ao voltar para a aba.

## Decisões

| Impasse | Escolha |
|---|---|
| Reaproveitar `Material` ou criar modelo próprio? | **Modelo próprio.** `Material` exige `classeId` e o instrutor também envia (`permissoes.ts:23`); misturar faria todo PDF de classe aparecer na estante, ou obrigaria inventar uma classe para um livro. Reaproveita-se `Arquivo`, o armazenamento e a conferência de PDF. |
| Biblioteca do clube ou de todos os clubes? | **Do clube.** Pedido do usuário. Não existe Adm da plataforma (o papel é por `Vinculo`, `schema.prisma:161-178`). |
| Só PDF ou também link e outros formatos? | **Só PDF.** Pedido do usuário. |
| Categorias fixas ou do Adm? | **Do Adm**, com três iniciais. Pedido do usuário. |
| Reordenar arrastando ou por menu? | **"Mover para cima/baixo" no menu.** Arrastar pediria biblioteca nova (`apps/web/package.json` não tem nenhuma) e é difícil de acertar no celular; ordem alfabética quebraria Amigo → Companheiro → Pesquisador. |
| PDF e capa no mesmo envio? | **Não: a capa vai em `PUT /biblioteca/itens/:id/capa`, logo depois de criar o item.** O multer tem um `fileSize` só por interceptor (`materiais.controller.ts:44-48`): no mesmo envio a capa poderia chegar com 50 MB e ir inteira para a memória do sharp, numa API de 384 MB (`docker-compose.prod.yml:28`). Em rota própria, 5 MB é o limite do multer. A tela faz as duas chamadas em sequência; se a capa falhar, o item fica sem capa e o diálogo diz "O item foi adicionado, mas a capa não: <motivo>." |
| "Baixar": como forçar o download? | **Variante nova `baixar`**: entra em `VarianteArquivo` (`servico-arquivos.ts:5`) **e** no `z.enum` da consulta (`arquivos.controller.ts:15`), senão a rota a recusa como link inválido. Serve o `caminho` do original e sai **sempre** `attachment`, qualquer que seja o mime. A assinatura já cobre a variante (`servico-arquivos.ts:40`): um link de "ler" não vira "baixar" sem nova assinatura. Hoje a disposição sai só do mime (`arquivos.controller.ts:68,73-76`). |
| Nome do arquivo ao ler e baixar | **O nome do item**, nos dois casos; material segue com o título; o resto, "arquivo" (`arquivos.controller.ts:68`). |
| Capa: onde guardar? | **Uma segunda linha de `Arquivo`**, `mime` `image/jpeg`, com `caminho` (1600 px) e `miniaturaCaminho` (400 px). A miniatura do próprio PDF não serve: `Arquivo` tem uma miniatura só, e ela seria do PDF. A capa sai com a CSP `sandbox` e sem disposição, como toda imagem (`arquivos.controller.ts:66-68`). |
| Trocar o PDF de um item | **Não nesta versão.** Remove e adiciona de novo. Trocar exigiria decidir o destino do `Arquivo` antigo (histórico, cota, link aberto). |
| Trocar ou tirar a capa | **Apaga a linha de `Arquivo` da capa antiga** — a única exceção desta SPEC a "nunca apague linha": imagem de capa não tem histórico e nenhuma outra tabela a referencia. Ordem, para não violar a FK `Restrict`: na transação, confere a cota (só na troca), aponta `capaId` para a nova (ou `null`), apaga a linha antiga; **depois** da transação, apaga `caminho` e `miniaturaCaminho` do disco. Falha no disco fica no log (`limpeza-de-materiais.ts:52-56` faz igual) e o arquivo sobra órfão — aceito. |
| As três categorias iniciais nos clubes que já existem | **Pelo comando de carga** (`scripts/carga.sh`), num passo `completarBibliotecaDosClubes` dentro da transação de `executarCarga` (`carga.ts:360`), como `completarClassesDosClubes` (`:348-358`). Cria só para o clube **sem nenhuma categoria, ativa ou removida** — senão o Adm que excluiu uma veria ela voltar —, e confere isso dentro do lock do clube (regra 9). Migration não serve: o projeto proíbe INSERT em SQL cru (CLAUDE.md, "Ids vêm do Prisma Client") e nenhuma migration tem. Clube novo já nasce com elas em `criarClubeBase` (`clube-criar.ts:41-57`). |
| Cota | **2 GB à parte.** Cadernos de classe ilustrados passam de 20 MB; somar à cota dos materiais (1 GB) faria a biblioteca bloquear o instrutor de enviar material de classe. |
| Limite de upload no nginx **do container** | **Bloco próprio** `location /api/biblioteca/` com `client_max_body_size 51m`, repetindo o proxy e os cabeçalhos do bloco de materiais (`apps/web/nginx.conf:32-44`; `location` não herda), sem CSP própria. O PDF vai sozinho no corpo (a capa tem rota própria), então 1 MB de folga basta, como nos materiais. O tempo de 60 s (`:42`) **não muda**: o nginx recebe o corpo inteiro antes de repassar (não há `proxy_request_buffering off`) e os 60 s contam entre leituras. |
| Limite de upload no nginx **do servidor** | **Sobe de 21m para 51m** em `scripts/nginx-host.conf:21`, na mensagem de `scripts/instalar.sh:259` e no `README.md:141,195-205` (que ainda diz que o nginx do servidor fica fora do repositório). Sem isso, todo PDF acima de 21 MB volta 413 em produção. |
| Instrutor sem classe | Hoje `Conteudo` devolve só o `EstadoVazio` e os atalhos não aparecem (`TelaInicioInstrutor.tsx:173-176`). **Passa a mostrar, abaixo do estado vazio, a seção "Atalhos" só com "Biblioteca"** (`modelo/Inicio-Instrutor-SemClasse.dc.html`). Os outros seis levariam a telas que dependem de classe e abririam vazias. |
| Adm lê onde? | Na **mesma tela**, em `/adm/biblioteca` dentro do `LayoutAdm`; conselheiro e instrutor em `/biblioteca` dentro do `LayoutCelular`. Os botões de alteração aparecem por `pode('biblioteca.gerenciar')` (`sessao/useSessao.ts:20`), não por papel. |
| PDF abre sem CSP, com o JavaScript do PDF | **Risco aceito**, como nos materiais (`arquivos.controller.ts:64-66`): só quem tem `biblioteca.gerenciar` envia. |

## Dados (uma migration: `<timestamp>_biblioteca`, depois de `20261002130000_tarefa_casa`)

- **`CategoriaBiblioteca`**: `id`, `clubeId`, `nome`, `ordem Int`, `criadaEm`, `removidaEm?`,
  `removidaPorId?`. `@@unique([clubeId, id])`; índice `(clubeId, ordem)`.
- **`ItemBiblioteca`**: `id`, `clubeId`, `categoriaId`, `nome`, `descricao?`, `ordem Int`,
  `arquivoId` (`@unique`), `capaId?` (`@unique`), `enviadoPorId`, `criadoEm`, `atualizadoEm`,
  `removidoEm?`, `removidoPorId?`. FKs compostas `(clubeId, categoriaId)`, `(clubeId, arquivoId)` e
  `(clubeId, capaId)`, `onDelete: Restrict`, como `Material` (`schema.prisma:1128-1151`). Índice
  `(clubeId, categoriaId, ordem)`.
- **`Arquivo`** (`schema.prisma:748-765`) ganha duas relações inversas nomeadas: `itemBiblioteca`
  (o PDF) e `capaDeItem` (a capa), ao lado de `foto` e `material` (`:759-760`).
- Relações de volta em `Clube` (`:171-217`) e `Usuario` (`:240-283`; enviado e removido, nomeadas).
- **`CategoriaBiblioteca` e `ItemBiblioteca` entram em `MODELOS_DE_CLUBE`**
  (`comum/prisma/guarda-clube.ts:4-40`) e na lista literal de `guarda-clube.spec.ts:72-110`, na mesma
  entrega da migration.
- Unicidade do nome da categoria e da `ordem` é conferida no serviço, dentro do lock (regra 9), não
  por índice: o nome só é único entre as **ativas**.

## Arquivos e caminhos

- `servico-arquivos.ts` ganha `caminhoDaBiblioteca(clubeId, arquivoId, ext)` →
  `clube/{clubeId}/biblioteca/{arquivoId}.pdf`, e para a capa `clube/{clubeId}/biblioteca/{arquivoId}.jpg`
  e `{arquivoId}-min.jpg`, como `caminhoDaFoto` (`:10-13`).
- Controller de arquivos (`arquivos.controller.ts`): `baixar` no `z.enum` (`:15`) e lido do `caminho`;
  o `select` (`:48-55`) traz também `itemBiblioteca { nome, removidoEm }` e
  `capaDeItem { removidoEm }`; **item removido responde "não encontrado"** como foto e material
  (`:57`); nome do arquivo e disposição conforme as decisões acima (`:68,73-76`).
- **Limpeza na subida:** `LimpezaDeMateriais` (`materiais/limpeza-de-materiais.ts:13-58`) ganha uma
  **segunda varredura**, sobre `ItemBiblioteca` removido, apagando `caminho` e `miniaturaCaminho` do
  PDF e da capa. Mesma classe, para a subida ter um só ponto de limpeza de arquivo.
- A gravação segue o fluxo do material (`materiais.service.ts:160-206`): multer em disco
  temporário, confere os bytes, move, transação com o lock, cria `Arquivo` e o item, e apaga do disco
  se a transação falhar. O trecho comum (mover + transação + desfazer no disco) é **extraído** para
  ser usado pelos dois, sem copiar. A capa, de até 5 MB, é lida do temporário para a memória só
  depois do limite do multer.
- `FiltroArquivoGrande` (`materiais/filtro-arquivo-grande.ts:3-16`) passa a receber a mensagem,
  para dizer "O PDF pode ter até 50 MB." e "A capa pode ter até 5 MB." na biblioteca e manter "até
  20 MB" nos materiais.

## API

Módulo novo `apps/api/src/biblioteca/` (`biblioteca.module.ts`, controller, service, spec),
importando `ArquivosModule`, registrado em `app.module.ts`. Contratos em
`packages/shared/src/contratos/biblioteca.ts`, exportados em `packages/shared/src/index.ts` (como
`:30`). Chave `biblioteca.gerenciar` em `CATALOGO_PERMISSOES` (`permissoes.ts:11-34`).

| Rota | Decorator | Faz |
|---|---|---|
| `GET /biblioteca` | `@Logado()` | categorias ativas na ordem, cada uma com os itens ativos na ordem |
| `POST /biblioteca/categorias` | `@Pode('biblioteca.gerenciar')` | cria no fim |
| `PATCH /biblioteca/categorias/:id` | idem | renomeia |
| `POST /biblioteca/categorias/:id/mover` | idem | `{ direcao: 'acima' \| 'abaixo' }` |
| `DELETE /biblioteca/categorias/:id` | idem | exclui (`removidaEm`) se vazia; senão 422 `REGRA` "Tire os itens da categoria antes de excluí-la." |
| `POST /biblioteca/itens` | idem | multipart: `dados` (JSON: `nome`, `descricao`, `categoriaId`) e `arquivo` (PDF, `FileInterceptor`, 50 MB, `files: 1`) |
| `PATCH /biblioteca/itens/:id` | idem | `nome`, `descricao`, `categoriaId` |
| `PUT /biblioteca/itens/:id/capa` | idem | multipart `capa` (`FileInterceptor`, 5 MB, `files: 1`): põe ou troca |
| `DELETE /biblioteca/itens/:id/capa` | idem | tira a capa |
| `POST /biblioteca/itens/:id/mover` | idem | `{ direcao }` |
| `DELETE /biblioteca/itens/:id` | idem | remove (regra 10) |

- **Saída da lista:** `{ categorias: { id, nome, itens: ItemSaida[] }[] }`, com
  `ItemSaida = { id, nome, descricao, categoriaId, bytes, urlLer, urlBaixar, capaUrl | null }`
  (URLs assinadas — `original`, `baixar` e a `miniatura` da capa —, como `MaterialSaida`,
  `contratos/materiais.ts:12-19`). As mutações devolvem o item ou a categoria alterada.
- **Erros:** PDF que não confere → 422 `REGRA` "O arquivo não é um PDF."; capa em formato não
  aceito → 422 "A capa precisa ser JPG, PNG ou WebP."; cota → 422 "O espaço da biblioteca do clube
  acabou."; nome de categoria repetido → 422 "Já existe uma categoria com esse nome."; categoria de
  destino removida ou de outro clube → 404.
- **Isolamento:** toda leitura e escrita leva `clubeId` no `where`, inclusive nos `include`
  (CLAUDE.md, "`include` aninhado não passa pela guarda").
- Toda rota com um dos decorators (`comum/varredura-de-rotas.spec.ts:22-27`).

## Telas

Uma tela só, `modulos/biblioteca/TelaBiblioteca.tsx`, em duas rotas: `/adm/biblioteca` (bloco Adm,
`rotas.tsx:80-101`) e `/biblioteca` (bloco de conselheiro e instrutor, fora das guardas por papel,
`rotas.tsx:66-79`). Chamadas em `api/biblioteca.ts`, com o envio por XHR como
`api/materiais.ts:43-75` e **progresso** por `xhr.upload.onprogress`.

**Composição** (de cima para baixo; nenhum elemento fixo ou preso na tela):

1. Título "Biblioteca" e, com `biblioteca.gerenciar`, o botão primário **"Adicionar à biblioteca"**
   e o secundário "Nova categoria".
2. Uma seção por categoria: título da categoria e, com permissão, o menu dela (`MenuCabecalho`, como
   `TelaMateriais.tsx:217`).
3. Grade de cartões: 2 colunas até 640 px, 3 até 1024, 4 acima. Cartão (`ui/Cartao.tsx`): capa em
   proporção 3:4, nome (até 2 linhas, o resto cortado), descrição (1 linha), e os botões "Ler"
   (contorno verde, como o "Abrir" de `TelaMateriais.tsx:207-216`) e "Baixar" (`Botao`
   secundário) lado a lado — com ícone no computador, só texto no celular, onde o cartão tem
   ~170 px. Com permissão, abaixo deles, "Opções" (`MenuCabecalho`, como `TelaMateriais.tsx:217`),
   à direita. Os botões têm `aria-label` com o nome do item ("Ler Caminho a Cristo").
4. Sem capa: o espaço da capa com fundo de token e o nome do item centralizado.

**Diálogos** (`ui/Confirmacao.tsx`, como `TelaMateriais.tsx:78-106`):

- *Adicionar* (`modelo/Adicionar.dc.html`; campos com ajuda: "Até 50 MB.", "É o nome que aparece
  na estante e no arquivo baixado.", "Opcional. Uma linha abaixo do nome.", "Opcional. JPG, PNG ou
  WebP, até 5 MB."): PDF (`Campo type="file" accept="application/pdf"`), Nome, Descrição, Categoria
  (`Selecao`), Capa (`accept="image/jpeg,image/png,image/webp"`). Ao escolher o PDF, o Nome é
  preenchido com o nome do arquivo sem `.pdf` **só se estiver vazio**. PDF acima de 50 MB ou capa
  acima de 5 MB é recusado na hora, antes do envio. Durante o envio, campos travados, barra de
  andamento (`ui/BarraProgresso.tsx`) com "Enviando o PDF…" e depois "Enviando a capa…", e o botão
  "Adicionando" girando (`modelo/Adicionar-Enviando.dc.html`).
- *Capa recusada depois do item criado* (`modelo/Adicionar-CapaFalhou.dc.html`): o diálogo passa a
  se chamar "<nome> foi adicionado", mostra o motivo e oferece outra imagem ("Enviar capa") ou
  "Fechar".
- *Editar item* (`modelo/Editar-Item.dc.html`): Nome, Descrição, Categoria ("Ao mudar de
  categoria, o item vai para o fim dela."), a capa em miniatura com "Trocar capa" e "Tirar capa", e
  "Para trocar o PDF, remova o item e adicione de novo." 
- *Nova categoria* / *Renomear*: um campo, "Nome da categoria"; botão "Criar" / "Salvar".
- *Remover item*: "Remover \"<nome>\" da biblioteca? O arquivo é apagado e não dá para desfazer."
- *Excluir categoria*: "Excluir a categoria \"<nome>\"?"

**Atalhos de Início:**

- Conselheiro: 5º item em `ATALHOS` (`modulos/inicio/InicioConselheiro.tsx:31-36`).
- Instrutor: 7º item em `ATALHOS` (`modulos/inicio-instrutor/TelaInicioInstrutor.tsx:29-36`); sem classe, só
  o da Biblioteca (decisão acima).
- Adm: `ITENS_ADM` (`layouts/LayoutAdm.tsx:16-27`), depois de "Cronogramas" (`:23`), ícone
  `BookOpen` do `lucide-react` (se a versão instalada não tiver, `Library`).

**Links que expiram:** `useBiblioteca` com `gcTime: 0` (como `api/materiais.ts:24-31`),
`staleTime` de 5 minutos, `refetchInterval` de 8 minutos e `refetchOnWindowFocus` — o intervalo não
roda com a aba em segundo plano, e quem volta para ela depois de 10 minutos teria links vencidos.
Um PDF já aberto numa aba não é afetado.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** para adicionar, uma categoria ativa. Clube sem nenhuma (carga ainda não rodou,
  ou o Adm excluiu todas): o cabeçalho fica sem botões e a tela mostra "Crie uma categoria para
  começar a montar a biblioteca." com o único botão, "Nova categoria" (`modelo/Sem-Categoria-Adm.dc.html`).
- **Vazio:** biblioteca sem nenhum item — só a mensagem, sem prateleiras vazias empilhadas. Adm:
  "A biblioteca está vazia." / "Use “Adicionar à biblioteca” para colocar o primeiro PDF. As
  categorias … já estão prontas." (o botão é o do cabeçalho, `modelo/Vazio-Adm.dc.html`);
  conselheiro e instrutor: "A biblioteca ainda está vazia." / "O Adm do clube adiciona aqui os
  cadernos de classe, livros e manuais." (`modelo/Vazio-Celular.dc.html`). Com algum item, categoria
  vazia aparece para o Adm com "Nenhum item nesta categoria."; para quem só lê, ela some.
- **Bloqueio:** "Excluir" só aparece em categoria vazia (não há mensagem de bloqueio a mostrar);
  cota e formato voltam como mensagem no próprio diálogo — estado que a tela não tem como contornar.
- **Perfil e escopo:** só quem tem `biblioteca.gerenciar` vê botões e menus de alteração; para os
  outros a tela é só leitura e a mensagem de vazio nomeia o Adm como quem adiciona.

## Testes

- **API** (integração, banco próprio):
  - lista: só do clube da sessão, na ordem, sem removidos; conselheiro e instrutor leem;
  - criar item: PDF ok; PNG renomeado para `.pdf` → 422; acima de 50 MB → 422 com "até 50 MB"; cota
    estourada → 422; falha depois de gravar apaga do disco; categoria de outro clube ou removida →
    404; sem `biblioteca.gerenciar` (conselheiro, instrutor) recusado;
  - capa: ok; formato inválido → 422; acima de 5 MB → 422 com "até 5 MB"; trocar apaga a antiga do
    banco e do disco (`caminho` e `miniaturaCaminho`); tirar; a capa **conta na cota** e a troca a
    libera;
  - nome: caracteres de direção de texto e de largura zero são removidos;
  - editar: renomear; mudar de categoria vai para o fim;
  - mover: troca com o vizinho ativo, pula removidos, no topo/fim não faz nada; dois "mover"
    simultâneos não repetem `ordem`;
  - remover item: some da lista, URL assinada antiga responde 404, arquivos saem do disco, cota
    libera; limpeza na subida apaga os que sobraram;
  - categoria: nome repetido (maiúsculas diferentes) → 422; excluir com item ativo → 422; excluir
    vazia; nome de removida pode ser reusado; excluir e adicionar item nela ao mesmo tempo não deixa
    item em categoria removida;
  - arquivos: `baixar` sai `attachment` com o nome do item; `original` de PDF segue `inline` com o
    nome do item; assinatura de `original` não serve para `baixar`;
  - permissões: ajuste de `biblioteca.gerenciar` para conselheiro ou instrutor é recusado;
  - clube novo nasce com as 3 categorias; carga cria nos clubes sem nenhuma e não recria em clube
    que excluiu uma;
  - materiais: limite de 20 MB e mensagem continuam (filtro parametrizado).
- **Web:** lista por categoria na ordem; leitor sem botões de alteração; vazio para Adm e para
  leitor; sem categoria; adicionar (nome preenchido do arquivo só se vazio, PDF e capa grandes
  recusados na hora, progresso, capa que falha depois do item criado); editar; mover (sem "para
  cima" no primeiro); excluir só em categoria vazia; atalhos nos dois Inícios e no menu do Adm;
  instrutor sem classe vê só o atalho da Biblioteca.
- **e2e** (`e2e/adm.spec.ts`): Adm adiciona um PDF com nome próprio, o conselheiro o vê e o "Ler"
  abre o PDF.
- **Testes existentes que mudam:**
  - `packages/shared/src/permissoes.test.ts:5-7` (22 → 23 chaves);
  - `apps/api/src/comum/prisma/guarda-clube.spec.ts:72-110`;
  - `apps/api/src/arquivos/arquivos.spec.ts`; `apps/api/src/materiais/materiais.spec.ts:153`
    (mensagem do filtro);
  - `apps/api/src/scripts/carga.spec.ts:117` (chave nova `categoriasBiblioteca` em `ResumoDaCarga`,
    `carga.ts:51`) e os specs que usam `criarClubeBase`;
  - `apps/web/src/testes/nginx-host.test.ts:19-21` (51m) e `nginx-csp.test.ts:36-43` (bloco novo);
  - `apps/web/src/layouts/layouts.test.tsx:153-170` (menu do Adm), `apps/web/src/rotas.test.tsx`
    (rotas novas);
  - `modulos/inicio/inicio.test.tsx`, `modulos/inicio-instrutor/inicio-instrutor.test.tsx` (atalho
    novo; sem classe, só o da Biblioteca);
  - handlers em `apps/web/src/testes/handlers/` (novo `biblioteca.ts`).

## Documentação que muda

`README.md:141,195-205` (limite de 51m e o nginx do servidor no repositório),
`docs/planejamento/MODELO-DE-DADOS.md` (tabelas novas, `:254-256`, `:290`), `API.md` (rotas,
`:162`, e a matriz de permissões `:195-205`), `BACKLOG.md` (item novo ao lado de I10, `:249-252`),
`ARQUITETURA.md:177` e `RISCOS.md:44` (cota da biblioteca), `docs/design/LEIA-ME.md:26-80`
(inventário de telas).

## O que a mudança precisa para funcionar no ar

- **Clubes que já existem só ganham as três categorias quando a carga roda**:
  `scripts/carga.sh` no servidor (o deploy automático não a roda, CLAUDE.md). Até lá, o Adm vê
  "Crie uma categoria para começar…" e pode criar as suas.
- **Servidor já instalado não recebe o limite novo sozinho**: depois do certbot, o
  `instalar.sh --nginx` só troca a porta do site (`scripts/instalar.sh:201-205`). No servidor:
  `sudo sed -i 's/client_max_body_size 21m;/client_max_body_size 51m;/' /etc/nginx/sites-available/<dominio> && sudo nginx -t && sudo systemctl reload nginx`.
  Sem isso, PDF acima de 21 MB volta 413.

## Critério de pronto

- Migration aplicada contra o banco, com `MODELOS_DE_CLUBE` na mesma entrega; lint, tipos e suítes
  de API e web passando; e2e verde no CI.
- Medido no DOM em 390, 820 e 1280 px, com 3 categorias e 9 itens: sem rolagem lateral, nomes
  longos cortados sem empurrar o cartão, nenhum elemento `fixed`/`sticky` novo.
- Cada tela de `modelo/` vira item do roteiro de QA.
- QA no navegador: Adm cria categoria, adiciona PDF com capa e sem capa, renomeia, move, remove;
  conselheiro e instrutor veem, leem e baixam; outro clube não vê.

## Fora de escopo

- Ler sem internet; capa gerada da primeira página do PDF; busca; trocar o PDF de um item.
- Biblioteca compartilhada entre clubes; acervo oficial da plataforma.
- Desbravador e pais (não têm acesso ao app, `docs/planejamento/VISAO.md:80`).
- Link, vídeo ou outros formatos.
- Restaurar item removido; histórico de quem leu.
- Varredura de `Arquivo` órfão (sem foto, material nem item) na subida.

## ONDE FICA

```
- material de classe (modelo a seguir)       apps/api/src/materiais/materiais.controller.ts:16-52 ; materiais.service.ts:23, :119-126, :144-216, :247-260
- lock do clube                               apps/api/src/materiais/materiais.service.ts:182
- conferência de PDF pelos bytes              apps/api/src/materiais/conferencia-de-documento.ts:6, :87-90
- filtro de arquivo grande                    apps/api/src/materiais/filtro-arquivo-grande.ts:3-16
- limpeza na subida                           apps/api/src/materiais/limpeza-de-materiais.ts:13-58
- caminhos e URL assinada                     apps/api/src/arquivos/servico-arquivos.ts:5-41
- servir arquivo (enum, select, disposição)   apps/api/src/arquivos/arquivos.controller.ts:13-18, :48-57, :64-76 ; disposicao.ts:19-24
- capa (sharp)                                apps/api/src/fotos/processamento-de-imagem.ts:8-15, :35-46
- schema: Arquivo, Material, Clube, Usuario   apps/api/prisma/schema.prisma:748-765, :1128-1151, :171-217, :240-283
- guarda de clube                             apps/api/src/comum/prisma/guarda-clube.ts:4-40 ; guarda-clube.spec.ts:72-110
- clube novo e carga                          apps/api/src/scripts/clube-criar.ts:41-57 ; scripts/carga.ts:51, :348-360 ; carga.spec.ts:117
- módulos da API / exports do shared          apps/api/src/app.module.ts ; packages/shared/src/index.ts:30
- permissões                                  packages/shared/src/permissoes.ts:11-48, :57-70 ; permissoes.test.ts:5-7
- varredura de rotas                          apps/api/src/comum/varredura-de-rotas.spec.ts:22-27
- contratos de material (modelo)              packages/shared/src/contratos/materiais.ts:5-22
- menu do Adm / barra do celular              apps/web/src/layouts/LayoutAdm.tsx:16-27 ; LayoutCelular.tsx:18-22 ; layouts.test.tsx:153-170
- rotas                                       apps/web/src/rotas.tsx:66-101 ; rotas.test.tsx
- Início conselheiro / instrutor              apps/web/src/modulos/inicio/InicioConselheiro.tsx:31-36, :164-180 ; modulos/inicio-instrutor/TelaInicioInstrutor.tsx:29-36, :155-188
- tela e API de materiais (modelo)            apps/web/src/modulos/materiais/TelaMateriais.tsx:16-22, :78-106, :202-228 ; api/materiais.ts:17-117
- pode() na sessão                            apps/web/src/sessao/useSessao.ts:20 ; ProvedorSessao.tsx:349-356
- nginx do container e testes                 apps/web/nginx.conf:16, :32-55 ; testes/nginx-host.test.ts:19-21 ; testes/nginx-csp.test.ts:36-43
- nginx do servidor e instalador              scripts/nginx-host.conf:21 ; scripts/instalar.sh:201-205, :259 ; README.md:141, :195-205
- memória da API                              docker-compose.prod.yml:28
- conferido em                                6bc7e05
```
