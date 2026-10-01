# Fichas do Adm e telas de edição dedicadas — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** dar a cada registro do Adm uma ficha só de leitura com endereço próprio, mover toda edição
com mais de 3 campos para uma tela dedicada e dar ao Adm a tela de corrigir a chamada de uma reunião.

**Architecture:** três leituras novas na API (`GET /usuarios/:id`, `/unidades/:id`,
`/calendario/eventos/:id`) e `ultimoAcessoEm` no contrato do usuário. No front, cada módulo do Adm
ganha `Ficha<Registro>` e `Editar<Registro>` sobre quatro componentes canônicos de `ui/`; filtros
das listas passam a morar no endereço (`useFiltrosNaUrl`) e a ficha recebe pelo estado da
navegação para onde o Voltar leva e os avisos de gravação (`useVoltarPara`, `useAvisosDaFicha`). A
correção da chamada do Adm reaproveita `FormularioChamada` num modo de envio direto, sem fila.

**Tech Stack:** NestJS 11 + Prisma (API, Jest), React 19 + React Router 7 + TanStack Query 5
(web, Vitest + MSW 2), Zod 4 em `packages/shared`, Playwright (e2e, headless).

**Spec:** [SPEC.md](SPEC.md) e o modelo em [modelo/](modelo/) (o modelo vence a SPEC, salvo as
"Exceções ao modelo"). **Branch:** `feature/fichas-e-edicao` · **Worktree:**
`/home/robertogabrieu/desbravadores/.claude/worktrees/fichas` · **PR:** #22 (rascunho).

## Global Constraints

- **Zero `any`.** Tipo específico, `unknown` com type guard, ou generic (CLAUDE.md).
- **Contratos só em `packages/shared`.** Nada de redeclarar `UsuarioSaida`, `UnidadeSaida`,
  `EventoSaida`, `ReuniaoEnvio*` na API ou no web.
- **Toda operação de modelo de clube leva `clubeId`; fora do clube ou do escopo: 404, nunca 403.**
  Id malformado: 400 `VALIDACAO`. O front trata 404 e 400 como "Não encontramos".
- **Toda rota declara `@Pode`/`@Logado`.** `GET /unidades/:id` é declarada **depois** de
  `sem-membros` (`unidades.controller.ts:21-26`).
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** Classes saem dos tokens e de `ui/`.
- **Nenhum elemento `fixed`/`sticky` novo.** Rodapé do formulário e cabeçalho rolam com a página.
- **Voltar nunca é `navegar(-1)`**: destino explícito.
- **Sair da edição sem salvar não pergunta nada.**
- **Tela trata carregando, vazio, erro e sem conexão** (CLAUDE.md); conexão só por `useConexao`.
- **Testes de integração da API criam banco próprio**; Playwright sempre headless.
- **Testes antes da implementação, dentro de cada pacote:** todos os testes do pacote escritos
  primeiro e vistos falhando; depois implementar; depois verde. Nada de intercalar teste por passo.
- **Validação pesada só na fase final (P8):** suíte inteira, e2e, medição e QA. Por pacote: só os
  testes do pacote e `tipos` do workspace.
- **Máquina fraca:** uma suíte pesada por vez, sempre pelo `pesado`; Node 22
  (`export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`); Vitest com `--maxWorkers=2`.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`).
- **`packages/shared` é consumido pelo `dist/` na API:** mudou contrato, `npm run build -w packages/shared`
  antes de testar a API (o web usa o `src/` por alias, `apps/web/vite.config.ts:49`).

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** contrato, rotas, handlers de teste, merge da main | agente principal (inline) | — |
| 1 | **P1** API: três leituras, `ultimoAcessoEm`, `totalMembros`, link da atividade | subagente `implementador` | P0 |
| 1 | **P2** base de tela: `ui/` canônicos, navegação e formatos | subagente `implementador` | P0 |
| 2 | **P3** desbravador | subagente `implementador` | P2 |
| 2 | **P4** usuário | subagente `implementador` | P2 |
| 3 | **P5** unidade (+ Visão geral) | subagente `implementador` | P2 |
| 3 | **P6** evento e calendário | subagente `implementador` | P2 |
| 4 | **P7** reunião do Adm e corrigir chamada | subagente `implementador` | P2 |
| 5 | **P8** fase final: e2e, medição, suíte inteira, revisão, QA, docs | `implementador` (e2e) → `testador` → revisão → `qa-runner` → `documentador` → `gestor-pr` | P1–P7 |

Pacotes da mesma onda tocam arquivos disjuntos (conferido nas listas abaixo) e testes que não usam
banco (web) ou o banco próprio do Jest (P1): podem correr em paralelo, **no máximo dois
implementadores de cada vez** — o `pesado` enfileira as rodadas. P7 fica sozinho na onda 4 porque
mexe em `modulos/reunioes/` (conselheiro) e vale revisar o diff dele isolado.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 10 (contrato 1, rotas 2, handlers 7) | principal — arquivos de dono compartilhado |
| P1 | 9 | implementador |
| P2 | 9 | implementador |
| P3 | 13 | implementador |
| P4 | 10 | implementador |
| P5 | 13 | implementador |
| P6 | 9 | implementador |
| P7 | 9 | implementador |
| P8 | 4 (e2e) + roteiro de QA | implementador + testador + qa-runner + documentador |
| **Total** | **~86** | 8 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U — 591k com 1–2 arquivos,
256k com 6–10, 559k com 21+. Os pacotes ficam entre 9 e 13 (teto 15). Juntar P3+P4 (23 arquivos)
ou P5+P6 (22) cairia no braço caro do U; partir P3 em lista/ficha/edição (4–5 cada) repagaria o
piso de ~27k três vezes para arquivos que se leem juntos. P0 tem 10 arquivos mas fica com o
principal porque são todos de dono compartilhado (contrato, `rotas.tsx` raiz, handlers que cinco
pacotes importam) — escrevê-los antes de delegar custa zero e evita cinco pacotes editando os
mesmos arquivos. P8 tem só 4 arquivos e ainda assim é delegado: a saída do e2e não pode entrar no
contexto do principal (§3, eixo do contexto, não da granularidade).

Orçamento por implementador: **~80 turnos**.

---

## P0 — agente principal (inline), onda 0

**Por que inline:** contrato, `rotas.tsx` raiz e handlers de teste são ímãs de conflito; cinco
pacotes dependem deles.

**Files:**
- Modify: `packages/shared/src/contratos/usuarios.ts:1-56` (import de `InstanteIso`; campo em `UsuarioSaida`)
- Modify: `apps/web/src/rotas.tsx:5-11, 89-98` (import e espalhar `rotasAdmReunioes`)
- Create: `apps/web/src/modulos/adm/reunioes/rotas.tsx`
- Create: `apps/web/src/testes/handlers/caixa.ts`
- Modify: `apps/web/src/testes/handlers/usuarios.ts:11-21` (fixture + `handlerUsuario`)
- Modify: `apps/web/src/testes/handlers/unidades.ts` (acrescenta `handlerUnidade`)
- Modify: `apps/web/src/testes/handlers/calendario.ts` (acrescenta `handlerEvento`)
- Modify: `apps/web/src/testes/handlers/desbravadores.ts` (acrescenta `handlerDesbravador`)
- Modify: `apps/web/src/testes/handlers/perfil.ts` (acrescenta `handlerPerfilDe`)
- Modify: `apps/web/src/testes/handlers/chamada.ts` (acrescenta `handlerReuniaoDe`, `criarSaidaEnvio`, `handlerCorrigirChamada`)

**Interfaces (produz):**
- `UsuarioSaida.ultimoAcessoEm: string | null` (ISO com offset).
- `rotasAdmReunioes: RouteObject[]` (vazio; P7 preenche).
- `Caixa<T> { atual: T }`, `caixa<T>(atual: T): Caixa<T>`, `lerPorId(id, caixas, mensagem)`.
- `handlerUsuario(...caixas: Caixa<Usuario>[])`, `handlerUnidade(...caixas: Caixa<Unidade>[])`,
  `handlerEvento(...caixas: Caixa<EventoCalendario>[])`, `handlerDesbravador(...caixas: Caixa<Desbravador>[])`,
  `handlerPerfilDe(dbvs: Caixa<Desbravador>[], parcial?: Partial<PerfilDbv>)`,
  `handlerReuniaoDe(...caixas: Caixa<Detalhe>[])`, `criarSaidaEnvio(reuniaoId, parcial?)`,
  `handlerCorrigirChamada(saida, recebidos?, recusa?)`.

- [ ] **Passo 1: trazer a main.** A branch saiu de `e9b7cac`; #20 e #21 foram mesclados depois e
  #21 tira o `sticky` do rodapé de `FormularioChamada` (a SPEC conta com isso).

```bash
cd /home/robertogabrieu/desbravadores/.claude/worktrees/fichas
git fetch origin
git merge --no-edit origin/main   # merge, não rebase: a PR #22 já está no remoto
grep -n "sticky" apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx   # esperado: nada
```

- [ ] **Passo 2: contrato.** Em `packages/shared/src/contratos/usuarios.ts`, trocar o import de
  `./comum` e acrescentar o campo em `UsuarioSaida`:

```ts
import { Email, InstanteIso, Paginacao, TextoCurto, Uuid, pagina } from './comum'
// ...
export const UsuarioSaida = z.object({
  id: Uuid,
  nome: z.string(),
  email: z.string(),
  genero: Sexo.nullable(),
  /** CONVIDADO = nunca definiu senha; INATIVO = sem vínculo ativo NESTE clube. Nunca o status global. */
  situacao: z.enum(SITUACOES_NO_CLUBE),
  /** Último login ou aceite de convite; null = nunca entrou. No eco de e-mail já cadastrado, sempre null. */
  ultimoAcessoEm: InstanteIso.nullable(),
  vinculos: z.array(VinculoSaida), // só os deste clube
})
```

Depois: `npm run build -w packages/shared` (a API lê o `dist/`). A API fica sem compilar até o P1
(`montarSaida` ainda não devolve o campo) — não rode `tipos -w api` entre P0 e P1.

- [ ] **Passo 3: rota do módulo novo** — `apps/web/src/modulos/adm/reunioes/rotas.tsx`:

```tsx
import type { RouteObject } from 'react-router-dom'

/** Ficha da reunião e correção da chamada pelo Adm (pacote P7). */
export const rotasAdmReunioes: RouteObject[] = []
```

e em `apps/web/src/rotas.tsx`: `import { rotasAdmReunioes } from './modulos/adm/reunioes/rotas'`
e `...rotasAdmReunioes,` logo depois de `...rotasAdmCalendario,` no bloco do Adm.

- [ ] **Passo 4: `apps/web/src/testes/handlers/caixa.ts`**

```ts
import { HttpResponse } from 'msw'
import type { JsonBodyType } from 'msw'

/** Registro que leitura e escrita dividem num teste: a escrita troca `atual`, a leitura devolve o que estiver lá. */
export interface Caixa<T> {
  atual: T
}

export const caixa = <T>(atual: T): Caixa<T> => ({ atual })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Leitura por id como a API: id malformado → 400 VALIDACAO; fora das caixas → 404 NAO_ENCONTRADO. */
export function lerPorId<T extends JsonBodyType & { id: string }>(id: string, caixas: Caixa<T>[], naoEncontrado: string) {
  if (!UUID.test(id)) return HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Confira os campos informados.' }, { status: 400 })
  const achada = caixas.find((c) => c.atual.id === id)
  if (!achada) return HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: naoEncontrado }, { status: 404 })
  return HttpResponse.json(achada.atual)
}
```

- [ ] **Passo 5: handlers das leituras novas** (cada um no arquivo do seu módulo):

```ts
// testes/handlers/usuarios.ts — em criarUsuario, acrescentar `ultimoAcessoEm: null,` antes de `vinculos`
export const handlerUsuario = (...caixas: Caixa<Usuario>[]) =>
  http.get('/api/usuarios/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Usuário não encontrado.'))

// testes/handlers/unidades.ts
/** GET /api/unidades/:id. "sem-membros" segue para o handler dele, como na API a rota literal vem antes. */
export const handlerUnidade = (...caixas: Caixa<Unidade>[]) =>
  http.get('/api/unidades/:id', ({ params }) => {
    const id = String(params['id'])
    if (id === 'sem-membros') return undefined
    return lerPorId(id, caixas, 'Unidade não encontrada.')
  })

// testes/handlers/calendario.ts
export const handlerEvento = (...caixas: Caixa<EventoCalendario>[]) =>
  http.get('/api/calendario/eventos/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Evento não encontrado.'))

// testes/handlers/desbravadores.ts
export const handlerDesbravador = (...caixas: Caixa<Desbravador>[]) =>
  http.get('/api/desbravadores/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Desbravador não encontrado.'))

// testes/handlers/perfil.ts
/** Perfil montado sobre o desbravador da caixa: a ficha mostra o que a última gravação deixou. */
export const handlerPerfilDe = (dbvs: Caixa<Desbravador>[], parcial: Partial<PerfilDbv> = {}) =>
  http.get('/api/desbravadores/:id/perfil', ({ params }) => {
    const id = String(params['id'])
    const achado = dbvs.find((c) => c.atual.id === id)
    if (!achado) return lerPorId(id, dbvs, 'Desbravador não encontrado.')
    return HttpResponse.json(criarPerfil({ ...parcial, dbv: achado.atual }))
  })
```

Regra para quem usa estes handlers: **todas as caixas de um teste entram num handler só** (os
handlers recebem várias). O MSW põe na frente o `servidor.use` mais recente; um segundo
`handlerUsuario(outra)` registrado antes do `abrir` do teste ficaria atrás do primeiro, que
responderia 404 para o id que não conhece.

- [ ] **Passo 6: handlers da reunião do Adm** em `testes/handlers/chamada.ts`:

```ts
import type { ReuniaoEnvioSaida } from '@desbravadores/shared'
import { lerPorId } from './caixa'
import type { Caixa } from './caixa'

type SaidaEnvio = z.infer<typeof ReuniaoEnvioSaida>

export const handlerReuniaoDe = (...caixas: Caixa<Detalhe>[]) =>
  http.get('/api/reunioes/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Reunião não encontrada.'))

export function criarSaidaEnvio(reuniaoId: string, parcial: Partial<SaidaEnvio> = {}): SaidaEnvio {
  return {
    reuniaoId,
    pontos: [],
    totalPontos: 0,
    linhas: [],
    cabecalhoVersao: '2030-03-10T12:30:00.000Z',
    conflitoCabecalho: false,
    conflitos: [],
    ignorados: [],
    ...parcial,
  }
}

/** PUT /api/sync/reunioes/:uuid: guarda cada pedido em `recebidos` e responde `saida(uuid)` ou a recusa. */
export function handlerCorrigirChamada(
  saida: (uuid: string) => SaidaEnvio,
  recebidos: { uuid: string; corpo: unknown }[] = [],
  recusa?: { status: number; codigo: string; mensagem: string },
) {
  return http.put('/api/sync/reunioes/:uuid', async ({ request, params }) => {
    const uuid = String(params['uuid'])
    recebidos.push({ uuid, corpo: await request.json() })
    if (recusa) return HttpResponse.json({ codigo: recusa.codigo, mensagem: recusa.mensagem }, { status: recusa.status })
    return HttpResponse.json(saida(uuid))
  })
}
```

- [ ] **Passo 7: conferir que o web compila e nada quebrou nos testes existentes de usuários.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run tipos -w web
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/usuarios src/rotas.test.tsx
```
Esperado: tipos verde; testes verdes (o campo novo só entra na fixture).

- [ ] **Passo 8: baseline por nomes** — delegar ao `testador` a suíte web e a da API **antes** de
  P1–P7, guardando os nomes que já falham (a API não compila agora: colher a da API sobre o commit
  anterior ao Passo 2, ou anotar "API: baseline depois do P1").
- [ ] **Passo 9: commit** (skill `commit`): `chore(fichas): contrato ultimoAcessoEm, rota do módulo de reuniões do Adm e handlers das leituras novas`.

---

## P1 — API: três leituras, `ultimoAcessoEm`, `totalMembros`, link da atividade · subagente, onda 1

**Files:**
- Modify: `apps/api/src/usuarios/usuarios.controller.ts:22-26` (rota `GET :id` depois de `listar`)
- Modify: `apps/api/src/usuarios/usuarios.service.ts:51-69` (`montarSaida`), `:115-137` (eco do `criar`), novo `obter` perto de `:140`
- Modify: `apps/api/src/usuarios/usuarios.spec.ts` (describe novo)
- Modify: `apps/api/src/unidades/unidades.controller.ts:21-32` (rota `GET :id` depois de `sem-membros`)
- Modify: `apps/api/src/unidades/unidades.service.ts:28-34` (`_count` filtrado), novo `obter` depois de `listar` (`:84-93`)
- Modify: `apps/api/src/unidades/unidades.spec.ts` (testes novos + isolamento)
- Modify: `apps/api/src/calendario/eventos.controller.ts:37-44` (rota `GET eventos/:id`)
- Modify: `apps/api/src/calendario/servico-eventos.ts:103-121` (link da atividade), novo `obter`
- Modify: `apps/api/src/calendario/eventos.spec.ts` (testes novos)

**Interfaces:**
- Consome: `UsuarioSaida.ultimoAcessoEm` (P0).
- Produz: `GET /api/usuarios/:id → UsuarioSaida` (`usuario.gerenciar`); `GET /api/unidades/:id →
  UnidadeSaida` (`dbv.ver`); `GET /api/calendario/eventos/:id → EventoSaida` (`@Logado`);
  `UnidadeSaida.totalMembros` = membros abertos com `dbv.tipo = DBV` e `dbv.ativo`; atividade
  `EVENTO_CRIADO` com `link = /adm/calendario/eventos/<id>`.

- [ ] **Passo 1: escrever todos os testes do pacote (vão falhar).**

`usuarios.spec.ts`, describe novo (usa `criarVinculo`, `criarUsuario`, `prismaDeTeste`, já importados):

