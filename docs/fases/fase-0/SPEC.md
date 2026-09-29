# Fase 0 — Fundação · Spec

**Status:** rascunho para revisão · **Branch:** `feature/fase-0-fundacao` · **Base:** `main@3770614`

Esta spec transforma a Fase 0 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas. Quem
implementa **não decide nada que esteja aqui**; o que não estiver aqui e precisar de decisão volta
ao orquestrador. Fontes, em ordem de precedência quando divergirem:

1. esta spec;
2. `docs/planejamento/` (VISAO, ARQUITETURA, MODELO-DE-DADOS, API, BACKLOG);
3. `docs/design/telas/*.dc.html` — **vence na aparência** (layout, textos, cores), nunca na regra.

Do design **não se copia CSS inline**: copia-se estrutura e texto; estilo sai dos tokens (§8).

---

## 1. Entrega da fase

Ao fim da Fase 0 existe, rodando localmente com um comando e pronto para ir ao servidor:

- monorepo com CI verde (lint, tipos, testes, build);
- banco com as tabelas da fundação e a **carga oficial** (classes, requisitos, especialidades,
  critérios de ranking padrão), reexecutável;
- login, convite por e-mail, recuperação de senha, sessão de 30 dias, troca de papel;
- autorização em três camadas (clube, permissão, escopo), com teste de isolamento entre clubes;
- telas: Login, Aceitar convite, Esqueci/Redefinir senha, Escolher papel, **Minha unidade**
  (versão da fundação), e o Adm mínimo: Desbravadores, Unidades, Usuários;
- layouts de celular (barra inferior por papel) e de Adm (menu lateral), com os tokens do design;
- PWA instalável (manifesto, ícones, service worker com o app em cache);
- scripts de deploy, atualização, backup e restauração, testados localmente.

**Fora da Fase 0** (não implementar, nem "de passagem"): chamada, reuniões, ranking calculado,
aulas, cronograma, calendário, fotos, fila offline, relatórios, notificações. As tabelas dessas
funções **não** entram no schema agora — cada fase traz a sua migration.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| D1 | Node **22 LTS** (`.nvmrc` = `22`), npm workspaces | Node 20 saiu de suporte em abr/2026; o Finance roda 20 e será migrado depois |
| D2 | Versões **fixas** (sem `^`) no `package.json`, as mesmas famílias do Finance (§3) | Agente não "atualiza de passagem"; reprodutível |
| D3 | Nomes de domínio em **português** (modelos, campos, rotas, componentes): `Desbravador`, `criadoEm`, `/api/unidades`. Termos técnicos em inglês onde são da ferramenta (`guard`, `hook`, `service`) | Espelha os documentos; evita tradução mental |
| D4 | IDs **UUID v7** gerados no banco (`@default(uuid(7)) @db.Uuid`) | Ordenáveis por criação; compatível com ids gerados no celular nas fases offline |
| D5 | Datas civis (nascimento, reunião) em `@db.Date`; instantes em `timestamptz`; fuso do clube `America/Sao_Paulo` na configuração | Domingo 27/09 não pode virar sábado por fuso |
| D6 | Validação com **zod 4** no pacote `shared`; a API valida com um `ZodValidationPipe` próprio (≈30 linhas), **sem** class-validator | Um contrato só, usado no front e na API |
| D7 | Senha com **argon2id** (pacote `argon2`) | Recomendação atual; o Finance usa bcrypt, aqui começa certo |
| D8 | Access token JWT 15 min, **em memória** no front; refresh token opaco de 30 dias em cookie `httpOnly; Secure; SameSite=Strict; Path=/api/auth`, **hash** no banco, rotação a cada uso e **detecção de reuso** (reuso revoga a família inteira) | ARQUITETURA §3 |
| D9 | Permissão lida do banco a cada requisição (não do token) | Tirar acesso vale na hora |
| D10 | Testes: **Jest** na API (unit + integração contra Postgres real); **Vitest** no `shared` e no `web`; **Playwright** headless para o fluxo ponta a ponta | Jest é o que funciona com Nest sem ajuste; Vitest é o nativo do Vite. Playwright **sempre headless** |
| D11 | **Cada execução de teste de integração cria o próprio banco** (`teste_<pid>_<aleatório>`), aplica as migrations e o apaga no fim | Permite rodar testes em paralelo em worktrees diferentes — é o que viabiliza a paralelização (PLANO §5) |
| D12 | Classes e requisitos **oficiais** são linhas sem `clubeId`, compartilhadas; o que cada clube escolhe sobre eles fica em tabelas de **ajuste** por clube (`ClasseClube`, `RequisitoAjuste`) | Corrige o MODELO-DE-DADOS: `quemMontaCronograma` e `ativo` são escolhas de um clube e não podem viver na linha compartilhada |
| D13 | Carga oficial é um script idempotente (`npm run carga -w api`) que faz *upsert* pela chave natural e **nunca apaga** linha com histórico | Revisão dos requisitos antes do lançamento corrige o JSON e roda a carga de novo |
| D14 | E-mail por SMTP (`nodemailer`); em desenvolvimento, **Mailpit** no compose | Sem conta externa para desenvolver |
| D15 | Front: React 19 + Vite + React Router 7 (modo *data router*, `createBrowserRouter`), TanStack Query 5, react-hook-form + zod, Tailwind 4, componentes shadcn copiados para `web/src/ui` | Igual ao Finance |
| D16 | PWA com `vite-plugin-pwa` em modo **`injectManifest`** (service worker próprio em `web/src/sw.ts`) desde já | A Fase 1 põe a fila offline no service worker; começar em `generateSW` obrigaria a migrar |
| D17 | API REST com prefixo `/api`; erro sempre `{ codigo, mensagem, campos? }` com mensagem em português pronta para a tela | API.md |
| D18 | Zero `any`. `unknown` + type guard, ou generic. Lint barra | Regra do projeto |
| D19 | Cor das classes: regulares com os tokens `--classe-*`; **avançada usa a cor da sua regular**; **Agrupadas** usam `--color-primary` | tokens.css só define as 6 regulares |
| D20 | Uma migration por fase, nomeada `AAAAMMDDHHMM_fase0_fundacao`; alterações futuras em migrations novas | Histórico legível |

