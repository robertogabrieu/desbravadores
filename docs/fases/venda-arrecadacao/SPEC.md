# Vendas de arrecadação (lasanhas e afins) — SPEC (rascunho 3, após a revisão 1)

Estado: mockup aprovado pelo cliente. Este rascunho corrige a revisão 1 (3 revisores: factual,
desenho/segurança, completude). Falta o PLANO ser aprovado. **Nenhum código foi tocado.** Só o **Adm**
usa nesta fase, no desktop.

O desenho aprovado está em [`modelo/Vendas.html`](modelo/Vendas.html) (6 telas). **Ele é o alvo:** se esta
spec e o desenho divergirem, vale o desenho. Dele se copia estrutura, ordem e texto, nunca CSS: as
classes saem dos tokens e de `apps/web/src/ui/`. Ajustes feitos no desenho depois da revisão (a lista está
em "Mudanças no desenho") valem como parte dele.

**Nomes fixos** (existe `pedidos-ao-adm`, o pedido do conselheiro ao Adm: não reutilizar "pedidos"):

| O quê | Nome |
|---|---|
| Módulo da API | `apps/api/src/vendas/` |
| Rota da API | `/api/vendas` |
| Contratos e regras puras | `packages/shared/src/contratos/vendas.ts`, `packages/shared/src/vendas.ts` |
| Módulo web / rota web | `apps/web/src/modulos/vendas/`, `/adm/vendas` |
| Permissão | `venda.gerenciar` |
| Modelos Prisma | `VendaArrecadacao`, `ProdutoVenda`, `FormaPagamentoVenda`, `PedidoVenda`, `ItemPedidoVenda` |

## O que muda para quem usa

Hoje as vendas de lasanha vivem numa planilha (uma aba por edição, com abas de dashboard, compras e
doadores). Passa a existir, no menu do Adm, **Vendas** (logo depois de Biblioteca):

- O Adm cria uma **venda** (ex.: "Lasanhas — 2ª edição") e define: os **produtos e preços**, a **taxa de
  entrega**, as **formas de pagamento aceitas** com os dados para pagar (chave Pix, orientação do 7me),
  **data, horário e local de retirada** e as **instruções de consumo**.
- O Adm **lança pedidos**: comprador, vendedor, unidade, quantidade de cada produto, retirada ou entrega
  (com endereço), pago ou não e forma, observação. O valor é calculado.
- Cada pedido gera uma **imagem de resumo** para baixar ou compartilhar.
- O Adm marca o pedido como **pago** e como **retirado/entregue**, e vê o **painel da venda**.
- Ao fim, **encerra** a venda: ela vira só leitura. Pode reabrir.

## Decisões

