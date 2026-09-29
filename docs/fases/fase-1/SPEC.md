# Fase 1 — Conselheiro · Spec

**Status:** revisada em duas rodadas (fatos contra o código, desenho/offline/segurança, completude; depois contradições) ·
**Branch:** `feature/fase-1-conselheiro` · **Base:** `main@3de43f2`

Transforma a Fase 1 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas. Quem
implementa **não decide nada que esteja aqui**; lacuna volta ao orquestrador em PENDÊNCIAS.

**Precedência:** (1) esta spec e seus anexos; (2) a [spec da Fase 0](../fase-0/SPEC.md), que
continua valendo (D1–D24) onde esta não a altera; (3) `docs/planejamento/`;
(4) `docs/design/telas/*.dc.html` — vence na aparência, nunca na regra. Do design não se copia
CSS inline. **O código da `main` é a verdade** sobre o que já existe; o ONDE FICA aponta.

**Anexos — contrato literal:**
- [`anexos/schema.prisma`](anexos/schema.prisma) — schema completo (Fase 0 + Fase 1; blocos novos
  marcados `// FASE 1`). Validado com `prisma validate` 7.5.0. A migration gerada contra o schema da
  `main` **não tem DROP**: cria as tabelas novas e acrescenta relações, `@@unique([clubeId, id])` e
  um índice único parcial (um critério padrão por gatilho) em `CriterioRanking`. São **3** índices
  parciais novos no total (esse e dois em `LancamentoPontos`).
- [`anexos/contratos.ts`](anexos/contratos.ts) — contratos novos, conferidos com `tsc --strict`
  contra o `packages/shared` real.

---

## 1. Entrega

Duas PRs, nesta ordem:

**1a · Núcleo offline** — o que as Fases 1, 2 e 3 usam: o schema inteiro da Fase 1; o app **abre
sem internet**; banco local (Dexie); **fila de envio** genérica; pacote do domingo
(`GET /sync/pacote`); `ServicoPontos`; armazenamento de arquivos com URL assinada; faixa "Sem
conexão", selo da fila e a tela `/fila` (C9); confirmação ao sair; componentes de UI que faltam.

**1b · O domingo do conselheiro** — chamada online e offline (C3, C4), correção com registro
(C6b), histórico e detalhe (C5, C5b, C6), Início (C1), Minha unidade com frequência (C2), perfil do
DBV sem progresso de classe (T3 parcial), ranking do mês (T1 parcial), galeria e envio de fotos
(C7, C8), estados vazios do conselheiro (C10: galeria, unidade, reuniões) e pedido ao Adm.

**Fora da Fase 1** (nem "de passagem"): tudo do instrutor (Fase 2); calendário, cronograma,
notificações/sino (Fase 3); ranking por trimestre/ano, variação de posição, configuração do
ranking, lançamento manual, ranking público (Fase 4); telas de reunião e galeria no computador;
marcar quem aparece na foto; zoom de foto; especialidades e progresso no perfil.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| E1 | 1a e 1b são **PRs separadas**; a 1b começa depois do merge da 1a, e o orquestrador dela atualiza o ONDE FICA com o código da 1a antes de fatiar | As Fases 2 e 3 podem começar assim que a 1a entra |
| E2 | A 1a cria **todas** as tabelas da Fase 1 (migration `fase1_conselheiro`). A 1b não toca no schema | Um só momento de migração |
| E3 | Entram em `MODELOS_DE_CLUBE`: `Reuniao, Chamada, ChamadaAlteracao, LancamentoPontos, Arquivo, Album, Foto, PedidoAoAdm, EnvioProcessado`. `ConfiguracaoClube` continua fora | Modelo de clube fora da lista fica sem proteção |
| E4 | **Classificação de resposta**, pela ordem: status 0 → **rede**; 5xx (qualquer corpo) → **servidor**; 2xx que não passa pelo contrato de saída, ou 4xx **sem** corpo `ErroApi` válido (portal de Wi-Fi com HTML) → **rede**; 4xx com `ErroApi` → **recusa**. Na abertura (§4.1), rede e servidor abrem em modo sem conexão; recusa do refresh vai ao login | O cliente já converte `TypeError` em status 0; portal cativo não pode trancar o conselheiro para fora |
| E5 | Banco local Dexie 4, `desbravador` v1: `sessoes` (`usuarioId` → `eu`, `ultimoContatoEm`), `pacotes` (`[usuarioId+vinculoId]` → `pacote`, `baixadoEm`), `fila` (`id`; índices `[usuarioId+estado]`, `chave`, `criadoEm`), `rascunhos` (`[usuarioId+chave]`) | Um lugar só para o que é local |
| E6 | Fila genérica com registro de tipos (§4.3). A 1b registra `REUNIAO` e `FOTO`; a Fase 2 registrará `AULA` sem mexer no motor | A fila é do app, não da chamada |
| E7 | **Modo sem conexão vale 7 dias** desde o último contato com a API. Depois: `/conectar` (a fila fica). **Recusa do `POST /auth/refresh` (401/403 com `ErroApi`) apaga do aparelho o pacote, a identidade e os rascunhos** daquele usuário; a fila fica. Um 403 de autorização numa rota comum não apaga nada | Celular perdido ou compartilhado não mostra a lista de menores indefinidamente |
| E8 | **Pontos** só por `ServicoPontos.sincronizar()` (§5.3). O desconto por falta é um lançamento da **mesma origem da linha** (`CHAMADA`), com `criterioId` nulo — assim FALTA→PRESENTE estorna o desconto na mesma sincronização. Semântica de diferença: o que continua devido **não é tocado** (mantém o valor da época); o que deixou de ser é estornado; o novo nasce com o valor atual. Consequências aceitas e declaradas: corrigir uma reunião de setembro em outubro muda o ranking de setembro; PRESENTE→FALTA→PRESENTE recria o lançamento com o valor **atual** | Decisão 8 da visão, sem guardar histórico de valores |
| E9 | Arquivos por interface `Armazenamento` (disco, `ARQUIVOS_DIR`, volume próprio em produção); imagem só por **URL assinada** de 10 min numa rota `@Publica` (§4.5) — `<img>` não manda cabeçalho de autorização. Resposta com `Cache-Control: no-store` (o nginx já põe em `/api/`) | Foto de menor sem URL permanente nem cópia no cache do navegador |
| E10 | Fotos: o aparelho reduz (lado maior 1600 px, JPEG 0,8, `createImageBitmap(arquivo, { imageOrientation: 'from-image' })`); se não conseguir decodificar (HEIC num Android), recusa **na hora** "Formato de foto não aceito", sem pôr na fila. O servidor confere o formato **pelos bytes** (`sharp(buf).metadata().format` ∈ jpeg/png/webp), limita a 2 MB e a **40 megapixels** (`limitInputPixels: 40_000_000`), aplica `rotate()`, redimensiona, grava JPEG `mozjpeg` q80 **sem metadados** e miniatura de 400 px. `sharp.concurrency(1)`, `sharp.cache(false)` | EXIF pode ter GPS; imagem pequena em bytes e enorme em pixels derruba o container |
| E11 | Chamada nova: data padrão hoje no fuso do clube, entre (hoje − 30 dias) e hoje, **inclusive**. Na **edição a data é travada**. Prazo de correção do conselheiro: até 30 dias depois da data, contados pelo **`feitaNoAparelhoEm`** do envio (limitado a agora), desde que o envio chegue em até 7 dias depois disso; Adm sem prazo. Fora → 422 `REGRA` "Esta reunião já não pode ser alterada." | Chamada corrigida dentro do prazo e que subiu dias depois não pode se perder |
| E12 | **Membros da chamada**: DBV (tipo DBV, ativo) com `MembroUnidade` cobrindo a data. Linha de quem não era membro é **ignorada** e devolvida em `ignorados` com o nome | Lista do aparelho pode estar desatualizada |
| E13 | **Frequência** = `Math.round(frequencia(...))` sobre as linhas de chamada do DBV no período; da unidade, sobre todas as linhas das reuniões dela no período. Sem linha → `null` ("—") | Os contratos são inteiros; as linhas só existem para quem era membro (E12) |
| E14 | **Ranking do mês**: soma dos lançamentos ativos com `data` no mês civil, DBVs tipo DBV ativos (quem não pontuou aparece com 0). Ordem: pontos ↓, frequência ↓ (nula por último), nome ↑; posição sequencial. Filtro por unidade = membros atuais. **Privacidade**: nome completo e frequência só para ADM e para DBVs no escopo de quem pede (a regra do perfil, §5.4); para os demais, `nomePublico` e frequência `null`. Ranking de unidades = média de pontos por DBV ativo membro atual; unidade sem DBV fica de fora | MODELO §7 + LGPD |
| E15 | **Próxima reunião** = primeira data ≥ hoje com o dia da semana `diaReuniao`, `horaReuniao` e `localReuniaoPadrao`. O calendário (Fase 3) ainda não entra | Calendário não existe ainda |
| E16 | **Conflito por versão**, não por relógio (§5.2) | Relógio de celular não é confiável; quem ficou 3 dias offline não pode apagar em silêncio a correção de outro |
| E17 | Fotos: conselheiro vê e envia nas suas unidades; Adm todas (API); instrutor não. Remover: autor ou Adm; marca `removidaEm` e **apaga os arquivos do disco** depois do commit (falha vai para o log e a limpeza da subida da API, §5.5, repete) | Remoção de foto de menor é de verdade |
| E18 | Sair com fila: confirmação; os itens **ficam** (com `usuarioId`) e sobem quando essa pessoa entrar de novo. Ao sair apagam-se pacote, identidade e rascunhos dela. Itens de outro usuário com mais de 30 dias são descartados na abertura, com aviso "N envios antigos de outra pessoa foram descartados deste aparelho" | Celular compartilhado |
| E19 | Produção: nginx `client_max_body_size 3m`; CSP com `blob:` em `img-src` **nos 4 blocos** e, no bloco do `sw.js`, `fonts.googleapis.com` e `fonts.gstatic.com` em `connect-src`; `log_format` que não grava a query de `/api/arquivos/`; volume `arquivos` em `/app/arquivos` com `mkdir`+`chown node` no Dockerfile; `ARQUIVOS_DIR` e `ARQUIVOS_SEGREDO` passados ao serviço `api` no compose; memória da API 384 MB | Achados da revisão contra o código |
| E20 | Service worker: cache **CacheFirst** das fontes do Google com `CacheableResponsePlugin({ statuses: [0, 200] })` (o CSS vem opaco) e `ExpirationPlugin` 30 dias. Nada de `/api` em cache | Sem internet, o app abre com as fontes do design |
| E21 | Toda tela nova de celular trata **quatro estados**: carregando (`Esqueleto`), vazio (`EstadoVazio` com uma ação real), erro (mensagem da `ErroApi` + "Tentar de novo") e sem conexão (dado guardado + faixa, ou "Disponível quando houver internet") | Nenhuma tela em branco |
| E22 | iPhone sem o app na tela inicial (Safari apaga o banco local após 7 dias sem uso): antes de salvar a primeira chamada sem conexão, aviso "Instale o app na tela inicial para não perder chamadas guardadas" (não bloqueia) | `storage.persist()` não garante nada no iOS |

