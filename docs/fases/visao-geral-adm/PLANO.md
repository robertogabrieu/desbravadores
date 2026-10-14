# Visão geral do Adm: atalhos do dia a dia — PLANO

Execução da [SPEC](SPEC.md). Leia a SPEC inteira antes de delegar: as decisões D1 a D8 e os
critérios de pronto de R1 a R7 estão lá e não se repetem aqui. O desenho é
[`mockup.html`](mockup.html) e **vence a SPEC em caso de divergência**.

Branch `feature/visao-geral-atalhos`, base `main` em `61f95b6`. Não há issue aberta: ao abrir a PR,
o `gestor-pr` pergunta ao usuário o número (a convenção é `feature/issue-N-*`) e renomeia se houver.

## A conta do fatiamento

Escopo estimado depois da revisão: **~24 arquivos alterados**, de dois tipos que não se misturam (API e tela).

| Arranjo | Resultado |
|---|---|
| 1 pacote de ~24 arquivos | passa do teto de 15; entra na parte alta da curva em U (custo por arquivo ~2×) |
| **2 pacotes (API ~11 · tela ~13)** | **dentro do teto de 15 cada; arquivos disjuntos, rodam em paralelo** |
| 4 pacotes de ~6 | no limite do mínimo; paga 4 pisos de ~27k para economizar releitura que não existe |

O pacote da tela é o que chega perto do teto: se passar de 14 arquivos, os testes de pendências e de folha vão para arquivos próprios
em vez de crescer o `visao-geral.test.tsx`. Fica o segundo arranjo. Fatiado por **tipo de trabalho** e não por fluxo vertical porque o contrato
(escrito antes, pelo principal) separa os dois lados: a tela é testada contra respostas simuladas
e a API contra o banco de teste, sem um depender do outro.

## Níveis

| Nível | Faz |
|---|---|
| **sessão** | uma só; não há troca de repo nem de fase |
| **principal** | contrato compartilhado, commit por onda, conferência dos relatórios, revisão, PR |
| **`implementador`** ×2 | Pacote API e Pacote Tela (em paralelo, ninguém roda `git`) |
| **`testador`** | a suíte inteira, uma vez, depois da revisão limpa (ou o CI, se estiver de pé) |
| **`documentador`** | no fim, a partir do diff |
| **`qa-runner`** | o roteiro do Passo 5, no navegador |
| **`gestor-pr`** | push de revisão, PR em rascunho, tirar do rascunho |

## Passo 0. Principal: o contrato (antes de delegar)

Único arquivo de dono compartilhado: `packages/shared/src/contratos/visao-geral.ts`. O principal
acrescenta a `VisaoGeralSaida` quatro campos, **todos com `.default`** para a resposta antiga continuar
válida (SPEC, "O que não quebra"). Nomes podem ser ajustados pelo principal; a semântica não.

| Campo | Forma | SPEC |
|---|---|---|
| `classesSemCronograma` | lista de `{ classe: RefClasse }`, par contado uma vez; padrão `[]` | R4 |
| `unidadesSemChamada` | `{ reuniao: DataCivil, unidades: { id, nome, conselheiros }[] } \| null`; `null` quando o calendário ainda não tem dia de reunião; padrão `null` | R5 |
| `proximoEvento` | `{ id, nome, tipo, inicio, fim, horario, local } \| null`; `horario` e `local` nulos quando não houver (`contratos/calendario.ts:15-16`); padrão `null` | R3 |
| `chamadasClasseBiblica` | lista de `{ encontroId, data, grupoId, grupoNome }`, mais recente primeiro; padrão `[]` | R2 |

Notas do contrato: use `.nullable().default(null)` e **não** `.nullish`; `eventosSemLista` já mostra o padrão `.default([])` no mesmo objeto.
Como `z.infer` dá o tipo de saída, o serviço da API é obrigado pelo compilador a preencher os quatro campos, e o simulador de resposta
da tela (`criarVisaoGeral`) também; é o comportamento desejado.

Commit local: `feat(shared): campos de pendências na visão geral`.

## Passo 1. Já respondido na revisão (vai nos briefings, não precisa de investigador)

- `/adm/cronogramas?classe=<id>` **já abre** a montagem de uma classe sem cronograma (`MontagemAdm.tsx:21,31,56`): nenhum arquivo extra.
- **Dias de reunião no servidor:** não há função pronta. A fórmula é pura, em `packages/shared/src/formulas/calendario.ts:82`; o
  Pacote API a chama com os eventos do clube e o dia de reunião do clube (`clube.service.ts`, `servico-eventos.ts`), no ano de hoje
  e no ano anterior (SPEC, R5).
- **Classe Bíblica no servidor:** consulta **própria**, em arquivo novo da pasta da visão geral, com consultas separadas e `clubeId`
  em cada uma, no modelo de `apps/api/src/sync/pacote-classe-biblica.service.ts:35-60`. **Não** exportar serviços de `ClasseBiblicaModule`
  (`servico-painel` e `servico-chamada` não são exportados, e mexer lá sai da lista de arquivos do pacote).