| # | Decisão | Por quê / alternativa |
|---|---|---|
| D1 | **Módulo genérico**: a venda define produtos, preços, taxa, formas de pagamento, retirada e instruções. *Definido pelo cliente.* | Sabores fixos no código fariam cada venda nova virar programação. |
| D2 | **Comprador e vendedor são texto livre.** A **unidade** é escolhida entre as `Unidade` ativas do clube, ou **"Diretoria"**, ou nada. *Definido pelo cliente; "Diretoria" decidida na revisão.* | "Diretoria" não é `Unidade` (é tipo de pessoa; `schema.prisma:64` só tem mista, masculina, feminina). O pedido ganha `daDiretoria` (sim/não), exclusivo com `unidadeId`. Só `unidadeId` nulo misturaria Diretoria com comprador de fora. |
| D3 | **O preço de cada item e a taxa de entrega ficam gravados no pedido.** Mudar o preço ou a taxa da venda não altera pedido existente. | Pedido já pago e enviado ao comprador não pode mudar de valor. |
| D4 | **Total do pedido** = soma(quantidade × preço gravado do item) + taxa gravada (0 se retirada). Uma função só, `totalDoPedido`, em `packages/shared/src/vendas.ts`, **recebe os itens com o preço gravado**. Usada pela tela, pela imagem e pelo painel; teste de paridade entre as três. | Duas cópias do cálculo divergem na primeira mudança. |
| D5 | **Pagamento do pedido**: pendente ou pago, mais a forma, escolhida **só entre as formas ativas da venda** (D12), ou `MISTO`. Forma só existe se pago. Desmarcar o pago apaga a forma. Pagamento parcial fica fora. | A planilha tem uma célula "1325" no lugar do OK, único caso parcial. |
| D6 | **Retirada ou entrega** é escolha do pedido. Entrega exige endereço e grava a taxa. Retirada não tem endereço. | Coluna RETIRADA/ENTREGA da planilha. |
| D7 | **Cancelar** não apaga: marca `canceladoEm`. Pedido cancelado sai de todos os totais, só aparece em "Todos" com a etiqueta "Cancelado", e só aceita **Reativar**. Pedido entregue não cancela: desmarque a entrega antes. | CLAUDE.md: nunca apagar linha com histórico. |
| D8 | **A imagem é gerada no navegador, em PNG, desenhada à mão num `canvas`** (sem biblioteca nova): a CSP do web só aceita `img-src 'self' data: blob:` e `font-src` do Google, o que deixa fora as bibliotecas que serializam HTML em SVG. Precedente de canvas: `apps/web/src/modulos/galeria/reducao.ts:58-69`. Largura 1080 px, altura conforme o conteúdo. Antes de desenhar, espera `document.fonts.load` das duas fontes da marca; se não carregarem (sem internet), desenha com a fonte padrão do aparelho. Arquivo `pedido-<n>-<comprador>.png`. Nada vai ao servidor. | Imagem que nasce e morre no aparelho não pede URL assinada. A chave Pix e o endereço ficam no histórico de downloads do aparelho do Adm: risco aceito. |
| D9 | **Compartilhar** só liga se `navigator.canShare({ files })` for verdadeiro; senão só existe Baixar. A imagem é gerada antes de o botão ficar ativo, para não perder o gesto do usuário. Código novo: não há `navigator.share` no web hoje. | iOS em PWA tem download frágil; o Web Share de arquivo exige HTTPS e gesto. |
| D10 | **Número do pedido** é sequencial dentro da venda, calculado dentro da transação que grava, sob a trava da venda (D15), com `@@unique([vendaId, numero])` como segunda rede. | MAX+1 sem trava duplica número com dois lançamentos juntos. |
| D11 | **Venda encerrada é só leitura**: não recebe pedido, nem edição, pago, entrega ou cancelamento; o resumo continua baixável. Só **Reabrir** (e Encerrar, na venda aberta) são permitidos. | O "recebido" de uma edição encerrada não pode mudar depois do fechamento. |
| D12 | **Cada venda declara as formas aceitas**, com os dados: **Pix** (chave e favorecido), **7me** (orientação em texto livre; o caminho real é *Ofertas > Outras ofertas > Ofertas para a minha igreja > Desbravadores*, informado pelo cliente) e **Dinheiro**. Ao menos uma é obrigatória. Pedido **não pago** mostra esses dados na imagem ("Como pagar"); pedido pago mostra só "Pago · forma". Tirar uma forma da venda a **desativa**; pedidos antigos mantêm a forma que usaram. | Hoje o comprador pergunta a chave a cada pedido. Sem apagar: CLAUDE.md. |
| D13 | **Produto** também só se desativa. Produto inativo não aparece ao lançar pedido; pedidos antigos o mantêm. | Mesmo motivo. |
| D14 | **Editar pedido**: itens existentes mantêm o preço gravado; item novo usa o preço atual do produto; trocar retirada↔entrega regrava a taxa com a atual da venda. Pedido **pago** não aceita mudar itens nem entrega: desmarque o pago antes. Comprador, vendedor, unidade, endereço e observação mudam sempre (venda aberta, pedido não cancelado). | Pedido pago e já enviado como imagem não muda de valor sem decisão consciente. |
| D15 | **Toda escrita da venda** (lançar, editar, pagar, entregar, cancelar, encerrar, reabrir) roda num método `escrever` do serviço que toma a trava da venda (`pg_advisory_xact_lock`, molde `apps/api/src/biblioteca/constantes.ts:8`); as conferências ficam dentro dele. Edição simultânea do mesmo pedido: **o último a gravar vale** (marcar pago/entregue é idempotente). | Resolve a corrida entre encerrar e lançar, e a do número. |
| D16 | **Dinheiro em centavos inteiros.** Preço de 1 a 999.999; taxa de 0 a 99.999; quantidade por item de 0 a 999; pedido com ao menos 1 unidade. | Cabe em `Int` de 32 bits e impede total absurdo por engano. |
| D17 | **Layout só de desktop** nesta fase (Adm). As telas usam os componentes de carregando, vazio, erro e sem conexão do projeto; a tabela de pedidos usa `ui/Tabela`, que já vira cartões em tela estreita. | Celular do Adm fica para quando houver pedido do cliente. |
| D18 | Permissão **`venda.gerenciar`**, padrão só ADM (`packages/shared/src/permissoes.ts:31`, molde de `biblioteca.gerenciar`). Toda rota usa `@Pode('venda.gerenciar')`. | Mesmo molde. |
| D19 | **Fuso/datas:** a data de retirada é data de calendário (sem hora); `criadoEm` é o instante do servidor, mostrado no fuso do clube (`ConfiguracaoClube.fuso`, `schema.prisma:260`). | Mesmo tratamento da Biblioteca (`emprestimos.service.ts:342`). |