```ts
describe('GET /usuarios/:id e ultimoAcessoEm', () => {
  it('le o usuario do clube com vinculos inativos e o ultimo acesso; a lista traz o mesmo campo', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const alvo = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await criarVinculo({ usuarioId: alvo.usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', ativo: false })
    const quando = new Date('2026-09-30T13:45:00.000Z')
    await prismaDeTeste().usuario.update({ where: { id: alvo.usuario.id }, data: { ultimoAcessoEm: quando } })

    const lido = corpo<Usuario>(await api.get(`/api/usuarios/${alvo.usuario.id}`, adm.autorizacao).expect(200))
    expect(lido).toMatchObject({ id: alvo.usuario.id, ultimoAcessoEm: quando.toISOString() })
    expect(lido.vinculos.map((v) => `${v.papel}:${v.ativo}`).sort()).toEqual(['CONSELHEIRO:true', 'INSTRUTOR:false'])
    const lista = corpo<Lista>(await api.get('/api/usuarios', adm.autorizacao).expect(200))
    expect(lista.itens.find((u) => u.id === alvo.usuario.id)?.ultimoAcessoEm).toBe(quando.toISOString())
    expect(lista.itens.find((u) => u.id === adm.usuario.id)?.ultimoAcessoEm).toBeNull()
  })

  it('usuario sem vinculo neste clube → 404; id malformado → 400; sem usuario.gerenciar → 403', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const alheio = await criarAcesso({ clubeId: outro.id, papel: 'CONSELHEIRO' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    expect((await api.get(`/api/usuarios/${alheio.usuario.id}`, adm.autorizacao).expect(404)).body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    expect((await api.get('/api/usuarios/nao-e-uuid', adm.autorizacao).expect(400)).body).toMatchObject({ codigo: 'VALIDACAO' })
    await api.get(`/api/usuarios/${adm.usuario.id}`, conselheiro.autorizacao).expect(403)
  })

  it('o eco do POST para e-mail ja cadastrado nao revela o ultimo acesso da conta', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const existente = await criarUsuario({ email: 'ja.existe@exemplo.org' })
    await prismaDeTeste().usuario.update({ where: { id: existente.id }, data: { ultimoAcessoEm: new Date() } })
    const saida = corpo<Usuario>(
      await api.post('/api/usuarios', adm.autorizacao, { nome: 'Outro Nome', email: 'ja.existe@exemplo.org', vinculos: [{ papel: 'INSTRUTOR' }] }).expect(201),
    )
    expect(saida.ultimoAcessoEm).toBeNull()
  })
})

describe('isolamento entre clubes: leitura do usuario', () => {
  testarIsolamento({
    titulo: 'GET /usuarios/:id',
    app: () => app,
    papel: 'ADM',
    semear: async (clube) => {
      const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      return { metodo: 'get', caminho: `/api/usuarios/${acesso.usuario.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
```

`unidades.spec.ts` (usa `colocar` de `:34-36`; acrescentar `criarVinculo` e `criarUsuario` ao import de fábricas se faltar):

```ts
it('GET /unidades/:id: ADM le ativa e inativa; totalMembros conta so DBV ativo com passagem aberta', async () => {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Aguias' })
  const ativo = await criarDbv({ clubeId: clube.id })
  const inativo = await criarDbv({ clubeId: clube.id, ativo: false })
  const diretoria = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA' })
  for (const dbv of [ativo, inativo, diretoria]) await colocar(clube.id, dbv.id, aguias.id)

  const lida = corpo<Unidade>(await api.get(`/api/unidades/${aguias.id}`, adm.autorizacao).expect(200))
  expect(lida).toMatchObject({ id: aguias.id, nome: 'Aguias', totalMembros: 1 })
  const membros = corpo<Membro[]>(await api.get(`/api/unidades/${aguias.id}/membros`, adm.autorizacao).expect(200))
  expect(membros).toHaveLength(lida.totalMembros)
  const lista = corpo<Unidade[]>(await api.get('/api/unidades', adm.autorizacao).expect(200))
  expect(lista.find((u) => u.id === aguias.id)?.totalMembros).toBe(1)

  await prismaDeTeste().unidade.updateMany({ where: { id: aguias.id, clubeId: clube.id }, data: { ativa: false } })
  expect(corpo<Unidade>(await api.get(`/api/unidades/${aguias.id}`, adm.autorizacao).expect(200)).ativa).toBe(false)
})

it('GET /unidades/:id: conselheiro le a sua; fora do escopo, inativa e instrutor → 404; id malformado → 400', async () => {
  const clube = await criarClube()
  const sua = await criarUnidade({ clubeId: clube.id })
  const alheia = await criarUnidade({ clubeId: clube.id })
  const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [sua.id] })
  const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
  await api.get(`/api/unidades/${sua.id}`, conselheiro.autorizacao).expect(200)
  await api.get(`/api/unidades/${alheia.id}`, conselheiro.autorizacao).expect(404)
  await api.get(`/api/unidades/${sua.id}`, instrutor.autorizacao).expect(404)
  await prismaDeTeste().unidade.updateMany({ where: { id: sua.id, clubeId: clube.id }, data: { ativa: false } })
  await api.get(`/api/unidades/${sua.id}`, conselheiro.autorizacao).expect(404)
  await api.get('/api/unidades/nao-e-uuid', conselheiro.autorizacao).expect(400)
})

it('GET /unidades/sem-membros continua respondendo a lista (nao cai na rota :id)', async () => {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const livre = await criarDbv({ clubeId: clube.id })
  const lista = corpo<Membro[]>(await api.get('/api/unidades/sem-membros', adm.autorizacao).expect(200))
  expect(lista.map((m) => m.dbvId)).toContain(livre.id)
})

// dentro de describe('isolamento entre clubes'):
testarIsolamento({
  titulo: 'GET /unidades/:id',
  app: () => app,
  papel: 'ADM',
  semear: async (clube) => {
    const unidade = await criarUnidade({ clubeId: clube.id })
    return { metodo: 'get', caminho: `/api/unidades/${unidade.id}` }
  },
  esperado: { tipo: 'NAO_ENCONTRADO' },
})
```

`eventos.spec.ts` (tipo `Saida = z.infer<typeof EventoSaida>`; `testarIsolamento` importado de `../../test/isolamento`):

```ts
describe('GET /calendario/eventos/:id', () => {
  it('le o evento do clube para qualquer papel logado; removido e de outro clube → 404; id malformado → 400', async () => {
    const { adm, instrutor } = await cenario()
    const outro = await criarClube()
    const criado = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento())).evento
    const lido = corpo<Saida>(await http.get(`/api/calendario/eventos/${criado.id}`, instrutor.autorizacao).expect(200))
    expect(lido).toEqual(criado)
    const alheio = await criarEvento({ clubeId: outro.id, tipo: 'EVENTO', inicio: dia(4) })
    await http.get(`/api/calendario/eventos/${alheio.id}`, adm.autorizacao).expect(404)
    await http.get('/api/calendario/eventos/nao-e-uuid', adm.autorizacao).expect(400)
    expect((await apagar(`/api/calendario/eventos/${criado.id}`, adm.autorizacao)).status).toBe(204)
    await http.get(`/api/calendario/eventos/${criado.id}`, adm.autorizacao).expect(404)
  })

  it('a atividade "evento criado" leva à ficha do evento', async () => {
    const { clube, adm } = await cenario()
    const criado = corpo<Gravado>(await http.post('/api/calendario/eventos', adm.autorizacao, evento())).evento
    const [atividade] = await prismaDeTeste().atividade.findMany({ where: { clubeId: clube.id } })
    expect(atividade?.link).toBe(`/adm/calendario/eventos/${criado.id}`)
  })

  testarIsolamento({
    titulo: 'GET /calendario/eventos/:id',
    app: () => app,
    papel: 'ADM',
    semear: async (clube) => {
      const alvo = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: dia(3) })
      return { metodo: 'get', caminho: `/api/calendario/eventos/${alvo.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
```

- [ ] **Passo 2: ver o vermelho** (implementador, pelo `pesado`; o `build` do shared já foi feito no P0):

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w api -- src/usuarios/usuarios.spec.ts src/unidades/unidades.spec.ts src/calendario/eventos.spec.ts
```
Esperado: falha de compilação do `montarSaida` (sem `ultimoAcessoEm`) e 404 nas rotas novas.

- [ ] **Passo 3: usuários.** Em `montarSaida` (`usuarios.service.ts:51`) acrescentar
  `ultimoAcessoEm: usuario.ultimoAcessoEm?.toISOString() ?? null,` (o `include` já traz os escalares).
  No retorno do `criar` (`:136`): `return { ...montarSaida(gravado), nome: entrada.nome, genero: entrada.genero ?? null, situacao: 'CONVIDADO', ultimoAcessoEm: null }`.
  Serviço e rota:

```ts
// usuarios.service.ts, depois de `listar`
/** Usuário com vínculo (ativo ou não) neste clube, com todos os vínculos daqui; senão 404. */
async obter(sessao: SessaoLogada, id: string): Promise<Saida> {
  return montarSaida(await this.carregar(sessao.clubeId, id))
}

// usuarios.controller.ts, logo depois de `listar`
@Pode('usuario.gerenciar')
@Get(':id')
obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
  return this.usuarios.obter(sessao, id)
}
```

- [ ] **Passo 4: unidades.**

```ts
// unidades.service.ts:28-34 — o total conta como a lista de membros (`:99-101`)
const INCLUIR_UNIDADE = {
  vinculos: {
    where: { vinculo: { ativo: true, papel: 'CONSELHEIRO' } },
    include: { vinculo: { select: { usuario: { select: { id: true, nome: true } } } } },
  },
  _count: { select: { membros: { where: { fim: null, dbv: { tipo: 'DBV', ativo: true } } } } },
} satisfies Prisma.UnidadeInclude

// depois de `listar`
/** Unidade do clube no escopo de quem pede; inativa só para o ADM, como a lista (`:88-90`). */
async obter(sessao: SessaoLogada, id: string): Promise<Unidade> {
  await this.exigirNoEscopo(sessao, id)
  const unidade = await this.prisma.unidade.findFirst({
    where: { id, clubeId: sessao.clubeId, ...(sessao.papel === 'ADM' ? {} : { ativa: true }) },
    include: INCLUIR_UNIDADE,
  })
  if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
  return montarUnidade(unidade)
}

// unidades.controller.ts — DEPOIS do método semMembros e ANTES de membros
@Pode('dbv.ver')
@Get(':id')
obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
  return this.unidades.obter(sessao, id)
}
```

O comentário de `:21` passa a dizer "Rota literal antes das paramétricas: senão `:id` engoliria
\"sem-membros\"." (continua valendo, agora para duas rotas).

- [ ] **Passo 5: eventos.**

```ts
// servico-eventos.ts, depois de `doAno`
async obter(clubeId: string, id: string): Promise<Saida> {
  const evento = await this.prisma.eventoCalendario.findFirst({ where: { id, clubeId, removidoEm: null } })
  if (!evento) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
  return paraSaida(evento)
}
// em `gravar` (:116): link: `/adm/calendario/eventos/${gravado.id}`,

// eventos.controller.ts, depois de `ano`; importar `EventoSaida` como tipo
@Logado()
@Get('eventos/:id')
obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof EventoSaida>> {
  return this.eventos.obter(sessao.clubeId, id)
}
```

- [ ] **Passo 6: verde e tipos.**

```bash
pesado -- npm run teste -w api -- src/usuarios/usuarios.spec.ts src/unidades/unidades.spec.ts src/calendario/eventos.spec.ts
pesado -- npm run tipos -w api
```
- [ ] **Passo 7: commit (principal):** `feat(api): leitura por id de usuário, unidade e evento; último acesso e total de membros como a lista`.

---

## P2 — base de tela: `ui/` canônicos, navegação e formatos · subagente, onda 1

**Files:**
- Create: `apps/web/src/ui/CabecalhoDaPagina.tsx`
- Create: `apps/web/src/ui/ListaDePares.tsx`
- Create: `apps/web/src/ui/RodapeDoFormulario.tsx`
- Create: `apps/web/src/ui/EstadoNaoEncontrado.tsx`
- Create: `apps/web/src/ui/fichas.test.tsx`
- Create: `apps/web/src/modulos/adm/navegacao.ts`
- Create: `apps/web/src/modulos/adm/navegacao.test.tsx`
- Create: `apps/web/src/modulos/adm/formatos.ts`
- Create: `apps/web/src/modulos/adm/formatos.test.ts`

**Interfaces (produz — P3 a P7 usam exatamente estes nomes):**

```ts
// ui/CabecalhoDaPagina.tsx
export interface DestinoDoVoltar { para: string; rotulo: string; estado?: object }
export function CabecalhoDaPagina(p: { voltar: DestinoDoVoltar; sobretitulo?: string; titulo: string; apoio?: ReactNode; acoes?: ReactNode }): JSX.Element
// Link visível "<rotulo>", nome acessível "Voltar para <rotulo>"; h1 = titulo.

// ui/ListaDePares.tsx
export interface Par { rotulo: string; valor: ReactNode }
export function ListaDePares(p: { pares: Par[]; colunas?: 2 | 3 }): JSX.Element   // <dl>, 1 coluna no celular

// ui/RodapeDoFormulario.tsx
export function RodapeDoFormulario(p: { cancelar: { para: string; estado?: object }; rotuloSalvar?: string; salvando: boolean }): JSX.Element
// Salvar = <button type="submit"> primário; Cancelar = <Link>. Celular: empilhados, Salvar em cima, largura total.

// ui/EstadoNaoEncontrado.tsx
export function ehNaoEncontrado(erro: unknown): boolean          // ErroDaApi 404 ou 400
export function EstadoNaoEncontrado(p: { registro: string; lista: { para: string; rotulo: string } }): JSX.Element
// título "Não encontramos <registro>" (ex.: registro="este desbravador")

// modulos/adm/navegacao.ts
export interface EstadoDaFicha { voltarPara?: string; avisos?: string[] }
export function useEstadoDeVolta(): EstadoDaFicha        // { voltarPara: pathname + search atuais }
export function useVoltarPara(padrao: string): string    // estado.voltarPara (só se começa com "/adm") ou padrao
export function useAvisosDaFicha(): { avisos: string[]; dispensar: () => void }
export function useFiltrosNaUrl(): { ler: (chave: string) => string; mudar: (mudancas: Record<string, string>) => void }
// `mudar` apaga do endereço a chave com valor "", e troca o endereço sem empilhar histórico (replace).

// modulos/adm/formatos.ts
export const FUSO_PADRAO_DO_CLUBE = 'America/Sao_Paulo'
export function dataCivilBr(data: string): string                    // "2016-01-15" → "15/01/2016"
export function dataPorExtenso(data: string): string                 // "2026-09-27" → "Domingo, 27 de setembro"
export function periodoPorExtenso(inicio: string, fim: string): string // "sex 16 a dom 18 de outubro"
export function horaCurta(horario: string): string                   // "09:00" → "9h", "09:30" → "9h30"
export function instanteCurto(instante: string, fuso: string): string // "27/09 às 11:02"
export function juntarNomes(nomes: string[]): string                 // "a, b e c"
export function textoDoUltimoAcesso(instante: string | null, agora: Date, fuso: string): string
```

- [ ] **Passo 1: escrever todos os testes do pacote.**

`ui/fichas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ErroDaApi } from '../api/cliente'
import { CabecalhoDaPagina } from './CabecalhoDaPagina'
import { EstadoNaoEncontrado, ehNaoEncontrado } from './EstadoNaoEncontrado'
import { ListaDePares } from './ListaDePares'
import { RodapeDoFormulario } from './RodapeDoFormulario'

function Onde() {
  const local = useLocation()
  return <p data-testid="onde">{`${local.pathname}${local.search}`}</p>
}

const emRota = (conteudo: ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/adm/desbravadores/1']}>
      <Routes>
        <Route path="*" element={<>{conteudo}<Onde /></>} />
      </Routes>
    </MemoryRouter>,
  )

describe('CabecalhoDaPagina', () => {
  it('Voltar vai ao destino dado; mostra sobretítulo, h1, apoio e ações', async () => {
    emRota(
      <CabecalhoDaPagina
        voltar={{ para: '/adm/desbravadores?pagina=2', rotulo: 'Desbravadores' }}
        sobretitulo="Desbravador · Ativo"
        titulo="Ana Beatriz Souza"
        apoio="10 anos · Águias"
        acoes={<button type="button">Editar</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })).toBeInTheDocument()
    expect(screen.getByText('Desbravador · Ativo')).toBeInTheDocument()
    expect(screen.getByText('10 anos · Águias')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Desbravadores' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/adm/desbravadores?pagina=2')
  })
})

describe('ListaDePares', () => {
  it('é uma lista de definição com rótulo e valor', () => {
    render(<ListaDePares colunas={3} pares={[{ rotulo: 'Sexo', valor: 'Feminino' }, { rotulo: 'Unidade', valor: 'Águias' }]} />)
    const termos = screen.getAllByRole('term').map((t) => t.textContent)
    expect(termos).toEqual(['Sexo', 'Unidade'])
    expect(screen.getByText('Sexo').nextElementSibling).toHaveTextContent('Feminino')
  })
})

describe('RodapeDoFormulario', () => {
  it('Salvar é o submit e vem antes de Cancelar (em cima no celular); nada preso na tela', () => {
    const { container } = render(
      <MemoryRouter>
        <form>
          <RodapeDoFormulario cancelar={{ para: '/adm/unidades/1' }} rotuloSalvar="Salvar alterações" salvando={false} />
        </form>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/adm/unidades/1')
    const ordem = [...container.querySelectorAll('a, button')].map((e) => e.textContent)
    expect(ordem).toEqual(['Salvar alterações', 'Cancelar'])
    expect(container.innerHTML).not.toMatch(/\b(fixed|sticky)\b/)
  })
})

describe('EstadoNaoEncontrado', () => {
  it('404 e 400 da API contam como "não encontrado"; 500 e outros erros, não', () => {
    expect(ehNaoEncontrado(new ErroDaApi(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'x' }))).toBe(true)
    expect(ehNaoEncontrado(new ErroDaApi(400, { codigo: 'VALIDACAO', mensagem: 'x' }))).toBe(true)
    expect(ehNaoEncontrado(new ErroDaApi(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))).toBe(false)
    expect(ehNaoEncontrado(new Error('rede'))).toBe(false)
  })

  it('diz o que não achou e leva à lista', () => {
    render(
      <MemoryRouter>
        <EstadoNaoEncontrado registro="este desbravador" lista={{ para: '/adm/desbravadores', rotulo: 'Ver a lista de desbravadores' }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Não encontramos este desbravador' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a lista de desbravadores' })).toHaveAttribute('href', '/adm/desbravadores')
  })
})
```

`modulos/adm/navegacao.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useAvisosDaFicha, useEstadoDeVolta, useFiltrosNaUrl, useVoltarPara } from './navegacao'