## Pacote API (`implementador`) — ~11 arquivos, teto de 80 turnos

Entrega R2 (dados), R3, R4 e R5 em `GET /api/visao-geral`, em TDD.

| Arquivo | Papel |
|---|---|
| `apps/api/src/visao-geral/visao-geral.service.ts` | chama os quatro cálculos novos e os junta à resposta |
| `apps/api/src/visao-geral/visao-geral.module.ts` | só se os cálculos novos pedirem provedor novo; o plano não prevê importar `ClasseBiblicaModule` |
| 4 arquivos novos na mesma pasta, um por campo | cada cálculo isolado e testável (`classes-sem-cronograma`, `unidades-sem-chamada`, `chamadas-classe-biblica`, `proximo-evento`) |
| 4 arquivos de teste, ao lado | os casos listados em R2 a R5 da SPEC, um arquivo por campo |

Proibido: `schema.prisma` (nenhum modelo muda), os campos antigos da resposta, `ClasseBiblicaModule` e seus serviços, `apps/web`.
Gotchas do `CLAUDE.md` que valem aqui: toda consulta leva `clubeId`; `include` aninhado não passa pela
guarda de clube, então os testes de isolamento entre clubes são obrigatórios, **um por campo**; `npm run tipos` é a checagem
de tipos (o Jest não checa); testes de integração criam banco próprio.

Regras que a revisão adversarial achou e o briefing repete: "última reunião" é **estritamente antes de hoje**; procurar também no
ano anterior; a Classe Bíblica filtra cancelado, edição não terminada e grupo removido, e o encontro remarcado vale pela data nova;
unidade sem desbravador **na data da reunião** não conta; evento cancelado e tipo Classe Bíblica ficam fora do próximo evento.

Pronto quando: os casos de R2 a R5 verdes pelos arquivos tocados; `npm run tipos` limpo; o `apps/api/src/visao-geral/visao-geral.spec.ts`
que já existe continua verde **sem alteração** (a resposta só ganhou campos).

## Pacote Tela (`implementador`) — ~13 arquivos, teto de 80 turnos

Entrega R1, R2 (comportamento do botão e folhas), R3 (cartão), R4 e R5 (listas), R6, R7, em TDD.

| Arquivo | Papel |
|---|---|
| `apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx` | `Conteudo` passa a ter só os blocos do desenho; saem os blocos antigos, seus componentes internos e o vazio de página inteira |
| `apps/web/src/modulos/adm/visao-geral/AtalhoDeSubstituto.tsx` | vira botão primário de 56px que abre a escolha em folha; mesmos dados e mesma orientação sem unidade/classe (R1) |
| 5 componentes novos na mesma pasta | atalhos, próximo evento, pendências, prévia do ranking, folha de escolha da chamada |
| 1 função pura nova + o teste dela | decide "abre direto / folha / folha vazia" a partir da lista de pares (0, 1, 2+) |
| `visao-geral.test.tsx` | reescrito: estados de carregando/erro/sem conexão e atalhos; o vazio de página inteira e os blocos antigos saem; o teste de substituto (296-330) se adapta ao formato novo |
| testes das pendências e da folha | em arquivo próprio se o `visao-geral.test.tsx` passar de ~400 linhas |
| `apps/web/src/testes/handlers/visao-geral.ts` | resposta simulada com os campos novos (único consumidor de `criarVisaoGeral`) |
| hooks de gravar chamada da Classe Bíblica e de criar/editar/excluir evento (`api/classe-biblica*`, `api/calendario.ts`) | invalidar `chavesVisaoGeral.todas` onde ainda não invalidam (SPEC, R7), cada um com teste |

Proibido: `apps/api`, `packages/shared`, o menu e as telas de destino.
Componentes vêm de `apps/web/src/ui/` (SPEC, topo); **do mockup não se copia CSS**. `layouts/margemDoAdm.test.ts`
tem que continuar verde (ele varre os `.tsx` novos por padding lateral em contêiner de página).

Pronto quando: testes dos arquivos tocados verdes; `tsc` e lint limpos; `reunioes-adm.test.tsx` e `marcas.test.tsx` seguem verdes.

## Passo 2. Principal: conferir e versionar

Por pacote que volta: `git diff --stat`, e `git diff` dirigido no ponto que o relatório disse ter sido
difícil. Commit pela skill `commit`, um por pacote. Pacote incompleto: redelegar o resto com briefing novo.

## Passo 3. Revisão antes da suíte

1. `gestor-pr`, "push de revisão": sobe sem suíte, abre a PR em rascunho (ou atualiza a que já existe).
2. **Pergunte ao usuário se quer validar localmente** (`rules/pr-pronta.md`, passo 2).
3. Revisão da PR inteira (skill `code-review`), até três rodadas; consertos ficam locais.