## Glossário (uma definição por termo, todos calculados no servidor)

"Pedido ativo" = `canceladoEm` nulo. Os totais usam sempre `totalDoPedido` (D4).

| Termo | Definição |
|---|---|
| Unidades vendidas | soma das quantidades dos itens dos pedidos ativos; por produto e total |
| Vendido (R$) | soma do `totalDoPedido` dos pedidos ativos |
| Recebido (R$) | soma do `totalDoPedido` dos pedidos ativos **pagos** |
| A receber | vendido − recebido, e a contagem de pedidos ativos pendentes |
| A retirar ou entregar | contagem de pedidos ativos sem `entregueEm`; "já foram" = com `entregueEm` |
| Unidades vendidas por unidade | as "unidades vendidas" agrupadas por `unidadeId`; linhas extras "Diretoria" (`daDiretoria`) e "Sem unidade". Unidade desativada depois continua com a linha, marcada "(inativa)" |
| Contadores dos filtros | Todos (inclui cancelados), A pagar, A entregar, Entregues; contados no servidor, não pela página |

## Estados do pedido e o que cada um permite

Venda aberta. Nas outras linhas, "pago" e "entregue" valem para pedido ativo.

| Situação | Editar itens/entrega | Editar contato, endereço, obs. | Pagar / desmarcar | Entregar / desmarcar | Cancelar |
|---|---|---|---|---|---|
| Ativo, pendente, não entregue | sim | sim | marcar | marcar | sim |
| Ativo, pago, não entregue | **não** (desmarque o pago) | sim | desmarcar | marcar | sim |
| Ativo, entregue | conforme o pago | sim | conforme | desmarcar | **não** (desmarque a entrega) |
| Cancelado | não | não | não | não | só **Reativar** |
| Qualquer, venda **encerrada** | não | não | não | não | não (só baixar o resumo) |

Combinações inválidas que a API recusa: forma sem pago; entrega sem endereço; retirada com endereço;
forma fora das aceitas pela venda; item de produto de outra venda ou inativo; produto repetido no pedido.

## Dados

Todos levam `clubeId`, entram em `MODELOS_DE_CLUBE` na mesma migration
(`apps/api/src/comum/prisma/guarda-clube.ts:4`) e têm `@@unique([clubeId, id])` quando um filho precisa
de chave composta (molde: `Unidade`, `schema.prisma:551`). Os filhos apontam o pai por `[clubeId, vendaId]`.

- `VendaArrecadacao`: nome, taxa de entrega (centavos), `retiradaData` (data), `retiradaHorario` (texto
  curto, ex.: "9h às 12h"), `retiradaLocal`, instruções, `encerradaEm`, `criadoEm`.
- `ProdutoVenda`: venda, nome (o que sai na imagem, "Lasanha de carne"), nome curto ("Carne"), preço,
  ordem, `ativo`.
- `FormaPagamentoVenda`: venda, tipo (`PIX`, `SETE_ME`, `DINHEIRO`), chave e favorecido (só Pix),
  orientação (só 7me), `ativo`. `@@unique([vendaId, tipo])`. No contrato é uma união discriminada por
  tipo (molde: `ItemBibliotecaSaida`, `packages/shared/src/contratos/biblioteca.ts:57`): Pix exige chave e
  favorecido; 7me exige orientação.
- `PedidoVenda`: venda, `numero` (`@@unique([vendaId, numero])`), comprador, vendedor, `unidadeId`
  (relação composta `[clubeId, unidadeId]`, molde `PedidoAoAdm`, `schema.prisma:907`; campo inverso em
  `Unidade`), `daDiretoria`, entrega (sim/não), endereço, taxa gravada, observação, pago, forma,
  `entregueEm`, `canceladoEm`, `criadoEm`.
- `ItemPedidoVenda`: pedido, produto, quantidade, preço gravado. `@@unique([pedidoId, produtoId])`.

Migration nova, timestamp maior que `20261021120000_biblioteca_fisica` (a conferir de novo no plano).

## Contratos (`packages/shared`)

`contratos/vendas.ts` (schemas Zod de entrada e saída, exportados em `index.ts:34`) e `vendas.ts`
(funções puras: `totalDoPedido`, `rotuloDaSituacao`, limites de D16), com testes ao lado, no molde de
`situacaoDoEmprestimo` (`datas.ts:87`, `datas-emprestimo.test.ts`). Toda saída do pedido inclui `total`
(calculado por `totalDoPedido`), para a tela nunca recalcular por conta própria.