## 3. Dependências e ambiente (onda 0 da 1a)

Instaladas pelo orquestrador, última estável no dia, fixadas sem `^`, anotadas aqui no commit:
`dexie` (web); `fake-indexeddb` (web, dev); `workbox-strategies`, `workbox-expiration`,
`workbox-cacheable-response` (web, **7.4.1**, mesma família do `workbox-*` já instalado);
`sharp`, `multer`, `@types/multer` (api). Nenhuma outra — o que faltar é PENDÊNCIA.

**Instaladas em 2026-09-29:** `dexie` 4.4.6, `fake-indexeddb` 6.2.5, `workbox-strategies`,
`workbox-expiration`, `workbox-cacheable-response` 7.4.1, `sharp` 0.35.5, `multer` 2.4.0,
`@types/multer` 2.3.0.

`.env.exemplo`: `ARQUIVOS_DIR` (dev `./.arquivos`), `ARQUIVOS_SEGREDO` (`openssl rand -hex 32`).
Testes: o `globalSetup` do Jest cria um diretório temporário por execução em `ARQUIVOS_DIR` e o
apaga no `globalTeardown`; o do Playwright, idem. Corpo JSON: o limite padrão do Express (100 KB)
basta (200 linhas ≈ 40 KB) e não muda.

## 4. Núcleo offline (1a)

### 4.1 Abertura do app (substitui o comportamento atual de `ProvedorSessao` e `cliente.ts`)

1. Descarta itens de outros usuários com mais de 30 dias (E18) e itens `ENVIADO` com mais de 24 h.
2. Lê a identidade guardada do último usuário.
3. `POST /api/auth/refresh`:
   - **ok** → online; grava `EuSaida` e `ultimoContatoEm`; baixa o pacote (§4.2); motor da fila.
   - **rede ou servidor** (E4) → tenta de novo em 5 s (uma vez, para não passar da tolerância de 30 s
     do refresh da Fase 0); falhando de novo: com identidade guardada e `ultimoContatoEm` < 7 dias
     → **modo sem conexão**; senão, rota `/conectar` ("Conecte-se à internet para usar o app.").
   - **401/403 com `ErroApi`** → apaga pacote, identidade e rascunhos desse usuário (E7) e vai ao
     login (ou a `/papel` se `VINCULO_INATIVO` e houver outro vínculo). Fila intacta.
4. Em modo sem conexão, tenta o refresh a cada evento `online` e a cada 30 s com a aba visível.
   Conseguindo, vira online sem recarregar. Se a resposta for 401/403 com `ErroApi` **durante uma
   digitação**, mostra a faixa "Sua sessão expirou — salve e entre de novo"; salvar ainda enfileira;
   a limpeza do E7 acontece ao ir para o login.

`useConexao()` → `{ modo: 'ONLINE' | 'SEM_CONEXAO' }`, decidido pela última resposta real da API,
nunca só por `navigator.onLine`.

### 4.2 Pacote do domingo