## 3. Stack e versões

Regra: **a versão instalada no lock do Finance** (`desbravadores-finance@c7d82a5`, conferida com
`npm ls`). Pacote que o Finance não usa: a última versão estável no dia da onda 0, fixada sem `^` e
anotada aqui pelo orquestrador.

| Pacote | Versão | Pacote | Versão |
|---|---|---|---|
| prisma, @prisma/client, @prisma/adapter-pg | 7.5.0 | react, react-dom | 19.2.4 |
| @nestjs/core, /common, /platform-express | 11.1.17 | vite | 6.4.1 |
| typescript | 5.9.3 | vite-plugin-pwa | 1.3.0 |
| jest | 30.3.0 | zod | 4.3.6 |
| react-router-dom, @tanstack/react-query, tailwindcss, react-hook-form, lucide-react, sonner | as do lock do Finance | argon2, dexie (fase 1), vitest, @playwright/test, nodemailer | última estável, fixada na onda 0 |

Diferenças **deliberadas** em relação ao Finance (não "corrigir" para ficar igual): refresh com
rotação e detecção de reuso (lá não rotaciona); access token em memória (lá fica em
`localStorage`, exposto a XSS); guards globais com `@Publica()` (lá são por controller); banco de
teste por execução (lá é fixo e colide entre execuções simultâneas); argon2 (lá é bcrypt).

## 4. Estrutura do repositório

```
desbravadores/
├── package.json                 # workspaces: apps/*, packages/*; scripts raiz (dev, lint, tipos, teste, build)
├── .nvmrc  .editorconfig  .gitignore  .env.exemplo
├── CLAUDE.md                    # regras que mordem em silêncio (§12)
├── eslint.config.mjs            # config única do monorepo
├── tsconfig.base.json
├── docker-compose.yml           # dev: postgres, mailpit
├── docker-compose.prod.yml      # prod: postgres, api, web (nginx)
├── scripts/                     # deploy.sh, atualizar.sh, backup.sh, restaurar.sh
├── .github/workflows/ci.yml
├── packages/shared/
│   └── src/
│       ├── index.ts
│       ├── enums.ts             # papéis, tipos, trilhas… (espelham os enums do Prisma)
│       ├── permissoes.ts        # catálogo + padrões por papel (§6)
│       ├── contratos/           # schemas zod por módulo: auth.ts, eu.ts, desbravadores.ts, unidades.ts, usuarios.ts, classes.ts
│       ├── formulas/            # funções puras (§7) + *.test.ts
│       └── datas.ts             # anoClube(), idade(), hojeNoFuso()
├── apps/api/
│   ├── prisma/schema.prisma  prisma/migrations/  prisma.config.ts
│   ├── carga/                   # script da carga oficial (§5.3)
│   ├── test/                    # integração: setup de banco próprio (D11), fábricas
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── comum/               # prisma (+ guarda de clube), pipes, filtro de erro, decorators, guards
│       ├── auth/  clubes/  usuarios/  desbravadores/  unidades/  classes/  email/  saude/
└── apps/web/
    ├── index.html  vite.config.ts
    └── src/
        ├── main.tsx  sw.ts  rotas.tsx     # rotas.tsx é arquivo de dono compartilhado
        ├── ui/                  # shadcn + tokens
        ├── layouts/             # LayoutCelular, LayoutAdm
        ├── api/                 # cliente HTTP, refresh, hooks do TanStack Query
        ├── sessao/              # contexto de sessão, papel ativo, guarda de rota
        └── modulos/             # auth/, unidade/, adm/
```

## 5. Banco de dados

### 5.1 Schema da fundação

O schema abaixo é o **contrato**. Os enums, nomes e restrições não mudam na implementação.

