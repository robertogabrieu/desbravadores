# Link de substituição — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** o Adm gera, para uma unidade ou classe e um dia de reunião, um link que abre sem login na
janela de 3 horas da reunião e leva o substituto às mesmas telas de chamada e de registro de classe
do titular, com a substituição e o autor registrados.

**Architecture:** uma credencial própria (JWT com `tipo: 'substituicao'`, conferida no banco a cada
requisição) aceita só em 8 rotas marcadas por decorador; a sessão de substituição é a mesma
`SessaoLogada` com `vinculoId` = id da substituição e escopo restrito ao alvo e ao dia. Autor é sempre
um `Usuario`: o membro reconhecido ou um usuário de substituição sem vínculo, criado na
identificação. No front, o `ProvedorSessao` se desliga na rota `/substituto/:token` e um
`ProvedorSessaoSubstituto` entrega às telas de hoje uma sessão sintética, com conexão, fila e trava
próprias.

**Tech Stack:** NestJS 11 + Prisma 7 (API, Jest sem checagem de tipos), React 19 + React Router 7 +
TanStack Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`, Postgres 17, Playwright (e2e,
headless, só escrito).

**Spec:** [SPEC.md](SPEC.md), com o desenho em [mockup.html](mockup.html) — **o desenho vence a
SPEC** (estrutura, ordem e texto; nunca CSS). **Branch:** `feature/substituicao-temporaria` ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/spec-substituicao-temporaria` ·
**PR:** a do commit da spec, em rascunho · **Base:** `main` em `6bc7e05` (`git rev-list --count
HEAD..origin/main` = 0 em 2026-10-09).

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared`; toda operação de
  modelo de clube leva `clubeId`, fora do escopo 404; `PrismaSistema` só em `sessao/`, `auth/`,
  `scripts/`; ids pelo Prisma Client; nunca apagar linha com histórico; usuário é global; testes de
  integração com banco próprio; Playwright headless.
- **Do desenho copia-se estrutura, ordem e texto, nunca CSS.** Classes dos tokens e de `ui/`.
- **Nenhum elemento `fixed`/`sticky` novo.** A faixa S4 rola com a página.
- **"classe", nunca "aula"**, em texto visível novo.
- **Testes antes da implementação, dentro de cada pacote:** todos escritos e vistos falhando, depois
  implementar, depois verde.
- **Validação pesada só no P5.** Por pacote: os testes do pacote e `tipos` do workspace.
- **Máquina fraca, tudo pelo `pesado`**, uma suíte pesada por vez:
  `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; testes de dentro do pacote,
  `cd apps/web|apps/api && pesado testar --script teste -- <caminhos>` (sem `--maxWorkers`); tipos
  `pesado -- npm run tipos -w web|api` ou da raiz; a espera da fila conta no tempo do Bash
  (`timeout: 600000` ou segundo plano).
- **`packages/shared` muda no P0.** A API lê o `dist/`: `pesado -- npm run build -w packages/shared`
  depois do P0 e antes de qualquer teste da API. O web lê o `src/` (`apps/web/vite.config.ts:70`).