`GET /api/sync/pacote` → `PacoteSaida`. `versao` = SHA-256 do JSON canônico (unidades e membros
por nome, reuniões por data, álbuns por data; chaves na ordem do contrato; sem `geradoEm`). Baixado
na abertura online (se o guardado tem mais de 15 min ou não existe), ao voltar a conexão e depois de
cada `REUNIAO` enviada; só regrava se a `versao` mudou.

### 4.3 Fila de envio

`ItemFila` (em `offline/tipos.ts`, escrito pelo orquestrador): `{ id, versaoPayload, usuarioId,
vinculoId, tipo, chave, dependeDe?: chave, rotulo, detalhe, payload, blob?, estado: 'NA_FILA' |
'ENVIANDO' | 'ENVIADO' | 'ERRO', progresso, tentativas, proximaTentativaEm, erro?: { codigo,
mensagem }, criadoEm, atualizadoEm, enviadoEm? }`.

- **Motor**: Web Lock `fila` (vale para a **origem** — uma aba por vez). Quem pega a trava primeiro
  devolve todo `ENVIANDO` a `NA_FILA`. Processa itens do usuário e vínculo da sessão, em
  `criadoEm`, **um por vez**. Gatilhos: abertura, `online`, aba visível, depois de enfileirar,
  "Tentar enviar agora".
- **Chave**: enfileirar com a mesma chave de um item `NA_FILA`/`ERRO` do mesmo usuário **funde**
  pelo `fundir(anterior, novo)` do tipo (mesmo `id` de item, **novo `envioId`**) e volta a
  `NA_FILA`. `REUNIAO` funde linhas por `dbvId` (a nova vence) e `cabecalho = novo ?? anterior` —
  assim uma correção sobre uma chamada nova ainda na fila não perde os outros membros nem o
  horário. Se o da chave está `ENVIANDO`, cria outro que só roda depois. Chaves: `REUNIAO` =
  `<unidadeId>:<data>`; `FOTO` = `foto:<fotoId>` (cada foto é um item).
- **Dependência**: item com `dependeDe` só roda quando **não houver** item daquela chave que não
  esteja `ENVIADO`. Com a dependência em `ERRO`, o dependente mostra "Esperando a chamada ser
  enviada". **Descartar** um item com dependentes pede confirmação listando-os e os marca `ERRO`
  "A chamada foi descartada" (cada um pode ser descartado ou reenviado a outro álbum).
- **Depois do sucesso**, `aoEnviar` do tipo roda; o de `REUNIAO` atualiza o `versaoVista` das linhas
  dos itens seguintes da mesma chave com as `versao` devolvidas.
- **Sucesso** só se a resposta for 2xx **e** passar pelo contrato de saída do tipo (zod).
- Classificação pelo E4. **Rede**: volta a `NA_FILA`, espera 5 s → 15 s → 60 s → 5 min, sem limite.
  **Servidor (5xx), 408 e 429**: idem, mas na **10ª** tentativa vira `ERRO`.
- **401**: um refresh; falhou → motor pausa com "Entre de novo para enviar".
- **Outro 4xx**: `ERRO` com a mensagem. "Tentar de novo" (volta a `NA_FILA`, zera a espera e as
  tentativas) e "Descartar" (confirmação; apaga).
- Progresso de arquivo por `XMLHttpRequest.upload.onprogress`.
- Primeira gravação: `navigator.storage.persist()`. Fila acima de 100 MB: faixa "Pouco espaço:
  envie as fotos quando houver internet".
- `versaoPayload` = 1. A API aceita o formato 1 até a Fase 2 terminar (item antigo não se perde
  numa atualização do app).

API do módulo (assinaturas no `tipos.ts`): `registrarTipo(def)`, `enfileirar(entrada) → id`,
`useFila() → { itens, contagem: { pendentes, erros }, tentarAgora(), tentarDeNovo(id),
descartar(id) }`, `itensDaChave(chave)`, `useConexao()`, `useModoSessao() → 'ONLINE' |
'SEM_CONEXAO' | 'EXPIRADA'`, `limparDadosDoUsuario(usuarioId, { manterFila: true })`.
`TipoFila = { tipo, rotulo(payload), detalhe(payload, blob?), fundir(anterior, novo), enviar(item, ctx: { requisitar,
enviarArquivo(onProgresso), queryClient }) → Promise<unknown>, saida: ZodType, aoEnviar?(saida, ctx) }`.

### 4.4 Interface do núcleo

- **Faixa "Sem conexão"** no topo dos dois layouts em `SEM_CONEXAO` (`Estado-Offline.dc.html`).
- **Selo "N aguardando envio"** (pendentes + erros) no cabeçalho do Início → `/fila`; com erro, cor de alerta.
- **`/fila`** (`Estado-Pendente.dc.html`): status geral, "Tentar enviar agora", lista com
  `rotulo`, `detalhe`, estado, progresso e ações de erro; "Mantenha o app aberto até terminar —
  com ele fechado, nada é enviado."; aviso do E22 quando couber.
- **`/conectar`**: "Conecte-se à internet para usar o app." + "Tentar de novo".
- **Sair** (menu do cabeçalho): com fila, painel `Confirmacao` "Há N itens esperando envio. Eles
  ficam guardados neste celular e só serão enviados quando você entrar de novo." → `sair()` da
  sessão chama `limparDadosDoUsuario(…, { manterFila: true })`.
- `ui/` ganha: `Abas`, `Avatar` (iniciais, cor da classe), `Confirmacao`, `Selo`, `BarraProgresso`,
  `Chip` (alternável, 44 px), `Esqueleto`.

### 4.5 Arquivos (API)

`Armazenamento { gravar(caminho, buffer); abrir(caminho): Readable; remover(caminho) }` em disco
sob `ARQUIVOS_DIR`; caminho **montado pelo servidor** (`clube/<clubeId>/fotos/<AAAA>/<arquivoId>.jpg`
e `…-min.jpg`), nunca vindo do cliente. `urlAssinada(arquivoId, variante)` →
`/api/arquivos/<id>?v=<original|miniatura>&exp=<epoch s>&sig=<base64url(HMAC-SHA256(id|v|exp))>`.
`GET /api/arquivos/:id` (`@Publica`): valida formato de `id`, `v` e `exp` **antes** de consultar o
banco; `exp` vencido ou maior que agora + 10 min → 403; assinatura por `timingSafeEqual` → 403;
foto removida ou arquivo inexistente → 404; senão o JPEG.

## 5. Regras de servidor (1b)

### 5.1 `PUT /api/sync/reunioes/:uuid`

`@Pode('reuniao.registrar')` + escopo (§5.4). Numa transação:
1. Unidade no escopo (senão 404). `feito = min(feitaNoAparelhoEm, agora)`. Se já existe
   `EnvioProcessado` com esse `envioId` → responde o estado atual da reunião **sem gravar nada**.
