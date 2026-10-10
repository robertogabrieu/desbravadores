# Biblioteca do clube — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** o clube ganha uma Biblioteca de PDFs com capa, organizada em categorias, que o Adm monta e
que Adm, conselheiros e instrutores leem no navegador ou baixam.

**Architecture:** dois modelos novos por clube (`CategoriaBiblioteca`, `ItemBiblioteca`) que
reaproveitam `Arquivo`, o armazenamento em disco e as URLs assinadas. Um módulo `biblioteca/` na API
(lista com `@Logado`, escrita com `@Pode('biblioteca.gerenciar')`, toda escrita sob a trava do
clube). A rota de arquivos ganha a variante `baixar`. No web, uma tela só (`TelaBiblioteca`) em
`/adm/biblioteca` e `/biblioteca`, mais o item de menu do Adm e os atalhos dos Inícios.

**Tech Stack:** NestJS 11 + Prisma 7 + PostgreSQL (API, Jest), React 19 + React Router 7 + TanStack
Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`, multer, sharp, Playwright (e2e, headless).

**Spec:** [SPEC.md](SPEC.md) e o modelo em [modelo/](modelo/) — também no quadro
https://claude.ai/artifact/P42LrHKdkxFeVmYSchWMmu. **O modelo vence a SPEC no empate.**
**Branch:** `feature/biblioteca` · **Worktree:** `/home/robertogabrieu/desbravadores/.claude/worktrees/biblioteca`
· **Base:** `origin/main` em `6bc7e05` · **PR:** #32 (rascunho).

## Global Constraints

- **Zero `any`.** Tipo específico, `unknown` com type guard, ou generic (CLAUDE.md).
- **Contratos só em `packages/shared`.** Nada de redeclarar `ItemBibliotecaSaida` e companhia na API
  ou no web.
- **Toda operação de modelo de clube leva `clubeId`**, inclusive em `include` aninhado. Fora do clube:
  **404, nunca 403**. Id malformado: 400 `VALIDACAO`.
- **Toda rota declara `@Publica`, `@Autenticado`, `@Logado` ou `@Pode`.**
- **Nunca apague linha com histórico: desative.** Única exceção desta feature: a linha de `Arquivo`
  da capa trocada ou tirada (SPEC, Decisões).
- **Ids vêm do Prisma Client ou de `gerarUuidV7()`** (`apps/api/src/comum/uuid-v7.ts`); nada de INSERT
  em SQL cru.
- **Toda escrita da biblioteca roda numa transação com `travarBiblioteca(tx, clubeId)`** e reconfere
  ali dentro categoria ativa, categoria vazia, nome livre, cota e vizinho (SPEC, regra 9).
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** Classes saem dos tokens e de `ui/`
  (`Cartao`, `Botao`, `Confirmacao`, `Campo`, `Selecao`, `EstadoVazio`, `MenuCabecalho`,
  `BarraProgresso`, `EstadosDeCarga`).
- **Nenhum elemento `fixed`/`sticky` novo.**
- **Tela trata carregando, vazio, erro e sem conexão**; conexão só por `useConexao`.
- **Limites:** PDF até **50 MB** (`50 * 1024 * 1024`), capa até **5 MB**, cota da biblioteca **2 GB**
  por clube; nome do item 1–120, descrição até 120, nome da categoria 1–60.
- **Testes antes da implementação, dentro de cada pacote:** todos os testes do pacote escritos
  primeiro e vistos falhando; depois implementar; depois verde. Nada de intercalar teste por passo.
- **Validação pesada só na fase final (P5).** Por pacote: só os testes do pacote, `npm run tipos` e
  `npm run lint`.
- **Máquina fraca:** uma suíte pesada por vez, sempre pelo `pesado` (`pesado testar` para filtrado,
  `pesado suite -- <cmd>` para a suíte inteira); Node 22
  (`export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`); Vitest com `--maxWorkers=2`;
  Playwright só headless; e2e não roda local, é do CI.
- **`packages/shared` é consumido pelo `dist/` na API:** mudou contrato,
  `npm run build -w packages/shared` antes de testar a API.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`). Push só pelo
  `gestor-pr`, no fim.

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** contrato, permissão, schema + migration, guarda, constantes, rota e esqueleto da tela, handlers | agente principal (inline) | — |
| 1 | **P1** API: módulo da biblioteca, gravação comum, filtro de tamanho | subagente `implementador` | P0 |
| 1 | **P2** API: arquivos (`baixar`), limpeza, categorias iniciais, nginx | subagente `implementador` | P0 |
| 2 | **P3** web: tela da Biblioteca e diálogos | subagente `implementador` | P0 (contrato), P1 (só para o e2e) |
| 2 | **P4** web: menu do Adm e atalhos dos Inícios | subagente `implementador` | P0 |
| 3 | **P5** fase final: e2e, revisão, suíte inteira, QA, docs, PR pronta | `implementador` (e2e) → `gestor-pr` → revisão → `testador` → `qa-runner` → `documentador` → `gestor-pr` | P1–P4 |

P1 e P2 tocam arquivos disjuntos (conferido nas listas) e usam bancos próprios do Jest: correm em
paralelo, o `pesado` enfileira as rodadas. P3 e P4 também são disjuntos e só usam Vitest. **No máximo
dois implementadores de cada vez.**

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 12 | principal — todos de dono compartilhado |
| P1 | 10 | implementador |
| P2 | 13 | implementador |
| P3 | 7 | implementador |
| P4 | 7 | implementador |
| P5 | 2 (e2e) + roteiro de QA + docs | implementador + testador + qa-runner + documentador |
| **Total** | **~51** | 5 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U — ótimo entre 6 e 10
arquivos, o dobro acima de 21. API e web somam ~37 arquivos fora do P0; dois pacotes por lado ficam
todos entre 7 e 13. Juntar P1+P2 (23) cairia no braço caro; partir P4 em "menu" e "atalhos" (3–4 cada)
repagaria o piso de ~27k por arquivos que se testam juntos. P0 tem 12 arquivos mas fica com o
principal porque todos são ímãs de conflito (contrato, permissão, schema, migration, guarda, rotas,
handlers) e quatro pacotes dependem deles. P5 tem poucos arquivos e ainda assim é delegado: a saída
do e2e e da suíte não pode entrar no contexto do principal.

Orçamento por implementador: **~80 turnos**.

---

## P0 — agente principal (inline), onda 0

**Por que inline:** contrato, permissão, schema, migration, guarda do clube, rotas e handlers são de
dono compartilhado; os quatro pacotes seguintes dependem deles.

