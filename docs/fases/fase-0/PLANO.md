# Fase 0 — Fundação · Plano de implementação

**Spec:** [SPEC.md](SPEC.md) · **Branch:** `feature/fase-0-fundacao` · **Base:** `main@3770614` ·
**Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/fase-0` · **PR:** a desta branch (rascunho)

Vocabulário da skill `orquestrador`: **sessão**, **agente principal** (orquestrador), **subagente**
(`implementador`, `testador`, `saneador`, `investigador`, `documentador`, `gestor-pr`).

## 1. Regras de execução (valem para todo pacote)

- O principal **não escreve código de produção nem de teste**, exceto os arquivos de dono
  compartilhado da onda 2. Não lê saída de suíte. Versiona (skill `commit`) ao fim de cada onda.
- Cada pacote é do `implementador`, em **TDD com a bateria inteira escrita antes** (os testes do
  SPEC §11 que caem no pacote). O implementador delega suíte ao `testador`.
- **Subagente não roda git.** Push só pelo `gestor-pr`, uma vez, quando a fase fechar.
- Todo briefing segue `~/.claude/skills/orquestrador/references/briefing-template.md` e repete
  worktree, branch e **commit-base da onda**.
- Revisão por pacote com modelo capaz (sonnet/opus), nunca haiku. No laço de revisão, conserta-se
  só achado **médio ou maior**; o resto vira pendência.
- Decisão que não está na SPEC: o implementador **para e devolve em PENDÊNCIAS** — não escolhe.

## 2. A conta do fatiamento

Estimativa de arquivos **alterados** na fase: ~105. Pela curva medida (SPEC-e-plano §3), o ótimo
é 6–10 arquivos por pacote; abaixo de 6 é trabalho inline do principal.

| Arranjo | Pacotes | Custo relativo |
|---|---|---|
| Um pacote por camada (api / web / infra) | 3 de ~35 | ~2× (releitura) |
| **Um pacote por fluxo, 8–14 arquivos** | **9** | **1× (alvo)** |
| Um pacote por tela/endpoint | ~30 de 3–4 | ~2,3× (piso repetido) |

Não "otimizar" em nenhuma das duas direções.

## 3. Ondas e pacotes

Nível entre colchetes. Pacotes na mesma onda rodam **em paralelo** (arquivos disjuntos, banco de
teste próprio por execução — SPEC D11).

### Onda 1 — esqueleto [subagente, sozinho]

**P1 · Esqueleto do monorepo** (~15 arquivos)
Raiz (`package.json` com workspaces e scripts `dev, lint, tipos, teste, build`, `.nvmrc`,
`tsconfig.base.json`, `eslint.config.mjs` com `no-explicit-any: error`, `.editorconfig`,
`.gitignore`, `.env.exemplo`), `docker-compose.yml` (postgres 17 + mailpit), `apps/api` mínimo
(Nest com `GET /api/saude`), `apps/web` mínimo (Vite + React com uma página), `packages/shared`
vazio exportando `index.ts`, `.github/workflows/ci.yml` (lint, tipos, testes com serviço Postgres,
build), e o **harness de banco por execução** (`apps/api/test/banco.ts`: cria `teste_<pid>_<rand>`,
aplica migrations, apaga no fim).
**Pronto quando:** `npm ci && npm run lint && npm run tipos && npm run teste && npm run build`
passa na raiz; dois `npm run teste -w api` simultâneos em terminais diferentes passam os dois.

### Onda 2 — contratos [agente principal, inline]

Arquivos de dono compartilhado, escritos pelo principal antes de qualquer outro pacote:
`apps/api/prisma/schema.prisma` + migration `fase0_fundacao` (com os 3 índices parciais),
`packages/shared/src/enums.ts`, `permissoes.ts` (+ `permissoesEfetivas` e seu teste — é pequeno e
todo pacote seguinte depende dele), `contratos/*.ts`, `apps/web/src/rotas.tsx` (rotas da SPEC §8.2
apontando para componentes-placeholder), `CLAUDE.md` (SPEC §12).
**Pronto quando:** `npm run tipos` passa; `prisma migrate dev` aplica num banco vazio.
Commit da onda. **A partir daqui, esses arquivos estão em NÃO TOCAR para todos os pacotes**; se
um pacote precisar mudá-los, devolve a necessidade em PENDÊNCIAS e o principal altera.

### Onda 3 — bases [3 subagentes em paralelo]

**P2 · Fórmulas do shared** (~8) — `packages/shared/src/formulas/*`, `datas.ts`, testes com as
tabelas da SPEC §7. Não depende de banco.
**P3 · Base da API** (~13) — `PrismaService` com a guarda de clube (SPEC §6.3) e seu teste;
`ZodValidationPipe`; filtro de erro `{codigo, mensagem, campos}`; `GuardaSessao` global,
`GuardaPermissao`, `@Pode`, `@Publica`; o teste "toda rota tem `@Pode`"; fábricas de teste (clube,
usuário, vínculo, **sessão assinada direto**, sem passar pelo login); a **carga oficial** (SPEC §5.3)
com o teste de idempotência; o script `clube:criar` (§5.2).
**P4 · Base do front** (~14) — tokens e tema Tailwind, componentes base em `ui/` (Botão, Campo,
Cartão, Folha lateral, Tabela, Aviso, EstadoVazio), `LayoutCelular` (barra inferior por papel, itens
futuros desabilitados "em breve"), `LayoutAdm` (menu lateral), cliente HTTP com fila de refresh
(SPEC §8.3), contexto de sessão e guarda de rota, PWA (`sw.ts`, manifesto, ícones).

### Onda 4 — fluxos [3 subagentes em paralelo]

**P5 · Autenticação na API** (~12) — módulo `auth` (login, refresh com rotação e reuso, logout,
convite, esqueci/redefinir), `eu` e `papel-ativo`, módulo `email` (nodemailer; Mailpit em dev;
*mock* nos testes), limites de taxa. Testes de auth da SPEC §11.
**P6 · Cadastros na API** (~15) — `desbravadores`, `unidades` (membros, sem-membros), `usuarios` +
`vinculos` (convite via serviço de e-mail do P5 **pela interface**, injetada — P6 usa um *fake*),
`classes`, `especialidades`, `permissoes/catalogo`, com escopo por papel. Testes de isolamento,
permissões, escopo e matrícula da SPEC §11.
**P7 · Telas de acesso** (~10) — Login, Definir senha (convite), Esqueci/Redefinir, Escolher papel,
Início provisório com o convite de instalação. Testes de componente com a API simulada.

*P5 e P6 tocam `app.module.ts`*: o principal registra os módulos `auth`, `email`, `desbravadores`,
`unidades`, `usuarios`, `classes`, `especialidades` **vazios** no fim da onda 3, e os pacotes só
preenchem as pastas deles.

### Onda 5 — telas de cadastro e ida ao ar [3 subagentes em paralelo]

**P8 · Adm: Desbravadores e Unidades** (~10) — telas A1 e A3 da SPEC §8.2.
**P9 · Adm: Usuários + Minha unidade** (~9) — tela A2 (painel por papel, caixas de permissão a
partir do catálogo, convite) e a tela C2 da fundação.
**P10 · Ida ao ar** (~10) — Dockerfiles, `docker-compose.prod.yml`, nginx do front, `scripts/*`
(deploy, atualizar, backup com `age` + `rclone`, restaurar) testados com remoto local, e o teste
**Playwright headless** ponta a ponta da SPEC §11.

### Onda 6 — fechamento [agente principal]

1. `testador`: suíte inteira (lint, tipos, shared, api, web, e2e), comparada ao baseline por nomes
   do fim da onda 2. Falhas → **um** `saneador` com o dossiê, nunca um implementador por falha.
2. Revisão da PR inteira (`code-review`), até nenhum achado médio ou maior em aberto (máx. 3 rodadas).
3. QA na interface pelo `qa-runner`, com roteiro tirado dos critérios "Pronto quando" do ROADMAP
   Fase 0, headless.
4. `documentador`: README do repositório (como subir, testar, carregar, criar clube, fazer deploy).
5. Principal: registra a correção D12 em `docs/planejamento/MODELO-DE-DADOS.md` §3.
6. `gestor-pr`: push único; PR sai do rascunho só com CI verde e revisão limpa.

## 4. Critério de pronto da fase

Os de ROADMAP Fase 0, verificáveis localmente (o deploy real depende dos acessos do dono — SPEC §10):
- convite de teste chega no Mailpit, a senha é definida, o app instala (manifesto válido), e o
  conselheiro vê **só** a própria unidade;
- teste automatizado prova que o clube A não lê nada do clube B;
- carga com todas as classes (individuais e agrupadas, com avançadas) e as 514 especialidades;
- `scripts/backup.sh` + `scripts/restaurar.sh` restauram num banco limpo e o app abre com os dados.

## 5. Como paralelizar sem perder qualidade

**Dentro de uma fase** (o que este plano já faz):
- Ondas com **contratos primeiro**: o principal fixa schema, contratos, permissões e rotas antes
  de abrir paralelo. É o que impede dois agentes de inventarem o mesmo dado de jeitos diferentes.
- Até **3 implementadores ao mesmo tempo**, com arquivos disjuntos declarados em PODE TOCAR / NÃO
  TOCAR. Mais do que isso a máquina (WSL com pouca memória) e a revisão não acompanham.
- **Banco de teste por execução** (SPEC D11): testadores de pacotes diferentes rodam juntos sem se
  atropelar. É a peça que o Finance e o MEV-Med não têm e que torna o paralelo seguro.
- Arquivo que dois pacotes precisariam tocar (ex.: `app.module.ts`) é preparado pelo principal
  antes da onda.

**Entre fases** (o maior ganho de prazo):

| Quando | Em paralelo | Condição |
|---|---|---|
| Fase 0 mergeada | **Fase 1 (Conselheiro)** começa pelo *núcleo offline* (fila de envio, pacote do domingo, rotas `/sync`) numa PR pequena | Fase 2 e 3 dependem desse núcleo |
| Núcleo offline mergeado | **Fase 1** (resto) · **Fase 2 (Instrutor)** · **Fase 3 (Adm: calendário e cronograma)** — até 3 sessões, cada uma com sua worktree e PR | Cada fase tem o seu plano escrito **depois** do merge do núcleo, apontando para código que existe |
| Fases 1–3 mergeadas | **Fase 4 (Ranking e relatórios)** | Precisa dos lançamentos de pontos das três |

Regras para as sessões paralelas não colidirem:
- **Schema é serializado**: cada fase cria a própria migration; quem mergeia depois faz *rebase*,
  apaga a sua migration e a **gera de novo** sobre a `main` antes do merge.
- Arquivos centrais de roteamento são **por módulo** (`rotas.tsx` importa um arquivo de rotas por
  módulo; `app.module.ts` idem), para que duas fases não editem a mesma linha.
- Cada PR só mergeia com CI verde **depois do rebase** na `main` do momento.
- O gargalo real passa a ser **você revisando**: três PRs ao mesmo tempo é o teto útil.

**O que não se paraleliza:** decisões de produto em aberto (resolvem-se antes da fase), a revisão
final de cada PR, e a Fase 4.

## 6. O que NÃO quebra

Repositório sem código anterior. `docs/design/` não é alterado. `docs/planejamento/` só ganha a
nota D12 no MODELO-DE-DADOS (onda 6).

## 7. Comando para a sessão que vai executar

Rodar numa **sessão nova** do Claude Code aberta em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill orquestrador) e execute a Fase 0 do Aplicativo do Desbravador.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/fase-0 · branch
feature/fase-0-fundacao · continue na branch e na PR em rascunho que já existem (não crie outras).

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fase-0/PLANO.md e docs/fases/fase-0/SPEC.md
(na worktree). Os documentos de docs/planejamento/ e docs/design/ são consultados por seção,
quando um briefing precisar.

DECISÕES TRAVADAS (não reabrir): as 20 da SPEC §2, em especial — domínio em português; zod no
shared como único contrato; refresh com rotação e detecção de reuso; access token só em memória;
banco de teste por execução; classes oficiais sem clubeId com ajustes por clube (ClasseClube,
RequisitoAjuste); carga idempotente que nunca apaga; PWA em injectManifest.

FORA DE ESCOPO: tudo da SPEC §1 "Fora da Fase 0" (chamada, ranking calculado, aulas, cronograma,
calendário, fotos, fila offline, relatórios, notificações). Nada "de passagem".

EXECUÇÃO: ondas 1 a 6 do PLANO §3, na ordem; paralelo só dentro da mesma onda, no máximo 3
implementadores; a onda 2 é sua (arquivos de dono compartilhado). Commit por onda (skill commit).
Push e saída do rascunho só pelo gestor-pr, no fim.

GATE: PLANO §4 (critério de pronto da fase) + suíte inteira verde sem falha nova + revisão da PR
sem achado médio ou maior.

RETORNO: o relatório de fechamento da skill orquestrador (FEITO / SUÍTE / DOCS / PENDÊNCIAS / PR),
e em PENDÊNCIAS qualquer decisão que a SPEC não cobria e que você teve de tomar.
```
