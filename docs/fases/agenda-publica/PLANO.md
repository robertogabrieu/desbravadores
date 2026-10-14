# Agenda pública para os pais — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** executar a [SPEC](SPEC.md) aprovada na mesma branch e na mesma PR (#46): o formulário de evento
ganha o campo uniforme em quatro tipos, e os pais ganham a página pública `/agenda/{slug}`.

**Architecture:** o uniforme deixa de ser exclusivo do evento especial (`validarEvento`, gravação e formulário
passam a separar *uniforme* de *pontos*). Uma rota pública nova lê eventos e a configuração do clube; o
`slug → clubeId` fica num serviço em `auth/` (única pasta que pode usar `PrismaSistema`). A página web é nova,
fora do layout autenticado, com chamada sem sessão. **Sem migration, sem tabela nova.**

**Tech Stack:** NestJS 11 + Prisma 7 (API, Jest sem checagem de tipos), React 19 + React Router 7 + TanStack
Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`.

**Spec:** [SPEC.md](SPEC.md). **O mockup [modelo/Agenda-Publica.html](modelo/Agenda-Publica.html) vence a SPEC
no empate** (estrutura, ordem e texto; nunca CSS). **Branch:** `spec/agenda-publica-pais` · **Worktree:**
`/home/robertogabrieu/projetos/desbravadores/.claude/worktrees/agenda-publica-pais` · **PR:** #46 (rascunho,
é a PR da issue) · **Base:** `main` em `61f95b6` (rode `git fetch` e confira `HEAD..origin/main` antes).

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared`; toda operação de modelo
  de clube leva `clubeId`; **`PrismaSistema` só em `auth/`** (aqui: só o serviço que resolve o slug); toda
  rota declara `@Publica`/`@Autenticado`/`@Logado`/`@Pode`; tela com carregando, vazio, erro e sem conexão;
  do mockup não se copia CSS (cor nova vira token em `ui/tokens.css`).
- **Uniforme tem componente:** `UniformeDoEvento` (`apps/web/src/modulos/adm/calendario/UniformeDoEvento.tsx`).
  Não se cria etiqueta nova.
- **Pontos continuam só no evento especial.** Nada de pontos, lista, `clubeId` ou nome de pessoa na resposta
  pública.
- **Telas existentes não mudam**, exceto o formulário de evento (SPEC, decisões 1, 3 e 7). O calendário interno
  do app segue mostrando uniforme só no especial.
- **Sem migration.** Evento antigo sem uniforme fica sem uniforme.
- **Nada novo `fixed`/`sticky`.**
- **Testes antes da implementação, dentro de cada pacote:** escritos primeiro, vistos falhando; depois
  implementar; depois verde.
- **Validação pesada só no fim** (CI do GitHub é o gate da suíte inteira e do e2e). Por pacote: só os testes
  do pacote e `tipos` do workspace.
- **Máquina fraca — tudo pelo `pesado`**, uma suíte pesada por vez:
  `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; testes de dentro do pacote,
  `cd apps/web|apps/api|packages/shared && pesado testar --script teste -- <caminhos>` (não passar
  `--maxWorkers`); tipos `pesado -- npm run tipos -w web|api|packages/shared`; lint
  `NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`.
- **`packages/shared` é consumido pelo `dist/` na API** (o web usa o `src/`): mudou contrato ou fórmula,
  `pesado -- npm run build -w packages/shared` antes de testar a API.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`), com o título sugerido.
- **Ordem de pacote:** sequencial (P1 → P2 → P3). Todos tocam `packages/shared` ou a mesma API.

## Níveis e ondas

| Onda | Quem | O quê |
|---|---|---|
| 0 | **principal** | P0: contrato, constante e cabeçalho do nginx (arquivos compartilhados), antes de delegar |
| 1 | `implementador` | P1: uniforme nos quatro tipos (shared + API + formulário + testes que mudam) |
| 2 | `implementador` | P2: rota pública (serviço do slug em `auth/` + módulo `agenda-publica/`) |
| 3 | `implementador` | P3: página `/agenda/:slug` |
| fim | **principal** | push de revisão, revisão da PR inteira, CI, `documentador`, QA, saída do rascunho |

Conta (`spec-e-plano` §3): 3 pacotes de 8 a 12 arquivos cada. Abaixo de 6 por pacote seria pagar piso sem
ganho; acima de 15 seria pagar releitura. **Teto de turnos por pacote: 80.**

---

## P0 — arquivos compartilhados (principal, inline, antes de tudo)

Arquivos: `packages/shared/src/contratos/agenda-publica.ts` (novo), `packages/shared/src/index.ts`
(onde os contratos são reexportados, como `./contratos/convite-acesso` na linha 37), `packages/shared/src/enums.ts`, `apps/web/nginx.conf`.