function Sonda() {
  const voltarPara = useVoltarPara('/adm/desbravadores')
  const { avisos, dispensar } = useAvisosDaFicha()
  const deVolta = useEstadoDeVolta()
  const { ler, mudar } = useFiltrosNaUrl()
  const local = useLocation()
  return (
    <>
      <p data-testid="voltar">{voltarPara}</p>
      <p data-testid="de-volta">{deVolta.voltarPara}</p>
      <p data-testid="busca">{ler('busca')}</p>
      <p data-testid="endereco">{`${local.pathname}${local.search}`}</p>
      <ul>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      <button type="button" onClick={dispensar}>Dispensar</button>
      <button type="button" onClick={() => mudar({ busca: 'Bia', pagina: '' })}>Filtrar</button>
    </>
  )
}

const abrir = (estado: unknown, endereco = '/adm/desbravadores/1?pagina=3') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: endereco.split('?')[0], search: `?${endereco.split('?')[1] ?? ''}`, state: estado }]}>
      <Routes>
        <Route path="*" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  )

describe('navegação das fichas', () => {
  it('Voltar usa o endereço que a lista deixou; sem ele, o padrão', () => {
    abrir({ voltarPara: '/adm/desbravadores?busca=Ana&pagina=2' })
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores?busca=Ana&pagina=2')
  })

  it('ignora destino de fora do painel do Adm', () => {
    abrir({ voltarPara: 'https://exemplo.org/adm' })
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores')
  })

  it('estado de volta é o endereço atual com a busca', () => {
    abrir(null)
    expect(screen.getByTestId('de-volta')).toHaveTextContent('/adm/desbravadores/1?pagina=3')
  })

  it('avisos chegam pelo estado e saem ao dispensar, sem perder o Voltar', async () => {
    abrir({ voltarPara: '/adm/desbravadores?pagina=2', avisos: ['Sai da unidade.'] })
    expect(screen.getByText('Sai da unidade.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByText('Sai da unidade.')).not.toBeInTheDocument()
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores?pagina=2')
  })

  it('filtros: grava no endereço e apaga o que ficou vazio', async () => {
    abrir(null)
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }))
    expect(screen.getByTestId('endereco')).toHaveTextContent('/adm/desbravadores/1?busca=Bia')
    expect(screen.getByTestId('busca')).toHaveTextContent('Bia')
  })
})
```

`modulos/adm/formatos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dataCivilBr, dataPorExtenso, horaCurta, instanteCurto, juntarNomes, periodoPorExtenso, textoDoUltimoAcesso } from './formatos'

const FUSO = 'America/Sao_Paulo'

describe('formatos das fichas', () => {
  it('datas', () => {
    expect(dataCivilBr('2016-01-15')).toBe('15/01/2016')
    expect(dataPorExtenso('2026-09-27')).toBe('Domingo, 27 de setembro')
    expect(periodoPorExtenso('2026-10-16', '2026-10-18')).toBe('sex 16 a dom 18 de outubro')
    expect(periodoPorExtenso('2026-10-17', '2026-10-17')).toBe('sáb 17 de outubro')
    expect(periodoPorExtenso('2026-10-30', '2026-11-01')).toBe('sex 30 de outubro a dom 1 de novembro')
  })

  it('horas e instantes', () => {
    expect(horaCurta('09:00')).toBe('9h')
    expect(horaCurta('19:30')).toBe('19h30')
    expect(instanteCurto('2026-09-27T14:02:00.000Z', FUSO)).toBe('27/09 às 11:02')
  })

  it('nomes', () => {
    expect(juntarNomes(['Amigo'])).toBe('Amigo')
    expect(juntarNomes(['Amigo', 'Companheiro'])).toBe('Amigo e Companheiro')
    expect(juntarNomes(['A', 'B', 'C'])).toBe('A, B e C')
  })

  it('último acesso: nunca, hoje, ontem e data', () => {
    const agora = new Date('2026-09-30T15:00:00.000Z')
    expect(textoDoUltimoAcesso(null, agora, FUSO)).toBe('nunca acessou')
    expect(textoDoUltimoAcesso('2026-09-30T11:00:00.000Z', agora, FUSO)).toBe('último acesso hoje')
    expect(textoDoUltimoAcesso('2026-09-29T20:00:00.000Z', agora, FUSO)).toBe('último acesso ontem')
    expect(textoDoUltimoAcesso('2026-09-12T20:00:00.000Z', agora, FUSO)).toBe('último acesso em 12/09/2026')
  })
})
```

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/ui/fichas.test.tsx src/modulos/adm/navegacao.test.tsx src/modulos/adm/formatos.test.ts
```

- [ ] **Passo 3: componentes.** O trecho não óbvio é o layout responsivo sem nada preso:

```tsx
// ui/CabecalhoDaPagina.tsx
export function CabecalhoDaPagina({ voltar, sobretitulo, titulo, apoio, acoes }: Propriedades) {
  return (
    <header className="flex flex-col gap-3">
      <Link
        to={voltar.para}
        state={voltar.estado}
        aria-label={`Voltar para ${voltar.rotulo}`}
        className="inline-flex min-h-[var(--touch-min)] w-fit items-center gap-2 text-base font-semibold text-marca focus-visible:outline-2 focus-visible:outline-marca"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {voltar.rotulo}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {sobretitulo && <p className="text-sm font-semibold text-texto-2">{sobretitulo}</p>}
          <h1 className="font-titulo text-2xl font-extrabold break-words text-texto">{titulo}</h1>
          {apoio && <div className="flex flex-wrap items-center gap-2 text-base text-texto-2">{apoio}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{acoes}</div>}
      </div>
    </header>
  )
}

// ui/ListaDePares.tsx
export function ListaDePares({ pares, colunas = 2 }: { pares: Par[]; colunas?: 2 | 3 }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', colunas === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>
      {pares.map((par) => (
        <div key={par.rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-sm text-texto-2">{par.rotulo}</dt>
          <dd className="text-base font-semibold break-words text-texto">{par.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

// ui/RodapeDoFormulario.tsx — DOM: Salvar antes de Cancelar (em cima no celular);
// no computador, row-reverse põe Salvar na ponta direita e Cancelar à esquerda dele.
export function RodapeDoFormulario({ cancelar, rotuloSalvar = 'Salvar', salvando }: Propriedades) {
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-divisor pt-5 sm:flex-row-reverse sm:items-center">
      <Botao type="submit" carregando={salvando} className="w-full sm:w-auto">
        {rotuloSalvar}
      </Botao>
      <Link to={cancelar.para} state={cancelar.estado} className={cn(estiloDoBotao({ variante: 'texto' }), 'w-full sm:w-auto')}>
        Cancelar
      </Link>
    </div>
  )
}

// ui/EstadoNaoEncontrado.tsx
export const ehNaoEncontrado = (erro: unknown): boolean => erro instanceof ErroDaApi && (erro.status === 404 || erro.status === 400)

export function EstadoNaoEncontrado({ registro, lista }: Propriedades) {
  return (
    <EstadoVazio
      titulo={`Não encontramos ${registro}`}
      descricao="Ele pode ter sido removido, ser de outro clube ou o endereço estar incompleto."
      acao={<Link to={lista.para} className={estiloDoBotao({ variante: 'secundario' })}>{lista.rotulo}</Link>}
    />
  )
}
```

`modulos/adm/navegacao.ts`:

```ts
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** O que a navegação leva para uma ficha do Adm: para onde o Voltar leva e os avisos da última gravação. */
export interface EstadoDaFicha {
  voltarPara?: string
  avisos?: string[]
}

function lerEstado(estado: unknown): EstadoDaFicha {
  if (typeof estado !== 'object' || estado === null) return {}
  const voltarPara =
    'voltarPara' in estado && typeof estado.voltarPara === 'string' && estado.voltarPara.startsWith('/adm') ? estado.voltarPara : undefined
  const avisos =
    'avisos' in estado && Array.isArray(estado.avisos) ? estado.avisos.filter((a): a is string => typeof a === 'string') : undefined
  return { voltarPara, avisos }
}

export function useEstadoDeVolta(): EstadoDaFicha {
  const local = useLocation()
  return { voltarPara: `${local.pathname}${local.search}` }
}

export function useVoltarPara(padrao: string): string {
  return lerEstado(useLocation().state).voltarPara ?? padrao
}

export function useAvisosDaFicha(): { avisos: string[]; dispensar: () => void } {
  const local = useLocation()
  const navegar = useNavigate()
  const { voltarPara, avisos = [] } = lerEstado(local.state)
  const dispensar = () => void navegar({ pathname: local.pathname, search: local.search }, { replace: true, state: { voltarPara } })
  return { avisos, dispensar }
}

export function useFiltrosNaUrl() {
  const [parametros, definir] = useSearchParams()
  const ler = (chave: string): string => parametros.get(chave) ?? ''
  const mudar = (mudancas: Record<string, string>) =>
    definir(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (valor) novos.set(chave, valor)
          else novos.delete(chave)
        }
        return novos
      },
      { replace: true },
    )
  return { ler, mudar }
}
```

`modulos/adm/formatos.ts` — implementar as funções da interface. `textoDoUltimoAcesso` compara
`hojeNoFuso(fuso, new Date(instante))` (de `@desbravadores/shared`) com `hojeNoFuso(fuso, agora)` e
com o dia de `agora - 24h`; `instanteCurto` usa `Intl.DateTimeFormat('pt-BR', { timeZone, day, month, hour, minute, hourCycle: 'h23' }).formatToParts`
(como `DetalheReuniao.tsx:23-27`). Dias e meses: `['Domingo', …]`, `['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']`,
`['janeiro', …]`; dia da semana por `new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()` (data civil, sem fuso).

- [ ] **Passo 4: verde e tipos.** Mesmo comando do Passo 2; depois `pesado -- npm run tipos -w web`.
- [ ] **Passo 5: commit (principal):** `feat(web): cabeçalho, pares, rodapé e "não encontramos" canônicos; navegação e formatos das fichas`.

---

## P3 — Desbravador · subagente, onda 2

**Files:**
- Modify: `apps/web/src/api/desbravadores.ts:44-147` (`useDesbravador`, `chavesDesbravadores.um`, invalidações)
- Modify: `apps/web/src/modulos/adm/desbravadores/ListaDesbravadores.tsx:39-245` (filtros na URL, nome vira link, sai a coluna Ações, sai o painel)
- Create: `apps/web/src/modulos/adm/desbravadores/FichaDesbravador.tsx`
- Create: `apps/web/src/modulos/adm/desbravadores/EditarDesbravador.tsx`
- Modify: `apps/web/src/modulos/adm/desbravadores/FormularioDesbravador.tsx:34-38, 205-217, 254-373` (três blocos, rodapé, `aoConcluir({ id, avisos })`)
- Modify: `apps/web/src/modulos/adm/desbravadores/AcessoAoApp.tsx:22-82` (`podeConvidar`, texto do botão)
- Delete: `apps/web/src/modulos/adm/desbravadores/FormularioInativar.tsx` (vira janela na ficha)
- Modify: `apps/web/src/modulos/adm/desbravadores/rotas.tsx`
- Modify: `apps/web/src/modulos/perfil/rotas.tsx` (Adm em `/dbv/:id` → ficha)
- Modify: `apps/web/src/modulos/adm/desbravadores/desbravadores.test.tsx` (abrir pela rota, não pelo painel)
- Modify: `apps/web/src/modulos/adm/desbravadores/acesso-ao-app.test.tsx:21-33` (abrir pela ficha)
- Create: `apps/web/src/modulos/adm/desbravadores/ficha.test.tsx`
- Modify: `apps/web/src/modulos/perfil/perfil.test.tsx` (redirecionamento do Adm)

**Interfaces:**
- Consome (P2): `CabecalhoDaPagina`, `ListaDePares`, `RodapeDoFormulario`, `EstadoNaoEncontrado`,
  `ehNaoEncontrado`, `useEstadoDeVolta`, `useVoltarPara`, `useAvisosDaFicha`, `useFiltrosNaUrl`,
  `dataCivilBr`. (P0): `handlerDesbravador`, `handlerPerfilDe`, `caixa`.
- Produz: rotas `/adm/desbravadores/:id`, `/adm/desbravadores/:id/editar`, `/adm/desbravadores/novo`;
  `useDesbravador(id: string, habilitada?: boolean)` com chave `['desbravadores', id]`;
  `FormularioDesbravador` props `{ desbravador?: Desbravador; cancelar: { para: string; estado?: object }; aoConcluir: (r: { id: string; avisos: Aviso[] }) => void }`;
  `AcessoAoApp` props `{ dbvId; nome; sexo; podeConvidar: boolean }`.
  Parâmetros da lista no endereço: `busca`, `unidade` (`sem` = sem unidade), `classe`, `situacao`
  (`false` | `todos`; ausente = ativos), `tipo`, `pagina`.

- [ ] **Passo 1: escrever todos os testes do pacote.**

