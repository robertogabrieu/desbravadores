# Biblioteca: livros físicos e empréstimos — PLANO

Spec: [`SPEC.md`](SPEC.md) (rascunho 4, aprovada e revisada duas vezes). Desenho:
[`modelo/Biblioteca-Fisica.html`](modelo/Biblioteca-Fisica.html), **vence a spec em caso de empate**.
Do desenho copia-se estrutura, ordem e texto; **nunca CSS** (as classes saem dos tokens e de
`apps/web/src/ui/`).

Branch `worktree-biblioteca-fisica`, base `main` em `5183b30` (conferir `git rev-list --count HEAD..origin/main`
antes de começar). Sem PR aberto tocando os mesmos arquivos (conferido na revisão 1). Próxima migration:
depois de `20261013120000_passkeys`.

## Decisões travadas (não se reabrem)

1. Livro físico = `ItemBiblioteca` com `tipo`; exemplar e empréstimo são modelos próprios (D1, D2).
2. Prazo fixo de 14 dias, só de leitura; o contrato não tem campo de devolução (D5).
3. Um empréstimo aberto por exemplar e um por desbravador: lock do clube no método `escrever` +
   índices únicos parciais; erro de índice vira 409 **fora** da transação (D11, D13, D15).
4. `biblioteca.emprestar` (ADM, CONSELHEIRO, INSTRUTOR); cadastrar, baixa e remover em
   `biblioteca.gerenciar`. Falta de permissão é **403**; só outro clube ou inexistente é 404.
5. Diretoria vê com quem está o livro; aba Empréstimos e `GET /biblioteca/emprestimos` só do Adm.
6. Sem aviso de atraso, sem importação, sem renovação, sem desfazer baixa ou devolução.
7. Livro físico tem rota e método próprios de criação (`itens-fisicos`); a capa vem num passo depois.

## Fora de escopo (quem "conserta de passagem" refaz)

Aviso de atraso, importar planilha, renovar, multa, reserva, código de barras, desfazer baixa e
devolução, trocar o tipo de um livro, qualquer mudança na biblioteca digital além do que o campo
`arquivoId` nulo exige, e **e2e rodando localmente** (só no CI).

## A conta do fatiamento

~56 arquivos tocados, em 5 pacotes de 6 a 12 arquivos (alvo 6–10, teto 15), mais um pacote do principal
com os arquivos de dono compartilhado. Menos que 5 pacotes juntaria API e tela no mesmo agente e passaria
de 15 arquivos; mais que 5 repagaria o piso (~27k cada) sem ganho. Cortes por **fluxo vertical** dentro de
cada lado (API / tela), nunca por camada. Teto de turnos: **80 por pacote**.

## Níveis

| Nível | O que faz |
|---|---|
| **Sessão** | uma só; troca de sessão só se o contexto do principal passar de ~60% |
| **Principal** | P0 abaixo (migration, schema, permissão, lista de modelos), fatiamento, commits, conferência dos relatórios, revisão, `gestor-pr` |
| **`implementador`** | P1 a P5, cada um com contrato de retorno de até 15 linhas |
| **`testador`** | suíte inteira só se o CI não estiver disponível; filtrada, quem roda é o implementador via `pesado testar` |
| **`documentador`** | README e docs no fim |

## P0 — principal, antes de delegar (dono compartilhado)

Escreve o principal, em commit próprio, porque todos os pacotes dependem e são ímãs de conflito.

| Arquivo | O que entra |
|---|---|
| `apps/api/prisma/schema.prisma` | `tipo` e `arquivoId?` em `ItemBiblioteca`; `ExemplarBiblioteca`; `EmprestimoBiblioteca`; relações em Clube, Usuario, Desbravador; `@@unique([clubeId,id])` e FKs compostas |
| `apps/api/prisma/migrations/20261021120000_biblioteca_fisica/migration.sql` | tabelas, `tipo` com padrão `DIGITAL` nas linhas existentes, CHECK `tipo = FISICO ⇔ arquivoId nulo` (escrito à mão, como `20261009120000_substituicao`), dois únicos parciais onde `devolvidoEm` é nulo (padrão: `20260930120000_fase2_3_instrutor_adm`) |
| `packages/shared/src/permissoes.ts` | `biblioteca.emprestar` com padrão dos três papéis |
| `packages/shared/src/permissoes.test.ts`, `apps/api/src/permissoes/permissoes.spec.ts` | contagem 25 → 26 |
| `apps/api/src/comum/prisma/guarda-clube.ts`, `guarda-clube.spec.ts` | os dois modelos novos em `MODELOS_DE_CLUBE` |
| `apps/web/src/rotas.tsx` | rota `/biblioteca/livros/:id` (detalhe) apontando para um componente que o P5 cria |