**Files:**
- Create: `packages/shared/src/contratos/biblioteca.ts`
- Modify: `packages/shared/src/index.ts:30` (export, ao lado de `materiais`)
- Modify: `packages/shared/src/permissoes.ts:30` (chave nova, depois de `calendario.gerenciar`)
- Modify: `packages/shared/src/permissoes.test.ts:5-7` (22 → 23 chaves)
- Modify: `apps/api/prisma/schema.prisma` (`Arquivo` :748-765, `Clube` :171-217, `Usuario` :240-283, modelos novos depois de `Material` :1151)
- Create: `apps/api/prisma/migrations/<timestamp>_biblioteca/migration.sql` (gerada pelo Prisma)
- Modify: `apps/api/src/comum/prisma/guarda-clube.ts:4-40` e `guarda-clube.spec.ts:72-110`
- Modify: `apps/api/src/arquivos/servico-arquivos.ts:5, :14-18` (variante e caminho)
- Create: `apps/api/src/biblioteca/constantes.ts`
- Create: `apps/web/src/modulos/biblioteca/rotas.tsx` e `apps/web/src/modulos/biblioteca/TelaBiblioteca.tsx` (esqueleto)
- Modify: `apps/web/src/rotas.tsx:66-101`
- Create: `apps/web/src/testes/handlers/biblioteca.ts`

- [ ] **Step 1: contrato** — `packages/shared/src/contratos/biblioteca.ts`:

```ts
import { z } from 'zod'
import { Uuid } from './comum'

export const LIMITE_BYTES_PDF_BIBLIOTECA = 50 * 1024 * 1024
export const LIMITE_BYTES_CAPA_BIBLIOTECA = 5 * 1024 * 1024
export const COTA_DA_BIBLIOTECA_BYTES = 2 * 1024 * 1024 * 1024

/** Controle, direção de texto e largura zero: o nome do item vira nome de arquivo baixado e esses caracteres disfarçam a extensão. */
const INVISIVEIS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g
const limpar = (texto: string) => texto.replace(INVISIVEIS, '').trim()

export const NomeDoItem = z.string().transform(limpar).pipe(z.string().min(1, 'Dê um nome ao item').max(120))
export const DescricaoDoItem = z
  .string()
  .transform(limpar)
  .pipe(z.string().max(120))
  .nullable()
  .transform((texto) => (texto ? texto : null))
export const NomeDaCategoria = z.string().transform(limpar).pipe(z.string().min(1, 'Dê um nome à categoria').max(60))

/** Campo `dados` do multipart de POST /biblioteca/itens; o campo `arquivo` é o PDF. */
export const ItemBibliotecaDados = z.object({ nome: NomeDoItem, descricao: DescricaoDoItem.default(null), categoriaId: Uuid })
export const ItemBibliotecaEditar = z.object({ nome: NomeDoItem, descricao: DescricaoDoItem, categoriaId: Uuid }).partial()
export const CategoriaBibliotecaEntrada = z.object({ nome: NomeDaCategoria })
export const MoverNaBiblioteca = z.object({ direcao: z.enum(['acima', 'abaixo']) })

export const ItemBibliotecaSaida = z.object({
  id: Uuid,
  categoriaId: Uuid,
  nome: z.string(),
  descricao: z.string().nullable(),
  bytes: z.number().int(),
  urlLer: z.string(),          // URL assinada (10 min), variante `original`: abre no navegador
  urlBaixar: z.string(),       // URL assinada (10 min), variante `baixar`: sempre attachment
  capaUrl: z.string().nullable(), // URL assinada da miniatura da capa
})
export const CategoriaBibliotecaSaida = z.object({ id: Uuid, nome: z.string(), itens: z.array(ItemBibliotecaSaida) })
export const BibliotecaSaida = z.object({ categorias: z.array(CategoriaBibliotecaSaida) })
// GET /biblioteca → BibliotecaSaida (categorias ativas por ordem; itens ativos por ordem)
// POST /biblioteca/categorias → CategoriaBibliotecaSaida · PATCH /biblioteca/categorias/:id → idem
// POST /biblioteca/categorias/:id/mover → 204 · DELETE /biblioteca/categorias/:id → 204
// POST /biblioteca/itens (multipart: dados, arquivo) → ItemBibliotecaSaida · PATCH /biblioteca/itens/:id → idem
// PUT /biblioteca/itens/:id/capa (multipart: capa) → idem · DELETE /biblioteca/itens/:id/capa → idem
// POST /biblioteca/itens/:id/mover → 204 · DELETE /biblioteca/itens/:id → 204
```

E em `packages/shared/src/index.ts`, ao lado de `:30`: `export * from './contratos/biblioteca'`.

- [ ] **Step 2: permissão** — em `permissoes.ts`, depois de `:30`:

```ts
  'biblioteca.gerenciar': { rotulo: 'Montar a biblioteca do clube', padrao: { ADM: true } },
```

Em `permissoes.test.ts:5-7`, 22 → 23.

- [ ] **Step 3: schema** — depois de `Material` (`schema.prisma:1151`):

```prisma
model CategoriaBiblioteca {
  id            String    @id @default(uuid(7)) @db.Uuid
  clubeId       String    @db.Uuid
  nome          String
  ordem         Int
  criadaEm      DateTime  @default(now()) @db.Timestamptz
  removidaEm    DateTime? @db.Timestamptz
  removidaPorId String?   @db.Uuid

  clube      Clube            @relation(fields: [clubeId], references: [id], onDelete: Restrict)
  removidaPor Usuario?        @relation("CategoriaBibliotecaRemovidaPor", fields: [removidaPorId], references: [id], onDelete: Restrict)
  itens      ItemBiblioteca[]

  @@unique([clubeId, id])
  @@index([clubeId, ordem])
}

model ItemBiblioteca {
  id            String    @id @default(uuid(7)) @db.Uuid
  clubeId       String    @db.Uuid
  categoriaId   String    @db.Uuid
  nome          String
  descricao     String?
  ordem         Int
  arquivoId     String    @unique @db.Uuid
  capaId        String?   @unique @db.Uuid
  enviadoPorId  String    @db.Uuid
  criadoEm      DateTime  @default(now()) @db.Timestamptz
  atualizadoEm  DateTime  @updatedAt @db.Timestamptz
  removidoEm    DateTime? @db.Timestamptz
  removidoPorId String?   @db.Uuid

  clube      Clube               @relation(fields: [clubeId], references: [id], onDelete: Restrict)
  categoria  CategoriaBiblioteca @relation(fields: [clubeId, categoriaId], references: [clubeId, id], onDelete: Restrict)
  arquivo    Arquivo             @relation("PdfDoItem", fields: [clubeId, arquivoId], references: [clubeId, id], onDelete: Restrict)
  capa       Arquivo?            @relation("CapaDoItem", fields: [clubeId, capaId], references: [clubeId, id], onDelete: Restrict)
  enviadoPor Usuario             @relation("ItemBibliotecaEnviadoPor", fields: [enviadoPorId], references: [id], onDelete: Restrict)
  removidoPor Usuario?           @relation("ItemBibliotecaRemovidoPor", fields: [removidoPorId], references: [id], onDelete: Restrict)

  @@unique([clubeId, arquivoId])
  @@unique([clubeId, capaId])
  @@index([clubeId, categoriaId, ordem])
}
```