## API

Todas sob `@Pode('venda.gerenciar')`; o id da URL passa por `ZodValidationPipe(Uuid)`. **Pertencimento:**
a venda é do clube da sessão; pedido e produto pertencem à venda da URL; qualquer falha responde **404**.

| Verbo e caminho | Faz | Confere |
|---|---|---|
| `GET /vendas` | lista as vendas, a aberta primeiro, com números de resumo | clube |
| `POST /vendas` | cria venda com produtos e formas | ≥1 produto, ≥1 forma |
| `GET /vendas/:id` | uma venda com produtos e formas | clube |
| `PATCH /vendas/:id` | edita dados; produtos e formas vêm na lista (sem `id` = novo, ausente = desativa) | venda aberta; ≥1 produto e ≥1 forma ativos |
| `POST /vendas/:id/encerrar` · `/reabrir` | muda `encerradaEm` | clube |
| `GET /vendas/:id/painel` | números do glossário + contadores | clube |
| `GET /vendas/:id/pedidos` | lista (`filtro`, `busca` por nome do comprador ou nº, `pagina`; ordem: nº decrescente; 20 por página) | clube |
| `POST /vendas/:id/pedidos` | lança pedido | venda aberta; produtos da venda, ativos; unidade ativa do clube; forma aceita |
| `GET /vendas/:id/pedidos/:pedidoId` | um pedido | pedido da venda |
| `PATCH /vendas/:id/pedidos/:pedidoId` | edita (tabela de estados) | idem + estado |
| `POST …/:pedidoId/pagar` (corpo: forma) · `/despagar` | marca/desmarca pago | idem |
| `POST …/:pedidoId/entregar` · `/desentregar` | marca/desmarca `entregueEm` | idem |
| `POST …/:pedidoId/cancelar` · `/reativar` | cancela/reativa | idem |

Erro de FK composta do banco (unidade de outro clube) vira 404, nunca 500: a conferência acontece antes,
dentro de `escrever`.

### O que a API recusa (e o texto)

| Tentativa | Resposta | Mensagem |
|---|---|---|
| Qualquer escrita em venda encerrada (exceto reabrir) | 409 | "Esta venda foi encerrada. Reabra para alterar." |
| Venda, pedido ou produto de outro clube, ou fora da venda da URL | 404 | "Venda não encontrada." / "Pedido não encontrado." |
| Unidade de outro clube ou desativada | 404 | "Unidade não encontrada." |
| Produto inativo ou de outra venda no pedido | 404 | "Produto não encontrado nesta venda." |
| Forma fora das aceitas pela venda | 422 | "Esta venda não aceita essa forma de pagamento." |
| Entrega sem endereço | 422 | "Informe o endereço da entrega." |
| Todos os itens com quantidade zero | 422 | "Escolha ao menos uma unidade." |
| Salvar venda sem produto ativo | 422 | "Cadastre ao menos um produto." |
| Salvar venda sem forma de pagamento | 422 | "Escolha ao menos uma forma de pagamento." |
| Mudar itens ou entrega de pedido pago | 409 | "Pedido já pago. Desmarque o pagamento para mudar o valor." |
| Cancelar pedido entregue | 409 | "Pedido já entregue. Desmarque a entrega antes de cancelar." |
| Mexer em pedido cancelado (exceto reativar) | 409 | "Pedido cancelado. Reative para alterar." |
| Cancelar pedido já cancelado | 409 | "Este pedido já está cancelado." |

## Imagem do pedido

Conteúdo, nesta ordem: nome da venda; "Pedido nº N — comprador"; itens (nome do produto, quantidade,
valor); taxa de entrega quando houver; **total**; situação e forma de pagamento; **Como pagar** só se o
pedido está pendente (dados das formas ativas); **Retirada** (data, horário, local) ou **Entrega**
(endereço); instruções de consumo. Texto longo (instruções, endereço, muitos itens) quebra por largura e
aumenta a altura. A montagem do conteúdo é uma função pura (`montarImagemDoPedido`), testada sem canvas;
o desenho em canvas se confere no QA.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** venda com ao menos um produto e uma forma de pagamento (a API exige ao salvar).
  Unidade é opcional.
- **Vazio:** sem venda, a lista ensina e oferece **Nova venda**; sem pedido, o painel oferece **Lançar
  pedido**; filtro sem resultado oferece ver todos. Quadros no desenho, tela 6.
- **Bloqueio:** venda encerrada é estado impossível ("Esta venda foi encerrada"), com **Reabrir**.
- **Perfil e escopo:** só Adm; sempre dentro do clube.