```prisma
generator client { provider = "prisma-client"  output = "../src/generated/prisma" }
datasource db   { provider = "postgresql" }

enum Papel            { ADM CONSELHEIRO INSTRUTOR }
enum StatusUsuario    { CONVIDADO ATIVO INATIVO }
enum Sexo             { F M }
enum TipoPessoa       { DBV LIDER }
enum TipoUnidade      { MISTA MASCULINA FEMININA }
enum TipoClasse       { REGULAR AVANCADA }
enum Trilha           { INDIVIDUAL AGRUPADAS }
enum Origem           { OFICIAL CLUBE }
enum QuemMonta        { ADM INSTRUTOR }
enum StatusMatricula  { CURSANDO CONCLUIDA INVESTIDA DESISTIU }
enum PeriodoRanking   { MES TRIMESTRE ANO }
enum GatilhoCriterio  { PRESENCA PONTUALIDADE UNIFORME BIBLIA LICAO REQUISITO ESPECIALIDADE MANUAL }

model Clube {
  id           String   @id @default(uuid(7)) @db.Uuid
  nome         String
  slug         String   @unique              // usado na URL do ranking público (Fase 4)
  cidade       String?
  igreja       String?
  associacao   String?
  criadoEm     DateTime @default(now()) @db.Timestamptz
  atualizadoEm DateTime @updatedAt @db.Timestamptz
  configuracao ConfiguracaoClube?
  // relações omitidas aqui por brevidade; o Prisma exige os dois lados
}

model ConfiguracaoClube {
  clubeId                String         @id @db.Uuid
  fuso                   String         @default("America/Sao_Paulo")
  diaReuniao             Int            @default(0)      // 0 = domingo
  horaReuniao            String         @default("09:00")
  localReuniaoPadrao     String?
  inicioAnoClube         String         @default("02-01") // MM-DD
  limiarFrequenciaAlerta Int            @default(70)
  limiarProgressoAlerta  Int            @default(40)
  metaFrequencia         Int            @default(80)
  rankingPeriodo         PeriodoRanking @default(MES)
  rankingNoLogin         Boolean        @default(true)
  rankingPorUnidade      Boolean        @default(true)
  descontarFalta         Boolean        @default(false)
  pontosDescontoFalta    Int            @default(0)
}

model Usuario {
  id             String        @id @default(uuid(7)) @db.Uuid
  nome           String
  email          String        @unique            // gravado em minúsculas, sem espaços
  senhaHash      String?
  genero         Sexo?
  status         StatusUsuario @default(CONVIDADO)
  ultimoAcessoEm DateTime?     @db.Timestamptz
  criadoEm       DateTime      @default(now()) @db.Timestamptz
  atualizadoEm   DateTime      @updatedAt @db.Timestamptz
}

model Vinculo {
  id        String  @id @default(uuid(7)) @db.Uuid
  usuarioId String  @db.Uuid
  clubeId   String  @db.Uuid
  papel     Papel
  ativo     Boolean @default(true)
  @@unique([usuarioId, clubeId, papel])
  @@index([clubeId])
}

model VinculoUnidade { vinculoId String @db.Uuid  unidadeId String @db.Uuid  @@id([vinculoId, unidadeId]) }
model VinculoClasse  { vinculoId String @db.Uuid  classeId  String @db.Uuid  @@id([vinculoId, classeId]) }

model PermissaoAjuste {
  vinculoId String  @db.Uuid
  permissao String                      // valor do catálogo em shared/permissoes.ts
  concedida Boolean
  @@id([vinculoId, permissao])
}

model TokenUsoUnico {                   // convite e redefinição de senha
  id        String    @id @default(uuid(7)) @db.Uuid
  usuarioId String    @db.Uuid
  finalidade String                     // "CONVITE" | "SENHA"
  tokenHash String    @unique
  expiraEm  DateTime  @db.Timestamptz
  usadoEm   DateTime? @db.Timestamptz
  criadoEm  DateTime  @default(now()) @db.Timestamptz
}

model RefreshToken {
  id         String    @id @default(uuid(7)) @db.Uuid
  usuarioId  String    @db.Uuid
  familia    String    @db.Uuid           // todos os tokens de uma mesma sessão
  tokenHash  String    @unique
  expiraEm   DateTime  @db.Timestamptz
  usadoEm    DateTime? @db.Timestamptz    // rotação: usado uma vez, depois só reuso (ataque)
  revogadoEm DateTime? @db.Timestamptz
  aparelho   String?
  criadoEm   DateTime  @default(now()) @db.Timestamptz
  @@index([familia])
}

model Desbravador {
  id                  String     @id @default(uuid(7)) @db.Uuid
  clubeId             String     @db.Uuid
  nome                String
  nomePublico         String                      // "Ana C.", calculado no cadastro, editável
  tipo                TipoPessoa @default(DBV)
  usuarioId           String?    @db.Uuid
  nascimento          DateTime   @db.Date
  sexo                Sexo
  responsavelNome     String?
  responsavelTelefone String?
  responsavelEmail    String?
  autorizacaoImagem   Boolean    @default(false)
  autorizacaoImagemEm DateTime?  @db.Date
  ativo               Boolean    @default(true)
  entradaEm           DateTime   @db.Date
  saidaEm             DateTime?  @db.Date
  criadoEm            DateTime   @default(now()) @db.Timestamptz
  atualizadoEm        DateTime   @updatedAt @db.Timestamptz
  @@index([clubeId, ativo])
}

model Unidade {
  id            String      @id @default(uuid(7)) @db.Uuid
  clubeId       String      @db.Uuid
  nome          String
  tipo          TipoUnidade @default(MISTA)
  gritoDeGuerra String?
  ativa         Boolean     @default(true)
  @@unique([clubeId, nome])
}

model MembroUnidade {
  id        String    @id @default(uuid(7)) @db.Uuid
  clubeId   String    @db.Uuid
  dbvId     String    @db.Uuid
  unidadeId String    @db.Uuid
  inicio    DateTime  @db.Date
  fim       DateTime? @db.Date
  @@index([unidadeId, fim])
  // + índice único parcial na migration: UNIQUE (dbvId) WHERE fim IS NULL
}

model Classe {
  id            String     @id @default(uuid(7)) @db.Uuid
  clubeId       String?    @db.Uuid         // nulo = OFICIAL
  origem        Origem
  nome          String
  idade         Int?
  tipo          TipoClasse
  trilha        Trilha
  classeBaseId  String?    @db.Uuid         // avançada → regular da mesma trilha
  ordem         Int
  // + índice único parcial: UNIQUE (nome, trilha) WHERE clubeId IS NULL
}

model ClasseClube {                         // D12: o que o clube escolhe sobre uma classe
  clubeId             String    @db.Uuid
  classeId            String    @db.Uuid
  ativa               Boolean   @default(true)
  quemMontaCronograma QuemMonta @default(ADM)
  @@id([clubeId, classeId])
}

model SecaoRequisito {
  id       String @id @default(uuid(7)) @db.Uuid
  classeId String @db.Uuid
  codigo   String                              // "G", "DE", "AV", "AN"…
  nome     String
  ordem    Int
  @@unique([classeId, codigo])
}

model Requisito {
  id        String  @id @default(uuid(7)) @db.Uuid
  secaoId   String  @db.Uuid
  codigo    String                             // "DE1"
  texto     String
  campo     Boolean @default(false)
  ordem     Int
  pagina    Int?                               // página do PDF de origem, para conferência
  ativo     Boolean @default(true)             // desativado pela carga (saiu do caderno)
  @@unique([secaoId, codigo])
}

model RequisitoAjuste {                      // D12
  clubeId     String   @db.Uuid
  requisitoId String   @db.Uuid
  ativo       Boolean?                       // nulo = segue o oficial
  campo       Boolean?
  @@id([clubeId, requisitoId])
}

model AreaEspecialidade {
  id     String @id @default(uuid(7)) @db.Uuid
  codigo String @unique                        // "AD", "HM"…
  nome   String
  ordem  Int
}

model Especialidade {
  id      String  @id @default(uuid(7)) @db.Uuid
  clubeId String? @db.Uuid                     // nulo = OFICIAL
  origem  Origem
  areaId  String  @db.Uuid
  nome    String
  ativa   Boolean @default(true)
  // + índice único parcial: UNIQUE (areaId, nome) WHERE clubeId IS NULL
}

model Mestrado { id String @id @default(uuid(7)) @db.Uuid  nome String @unique }

model MatriculaClasse {
  id          String          @id @default(uuid(7)) @db.Uuid
  clubeId     String          @db.Uuid
  dbvId       String          @db.Uuid
  classeId    String          @db.Uuid
  anoClube    Int
  status      StatusMatricula @default(CURSANDO)
  investidaEm DateTime?       @db.Date
  @@unique([dbvId, classeId, anoClube])
}

model CriterioRanking {
  id         String          @id @default(uuid(7)) @db.Uuid
  clubeId    String          @db.Uuid
  nome       String
  descricao  String?
  pontos     Int
  ativo      Boolean         @default(true)
  ordem      Int
  gatilho    GatilhoCriterio
  lancadoPor Papel
  padrao     Boolean         @default(false)
}
```