Em `Arquivo` (`:759-760`), ao lado de `foto` e `material`:
`itemBiblioteca ItemBiblioteca? @relation("PdfDoItem")` e `capaDeItem ItemBiblioteca? @relation("CapaDoItem")`.
Em `Clube` (`:171-217`): `categoriasBiblioteca CategoriaBiblioteca[]` e `itensBiblioteca ItemBiblioteca[]`.
Em `Usuario` (`:240-283`): as quatro relações inversas nomeadas acima.

- [ ] **Step 4: migration contra o banco real** (CLAUDE.md do MEV-Med não vale aqui; a regra é a
deste repo: Prisma gera, o banco aplica):

```bash
cd /home/robertogabrieu/desbravadores/.claude/worktrees/biblioteca/apps/api
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
npx prisma migrate dev --name biblioteca --create-only   # gera; conferir o SQL antes de aplicar
npx prisma migrate dev                                   # aplica no banco de dev desta worktree (desbravador_biblioteca)
```

Conferir no SQL: duas tabelas, FKs compostas `(clubeId, categoriaId)`, `(clubeId, arquivoId)`,
`(clubeId, capaId)` com `ON DELETE RESTRICT`, os únicos e os índices — e **nenhum** INSERT.

- [ ] **Step 5: guarda do clube** — `'CategoriaBiblioteca'` e `'ItemBiblioteca'` em `MODELOS_DE_CLUBE`
(`guarda-clube.ts:4-40`, em ordem alfabética como os vizinhos) e na lista literal de
`guarda-clube.spec.ts:72-110` (o título do teste que conta os modelos também muda).

- [ ] **Step 6: arquivos** — `servico-arquivos.ts`:

```ts
export type VarianteArquivo = 'original' | 'miniatura' | 'baixar'

/** PDF ou capa de item da biblioteca; `ext` vem do servidor (`pdf` ou `jpg`), nunca do cliente. */
export function caminhoDaBiblioteca(clubeId: string, arquivoId: string, ext: 'pdf' | 'jpg', miniatura = false): string {
  return `clube/${clubeId}/biblioteca/${arquivoId}${miniatura ? '-min' : ''}.${ext}`
}
```

- [ ] **Step 7: constantes da API** — `apps/api/src/biblioteca/constantes.ts`:

```ts
import type { Prisma } from '../generated/prisma/client.js'

/** As prateleiras com que todo clube começa, na ordem da estante. */
export const CATEGORIAS_INICIAIS = ['Cadernos de Classes', 'Livros', 'Manuais & Documentos'] as const

/** Serializa as escritas da biblioteca do clube (SPEC, regra 9); só vale dentro de uma transação. */
export async function travarBiblioteca(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`biblioteca:${clubeId}`}, 0))`
}
```

(O tipo `Prisma` vem do client gerado, como em `scripts/clube-criar.ts:6`.)

- [ ] **Step 8: rota e esqueleto da tela** — `apps/web/src/modulos/biblioteca/TelaBiblioteca.tsx`
exporta `TelaBiblioteca` que por ora devolve `<h1 className="font-titulo text-2xl font-bold text-texto">Biblioteca</h1>`
(o P3 a substitui). `apps/web/src/modulos/biblioteca/rotas.tsx`:

```tsx
import type { RouteObject } from 'react-router-dom'
import { TelaBiblioteca } from './TelaBiblioteca'

export const rotasAdmBiblioteca: RouteObject[] = [{ path: '/adm/biblioteca', element: <TelaBiblioteca /> }]
export const rotasBiblioteca: RouteObject[] = [{ path: '/biblioteca', element: <TelaBiblioteca /> }]
```

Em `rotas.tsx`: `...rotasBiblioteca` ao lado de `/fila` (fora das guardas por papel, `:72-73`) e
`...rotasAdmBiblioteca` depois de `...rotasAdmCronogramas` (`:96`).

- [ ] **Step 9: handlers de teste** — `apps/web/src/testes/handlers/biblioteca.ts` com
`criarItemBiblioteca(n, parcial?)`, `criarCategoriaBiblioteca(n, itens, parcial?)` e
`handlerBiblioteca(categorias)` (GET `/api/biblioteca` → `{ categorias }`), no padrão de
`testes/handlers/materiais.ts:6-22` e com ids de `uuid(n)` (`testes/handlers/sessao.ts:10`).

- [ ] **Step 10: conferir e commitar**

```bash
cd /home/robertogabrieu/desbravadores/.claude/worktrees/biblioteca
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
npm run build -w packages/shared && npm run tipos && npm run lint
pesado testar -- npx vitest run packages/shared/src/permissoes.test.ts
pesado testar -- npm run teste -w api -- guarda-clube
```

Commit (skill `commit`): `feat(biblioteca): o banco ganha categorias e itens da biblioteca, e o Adm a permissão de montá-la`.

---

## P1 — API: módulo da biblioteca · subagente, onda 1

**Entrega:** todas as rotas da tabela da SPEC §API, com regras 1–11, e a gravação em disco extraída
para ser usada por materiais e biblioteca.

**Files:**
- Create: `apps/api/src/arquivos/gravar-e-confirmar.ts` — grava no disco, roda a transação e desfaz o disco se ela falhar
- Modify: `apps/api/src/materiais/materiais.service.ts:160-206` — passa a usar `gravarEConfirmar` (comportamento igual)
- Modify: `apps/api/src/materiais/filtro-arquivo-grande.ts:3-16` — mensagem por instância
- Modify: `apps/api/src/materiais/materiais.controller.ts:29` — `@UseFilters(new FiltroArquivoGrande())`
- Modify: `apps/api/src/materiais/materiais.spec.ts:153` — só se a mensagem mudar de lugar (o texto "até 20 MB" fica)
- Create: `apps/api/src/biblioteca/biblioteca.module.ts` (importa `ArquivosModule`, como `materiais.module.ts`)
- Create: `apps/api/src/biblioteca/biblioteca.controller.ts`
- Create: `apps/api/src/biblioteca/biblioteca.service.ts`
- Create: `apps/api/src/biblioteca/biblioteca.spec.ts`
- Modify: `apps/api/src/app.module.ts` (um módulo por linha, em ordem alfabética)

**Interfaces:**
- Consumes (P0): contratos de `@desbravadores/shared` (`ItemBibliotecaDados`, `ItemBibliotecaEditar`,
  `CategoriaBibliotecaEntrada`, `MoverNaBiblioteca`, `*Saida`, `LIMITE_BYTES_*`, `COTA_DA_BIBLIOTECA_BYTES`);
  `travarBiblioteca`, `CATEGORIAS_INICIAIS` de `biblioteca/constantes.ts`; `caminhoDaBiblioteca` e
  `VarianteArquivo` de `arquivos/servico-arquivos.ts`; `processarFoto` de `fotos/processamento-de-imagem.ts:35`;
  `conteudoConfereComExtensao(caminho, 'pdf')` de `materiais/conferencia-de-documento.ts:87`.
- Produces:
  - `gravarEConfirmar<T>(armazenamento: Armazenamento, destinos: Array<{ caminho: string; origem: string | Buffer }>, confirmar: () => Promise<T>, aoFalharApagar: (caminho: string) => Promise<void>): Promise<T>` — string = `gravarDeArquivo`, Buffer = `gravar`; erro em qualquer passo apaga todos os destinos e relança.
  - `class FiltroArquivoGrande { constructor(mensagem = MENSAGEM_ARQUIVO_GRANDE) }`.
  - `BibliotecaService` com `listar`, `criarCategoria`, `renomearCategoria`, `moverCategoria`, `excluirCategoria`,
    `criarItem(sessao, corpo: unknown, arquivo: ArquivoEmDisco | undefined)`, `editarItem`, `moverItem`,
    `removerItem`, `porCapa(sessao, id, capa: ArquivoEmDisco | undefined)`, `tirarCapa`.

**Controller** (decorators e limites exatos):

```ts
const PASTA_TEMPORARIA_DA_BIBLIOTECA = join(tmpdir(), 'desbravadores-biblioteca')
// diskStorage igual a materiais.controller.ts:21-26, com a pasta acima

