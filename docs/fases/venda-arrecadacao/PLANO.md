# Vendas de arrecadação — PLANO

Spec: [`SPEC.md`](SPEC.md) (rascunho 3). Desenho aprovado: [`modelo/Vendas.html`](modelo/Vendas.html).
Base: `main` em `40fb814`. Branch: renomear `worktree-venda-arrecadacao` para `feature/venda-arrecadacao`
antes do primeiro commit (não há issue). Quem executa é um **orquestrador** (skill `orquestrador`): decide,
delega, versiona. Código e teste são dos `implementador`es; suíte é do `testador`.

## Níveis

| Nível | O que roda aí |
|---|---|
| **Sessão** | uma só, na worktree `.claude/worktrees/venda-arrecadacao`. Não há troca de repo |
| **Agente principal** | Onda 0 inteira (arquivos de dono compartilhado), commits, conferência dos relatórios, `gestor-pr`, perguntas ao usuário |
| **Subagente** | os 6 pacotes abaixo, cada um com o contrato de retorno do fim deste arquivo |

## Onda 0 — o principal escreve, antes de delegar

São os ímãs de conflito (migration, permissão, módulo, menu, rotas). Um commit: `feat(vendas): base do módulo`.

| Arquivo | O que entra |
|---|---|
| `apps/api/prisma/schema.prisma` + `prisma/migrations/<timestamp>_vendas_arrecadacao/` | os 5 modelos da SPEC "Dados", `@@unique`, relação composta com `Unidade` (+ campo inverso). Timestamp maior que `20261021120000`; conferir de novo o próximo livre |
| `apps/api/src/comum/prisma/guarda-clube.ts` + `guarda-clube.spec.ts` | 5 modelos em `MODELOS_DE_CLUBE`; lista literal e título do teste |
| `packages/shared/src/permissoes.ts` + `permissoes.test.ts` + `apps/api/src/permissoes/permissoes.spec.ts` | `venda.gerenciar` (ADM); 26 → 27 |
| `apps/api/src/app.module.ts` + `apps/api/src/vendas/vendas.module.ts` | módulo vazio registrado |
| `apps/web/src/layouts/MenuDoAdm.tsx` + `layouts/layouts.test.tsx` | item "Vendas" depois de Biblioteca (ícone do `lucide-react`, ex.: `ShoppingBag`); teste da ordem e da tabela rótulo→rota |
| `apps/web/src/rotas.tsx` + `apps/web/src/modulos/vendas/rotas.tsx` (esqueleto) + `rotas.test.tsx` | `rotasAdmVendas` exportado, com `/adm/vendas`, `/adm/vendas/nova`, `/adm/vendas/:id`, `/adm/vendas/:id/editar`, `/adm/vendas/:id/pedidos/novo`, `/adm/vendas/:id/pedidos/:pedidoId` |

Gate da onda: `npm run tipos` e os testes dos arquivos tocados (pelo `scripts/agente-stack.sh testar`).

## Pacotes

Todos: TDD; relatório de até 15 linhas; teto de **80 turnos**; **não rodam git**; testes pelo
`scripts/agente-stack.sh testar` (ou `pesado testar`), nunca `jest`/`vitest` direto. Cada pacote recebe só as
linhas do `ONDE FICA` da SPEC que lhe cabem, com o `conferido em`.