`ficha.test.tsx` (novo):

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Desbravador } from '../../../api/desbravadores'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { handlersConviteAcesso } from '../../../testes/handlers/convite-acesso'
import { criarDesbravador, handlerCriarDesbravador, handlerDesbravador, handlerDesbravadores, handlerEditarDesbravador, handlerInativarDesbravador } from '../../../testes/handlers/desbravadores'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlerPerfilDe } from '../../../testes/handlers/perfil'
import { handlerProgressoDbv } from '../../../testes/handlers/progresso'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmDesbravadores } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', corToken: '--classe-amigo' })
const refAmigo = { id: amigo.id, nome: 'Amigo', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-amigo' }

const novaAna = (parcial: Partial<Desbravador> = {}) =>
  caixa(
    criarDesbravador({
      id: uuid(310),
      nome: 'Ana Beatriz Souza',
      nomePublico: 'Ana B.',
      nascimento: '2016-01-15',
      idade: 10,
      entradaEm: '2026-02-02',
      unidade: { id: aguias.id, nome: 'Águias' },
      classeAtual: refAmigo,
      autorizacaoImagem: true,
      autorizacaoImagemEm: '2026-02-02',
      contato: { responsavelNome: 'Márcia Souza', responsavelTelefone: '(11) 98888-0000', responsavelEmail: 'marcia@exemplo.com' },
      ...parcial,
    }),
  )

function abrir(rota: string, dbv = novaAna(), ...outros: Caixa<Desbravador>[]) {
  servidor.use(
    handlerDesbravadores([dbv.atual]),
    handlerDesbravador(dbv, ...outros),
    handlerPerfilDe([dbv, ...outros], { posicaoMes: 3, pontosMes: 86, frequenciaMes: 88 }),
    handlerProgressoDbv(),
    ...handlersConviteAcesso(),
    handlerUnidades([aguias]),
    handlerClasses([amigo]),
  )
  return { ...renderizarRotas(rotasAdmDesbravadores, rota), dbv }
}

const valorDe = (regiao: ReturnType<typeof within>, rotulo: string) => regiao.getByText(rotulo, { selector: 'dt' }).nextElementSibling

describe('ficha do desbravador', () => {
  it('a lista abre a ficha pelo nome e o Voltar devolve filtros e página', async () => {
    const { roteador } = abrir('/adm/desbravadores?busca=Ana&situacao=todos')
    await userEvent.click(await screen.findByRole('link', { name: 'Ana Beatriz Souza' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Desbravadores' }))
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores')
    expect(roteador.state.location.search).toBe('?busca=Ana&situacao=todos')
    expect(await screen.findByLabelText('Buscar por nome')).toHaveValue('Ana')
  })

  it('mostra cadastro, os três números do mês, progresso e responsável com uso de imagem', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`)
    expect(await screen.findByText('Desbravador · Ativo')).toBeInTheDocument()
    expect(screen.getByText('10 anos · Águias')).toBeInTheDocument()
    const cadastro = within(screen.getByRole('region', { name: 'Cadastro' }))
    expect(valorDe(cadastro, 'Nome público')).toHaveTextContent('Ana B.')
    expect(valorDe(cadastro, 'Nascimento')).toHaveTextContent('15/01/2016')
    expect(valorDe(cadastro, 'Entrada no clube')).toHaveTextContent('02/02/2026')
    expect(valorDe(cadastro, 'Classe do ano')).toHaveTextContent('Amigo')
    const numeros = within(screen.getByRole('region', { name: 'Números do mês' }))
    expect(await numeros.findByText('67%')).toBeInTheDocument()
    expect(numeros.getByText('Progresso em Amigo')).toBeInTheDocument()
    expect(numeros.getByText('86 pts')).toBeInTheDocument()
    expect(numeros.getByText('3º no ranking do mês')).toBeInTheDocument()
    expect(numeros.getByText('88%')).toBeInTheDocument()
    expect(numeros.getByText('Frequência no mês')).toBeInTheDocument()
    const responsavel = within(screen.getByRole('region', { name: 'Responsável' }))
    expect(valorDe(responsavel, 'Nome')).toHaveTextContent('Márcia Souza')
    expect(valorDe(responsavel, 'Uso de imagem')).toHaveTextContent('Autorizado em 02/02/2026')
    expect(screen.getByRole('button', { name: 'Inativar desbravador' })).toBeInTheDocument()
  })

  it('sem contato na resposta, não há bloco Responsável', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna({ contato: undefined }))
    await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })
    expect(screen.queryByRole('region', { name: 'Responsável' })).not.toBeInTheDocument()
  })

  it.each([
    ['Diretoria', { tipo: 'DIRETORIA' as const, unidade: null }],
    ['inativo', { ativo: false, saidaEm: '2026-08-01' }],
  ])('%s: sem os três números', async (_caso, parcial) => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna(parcial))
    await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Souza' })
    expect(screen.queryByRole('region', { name: 'Números do mês' })).not.toBeInTheDocument()
  })

  it('inativo: Reativar no rodapé e sem "Gerar link de acesso"', async () => {
    abrir(`/adm/desbravadores/${uuid(310)}`, novaAna({ ativo: false, saidaEm: '2026-08-01' }))
    expect(await screen.findByRole('button', { name: 'Reativar desbravador' })).toBeInTheDocument()
    const acesso = within(await screen.findByRole('region', { name: 'Acesso ao app' }))
    await acesso.findByText(/não tem acesso ao app/)
    expect(acesso.queryByRole('button', { name: 'Gerar link de acesso' })).not.toBeInTheDocument()
  })

  it('inativar abre a janela com a data de saída e envia', async () => {
    const corpos: unknown[] = []
    servidor.use(handlerInativarDesbravador((corpo) => corpos.push(corpo)))
    abrir(`/adm/desbravadores/${uuid(310)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Inativar desbravador' }))
    const janela = within(screen.getByRole('dialog', { name: 'Inativar Ana Beatriz Souza?' }))
    expect(janela.getByLabelText('Data de saída')).toBeInTheDocument()
    await userEvent.click(janela.getByRole('button', { name: 'Inativar' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
  })

  it('Editar → Salvar volta à ficha com o dado novo e os avisos da gravação no topo', async () => {
    const dbv = novaAna()
    const editada = { ...dbv.atual, nome: 'Ana Beatriz Lima' }
    servidor.use(handlerEditarDesbravador(editada, [{ codigo: 'AVISO', mensagem: 'Sai da unidade e da chamada.' }], () => { dbv.atual = editada }))
    const { roteador } = abrir(`/adm/desbravadores/${uuid(310)}`, dbv)
    await userEvent.click(await screen.findByRole('link', { name: 'Editar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}/editar`)
    const nome = await screen.findByLabelText('Nome completo')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Ana Beatriz Lima')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Beatriz Lima' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}`)
    expect(screen.getByText('Sai da unidade e da chamada.')).toBeInTheDocument()
  })

  it('Cancelar da edição volta à ficha sem gravar', async () => {
    const { roteador } = abrir(`/adm/desbravadores/${uuid(310)}/editar`)
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(310)}`)
  })

  it('Novo → Salvar leva à ficha do criado; Cancelar do novo volta à lista', async () => {
    const criada = caixa(criarDesbravador({ id: uuid(330), nome: 'Bia Nova' }))
    servidor.use(handlerCriarDesbravador(criada.atual))
    const { roteador } = abrir('/adm/desbravadores?pagina=1', novaAna(), criada)
    await userEvent.click(await screen.findByRole('link', { name: 'Novo desbravador' }))
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores/novo')
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Bia Nova')
    await userEvent.type(screen.getByLabelText('Nascimento'), '2015-03-10')
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'F')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Bia Nova' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${uuid(330)}`)
  })

  it.each([
    ['inexistente', `/adm/desbravadores/${uuid(399)}`],
    ['id malformado', '/adm/desbravadores/abc'],
    ['edição de inexistente', `/adm/desbravadores/${uuid(399)}/editar`],
  ])('%s: "Não encontramos este desbravador" com link para a lista', async (_caso, rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este desbravador' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a lista de desbravadores' })).toHaveAttribute('href', '/adm/desbravadores')
  })
})
```

`desbravadores.test.tsx`: trocar os helpers que abriam o painel por rota, e `within(dialog)` por `screen`:

```tsx
// substitui o clique em "Novo desbravador" / "Editar <nome>" + painel
async function abrirNovo(...handlers: RequestHandler[]) {
  servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]), handlerUsuarios(criarListaUsuarios()), handlerConfiguracao(criarConfiguracao()), ...handlers)
  const tela = renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores/novo')
  await screen.findByRole('heading', { level: 1, name: 'Novo desbravador' })
  return tela
}

async function abrirEdicao(dbv: Desbravador, ...handlers: RequestHandler[]) {
  servidor.use(handlerDesbravador(caixa(dbv)), handlerUnidades([aguias]), handlerClasses([amigo]), handlerUsuarios(criarListaUsuarios()), handlerConfiguracao(criarConfiguracao()), ...handlers)
  const tela = renderizarRotas(rotasAdmDesbravadores, `/adm/desbravadores/${dbv.id}/editar`)
  await screen.findByRole('heading', { level: 1, name: dbv.nome })
  return tela
}
```

e acrescentar à lista (A1 · lista):

```tsx
it('filtros e página moram no endereço: abrir com ?unidade=sem&pagina=2 pede isso à API', async () => {
  const urls: URL[] = []
  servidor.use(handlerDesbravadores(Array.from({ length: 30 }, (_, n) => criarDesbravador({ id: uuid(400 + n), nome: `Dbv ${n}` })), (url) => urls.push(url)))
  renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores?unidade=sem&pagina=2')
  await waitFor(() => expect(urls.at(-1)?.searchParams.get('pagina')).toBe('2'))
  expect(urls.at(-1)?.searchParams.get('semUnidade')).toBe('true')
  expect(screen.getByLabelText('Unidade')).toHaveValue('sem')
})

it('a lista não tem mais coluna de ações: inativar e reativar moram na ficha', async () => {
  servidor.use(handlerDesbravadores([criarDesbravador()]))
  renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
  await screen.findByRole('link', { name: 'Ana Clara Souza' })
  expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
})
```

Os testes "A1 · inativar e reativar" saem deste arquivo (cobertos em `ficha.test.tsx`); "erro da API
fica no painel, que continua aberto" passa a "…fica na tela, que continua aberta". Os da Diretoria
(`:375-587`) usam `abrirEdicao`/`abrirNovo`.

`acesso-ao-app.test.tsx:21-33`: `abrirAcesso` passa a abrir a ficha e o botão muda de texto:

```tsx
async function abrirAcesso(situacao?: SituacaoAcesso, registro = { gerados: [] as unknown[], cancelados: 0 }, dbv = paulo) {
  const registroDbv = caixa(dbv)
  servidor.use(handlerDesbravador(registroDbv), handlerPerfilDe([registroDbv]), handlerProgressoDbv(), handlerUnidades([aguias]), handlerClasses([amigo]), ...handlersConviteAcesso(situacao, registro))
  renderizarRotas(rotasAdmDesbravadores, `/adm/desbravadores/${dbv.id}`)
  const secao = within(await screen.findByRole('region', { name: 'Acesso ao app' }))
  return { secao, registro }
}
// e em todo o arquivo: 'Gerar convite de acesso' → 'Gerar link de acesso'
```

`perfil.test.tsx`, novo teste:

```tsx
it('o Adm em /dbv/:id vai para a ficha do desbravador no painel', async () => {
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerPerfil(), handlerProgressoDbv())
  const { roteador } = renderizarRotas([...rotasPerfil, { path: '/adm/desbravadores/:id', element: <p>ficha do adm</p> }], `/dbv/${ID}`)
  expect(await screen.findByText('ficha do adm')).toBeInTheDocument()
  expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${ID}`)
})
```

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/desbravadores src/modulos/perfil
```

- [ ] **Passo 3: hooks** (`api/desbravadores.ts`). Gravar escreve a resposta na chave do registro
  (a ficha abre já com o dado novo) e invalida listas, perfil, progresso e unidades:

```ts
export const chavesDesbravadores = {
  todos: ['desbravadores'] as const,
  lista: (filtro: FiltroDesbravadores) => ['desbravadores', 'lista', filtro] as const,
  um: (id: string) => ['desbravadores', id] as const,
}

export function useDesbravador(id: string, habilitada = true) {
  return useQuery({
    queryKey: chavesDesbravadores.um(id),
    queryFn: () => requisitar(`/api/desbravadores/${id}`, DesbravadorSaida),
    enabled: habilitada,
  })
}

/** Ficha (perfil e progresso), listas e contagem das unidades mudam com qualquer gravação de desbravador. */
function aposGravar(cliente: QueryClient, gravado?: Desbravador): Promise<unknown> {
  if (gravado) {
    cliente.setQueryData(chavesDesbravadores.um(gravado.id), gravado)
    cliente.setQueryData(chavesPerfil.dbv(gravado.id), (atual: PerfilDbv | undefined) => (atual ? { ...atual, dbv: gravado } : atual))
  }
  return Promise.all([
    cliente.invalidateQueries({ queryKey: chavesDesbravadores.todos }),
    cliente.invalidateQueries({ queryKey: [chavesPerfil.dbv('')[0]] }),
    cliente.invalidateQueries({ queryKey: chavesProgresso.dbv('').slice(0, 2) }),
    invalidarUnidades(cliente),
  ])
}
// criar/editar: onSuccess: (r) => aposGravar(cliente, r.dados); inativar/reativar/mover: (d) => aposGravar(cliente, d); matricular: () => aposGravar(cliente)
```

- [ ] **Passo 4: rotas e redirecionamento.**

```tsx
// modulos/adm/desbravadores/rotas.tsx
export const rotasAdmDesbravadores: RouteObject[] = [
  { path: '/adm/desbravadores', element: <ListaDesbravadores /> },
  { path: '/adm/desbravadores/importar', element: <ImportarDesbravadores /> },
  { path: '/adm/desbravadores/novo', element: <EditarDesbravador /> },
  { path: '/adm/desbravadores/:id', element: <FichaDesbravador /> },
  { path: '/adm/desbravadores/:id/editar', element: <EditarDesbravador /> },
]

// modulos/perfil/rotas.tsx
/** Conselheiro e instrutor veem o perfil; o Adm tem a ficha no painel (o Voltar dela leva à lista). */
function PerfilOuFichaDoAdm() {
  const { papel } = useSessao()
  const { id = '' } = useParams()
  return papel === 'ADM' ? <Navigate to={`/adm/desbravadores/${id}`} replace /> : <PerfilDbv />
}
export const rotasPerfil: RouteObject[] = [{ path: '/dbv/:id', element: <PerfilOuFichaDoAdm /> }]
```

- [ ] **Passo 5: lista.** `useFiltrosNaUrl` no lugar dos `useState` de `:40-45`; `filtrar` passa a
  `(chave) => (valor) => mudar({ [chave]: valor, pagina: '' })`; `situacao` "Ativos" grava `''`.
  Coluna Nome vira `<Link to={`/adm/desbravadores/${d.id}`} state={estadoDeVolta} className="font-semibold text-marca underline-offset-2 hover:underline">`;
  sai a coluna Ações, o `painel`, `avisos`, `erroAcao`, `FolhaLateral` e o reativar. "Novo
  desbravador" vira `<Link to="/adm/desbravadores/novo" state={estadoDeVolta} className={estiloDoBotao()}>`.
  O aviso de importação (`:143-147`) fica.

- [ ] **Passo 6: ficha** (`FichaDesbravador.tsx`), ordem do modelo (`modelo/Main.dc.html`):
  1. `CabecalhoDaPagina` — voltar `{ para: useVoltarPara('/adm/desbravadores'), rotulo: 'Desbravadores' }`;
     sobretítulo `${NOME_DO_TIPO[tipo]} · ${ativo ? 'Ativo' : 'Inativo'}` (Líder: "Líder");
     apoio `${idade} anos · ${unidade?.nome ?? 'Sem unidade'}` + `ChipClasse`; ação Link "Editar"
     (`estiloDoBotao()`) para `…/editar` com `state={{ voltarPara }}`.
  2. Avisos (`useAvisosDaFicha`): um `FaixaAviso` por aviso + Botao texto "Dispensar avisos".
  3. `<section aria-labelledby>` "Cadastro" (`Cartao`): `ListaDePares colunas={3}` — Nome público,
     Tipo, Nascimento, Sexo, Entrada no clube, Saída do clube (só inativo), Unidade (só DBV;
     senão "—"), Classe do ano, Avançada ("—" sem), Instrui / Aconselha (só se houver); abaixo,
     `<AcessoAoApp podeConvidar={dbv.ativo} />` (já tem divisória e região própria).
  4. `<section aria-label="Números do mês">` só se `tipo === 'DBV' && ativo`: três `Cartao` —
     `${percentual}%`/"Progresso em <classe>" (da regular de `useProgressoDbv`; sem matrícula
     "—"/"Sem classe neste ano"), `${pontosMes} pts`/`${posicaoMes}º no ranking do mês` (sem posição:
     "Fora do ranking do mês"), `${frequenciaMes}%`/"Frequência no mês" ("—" se null). Depois e
     **fora** dessa seção, `<SecaoProgresso dbvId />` (de `modulos/perfil/SecaoProgresso`), para
     todos (o anel dela também escreve a porcentagem; o teste procura a dos números dentro da região).
  5. "Responsável" só se `dbv.contato !== undefined`: Nome, Telefone, E-mail ("—" se null) e
     "Uso de imagem" (`Autorizado em <dataCivilBr>` | `Autorizado` | `Não autorizado`).
  6. Rodapé: ativo → Botao secundário "Inativar desbravador" abre `Confirmacao` (título
     `Inativar ${nome}?`, `rotuloConfirmar="Inativar"`, `perigo`; corpo: o texto de
     `FormularioInativar.tsx:32-34` + `Campo rotulo="Data de saída" type="date"` iniciado em
     `hojeDoClube()`); inativo → "Reativar desbravador" com `Confirmacao` ("Volta para a lista de
     ativos. Unidade e classe se escolhem na edição."). Erro da ação: `<p role="alert">` na ficha.
  Estados: `usePerfilDbv(id)` — pendente → `Carregando`; erro com `ehNaoEncontrado` →
  `EstadoNaoEncontrado registro="este desbravador" lista={{ para: '/adm/desbravadores', rotulo: 'Ver a lista de desbravadores' }}`;
  outro erro → `ErroDeCarga`; `SEM_CONEXAO` sem dado → `DisponivelComInternet`.

- [ ] **Passo 7: edição.** `EditarDesbravador.tsx` atende `/novo` (sem `:id`) e `/:id/editar`
  (carrega `useDesbravador(id)` com os mesmos estados da ficha). Cabeçalho: novo → voltar
  "Desbravadores" (`useVoltarPara`), título "Novo desbravador"; edição → voltar com o nome para a
  ficha, sobretítulo "Editar desbravador", título o nome. `aoConcluir`:
  `navegar(`/adm/desbravadores/${id}`, { state: { voltarPara, avisos: avisos.map((a) => a.mensagem) } })`.
  `cancelar`: ficha (edição) ou `voltarPara` (novo).
  `FormularioDesbravador`: os campos atuais em três `<Cartao><h2>` — **Quem é** (Tipo, Nome completo,
  Nome público, Nascimento, Sexo, Entrada no clube [novo], Conta de usuário [Líder]), **No clube**
  (LinhaConduz, Unidade, Classe do ano, avançada; o bloco some se nada aparece), **Responsável**
  (três campos quando `mostraResponsavel`, e "Autorizou o uso de imagem"); grade
  `grid gap-4 sm:grid-cols-2` dentro de cada bloco; no fim `RodapeDoFormulario` com
  `rotuloSalvar={editando ? 'Salvar alterações' : 'Salvar'}` e `salvando`. `criarNovo` passa a
  devolver `{ id: resposta.dados.id, avisos }`, `editarExistente` `{ id: atual.id, avisos }`. O
  salvamento parcial (`parcial`) continua na tela, acima do rodapé.
- [ ] **Passo 8: AcessoAoApp.** Prop `podeConvidar`; sem ela verdadeira, o ramo "sem conta e sem
  convite" mostra só o texto (sem botão) e o ramo de convite aberto não oferece "gerar outro".
  Texto do botão: "Gerar link de acesso" (modelo).
- [ ] **Passo 9: verde e tipos** (comando do Passo 2; `pesado -- npm run tipos -w web`).
- [ ] **Passo 10: commit (principal):** `feat(desbravadores): ficha do Adm, tela de edição e filtros da lista no endereço`.

---

## P4 — Usuário · subagente, onda 2

**Files:**
- Modify: `apps/web/src/api/usuarios.ts:23-44` (`chavesUsuarios.um`, `useUsuario`, escrita grava a resposta na chave)
- Modify: `apps/web/src/modulos/adm/usuarios/AdmUsuarios.tsx:98-216` (filtros no endereço, nome vira link, sai o painel)
- Create: `apps/web/src/modulos/adm/usuarios/FichaUsuario.tsx`
- Create: `apps/web/src/modulos/adm/usuarios/EditarUsuario.tsx`
- Delete: `apps/web/src/modulos/adm/usuarios/PainelUsuario.tsx` (o conteúdo vai para `EditarUsuario`)
- Modify: `apps/web/src/modulos/adm/usuarios/BlocoVinculo.tsx:91-131` (sai `BlocoSalvavel`)
- Modify: `apps/web/src/modulos/adm/usuarios/vinculos.ts` (`mesmoRascunho`, `corpoDaEdicao`, `oQuePodeFazer`, `escopoDoPapel`)
- Modify: `apps/web/src/modulos/adm/usuarios/rotas.tsx`
- Modify: `apps/web/src/modulos/adm/usuarios/usuarios.test.tsx`
- Create: `apps/web/src/modulos/adm/usuarios/ficha.test.tsx`

**Interfaces:**
- Consome: P2 inteiro; P0 `handlerUsuario`, `caixa`; `UsuarioSaida.ultimoAcessoEm`.
- Produz: rotas `/adm/usuarios/:id`, `/adm/usuarios/:id/editar` (com `?acrescentar=1` abre um bloco
  novo), `/adm/usuarios/novo`; `useUsuario(id, habilitada?)` com chave `['usuarios', id]`;
  parâmetros da lista `papel`, `busca`, `pagina`.

```ts
// vinculos.ts
export function mesmoRascunho(a: RascunhoVinculo, b: RascunhoVinculo): boolean
export function corpoDaEdicao(rascunho: RascunhoVinculo): EdicaoVinculo   // o objeto de PainelUsuario.tsx:386-390
export function oQuePodeFazer(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): string[]
export function escopoDoPapel(vinculo: VinculoUsuario): string  // "Unidade Águias" | "Classes Amigo e Companheiro" | "Todo o clube"
```

- [ ] **Passo 1: escrever todos os testes do pacote.** `ficha.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import type { Usuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerUnidades } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import {
  criarUsuario, criarVinculoUsuario, handlerCatalogoUsuarios, handlerConvite, handlerCriarUsuario, handlerDesativarUsuario,
  handlerEditarUsuario, handlerEditarVinculo, handlerListaUsuarios, handlerNovoVinculo, handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUsuarios } from './rotas'

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const carla = (parcial: Partial<Usuario> = {}) =>
  caixa(
    criarUsuario({
      id: uuid(710),
      nome: 'Carla Mendes',
      email: 'carla.mendes@antares.local',
      genero: 'F',
      ultimoAcessoEm: new Date().toISOString(),
      vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { unidades: [{ id: aguias.id, nome: 'Águias' }] })],
      ...parcial,
    }),
  )

function abrir(rota: string, usuario = carla(), ...outros: Caixa<Usuario>[]) {
  servidor.use(handlerUsuario(usuario, ...outros), handlerListaUsuarios([usuario.atual]), handlerCatalogoUsuarios(), handlerUnidades([aguias]))
  return { ...renderizarRotas(rotasAdmUsuarios, rota), usuario }
}