2. Reunião: se existe uma com `id = :uuid` → é ela; se a `data` do corpo difere da dela → 422
   `REGRA` "A data de uma reunião registrada não muda.". Senão, procura por `(unidadeId, data)`;
   não existe → **nova**: exige `feito ≥ agora − 7 dias` e a data dentro do E11 relativa a `feito`,
   e cria com `id = :uuid`. Violação de chave na criação (`P2002`): relê; se agora existe reunião
   com esse `:uuid` **ou** com essa (unidade, data), segue com ela; se o `:uuid` é de outra
   unidade/data ou de outro clube → 422; senão → 503 `TEMPORARIO`.
3. `SELECT … FOR UPDATE` na reunião (serializa dois envios simultâneos).
4. Existente e fora do prazo do E11 para o papel (inclusive `feito < agora − 7 dias`) → 422.
5. Cabeçalho: `cabecalho` nulo → não mexe. Não nulo → aplica horário, local e observações e
   atualiza `cabecalhoVersao`; se `versaoVista` ≠ `cabecalhoVersao` gravado, vale o deste envio e a
   resposta traz `conflitoCabecalho: true` (a tela avisa "O horário ou as observações tinham sido
   mudados por outra pessoa; a sua versão valeu."). Qualquer mudança atualiza `atualizadaPor/Em`.
6. Linhas: quem não é membro DBV na data → `ignorados` (E12); as demais → §5.2.
7. Pontos de **toda linha gravada** (inclusive a que virou PRESENTE, para estornar um desconto):
   `pontosPorCriterio` (§5.3) → **uma** chamada a `sincronizar` com origem `CHAMADA` /
   `origemId = "<reuniaoId>:<dbvId>"`, onde o item `FALTA` vira `criterioId: null`. Data dos
   lançamentos = data da reunião.
8. Grava `EnvioProcessado(envioId)`. Violação de unicidade por corrida (`P2002`/`P2034` fora do
   passo 2) → 503 `TEMPORARIO` (a fila repete).
9. Resposta `ReuniaoEnvioSaida`: pontos e `versao` de **todas** as linhas da reunião,
   `cabecalhoVersao`, `conflitos`, `conflitoCabecalho`, `ignorados`.
Reenviar o mesmo corpo não muda nada.

### 5.2 Conflito por linha (versão)

Para cada linha do envio, com a linha gravada `g`:
- sem `g` → cria (`versao = agora`);
- `g` idêntica ao envio (situação e chips) → nada (nem versão, nem alteração);
- `versaoVista === g.versao` → sobrescreve, `ChamadaAlteracao{ origem: EDICAO, antes: g, depois }`;
- `versaoVista` ≠ `g.versao` (outra pessoa mudou depois do que este aparelho viu) → **sobrescreve
  também** (vale a última gravação) com `ChamadaAlteracao{ origem: CONFLITO_SYNC, antes: g, depois }`
  e a linha vai em `conflitos` da resposta, com o nome.
Cada gravação põe `versao = agora` (precisão de milissegundo), `alteradaPorId`, `envioId`.

### 5.3 Pontos

**Onda 0 da 1a acrescenta ao `shared`** `pontosPorCriterio(marcacao, criterios, config) →
{ gatilho, pontos }[]` e `pontosDaChamada` passa a ser a soma dela (os testes atuais continuam
valendo): um item por critério **ativo** de gatilho PRESENCA/PONTUALIDADE/UNIFORME/BIBLIA/LICAO
que a marcação atinge; FALTA com `descontarFalta` → um item `{ gatilho: 'FALTA', pontos: −desconto }`.
O servidor mapeia gatilho → `CriterioRanking.id` pelo índice `criterio_padrao_por_gatilho` (um
critério padrão por gatilho); `FALTA` vira lançamento sem critério.

`ServicoPontos.sincronizar(tx, { clubeId, dbvId, origemTipo, origemId, data, devidos: { criterioId | null, pontos }[], lancadoPorId })`:
compara os lançamentos **ativos** da origem por `criterioId` (nulo = desconto de falta) — igual
→ não toca; ausente em `devidos` → `estornadoEm = agora`; novo → cria. Única escrita em
`LancamentoPontos`.

### 5.4 Escopo (fora disso: 404 ou lista vazia)

| Rota | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|
| `GET /sync/pacote` | `unidades: []` | as suas | `unidades: []` |
| `PUT /sync/reunioes/:uuid` | qualquer unidade | as suas | 403 |
| `GET /reunioes`, `/reunioes/:id`, `/unidades/:id/frequencia` | qualquer | as suas | 403 |
| `GET /inicio/conselheiro` | 403 | sim | 403 |
| `GET /ranking`, `/ranking/unidades` | sim | sim | sim (E14 decide nome e frequência) |
| `GET /desbravadores/:id/perfil` | qualquer | DBV das suas unidades | matriculados nas suas classes no ano |
| `GET /albuns`, `/albuns/:id`, `PUT /sync/fotos/:uuid`, `GET /unidades/:id/sem-autorizacao-imagem` | qualquer | as suas | 403 |
| `DELETE /fotos/:id` | qualquer | só as que enviou (outra → 403) | 403 |
| `POST /pedidos-ao-adm` | 403 | a sua unidade | 403 |

`abrePerfil` e a regra de nome/frequência do ranking usam **a mesma** função de escopo do perfil.
Permissões (catálogo da Fase 0): `reuniao.registrar`, `reuniao.ver`, `foto.enviar`, `foto.ver`,
`dbv.ver`; ranking `@Logado`; início `@Logado` com checagem de papel; pedido
`@Pode('reuniao.registrar')`.

### 5.5 Fotos

`PUT /api/sync/fotos/:uuid` (multipart `arquivo` + `dados`). `FileInterceptor` com
`limits.fileSize = 2 MB`; o 413 que o Nest gera para `LIMIT_FILE_SIZE` nasce **antes** do método,
então um **filtro de exceção no controller de fotos** o troca por 422 `REGRA` "A foto precisa ter
até 2 MB.". Formato pelos bytes, 40 MP (E10) →
422 "Formato de foto não aceito." / "Foto grande demais.". Foto com esse id já existe → mesma
resposta, sem regravar. Álbum: `REUNIAO` → reunião por (unidade, data) no clube (não existe → 422
"A chamada desta reunião ainda não chegou."), usa o álbum dela ou cria (título "Reunião · dd/mm");
`EXISTENTE` → do clube e da unidade no escopo (senão 404); `NOVO` → se o id existe, reaproveita
(mesma unidade, senão 404); senão cria. **Álbum, arquivo e foto na mesma transação**; os arquivos
são gravados no disco **antes** e apagados se a transação falhar. Corrida de álbum (`P2002` em
`reuniaoId` ou no id de `NOVO`) → 503 `TEMPORARIO`. `DELETE /fotos/:id` → 204; já removida → 404.
Álbum cuja última foto foi removida some da lista (continua existindo). **Limpeza**: na subida da
API, o módulo de fotos apaga do disco os arquivos de fotos com `removidaEm` que ainda existam (lotes
de 100) — é o que garante o E17 se a remoção falhou antes.

### 5.6 Pedido ao Adm

`POST /api/pedidos-ao-adm`: unidade com DBV → 422; pedido da mesma unidade nas últimas 24 h →
204 sem enviar; senão grava `PedidoAoAdm` e envia a cada Adm ativo `emailPedidoUnidadeSemDbv`
(novo em `email/modelos.ts`): assunto "A unidade <nome> está sem desbravadores no app"; corpo
"<conselheiro> pediu que você cadastre os desbravadores da unidade <nome>. <APP_URL>/adm/unidades".

## 6. Telas (1b)

Barra do conselheiro com os quatro itens habilitados; a do instrutor e o menu do Adm ganham
**Ranking** (só trocar `para` dos itens). Nome e papel no cabeçalho vêm da `EuSaida`.

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/inicio` (conselheiro) | C1 | `Inicio-Conselheiro.dc.html` | seletor de unidade se 2+; card da próxima reunião (E15) com "Fazer chamada" em destaque se `ehHoje` e não `chamadaFeita`; números: DBVs, frequência do mês, "Nº lugar" (some se nulo); atalhos Unidade · Reuniões · Galeria · Ranking; top 3 do mês **da unidade** → perfil; selo da fila; sem sino. Sem unidade: vazio "Você ainda não tem unidade. Fale com o Adm do clube." Sem conexão: próxima reunião pelo pacote, números "—" |
| `/unidade` | C2 | `Minha-Unidade.dc.html` | lista da Fase 0 + frequência do mês (vermelho abaixo de `limiarFrequenciaAlerta`); tocar → perfil; vazio "Nenhum desbravador nesta unidade." + "Avisar o Adm" (§5.6; depois "Adm avisado") |
| `/reunioes` | C5, C6 | `Historico-Reunioes.dc.html` | aba "Por reunião": mês corrente com setas; linhas do servidor **mais** as reuniões da fila, casadas pela chave `unidadeId:data` — as da fila levam "não enviado" e, se não existem no servidor, aparecem com os números do payload; % abaixo do limiar em vermelho. Aba "Por DBV": grade das últimas 8 ("últimas 8 reuniões"). "+ Nova". Vazio: "Nenhuma chamada ainda." + "Fazer a primeira chamada" |
| `/reunioes/nova`, `/reunioes/:id/editar` | C3, C4, C6b | `Registro-Reuniao.dc.html`, `Estado-Offline.dc.html` | abaixo |
| `/reunioes/:id` | C5b | `Detalhe-Reuniao.dc.html` | resumo; "registrada por X às HH:MM"; "alterada por Y às HH:MM" (+ "houve conflito entre aparelhos" se `conflito`); filtro Todos/Presentes/Ausentes com contagens; por DBV: Pontual/Atrasou (de `situacao`), Uniforme, Bíblia, Lição (se critério ativo), "Falta justificada", pontos; observações; fotos: até 4 miniaturas + "Ver álbum (N)" → o álbum dela + "+" → `/galeria/enviar?reuniao=<id>`; "Editar" só se `podeEditar`. Sem "Reunião regular" |
| `/dbv/:id` | T3 parcial | `Perfil-DBV.dc.html` | nome, idade, unidade, classe atual e avançada (sem %), posição e pontos do mês, frequência do mês, classes investidas, contato se vier; **omitidos**: anel, seções, especialidades, instrutor ("Progresso da classe em breve"); "Voltar" = histórico do navegador; barra do papel ativo |
| `/ranking` | T1 parcial | `Ranking.dc.html` | abas Mês (ativa) / Trimestre / Ano ("em breve"); mês com setas; pódio + lista completa; filtro por unidade se `rankingPorUnidade`; sem variação; linha abre o perfil só se `abrePerfil`; vazio "Ainda não há pontos neste mês." |
| `/galeria`, `/galeria/:albumId` | C7 | `Galeria.dc.html` | seletor de unidade se 2+; cabeçalho "<unidade> · N fotos" (soma); álbuns com capa, título, data, contagem, "Thiago e mais 2"; álbum: grade → tela cheia com deslizar/fechar, "Remover" se `podeRemover` (confirmação); "Enviar fotos"; vazio "Nenhuma foto ainda." + "Enviar primeiras fotos"; sem conexão: "Disponível quando houver internet" (as fotos não ficam guardadas) |
| `/galeria/enviar` | C8 | `Enviar-Fotos.dc.html` | abaixo |
| `/fila`, `/conectar` | C9 | `Estado-Pendente.dc.html` | 1a (§4.4) |

**Chamada** — igual com e sem internet. **Fonte da tela**: a **base** é o servidor (online) ou
`reunioesRecentes` do pacote; por cima, as linhas dos itens da fila da mesma chave em `NA_FILA`,
`ENVIANDO` ou `ERRO` (nunca `ENVIADO`); por cima de tudo, o rascunho local.
- Nova: lista = membros do pacote da unidade, ordem por nome, **todos sem marcação**; "Salvar"
  fica desabilitado enquanto houver alguém sem marcação ("Marque os N que faltam"). Data (E11) e
  horário (padrão `horaReuniao`); local e observações opcionais.
- Edição: data travada; carrega as versões (`versao`, `cabecalhoVersao`); ao salvar envia só as
  linhas tocadas e o cabeçalho só se foi tocado.
- Tocar no nome = presente; de novo = ausente. Presente: chips Atrasou · Uniforme · Bíblia (+ Lição
  se ativo). Ausente: chip Justificada. Ausentar limpa os chips.
- Pontos ao vivo com `pontosDaChamada` e os critérios do pacote, com a etiqueta "provisório".
- Resumo presentes X/N, atrasos, uniformes, Bíblias; "lista atualizada hoje às HH:MM".
- Cada toque grava o rascunho. "Salvar chamada · N pts" enfileira `REUNIAO` (chave
  `unidadeId:data`; `:uuid` = id da reunião existente ou UUID novo; `rotulo` "Chamada · <unidade> ·
  dd/mm" ou "Correção na chamada · …"; `detalhe` "N DBVs · N pts (provisório)"; `envioId` novo), apaga o rascunho
  e volta ao histórico com "Chamada salva" + o estado do envio.
- Depois do envio: `conflitoCabecalho` → aviso do §5.1 passo 5; `conflitos` → aviso "N linhas tinham sido alteradas por outra pessoa; a sua
  versão valeu e a anterior ficou registrada: <nomes>."; `ignorados` → "<nomes> não eram da unidade
  nessa data e ficaram fora." O `aoEnviar` do tipo `REUNIAO` invalida as consultas `reunioes`,
  `reuniao`, `grade`, `inicio`, `ranking` e baixa o pacote.

**Enviar fotos**:
- Álbum: "Reunião de hoje" **só aparece se existe chamada de hoje** (no servidor ou na fila) —
  gera `album.tipo='REUNIAO'` e `dependeDe = unidadeId:hoje`; reunião vinda de `?reuniao=`; álbum
  recente do pacote (`EXISTENTE`); ou "Novo álbum" (nome obrigatório + data; `NOVO` com UUID).
- Faixa "Não fotografe: …" (online pela API; sem conexão, do pacote); some se todos têm autorização.
- "Câmera" (`accept="image/*" capture="environment"`) e "Galeria" (`multiple`); prévia com remover;
  legenda do lote; tamanho total estimado.
- "Enviar N fotos": reduz cada uma (E10; falha → recusa na hora) e enfileira um `FOTO` por foto
  (`rotulo` "Foto · <álbum>", `detalhe` "1,6 MB"); progresso a partir da fila; ao terminar, "N fotos
  enviadas" + "Ver álbum". Texto "Pode sair desta tela — o envio continua enquanto o app estiver aberto."

## 7. Testes obrigatórios (escritos antes) e quem escreve

| Teste | Tipo | Pacote |
|---|---|---|
| `pontosPorCriterio`: cada gatilho, critério inativo, FALTA com e sem desconto, justificada; soma = `pontosDaChamada` | Vitest | onda 0 da 1a |
| Guarda: os 8 modelos novos sem `clubeId` lançam | Jest | 1a-A1 |
| `ServicoPontos`: cria, mantém valor antigo após mudar o critério, estorna, recria; duplicado barrado pelo índice; FALTA sem critério | Jest | 1a-A1 |
| Pacote: só as unidades do conselheiro; membros DBV ativos; `versao` estável e muda com o dado; reuniões de 30 dias com versões | Jest | 1a-A1 |
| URL assinada: válida serve; vencida, com `exp` longo demais, adulterada → 403; foto removida → 404; `id` malformado → 403 sem consulta | Jest | 1a-A1 |
| Fila: substituição por chave; `ENVIANDO` preso volta a `NA_FILA` ao pegar a trava; dependência espera e mostra o motivo; resposta 200 fora do contrato não conta como envio; rede sem limite; 5xx vira `ERRO` na 10ª; 4xx → erro; 401 → pausa; descartar; limpeza de enviados e de itens antigos de outro usuário | Vitest + fake-indexeddb | 1a-A2 |
| Abertura: rede cai com identidade < 7 dias → sem conexão; > 7 dias → `/conectar`; 401 → login com fila intacta e pacote apagado; HTML 403 de portal = rede; volta da rede → online sem recarregar | Vitest | 1a-A2 |
| Sair com fila: confirmação; itens ficam; pacote, identidade e rascunhos apagados | Vitest | 1a-A3 |
| Chamada na fila: correção sobre chamada nova ainda não enviada funde (todos os membros e o horário continuam); reenvio do mesmo `envioId` não grava | Vitest / Jest | 1a-A2 / 1b-B1 |
| e2e 1a: login online; espera `navigator.serviceWorker.controller`; `context.setOffline(true)`; recarrega; o app abre em modo sem conexão | Playwright | 1a-A4 |
| `docker build` da API e `node -e "require('sharp')"` dentro da imagem | comando | 1a-A4 |
| Chamada: cria; idempotente por `envioId`; FALTA→PRESENTE estorna o desconto; criação com `feitaNoAparelhoEm` de 8 dias atrás → 422; corrida de criação entre dois aparelhos → os dois gravam (um com 503 e nova tentativa); `conflitoCabecalho`; conflito por versão (EDICAO × CONFLITO_SYNC, `conflitos` com nome); linha idêntica não gera alteração; `ignorados`; data travada na edição; `:uuid` de outra reunião → 422; prazo por `feitaNoAparelhoEm` com folga de 7 dias; Adm sem prazo; pontos = `pontosPorCriterio`; correção após mudar critério mantém o valor antigo; desconto de falta; dois envios simultâneos não duplicam lançamentos | Jest | 1b-B1 |
| Histórico, detalhe, grade: contagens, `percentual` arredondado, marca nula, `podeEditar`, `alterada.conflito` | Jest | 1b-B1 |
| Ranking: ordem e desempate; LIDER e inativo fora; filtro unidade; nome/frequência por escopo (instrutor vê `nomePublico` de quem não é seu); unidades por média | Jest | 1b-B2 |
| Início e perfil: próxima reunião (domingo = hoje; sábado → amanhã; fuso: 01:00 UTC de segunda ainda é domingo em Brasília), `chamadaFeita`, sem unidade, destaques; perfil sem contato sem permissão | Jest | 1b-B2 |
| Fotos: idempotente; `NOVO` com id do aparelho; `REUNIAO` sem chamada → 422; 2 MB → 422 (não 413); PNG disfarçado de JPEG aceito pelo formato real; 50 MP → 422; **EXIF sai**: gerar no teste um JPEG com `sharp(...).withExif({ IFD0: { Copyright: 'teste' } })` e conferir `metadata().exif` indefinido na gravada; remover apaga do disco; outra unidade → 404; isolamento multipart | Jest | 1b-B3 |
| Telas: cada tela do pacote nos quatro estados (E21) e com os erros da API (msw) | Vitest | 1b-B4…B7 |
| Redução de foto: função pura com o decodificador injetado (jsdom não tem canvas); falha de decodificação recusa sem enfileirar | Vitest | 1b-B7 |
| e2e 1b: chamada **sem rede**, fecha a aba, reabre com rede → chamada chega sozinha, aparece no histórico, soma no ranking; 2 fotos enviadas aparecem no álbum da reunião | Playwright | 1b-B8 |

## 8. CLAUDE.md — acrescentar (onda 0 da 1a)

- `LancamentoPontos` só por `ServicoPontos.sincronizar`;
- modelo novo de clube entra em `MODELOS_DE_CLUBE` na mesma migration;
- imagem só por URL assinada; caminho de arquivo sempre montado pelo servidor;
- conflito de chamada é por `versao`, nunca por relógio do aparelho;
- tela de celular trata carregando, vazio, erro e sem conexão;
- modo de conexão só por `useConexao`, nunca `navigator.onLine` sozinho.

## 9. O que NÃO quebra

Telas e rotas da Fase 0 continuam; `MembroSaida` só **ganha** `frequencia` opcional; a soma de
`pontosPorCriterio` reproduz `pontosDaChamada` (os testes atuais dele continuam); o e2e
`fundacao.spec.ts` continua passando; carga e `clube:criar` não mudam (exceto: o índice
`criterio_padrao_por_gatilho` casa com os 8 critérios que o `clube:criar` já cria, um por gatilho).

## 10. Verificado no CI × no deploy

| Onde | O quê |
|---|---|
| CI / local | tudo do §7, lint, tipos, build, e um teste que faz `grep` no `nginx.conf` e falha se algum dos 4 blocos de CSP não tiver `blob:` em `img-src` |
| No deploy (dono) | volume `arquivos` gravável, 384 MB suficientes com 10 fotos seguidas, fontes em cache no celular, HTTPS com o cookie `Secure` |

---

## ONDE FICA

Código da `main` com a 1a (confira a faixa antes de editar):

- módulo-modelo da API                    `apps/api/src/desbravadores/desbravadores.controller.ts:20-90` (`@Pode('dbv.ver')` nos GET), `desbravadores.service.ts`, `escopo.service.ts:16-62` (`ServicoEscopo`: `relogio:19`, `permissoes:25`, `unidadesDoConselheiro:33`, `classesDoInstrutor:41`, `filtroDesbravadores:50`; exportado por `desbravadores.module.ts:9`)
- unidades: membros do conselheiro         `apps/api/src/unidades/unidades.controller.ts:29-33` (`GET :id/membros`, `dbv.ver`), `unidades.service.ts:89-100` (`membros`; hoje SEM `frequencia`, o contrato `MembroSaida.frequencia` já existe em `shared/contratos/unidades.ts:24-33`)
- registro de módulos                      `apps/api/src/app.module.ts:20-37` (1 módulo por linha; já tem `PontosModule`, `ArquivosModule`, `SyncModule`; 1b acrescenta reunioes, ranking, inicio, fotos, pedidos)
- erros (`ErroApp`, código → status)       `apps/api/src/comum/erros.ts:6-31` (`TEMPORARIO`→503 já existe `:20`); lista de códigos `packages/shared/src/contratos/comum.ts:24`
- lista de modelos de clube                `apps/api/src/comum/prisma/guarda-clube.ts:4-23` (`MODELOS_DE_CLUBE` já com os 9 da 1a), `MODELOS_MISTOS:26`, operações `:30-43`, `verificarEscopo:206`
- `PrismaSistema` e a regra de lint        `apps/api/src/comum/prisma/prisma-sistema.ts:9`, `eslint.config.mjs:25-44`
- sessão e decorators                      `apps/api/src/comum/decorators/sessao.decorator.ts:6-36` (`SessaoLogada:14`, `SessaoDoClube:34`), `pode.decorator.ts:6`, `guards/guarda-sessao.guard.ts:9`
- pontos (única escrita em lançamentos)    `apps/api/src/pontos/servico-pontos.ts:6-28` (`PontoDevido`, `EntradaSincronizar`, `ServicoPontos.sincronizar(tx, entrada)`), exportado por `pontos.module.ts:6-7`; importar `PontosModule`
- arquivos (API)                           `apps/api/src/arquivos/armazenamento.ts:8-14` (interface `Armazenamento`: gravar/abrir/remover; token `ARMAZENAMENTO:14`; `ArmazenamentoDisco:17`), `servico-arquivos.ts:10,16-28` (`caminhoDaFoto`, `urlAssinada(clubeId, arquivoId, variante, agora?)`, `assinaturaConfere`), `arquivos.module.ts:7-15` (exporta `ARMAZENAMENTO` e `ServicoArquivos`: importar `ArquivosModule` e injetar com `@Inject(ARMAZENAMENTO)`), rota `arquivos.controller.ts:20-54`
- pacote (regras de escopo/membros)        `apps/api/src/sync/sync.controller.ts:8-16` (`GET /sync/pacote`), `sync.service.ts:28-162` (`SyncService.pacote`: escopo `:46`, membros `:75-122`, reuniões `:124` (30 dias), álbuns `:150` (60 dias), versão SHA-256 `:69`), `sync.module.ts:6-11`; contrato `packages/shared/src/contratos/sync.ts:7,16`
- fábricas e isolamento                    `apps/api/test/fabricas.ts` (388 linhas): `criarClube:56`, `criarUsuario:66`, `criarUnidade:90`, `criarVinculo:96`, `criarDbv:123`, `classeOficial:149`, `criarMatricula:153`, `criarSessao:172`, `criarAcesso:186`, `criarMembro:204`, `configurarClube:223`, `criterioPorGatilho:231`, `LinhaDeChamada:235`, `criarReuniao:245`, `chamadasDaReuniao:293`, `criarLancamento:297`, `criarArquivo:323`, `criarAlbum:345`, `criarFoto:366`
- isolamento (rota × outro clube)          `apps/api/test/isolamento.ts:11-60` (`PedidoContraOutroClube:11`, `RotaParaIsolar:23`, `testarIsolamento:39`; multipart via `anexos` `:15,49-51`), exemplo `apps/api/src/desbravadores/desbravadores.isolamento.spec.ts`
- banco e pasta de arquivos de teste       `apps/api/test/global-setup.ts:13-30` (banco `teste_<pid>_<hex>` por execução; `ARQUIVOS_DIR` temporário `:29`), `global-teardown.ts:5`, `banco.ts:25`, `app.ts:15` (`criarAppDeTeste`)
- e-mail                                   `apps/api/src/email/servico-email.ts`, `modelos.ts:8,22,35` (`emailConvite`, `emailAdicionado`, `emailRedefinicao`; 1b acrescenta `emailPedidoUnidadeSemDbv`)
- fórmulas                                 `packages/shared/src/formulas/pontos.ts:24,36,58` (`MarcacaoChamada:24`, `pontosPorCriterio:36`, `pontosDaChamada:58`), `frequencia.ts:3`, `situacao.ts:3`; datas `packages/shared/src/datas.ts:9-30` (`anoClube`, `idade`, `hojeNoFuso:30`); tudo reexportado em `packages/shared/src/index.ts:3-22`
- contratos da Fase 1 (shared)             `packages/shared/src/contratos/reunioes.ts` (`MarcacaoChamadaEnvio`, `MarcacaoChamadaServidor`, `CabecalhoReuniaoEnvio`, `ReuniaoEnvio:34`, `ReuniaoEnvioSaida`, `ReuniaoFiltro`, `ReuniaoResumo`, `LinhaChamadaSaida`, `ReuniaoDetalhe:83`, `MARCAS`, `GradeFrequenciaFiltro`, `GradeFrequenciaSaida`); `sync.ts` (`MembroPacote:7`, `PacoteSaida:16`); `fotos.ts` (`FotoEnvioDados:6`, `FotoEnvioSaida`, `AlbumFiltro`, `AlbumResumo`, `FotoSaida`, `AlbumDetalhe:41`, `SemAutorizacaoSaida`); `ranking.ts` (`RankingFiltro`, `RankingItem`, `RankingSaida:23`, `RankingUnidadesSaida`); `perfil.ts` (`PerfilDbvSaida:6`); `inicio.ts` (`InicioConselheiroFiltro`, `InicioConselheiroSaida:8`); `pedidos.ts` (`PedidoAoAdmEntrada:4`)
- contratos que os novos importam          `packages/shared/src/contratos/auth.ts:11,13` (`RefUnidade`, `RefClasse`), `desbravadores.ts:52` (`DesbravadorSaida`), `unidades.ts:24` (`MembroSaida`)
- núcleo offline: tipos e API pública      `apps/web/src/offline/tipos.ts:8-135` (`ItemFila:11`, `FalhaEnvio:41`, `ArquivoEnvio:47`, `ContextoEnvio:57`, `ContextoAposEnvio:65`, `TipoFila:76`, `EntradaFila:88`, `EstadoFila:102`, assinaturas `:129-135`); a interface importa só de `offline/index.ts:1-8` (`useConexao`, `useModoSessao`, `enfileirar`, `itensDaChave`, `useFila`, `limparDadosDoUsuario`, `registrarTipo`)
- núcleo offline: implementações           `registrarTipo` `offline/registro.ts:9` (`obterTipo:13`, mapa em memória, sem ponto central), `enfileirar` `fila.ts:33`, `itensDaChave` `fila.ts:97`, `useFila` `fila.ts:253`, `useConexao` `conexao.ts:42`, `useModoSessao` `conexao.ts:47`, `limparDadosDoUsuario` `limpeza.ts:24`, motor `motor.ts:32` (`iniciarMotor`), `aoEnviar` chamado em `motor.ts:185-200` (ctx com `baixarPacote`)
- núcleo offline: banco local e pacote    `apps/web/src/offline/banco.ts:7-45` (`Rascunho:20` `{usuarioId, chave, valor, atualizadoEm}`; tabelas `rascunhos:32`, `fila`, `pacotes`, `sessoes`; instância `banco:45`; NÃO há helper de rascunho, só a tabela), leitura do pacote `pacote.ts:47` (`lerPacote(usuarioId, vinculoId)`, async, NÃO exportado por `index.ts`, NÃO há hook), `baixarPacote:14`, `baixarPacoteSeVelho:28`, `baixarPacoteAoVoltarConexao:39`; tempos `tempos.ts:17-22`
- componentes de `ui/`                     `apps/web/src/ui/`: `Abas.tsx:17`, `Avatar.tsx:30`, `BarraProgresso.tsx:11`, `Botao.tsx:27`, `CaixaMarcacao.tsx:10`, `Campo.tsx:17`, `Cartao.tsx:4`, `Chip.tsx:11`, `Confirmacao.tsx:18`, `Esqueleto.tsx:5`, `EstadoVazio.tsx:10`, `FaixaAviso.tsx:6`, `FolhaLateral.tsx:13`, `MenuCabecalho.tsx:15`, `Selecao.tsx:12`, `Selo.tsx:18`, `Tabela.tsx:23`; testes `ui.test.tsx`, `componentes-novos.test.tsx`
- faixa, selo, /fila, /conectar            `apps/web/src/layouts/FaixaSemConexao.tsx:5` (nos dois layouts: `LayoutCelular.tsx:28`, `LayoutAdm.tsx:41`), `FaixaSessaoExpirada.tsx:6`, `SeloAguardandoEnvio.tsx:6` (no cabeçalho do `LayoutCelular.tsx:32`, todas as telas), `modulos/fila/PaginaFila.tsx:80`, `modulos/conectar/TelaConectar.tsx:9`, sair com confirmação `layouts/MenuUsuario.tsx:17-41`
- rotas do front                           `apps/web/src/rotas.tsx:16-40` (conselheiro+instrutor em `LayoutCelular` `:22-30`: `...rotasInicio`, `/fila`, `GuardaRota papeis=['CONSELHEIRO']` com `rotasUnidade`; instrutor sem rota própria; ADM em `LayoutAdm` `:32-37` com `rotasAdmDesbravadores/Unidades/Usuarios`; `/conectar:20`); um `rotas.tsx` por módulo (`modulos/inicio/rotas.tsx`, `modulos/unidade/rotas.tsx`)
- barra inferior e menu do Adm             `apps/web/src/layouts/LayoutCelular.tsx:11-19` (`INICIO`, `RANKING` e "Reuniões" sem `para` = "em breve"; conselheiro: Início, Unidade, Reuniões, Ranking), `ItemNavegacao.tsx:5-9,23,32-36`; menu do Adm `apps/web/src/layouts/LayoutAdm.tsx:11-21` (`ITENS_ADM`; "Ranking" sem `para`)
- sessão no front                          `apps/web/src/sessao/ProvedorSessao.tsx:54` (`abrirSessao:92`, `reabrir:246`), `useSessao.ts:9-29` (`eu`, `vinculoAtivo`, `papel`, `pode`, `sair`, `situacao`; `usuarioId`/`vinculoId` saem de `eu.id`/`vinculoAtivo.id`)
- cliente HTTP                             `apps/web/src/api/cliente.ts:9,16,27,86,142,192-216` (`classificarStatus`, `ErroDaApi`, `requisitar:192`, `requisitarCru:204`, `montarConsulta:216`)
- hooks de leitura (padrão)                `apps/web/src/api/leitura.ts:1-80` (`chavesLeitura:22`, `useUnidades`, `useMembrosUnidade`, ...), `api/unidades.ts` (mutações + `invalidarUnidades`), `api/desbravadores.ts`; NÃO existe `api/reunioes.ts`, `fotos.ts`, `ranking.ts`, `inicio.ts`, `perfil.ts`, `pedidos.ts`
- testes do front                          `apps/web/src/testes/servidor.ts:9` (msw: `handlersSessao()`, `handlersLeitura()`), `testes/handlers/{sessao,leitura,offline,auth,desbravadores,unidades,usuarios}.ts` (`offline.ts`: `criarPacote`, `handlerPacote`), `testes/renderizar.tsx:9` (`renderizarRotas`), `testes/locks.ts`, `testes/setup.ts`
- service worker e PWA                     `apps/web/src/sw.ts:1-34` (`CacheFirst` das fontes `:25-27`), `apps/web/vite.config.ts`
- telas existentes que mudam               `apps/web/src/modulos/inicio/Inicio.tsx` (39 linhas), `modulos/unidade/MinhaUnidade.tsx:23-28` (usa `useMembrosUnidade`), `modulos/inicio/ConviteInstalacao.tsx`; NÃO existe nada em `modulos/{reunioes,galeria,ranking,perfil}`
- e2e                                      `playwright.config.ts` (`workers: 1`), `e2e/global-setup.ts:13-66` (banco próprio, `E2E_ARQUIVOS_DIR:21`, portas livres), `e2e/fundacao.spec.ts:55,66`, `e2e/offline.spec.ts:12`, `e2e/{ambiente-e2e,mailpit,processos,global-teardown}.ts`
- scripts do root                          `package.json`: `lint`, `tipos`, `teste` (shared+api+web), `teste:e2e` (`playwright test`), `build`; api `jest` com `maxWorkers: 2` (`apps/api/jest.config.cjs`); sem lock de suíte: cada execução cria banco Postgres próprio (`teste_<pid>_<hex>`) e pasta de arquivos própria
- produção                                 `docker-compose.prod.yml` (`ARQUIVOS_DIR:37`, volume `arquivos:48,69`, API 384m `:28`), `apps/api/Dockerfile:38-40`, `apps/web/nginx.conf` (`client_max_body_size:16`, `log_format:9`, CSP `:30,50,59,69`)
- criado na onda 0 da 1b                  `apps/api/src/{reunioes,ranking,inicio,fotos,pedidos}/*.module.ts` (vazios, já registrados); `apps/web/src/api/reunioes.ts` (`chavesReunioes`, leituras de B5, vaga da mutação de B4); rotas provisórias em `modulos/{reunioes,galeria,ranking,perfil}/rotas.tsx` (reuniões e galeria só do conselheiro; ranking e perfil nos três papéis, com o layout do papel ativo em `rotas.tsx`); telas provisórias `modulos/reunioes/{historico/HistoricoReunioes,detalhe/DetalheReuniao,chamada/TelaChamada}.tsx`
- registro dos tipos da fila e leituras locais  `apps/web/src/offline/tipos/todos.ts` (importado no `main.tsx`; carrega `tipos/reuniao.ts` e `tipos/foto.ts`, que chamam `registrarTipo`); contrato de `usePacote`, `lerRascunho`, `gravarRascunho`, `apagarRascunho` no fim de `offline/tipos.ts`
- conferido em                             `desbravadores@b966352`