Todas as chaves estrangeiras são declaradas como relações Prisma com `onDelete: Restrict`
(nada com histórico some em cascata). Os três índices únicos parciais marcados com `+` são
escritos à mão no SQL da migration.

**Modelos "de clube"** (a guarda de clube exige `clubeId` em toda consulta de lista):
`Desbravador, Unidade, MembroUnidade, Vinculo, MatriculaClasse, CriterioRanking, ClasseClube,
RequisitoAjuste`. `Classe` e `Especialidade` são **mistos**: a consulta deve filtrar
`OR: [{ clubeId: null }, { clubeId }]` — a guarda aceita esse formato.

### 5.2 Criar um clube

`POST /api/clubes` não existe na Fase 0. O primeiro clube e o primeiro Adm nascem por script:
`npm run clube:criar -w api -- --nome "..." --slug "..." --adm-nome "..." --adm-email "..."`.
O script, numa transação: cria `Clube` e `ConfiguracaoClube`; cria `ClasseClube` para cada classe
oficial; cria os 8 `CriterioRanking` padrão (§5.4); cria o usuário Adm (ou reaproveita pelo
e-mail) com `Vinculo` ADM; gera o convite e imprime o link no terminal **e** envia o e-mail.

### 5.3 Carga oficial

`npm run carga -w api` lê `docs/planejamento/dados/cadernos/*.json` e
`docs/planejamento/dados/especialidades.json` e, numa transação:

- **Classe**: chave `(nome, trilha)` entre as oficiais. Upsert de idade, tipo, ordem.
  `classeBaseId` resolvido pelo nome em `classeBase`, na mesma trilha. `ordem` = ordem do arquivo
  (amigo, companheiro, pesquisador, pioneiro, excursionista, guia, agrupadas) × posição.