describe('ficha do usuário', () => {
  it('lista → ficha; Voltar devolve aba e busca', async () => {
    const { roteador } = abrir('/adm/usuarios?papel=CONSELHEIRO&busca=Carla')
    await userEvent.click(await screen.findByRole('link', { name: 'Carla Mendes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Carla Mendes' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Usuários' }))
    expect(roteador.state.location.search).toBe('?papel=CONSELHEIRO&busca=Carla')
    expect(await screen.findByRole('tab', { name: /Conselheiros/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('dados com último acesso; um cartão por papel ativo com escopo e "O que pode fazer" do catálogo', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`)
    expect(await screen.findByText('Ativa · último acesso hoje')).toBeInTheDocument()
    const papel = within(screen.getByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('Unidade Águias')).toBeInTheDocument()
    expect(papel.getByText('Ver desbravadores')).toBeInTheDocument()
    expect(papel.queryByText('Editar dados dos desbravadores')).not.toBeInTheDocument()
  })

  it('o ajuste do vínculo entra em "O que pode fazer"', async () => {
    const ajustada = carla({ vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.editar', concedida: true }] })] })
    abrir(`/adm/usuarios/${uuid(710)}`, ajustada)
    const papel = within(await screen.findByRole('region', { name: 'Conselheira' }))
    expect(papel.getByText('Editar dados dos desbravadores')).toBeInTheDocument()
  })

  it('convidado: Reenviar convite; ativo: Desativar neste clube com confirmação', async () => {
    const chamadas: string[] = []
    servidor.use(handlerConvite(chamadas))
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar convite' }))
    await waitFor(() => expect(chamadas).toEqual([uuid(710)]))
    expect(screen.getByRole('button', { name: 'Desativar neste clube' })).toBeInTheDocument()
  })

  it('desativar a si mesmo diz isso com todas as letras', async () => {
    const desativados: string[] = []
    const eu = carla({ id: uuid(500) })
    servidor.use(handlerDesativarUsuario({ ...eu.atual, situacao: 'INATIVO' }, desativados))
    abrir(`/adm/usuarios/${uuid(500)}`, eu)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    const janela = within(screen.getByRole('dialog', { name: 'Desativar o seu próprio acesso?' }))
    expect(janela.getByText(/Este é o seu usuário/)).toBeInTheDocument()
    await userEvent.click(janela.getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(desativados).toEqual([uuid(500)]))
  })

  it('inativo neste clube: situação Inativo, sem Desativar, com Acrescentar papel', async () => {
    abrir(`/adm/usuarios/${uuid(710)}`, carla({ situacao: 'INATIVO', vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ativo: false })] }))
    expect(await screen.findByText('Inativo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desativar neste clube' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acrescentar papel' })).toHaveAttribute('href', `/adm/usuarios/${uuid(710)}/editar?acrescentar=1`)
  })

  it('Editar → um Salvar grava os dados e o vínculo alterado e volta à ficha atualizada', async () => {
    const usuario = carla({ situacao: 'CONVIDADO', ultimoAcessoEm: null })
    const corposDados: unknown[] = []
    const corposVinculo: unknown[] = []
    const comNome = { ...usuario.atual, nome: 'Carla M. Souza' }
    servidor.use(
      handlerEditarUsuario(comNome, corposDados),
      handlerEditarVinculo({ ...comNome, vinculos: [criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.editar', concedida: true }] })] }, corposVinculo),
    )
    const { roteador } = abrir(`/adm/usuarios/${uuid(710)}/editar`, usuario)
    const nome = await screen.findByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Carla M. Souza')
    await userEvent.click(within(screen.getByRole('group', { name: 'Vínculo 1' })).getByLabelText('Editar dados dos desbravadores'))
    usuario.atual = comNome
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(710)}`))
    expect(corposDados).toEqual([{ nome: 'Carla M. Souza', genero: 'F' }])
    expect(corposVinculo).toHaveLength(1)
  })

  it('vínculo novo recusado: fica na tela com o erro no bloco; Salvar de novo tenta só ele', async () => {
    const usuario = carla()
    const novos: unknown[] = []
    let recusar = true
    servidor.use(
      http.post('/api/usuarios/:id/vinculos', async ({ request }) => {
        novos.push(await request.json())
        if (recusar) return HttpResponse.json({ codigo: 'REGRA', mensagem: 'Escolha ao menos uma classe.' }, { status: 422 })
        return HttpResponse.json({ ...usuario.atual, vinculos: [...usuario.atual.vinculos, criarVinculoUsuario('INSTRUTOR', 2)] }, { status: 201 })
      }),
    )
    abrir(`/adm/usuarios/${uuid(710)}/editar?acrescentar=1`, usuario)
    const bloco = within(await screen.findByRole('group', { name: 'Vínculo 2' }))
    await userEvent.selectOptions(bloco.getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await bloco.findByText('Escolha ao menos uma classe.')).toBeInTheDocument()
    recusar = false
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(novos).toHaveLength(2))
  })

  it('Novo → Salvar leva à ficha do convidado', async () => {
    const criado = caixa(criarUsuario({ id: uuid(720), nome: 'Rui Novo', email: 'rui@clube.test', situacao: 'CONVIDADO' }))
    servidor.use(handlerCriarUsuario(criado.atual))
    const { roteador } = abrir('/adm/usuarios/novo', carla(), criado)
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(screen.getByLabelText('Águias'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(720)}`))
  })

  it.each([`/adm/usuarios/${uuid(799)}`, '/adm/usuarios/abc'])('%s → "Não encontramos este usuário"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este usuário' })).toBeInTheDocument()
  })
})
```
`usuarios.test.tsx`: os testes que abriam a `FolhaLateral` passam a abrir `/adm/usuarios/novo` ou
`/adm/usuarios/:id/editar` (com `handlerUsuario(caixa(u))`), e os botões "Salvar dados" / "Salvar
vínculo" viram o "Salvar alterações" único. O teste de abas acrescenta: abrir em
`/adm/usuarios?papel=INSTRUTOR&pagina=2` pede `papel=INSTRUTOR&pagina=2` (via `consultas` do
`handlerListaUsuarios`).

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/usuarios
```

- [ ] **Passo 3: hooks** (`api/usuarios.ts`):

```ts
export const chavesUsuarios = {
  todas: ['usuarios'] as const,
  lista: (filtro: FiltroUsuarios) => ['usuarios', 'lista', filtro] as const,
  um: (id: string) => ['usuarios', id] as const,
}

export function useUsuario(id: string, habilitada = true) {
  return useQuery({ queryKey: chavesUsuarios.um(id), queryFn: () => requisitar(`/api/usuarios/${id}`, UsuarioSaida), enabled: habilitada })
}

/** Toda escrita refaz as listas; a que devolve o usuário já deixa a ficha dele com o dado novo. */
function useEscrita<V, R>(escrever: (variaveis: V) => Promise<R>, aoGravar?: (cliente: QueryClient, resposta: R) => void) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: escrever,
    onSuccess: (resposta) => {
      aoGravar?.(cliente, resposta)
      return cliente.invalidateQueries({ queryKey: chavesUsuarios.todas })
    },
  })
}

const naFicha = (cliente: QueryClient, usuario: Usuario) => cliente.setQueryData(chavesUsuarios.um(usuario.id), usuario)
// useCriarUsuario, useEditarUsuario, useDesativarUsuario, useAcrescentarVinculo, useEditarVinculo: passam `naFicha`;
// useReenviarConvite (204, sem corpo) não passa.
```
- [ ] **Passo 4: `EditarUsuario.tsx`.** Novo = o `PainelNovo` de hoje dentro de `<form>` com
  `RodapeDoFormulario` (sucesso → `navegar(`/adm/usuarios/${criado.id}`, { state: { voltarPara } })`).
  Existente — um Salvar que grava em sequência e para no primeiro erro, sem regravar o que já foi:

```tsx
function FormularioExistente({ usuario }: { usuario: Usuario }) {
  const [parametros] = useSearchParams()
  const voltarPara = useVoltarPara('/adm/usuarios')
  const navegar = useNavigate()
  const editar = useEditarUsuario()
  const editarVinculo = useEditarVinculo()
  const acrescentar = useAcrescentarVinculo()
  const convidado = usuario.situacao === 'CONVIDADO'
  const [atual, setAtual] = useState(usuario) // o que a API já tem; muda a cada gravação que deu certo
  const [nome, setNome] = useState(usuario.nome)
  const [genero, setGenero] = useState<Genero>(usuario.genero ?? '')
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoVinculo>>({})
  const [novos, setNovos] = useState<{ chave: number; rascunho: RascunhoVinculo }[]>(
    parametros.get('acrescentar') === '1' ? [{ chave: 1, rascunho: rascunhoVazio() }] : [],
  )
  const [proximaChave, setProximaChave] = useState(2)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const ativos = atual.vinculos.filter((v) => v.ativo)
  const rascunhoDe = (v: VinculoUsuario) => rascunhos[v.id] ?? rascunhoDoVinculo(v)

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setSalvando(true)
    let gravado = atual
    const passo = async (chave: string, acao: () => Promise<Usuario>) => {
      try {
        gravado = await acao()
      } catch (falha) {
        setErros({ [chave]: mensagemDeErro(falha) })
        throw falha
      }
    }
    try {
      if (convidado && (nome.trim() !== gravado.nome || paraGenero(genero) !== gravado.genero)) {
        await passo('dados', () => editar.mutateAsync({ id: usuario.id, corpo: { nome: nome.trim(), genero: paraGenero(genero) } }))
      }
      for (const vinculo of ativos) {
        if (mesmoRascunho(rascunhoDe(vinculo), rascunhoDoVinculo(vinculo))) continue
        await passo(vinculo.id, () => editarVinculo.mutateAsync({ vinculoId: vinculo.id, corpo: corpoDaEdicao(rascunhoDe(vinculo)) }))
      }
      for (const bloco of novos) {
        await passo(`novo-${bloco.chave}`, () => acrescentar.mutateAsync({ usuarioId: usuario.id, corpo: entradaDoVinculo(bloco.rascunho) }))
        setNovos((atuais) => atuais.filter((b) => b.chave !== bloco.chave))
      }
      void navegar(`/adm/usuarios/${usuario.id}`, { state: { voltarPara } })
    } catch {
      // O erro já está no bloco que falhou; o que gravou antes dele fica gravado.
    } finally {
      setAtual(gravado)
      setSalvando(false)
    }
  }
  // render: Nome e Gênero (desligados fora de CONVIDADO, com ajuda "Só quem ainda não aceitou o
  // convite tem nome e gênero alterados pelo Adm."), E-mail só leitura, um BlocoVinculo por ativo
  // (papelTravado, erro={erros[v.id]}), um por novo (acao "Remover papel"), "+ Acrescentar papel",
  // erros['dados'] em <p role="alert">, RodapeDoFormulario cancelar para a ficha, "Salvar alterações".
}
```

- [ ] **Passo 5: ficha** (`FichaUsuario.tsx`, `modelo/FichaUsuario.dc.html`): cabeçalho (voltar
  "Usuários", sobretítulo `Usuário · <situação>`, ação Editar); `<section>` "Dados" com
  `ListaDePares colunas={3}`: E-mail, Gênero (Feminino | Masculino | Não informado), Situação
  (CONVIDADO → "Convite enviado"; INATIVO → "Inativo"; ATIVO → `${genero === 'F' ? 'Ativa' : 'Ativo'} · ${textoDoUltimoAcesso(ultimoAcessoEm, new Date(), FUSO_PADRAO_DO_CLUBE)}`);
  um `<section aria-labelledby>` por vínculo **ativo**, com h2 do papel no gênero (F: Conselheira,
  Instrutora; senão Conselheiro, Instrutor; ADM: Adm), selo "Ativo", pares "Escopo"
  (`escopoDoPapel`) e "O que pode fazer" (`<ul>` de `oQuePodeFazer`; ADM: "Todas as permissões do
  clube"). Rodapé: "Reenviar convite" (só CONVIDADO, mensagem `role="status"` "Convite reenviado.");
  "Desativar neste clube" (se há vínculo ativo) com `Confirmacao` — para si mesmo
  (`useSessao().eu?.usuario.id === usuario.id`): título "Desativar o seu próprio acesso?", corpo
  "Este é o seu usuário. Ao desativar, você perde o acesso a este clube na hora."; para os outros:
  título `Desativar ${nome} neste clube?`, corpo "A pessoa perde o acesso a este clube na hora.";
  sem vínculo ativo: Link "Acrescentar papel" → `…/editar?acrescentar=1`. Estados como na ficha
  do P3, `registro="este usuário"`, lista `{ para: '/adm/usuarios', rotulo: 'Ver a lista de usuários' }`.
- [ ] **Passo 6: lista.** `useFiltrosNaUrl`: `papel` (validado com `Papel.safeParse`), `busca`
  (campo local iniciado do endereço; a espera de 300 ms grava `busca` e apaga `pagina`), `pagina`.
  Nome vira Link para a ficha com `state={estadoDeVolta}`; "Convidar usuário" vira Link para
  `/adm/usuarios/novo`. Sai a `FolhaLateral`.
- [ ] **Passo 7: rotas** (`/adm/usuarios`, `/adm/usuarios/novo`, `/adm/usuarios/:id`,
  `/adm/usuarios/:id/editar`); apagar `PainelUsuario.tsx` e `BlocoSalvavel`.
- [ ] **Passo 8: verde e tipos.** **Passo 9: commit (principal):** `feat(usuarios): ficha do Adm com último acesso e edição com um Salvar só`.

---

## P5 — Unidade e Visão geral · subagente, onda 3

**Files:**
- Modify: `apps/web/src/api/unidades.ts:12-33` (`useUnidade`, gravação escreve na chave)
- Modify: `apps/web/src/modulos/adm/unidades/ListaUnidades.tsx:23-97` (cartão leva à ficha; sai painel e membros)
- Create: `apps/web/src/modulos/adm/unidades/FichaUnidade.tsx`
- Create: `apps/web/src/modulos/adm/unidades/EditarUnidade.tsx`
- Modify: `apps/web/src/modulos/adm/unidades/FormularioUnidade.tsx:14-79` (rodapé; `aoConcluir(unidade)`)
- Delete: `apps/web/src/modulos/adm/unidades/PainelMembros.tsx`
- Create: `apps/web/src/modulos/adm/unidades/AdicionarSemUnidade.tsx`
- Create: `apps/web/src/modulos/adm/unidades/ReunioesDoMes.tsx`
- Modify: `apps/web/src/modulos/adm/unidades/rotas.tsx`
- Modify: `apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:125` (`to={`/adm/unidades/${unidade.id}`}`)
- Modify: `apps/web/src/modulos/adm/visao-geral/visao-geral.test.tsx`
- Modify: `apps/web/src/modulos/adm/unidades/unidades.test.tsx`
- Create: `apps/web/src/modulos/adm/unidades/ficha.test.tsx`

**Interfaces:**
- Consome: P2; P0 `handlerUnidade`, `caixa`; `useMembrosUnidade`, `useSemMembros` (`api/leitura.ts:66,74`),
  `useMoverUnidade` (`api/desbravadores.ts`), `useReunioes` (`api/reunioes.ts:33`), `somarMeses`/`nomeDoMes`
  (`modulos/reunioes/historico/datas.ts`), `dataPorExtenso` (P2).
- Produz: rotas `/adm/unidades/:id` (parâmetro `mes=AAAA-MM`), `/adm/unidades/:id/editar`,
  `/adm/unidades/nova`; `useUnidade(id, habilitada?)` com chave `['unidades', id]`; links
  `/adm/reunioes/:id` (P7 cria a rota).

- [ ] **Passo 1: escrever todos os testes do pacote.** `ficha.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Membro, Unidade } from '../../../api/leitura'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { handlerMoverUnidade } from '../../../testes/handlers/desbravadores'
import { criarMembro, criarUnidade, handlerMembrosUnidade, handlerSemMembros, handlerUnidades } from '../../../testes/handlers/leitura'
import { criarResumo, handlerReunioes } from '../../../testes/handlers/reunioes'
import { uuid } from '../../../testes/handlers/sessao'
import { handlerCriarUnidade, handlerEditarUnidade, handlerUnidade } from '../../../testes/handlers/unidades'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUnidades } from './rotas'

const aguias = (parcial: Partial<Unidade> = {}) =>
  caixa(criarUnidade({ id: uuid(201), nome: 'Águias', tipo: 'FEMININA', gritoDeGuerra: 'Voando alto!', conselheiros: [{ usuarioId: uuid(501), nome: 'Carla Mendes' }], totalMembros: 2, ...parcial }))
const ana = criarMembro({ dbvId: uuid(301), nome: 'Ana Beatriz Souza', idade: 10, frequencia: 90 })
const julia = criarMembro({ dbvId: uuid(302), nome: 'Júlia Rocha', idade: 11, frequencia: 70 })
const bruno = criarMembro({ dbvId: uuid(303), nome: 'Bruno Lima', sexo: 'M' })

interface Cenario {
  unidade?: Caixa<Unidade>
  outras?: Caixa<Unidade>[]
  membros?: Membro[]
  sem?: Membro[]
  reunioes?: Record<string, ReturnType<typeof criarResumo>[]>
}

function abrir(rota: string, { unidade = aguias(), outras = [], membros = [ana, julia], sem = [bruno], reunioes = {} }: Cenario = {}) {
  const consultas: { unidadeId: string; mes: string }[] = []
  servidor.use(
    handlerUnidade(unidade, ...outras),
    handlerUnidades([unidade.atual]),
    handlerMembrosUnidade(membros),
    handlerSemMembros(sem),
    handlerReunioes(reunioes, consultas),
  )
  return { ...renderizarRotas(rotasAdmUnidades, rota), consultas, unidade }
}

describe('ficha da unidade', () => {
  it('lista → ficha pelo cartão; mostra tipo, situação, grito, conselheiros e membros', async () => {
    abrir('/adm/unidades')
    await userEvent.click(await screen.findByRole('link', { name: 'Águias' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Águias' })).toBeInTheDocument()
    expect(screen.getByText('Unidade feminina · Ativa')).toBeInTheDocument()
    expect(screen.getByText('“Voando alto!”')).toBeInTheDocument()
    expect(screen.getByText('Membros', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2 desbravadoras')
    const membros = within(screen.getByRole('region', { name: 'Membros' }))
    expect(membros.getByRole('link', { name: /Ana Beatriz Souza/ })).toHaveAttribute('href', `/adm/desbravadores/${uuid(301)}`)
    expect(membros.getByText('90%')).toBeInTheDocument()
  })

  it('adicionar desbravador sem unidade é uma janela de um campo', async () => {
    const recebidos: { id: string; unidadeId: string | null }[] = []
    servidor.use(handlerMoverUnidade((id, corpo) => recebidos.push({ id, unidadeId: corpo.unidadeId })))
    abrir(`/adm/unidades/${uuid(201)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar desbravador sem unidade' }))
    const janela = within(screen.getByRole('dialog', { name: 'Adicionar a Águias' }))
    await userEvent.selectOptions(janela.getByLabelText('Desbravador sem unidade'), uuid(303))
    await userEvent.click(janela.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(recebidos).toEqual([{ id: uuid(303), unidadeId: uuid(201) }]))
  })

  it('sem membros e sem ninguém disponível: vazio que ensina, com link para cadastrar', async () => {
    abrir(`/adm/unidades/${uuid(201)}`, { unidade: aguias({ totalMembros: 0 }), membros: [], sem: [] })
    expect(await screen.findByText('Nenhum desbravador nesta unidade')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar desbravador' })).toHaveAttribute('href', '/adm/desbravadores/novo')
  })

  it('reuniões do mês com ‹ ›, mês no endereço e link para a ficha da reunião', async () => {
    const domingo = criarResumo({ id: uuid(601), data: '2026-09-27', presentes: 7, total: 8, atrasos: 1 })
    const { roteador, consultas } = abrir(`/adm/unidades/${uuid(201)}?mes=2026-09`, { reunioes: { '2026-09': [domingo] } })
    const secao = within(await screen.findByRole('region', { name: 'Reuniões de setembro de 2026' }))
    expect(secao.getByRole('link', { name: /Domingo, 27 de setembro/ })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}`)
    expect(secao.getByText(/7 de 8 presentes · 1 atraso/)).toBeInTheDocument()
    await userEvent.click(secao.getByRole('button', { name: 'Mês anterior' }))
    expect(roteador.state.location.search).toBe('?mes=2026-08')
    expect(await screen.findByText('Nenhuma reunião em agosto de 2026')).toBeInTheDocument()
    expect(consultas.map((c) => c.mes)).toContain('2026-08')
  })

  it('Editar → Salvar volta à ficha com o nome novo', async () => {
    const unidade = aguias()
    const editada = { ...unidade.atual, nome: 'Águias Douradas' }
    servidor.use(handlerEditarUnidade(editada, () => { unidade.atual = editada }))
    const { roteador } = abrir(`/adm/unidades/${uuid(201)}/editar`, { unidade })
    const nome = await screen.findByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Águias Douradas')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Águias Douradas' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
  })

  it('Nova → Salvar leva à ficha da criada', async () => {
    const criada = caixa(criarUnidade({ id: uuid(209), nome: 'Leões' }))
    servidor.use(handlerCriarUnidade(criada.atual))
    const { roteador } = abrir('/adm/unidades/nova', { outras: [criada] })
    await userEvent.type(await screen.findByLabelText('Nome'), 'Leões')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(209)}`))
  })

  it.each([`/adm/unidades/${uuid(299)}`, '/adm/unidades/abc'])('%s → "Não encontramos esta unidade"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos esta unidade' })).toBeInTheDocument()
  })
})
```

`visao-geral.test.tsx`: o cartão da unidade leva a `/adm/unidades/<id>`
(`expect(screen.getByRole('link', { name: '<nome>' })).toHaveAttribute('href', `/adm/unidades/${id}`)`).
`unidades.test.tsx`: os testes de painel e de `PainelMembros` (mover, desfazer) saem — mover passa a
ser pela edição do desbravador e "adicionar" pela ficha; os de cartões ficam e ganham "o cartão é
link para a ficha"; "Nova unidade" vira link para `/adm/unidades/nova`.

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/unidades src/modulos/adm/visao-geral
```

- [ ] **Passo 3: hooks** (`api/unidades.ts`):

```ts
export const chaveUnidade = (id: string) => [chavesLeitura.semMembros[0], id] as const // ['unidades', id]

export function useUnidade(id: string, habilitada = true) {
  return useQuery({ queryKey: chaveUnidade(id), queryFn: () => requisitar(`/api/unidades/${id}`, UnidadeSaida), enabled: habilitada })
}
// criar/editar: onSuccess: (unidade) => { cliente.setQueryData(chaveUnidade(unidade.id), unidade); return invalidarUnidades(cliente) }
```

- [ ] **Passo 4: ficha** (`modelo/FichaUnidade.dc.html`): cabeçalho (voltar "Unidades"; sobretítulo
  `Unidade ${rotuloDoTipo(tipo).toLowerCase()} · ${ativa ? 'Ativa' : 'Inativa'}`; apoio o grito
  entre aspas curvas; ação Editar); `Cartao` com `ListaDePares colunas={3}`: Conselheiros
  (`juntarNomes` ou "Sem conselheiro"), Membros (`${n} ${FEMININA ? 'desbravadora(s)' : 'desbravador(es)'}`),
  Situação; `<section>` "Membros": cada membro um `Link` para a ficha do desbravador com
  `state={estadoDeVolta}` (nome; `${classe ?? 'Sem classe'} · ${idade} anos`; `frequencia%` à
  direita); botão "Adicionar desbravador sem unidade" quando a unidade está ativa e
  `useSemMembros` traz alguém, senão Link "Cadastrar desbravador"; vazio
  `EstadoVazio titulo="Nenhum desbravador nesta unidade"` com o mesmo botão/link como `acao`;
  `<ReunioesDoMes unidadeId />`. Estados com `registro="esta unidade"` e lista
  `{ para: '/adm/unidades', rotulo: 'Ver as unidades' }`.
- [ ] **Passo 5: `AdicionarSemUnidade.tsx`** — `Confirmacao` título `Adicionar a ${unidade.nome}`,
  `rotuloConfirmar="Adicionar"`, corpo `Selecao rotulo="Desbravador sem unidade"` (opções de
  `useSemMembros`, primeira "Escolha"); confirmar sem escolha mostra "Escolha um desbravador.";
  sucesso fecha (o `useMoverUnidade` já invalida unidades e membros); erro em `<p role="alert">`
  dentro da janela.
- [ ] **Passo 6: `ReunioesDoMes.tsx`** — `mes` = `ler('mes')` válido por `MesCivil.safeParse`, senão
  `hojeDoClube().slice(0, 7)`; `<section aria-labelledby>` com h2 `Reuniões de ${nomeDoMes(mes).toLowerCase()}`
  e botões ‹ › (`aria-label` "Mês anterior"/"Próximo mês", `mudar({ mes: somarMeses(mes, ±1) })`);
  cada reunião um `Link` para `/adm/reunioes/${r.id}` com `dataPorExtenso(r.data)` e
  `${presentes} de ${total} presentes` + ` · N atraso(s)` se houver + ` · N falta(s)` se
  `total - presentes > 0`; vazio `Nenhuma reunião em ${nomeDoMes(mes).toLowerCase()}` (sem convite a criar).
- [ ] **Passo 7: edição** (`EditarUnidade.tsx` + `FormularioUnidade` com `RodapeDoFormulario`,
  props `{ unidade?: Unidade; cancelar: { para: string; estado?: object }; aoConcluir: (u: Unidade) => void }`),
  lista (cartão inteiro dentro de um `Link` com o nome como nome acessível; "Nova unidade" vira
  Link), rotas, Visão geral.
- [ ] **Passo 8: verde e tipos.** **Passo 9: commit (principal):** `feat(unidades): ficha com membros e reuniões do mês, tela de edição; Visão geral leva à ficha`.

---

## P6 — Evento e calendário · subagente, onda 3

**Files:**
- Modify: `apps/web/src/api/calendario.ts:12-49` (`chavesCalendario.evento`, `useEvento`, gravação escreve na chave)
- Modify: `apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:39-246, 262-321` (mês no endereço; evento vira link; sai painel e exclusão)
- Create: `apps/web/src/modulos/adm/calendario/FichaEvento.tsx`
- Create: `apps/web/src/modulos/adm/calendario/EditarEvento.tsx`
- Modify: `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:15-130` (rodapé, sem `aoExcluir`)
- Modify: `apps/web/src/modulos/adm/calendario/datas.ts` (`mesDoEndereco`)
- Modify: `apps/web/src/modulos/adm/calendario/rotas.tsx`
- Modify: `apps/web/src/modulos/adm/calendario/calendario.test.tsx`
- Create: `apps/web/src/modulos/adm/calendario/ficha.test.tsx`

**Interfaces:**
- Consome: P2; P0 `handlerEvento`, `caixa`.
- Produz: rotas `/adm/calendario?mes=AAAA-MM`, `/adm/calendario/eventos/:id`,
  `/adm/calendario/eventos/:id/editar`, `/adm/calendario/eventos/novo?data=AAAA-MM-DD`;
  `useEvento(id, habilitada?)` com chave `['calendario', 'evento', id]`;
  `textoDasAulasAfetadas(aulas: AulaAfetada[]): string` (exportado de `EditarEvento.tsx`, texto do modelo).

- [ ] **Passo 1: escrever todos os testes do pacote.** `ficha.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { EventoCalendario } from '../../../api/calendario'
import { caixa } from '../../../testes/handlers/caixa'
import type { Caixa } from '../../../testes/handlers/caixa'
import { criarAulaAfetada, criarEvento, handlerCalendario, handlerCriarEvento, handlerEditarEvento, handlerEvento, handlerExcluirEvento } from '../../../testes/handlers/calendario'
import { criarConfiguracao, handlerConfiguracao } from '../../../testes/handlers/clube'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmCalendario } from './rotas'

const acampamento = () =>
  caixa(criarEvento(1, { nome: 'Acampamento de primavera', tipo: 'ACAMPAMENTO', inicio: '2026-10-16', fim: '2026-10-18', horario: '07:00', local: 'Sítio Recanto Verde', cancelaReuniao: true, bloqueiaAula: true, bomParaCampo: true }))

function abrir(rota: string, evento = acampamento(), ...outros: Caixa<EventoCalendario>[]) {
  servidor.use(handlerEvento(evento, ...outros), handlerCalendario({ eventos: [evento.atual] }), handlerConfiguracao(criarConfiguracao()))
  return { ...renderizarRotas(rotasAdmCalendario, rota), evento }
}

describe('ficha do evento', () => {
  it('calendário → ficha; Voltar devolve o mês', async () => {
    const { roteador } = abrir('/adm/calendario?mes=2026-10')
    const lista = within(await screen.findByRole('list', { name: 'Eventos de Outubro' }))
    await userEvent.click(lista.getByRole('link', { name: /Acampamento de primavera/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Acampamento de primavera' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Calendário do clube' }))
    expect(roteador.state.location.search).toBe('?mes=2026-10')
    expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
  })

  it('mostra datas, horário, local e o que muda no calendário', async () => {
    abrir(`/adm/calendario/eventos/${uuid(801)}`)
    expect(await screen.findByText('sex 16 a dom 18 de outubro')).toBeInTheDocument()
    expect(screen.getByText('7h')).toBeInTheDocument()
    expect(screen.getByText('Sítio Recanto Verde')).toBeInTheDocument()
    const muda = within(screen.getByRole('region', { name: 'O que muda no calendário' }))
    expect(muda.getByText('Cancela a reunião', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Sim')
  })

  it('Editar → Salvar volta à ficha com o aviso das aulas afetadas no topo', async () => {
    const evento = acampamento()
    servidor.use(handlerEditarEvento([criarAulaAfetada(1, { data: '2026-10-17' }), criarAulaAfetada(2, { classe: { id: uuid(102), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: 'companheiro' }, data: '2026-10-18' })]))
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}/editar`, evento)
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/calendario/eventos/${uuid(801)}`))
    expect(await screen.findByText('2 aulas estavam marcadas nessas datas: Amigo (17/10) e Companheiro (18/10). Os instrutores foram avisados.')).toBeInTheDocument()
  })

  it('Novo pelo calendário chega com a data do mês mostrado e leva à ficha do criado', async () => {
    const criado = caixa(criarEvento(99, { id: uuid(899), nome: 'Feriado municipal', inicio: '2026-10-01', fim: '2026-10-01' }))
    servidor.use(handlerCriarEvento([]))
    const { roteador } = abrir('/adm/calendario?mes=2026-10', acampamento(), criado)
    await userEvent.click(await screen.findByRole('link', { name: 'Novo evento' }))
    expect(roteador.state.location.search).toBe('?data=2026-10-01')
    expect(await screen.findByLabelText('Início')).toHaveValue('2026-10-01')
    await userEvent.type(screen.getByLabelText('Nome'), 'Feriado municipal')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/calendario/eventos/${uuid(899)}`))
  })

  it('Excluir pede confirmação e volta ao mês do evento', async () => {
    const excluidos: string[] = []
    servidor.use(handlerExcluirEvento((id) => excluidos.push(id)))
    const { roteador } = abrir(`/adm/calendario/eventos/${uuid(801)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Excluir Acampamento de primavera?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(roteador.state.location.search).toBe('?mes=2026-10'))
    expect(excluidos).toEqual([uuid(801)])
  })

  it.each([`/adm/calendario/eventos/${uuid(898)}`, '/adm/calendario/eventos/abc'])('%s → "Não encontramos este evento"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este evento' })).toBeInTheDocument()
  })
})
```

`calendario.test.tsx`: abrir com `?mes=` em vez de navegar com setas quando o teste depende do mês;
os testes de painel (criar, editar, excluir, aviso de aulas) migram para `ficha.test.tsx`
(acima) ou abrem `/adm/calendario/eventos/novo?data=…`; o texto do aviso passa ao do modelo.
Acrescentar: "as setas e as abas de mês gravam `?mes=` no endereço".

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/calendario
```

- [ ] **Passo 3: hooks.** `chavesCalendario.evento = (id) => ['calendario', 'evento', id] as const`;
  `useEvento(id, habilitada = true)` com `EventoSaida`; criar/editar: `onSuccess: (gravado) => { cliente.setQueryData(chavesCalendario.evento(gravado.evento.id), gravado.evento); return cliente.invalidateQueries({ queryKey: chavesCalendario.todas }) }`.
- [ ] **Passo 4: calendário.** `mesDoEndereco(valor: string, hoje: string): { ano: number; mes: number }`
  em `datas.ts` (`MesCivil` válido ou o mês de `hoje`); `andarMeses` e as abas gravam
  `mudar({ mes: 'AAAA-MM' })`; o botão das células e o cartão da lista viram `Link` para a ficha com
  `state={estadoDeVolta}` (cartão: nome do evento como nome do link; sai "Editar"); "Novo evento"
  vira `Link` para `/adm/calendario/eventos/novo?data=${chaveDoDia(ano, mes, 1)}` com
  `state={estadoDeVolta}`; saem `FolhaLateral`, `Confirmacao`, `aulasAfetadas`, `erroDeExclusao`.
- [ ] **Passo 5: ficha** (`modelo/FichaEvento.dc.html`): cabeçalho (voltar "Calendário do clube" →
  `useVoltarPara(`/adm/calendario?mes=${inicio.slice(0, 7)}`)`; sobretítulo `ROTULOS_DO_TIPO[tipo]`;
  ações Botao secundário "Excluir" + Link primário "Editar"); avisos (`useAvisosDaFicha`) no topo em
  `FaixaAviso` sob o título "Aulas afetadas"; `Cartao` com `ListaDePares`: Datas
  (`periodoPorExtenso`), Horário (`horaCurta` ou "—"), Local ("—"); `<section>` "O que muda no
  calendário": "Cancela a reunião", "Bloqueia aulas nessas datas", "Bom para requisitos de campo"
  → "Sim"/"Não". Excluir: `Confirmacao` (`Excluir ${nome}?`, "O evento sai do calendário do clube.",
  `perigo`) → `navegar(`/adm/calendario?mes=${inicio.slice(0, 7)}`, { replace: true })`. Estados com
  `registro="este evento"`, lista `{ para: '/adm/calendario', rotulo: 'Ver o calendário' }`.
- [ ] **Passo 6: edição.** `EditarEvento.tsx`: novo lê `?data=` (`DataCivil.safeParse`, senão
  `hojeDoClube()`); `aoGravar(gravado)` →
  `navegar(`/adm/calendario/eventos/${gravado.evento.id}`, { state: { voltarPara, avisos: gravado.aulasAfetadas.length > 0 ? [textoDasAulasAfetadas(gravado.aulasAfetadas)] : [] } })`;

```ts
/** "2 aulas estavam marcadas nessas datas: Amigo (17/10) e Companheiro (18/10). Os instrutores foram avisados." */
export function textoDasAulasAfetadas(aulas: AulaAfetada[]): string {
  const lista = juntarNomes(aulas.map((aula) => `${aula.classe.nome} (${diaEMes(aula.data)})`))
  const inicio = aulas.length === 1 ? '1 aula estava marcada' : `${aulas.length} aulas estavam marcadas`
  return `${inicio} nessas datas: ${lista}. Os instrutores foram avisados.`
}
```

  `FormularioEvento`: sai `aoExcluir`; `aoCancelar` vira `cancelar: { para; estado? }` no
  `RodapeDoFormulario` (`rotuloSalvar` "Salvar alterações" na edição, "Salvar" no novo); campos em
  `grid gap-4 sm:grid-cols-2`.
- [ ] **Passo 7: rotas; verde e tipos.** **Passo 8: commit (principal):** `feat(calendario): ficha do evento, tela de edição e mês no endereço`.

---

## P7 — Reunião do Adm e corrigir chamada · subagente, onda 4

**Files:**
- Modify: `apps/web/src/api/reunioes.ts:55-103` (bloco novo `useCorrigirChamada`)
- Create: `apps/web/src/modulos/reunioes/detalhe/PartesDaReuniao.tsx`
- Modify: `apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx:20-176` (passa a compor as partes; sem mudança visível)
- Modify: `apps/web/src/modulos/reunioes/chamada/FormularioChamada.tsx:17-18, 84-210` (tipo da unidade estreitado; `envioDireto`)
- Create: `apps/web/src/modulos/adm/reunioes/FichaReuniao.tsx`
- Create: `apps/web/src/modulos/adm/reunioes/CorrigirChamada.tsx`
- Modify: `apps/web/src/modulos/adm/reunioes/rotas.tsx`
- Create: `apps/web/src/modulos/adm/reunioes/reunioes-adm.test.tsx`
- Modify (se preciso): `apps/web/src/modulos/reunioes/detalhe/detalhe.test.tsx` — os testes atuais têm de passar sem mudança de expectativa; mexer só em import.

**Interfaces:**
- Consome: P2; P0 `handlerReuniaoDe`, `criarSaidaEnvio`, `handlerCorrigirChamada`, `caixa`;
  `criarDetalheReuniao` (`testes/handlers/chamada.ts:9`); `baseDoDetalhe` (`chamada/estado.ts:56`);
  `usePacote` (o Adm baixa o pacote com clube e critérios, `ProvedorSessao.tsx:76`, `sync.service.ts:36-62`).
- Produz: rotas `/adm/reunioes/:id` e `/adm/reunioes/:id/chamada`;

```ts
// api/reunioes.ts
export function useCorrigirChamada(): UseMutationResult<z.infer<typeof ReuniaoEnvioSaida>, Error, EntradaSalvarChamada>

// chamada/FormularioChamada.tsx
export interface UnidadeDaChamada { id: string; nome: string; membros: { dbvId: string; nome: string }[] }
export interface EnvioDireto {
  enviar: (entrada: EntradaSalvarChamada) => void
  enviando: boolean
  /** Depois de salvo com avisos: Salvar desligado; o retorno fica na tela. */
  bloqueado: boolean
  /** Recusa, conflito e nomes descartados, mostrados acima do botão. */
  retorno: ReactNode
}
// Propriedades: unidade: UnidadeDaChamada (era UnidadeDoPacote — o pacote continua cabendo); envioDireto?: EnvioDireto

// detalhe/PartesDaReuniao.tsx
export interface LinksDaReuniao { album: ((albumId: string) => string) | null; enviarFotos: ((reuniaoId: string) => string) | null }
export function Indicadores(p: { dados: Detalhe; variante: 'conselheiro' | 'adm' }): JSX.Element
export function ListaDaChamada(p: { dados: Detalhe; mostrarLicao: boolean }): JSX.Element   // filtros Todos/Presentes/Ausentes + linhas
export function FotosDaReuniao(p: { dados: Detalhe; links: LinksDaReuniao }): JSX.Element | null
export function horaNoFuso(instante: string, fuso: string): string
export function diaDaSemana(data: string): string
```

- [ ] **Passo 1: escrever todos os testes do pacote.** `reunioes-adm.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import { caixa } from '../../../testes/handlers/caixa'
import { criarDetalheReuniao, criarSaidaEnvio, handlerCorrigirChamada, handlerReuniaoDe } from '../../../testes/handlers/chamada'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmReunioes } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))
beforeEach(() => {
  offline.modo = 'ONLINE'
})

const linha = (n: number, nome: string, situacao: 'PRESENTE' | 'ATRASADO' | 'FALTA', extra: { uniforme?: boolean; biblia?: boolean } = {}) => ({
  dbvId: uuid(300 + n), nome, nomePublico: nome.split(' ')[0] ?? nome, situacao, uniforme: extra.uniforme ?? false, biblia: extra.biblia ?? false,
  licao: false, versao: `2026-09-27T12:0${n}:00.000Z`, pontos: 0,
})

const reuniao = () =>
  caixa(
    criarDetalheReuniao({
      id: uuid(601),
      unidade: { id: uuid(201), nome: 'Águias' },
      data: '2026-09-27',
      horario: '09:00',
      local: 'Igreja Central',
      registradaPor: { nome: 'Carla Mendes' },
      alterada: { por: 'Carla Mendes', em: '2026-09-27T14:02:00.000Z', conflito: false },
      chamada: [linha(1, 'Ana Beatriz Souza', 'PRESENTE', { uniforme: true, biblia: true }), linha(2, 'Carla Fernandes', 'ATRASADO'), linha(3, 'Júlia Rocha', 'FALTA')],
      totais: { presentes: 2, total: 3, atrasos: 1, uniformes: 1, biblias: 1, pontos: 0 },
      album: { id: uuid(901), totalFotos: 3, miniaturas: [] },
    }),
  )

function abrir(rota: string, registro = reuniao(), ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerReuniaoDe(registro), ...extras)
  return { ...renderizarRotas([...rotasAdmReunioes, { path: '/adm/unidades/:id', element: <p>ficha da unidade</p> }], rota), registro }
}

describe('ficha da reunião (Adm)', () => {
  it('mostra cabeçalho, indicadores, chamada e alterações; Corrigir chamada; sem link de álbum', async () => {
    abrir(`/adm/reunioes/${uuid(601)}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Domingo, 27 de setembro' })).toBeInTheDocument()
    expect(screen.getByText('Reunião · Unidade Águias')).toBeInTheDocument()
    expect(screen.getByText('9h · Igreja Central · chamada feita por Carla Mendes')).toBeInTheDocument()
    expect(screen.getByText('Bíblias')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Chamada' })).getByText('Júlia Rocha')).toBeInTheDocument()
    expect(screen.getByText('Corrigida por Carla Mendes em 27/09 às 11:02.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Corrigir chamada' })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}/chamada`)
    expect(screen.queryByRole('link', { name: /Ver álbum/ })).not.toBeInTheDocument()
  })

  it('Voltar leva à ficha da unidade no mês da reunião', async () => {
    const { roteador } = abrir(`/adm/reunioes/${uuid(601)}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar para Águias' }))
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
    expect(roteador.state.location.search).toBe('?mes=2026-09')
  })

  it.each([`/adm/reunioes/${uuid(699)}`, '/adm/reunioes/abc'])('%s → "Não encontramos esta reunião"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos esta reunião' })).toBeInTheDocument()
  })
})