- [ ] `AgendaPublicaSaida` (zod): `{ clube: { nome }, hoje: DataCivil, compromissos: [{ data, fim?, nome, tipo,
  horario|null, local|null, uniforme|null }] }`. `tipo` é o do calendário mais `'REUNIAO'` para a semanal, **cru**
  (a página agrupa). Sem campo de pontos, lista, id ou pessoa.
- [ ] `TIPOS_COM_UNIFORME = ['REUNIAO_EXTRA', 'EVENTO', 'EVENTO_ESPECIAL', 'ACAMPAMENTO']` em `enums.ts`, ao lado
  de `UNIFORMES_EVENTO` (`enums.ts:37-41`).
- [ ] `apps/web/nginx.conf`: `location /agenda/` que serve o `index.html` e manda `X-Robots-Tag: noindex`.
  **`add_header` dentro de `location` descarta os do `server`**: repita os três cabeçalhos de segurança e a CSP
  do bloco `server` (ver `nginx.conf`, bloco que já faz isso para `/api/materiais/arquivo`).
- [ ] Build do shared (`pesado -- npm run build -w packages/shared`) e `tipos`.
- Commit: `feat(agenda-publica): contrato da agenda pública e cabeçalho noindex`.

## P1 — uniforme nos quatro tipos (implementador)

**Entrega:** criar/editar Reunião extra, Evento do clube, Evento especial e Acampamento exige uniforme, com
"campo" marcado ao criar; pontos seguem só no especial.

**Mapa (conferido em `61f95b6`):**

| Arquivo | Papel |
|---|---|
| `packages/shared/src/formulas/calendario.ts:210-225` | `validarEvento`: exigir `uniforme` nos `TIPOS_COM_UNIFORME`; pontos só no especial |
| `packages/shared/src/contratos/calendario.ts:10-45` | comentários "só no especial" (~linhas 21 e 36) passam a dizer os quatro tipos |
| `packages/shared/src/enums.ts:39` | comentário idem |
| `apps/api/src/calendario/eventos.controller.ts:31-35` | `semOsCamposDoEspecial`: separar uniforme (quatro tipos) de pontos (especial) |
| `apps/api/src/calendario/servico-eventos.ts:125-142` | `paraColunas`: idem |
| `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:135,161,260,328` | seletor de uniforme sai do bloco do especial; "campo" padrão ao criar e ao editar evento antigo sem uniforme; envio nos quatro tipos |

**Testes que assumem uniforme nulo fora do especial e precisam mudar:** `apps/api/src/calendario/eventos.spec.ts:655-665`,
`apps/api/src/sync/sync.spec.ts:266`, `apps/web/src/modulos/adm/calendario/calendario.test.tsx:482-486`,
`formulario-erros.test.tsx:19-53`, `formulario-especial.test.tsx` (o uniforme já vem marcado), e o teste de
`validarEvento` no shared.

**Não quebra (já verificado, não reprovar):** ranking (`apps/api/src/ranking/regras/regras.service.ts:53-61` filtra
o especial), troca de uniforme com lista concluída (`servico-eventos.ts:277`), pacote offline
(`sync.service.ts:110`, `contratos/sync.ts:55` já leva uniforme de qualquer tipo).

**Pronto quando:** critérios 3, 6 e 12 da SPEC; testes do pacote verdes; `tipos` de shared, api e web verdes.
**Fora do pacote:** calendário interno do app (leitura, cartão do próximo evento, calendário do Adm).
- Commit: `feat(calendario): uniforme de gala ou campo em reunião extra, evento do clube e acampamento`.

## P2 — rota pública (implementador)

**Entrega:** `GET /api/agenda-publica/:slug`, `@Publica()`, com tudo que a SPEC §"Rota pública" manda.

**Mapa:**

| Arquivo | Papel |
|---|---|
| `apps/api/src/auth/` (serviço novo, ao lado de `convite-acesso-publico.service.ts:31-39`) | resolve `slug → { clubeId, nome }` com `PrismaSistema`; 404 se não existe |
| `apps/api/src/agenda-publica/` (módulo, controller, service, spec — novos) | lê eventos e configuração com `PrismaService` + `clubeId`; monta os compromissos |
| `apps/api/src/auth/limite.ts:45-61` | constante de limite própria (120/min por IP) para esta rota |
| `apps/api/src/app.module.ts` | registrar o módulo |
| `packages/shared/src/formulas/calendario.ts:50-85` | `diasDeReuniao` e `situacaoDaData`, a reutilizar sem copiar |
| `apps/api/prisma/schema.prisma:249-251` | `diaReuniao`, `horaReuniao`, `localReuniaoPadrao` |

**Regras (SPEC):** hoje e janela (120 dias) no fuso da configuração do clube (`hojeNoFuso`, como em
`sync.service.ts`); eventos sem `CLASSE_BIBLICA`; `diasDeReuniao` recebe todos os eventos não removidos exceto
Classe Bíblica; cada data vira "Reunião" com horário/local padrão e uniforme `CAMPO`, **exceto** quando há Reunião
extra com "Terá reunião" naquela data (a extra substitui a linha); extra só com classe não substitui;
`@SkipThrottle({ porEmail: true })` + limite próprio; `Cache-Control: public, max-age=60`; sem cache no servidor.