- **SecaoRequisito**: chave `(classeId, codigo)`; upsert de nome e ordem.
- **Requisito**: chave `(secaoId, codigo)`; upsert de texto, campo, ordem, pagina, `ativo=true`.
  Requisito que existe no banco e **sumiu** do JSON: `ativo=false` (nunca apagar).
- **AreaEspecialidade** por `codigo`; **Especialidade** oficial por `(areaId, nome)`; **Mestrado**
  por `nome`. Sumiu do JSON: `ativa=false`.
- Para cada clube existente, cria o `ClasseClube` que faltar.
- Imprime um resumo: criados / atualizados / desativados por tipo.

Rodar duas vezes seguidas **não muda nada** na segunda (teste obrigatório).

### 5.4 Critérios padrão do ranking

| nome | pontos | ativo | gatilho | lancadoPor | ordem |
|---|---|---|---|---|---|
| Presença | 10 | sim | PRESENCA | CONSELHEIRO | 1 |
| Pontualidade | 5 | sim | PONTUALIDADE | CONSELHEIRO | 2 |
| Uniforme completo | 5 | sim | UNIFORME | CONSELHEIRO | 3 |
| Bíblia | 3 | sim | BIBLIA | CONSELHEIRO | 4 |
| Lição/devocional | 3 | **não** | LICAO | CONSELHEIRO | 5 |
| Requisito concluído | 4 | sim | REQUISITO | INSTRUTOR | 6 |
| Especialidade concluída | 15 | sim | ESPECIALIDADE | INSTRUTOR | 7 |
| Participação em evento | 20 | sim | MANUAL | ADM | 8 |

Todos com `padrao=true`.

## 6. Autorização

### 6.1 Catálogo de permissões (`packages/shared/src/permissoes.ts`)

Constante única, tipada (`as const`), com o padrão por papel. **É a tabela de API.md §"Catálogo de
permissões"**, com uma correção: `cronograma.montar` não existe (a trava é `ClasseClube`, D12).

```ts
export const PERMISSOES = {
  'dbv.ver':               { ADM: true, CONSELHEIRO: true,  INSTRUTOR: true },
  'dbv.ver_contato':       { ADM: true, CONSELHEIRO: true,  INSTRUTOR: false },
  'dbv.editar':            { ADM: true, CONSELHEIRO: false /* desligada */ },
  'dbv.cadastrar':         { ADM: true },
  'reuniao.registrar':     { ADM: true, CONSELHEIRO: true },
  'reuniao.ver':           { ADM: true, CONSELHEIRO: true },
  'foto.enviar':           { ADM: true, CONSELHEIRO: true },
  'foto.ver':              { ADM: true, CONSELHEIRO: true },
  'relatorio.unidade':     { ADM: true, CONSELHEIRO: false },
  'aula.registrar':        { ADM: true, INSTRUTOR: true },
  'requisito.marcar':      { ADM: true, INSTRUTOR: true },
  'material.enviar':       { ADM: true, INSTRUTOR: true },
  'classe.ver_relatorio':  { ADM: true, INSTRUTOR: true },
  'observacao.ver_outros': { ADM: true, INSTRUTOR: false },
  'ranking.lancar_manual': { ADM: true },
  'usuario.gerenciar':     { ADM: true },
  'unidade.gerenciar':     { ADM: true },
  'classe.gerenciar':      { ADM: true },
  'calendario.gerenciar':  { ADM: true },
  'ranking.configurar':    { ADM: true },
  'relatorio.geral':       { ADM: true },
  'clube.configurar':      { ADM: true },
} as const
```

Leitura: chave ausente para o papel = **não se aplica** (não aparece na tela de permissões); `false`
= existe e começa desligada; `true` = começa ligada. O papel ADM é sempre `true` em tudo e **não
aceita** `PermissaoAjuste` (a API recusa com 422).

`permissoesEfetivas(papel, ajustes)` é função pura em `shared`, com teste.

### 6.2 As três camadas na API

1. **`GuardaSessao`** (global): valida o access token; injeta `req.sessao = { usuarioId, clubeId,
   vinculoId, papel }`. Rotas públicas marcadas com `@Publica()`.
2. **`GuardaPermissao`**: `@Pode('dbv.cadastrar')` na rota. Lê do banco o `Vinculo` (ativo) e os
   `PermissaoAjuste` a cada requisição e calcula com `permissoesEfetivas`. Vínculo inativo ou
   usuário `INATIVO` → 401.
3. **Escopo**: o serviço recebe a sessão e aplica o recorte — conselheiro só enxerga
   `Desbravador`/`Unidade` das unidades do seu `VinculoUnidade`; instrutor, dos DBVs matriculados
   nas classes do seu `VinculoClasse` no ano do clube. Recurso fora do escopo responde **404** (não
   403: não confirmar que existe).

**Toda rota não pública tem `@Pode(...)`.** Um teste percorre as rotas registradas no Nest e falha
se alguma não tiver (§11).

### 6.3 Guarda de clube no Prisma