describe('corrigir chamada (Adm)', () => {
  it('a lista vem das linhas da reunião; envia direto só o que mudou e volta à ficha atualizada', async () => {
    const registro = reuniao()
    const recebidos: { uuid: string; corpo: unknown }[] = []
    const { roteador } = abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      registro,
      handlerCorrigirChamada((id) => {
        registro.atual = { ...registro.atual, alterada: { por: 'Ana Souza', em: '2026-09-28T13:00:00.000Z', conflito: false } }
        return criarSaidaEnvio(id)
      }, recebidos),
    )
    const lista = await screen.findAllByRole('listitem')
    expect(lista.map((li) => li.getAttribute('aria-label'))).toEqual(['Ana Beatriz Souza', 'Carla Fernandes', 'Júlia Rocha'])
    await userEvent.click(screen.getByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/reunioes/${uuid(601)}`))
    expect(recebidos).toHaveLength(1)
    expect(recebidos[0]?.uuid).toBe(uuid(601))
    expect(recebidos[0]?.corpo).toMatchObject({
      versaoPayload: 1,
      unidadeId: uuid(201),
      data: '2026-09-27',
      cabecalho: null,
      linhas: [{ dbvId: uuid(303), situacao: 'PRESENTE', versaoVista: '2026-09-27T12:03:00.000Z' }],
    })
    expect(await screen.findByText(/Corrigida por Ana Souza/)).toBeInTheDocument()
  })

  it('conflito e descartados aparecem na própria tela; Salvar fica desligado', async () => {
    abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      reuniao(),
      handlerCorrigirChamada((id) => criarSaidaEnvio(id, { conflitos: [{ dbvId: uuid(303), nome: 'Júlia Rocha' }], ignorados: [{ dbvId: uuid(302), nome: 'Carla Fernandes' }] })),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    expect(await screen.findByText(/a sua versão valeu e a anterior ficou registrada: Júlia Rocha/)).toBeInTheDocument()
    expect(screen.getByText('Carla Fernandes não eram da unidade nessa data e ficaram fora.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Ver a reunião' })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}`)
  })

  it('recusa da API fica na tela', async () => {
    abrir(`/adm/reunioes/${uuid(601)}/chamada`, reuniao(), handlerCorrigirChamada((id) => criarSaidaEnvio(id), [], { status: 422, codigo: 'REGRA', mensagem: 'Reunião de unidade inativa.' }))
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    expect(await screen.findByText('Reunião de unidade inativa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeEnabled()
  })

  it('sem internet, diz que precisa de internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir(`/adm/reunioes/${uuid(601)}/chamada`)
    expect(await screen.findByRole('heading', { name: 'Corrigir a chamada precisa de internet' })).toBeInTheDocument()
  })
})
```

- [ ] **Passo 2: ver o vermelho.**

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste -w web -- --maxWorkers=2 src/modulos/adm/reunioes src/modulos/reunioes
```
(`src/modulos/reunioes` entra para provar que a tela do conselheiro não mudou: `detalhe.test.tsx`,
`chamada.test.tsx`, `historico.test.tsx` devem continuar verdes depois.)