Gate do P0: `npx prisma validate`, `npx prisma generate`, migration aplicada em banco de teste, e os 3 testes
de contagem passando.

## Ondas e pacotes

```
P0 (principal) → Onda 1: P1 → Onda 2: P2 ‖ P4 → Onda 3: P3 ‖ P5
```

P2 e P3 são a pista da API (mesmo banco de teste: nunca juntos). P4 e P5 são a pista da tela (sem banco).
Pistas paralelas tocam arquivos disjuntos; **ninguém roda git**.

### P1 — contratos e regras compartilhadas (`packages/shared`, 6 arquivos)

Entrega: `ItemBibliotecaSaida` como união por `tipo`; contratos de livro físico, exemplar, empréstimo,
busca de desbravador e da aba Empréstimos (`totais` + `itens`); constante `PRAZO_DE_EMPRESTIMO_EM_DIAS`;
`somarDiasAData`; `situacaoDoEmprestimo` (NO_PRAZO / VENCE_HOJE / ATRASADO + dias); campo `livrosAtrasados`
em `VisaoGeralSaida` (`null` ou `{ total, itens }`); textos de disponibilidade e situação.
Arquivos: `contratos/biblioteca.ts`, `contratos/visao-geral.ts`, `datas.ts`, testes de `datas` e de
contrato, `index.ts`. Pronto: `situacaoDoEmprestimo` com casos de virada de mês e de ano, "1 dia" e "N dias";
o contrato recusa campo de devolução na criação de empréstimo; `npm run tipos` verde no pacote.

### P2 — API: livro físico e exemplares (7 arquivos)

Entrega: tratar `arquivoId` nulo em todos os pontos da tabela da spec ("O que o `arquivoId` nulo quebra");
`POST /biblioteca/itens-fisicos`; acrescentar exemplares e dar baixa; `GET /biblioteca` com `total` e
`disponiveis` nos físicos; remover livro físico com a recusa do D18; limpeza de arquivos sem PDF.
Arquivos: `biblioteca.service.ts`, `biblioteca.controller.ts`, `limpeza-de-materiais.ts`, `biblioteca.spec.ts`,
`limpeza-de-materiais.spec.ts`, `varredura-de-rotas` se precisar. Pronto: listar, editar, trocar capa, mover,
remover e limpar **não quebram sem PDF**; todas as linhas "recusa" da spec que dizem respeito a exemplar e
remoção têm teste com a mensagem exata; isolamento por `include` de outro clube; `npm run tipos`.

### P3 — API: empréstimos, busca e Visão Geral (11 arquivos)

Entrega: `EmprestimosService` e controller novos (emprestar, devolver, listar com `totais`, exemplares com
histórico), busca de desbravadores do D7, campo `livrosAtrasados` na Visão Geral (função própria com teste,
no padrão de `chamadas-classe-biblica.ts`), permissões e códigos HTTP conforme a spec.
Arquivos: `emprestimos.service.ts`, `emprestimos.controller.ts`, `emprestimos.spec.ts`, `biblioteca.module.ts`,
busca (em `desbravadores/` ou `biblioteca/`), `visao-geral.service.ts`, `livros-atrasados.ts`,
`livros-atrasados.spec.ts`, `visao-geral.spec.ts`, `varredura-de-rotas.spec.ts` se precisar, `app.module.ts` se
precisar. Pronto, todos com teste: concorrência (mesmo exemplar; **exemplares diferentes ao mesmo
desbravador**; baixa cruzando; devolução dupla), cada linha da tabela de recusas, 403 de conselheiro e
instrutor na lista do Adm, conselheiro empresta a desbravador de outra unidade e classe, ajuste desligado
nega rota de exemplares e busca, devolução em D+14 exata, `devolverAte` ignorando campo vindo do cliente,
`livrosAtrasados` `null` sem livro físico e `total: 0` com livro, selo igual ao da aba.

### P4 — tela: estante física, abas e Visão Geral (≈12 arquivos)

Entrega: abas Digitais | Físicos | Empréstimos para o Adm; alternador para quem não gerencia; cartão físico
(pílula, Emprestar com menor exemplar livre, Exemplares, Opções); diálogo Adicionar com tipo e quantidade, mais
o passo de capa; vazios; estados (carregando, vazio, erro, sem conexão); cartão "Livros atrasados" na Visão Geral.
Arquivos: `TelaBiblioteca.tsx`, `CartaoDoItem.tsx`, `DialogosDaBiblioteca.tsx`, componente novo da aba
Físicos, `api/biblioteca.ts`, `testes/handlers/biblioteca.ts`, `biblioteca.test.tsx`, `Pendencias.tsx`,
`testes/handlers/visao-geral.ts`, teste da Visão Geral, `rotas.tsx` do módulo. Pronto: textos conforme a tabela
"Textos (cópia exata)"; cartão sem `Ler`/`Baixar` nos físicos; digital intacto; medido no DOM em 390, 820 e
1280 px; `npm run tipos` e testes de tela.