## Passo 4. Suíte, uma vez

CI se estiver de pé; senão `testador` com `pesado testar --tudo`. Conferir **só os nomes que falharem**
contra `main`. Falha que é do app e não do teste volta como decisão do usuário.

## Passo 5. QA e documentação

`qa-runner` com roteiro ancorado no desenho — **um item por bloco do mockup**:

| Item | Verifica |
|---|---|
| Q1 | computador: os três botões na ordem; só o primeiro verde |
| Q2 | "Novo evento" abre o formulário vazio e o voltar retorna à visão geral |
| Q3 | "Lançar chamada": com 1, 2+ e 0 pendentes, os três caminhos |
| Q4 | próximo evento: cartão, clique, estado vazio |
| Q5 | classes sem cronograma: "Montar" abre a classe certa |
| Q6 | unidades sem chamada: data, 5 linhas no máximo, "E mais N" |
| Q7 | ranking: 5 linhas, "Ver ranking completo", carregando e erro dentro do cartão |
| Q8 | "tudo em dia" nos dois cartões |
| Q9 | celular (390px): mesma ordem, uma coluna, toque ≥ 44px, sem rolagem horizontal |

`documentador` com a branch e a base. Depois o `gestor-pr` sobe o que falta e tira do rascunho
(`rules/pr-pronta.md`, passo 6); o ambiente que ficou no ar vai a quem decide (passo 7).

## O que não quebra

- `GET /api/visao-geral` para quem consome os campos antigos: a resposta só ganha campos.
- Os inícios do conselheiro e do instrutor e o menu do Adm: nenhum arquivo deles muda.
- O comportamento do atalho de substituto (quem pode gerar, a orientação sem unidade/classe, a tela de geração de cada destino). A forma muda (R1).
- Os e2e (Playwright): nenhum abre a `/adm` nem procura os blocos antigos; `fundacao.spec.ts:32` e `domingo.spec.ts:50` clicam "Novo desbravador" na lista de
  desbravadores, não no cabeçalho da visão geral (confiança média: busca por texto).
- Nenhuma migration, nenhuma permissão nova, nenhuma tradução nova (os textos ficam nos componentes, como o resto da tela).

## ONDE FICA

- o contrato  `packages/shared/src/contratos/visao-geral.ts`
- onde a API monta a resposta  `apps/api/src/visao-geral/visao-geral.service.ts` (`cronogramasAguardando` :259, `resumoDasUnidades` :238)
- a tela  `apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:284-345`
- a regra de chamada pendente da Classe Bíblica a espelhar no servidor  `apps/web/src/modulos/inicio/CartaoClasseBiblica.tsx:22-52`
- testes e mocks  `visao-geral.test.tsx`, `apps/web/src/testes/handlers/visao-geral.ts`, `apps/web/src/layouts/margemDoAdm.test.ts`
- conferido em  `61f95b6`

## Comando de execução

```
Você é o orquestrador (skill orquestrador). Execute o plano da visão geral do Adm.

ONDE RODA: worktree /home/robertogabrieu/projetos/desbravadores/.claude/worktrees/visao-geral-atalhos,
branch feature/visao-geral-atalhos, base main em 61f95b6. Continue nesses; não crie outra branch.
PR em rascunho: a que o gestor-pr abrir no push de spec (número no fechamento desta etapa).

LEIA PRIMEIRO: docs/fases/visao-geral-adm/SPEC.md e PLANO.md. O desenho é docs/fases/visao-geral-adm/mockup.html
e vence a SPEC em caso de divergência. Do desenho copie estrutura e texto, nunca CSS.

DECISÕES TRAVADAS (não reabra): as 5 da SPEC e D1 a D8. Em especial: sem cronograma = sem nenhuma linha no ano do
clube; "última reunião" = último dia de reunião do calendário até hoje; "última reunião" é estritamente antes de hoje;
chamada da Classe Bíblica e próximo evento vêm do servidor; "Novo desbravador" sai da tela; campos antigos da API ficam.

FORA DE ESCOPO: tela de Relatórios; limpar consultas antigas do servidor; tela do Adm para lançar chamada de
unidade; mudar o início do conselheiro e do instrutor; chamada com mais de 7 dias de atraso.

FAÇA: Passo 0 (contrato) você mesmo; o Passo 1 já está respondido no plano, repasse-o nos briefings; dois implementadores
em paralelo (Pacote API e Pacote Tela, 80 turnos cada); depois Passos 2 a 5 na ordem do plano, revisão antes da suíte.

GATE E RETORNO: PR fora do rascunho com revisão limpa, suíte verde (CI) e roteiro de QA Q1-Q9 passando. Reporte no
formato de fechamento do orquestrador, e traga como PENDÊNCIA qualquer coisa que tenha escolhido sozinho.
```