- [ ] **Passo 3: hook** (`api/reunioes.ts`, bloco próprio "Correção do Adm"):

```ts
/** Raízes que a fila invalida depois de enviar uma reunião (`offline/tipos/reuniao.ts:14`), mais a ficha do desbravador. */
const RAIZES_DA_CORRECAO = ['reunioes', 'reuniao', 'grade', 'inicio', 'ranking', 'perfil'] as const

/** O Adm corrige com internet: o mesmo PUT da fila, sem passar por ela. */
export function useCorrigirChamada() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: EntradaSalvarChamada) =>
      requisitar(`/api/sync/reunioes/${entrada.reuniaoId}`, ReuniaoEnvioSaida, {
        metodo: 'PUT',
        corpo: ReuniaoEnvio.parse({
          versaoPayload: 1,
          envioId: crypto.randomUUID(),
          unidadeId: entrada.unidadeId,
          data: entrada.data,
          feitaNoAparelhoEm: new Date().toISOString(),
          cabecalho: entrada.cabecalho,
          linhas: entrada.linhas,
        }),
      }),
    onSuccess: () => Promise.all(RAIZES_DA_CORRECAO.map((raiz) => cliente.invalidateQueries({ queryKey: [raiz] }))),
  })
}
```

- [ ] **Passo 4: `FormularioChamada` em modo de envio direto.** Mudanças, todas condicionadas a
  `envioDireto` (sem ele, a tela do conselheiro fica idêntica):
  - `Propriedades.unidade: UnidadeDaChamada`; `UnidadeDoPacote` continua exportado para quem já usa.
  - No `useEffect` da carga: `Promise.all([props.envioDireto ? [] : itensDaChave(chave), props.envioDireto || !usuarioId ? null : lerRascunho(usuarioId, chave)])`.
  - `mudar`: só grava rascunho sem `envioDireto`.
  - `aoSalvar`: `if (!entrada) return; if (envioDireto) envioDireto.enviar(entrada); else salvar.mutate(entrada)`.
  - `podeSalvar`: `!(envioDireto?.enviando ?? salvar.isPending) && !envioDireto?.bloqueado && horarioValido && (…igual)`.
  - Com `envioDireto`: não renderiza o `<header>` interno (h1 "Registro de reunião" e "Lista
    atualizada") nem as faixas de `SEM_CONEXAO`; renderiza `envioDireto.retorno` logo acima do
    botão; `carregando` do botão vem de `envioDireto.enviando`.
- [ ] **Passo 5: `PartesDaReuniao.tsx`** — mover de `DetalheReuniao.tsx` `horaNoFuso`, `diaDaSemana`,
  `Marca`, `LinhaDbv`, `Indicador`, o filtro e a lista (`:80-146`) e a seção de fotos (`:155-172`).
  `Indicadores` variante `conselheiro` = presentes, atraso(s), uniforme, pontos (como hoje);
  `adm` = presentes, atraso(s), uniformes, Bíblias (modelo). `FotosDaReuniao` só desenha "Ver álbum"
  com `links.album` e o "+" com `links.enviarFotos`; sem nenhum dos dois, não desenha a seção.
  `DetalheReuniao` passa `links={{ album: (id) => `/galeria/${id}`, enviarFotos: (id) => `/galeria/enviar?reuniao=${id}` }}`
  e mantém o próprio cabeçalho com o Link "Editar" (`:114-119`).
- [ ] **Passo 6: `FichaReuniao.tsx`** (`modelo/FichaReuniao.dc.html`): `useReuniao(id)`; cabeçalho —
  voltar `{ para: `/adm/unidades/${unidade.id}?mes=${data.slice(0, 7)}`, rotulo: unidade.nome }`,
  sobretítulo `Reunião · Unidade ${unidade.nome}`, título `dataPorExtenso(data)`, apoio
  `[horaCurta(horario), local, `chamada feita por ${registradaPor.nome}`].filter(Boolean).join(' · ')`,
  ação Link primário "Corrigir chamada" (só com `podeEditar`) para `/adm/reunioes/${id}/chamada`;
  `<Indicadores variante="adm" />`; `<section>` "Chamada" com `<ListaDaChamada mostrarLicao />`
  (`mostrarLicao` do critério LICAO do pacote, como `DetalheReuniao.tsx:95-96`); "Observações" se
  houver; `<section>` "Alterações": `Corrigida por ${por} em ${instanteCurto(em, fuso)}.` ou
  "Nenhuma correção desde o registro."; com `conflito`, "Houve conflito entre aparelhos."; e o texto
  "O conselheiro corrige até o prazo de correção do clube; o Adm corrige a qualquer momento — por
  exemplo, quem chegou depois da chamada." Sem seção de fotos (o modelo não tem; a galeria é rota
  do conselheiro). Estados: `registro="esta reunião"`, lista `{ para: '/adm/unidades', rotulo: 'Ver as unidades' }`.
- [ ] **Passo 7: `CorrigirChamada.tsx`:**

```tsx
export function CorrigirChamada() {
  const { id = '' } = useParams()
  const { modo } = useConexao()
  const detalhe = useReuniao(id)
  const { pacote, carregando } = usePacote()
  const dados = detalhe.data
  const ficha = `/adm/reunioes/${id}`

  let corpo: ReactNode
  if (modo === 'SEM_CONEXAO') corpo = <EstadoVazio titulo="Corrigir a chamada precisa de internet" descricao="Conecte-se e abra de novo. Nada foi alterado." />
  else if (detalhe.isPending || carregando) corpo = <EsqueletoChamada />
  else if (detalhe.isError)
    corpo = ehNaoEncontrado(detalhe.error)
      ? <EstadoNaoEncontrado registro="esta reunião" lista={{ para: '/adm/unidades', rotulo: 'Ver as unidades' }} />
      : <ErroDeCarga erro={detalhe.error} aoTentarDeNovo={() => void detalhe.refetch()} />
  else if (!pacote) corpo = <EstadoVazio titulo="A configuração do clube ainda não chegou" descricao="Aguarde um instante e abra de novo." />
  else corpo = <CorrecaoDoAdm detalhe={detalhe.data} pacote={pacote} ficha={ficha} />

  return (
    <main className="flex flex-col gap-5 p-4">
      <CabecalhoDaPagina
        voltar={{ para: ficha, rotulo: 'Reunião' }}
        sobretitulo={dados ? `Unidade ${dados.unidade.nome} · ${dataPorExtenso(dados.data)}` : undefined}
        titulo="Corrigir chamada"
      />
      {corpo}
    </main>
  )
}

type Retorno = { tipo: 'RECUSA'; mensagem: string } | { tipo: 'SALVO_COM_AVISOS'; saida: SaidaDoEnvio }

function CorrecaoDoAdm({ detalhe, pacote, ficha }: { detalhe: Detalhe; pacote: Pacote; ficha: string }) {
  const navegar = useNavigate()
  const corrigir = useCorrigirChamada()
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  const unidade: UnidadeDaChamada = {
    id: detalhe.unidade.id,
    nome: detalhe.unidade.nome,
    membros: detalhe.chamada.map((linha) => ({ dbvId: linha.dbvId, nome: linha.nome })),
  }

  function enviar(entrada: EntradaSalvarChamada) {
    setRetorno(null)
    corrigir.mutate(entrada, {
      onSuccess: (saida) => {
        const semAvisos = !saida.conflitoCabecalho && saida.conflitos.length === 0 && saida.ignorados.length === 0
        if (semAvisos) void navegar(ficha, { replace: true })
        else setRetorno({ tipo: 'SALVO_COM_AVISOS', saida })
      },
      onError: (erro) => setRetorno({ tipo: 'RECUSA', mensagem: mensagemDaRecusa(erro) }),
    })
  }

  return (
    <FormularioChamada
      pacote={pacote}
      baixadoEm={null}
      unidade={unidade}
      data={detalhe.data}
      base={baseDoDetalhe(detalhe)}
      envioDireto={{
        enviar,
        enviando: corrigir.isPending,
        bloqueado: retorno?.tipo === 'SALVO_COM_AVISOS',
        retorno: retorno && <RetornoDaCorrecao retorno={retorno} ficha={ficha} />,
      }}
    />
  )
}
```

  `mensagemDaRecusa(erro)`: `ErroDaApi` de classe `REDE` → "Corrigir a chamada precisa de internet.
  Nada foi enviado."; outro `ErroDaApi` → `erro.erro.mensagem`; senão "Não foi possível salvar
  agora. Tente de novo." `RetornoDaCorrecao`: RECUSA → `<p role="alert">`; SALVO_COM_AVISOS →
  `FaixaAviso` com título "Chamada salva, com avisos" e as frases de `offline/tipos/reuniao.ts:43-52`
  (cabeçalho, `${n} linhas tinham sido alteradas por outra pessoa; a sua versão valeu e a anterior
  ficou registrada: <nomes>.`, `<nomes> não eram da unidade nessa data e ficaram fora.`), mais Link
  primário "Ver a reunião" para a ficha.
- [ ] **Passo 8: rotas** (`/adm/reunioes/:id` → `FichaReuniao`, `/adm/reunioes/:id/chamada` → `CorrigirChamada`).
- [ ] **Passo 9: verde e tipos.** **Passo 10: commit (principal):** `feat(reunioes): ficha da reunião no painel do Adm e correção da chamada com envio direto`.

---

## P8 — fase final · onda 5

**Files (implementador):**
- Modify: `e2e/fundacao.spec.ts:20-51` (criar unidade, desbravador e usuário pelas telas novas)
- Modify: `e2e/domingo.spec.ts:41-67` (idem)
- Modify: `e2e/adm.spec.ts:100-108` (evento pela tela de edição; aviso de aulas afetadas na ficha, texto do modelo)
- Create: `e2e/fichas.spec.ts` (fluxos do critério de pronto + medição)