- **Suíte inteira não roda local**: o gate é o CI (`.github/workflows/ci.yml`, job `verificar`:
  lint, tipos, teste de shared/api/web e build). O e2e não roda nesta máquina nem no CI: escrito e com
  tipos verdes.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`).

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** dono compartilhado: migration, schema, guarda de clube, enums e contratos do shared, decoradores, segmentos do Sentry, `nomeDoAutor` | agente principal (inline) | — |
| 1 | **P1a** credencial e guarda (API) | subagente `implementador` | P0 |
| 1 | **P3** telas do Adm (A1–A4) e R1 da reunião (web) | subagente `implementador` | P0 |
| 2 | **P1b** ciclo do link e rotas públicas (API) | subagente `implementador` | P1a |
| 2 | **P4a** sessão, cliente e fila do substituto (web) | subagente `implementador` | P0 |
| 3 | **P2a** rotas de hoje aceitam a credencial; pacote; data; marca (API) | subagente `implementador` | P1a |
| 3 | **P4b** destinos, alvo fixo e R1 da classe nas telas de hoje (web) | subagente `implementador` | P4a |
| 4 | **P2b** leitura da substituição e "(substituto)" (API) | subagente `implementador` | P0 |
| 4 | **P4c** telas do link S1–S8 e rotas `/substituto` (web) | subagente `implementador` | P4a, P4b, P3 |
| 5 | **P5** fase final | `implementador` (e2e) → revisão (opus) → `gestor-pr` → CI → `qa-runner` → `documentador` | todos |

**Paralelo: no máximo dois implementadores, um de API e um de web**, de arquivos disjuntos e sem
disputar banco de teste (a suíte da API cria banco próprio; a do web não usa banco).

| Onda | Par | Por que não se tocam |
|---|---|---|
| 1 | P1a ‖ P3 | P1a só em `apps/api/src/{sessao,comum,desbravadores/escopo*}` e `test/fabricas.ts`; P3 só em `apps/web/src/{api/substituicao.ts,modulos/adm/**,modulos/reunioes/detalhe/**,testes/handlers/substituicao.ts,testes/servidor.ts}`. |
| 2 | P1b ‖ P4a | P1b em `apps/api/src/{auth,substituicoes,usuarios}`, `sessao/refresh.service.ts`, `app.module.ts`; P4a em `apps/web/src/{sessao,offline,api/cliente.ts,testes/renderizar.tsx}`. |
| 3 | P2a ‖ P4b | P2a em `apps/api/src/{reunioes,aulas,cronogramas,sync}`; P4b em `apps/web/src/{modulos/reunioes/chamada,modulos/aulas,api/reunioes.ts,api/aulas.ts,substituicao/destinos*}`. |
| 4 | P2b ‖ P4c | P2b em `apps/api/src/{reunioes/reunioes.service.ts,aulas/aulas.service.ts,visao-geral,especialidades,progresso}` — `reunioes.service.ts` e `aulas.service.ts` não são tocados pelo P2a; P4c em `apps/web/src/modulos/substituto/**`, `modulos/acesso/rotas.tsx`, `testes/handlers/substituicao.ts`. |

**Compilação entre ondas:** o P0 cria decoradores e contratos sem consumidores, e os campos novos dos
contratos são `.nullable().default(null)`: nada quebra. O P1a não muda a assinatura de `SessaoLogada`
para quem já a usa (o campo `substituicao` é opcional). `tipos` da raiz verde no fim de cada onda.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 14 (migration, schema, guarda-clube + spec, enums, 4 contratos com `comum.ts`, `erros.ts`, 2 decoradores + `acesso.ts`, `url-sem-segredo` + teste, `nome-do-autor.ts`) | principal — dono compartilhado |
| P1a | 9 | implementador |
| P1b | 13 | implementador |
| P2a | 11 | implementador |
| P2b | 8 | implementador |
| P3 | 12 | implementador |
| P4a | 9 | implementador |
| P4b | 9 | implementador |
| P4c | 9 | implementador |
| P5 | 1 e2e + roteiro de QA | implementador + revisão + qa-runner + documentador |
| **Total** | **~93** | 9 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U — **591k com 1–2
arquivos, 256k com 6–10, 559k com 21+**. Todos os pacotes delegados ficam entre 8 e 13.

- **Fluxo vertical onde dá, camada onde não dá.** A API e o web são suítes e linguagens de teste
  diferentes; misturá-los num pacote faria o implementador alternar duas filas do `pesado`. Dentro de
  cada lado o corte é por assunto que fecha com teste: credencial; ciclo do link; rotas de hoje;
  leitura. Sessão e fila; telas de hoje; telas novas.
- **P0 passa de 6, mas é todo de dono compartilhado:** migration e schema são de todos; contratos e
  enums são consumidos por P1b, P2a, P2b, P3 e P4c; os decoradores por P2a; `nomeDoAutor` por P2a e
  P2b. Escritos antes, dois pacotes nunca editam o mesmo arquivo na mesma onda.
- **P1 e P2 partidos em dois:** juntos dariam 22 e 19 arquivos, acima do teto de 15.
- **P4 partido em três:** sessão/fila é infraestrutura com teste próprio, sem tela; as telas de hoje
  mudam pouco em muitos arquivos; as telas novas são as do desenho. Num pacote só, ~27 arquivos.

Orçamento por implementador: **~80 turnos**.

---

## P0 — dono compartilhado · agente principal (inline), onda 0

**Files:**
- Create: `apps/api/prisma/migrations/20261009120000_substituicao/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (enum `StatusUsuario` + `SUBSTITUTO`; enum `TipoSubstituicao`;
  modelo `Substituicao`; `substituicaoId` em `Reuniao` e `RegistroAula`; relações inversas em `Usuario`
  e `Clube`)
- Modify: `apps/api/src/comum/prisma/guarda-clube.ts:5-41` e `guarda-clube.spec.ts:72-73` (`Substituicao`)
- Modify: `packages/shared/src/enums.ts:4,23` (`SUBSTITUTO`)
- Create: `packages/shared/src/contratos/substituicao.ts` (+ export no índice dos contratos)
- Modify: `packages/shared/src/contratos/reunioes.ts:83-100` e `aulas.ts:61-71` (`substituicao`, nullable, default null)
- Modify: `packages/shared/src/contratos/comum.ts:24-42` e `apps/api/src/comum/erros.ts` (`SUBSTITUICAO_ENCERRADA`, 401)
- Modify: `apps/api/src/comum/decorators/acesso.ts` (constante do metadado extra, fora de `CHAVES_DE_ACESSO`)
- Create: `apps/api/src/comum/decorators/pode-ou-substituto.decorator.ts`, `logado-ou-substituto.decorator.ts`
- Modify: `packages/shared/src/url-sem-segredo.ts:2` e `url-sem-segredo.test.ts` (`substituto`, `substituicao`)
- Create: `apps/api/src/comum/nome-do-autor.ts` (+ teste unitário ao lado)

- [ ] **Passo 1: migration**, na ordem da SPEC "Dados": `ALTER TYPE ... ADD VALUE`; enum
  `TipoSubstituicao`; tabela com `@@unique([clubeId, id])`, `tokenHash` único e índice
  `(clubeId, tipo, unidadeId, classeId)`; CHECK escrito à mão com o comentário do precedente
  (`20261002130000_tarefa_casa/migration.sql:2-3`): `tipo = 'CHAMADA'` ⇔ `unidadeId` preenchido e
  `classeId` nulo, e o inverso; colunas `substituicaoId` com FK composta `(clubeId, substituicaoId)`.
  Conferir com `pesado -- npx prisma migrate diff` de dentro de `apps/api` que schema e migration batem.
- [ ] **Passo 2: contratos.** `contratos/substituicao.ts` com: `TipoSubstituicao`; `DatasElegiveis`
  (`{ data, inicioEm, fimEm }[]`); `SubstituicaoDoAlvo` (`{ id, data, inicioEm, fimEm, identificadaEm |
  null, substituto | null } | null`); `SubstituicaoGerada` (o de cima + `link`); `EstadoDoLink`
  (`INEXISTENTE | CANCELADO | ENCERRADO | ANTES | EM_OUTRO_APARELHO | ABERTO`); `LinkPublico` (`estado,
  tipo, alvo: { nome }, data, inicioEm, fimEm, fimEnvioEm, agora, conta: { nome } | null, identificado:
  boolean`); `EntrarNoLink` (`{ nome?: string, usarConta?: boolean, segredo?: string }`, nome 3–80
  aparado); `Entrada` (`credencial, segredo | null, identidade: { substituicaoId, nome, tipo, alvoId,
  alvoNome, clubeId, data, fimEm, fimEnvioEm }, agora`); `SubstituicaoNoRegistro` (`{ autor, semConta,
  geradoPor, lancou }`). Código de erro novo `SUBSTITUICAO_ENCERRADA` (401) em `CODIGOS_ERRO`
  (`packages/shared/src/contratos/comum.ts:24-42`) e no mapa de status de `apps/api/src/comum/erros.ts`.
- [ ] **Passo 3: decoradores.** `@PodeOuSubstituto(chave)` = metadado de `@Pode` + o extra;
  `@LogadoOuSubstituto()` = metadado de `@Logado` + o extra. Sem uso ainda.
- [ ] **Passo 4: `nomeDoAutor({ nome, status })`** → "<nome> (substituto)" se `SUBSTITUTO`, senão o nome.
- [ ] **Passo 5:** `pesado -- npm run build -w packages/shared`; `tipos` da raiz; testes de
  `guarda-clube.spec.ts`, `url-sem-segredo.test.ts` e do `nome-do-autor`.
- [ ] **Commits:** `feat(substituicao): modelo, migration e contratos do link de substituição` e
  `feat(substituicao): decoradores, nome do autor e token mascarado no Sentry`.

---

## P1a — credencial e guarda · subagente, onda 1

**Files:** `apps/api/src/sessao/access-token.service.ts`, `apps/api/src/sessao/sessao.service.ts`,
`apps/api/src/comum/decorators/sessao.decorator.ts`, `apps/api/src/comum/guards/guarda-sessao.guard.ts`,
`apps/api/src/comum/guards/guarda-permissao.guard.ts`, `apps/api/src/desbravadores/escopo.service.ts`,
`apps/api/test/fabricas.ts` (`criarSubstituicao`, `criarUsuarioDeSubstituicao`, `credencialDeSubstituicao`),
`apps/api/src/comum/guards/guardas.spec.ts`, `apps/api/src/sessao/sessao.spec.ts`.

**Entrega:** SPEC "Credencial e escopo (API)" até "Escopo", inclusive. `emitirSubstituicao(id,
validadeAte)` e `verificarSubstituicao()`; `verificar()` recusa carga com `tipo`; `ServicoSessao`
carrega a substituição (cancelada, alvo inativo pela regra de "Alvo válido", sem `aparelhoHash`, fora
do prazo → `SUBSTITUICAO_ENCERRADA`; prazo de leitura = `fimEm`, de gravação = `fimEnvioEm`, decidido
pelo método HTTP); `GuardaSessao` e `GuardaPermissao` como na SPEC; `Sessao`/`SessaoLogada` com
`substituicao?`; escopo restrito ao alvo.

**Testes (todos antes):** critérios 19 e 17 (só a parte "rota fora da tabela → 401
`NAO_AUTENTICADO`", com uma rota de teste em `RotasDeTesteModule` marcada e outra não); credencial
cancelada, sem aparelho, antes/depois do prazo (relógio de `test/relogio.ts`); gravação aceita entre
`fimEm` e `fimEnvioEm`, leitura recusada; `unidadesDoConselheiro`/`classesDoInstrutor` com
substituição devolvem só o alvo.

**Pronto:** testes do pacote verdes; `tipos -w api` verde; nenhuma rota de produção usa os decoradores
ainda (isso é do P2a). **Commit:** `feat(substituicao): credencial de substituição aceita só onde a rota marca`.

---

## P1b — ciclo do link e rotas públicas · subagente, onda 2

**Files:** `apps/api/src/substituicoes/{substituicoes.module,substituicoes.controller,substituicoes.service,janela}.ts`
(novos), `apps/api/src/auth/{substituicao-publica.controller,substituicao-publica.service}.ts` (novos),
`apps/api/src/auth/limite.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/app.module.ts`,
`apps/api/src/sessao/refresh.service.ts` (`lerSemRotacionar`), `packages/shared/src/datas.ts`
(`instanteDoHorario`) + teste, `apps/api/src/auth/auth.service.ts`,
`apps/api/src/usuarios/usuarios.service.ts:117-138`, `apps/api/src/auth/convite-acesso-publico.service.ts:59-68`,
specs `substituicoes/*.spec.ts`.

**Entrega:** SPEC "Janela", "Ciclo do link (Adm)", "Abrir o link", "Rotas novas" e as recusas de
`SUBSTITUTO` em "Autoria". Rotas do Adm em `/unidades/:id/substituicao` e `/classes/:id/substituicao`
com `@Pode('usuario.gerenciar')`; `GET /substituicoes/datas`; públicas em `auth/` com limites por hash
do token; identificação atômica com `updateMany` e criação do usuário de substituição na mesma
transação; reingresso com `timingSafeEqual`; `agora` nas respostas. O `instanteDoHorario` mora no
shared e o P1b roda `build -w packages/shared` depois de mexer nele.

**Testes (todos antes):** critérios 1, 2 (API), 4, 5 (API), 6, 7, 9 (API: conta reconhecida pelo
cookie, sem rotacionar, vínculo de outro clube conta como sem conta), 10, 24; limites com
`criarAppDeAuth({ limitar: true })` (`auth/limite.spec.ts:20`); `instanteDoHorario` com outro fuso e
22:00; estados `INEXISTENTE`/`CANCELADO`/`ENCERRADO`/`ANTES`/`EM_OUTRO_APARELHO`/`ABERTO`.

**Pronto:** testes verdes; `tipos` da raiz verde. **Commit:**
`feat(substituicao): o Adm gera o link e o substituto entra sem login no horário da reunião`.

---

## P2a — rotas de hoje aceitam a credencial · subagente, onda 3

**Files:** `apps/api/src/reunioes/{reunioes.controller,reunioes-envio.service}.ts`,
`apps/api/src/aulas/{aulas.controller,aulas-envio.service}.ts`,
`apps/api/src/cronogramas/{cronogramas.controller,servico-cronograma}.ts`,
`apps/api/src/sync/{sync.controller,sync.service,pacote-instrutor.service}.ts`,
`apps/api/src/comum/varredura-de-rotas.spec.ts`, e um spec novo `apps/api/src/substituicoes/rotas-com-credencial.spec.ts`.

**Entrega:** a tabela "Rotas que aceitam a credencial" com as restrições; data igual à do link nas
gravações; `substituicaoId` gravado só quando gravou algo; pacote de substituição (SPEC "Pacote");
descrição da atividade do registro de classe com `nomeDoAutor` (`aulas-envio.service.ts:407-415`).
Leituras `GET /reunioes`, `/reunioes/:id`, `/classes/:id/aulas`, `/aulas/:id` filtram unidade/classe e
dia **no controller ou no serviço de leitura sem mudar o formato da resposta** — o campo
`substituicao` do detalhe é do P2b, não daqui.

**Testes (todos antes):** critérios 17 (as quatro recusas), 18, 22 (parte "reenvio sem mudança não
marca"), 25; pacote com credencial (só o alvo, `reunioesRecentes` só do dia, sem álbuns, `voce` falso,
`usuarioId`/`vinculoId` = id da substituição); chamada e registro de classe gravados com o autor certo
para membro e para usuário de substituição.

**Pronto:** testes verdes; `tipos -w api` verde; os specs de hoje de reuniões, aulas, cronograma e sync
continuam verdes nos arquivos tocados. **Commit:**
`feat(substituicao): chamada e registro de classe aceitam a credencial só no alvo e no dia`.

---

## P2b — leitura da substituição e "(substituto)" · subagente, onda 4

**Files:** `apps/api/src/reunioes/reunioes.service.ts:80-132`, `apps/api/src/aulas/aulas.service.ts:57-81`,
`apps/api/src/visao-geral/visao-geral.service.ts:19,254-264`,
`apps/api/src/especialidades/especialidades-dbv.service.ts:33-40`,
`apps/api/src/progresso/servico-progresso.ts:175-193`, e os specs de leitura desses quatro módulos.

**Entrega:** SPEC "Mostrar a substituição (R1)" lado API (`substituicao` no `ReuniaoDetalhe` e no
`AulaDetalhe`, com `lancou` e `semConta` = autor com status `SUBSTITUTO`, `geradoPor` = nome de quem
gerou) e "(substituto)" via `nomeDoAutor` nos três leitores de "Autoria".

**Testes (todos antes):** critérios 21, 22 e 23 do lado da API (o texto exato fica com o web; aqui os
campos e o nome com "(substituto)").

**Pronto:** testes verdes; `tipos` da raiz verde. **Commit:**
`feat(substituicao): o registro diz quem lançou na substituição`.

---

## P3 — telas do Adm e R1 da reunião · subagente, onda 1

**Files:** `apps/web/src/api/substituicao.ts` (hooks, padrão de `api/convite-acesso.ts`),
`apps/web/src/modulos/adm/substituicao/{CartaoSubstituto,GerarLinkDeSubstituicao,mensagem-substituicao}.tsx|ts`
(novos), rota de A2/A3 nas rotas do Adm (`/adm/unidades/:id/substituicao` e `/adm/classes/:id/substituicao`),
`apps/web/src/modulos/adm/unidades/FichaUnidade.tsx`, `apps/web/src/modulos/adm/classes/DetalheDaClasse.tsx`,
`apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx`, `apps/web/src/modulos/adm/reunioes/FichaReuniao.tsx`,
`apps/web/src/testes/handlers/substituicao.ts` (novo, só as rotas do Adm) + registro em
`testes/servidor.ts:10`, e os testes das telas.

**Entrega:** A1–A4 do desenho; texto do WhatsApp com `linkDoWhatsApp`; `Confirmacao` no cancelar;
vazio de A2 com "Abrir o calendário"; cartão escondido sem `usuario.gerenciar` e com alvo inativo; R1 na
reunião com os textos da SPEC (lançada/alterada, com/sem "(sem conta no app)").

**Testes (todos antes):** critérios 1, 2, 3, 4, 5 (lado web, com MSW), 21 e 22 (texto), 26 nas telas
novas (medição fica no P5), 27. `links-que-navegam.test.ts` continua verde (usar `LinhaQueNavega` ou
`LinkDeFicha` em cartão que navega).

**Pronto:** testes verdes; `tipos -w web` verde. **Commit:**
`feat(substituicao): o Adm gera, envia e acompanha o link na ficha da unidade e da classe`.

---

## P4a — sessão, cliente e fila do substituto · subagente, onda 2

**Files:** `apps/web/src/sessao/ProvedorSessao.tsx`, `apps/web/src/sessao/ProvedorSessaoSubstituto.tsx`
(novo), `apps/web/src/api/cliente.ts`, `apps/web/src/offline/motor.ts`, `apps/web/src/offline/limpeza.ts`,
`apps/web/src/substituicao/relogio.ts` (novo: deslocamento para o relógio do servidor),
`apps/web/src/testes/renderizar.tsx`, testes novos `sessao/substituto.test.tsx` e `offline/fila-substituto.test.tsx`.

**Entrega:** SPEC "Front" nos itens: `ProvedorSessao` não age (todos os efeitos), provedor do substituto
com `eu` sintético, `vinculoAtivo` no topo, `pode` padrão do papel e **conexão própria**; identidade
local = id da substituição, sem `gravarIdentidade`; cliente em modo substituição (401 sem refresh, só
`SUBSTITUICAO_ENCERRADA` encerra) e `/api/auth/substituicao/` em `ROTAS_SEM_TOKEN`; trava
`fila:<id>`; limpeza dos dados locais da substituição (no encerramento e na abertura pelo fim do envio
guardado); relógio do servidor. O provedor recebe a `Entrada` pronta (quem a obtém é o P4c).

**Testes (todos antes):** critério 9 (lado web: papel ativo, fila e dados da conta intactos), 14 (fila
sobe após voltar a conexão e com outra aba segurando a trava `fila`), 15 (dados apagados), 16 (relógio
adiantado); `sessao.test.tsx`, `trocaDePapel.test.tsx`, `abertura.test.tsx` e `fila.test.tsx`
continuam verdes.

**Pronto:** testes verdes; `tipos -w web` verde. **Commit:**
`feat(substituicao): sessão, conexão e fila do substituto separadas da conta do aparelho`.

---

## P4b — destinos, alvo fixo e R1 da classe · subagente, onda 3

**Files:** `apps/web/src/substituicao/contextos.tsx` (novo: destinos e alvo fixo, com o padrão de hoje),
`apps/web/src/api/reunioes.ts:100-104`, `apps/web/src/api/aulas.ts:95`,
`apps/web/src/modulos/reunioes/chamada/EstadosChamada.tsx`, `apps/web/src/modulos/aulas/EstadosAula.tsx`,
`apps/web/src/modulos/aulas/RegistroSemConexao.tsx`, `apps/web/src/modulos/aulas/TelaRegistroAula.tsx`,
`apps/web/src/modulos/aulas/FormularioAula.tsx` (R1 da classe), `apps/web/src/modulos/aulas/aulas.test.tsx`.

**Entrega:** SPEC "Front" itens "Alvo travado" e "Destinos"; R1 no formulário do registro de classe
(só online). Sem provedor, tudo exatamente como hoje.

**Testes (todos antes):** critério 13; R1 da classe (lançado/alterado, com/sem "(sem conta no app)");
com o contexto de destinos trocado, salvar vai ao destino dado; `chamada.test.tsx` e `aulas.test.tsx`
de hoje verdes sem mudar o que já testam.

**Pronto:** testes verdes; `tipos -w web` verde. **Commit:**
`feat(substituicao): telas de chamada e de classe aceitam destino e alvo vindos de fora`.

---

## P4c — telas do link S1–S8 · subagente, onda 4

**Files:** `apps/web/src/modulos/substituto/{rotas,TelaDoLink,IdentificarSubstituto,FaixaDeSubstituicao,EstadosDoLink,DepoisDeSalvar}.tsx`
(novos), `apps/web/src/modulos/acesso/rotas.tsx`, `apps/web/src/testes/handlers/substituicao.ts` (rotas
públicas), `apps/web/src/modulos/substituto/substituto.test.tsx`.

**Entrega:** S1–S8 do desenho; obter `LinkPublico` e `Entrada`, guardar o segredo e o fim do envio em
`localStorage` (try/catch), montar `ProvedorSessaoSubstituto` com os contextos do P4b e as rotas
aninhadas `chamada`, `chamada/:id`, `classe` sobre os **mesmos** `TelaChamada` e `TelaRegistroAula`;
virada de janela pelo relógio do servidor; S5/S6 pela fila; S7 com contagem de pendentes no cancelado.

**Testes (todos antes):** critérios 7, 8, 9, 10, 11, 12, 15 (telas), 26 e 27 nas telas novas.

**Pronto:** testes verdes; `tipos -w web` verde; `rotas.test.tsx` verde. **Commit:**
`feat(substituicao): o link mostra o que é, identifica quem cobre e abre a tela do titular`.

---

## P5 — fase final · onda 5

- [ ] **Passo 1 (implementador): e2e** `e2e/substituicao.spec.ts`: Adm gera o link de uma unidade;
  segunda sessão sem login abre o link na janela (relógio do navegador e dados semeados como
  `e2e/adm.spec.ts`), digita o nome, faz a chamada, vê S8; o Adm vê "Aberto por" e o R1. Escrito, com
  `tipos` e lint verdes; **não roda** nesta máquina nem no CI.
- [ ] **Passo 2 (principal): buscas finais.** `git diff main -- apps/web/src | grep -nE "^\+.*\b(fixed|sticky)\b"`
  vazio; `git diff main -- apps/web/src | grep -niE "^\+.*['\">][^'\"<]*\baula"` só com nomes internos;
  `grep -rn "gravarIdentidade" apps/web/src/modulos/substituto apps/web/src/sessao/ProvedorSessaoSubstituto.tsx`
  vazio.
- [ ] **Passo 3: push de revisão.** `gestor-pr` sobe sem suíte, a PR segue em rascunho.
- [ ] **Passo 4 (principal): revisão da PR inteira** (skill `code-review`, opus) contra `main`, com
  atenção a: credencial valendo fora das 8 rotas, escopo e data, corrida da identificação, limpeza dos
  dados locais. Até nenhum achado Critical/Important (até 3 rodadas; consertos locais, Minor vira
  pendência).
- [ ] **Passo 5: gate = CI.** `gestor-pr` sobe os consertos; `gh pr checks` verde no job `verificar`
  (lint, tipos, testes de shared/api/web, build). Falhas → `saneador`, todas de uma vez.
- [ ] **Passo 6: QA com medição** — `qa-roteiro` escreve um item por bloco do desenho (A1–A4, S1–S8,
  R1) mais os critérios 9, 10, 14, 15 e 16; `qa-runner` executa no localhost, headless, em 390 e 1280,
  medindo no DOM letra, toque, contraste e rolagem lateral nas telas novas. O relógio é controlado pelo
  roteiro (gerar link para hoje com janela em curso).
- [ ] **Passo 7:** `documentador` com a branch e a base: `docs/planejamento/API.md` (rotas novas e a
  credencial), `MODELO-DE-DADOS.md` (status e modelo), `ARQUITETURA.md:84` (o JWT de 15 min deixa de ser
  o único). O principal acrescenta ao `CLAUDE.md` da raiz: "JWT com `tipo` nunca vale como sessão: a
  credencial de substituição só passa em rota com `@PodeOuSubstituto`/`@LogadoOuSubstituto`."
- [ ] **Passo 8:** `gestor-pr` sobe e tira do rascunho pelo ritual de `rules/pr-pronta.md`, com a nota
  de que o e2e foi escrito sem execução.

**Pronto:** CI verde; e2e escrito com tipos verdes; buscas do Passo 2 limpas; revisão limpa; QA sem
FALHOU ancorado no desenho; PR fora do rascunho.

---

## O que NÃO quebra (conferido no código em 6bc7e05)

| Medo | Por que não quebra |
|---|---|
| Sessão normal muda de comportamento | `verificar()` só passa a recusar carga com `tipo`, e nenhum token emitido hoje tem `tipo` (`access-token.service.ts:28`; `sessao.spec.ts:51-69` e `guardas.spec.ts` assinam sem `tipo`). As rotas marcadas continuam aceitando a sessão normal com a mesma chave. |
| Varredura de rotas quebra com o decorador novo | O metadado extra não entra em `CHAVES_DE_ACESSO` (`acesso.ts:6`); cada rota segue com uma declaração (`varredura-de-rotas.spec.ts:22-27`). |
| Autor vira nulo em algum leitor | Nenhum campo de autor muda; o usuário de substituição é um `Usuario` real. Os leitores de nome (`reunioes.service.ts:129,132`, `aulas.service.ts:57,81`) seguem achando a relação. |
| Usuário de substituição aparece para o Adm | As duas únicas listagens de usuários exigem vínculo no clube (`usuarios.service.ts:86-88,99-100`). |
| Fixtures do web quebram com o contrato novo | `substituicao` é `.nullable().default(null)` em `ReuniaoDetalhe` e `AulaDetalhe`; os handlers de `testes/handlers/{reunioes,chamada,aulas}.ts` seguem válidos. Os specs de leitura da API usam `toMatchObject` (`reunioes-leitura.spec.ts:~135`). |
| Telas do titular mudam | O contexto de destinos e o de alvo fixo têm como padrão os valores de hoje; sem `ProvedorSessaoSubstituto` nada muda (`chamada.test.tsx`, `aulas.test.tsx` seguem verdes sem edição do que já testam). |
| `ProvedorSessao` deixa de funcionar | O desvio só dispara quando o primeiro endereço começa com `/substituto/`; os testes montam em "/" (`renderizar.tsx:12-18`). |
| A fila do membro anda diferente | A trava `fila` e o `BroadcastChannel('fila')` (`motor.ts:65`) seguem iguais para a sessão normal; a substituição usa outra trava e outra identidade. |
| Carga oficial | `scripts/carga.sh` não toca em `Usuario` nem em `Substituicao`. |
| Ranking | Lê só nomes de desbravadores (`calculo-ranking.ts`); `lancadoPorId` nunca é lido por nome. |

## Contrato de retorno do subagente

Cada `implementador` devolve, em até 15 linhas, sem diff e sem trecho de código:

1. pacote concluído e se fechou inteiro;
2. arquivos tocados — caminhos, nunca conteúdo;
3. testes do pacote: verdes, nomes que falharam, e **se o vermelho inicial foi visto**;
4. erros de `tipos` fora do pacote, em uma linha (esperado: nenhum);
5. decisões tomadas sozinho, uma linha cada, no formato `DECISÃO / IMPASSE / ALTERNATIVA`;
6. pendências, uma linha cada.

O principal confere com `git diff --stat` e um `git diff <arquivo>` dirigido no ponto que o relatório
disse ter sido difícil, antes do commit. Briefing de cada pacote: worktree, branch e base desta página;
a seção do pacote; as linhas do `ONDE FICA` da SPEC do assunto dele; o bloco do desenho que ele
implementa; o orçamento de ~80 turnos; `GIT: não rode git`.

## ONDE FICA

O bloco completo, conferido em `6bc7e05`, está no fim da [SPEC](SPEC.md#onde-fica). Recorte por pacote:

```
P0   schema.prisma:31-35,221-226,240-250,652-720,953-985 · migrations/20261002130000_tarefa_casa/migration.sql:2-3,30-38 · guarda-clube.ts:5-41 · guarda-clube.spec.ts:72-73 · shared enums.ts:4,23 · contratos/reunioes.ts:83-100 · contratos/aulas.ts:61-71 · decorators/acesso.ts:1-16 · url-sem-segredo.ts:2
P1a  access-token.service.ts:28,31-39 · sessao.service.ts:19 · sessao.decorator.ts:5-40 · guarda-sessao.guard.ts:15-40 · guarda-permissao.guard.ts:16-37 · escopo.service.ts:26-51 · test/fabricas.ts:85,191,205 · test/relogio.ts
P1b  convite-acesso.service.ts:44-56 · convite-acesso-publico.{controller.ts:15-32,service.ts:59-68,88} · limite.ts:19-23,43-45 · limite.spec.ts:20,80 · refresh.service.ts:49-73 · cookie-refresh.ts:4-14 · tokens.ts · calendario.ts:56-74,176-179 · datas.ts:30 · servico-calendario.ts:12-29 · inicio.service.ts:65-90 · auth.service.ts:36-38,75-79 · usuarios.service.ts:117-138 · classes.service.ts:45
P2a  reunioes.controller.ts:19-39 · reunioes-envio.service.ts:57,79,161-180 · aulas.controller.ts:19-40 · aulas-envio.service.ts:79,107,204-222,407-415 · cronogramas.controller.ts:13-14 · servico-cronograma.ts:67-73,127 · sync.controller.ts:12 · sync.service.ts:16-17,37-75 · pacote-instrutor.service.ts:34-62 · varredura-de-rotas.spec.ts:22-27
P2b  reunioes.service.ts:80,98,129,132 · aulas.service.ts:57,81 · visao-geral.service.ts:19,254-264 · especialidades-dbv.service.ts:33-40 · servico-progresso.ts:175-193
P3   FichaUnidade.tsx:78,127,146 · DetalheDaClasse.tsx · mensagem-convite.ts · AcessoAoApp.tsx · DetalheReuniao.tsx:51 · FichaReuniao.tsx:37 · testes/servidor.ts:10 · links-que-navegam.test.ts
P4a  main.tsx:50-52 · ProvedorSessao.tsx:78-112,149-160,176-271 · useSessao.ts:11-43 · cliente.ts:68-75,88-97,186-206 · motor.ts:32-77 · fila.ts:33-114 · banco.ts:36-41 · identidade.ts:8-23 · limpeza.ts:11-21 · usePacote.ts:16 · renderizar.tsx:9-18
P4b  api/reunioes.ts:100-104 · api/aulas.ts:95 · EstadosChamada.tsx:19 · EstadosAula.tsx:19 · RegistroSemConexao.tsx:11,36,53 · TelaRegistroAula.tsx:31-35,68-78 · FormularioAula.tsx:64,119,131 · chamada.test.tsx:10,98,109
P4c  modulos/acesso/rotas.tsx:10-16 · rotas.tsx:61-110 · TelaChamada.tsx:26-62 · TelaRegistroAula.tsx
conferido em 6bc7e05
```

## Cobertura da SPEC (autorrevisão)

| Seção da SPEC | Pacote |
|---|---|
| Janela | P1b (`instanteDoHorario`, datas elegíveis) |
| Ciclo do link (Adm) | P1b (API), P3 (telas) |
| Abrir o link | P1b (API), P4c (telas), P4a (relógio, limpeza) |
| Autoria | P1b (usuário de substituição, recusas), P2a (marca e atividade), P2b (leitores) |
| Credencial e escopo | P0 (decoradores), P1a (guarda, sessão, escopo), P2a (rotas, data, pacote) |
| Rotas novas | P1b |
| Dados | P0 |
| Mostrar a substituição (R1) | P2b (API), P3 (reunião), P4b (classe) |
| Front | P4a, P4b, P4c; Sentry no P0 |
| Critério de pronto 1–27 | distribuído nas seções de cada pacote; 26 medido no P5 |

## Comando de execução

```
Aja como orquestrador (skill orquestrador) e execute o plano "Link de substituição".

ONDE: continue na worktree existente
/home/robertogabrieu/desbravadores/.claude/worktrees/spec-substituicao-temporaria, branch
feature/substituicao-temporaria, na PR em rascunho que já existe para ela (gh pr view). Não crie branch
nem PR novos. Base: main em 6bc7e05; confira com git fetch e git rev-list --count HEAD..origin/main
antes do P0 — se a main andou, faça merge da main antes de começar.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/substituicao/SPEC.md e docs/fases/substituicao/PLANO.md.
O desenho docs/fases/substituicao/mockup.html é o alvo e vence a SPEC (estrutura, ordem e texto; nunca
CSS). CLAUDE.md da raiz vale inteiro.

DECISÕES TRAVADAS (não reabrir):
- o link vale um dia; abre no horário da reunião daquele dia e fecha 3h depois; antes só informa,
  depois bloqueia; o que foi salvo na janela ainda sobe por 12h;
- o link é anônimo; quem abre se identifica pela conta do clube no navegador ou digitando o nome;
- um aparelho e navegador por link, preso de forma atômica na primeira identificação;
- o substituto usa os mesmos TelaChamada e TelaRegistroAula do titular, sem cópia;
- a substituição não usa nem muda vínculo; a identidade local é o id da substituição;
- autor é sempre um Usuario: o membro, ou um usuário de substituição (status SUBSTITUTO, e-mail
  @substituto.invalid, sem senha, sem vínculo); nenhum campo de autor fica anulável;
- a credencial é um JWT com tipo 'substituicao', conferido no banco a cada requisição, aceito só nas 8
  rotas da tabela da SPEC; verificar() recusa qualquer carga com tipo;
- só o 401 SUBSTITUICAO_ENCERRADA encerra a tela do substituto;
- um link aberto por unidade ou classe; gerar outro cancela o anterior; permissão usuario.gerenciar;
- o titular não perde acesso; vale a última escrita;
- nenhum elemento fixed/sticky novo; "classe", nunca "aula", em texto visível;
- testes antes da implementação dentro de cada pacote; validação pesada só no P5; máquina fraca, tudo
  pelo pesado, comandos da seção Global Constraints do PLANO.

FORA DE ESCOPO: histórico de substituições; aviso ao titular ou ao substituto; link de vários dias ou
alvos; substituto em outro dia, galeria, histórico ou cronograma; medir ausência de titular; converter
o usuário de substituição em conta; mudar o formato do log do nginx; mexer na fila offline além da
trava e da identidade da substituição; push fora do gestor-pr.

EXECUÇÃO: ondas 0 a 5 do PLANO. O P0 é seu, inline (dono compartilhado), com dois commits, antes de
delegar. Depois, em cada onda, no máximo um implementador de API e um de web em paralelo, nos pares
da tabela "Níveis e ondas"; cada briefing com a seção do pacote, o recorte do ONDE FICA e o bloco do
desenho; nenhum subagente roda git; commit por pacote pela skill commit, com o título do PLANO; tipos
da raiz verde no fim de cada onda; revisão com opus; push e saída do rascunho só pelo gestor-pr.

GATE: "Pronto" do P5 — CI verde (gh pr checks, job verificar); e2e escrito com tipos verdes (não roda
nesta máquina nem no CI: diga isso no fechamento, sem perguntar); buscas do Passo 2 limpas; revisão
da PR limpa; QA sem FALHOU ancorado no desenho e nos critérios 9, 10, 14, 15 e 16; PR fora do rascunho.

RETORNO: relatório de fechamento da skill orquestrador, com as decisões tomadas fora do PLANO em
PENDÊNCIAS.
```