@Controller('biblioteca')
export class BibliotecaController {
  @Logado() @Get() listar(...)
  @Pode('biblioteca.gerenciar') @Post('categorias') criarCategoria(... ZodValidationPipe(CategoriaBibliotecaEntrada))
  @Pode('biblioteca.gerenciar') @Patch('categorias/:id') renomearCategoria(...)
  @Pode('biblioteca.gerenciar') @Post('categorias/:id/mover') @HttpCode(204) moverCategoria(... MoverNaBiblioteca)
  @Pode('biblioteca.gerenciar') @Delete('categorias/:id') @HttpCode(204) excluirCategoria(...)
  @Pode('biblioteca.gerenciar') @Post('itens')
  @UseFilters(new FiltroArquivoGrande('O PDF pode ter até 50 MB.'))
  @UseInterceptors(FileInterceptor('arquivo', { storage, limits: { fileSize: LIMITE_BYTES_PDF_BIBLIOTECA, files: 1 } }))
  criarItem(@SessaoDoClube() s, @UploadedFile() arquivo: ArquivoEmDisco | undefined, @Body() corpo: unknown)
  @Pode('biblioteca.gerenciar') @Patch('itens/:id') editarItem(... ItemBibliotecaEditar)
  @Pode('biblioteca.gerenciar') @Put('itens/:id/capa')
  @UseFilters(new FiltroArquivoGrande('A capa pode ter até 5 MB.'))
  @UseInterceptors(FileInterceptor('capa', { storage, limits: { fileSize: LIMITE_BYTES_CAPA_BIBLIOTECA, files: 1 } }))
  porCapa(...)
  @Pode('biblioteca.gerenciar') @Delete('itens/:id/capa') tirarCapa(...)
  @Pode('biblioteca.gerenciar') @Post('itens/:id/mover') @HttpCode(204) moverItem(...)
  @Pode('biblioteca.gerenciar') @Delete('itens/:id') @HttpCode(204) removerItem(...)
}
```

Ids de rota por `new ZodValidationPipe(Uuid)` (`materiais.controller.ts:19`).

**Regras do service que os testes cobram** (SPEC §Regras e §Decisões):
- Escrita: `prisma.$transaction(async (tx) => { await travarBiblioteca(tx, clubeId); … })`, timeout de 20 s
  como `materiais.service.ts:23`. Dentro da transação: categoria ativa e do clube; nome livre entre as
  **ativas**, comparando `lower()`; cota; vizinho.
- `criarItem`: `temporário → conteudoConfereComExtensao(path, 'pdf')` (senão 422 `REGRA` "O arquivo não é
  um PDF."), cota sem trava para falhar cedo, `gravarEConfirmar` com destino
  `caminhoDaBiblioteca(clubeId, arquivoId, 'pdf')` e transação que reconfere cota, cria `Arquivo`
  (`mime: 'application/pdf'`) e o item com `ordem = max(ordem da categoria ativa) + 1`. O temporário some
  no `finally` (`materiais.service.ts:119-126`).
- Cota: `arquivo.aggregate({ where: { clubeId, OR: [{ itemBiblioteca: { is: { removidoEm: null } } }, { capaDeItem: { is: { removidoEm: null } } }] }, _sum: { bytes } })`
  `+ novos > COTA_DA_BIBLIOTECA_BYTES` → 422 "O espaço da biblioteca do clube acabou.".
- `porCapa`: lê o temporário (`readFile`), `processarFoto(buffer)` (erro de formato dele → 422 "A capa
  precisa ser JPG, PNG ou WebP."), dois destinos (`'jpg'` e `'jpg', true`), transação: reconfere cota
  (bytes da capa nova, menos os da antiga), cria o `Arquivo` novo (`mime: 'image/jpeg'`, `miniaturaCaminho`,
  `largura`, `altura`), aponta `capaId` para ele, **apaga a linha de `Arquivo` da capa antiga**; depois da
  transação, apaga `caminho` e `miniaturaCaminho` antigos do disco (falha só registra no log).
- `tirarCapa`: transação `capaId = null` + apaga a linha antiga; depois, disco.
- `editarItem` com `categoriaId` diferente: destino ativo e do clube (senão 404), `ordem = fim` do destino.
- `mover*`: vizinho ativo mais próximo por `(ordem, id)` na direção pedida; sem vizinho, nada muda (204);
  troca as duas `ordem`.
- `excluirCategoria`: com item ativo → 422 "Tire os itens da categoria antes de excluí-la."; senão
  `removidaEm`, `removidaPorId`.
- `removerItem`: `removidoEm`, `removidoPorId`; depois apaga PDF e capa (`caminho` e `miniaturaCaminho`) do disco.
- `listar`: categorias ativas por `(ordem, id)`, itens ativos por `(ordem, id)`, `bytes` do PDF,
  `urlLer = urlAssinada(clubeId, arquivoId, 'original')`, `urlBaixar = …'baixar'`,
  `capaUrl = capaId ? urlAssinada(clubeId, capaId, 'miniatura') : null`. **Ids do banco chegam como
  string**: converta antes de comparar ou indexar.

- [ ] **Step 1: escrever todos os testes** em `biblioteca.spec.ts` (integração, banco próprio, molde de
`materiais.spec.ts`, incluindo como ele monta PDF e PNG de teste), e o de `gravarEConfirmar`:
  - lista: só do clube da sessão, na ordem, sem removidos; conselheiro e instrutor leem (200); sem sessão 401;
  - criar item: PDF ok (item no fim, `urlLer`/`urlBaixar` presentes); PNG renomeado `.pdf` → 422; acima de 50 MB → 422 com "O PDF pode ter até 50 MB."; cota estourada (pré-encher `Arquivo` até perto de 2 GB com bytes fictícios) → 422; falha da transação apaga do disco; categoria de outro clube → 404; categoria removida → 404; conselheiro e instrutor → recusado (como a guarda responde hoje);
  - capa: ok (lista traz `capaUrl`); `.txt` → 422; acima de 5 MB → 422 com "A capa pode ter até 5 MB."; trocar apaga a linha antiga e os dois arquivos antigos do disco; tirar; a capa conta na cota e a troca a libera;
  - nome: `"Livro‮txt.exe"` grava `"Livrotxt.exe"`; nome só de espaços → 400;
  - editar: renomear; mudar de categoria vai para o fim do destino; destino de outro clube → 404;
  - mover: troca com o vizinho ativo; pula removido; no topo "acima" não muda nada; **duas chamadas simultâneas** (`Promise.all`) não deixam `ordem` repetida na categoria;
  - remover item: some da lista; a URL assinada antiga responde 404 (`GET /api/arquivos/:id?...`); PDF e capa saem do disco; a cota libera;
  - categoria: criar no fim; nome repetido com maiúsculas diferentes → 422; nome de categoria removida pode ser reusado; excluir com item ativo → 422; excluir vazia; **excluir e criar item nela ao mesmo tempo** não deixa item ativo em categoria removida;
  - isolamento: item de outro clube → 404 em editar, mover, capa e remover;
  - `gravarEConfirmar`: grava e confirma; confirmação falha → todos os destinos removidos e o erro relançado;
  - materiais: o teste de 20 MB (`materiais.spec.ts:153`) continua com "até 20 MB".
- [ ] **Step 2: rodar e ver falhar** — `pesado testar -- npm run teste -w api -- biblioteca materiais`
- [ ] **Step 3: implementar** `gravar-e-confirmar.ts`, filtro, refatoração de materiais, módulo, controller, service, `app.module.ts`.
- [ ] **Step 4: verde** — o mesmo comando do Step 2, mais `npm run tipos -w api`, `npm run lint`,
  e `pesado testar -- npm run teste -w api -- varredura-de-rotas` (toda rota com decorator).
- [ ] **Step 5: o principal commita** — `feat(biblioteca): o Adm monta a biblioteca do clube pela API e a liderança a lê`.

---

## P2 — API: arquivos, limpeza, categorias iniciais e nginx · subagente, onda 1

**Entrega:** `baixar` servido como download com o nome do item; item removido some da rota de
arquivos; limpeza na subida cobre a biblioteca; clube novo e carga criam as três categorias; limites
de upload de 51m nos dois nginx.

**Files:**
- Modify: `apps/api/src/arquivos/arquivos.controller.ts:13-18` (enum), `:48-57` (select e removido), `:64-76` (disposição)
- Modify: `apps/api/src/arquivos/arquivos.spec.ts`
- Modify: `apps/api/src/materiais/limpeza-de-materiais.ts:33-50` (segunda varredura)
- Create: `apps/api/src/materiais/limpeza-de-materiais.spec.ts` (se o teste de limpeza existente estiver em `materiais.spec.ts:245`, **não** mexer nele: arquivo do P1)
- Modify: `apps/api/src/scripts/clube-criar.ts:41-57` (`criarClubeBase` cria as 3 categorias)
- Modify: `apps/api/src/scripts/carga.ts:51` (`ResumoDaCarga.categoriasBiblioteca: { criados: number }`), `:348-358` (novo `completarBibliotecaDosClubes`), `:360+` (chamada em `executarCarga`)
- Modify: `apps/api/src/scripts/carga.spec.ts:117`
- Modify: `apps/api/src/tarefas/tarefas.spec.ts` e `apps/api/src/desbravadores/classe-pela-idade.service.spec.ts` só se quebrarem por `criarClubeBase`
- Modify: `apps/web/nginx.conf:32-44` (bloco novo `location /api/biblioteca/` depois do de materiais)
- Modify: `scripts/nginx-host.conf:21` (21m → 51m) e `scripts/instalar.sh:259` (mensagem: 51m)
- Modify: `apps/web/src/testes/nginx-host.test.ts:19-21` e `apps/web/src/testes/nginx-csp.test.ts:36-43`

**Interfaces:**
- Consumes (P0): `VarianteArquivo` com `'baixar'`; `CATEGORIAS_INICIAIS`, `travarBiblioteca`; modelos
  `CategoriaBiblioteca` e `ItemBiblioteca` e as relações `Arquivo.itemBiblioteca` / `Arquivo.capaDeItem`.
- Produces: rota `GET /api/arquivos/:id?c&v=baixar&exp&sig`; `ResumoDaCarga.categoriasBiblioteca`.

**Regras:**
- `arquivos.controller.ts`: `v: z.enum(['original', 'miniatura', 'baixar'])`; `caminho` =
  `miniaturaCaminho` só para `miniatura`; `select` ganha `itemBiblioteca: { select: { nome: true, removidoEm: true } }`
  e `capaDeItem: { select: { removidoEm: true } }`; removido → "não encontrado" como `:57`; título =
  `itemBiblioteca?.nome ?? material?.titulo ?? 'arquivo'`; **`baixar` sai sempre `attachment`**, qualquer mime;
  `original` de PDF segue `inline`. A CSP `sandbox` de não-PDF (`:64-66`) não muda.
- Limpeza: depois da de materiais, por clube e em lotes de 100, `ItemBiblioteca` com `removidoEm` não nulo:
  apaga `arquivo.caminho`, e da `capa` `caminho` e `miniaturaCaminho`.
- `completarBibliotecaDosClubes(tx, resumo)`: para cada clube, `travarBiblioteca(tx, clube.id)`; se o clube
  **não tem nenhuma** `CategoriaBiblioteca` (ativa ou removida), cria as três com `ordem` 1, 2, 3 e soma em
  `resumo.categoriasBiblioteca.criados`. `criarClubeBase` cria as mesmas três.
- nginx do container: cópia do bloco de materiais (proxy completo e cabeçalhos, sem CSP própria), com
  `client_max_body_size 51m`; o tempo de 60 s não muda (SPEC, Decisões).

- [ ] **Step 1: escrever todos os testes**:
  - arquivos: `baixar` de PDF de item → `Content-Disposition: attachment` com `filename*` do nome do item; `original` do mesmo PDF → `inline` com o nome do item; assinatura de `original` usada com `v=baixar` → recusada; item removido → 404 em `original`, `baixar` e na `miniatura` da capa; capa ativa serve `image/jpeg` sem disposição; material continua com o título;
  - limpeza: item removido com capa → os três caminhos removidos do armazenamento (dublê de `Armazenamento`, como o resto dos testes); item ativo intacto;
  - clube novo: `criarClubeBase` cria as 3 categorias em ordem;
  - carga: cria nos clubes sem nenhuma; **não recria** em clube com uma removida; rodar duas vezes não duplica; `resumo.categoriasBiblioteca.criados` certo;
  - nginx (Vitest): host com `client_max_body_size 51m`; bloco `/api/biblioteca/` com 51m e sem CSP; as CSPs que já existiam não mudam.
- [ ] **Step 2: ver falhar** — `pesado testar -- npm run teste -w api -- arquivos limpeza carga` e
  `pesado testar -- npx vitest run --maxWorkers=2 apps/web/src/testes/nginx-host.test.ts apps/web/src/testes/nginx-csp.test.ts`
- [ ] **Step 3: implementar.**
- [ ] **Step 4: verde** — os mesmos comandos, mais os specs que usam `criarClubeBase`
  (`tarefas`, `classe-pela-idade`), `npm run tipos`, `npm run lint`.
- [ ] **Step 5: o principal commita** — `feat(biblioteca): o PDF da biblioteca baixa com o nome do item, e todo clube começa com três categorias`.

---

## P3 — web: tela da Biblioteca e diálogos · subagente, onda 2

**Entrega:** `TelaBiblioteca` completa nas duas rotas, igual ao modelo: `Biblioteca-Adm`,
`Biblioteca-Celular`, `Adicionar`, `Adicionar-Enviando`, `Adicionar-CapaFalhou`, `Editar-Item`,
`Remover-Item`, `Nova-Categoria`, `Vazio-Adm`, `Sem-Categoria-Adm`, `Vazio-Celular`
(`docs/fases/biblioteca/modelo/*.dc.html`).

**Files:**
- Create: `apps/web/src/api/biblioteca.ts`
- Modify: `apps/web/src/modulos/biblioteca/TelaBiblioteca.tsx` (substitui o esqueleto do P0)
- Create: `apps/web/src/modulos/biblioteca/CartaoDoItem.tsx`
- Create: `apps/web/src/modulos/biblioteca/DialogosDaBiblioteca.tsx`
- Create: `apps/web/src/modulos/biblioteca/biblioteca.test.tsx`
- Modify: `apps/web/src/testes/handlers/biblioteca.ts` (handlers de escrita)
- Create: `apps/web/src/modulos/biblioteca/estado.ts` (só se a tela passar de ~250 linhas: ação aberta, item escolhido)

**Interfaces:**
- Consumes (P0): contratos; `handlerBiblioteca`, `criarItemBiblioteca`, `criarCategoriaBiblioteca`.
- Produces (`api/biblioteca.ts`): `useBiblioteca()`; `useCriarCategoria`, `useRenomearCategoria`,
  `useMoverCategoria`, `useExcluirCategoria`, `useEditarItem`, `useMoverItem`, `useRemoverItem`,
  `useTirarCapa`; `enviarItem(arquivo: File, dados, aoProgredir: (porcento: number) => void): Promise<ItemBiblioteca>`
  e `enviarCapa(itemId: string, capa: File, aoProgredir): Promise<ItemBiblioteca>` por XHR com
  `xhr.upload.onprogress`, renovando a sessão em 401 (molde: `api/materiais.ts:43-75`).

**Regras de tela** (SPEC §Telas e §Descobribilidade; o modelo vence):
- `useBiblioteca`: `gcTime: 0`, `staleTime: 5 * 60_000`, `refetchInterval: 8 * 60_000`, `refetchOnWindowFocus: true`.
- Layout: o do Adm usa o cabeçalho de `ListaUnidades.tsx:28-41` (h1 + "3 categorias · 9 itens" + botões
  "Nova categoria" secundário e "Adicionar à biblioteca" primário com `Plus`); quem só lê usa o de
  `TelaMateriais.tsx:263-270` (voltar para `/inicio` + h1 + resumo). O que decide é `pode('biblioteca.gerenciar')`, não o papel.
- Seção: `h2` + "N itens" + (com permissão) `MenuCabecalho` "Opções" com Renomear, Mover para cima, Mover
  para baixo, Excluir — "para cima" some na primeira, "para baixo" na última, "Excluir" só vazia.
- Grade: `grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4`. Cartão: capa 3:4 (`capaUrl` ou o bloco
  sem capa: `bg-marca-suave`, ícone `BookOpen` e o nome), nome em 2 linhas (`line-clamp-2`), descrição em
  1 (`truncate`), "Ler" (`<a href={urlLer} target="_blank" rel="noopener noreferrer">` com o estilo do
  "Abrir" de `TelaMateriais.tsx:207-216`) e "Baixar" (`<a href={urlBaixar}>` com `estiloDoBotao({ variante: 'secundario' })`),
  ícones só a partir de `sm`; `aria-label` "Ler <nome>" / "Baixar <nome>"; com permissão, "Opções"
  (Editar, Mover para cima, Mover para baixo, Remover) abaixo, à direita.
- Diálogos (`Confirmacao`), textos exatos do modelo. Adicionar: PDF, Nome (preenchido do arquivo sem
  `.pdf` só se vazio), Descrição, Categoria (`Selecao`, padrão = a primeira), Capa; PDF > 50 MB ou capa
  > 5 MB recusados antes do envio; durante o envio, campos `disabled`, `BarraProgresso` com "Enviando o
  PDF…"/"Enviando a capa…" e o botão `carregando` com "Adicionando". Capa recusada depois do item criado:
  o diálogo vira "<nome> foi adicionado", com o aviso, o campo Capa, "Enviar capa" e "Fechar".
- Vazios: sem categoria (cabeçalho sem botões + `EstadoVazio` com "Nova categoria" primário); sem item
  (Adm: só a mensagem do modelo; leitor: a dele); com itens, categoria vazia aparece para o Adm com
  "Nenhum item nesta categoria." e some para o leitor.
- Sem conexão: `DisponivelComInternet` (`ui/EstadosDeCarga.tsx`), por `useConexao`.

- [ ] **Step 1: escrever todos os testes** em `biblioteca.test.tsx` (MSW, sessão por `handlersSessao(vínculos, ativo, permissoes)`):
  - leitor (conselheiro, sem a permissão): categorias na ordem, cartões com nome e descrição, "Ler" com `href` = `urlLer` e `target=_blank`, "Baixar" com `href` = `urlBaixar`, **nenhum** "Opções", "Adicionar" ou "Nova categoria"; categoria vazia some;
  - Adm: botões do cabeçalho; menu da 1ª categoria sem "Mover para cima"; "Excluir" só na vazia; menu do 1º item sem "Mover para cima";
  - vazios: sem categoria (texto e único botão), sem item para Adm e para leitor;
  - adicionar: escolher `livro.pdf` preenche "livro"; nome já digitado não é sobrescrito; PDF de 51 MB recusado com "O PDF pode ter até 50 MB." sem chamada à API; progresso aparece (simular `onprogress`); capa recusada depois do item → título "<nome> foi adicionado" e "Enviar capa";
  - editar: muda nome e categoria e chama o PATCH; "Tirar capa" chama o DELETE;
  - mover: escolher "Mover para baixo" chama o POST com `{ direcao: 'abaixo' }`;
  - remover: confirmação com o texto do modelo, botão vermelho, DELETE;
  - sem conexão: aviso "Disponível com internet".
- [ ] **Step 2: ver falhar** — `pesado testar -- npx vitest run --maxWorkers=2 apps/web/src/modulos/biblioteca`
- [ ] **Step 3: implementar.**
- [ ] **Step 4: verde** — o mesmo, mais `npm run tipos -w web` e `npm run lint`.
- [ ] **Step 5: o principal commita** — `feat(biblioteca): a liderança vê a estante da biblioteca e o Adm a monta pela tela`.

---

## P4 — web: menu do Adm e atalhos dos Inícios · subagente, onda 2

**Entrega:** os caminhos até a tela, iguais a `modelo/Biblioteca-Adm.dc.html` (menu),
`modelo/Inicio-Conselheiro.dc.html` e `modelo/Inicio-Instrutor-SemClasse.dc.html`.

**Files:**
- Modify: `apps/web/src/layouts/LayoutAdm.tsx:1, :16-27` (`BookOpen`; "Biblioteca" → `/adm/biblioteca` depois de "Cronogramas")
- Modify: `apps/web/src/modulos/inicio/InicioConselheiro.tsx:3, :31-36` (5º atalho "Biblioteca" → `/biblioteca`, ícone `BookOpen`)
- Modify: `apps/web/src/modulos/inicio-instrutor/TelaInicioInstrutor.tsx:2, :29-36, :155-188` (7º atalho; sem classe, `EstadoVazio` seguido da seção "Atalhos" só com "Biblioteca")
- Modify: `apps/web/src/layouts/layouts.test.tsx:153-170`
- Modify: `apps/web/src/rotas.test.tsx`
- Modify: `apps/web/src/modulos/inicio/inicio.test.tsx`
- Modify: `apps/web/src/modulos/inicio-instrutor/inicio-instrutor.test.tsx`

**Interfaces:** consome as rotas do P0 (`/adm/biblioteca`, `/biblioteca`); não produz nada para outros pacotes.

**Regras:** o atalho do instrutor aponta sempre para `/biblioteca` (não depende de `classeUnica`); no
sem-classe, reaproveitar o componente `Atalhos` com uma lista só, sem duplicar o markup. A barra
inferior (`LayoutCelular.tsx:18-22`) **não** muda.

- [ ] **Step 1: escrever todos os testes**: menu do Adm tem "Biblioteca" entre "Cronogramas" e "Configurações do clube" apontando para `/adm/biblioteca`; `/biblioteca` abre para conselheiro e instrutor e `/adm/biblioteca` para Adm (`rotas.test.tsx`); Início do conselheiro tem 5 atalhos, o último "Biblioteca" → `/biblioteca`; instrutor com classe tem 7; instrutor sem classe vê o texto vazio **e** um único atalho, "Biblioteca".
- [ ] **Step 2: ver falhar** — `pesado testar -- npx vitest run --maxWorkers=2 apps/web/src/layouts apps/web/src/rotas.test.tsx apps/web/src/modulos/inicio apps/web/src/modulos/inicio-instrutor`
- [ ] **Step 3: implementar.**
- [ ] **Step 4: verde** — o mesmo, mais `npm run tipos -w web` e `npm run lint`.
- [ ] **Step 5: o principal commita** — `feat(biblioteca): o Adm acha a biblioteca no menu, e conselheiro e instrutor no Início`.

---

## P5 — fase final · onda 3

Na ordem de `rules/pr-pronta.md` (revisão antes da suíte):

- [ ] **e2e (implementador, ~40 turnos):** em `e2e/adm.spec.ts`, o Adm adiciona um PDF pequeno com nome
  próprio em "Livros"; o conselheiro abre `/biblioteca`, vê o cartão e o "Ler" tem `href` de
  `/api/arquivos/` com `v=original`. Não roda local: só `npx tsc --noEmit -p e2e` (ou o que o repo usa
  para tipar o e2e) e lint. O principal commita: `test(biblioteca): o e2e cobre o Adm adicionando e o conselheiro lendo`.
- [ ] **Push de revisão:** `gestor-pr`, "push de revisão", PR #32 segue rascunho.
- [ ] **Revisão da PR inteira** (diff contra `main`): skill `code-review` + checklist de
  `~/.claude/rules-sob-demanda/revisao-de-codigo.md`. Até três rodadas; achado médio ou maior se conserta
  (redelegando ao `implementador` do pacote), baixo vira pendência. Consertos em commits locais.
- [ ] **Suíte inteira, uma vez:** o CI é o gate se estiver funcionando; senão `testador` com
  `pesado testar --tudo`. Falhou: `saneador` com o dossiê, nunca um implementador por falha.
- [ ] **Medição no DOM** (critério de pronto da SPEC): 390, 820 e 1280 px, 3 categorias e 9 itens — sem
  rolagem lateral, nomes longos cortados, nenhum `fixed`/`sticky` novo. Pelo `qa-runner`.
- [ ] **QA** (`qa-roteiro` → `qa-runner`): um item por tela de `modelo/` mais o fluxo da SPEC (Adm cria
  categoria, adiciona PDF com e sem capa, renomeia, move, remove; conselheiro e instrutor veem, leem e
  baixam; outro clube não vê). App local: `http://localhost:5173`, usuários `adm@orion.local`,
  `conselheiro@orion.local`, `instrutor@orion.local`, `instrutor2@orion.local` (sem classe), senha
  `Senha@1234`, banco `desbravador_biblioteca`.
- [ ] **Docs (`documentador`):** `README.md:141,195-205` (51m e o nginx do servidor no repo),
  `docs/planejamento/MODELO-DE-DADOS.md` (`:254-256`, `:290`), `API.md` (rotas, `:162`, matriz `:195-205`),
  `BACKLOG.md` (item ao lado de I10, `:249-252`), `ARQUITETURA.md:177`, `RISCOS.md:44`,
  `docs/design/LEIA-ME.md:26-80` (inventário: Biblioteca). O principal commita.
- [ ] **Fechar:** `gestor-pr` sobe o resto, escreve no corpo da PR a seção "Precisa para funcionar no ar"
  (já existe: carga e nginx do servidor) e tira do rascunho; conferir `isDraft=false`.

---

## O que NÃO quebra (conferido no código em 6bc7e05)

- **Envio de material de classe:** continua com 20 MB, a mesma mensagem e a cota de 1 GB; a extração de
  `gravarEConfirmar` só muda onde o código mora (`materiais.service.ts:160-206`).
- **Fotos:** usam só `original` e `miniatura`; ampliar `VarianteArquivo` não muda nada para elas, e o
  `z.enum` da rota continua recusando qualquer outro valor.
- **Barra inferior do celular** e o **service worker** (`sw.ts`): nada muda; `/api/` nunca é cacheado.
- **Permissões ajustáveis** de conselheiro e instrutor: `biblioteca.gerenciar` não se aplica a eles
  (`permissoes.ts:46-48`) e não aparece nos ajustes.
- **Migrations existentes:** a nova só cria tabelas e FKs; nenhuma tabela existente ganha coluna.

## Contrato de retorno do subagente

Até 15 linhas:
1. pacote concluído (ou o que faltou);
2. arquivos tocados — caminhos, nunca conteúdo;
3. testes: verdes e nomes que falharam;
4. decisões que teve de tomar sozinho, uma linha cada;
5. pendências.

Sem diff colado, sem trecho de código, sem recapitular o plano. **Não rode git.**

## ONDE FICA

```
- material de classe (molde)                 apps/api/src/materiais/materiais.controller.ts:16-52 ; materiais.service.ts:23, :119-126, :144-216, :247-260
- trava do clube (molde)                     apps/api/src/materiais/materiais.service.ts:182
- conferência de PDF                         apps/api/src/materiais/conferencia-de-documento.ts:6, :87-90
- filtro 413 → 422                           apps/api/src/materiais/filtro-arquivo-grande.ts:3-16
- limpeza na subida                          apps/api/src/materiais/limpeza-de-materiais.ts:13-58
- armazenamento (gravar / gravarDeArquivo)   apps/api/src/arquivos/armazenamento.ts:9-14, :34
- caminhos e URL assinada                    apps/api/src/arquivos/servico-arquivos.ts:5-41
- rota de arquivos                           apps/api/src/arquivos/arquivos.controller.ts:13-18, :48-57, :64-76 ; disposicao.ts:19-24
- capa (sharp)                               apps/api/src/fotos/processamento-de-imagem.ts:8-15, :35-46
- id v7                                      apps/api/src/comum/uuid-v7.ts
- schema                                     apps/api/prisma/schema.prisma:748-765, :1128-1151, :171-217, :240-283
- guarda de clube                            apps/api/src/comum/prisma/guarda-clube.ts:4-40 ; guarda-clube.spec.ts:72-110
- clube novo e carga                         apps/api/src/scripts/clube-criar.ts:41-57 ; scripts/carga.ts:51, :348-360 ; carga.spec.ts:117
- quem usa criarClubeBase nos testes         apps/api/src/tarefas/tarefas.spec.ts ; desbravadores/classe-pela-idade.service.spec.ts
- contratos comuns e de material             packages/shared/src/contratos/comum.ts:3-9 ; contratos/materiais.ts:5-22 ; index.ts:30
- permissões                                 packages/shared/src/permissoes.ts:11-48, :57-70 ; permissoes.test.ts:5-7
- varredura de rotas                         apps/api/src/comum/varredura-de-rotas.spec.ts:22-27
- cliente HTTP e envio por XHR (molde)       apps/web/src/api/materiais.ts:1-82 ; api/cliente.ts
- tela de materiais (molde)                  apps/web/src/modulos/materiais/TelaMateriais.tsx:16-22, :78-106, :192-250, :263-270
- cabeçalho de lista do Adm (molde)          apps/web/src/modulos/adm/unidades/ListaUnidades.tsx:26-41
- componentes de ui                          apps/web/src/ui/{Cartao,Botao,Confirmacao,Campo,Selecao,EstadoVazio,MenuCabecalho,BarraProgresso,EstadosDeCarga}.tsx
- pode() na sessão                           apps/web/src/sessao/useSessao.ts:20 ; ProvedorSessao.tsx:349-356
- rotas                                      apps/web/src/rotas.tsx:60-111 ; rotas.test.tsx ; modulos/adm/unidades/rotas.tsx (molde)
- menu do Adm                                apps/web/src/layouts/LayoutAdm.tsx:1, :16-27 ; layouts.test.tsx:153-170
- Inícios                                    apps/web/src/modulos/inicio/InicioConselheiro.tsx:3, :31-36, :164-180 ; modulos/inicio-instrutor/TelaInicioInstrutor.tsx:2, :29-36, :155-188
- handlers MSW                               apps/web/src/testes/handlers/{sessao.ts:10-53,materiais.ts:6-22}
- nginx do container e testes                apps/web/nginx.conf:16, :32-55 ; testes/nginx-host.test.ts:19-21 ; testes/nginx-csp.test.ts:36-43
- nginx do servidor e instalador             scripts/nginx-host.conf:21 ; scripts/instalar.sh:201-205, :259
- conferido em                               6bc7e05
```

## Cobertura da SPEC (autorrevisão)

| SPEC | Pacote |
|---|---|
| Regras 1–3 (clube, quem lê, quem altera) | P0 (permissão, guarda), P1 (decorators, testes de isolamento) |
| Regras 4–8 (PDF, nome, capa, categoria, ordem) | P0 (contrato), P1 |
| Regra 9 (trava e reconferência) | P0 (`travarBiblioteca`), P1, P2 (carga) |
| Regra 10 (remover) | P1 (disco), P2 (rota de arquivos, limpeza) |
| Regra 11 (cota 2 GB) | P1 |
| Regra 12 (links expiram) | P3 (`useBiblioteca`) |
| Decisões: `baixar`, nome do arquivo | P0 (tipo), P2 |
| Decisões: capa em rota própria, troca de capa | P1, P3 |
| Decisões: categorias iniciais | P2 |
| Decisões: nginx do container e do servidor | P2, P5 (README) |
| Decisões: instrutor sem classe; Adm lê onde | P4; P0 (rotas), P3 |
| Dados (migration, `MODELOS_DE_CLUBE`) | P0 |
| Telas e Descobribilidade | P3, P4 |
| Testes que mudam | P0, P1, P2, P4 |
| Documentação | P5 |
| Precisa para funcionar no ar | P5 (corpo da PR) |
| Critério de pronto (medição, QA) | P5 |

## Comando de execução

Cole numa sessão nova, aberta em `/home/robertogabrieu/desbravadores`:

```
Aja como orquestrador (skill `orquestrador`) para implementar a Biblioteca do clube.

ONDE: worktree /home/robertogabrieu/desbravadores/.claude/worktrees/biblioteca, branch
feature/biblioteca (base origin/main 6bc7e05), PR #32 em rascunho. Continue nos três: não crie
branch, worktree nem PR novos. Repo único: pode usar EnterWorktree com esse caminho.

LEIA PRIMEIRO, uma vez: docs/fases/biblioteca/PLANO.md (o plano: pacotes, ondas, testes, ONDE
FICA, comando de cada passo) e docs/fases/biblioteca/SPEC.md. O modelo das telas está em
docs/fases/biblioteca/modelo/ (índice: Main.dc.html) e vence a SPEC no empate.

DECISÕES TRAVADAS (não reabrir): biblioteca por clube; só PDF até 50 MB; capa em rota própria,
até 5 MB; categorias do Adm, três iniciais vindas de criarClubeBase e da carga (nunca de
migration); ordem por "Mover para cima/baixo"; cota própria de 2 GB; remover apaga o arquivo do
disco e não tem restaurar; não há troca de PDF; instrutor sem classe vê só o atalho
"Biblioteca"; biblioteca toda vazia mostra só a mensagem.

FORA DE ESCOPO: ler sem internet, capa gerada do PDF, busca, trocar PDF, biblioteca entre
clubes, acesso de desbravador e pais, varredura de Arquivo órfão.

EXECUÇÃO: P0 inline (você), depois P1 ∥ P2, depois P3 ∥ P4, cada um num `implementador` com
~80 turnos e o recorte de ONDE FICA do pacote; commit por pacote (skill `commit`); P5 na ordem do
plano (revisão antes da suíte). Nenhum subagente roda git; push só pelo `gestor-pr`.

GATE: revisão sem achado médio+ em aberto, suíte verde (CI ou `pesado testar --tudo`), QA do
`qa-runner` sem FALHOU, PR #32 fora do rascunho com `isDraft=false` relido.

REPORTE: o bloco de fechamento do orquestrador (FEITO / SUÍTE / DOCS / PENDÊNCIAS / PR).
```