### P5 — tela: detalhe, Emprestar, Devolver e aba Empréstimos (≈11 arquivos)

Entrega: detalhe do livro (`/biblioteca/livros/:id`, com recarga), diálogos Emprestar e Devolver com mensagens de
recusa junto do botão, busca do desbravador (2 letras, 20 resultados, apagado com motivo), aba Empréstimos (chips,
filtro, busca, tabela, selo da aba), ações do Adm no detalhe (acrescentar exemplares, dar baixa, com confirmação).
Arquivos: componentes novos de detalhe, dois diálogos, aba, `api/emprestimos.ts`, handlers, testes e o e2e
em `e2e/adm.spec.ts`. Pronto: "devolver até" e "devolvido em" **não editáveis**; sem internet os dois diálogos
ficam desligados com o motivo; conselheiro sem a permissão não vê Emprestar nem Exemplares; cada tela do
mockup vira item do roteiro de QA.

## O que não quebra (verificado, não precisa conferir)

- Rotas de renomear, editar, capa e mover item usam `exigirItemAtivo` e valem para físico sem mudança.
- `scripts/carga.ts` e `clube-criar.ts` só semeiam as 3 categorias: nada a mudar.
- Atalhos do Início do conselheiro e do instrutor só apontam para a rota `/biblioteca`.
- Upload: livro físico não envia arquivo de tamanho novo, então o nginx não muda.
- Não existe semente de QA no repositório; o roteiro cria o que precisa (ver spec).

## Depois dos pacotes

1. `gestor-pr`: PR em rascunho já com spec e plano (passo da skill `spec-e-plano` §7); push de revisão ao fim.
2. Revisão da PR inteira (`code-review`), duas rodadas, como em `rules/pr-pronta.md`.
3. Suíte: o CI é o gate. Sem CI, `testador` com `pesado testar --tudo`.
4. `documentador`: README (linhas 81 e 139) e `docs/`.
5. QA de interface com `qa-roteiro` (uma linha por tela do mockup). e2e só no CI.

## Comando para quem executa

```
Modo orquestrador. Worktree: /home/robertogabrieu/projetos/desbravadores/.claude/worktrees/biblioteca-fisica
(branch worktree-biblioteca-fisica; continue nela, não crie outra). PR em rascunho: <número>.
Leia, uma vez, docs/fases/biblioteca-fisica/SPEC.md e PLANO.md; o desenho é
docs/fases/biblioteca-fisica/modelo/Biblioteca-Fisica.html e vence a spec no empate.
Execute o P0 você mesmo, depois as ondas do PLANO com o agente `implementador`, um pacote por vez dentro da pista.
Decisões travadas e fora de escopo estão no PLANO; não reabra nem amplie.
Gate: npm run tipos, lint e testes dos pacotes verdes; suíte inteira só pelo CI; revisão limpa antes de tirar do rascunho.
Reporte no formato do passo 5 do orquestrador.
```

## ONDE FICA

O bloco completo, com `arquivo:linha`, está no fim da [`SPEC.md`](SPEC.md). Recorte por pacote:

```
- P0  schema.prisma:1246,1263 ; migrations/20261013120000_passkeys (última) ; guarda-clube.ts:4-50 ; guarda-clube.spec.ts:70-90 ; permissoes.ts:12-48 ; permissoes.test.ts:6-7 ; permissoes.spec.ts:20,26
- P1  contratos/biblioteca.ts:19-45 ; datas.ts:30 ; contratos/visao-geral.ts
- P2  biblioteca.service.ts:55-60,74-77,204-205,276-290,385-392,455-466 ; biblioteca.controller.ts:33-126 ; constantes.ts:7 ; limpeza-de-materiais.ts:58-70 ; biblioteca.spec.ts:115,268,710
- P3  escopo.service.ts:60-64 ; desbravadores.controller.ts:23 ; visao-geral.service.ts:90-136 ; visao-geral.controller.ts:10 ; padrão: visao-geral/chamadas-classe-biblica.ts
- P4  TelaBiblioteca.tsx:25,102,105-184 ; CartaoDoItem.tsx:14-62 ; DialogosDaBiblioteca.tsx ; Pendencias.tsx:10,24,112-120 ; api/biblioteca.ts:127 ; testes/handlers/biblioteca.ts:10-11
- P5  mockup telas 2, 4, 5, 7, 9 ; padrão de tabela: lista de desbravadores do Adm ; e2e/adm.spec.ts:243-253
- conferido em  39596a4 (spec rascunho 4)
```