Extensão do client (`Prisma.defineExtension` com `query.$allModels.$allOperations`, aplicada no
construtor do `PrismaService`) que, para os modelos de clube (§5.1), **lança `ErroEscopoClube`** em
`findMany, findFirst, findFirstOrThrow, count, aggregate, groupBy, updateMany, deleteMany` quando o
`where` não tem:
- `clubeId` (no nível de cima ou dentro de `AND`), **ou**
- uma chave que já isola uma linha, declarada por modelo em `CHAVES_DE_LINHA` (ex.: `id`;
  `MembroUnidade.dbvId`; `MatriculaClasse.dbvId`).

Para os modelos **mistos** (`Classe`, `Especialidade`), aceita também exatamente
`OR: [{ clubeId: null }, { clubeId: <valor> }]` no nível de cima — e nenhum outro `OR`.
`create, update, delete, upsert, findUnique` não passam pela guarda.

É asserção, não preenchimento: o serviço sempre filtra explicitamente. **`include` aninhado não
dispara a extensão no Prisma 7** — o isolamento de relações aninhadas é garantido só pela suíte de
isolamento (§11). A lista de modelos de clube é uma constante única; modelo novo com `clubeId`
entra nela na mesma migration.

## 7. Fórmulas do `shared` (com os casos que viram teste)

Todas puras, sem acesso a banco, exportadas de `packages/shared/src/formulas/`.

**`pontosDaChamada(marcacao, criterios)`** — critérios ativos por gatilho.
| Marcação | Critérios padrão | Resultado |
|---|---|---|
| presente, não atrasou, uniforme, Bíblia | padrão | 23 |
| presente, atrasou, sem uniforme, sem Bíblia | padrão | 10 |
| falta | padrão, `descontarFalta=false` | 0 |
| falta | `descontarFalta=true`, `pontosDescontoFalta=2` | −2 |
| falta justificada | `descontarFalta=true` | 0 |
| presente, Lição marcada | LICAO desligado | Lição não soma |
| presente, Lição marcada | LICAO ligado (3) | +3 |

**`percentualClasse(concluidos, total)`** → número 0–100 sem arredondar; `total=0` → 0.
**`mediaTurma(percentuais[])`** → média dos exatos, arredondada só no fim (`Math.round`); `[]` → 0.
Caso: `[33.33, 66.67, 100]` → 67.
**`prontoParaInvestidura(percentualRegular)`** → `=== 100`.
**`frequencia(situacoes[])`** → PRESENTE e ATRASADO contam; FALTA e FALTA_JUSTIFICADA não;
`[]` → `null` (tela mostra "—"). Caso: `[P, A, F, J]` → 50.
**`anoClube(data, inicioAnoClube)`**: `inicio="02-01"`, 15/01/2027 → 2026; 01/02/2027 → 2027.
**`idade(nascimento, hoje)`**: aniversário hoje conta; 29/02 em ano não bissexto faz aniversário em 01/03.
**`nomePublico(nome)`**: primeiro nome + inicial do último sobrenome com ponto.
"Ana Clara Souza" → "Ana S."; "Pedro" → "Pedro"; ignora "da/de/do/das/dos" ao escolher o sobrenome:
"João da Silva" → "João S.".
**`bloqueiaData`** e demais fórmulas de calendário/ranking **não** entram nesta fase.

## 8. Front

### 8.1 Tokens e componentes

`docs/design/tokens.css` vira `apps/web/src/ui/tokens.css` **sem alterar valores**, importado uma
vez; o tema do Tailwind 4 (`@theme`) mapeia para essas variáveis. Fontes Bricolage Grotesque e
Figtree pelo Google Fonts. Ícones `lucide-react`. Alvo de toque ≥ 44 px; input com 16 px no
celular. Sem dark mode.

### 8.2 Rotas da Fase 0 (`apps/web/src/rotas.tsx`, arquivo do orquestrador)

| Rota | Tela | Referência de design | Quem vê |
|---|---|---|---|
| `/login` | Login | `Main.dc.html` **sem** o seletor de perfil | público |
| `/convite/:token` | Definir senha | padrão do Login | público |
| `/senha/esqueci`, `/senha/redefinir/:token` | Recuperar senha | padrão do Login | público |
| `/papel` | Escolher papel | padrão do Login (lista de cartões) | logado com 2+ vínculos |
| `/inicio` | Início por papel — **provisório**: saudação, papel, e um cartão "Em construção" com o link para o que já existe | `Inicio-*.dc.html` só o cabeçalho | logado |
| `/unidade` | Minha unidade — lista, busca, classe e idade; **sem frequência** (vem na Fase 1) | `Minha-Unidade.dc.html` | conselheiro |
| `/adm/desbravadores` | Tabela + painel lateral (A1) | `Adm-Desbravadores.dc.html` | Adm |
| `/adm/unidades` | Cartões + mover membros (A3) | `Adm-Unidades.dc.html` | Adm |
| `/adm/usuarios` | Tabela + painel por papel + convite (A2) | `Adm-Usuarios.dc.html` | Adm |

A barra inferior mostra os quatro itens do papel; os que ainda não existem aparecem **desabilitados**
com a etiqueta "em breve", sem rota.

### 8.3 Sessão no front