- [ ] **Passo 1 (implementador): e2e.** Nos três arquivos, onde havia `getByRole('dialog')`, usar
  a tela: `await page.getByRole('link', { name: 'Nova unidade' }).click(); await page.getByLabel('Nome', { exact: true }).fill(nome); await page.getByRole('button', { name: 'Salvar' }).click(); await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()`
  (desbravador e usuário igual, com "Novo desbravador" e "Convidar usuário"). Em `adm.spec.ts`:
  `await expect(paginaAdm.getByText(`1 aula estava marcada nessas datas: Amigo (${diaMes(domingoDoConflito)}). Os instrutores foram avisados.`)).toBeVisible()`.
  `e2e/fichas.spec.ts`: para cada registro, lista → ficha → Editar → Salvar → ficha com o dado
  novo; Voltar devolve filtro e página; link direto para ficha e edição; id malformado → "Não
  encontramos"; o Adm corrige a chamada de uma reunião semeada (`e2e/apoio/semear.ts`) e volta à
  ficha. Medição, em cada ficha e cada tela de edição, nas larguras 390, 820 e 1280:

```ts
for (const largura of [390, 820, 1280]) {
  await page.setViewportSize({ width: largura, height: 900 })
  await page.goto(caminho)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const medida = await page.evaluate(() => ({
    rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    presos: [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length,
  }))
  expect(medida, `${caminho} em ${largura}px`).toEqual({ rolagemLateral: 0, presos: 0 })
}
```
  (No Adm não há nada fixo com a gaveta fechada — `LayoutAdm.tsx:152` só existe aberta.)

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pesado -- npm run teste:e2e -- e2e/fichas.spec.ts
```

- [ ] **Passo 2 (`testador`):** em sequência, um de cada vez, comparando com o baseline por nomes
  do P0: `pesado -- npm run lint`, `pesado -- npm run tipos`, `pesado -- npm run teste -w api`,
  `pesado -- npm run teste -w web -- --maxWorkers=2`, `pesado -- npm run teste:e2e`,
  `pesado -- npm run build`. Falhas → `saneador` com o dossiê, todas de uma vez.
- [ ] **Passo 3 (principal): revisão da PR inteira** (skill `code-review`, opus) contra a `main`, até
  nenhum achado Critical/Important (até 3 rodadas; Minor vira pendência).
- [ ] **Passo 4: QA** — `qa-roteiro` escreve o roteiro com **um item por bloco de cada artboard do
  modelo** (Main, FichaUsuario, FichaUnidade, FichaEvento, FichaReuniao, EditarDesbravador, e a
  FichaDesbravadorCelular conferida a 390 px na ficha do Adm), mais Novo/Cancelar/Voltar com filtro
  de cada registro e corrigir chamada (com e sem internet); `qa-runner` executa, headless.
- [ ] **Passo 5:** `documentador` com a branch e a base; `gestor-pr` sobe e, pelo ritual de
  `rules/pr-pronta.md`, tira a PR #22 do rascunho.

**Pronto:** lint, tipos, suítes da API e do web, e2e e build verdes contra o baseline; medição sem
rolagem lateral e sem `fixed`/`sticky` em 390/820/1280; revisão limpa; QA sem FALHOU.

---

## O que NÃO quebra (conferido no código em 40f0717)

| Medo | Por que não quebra |
|---|---|
| A chamada do conselheiro muda junto | Tudo em `FormularioChamada` é condicionado a `envioDireto`; `TelaChamada` não passa a prop. O tipo da unidade só estreita: `UnidadeDoPacote` tem `id`, `nome` e `membros[].dbvId/nome` (`sync.ts:8-16, 58`). `montarEntrada` e `comporEstado` já pedem só `{ dbvId }` (`estado.ts:90-96, 184-192`). |
| O detalhe da reunião do conselheiro muda | `DetalheReuniao` passa a compor `PartesDaReuniao` com os mesmos links de hoje (`:115, :159, :168`) e a variante `conselheiro` dos indicadores; `detalhe.test.tsx` roda sem mudar expectativa. |
| `/dbv/:id` para conselheiro e instrutor | O redirecionamento só vale para `papel === 'ADM'`; `perfil.test.tsx` usa CONSELHEIRO (`:27`). Ranking, progresso e início continuam apontando para `/dbv/:id` (`Ranking.tsx:34`, `TelaProgressoClasse.tsx:24`, `MinhaUnidade.tsx:87`, `InicioConselheiro.tsx:155`) e, para o Adm, caem na ficha. |
| Chaves novas escapam da invalidação | `['unidades', id]` está sob a raiz que `invalidarUnidades` invalida (`api/unidades.ts:12-15`); `['usuarios', id]` sob `['usuarios']` (`api/usuarios.ts:38-43`); `['calendario','evento',id]` sob `['calendario']` (`api/calendario.ts:12-15`); `['desbravadores', id]` sob `['desbravadores']`. |
| `totalMembros` mexe em outra tela | No front só `ListaUnidades.tsx:31,70` lê o campo; a Visão geral usa `totalDbvs` de outro contrato (`visao-geral.ts:17`). Na API, os testes de `unidades.spec.ts:51,53,119,140` usam `criarDbv` (DBV ativo por padrão, `fabricas.ts:155,160`) e continuam valendo. |
| `GET /unidades/:id` engole `sem-membros` | Declarada depois de `sem-membros` no controller; teste próprio no P1. No MSW, `handlerUnidade` devolve `undefined` para "sem-membros" e o pedido segue ao handler certo, qualquer que seja a ordem do `servidor.use`. |
| `/adm/desbravadores/importar` vira ficha | Segmento estático vence `:id` no React Router; a rota continua declarada antes. |
| Menu do Adm perde o destaque na ficha | `NavLink` sem `end` (`ItemNavegacao.tsx:48`; `LayoutAdm.tsx:17-21` só Visão geral é `exato`) marca "Desbravadores" em `/adm/desbravadores/:id`. A ficha da reunião não acende item (não há "Reuniões" no menu) — aceito. |
| Atividades antigas de evento | Só as novas ganham o link da ficha; as gravadas com `/adm/calendario` continuam abrindo o calendário. |
| Teste sem handler passa calado | `onUnhandledRequest: 'error'` (`testes/setup.ts:13`): rota nova sem handler falha alto; por isso os handlers saem no P0. |
| O pacote offline do Adm | Não muda: o Adm já recebe `clube` e `criterios` com `unidades: []` (`sync.service.ts:36-62`); a correção usa só clube e critérios dele. |
| Banco | Nenhuma migration; `Usuario.ultimoAcessoEm` já existe (`schema.prisma:243`) e já é gravado no login (`auth.service.ts:40,62`) e no aceite do convite (`convite-acesso-publico.service.ts:90,93`). |
| Fixture `criarUsuario` usada por outros testes | O campo novo entra com `null` na fixture (P0); `UsuarioSaida` só é montado em `testes/handlers/usuarios.ts` e `usuarios.test.tsx` no web. |

## Contrato de retorno do subagente

Cada `implementador` devolve, em até 15 linhas, sem diff e sem trecho de código:

1. pacote concluído (P1…P8) e se fechou inteiro;
2. arquivos tocados — caminhos, nunca conteúdo;
3. testes do pacote: quantos verdes e os nomes que falharam (e se o vermelho inicial foi visto);
4. decisões que tomou sozinho, uma linha cada (`DECISÃO / IMPASSE / ALTERNATIVA`);
5. pendências, uma linha cada.

O principal confere com `git diff --stat` e um `git diff <arquivo>` dirigido no ponto que o
relatório disse ter sido difícil, antes do commit. Briefing de cada pacote: worktree, branch,
commit-base, a seção do pacote neste plano, as linhas do ONDE FICA do assunto, "não rode git",
"~80 turnos", contrato acima.

## ONDE FICA

```
ONDE FICA
- rotas: bloco Adm / /dbv                   apps/web/src/rotas.tsx:82-99 ; :100-103
- rotas por módulo                          apps/web/src/modulos/adm/{desbravadores,usuarios,unidades,calendario}/rotas.tsx ; modulos/perfil/rotas.tsx:4 ; modulos/reunioes/rotas.tsx:7-12
- lista + painel desbravador                apps/web/src/modulos/adm/desbravadores/ListaDesbravadores.tsx:39-46, :88-118, :143-158, :220-243
- formulário desbravador                    apps/web/src/modulos/adm/desbravadores/FormularioDesbravador.tsx:34-38, :111-130, :170-217, :254-373
- acesso ao app / inativar                  apps/web/src/modulos/adm/desbravadores/AcessoAoApp.tsx:34-82 ; FormularioInativar.tsx:15-52
- hooks desbravador / perfil / progresso    apps/web/src/api/desbravadores.ts:44-147 ; api/perfil.ts:7-16 ; api/progresso.ts:10-13
- perfil do conselheiro e progresso         apps/web/src/modulos/perfil/PerfilDbv.tsx:83-116 ; SecaoProgresso.tsx:170-229
- lista + painel usuário                    apps/web/src/modulos/adm/usuarios/AdmUsuarios.tsx:98-216 ; PainelUsuario.tsx:33-225 ; BlocoVinculo.tsx:27-131 ; vinculos.ts:1-53
- hooks usuário                             apps/web/src/api/usuarios.ts:23-67
- lista + painel + membros unidade          apps/web/src/modulos/adm/unidades/ListaUnidades.tsx:23-97 ; FormularioUnidade.tsx:14-79 ; PainelMembros.tsx:40-115
- hooks unidade                             apps/web/src/api/leitura.ts:22-30, :64-79 ; apps/web/src/api/unidades.ts:10-33
- calendário + painel evento                apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:39-48, :50-92, :180-246 ; FormularioEvento.tsx:15-35 ; datas.ts:3-35 ; tipos.ts:5-10
- hooks calendário                          apps/web/src/api/calendario.ts:12-49
- visão geral (cartão de unidade)           apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:125
- detalhe da reunião (links fixos)          apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx:76-176 (editar :115, álbum :159, enviar fotos :168)
- chamada: pacote, fila, rascunho, volta    apps/web/src/modulos/reunioes/chamada/TelaChamada.tsx:25-44, :165-171 ; FormularioChamada.tsx:84-210 ; estado.ts:56-63, :99-117, :194-218
- mutação e chaves de reunião               apps/web/src/api/reunioes.ts:20-24, :33-46, :70-103
- invalidação e avisos da fila de reunião   apps/web/src/offline/tipos/reuniao.ts:14, :39-52, :70-75
- pacote offline (Adm recebe clube/critérios) apps/api/src/sync/sync.service.ts:36-62 ; packages/shared/src/contratos/sync.ts:8-16, :42-72 ; apps/web/src/sessao/ProvedorSessao.tsx:68-77
- API reunião (Adm edita, sem prazo)        apps/api/src/reunioes/reunioes.controller.ts:19-42 ; reunioes.service.ts:74-90, :133-134
- API usuários                              apps/api/src/usuarios/usuarios.controller.ts:18-67 ; usuarios.service.ts:51-69, :83-112, :115-137, :140-155, :242-249
- API unidades                              apps/api/src/unidades/unidades.controller.ts:11-59 ; unidades.service.ts:28-50, :84-110, :186-216
- API eventos                               apps/api/src/calendario/eventos.controller.ts:33-71 ; servico-eventos.ts:46-59, :77-128
- API perfil / convite de acesso            apps/api/src/desbravadores/perfil.service.ts:35-56 ; convite-acesso.service.ts:28-33 ; desbravadores.controller.ts:29-33
- contratos                                 packages/shared/src/contratos/{usuarios.ts:48-63, unidades.ts:15-23, perfil.ts:7-14, desbravadores.ts:55-79, calendario.ts:19-31, reunioes.ts:34-61, 83-102 (alterada :94)}
- permissões (catálogo)                     packages/shared/src/permissoes.ts:12-36
- coluna de último acesso                   apps/api/prisma/schema.prisma:243 ; gravada em apps/api/src/auth/auth.service.ts:40,62
- testes de isolamento (API)                apps/api/test/isolamento.ts:24-60 ; usuarios/usuarios.spec.ts:1-37 ; unidades/unidades.spec.ts:21-36, :150-200 ; calendario/eventos.spec.ts:40-70
- fábricas da API                           apps/api/test/fabricas.ts:83-139 (usuário, unidade, vínculo), :140-163 (dbv), :221-238 (membro), :410-429 (evento)
- handlers e setup de teste (web)           apps/web/src/testes/handlers/{usuarios.ts, unidades.ts, calendario.ts, desbravadores.ts:7-104, perfil.ts:8-44, chamada.ts:9-32, leitura.ts:23-87, reunioes.ts:10-85, progresso.ts:46-62, convite-acesso.ts:24-48, sessao.ts:10-49} ; apps/web/src/testes/setup.ts:13 ; renderizar.tsx:9-26
- testes de tela afetados                   modulos/adm/desbravadores/{desbravadores,acesso-ao-app}.test.tsx ; adm/usuarios/usuarios.test.tsx ; adm/unidades/unidades.test.tsx ; adm/calendario/calendario.test.tsx ; adm/visao-geral/visao-geral.test.tsx ; perfil/perfil.test.tsx ; reunioes/detalhe/detalhe.test.tsx ; reunioes/chamada/chamada.test.tsx ; rotas.test.tsx
- e2e afetados                              e2e/fundacao.spec.ts:20-51 ; e2e/domingo.spec.ts:41-67 ; e2e/adm.spec.ts:100-108
- layout do Adm (nada fixo fora da gaveta)  apps/web/src/layouts/LayoutAdm.tsx:16-24, :49-83, :152 ; ItemNavegacao.tsx:46-55
- conferido em                              40f0717 (antes do merge da main do P0: só FormularioChamada.tsx muda de linha — #21 tirou o sticky de :195)
```

## Cobertura da SPEC (autorrevisão)

| SPEC | Onde |
|---|---|
| Lista → ficha → Editar → tela; Cancelar/Salvar no fim; Novo | P3–P6 (Passos de ficha e edição); P2 `RodapeDoFormulario` |
| Lista volta como estava (filtros, busca, página, mês) | P2 `useFiltrosNaUrl`/`useEstadoDeVolta`/`useVoltarPara`; P3–P6 listas; P5 `?mes` das reuniões |
| Ações de 1 campo em janela, a partir da ficha | P3 inativar/reativar, P3 link de acesso (`AcessoAoApp`), P4 desativar, P6 excluir, P5 adicionar sem unidade |
| Endereço da ficha funciona sozinho | Todas as fichas leem por id; testes de rota direta em cada pacote; e2e no P8 |
| Avisos de gravação no topo da ficha | P2 `useAvisosDaFicha`; P3 (avisos do desbravador); P6 (aulas afetadas) |
| Endereços da tabela e `/dbv/:id` do Adm | P3–P7 rotas; P3 `PerfilOuFichaDoAdm` |
| Pontos de entrada (linhas, Visão geral, membros, atividade) | P3–P6 listas; P5 VisaoGeral e membros; P1 link da atividade |
| Cada ficha, na ordem do modelo, com as exceções | P3 (frequência no mês, sem números p/ Diretoria e inativo), P4, P5 (sem frequência no topo), P6 (aulas só como aviso), P7 (alterações sem antes→depois) |
| Corrigir chamada do Adm (lista da data, online, PUT direto, conflito na tela, volta à ficha) | P7 |
| Telas de edição (desbravador em 3 blocos, usuário com blocos, unidade, evento com `?data=`) | P3, P4, P5, P6 |
| API: três leituras, permissões, escopo, 404, `ultimoAcessoEm`, `totalMembros` | P0 contrato; P1 |
| Cache: chaves novas nas famílias; desbravador invalida perfil; correção invalida reuniões | P3, P4, P5, P6 Passo 3; P7 `RAIZES_DA_CORRECAO` |
| Handlers de teste (unidade depois de sem-membros) e setup | P0 |
| Descobribilidade: vazios, bloqueio, sem internet | P5 vazios; P2 `EstadoNaoEncontrado`; P7 sem internet |
| Componentes canônicos | P2 |
| Critério de pronto (testes, e2e, medição 390/820/1280, QA) | P1–P7 testes; P8 |

## Comando de execução

```
Aja como orquestrador (skill orquestrador) e execute o plano "Fichas do Adm e telas de edição dedicadas".

ONDE: continue na worktree existente /home/robertogabrieu/desbravadores/.claude/worktrees/fichas,
branch feature/fichas-e-edicao, PR #22 (rascunho). Não crie branch nem PR novos.

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/fichas-e-edicao/PLANO.md e
docs/fases/fichas-e-edicao/SPEC.md; o modelo em docs/fases/fichas-e-edicao/modelo/*.dc.html é o
alvo visual (estrutura e texto; nunca CSS). CLAUDE.md da raiz vale inteiro.

DECISÕES TRAVADAS (não reabrir):
- tudo o que está na SPEC; o modelo vence a SPEC, salvo as "Exceções ao modelo";
- aula da montagem fica fora (continua no painel lateral);
- o Adm corrige a chamada só com internet; a lista vem das linhas de GET /reunioes/:id; envio
  direto por PUT /sync/reunioes/{clienteUuid}, sem fila; recusa, conflito e descartados na
  própria tela; salvo sem avisos, volta à ficha da reunião;
- nenhum elemento fixed/sticky novo — o usuário prefere telas sem barra presa;
- as decisões do PLANO (estado de navegação para Voltar e avisos, um Salvar só na edição de
  usuário, PainelMembros sai, "Novo evento" leva ?data= do 1º dia do mês mostrado, textos do
  modelo para "Gerar link de acesso" e "Aulas afetadas", merge da main no P0);
- testes antes da implementação dentro de cada pacote (todos primeiro, vistos falhando; depois
  implementar); validação pesada só no P8;
- máquina fraca: uma suíte pesada por vez, sempre pelo `pesado`; Node 22
  (export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH); vitest com --maxWorkers=2.

FORA DE ESCOPO: barra de navegação inferior fixa do celular; aula da montagem; FolhaLateral com até
3 campos (aula, especialidade do clube, requisitos da data, materiais) e as confirmações; telas do
conselheiro e do instrutor (o conselheiro corrige a chamada como hoje).

EXECUÇÃO: ondas 0 a 5 do PLANO. P0 é seu, inline (arquivos de dono compartilhado), antes de
delegar. P1–P7 vão ao `implementador` (sonnet), no máximo dois em paralelo, cada briefing com a
seção do pacote e as linhas do ONDE FICA do assunto; nenhum subagente roda git; commit por pacote
pela skill `commit`; revisão com opus; push e saída do rascunho só pelo `gestor-pr` no fim.

GATE: "Pronto" do P8 — lint, tipos, suítes da API e do web, e2e e build verdes contra o baseline
por nomes; medição sem rolagem lateral e sem fixed/sticky em 390/820/1280; revisão da PR limpa;
QA sem FALHOU; PR #22 fora do rascunho.

RETORNO: relatório de fechamento da skill orquestrador, com as decisões tomadas fora do PLANO em
PENDÊNCIAS.
```