| # | Pacote | Arquivos que ALTERA (6–10) | Pronto quando |
|---|---|---|---|
| P1 | **Shared** | `packages/shared/src/contratos/vendas.ts` (+ `.test.ts`), `packages/shared/src/vendas.ts` (+ `.test.ts`), `packages/shared/src/index.ts` | schemas de entrada e saída, união discriminada da forma de pagamento, limites D16, `totalDoPedido`, `rotuloDaSituacao`, filtros do painel; testes de limites e do total |
| P2 | **API: venda** | `apps/api/src/vendas/` → `constantes.ts` (trava `venda:<id>`), `vendas.controller.ts`, `vendas.service.ts`, `vendas.service.spec.ts`, `vendas.controller.spec.ts` | rotas `/vendas` (criar, listar, ler, editar, encerrar, reabrir), `escrever` com trava, tabela "O que a API recusa" da parte de venda, 404 entre clubes |
| P3 | **API: pedidos e painel** | `pedidos.controller.ts`, `pedidos.service.ts`, `painel.service.ts`, `pedidos.service.spec.ts`, `painel.service.spec.ts`, `vendas-isolamento.spec.ts`, `vendas-concorrencia.spec.ts`; registra os providers em `vendas.module.ts` | lançar, editar, pagar, entregar, cancelar, listar com filtro/busca/página, painel pelo glossário; matriz de estados; isolamento nos `include` aninhados; dois lançamentos simultâneos com números distintos |
| P4 | **Web: venda** | `apps/web/src/api/vendas.ts` (todas as chamadas, inclusive de pedidos), `apps/web/src/testes/handlers/vendas.ts` (todas as rotas), `modulos/vendas/TelaVendas.tsx`, `FormularioVenda.tsx`, `TelaNovaVenda.tsx`, `TelaEditarVenda.tsx`, testes de cada tela | telas 1, 5 e 6 do desenho; produtos e formas de pagamento no formulário; estados vazio/erro/carregando |
| P5 | **Web: painel e pedido** | `modulos/vendas/TelaPainelVenda.tsx`, `TabelaDePedidos.tsx`, `FormularioPedido.tsx`, `TelaLancarPedido.tsx`, `ResumoAoVivo.tsx`, testes | telas 2 e 3 do desenho; total ao vivo com `totalDoPedido`; ações pagar/entregar/cancelar; encerrar/reabrir |
| P6 | **Web: imagem do pedido** | `modulos/vendas/imagem/montarImagemDoPedido.ts` (+ `.test.ts`), `desenharImagem.ts` (canvas), `compartilhar.ts` (+ `.test.ts`), `TelaResumoDoPedido.tsx` (+ `.test.tsx`) | tela 4 do desenho; conteúdo puro testado (pendente mostra "Como pagar", pago não; retirada x entrega; texto longo); Baixar sempre, Compartilhar só com `canShare({ files })`; espera as fontes |

Donos de arquivo: `api/vendas.ts` e `handlers/vendas.ts` são do **P4**; P5 e P6 só os leem (se faltar uma
chamada, o P5/P6 reporta; não edita). `vendas.module.ts` nasce na Onda 0; P2 e P3 só acrescentam providers,
um de cada vez (P3 só começa depois de P2).

## Ondas

| Onda | Roda | Por quê nesta ordem |
|---|---|---|
| 0 | principal | base compartilhada (acima) |
| 1 | P1 | os dois lados dependem dos contratos |
| 2 | **P2 ‖ P4** | arquivos disjuntos; P4 usa os handlers falsos (MSW), não a API |
| 3 | **P3 ‖ P5 ‖ P6** | P3 depende de P2; P5 e P6 dependem de P4 (chamadas e handlers); arquivos disjuntos |
| 4 | fechamento | abaixo |

Em paralelo ninguém roda `git`. Commit do principal por onda (skill `commit`).

## A conta

6 pacotes de 6 a 10 arquivos (44 arquivos alterados fora a Onda 0): é o ponto ótimo medido (6 pacotes de
10, 1,00× contra 1,34× de 12 pacotes de 5 e 1,42× de 3 de 20). Seis pisos de ~27k somam ~160k de
overhead, perto de 2% do total. Inline no principal seria mais barato no papel e pior na prática: o contexto
do principal é o único que não se recicla. A Onda 0 fica inline porque são arquivos de dono compartilhado.

## Onda 4 — fechamento

1. `gestor-pr`: push de revisão, PR em **rascunho**; **pergunte ao usuário se quer validar localmente** e
   grave (`ambiente validacao`).