Access token só em memória (módulo `api/`), nunca em `localStorage`. Ao abrir o app, chama
`POST /api/auth/refresh` (o cookie vai sozinho); 401 → `/login`. O cliente HTTP tenta um refresh
em 401 e repete a requisição **uma vez**; requisições simultâneas compartilham o mesmo refresh.
Papel ativo guardado em `localStorage` (`papelAtivo`), validado contra `GET /api/eu`.

### 8.4 PWA

Manifesto: nome "Desbravador", `display: standalone`, cor de tema `#1F4D3A`, fundo `#F4F1EA`,
ícones 192/512 e *maskable* (gerados a partir de um SVG simples com a inicial "D" no verde-mata).
Service worker (`injectManifest`): *precache* do app; navegação cai no `index.html`; **nada de
cache de `/api`** nesta fase. Instalação: botão "Instalar app" no Início quando o navegador oferece
o evento; no iPhone, a instrução "Compartilhar → Adicionar à Tela de Início", mostrada uma vez.

## 9. API da Fase 0

Subconjunto de API.md, com os contratos em `packages/shared/src/contratos/`:

| Método e rota | Contrato (zod) | Permissão |
|---|---|---|
| `POST /api/auth/login` | `LoginEntrada {email, senha}` → `SessaoSaida {accessToken, vinculos[]}` | público, limite 5/min por IP+e-mail |
| `POST /api/auth/refresh` | — → `SessaoSaida` | cookie |
| `POST /api/auth/logout` | — → 204 | logado |
| `POST /api/auth/convite/aceitar` | `{token, senha}` → `SessaoSaida` | público |
| `POST /api/auth/senha/esqueci` | `{email}` → 204 sempre | público, limite 3/h por e-mail |
| `POST /api/auth/senha/redefinir` | `{token, senha}` → 204; revoga todos os refresh do usuário | público |
| `GET /api/eu` | → `EuSaida {usuario, vinculos[{id, clube, papel, unidades[], classes[]}], permissoes[]}` | logado |
| `POST /api/eu/papel-ativo` | `{vinculoId}` → `SessaoSaida` | logado |
| `GET/POST/PATCH /api/desbravadores[/:id]` | `DesbravadorEntrada`, `DesbravadorSaida` | `dbv.ver` / `dbv.cadastrar` / `dbv.editar` + escopo |
| `POST /api/desbravadores/:id/inativar` | `{saidaEm}` | `dbv.cadastrar` |
| `PUT /api/desbravadores/:id/unidade` | `{unidadeId \| null, desde}` | `unidade.gerenciar` |
| `POST /api/desbravadores/:id/matriculas` | `{classeId, anoClube}` — regular cria também a avançada ligada | `classe.gerenciar` |
| `GET/POST/PATCH /api/unidades[/:id]`, `GET /api/unidades/:id/membros`, `GET /api/unidades/sem-membros` | — | ver API.md |
| `GET/POST/PATCH /api/usuarios[/:id]`, `POST /api/usuarios/:id/convite`, `PUT /api/vinculos/:id` | `UsuarioEntrada` com `vinculos[]` | `usuario.gerenciar` |
| `GET /api/permissoes/catalogo` | → catálogo + padrões | `usuario.gerenciar` |
| `GET /api/classes?trilha=&tipo=`, `GET /api/classes/:id` | com `ativa` e `quemMonta` do `ClasseClube` e requisitos com ajuste aplicado | logado |
| `GET /api/especialidades?areaId=&busca=` | — | logado |
| `GET /api/saude` | → `{ok, versao, banco}` | público |

Senha: mínimo 8 caracteres, sem outras regras. E-mail normalizado (minúsculas, trim) na entrada.
Convite: 7 dias. Redefinição: 1 hora. Tokens de uso único: 32 bytes aleatórios em base64url,
guardados só como SHA-256.

Validação de cadastro de DBV: nome obrigatório; nascimento entre 6 e 99 anos atrás; `nomePublico`
calculado se vier vazio; aviso (não erro) quando unidade é MASCULINA/FEMININA e o sexo não bate,
e quando a idade não corresponde à classe — os avisos vêm em `avisos[]` na resposta, a tela os
mostra, o cadastro é salvo.

## 10. Deploy e backup

- `docker-compose.prod.yml`: `postgres:17-alpine` (volume nomeado), `api` (Node 22, roda
  `prisma migrate deploy` e depois o servidor), `web` (nginx servindo o build e fazendo proxy de
  `/api` para `api`). Limites de memória: api 256 MB, postgres 256 MB. Porta externa só a do
  `web`, **em bloco próprio de portas** combinado com o que o VPS já usa.
- HTTPS pelo nginx do host com Let's Encrypt, como no Finance (ONDE FICA).
- `scripts/deploy.sh` (primeira vez: cria `.env` a partir do exemplo, sobe tudo, roda a carga),
  `scripts/atualizar.sh` (pull, build, up, migrate, carga), `scripts/backup.sh` (`pg_dump` →
  gzip → `age` com chave pública → `rclone copy` para o remoto configurado; mantém 30 dias),
  `scripts/restaurar.sh` (o inverso, num banco novo).
- Tudo testável localmente: o remoto do `rclone` em desenvolvimento é uma pasta local.