## Inventário de saídas

As entidades novas saem **só** por `/api/vendas/**`, todas com `venda.gerenciar`. O campo inverso em
`Unidade` não entra em `INCLUIR_UNIDADE` (`unidades.service.ts:91`) nem na Visão Geral
(`visao-geral.service.ts:259`). Não há exportação, e-mail nem relatório nesta fase. O PNG nunca passa
pelo servidor.

## Testes que mudam

- `packages/shared/src/permissoes.test.ts:6-7` e `apps/api/src/permissoes/permissoes.spec.ts:20,26`: 26 → 27 chaves.
- `apps/api/src/comum/prisma/guarda-clube.spec.ts:72-122`: a lista literal de modelos ganha os 5 novos e o título.
- `apps/web/src/layouts/layouts.test.tsx:132` e `:160-172`: o menu do Adm ganha "Vendas".
- `apps/web/src/rotas.test.tsx`: bloco novo para `/adm/vendas`, com handlers MSW em `apps/web/src/testes/handlers/vendas.ts`.
- Teste de isolamento de clube nos `include` aninhados (venda → produtos → itens → pedidos): CLAUDE.md diz que a guarda não os cobre.
- `apps/api/src/comum/varredura-de-rotas.spec.ts` já cobra o decorador de cada rota: passa com D18.

## Mudanças no desenho (depois da revisão)

Botão **Cancelar** do formulário de pedido vira **Voltar** (colidia com "Cancelar pedido"); alvo de
toque do seletor segmentado sobe de 40 para 44 px; painel ganha o botão **Encerrar venda** (e **Reabrir
venda** na encerrada); tela 6 deixa de prometer imagem "sem internet" (a fonte da marca pode cair para a
padrão do aparelho). O mockup mostra o total com o preço da venda; no código vale D3/D4 (preço gravado).

## Fora de escopo (fases futuras)

- Visão de unidade, conselheiro ou responsável lançando os próprios pedidos; layout de celular.
- Importar as planilhas antigas; pagamento parcial; aba **Compras** (custos), **Doadores** e lucro.
- Aviso automático ao comprador; integração com o 7me.
- Cancelados em filtro próprio (ficam em "Todos").

## Critério de pronto

1. Criar venda com produtos e formas; lançar pedido de retirada e de entrega; os totais batem com
   `totalDoPedido` na tela, na imagem e no painel (teste de paridade).
2. Estados e recusas da seção "Estados do pedido" e "O que a API recusa" cobertos por teste de API.
3. Isolamento: um Adm de outro clube e um id de outra venda recebem 404 em cada rota da tabela.
4. Dois lançamentos simultâneos geram números distintos.
5. A imagem mostra "Como pagar" só no pedido pendente, e funciona para retirada e para entrega.
6. Os testes da seção "Testes que mudam" atualizados; `npm run tipos` verde; suíte completa verde.
7. QA no navegador, pelo roteiro `qa-roteiro`, com as 6 telas do desenho.

ONDE FICA
- molde de módulo (API, shared, tela, menu)     apps/api/src/biblioteca/, packages/shared/src/contratos/biblioteca.ts, apps/web/src/modulos/biblioteca/
- trava de escrita por venda                    apps/api/src/biblioteca/constantes.ts:8, emprestimos.service.ts:348-356
- registro do módulo na API                     apps/api/src/app.module.ts:8 e :89
- modelos de clube e guarda                     apps/api/src/comum/prisma/guarda-clube.ts:4-52, guarda-clube.spec.ts:72-122
- relação composta com Unidade                  apps/api/prisma/schema.prisma:551, :907
- catálogo de permissões e seus testes          packages/shared/src/permissoes.ts:31, permissoes.test.ts:6-7, apps/api/src/permissoes/permissoes.spec.ts:20-26
- menu e rotas do Adm                           apps/web/src/layouts/MenuDoAdm.tsx:46, apps/web/src/rotas.tsx:16 e ~108, layouts/layouts.test.tsx:132 e :160-172
- função pura de situação (molde)               packages/shared/src/datas.ts:87
- canvas no front (precedente)                  apps/web/src/modulos/galeria/reducao.ts:58-69
- CSP da imagem                                 apps/web/nginx.conf:30,107,116,126,136
- tabela, abas e campos                         apps/web/src/ui/Tabela.tsx, Abas.tsx, EscolhaUnica.tsx, CampoComPasso.tsx, CampoData.tsx, CampoHorario.tsx
- varredura de decoradores de rota              apps/api/src/comum/varredura-de-rotas.spec.ts
- conferido em                                  40fb814