2. Revisão (ritual de `pr-pronta.md`): rodada 1 só do que esta sessão entregou, por categoria; rodada 2
   exaustiva e última.
3. Suíte completa uma vez, depois da revisão limpa (`testador`, `pesado testar --tudo`), e `npm run tipos`.
4. `documentador`: README (cita a Biblioteca) e a lista de módulos, a partir do diff.
5. QA com `qa-roteiro`/`qa-runner` nas 6 telas. **Pré-condição:** o ambiente local não semeia `Unidade`,
   venda nem produto (`clube-criar` cria classes, ranking e biblioteca). O roteiro começa criando duas
   unidades pela tela, depois a venda "Lasanhas" (3 produtos a R$ 25, taxa R$ 5, Pix e 7me), e só então
   pedidos. O e2e não roda local.
6. `gh pr ready` só com revisão limpa e suíte verde; depois `ambiente listar` e perguntar o destino.

## O que NÃO quebra (já conferido)

- `varredura-de-rotas.spec.ts` exige um decorador por rota: cumprido com `@Pode('venda.gerenciar')`.
- `layouts.test.tsx` linhas 72 e 90 (6 links no layout de celular): não mudam, a fase é só do Adm.
- `INCLUIR_UNIDADE` e a Visão Geral: não ganham o campo inverso de vendas.
- Nenhum upload novo: `nginx.conf` não muda. A CSP já aceita `blob:` e `data:`.
- `carga.sh` e `clube-criar`: não mudam. Não há migration de dados.
- Fixtures de teste de Unidade e de permissões: só os números (26 → 27) e a lista de modelos mudam.

## Contrato de retorno de cada pacote

1. pacote concluído; 2. arquivos tocados (caminhos); 3. testes do pacote: verdes e nomes que falharam;
4. decisões que teve de tomar sozinho, uma linha cada; 5. pendências. Sem diff e sem trecho de código.

## Comando para o orquestrador

```
Você é o orquestrador (skill orquestrador) da feature "Vendas de arrecadação".
Onde roda: worktree /home/robertogabrieu/projetos/desbravadores/.claude/worktrees/venda-arrecadacao. Continue nela; não crie outra. Renomeie a branch para feature/venda-arrecadacao antes do primeiro commit. Base main em 40fb814.
Leia: docs/fases/venda-arrecadacao/PLANO.md e SPEC.md (uma vez), e abra modelo/Vendas.html só pelo implementador de tela.
Decisões travadas (não reabrir): D1–D19 da SPEC, em especial: Diretoria = campo daDiretoria no pedido (não é Unidade); preço e taxa gravados no pedido; imagem em canvas no navegador, sem biblioteca nova; venda encerrada é só leitura; pedido pago não muda itens; último a gravar vale.
Fora de escopo: celular, importar planilha, pagamento parcial, Compras/Doadores, aviso ao comprador, integração com o 7me, filtro de cancelados.
Execute a Onda 0 você mesmo, depois as ondas 1 a 3 com implementadores, nos pacotes P1–P6 do plano. Ninguém além de você roda git.
Gate: revisão limpa, depois suíte completa verde, npm run tipos verde, QA das 6 telas. Reporte no formato do passo 5 do orquestrador. PR em rascunho até o gate passar; pergunte ao usuário sobre validação local antes do push de revisão.
```

ONDE FICA
- a SPEC e o desenho                         docs/fases/venda-arrecadacao/SPEC.md, modelo/Vendas.html
- molde de módulo e de trava                 apps/api/src/biblioteca/, apps/api/src/biblioteca/constantes.ts:8
- base compartilhada da Onda 0               schema.prisma:551 e :907, guarda-clube.ts:4, permissoes.ts:31, MenuDoAdm.tsx:46, rotas.tsx:16 e ~108
- testes que mudam                           permissoes.test.ts:6-7, permissoes.spec.ts:20-26, guarda-clube.spec.ts:72-122, layouts.test.tsx:132 e :160-172, rotas.test.tsx:76
- conferido em                               40fb814