**O que depende do dono (não é portão da fase, é passo de ida ao ar):** VPS com folga, subdomínio
com DNS, conta SMTP (Brevo ou Resend) e bucket R2. Sem eles a Fase 0 termina pronta para subir; a
subida é um comando (`scripts/deploy.sh`) que o dono roda quando tiver os acessos.

## 11. Testes obrigatórios (escritos antes da implementação)

| Área | Teste | Tipo |
|---|---|---|
| shared | Todas as tabelas de caso do §7 e `permissoesEfetivas` | Vitest |
| carga | Rodar duas vezes: a segunda não cria nem altera nada; requisito removido do JSON vira `ativo=false`; contagens batem com `dados/cadernos/LEIA-ME.md` | Jest integração |
| guarda de clube | Cada operação de lista de cada modelo de clube sem `clubeId` lança | Jest unit |
| isolamento | Usuário do clube A não lê, lista, altera nem descobre (404) nada do clube B, em todas as rotas da fase | Jest integração |
| permissões | Toda rota não pública tem `@Pode`; conselheiro recebe 403 em `/api/adm`-equivalentes; permissão desligada nega; ajuste liga | Jest integração |
| escopo | Conselheiro só lista DBVs das suas unidades; recurso de outra unidade → 404 | Jest integração |
| auth | login certo/errado (mensagem única); refresh rota; reuso de refresh revoga a família; convite vencido; redefinir revoga sessões; usuário inativado perde acesso na próxima requisição | Jest integração |
| matrícula | Matricular na regular cria a da avançada ligada; na avançada sozinha não cria a regular | Jest integração |
| front | Login, papel, Minha unidade e cadastro de DBV renderizam e validam (componentes) | Vitest + Testing Library |
| ponta a ponta | Convite → definir senha → instalar não verificável → login → Minha unidade mostra só a própria unidade | Playwright headless |

## 12. CLAUDE.md do repositório (conteúdo mínimo)

Escrito pelo orquestrador na onda 0, curto, só o que morde em silêncio:
- zero `any`; contratos só em `packages/shared`, nunca duplicados na API ou no front;
- toda consulta de modelo de clube filtra `clubeId` — a guarda lança, mas não preenche;
- toda rota não pública tem `@Pode`; recurso fora do escopo é 404;
- classes/requisitos oficiais não têm `clubeId`; escolha do clube vai em `ClasseClube`/`RequisitoAjuste`;
- nunca apagar linha com histórico: desativar;
- testes de integração criam banco próprio — não rodar contra o banco de desenvolvimento;
- Playwright sempre headless;
- do design não se copia CSS inline.

## 13. O que NÃO quebra

Repositório novo: não há código anterior. Os documentos de `docs/planejamento/` e `docs/design/`
**não são alterados** nesta fase, exceto a correção D12 registrada em MODELO-DE-DADOS §3 pelo
orquestrador ao fim.

---

## ONDE FICA

Padrões do Finance a **consultar** (não copiar às cegas — ver as diferenças deliberadas no §3):

- config do Prisma 7 (URL no config, não no schema)    `desbravadores-finance/web/backend/prisma.config.ts:1-11`
- generator `prisma-client` e output em `src/generated` `desbravadores-finance/web/backend/prisma/schema.prisma:1-9`
- PrismaService com adapter-pg e `$extends` no construtor (precisa do cast `as unknown as`)  `desbravadores-finance/web/backend/src/prisma/prisma.service.ts:1-27`
- guarda de clube (lista de modelos, chaves de linha, operações)  `desbravadores-finance/web/backend/src/prisma/tenant-guard.ts:9-49` e o teste `tenant-guard.spec.ts`
- emissão de tokens e hash SHA-256 do refresh           `desbravadores-finance/web/backend/src/modules/auth/auth.service.ts:107-135,304-364`
- cookie do refresh                                     `desbravadores-finance/web/backend/src/modules/auth/auth.controller.ts:154-160`
- guard de permissão lendo do banco a cada requisição   `desbravadores-finance/web/backend/src/common/guards/permissions.guard.ts:15-65`
- app de teste com AppModule real e e-mail mockado      `desbravadores-finance/web/backend/test/setup.ts` (`createTestApp`)
- PWA: manifest, denylist de `/api/` no fallback        `desbravadores-finance/web/frontend/vite.config.ts:9-58`
- cliente HTTP com fila de refresh em 401               `desbravadores-finance/web/frontend/src/lib/api.ts:33-75`
- nginx do front (não cachear `sw.js`/`index.html`)     `desbravadores-finance/web/frontend/nginx.conf`
- deploy/atualização com segredos gerados por `openssl` `desbravadores-finance/deploy.sh`, `update.sh`
- HTTPS: proxy externo ao repo; backend com `trust proxy` `desbravadores-finance/web/backend/src/main.ts:26`
- conferido em                                          `desbravadores-finance@c7d82a5`

Deste repositório:

- dados da carga — cadernos                  `docs/planejamento/dados/cadernos/*.json` (tipo, trilha, classeBase, secoes, requisitos)
- dados da carga — especialidades            `docs/planejamento/dados/especialidades.json` (areas[].codigo, especialidades[], mestrados[])
- regras das telas                           `docs/planejamento/BACKLOG.md` (F1–F4, C2, A1–A3)
- tokens visuais                             `docs/design/tokens.css`
- conferido em                               `desbravadores@3770614`