**Testes (primeiro):** slug inexistente 404; sem login responde 200; resposta não contém pontos, lista,
`clubeId` nem nomes (valida com o schema do contrato, `.strict()`); isolamento (clube A não vê evento do B);
Classe Bíblica ausente; Sem reunião/Feriado/Férias tiram a semanal; extra substitui a semanal; extra só com
classe não substitui; evento antigo sem uniforme devolve `uniforme: null`; cabeçalho de cache; limite (padrão de
`limite.spec.ts`). **Pronto quando:** critérios 1 (API), 5, 7, 8, 9 (API) e 11 (rota) da SPEC; `tipos` da api.
- Commit: `feat(agenda-publica): rota pública com os próximos compromissos do clube`.

## P3 — página web (implementador)

**Entrega:** `/agenda/:slug` conforme o mockup, nos cinco estados.

**Mapa:**

| Arquivo | Papel |
|---|---|
| `apps/web/src/modulos/agenda-publica/` (novo) | página, cartão do próximo compromisso, lista por mês, calendário, estados, teste |
| `apps/web/src/modulos/acesso/rotas.tsx:11` | padrão a seguir (`rotasAcessoPublicas`), com teste como em `substituto.test.tsx` |
| `apps/web/src/rotas.tsx:67-70` | registrar a rota fora do `GuardaRota`, junto de `/conectar` |
| `apps/web/src/api/cliente.ts:220-228` | o cliente envia `Authorization` e renova em 401: a página usa chamada **sem sessão** |
| `apps/web/src/modulos/adm/calendario/UniformeDoEvento.tsx` | componente do uniforme, a reutilizar |
| `apps/web/src/ui/tokens.css` | tokens; cor nova vira token |
| `docs/fases/agenda-publica/modelo/Agenda-Publica.html` | alvo: estrutura, ordem e texto |

**Regras:** o card mostra nome, "horário · local" e `UniformeDoEvento` (sem etiqueta de tipo); o tipo aparece só
nas cores e na legenda do calendário; Feriado, Férias e Sem reunião viram "Sem reunião"; abreviações do
calendário Reun., Extra, Evento, Acamp., Sem; `<meta name="robots" content="noindex">` ao montar; faixa de
"Sem conexão" montada pela própria página (o layout autenticado não a cobre); botões do calendário com 44px;
nenhuma informação só pela cor.

**Testes (primeiro), MSW:** próximo compromisso é o de menor data; reunião semanal com "Uniforme de campo";
evento sem uniforme sem etiqueta; vazio, erro com "Tentar de novo", carregando, sem conexão; 404 mostra
"Agenda não encontrada"; navegação do calendário limitada à janela; nenhum pedido sai com `Authorization`.
**Pronto quando:** critérios 1, 2, 4, 9 (página), 10 e 11 (noindex) da SPEC; `tipos` e lint do web.
- Commit: `feat(agenda-publica): página pública da agenda para os pais`.

---

## Fechamento (principal)

1. [ ] Rascunho e revisão: `gestor-pr` com "push de revisão" (a PR #46 já existe e **continua em rascunho**).
   Revisar a PR inteira contra a base (`rules/pr-pronta.md`, passos 3 e 4); consertos locais até não sobrar
   Critical nem Important; até 3 rodadas.
2. [ ] Perguntar ao usuário se quer validar localmente; gravar com `ambiente validacao`.
3. [ ] Suíte: o gate é o **CI do GitHub** (job `verificar`). Sem rodar a suíte inteira localmente.
4. [ ] `documentador` com a branch e a base (README/docs que citem o calendário ou o link público).
5. [ ] QA de interface (`qa-roteiro`), um item por bloco do mockup: cabeçalho, próximo compromisso, lista,
   calendário, rodapé, e os cinco estados. A e2e roda só no CI.
6. [ ] `gestor-pr` sobe o que falta e roda `gh pr ready`; confirmar `isDraft=false`.
7. [ ] `ambiente listar`: perguntar manter ou derrubar cada ambiente que ficou no ar.

## O que NÃO quebra (verificado)

- Ranking e pontos do evento especial: filtram pelo tipo (`regras.service.ts:53-61`).
- Pacote offline e sincronização: já levam o uniforme de qualquer tipo (`sync.service.ts:110`).
- Nenhuma migration: `EventoCalendario.uniforme` já é coluna anulável (`schema.prisma:900`).
- O lint de `PrismaSistema` não é tocado: só `auth/` o importa.

## ONDE FICA

Os ponteiros por arquivo estão nas tabelas de cada pacote e no bloco `ONDE FICA` de [SPEC.md](SPEC.md).
Conferido em `61f95b6` (base `main`); a branch tem só commits de `docs/`.
