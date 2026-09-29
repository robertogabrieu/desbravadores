# Fase 1 — Conselheiro · Spec

**Status:** rascunho para revisão · **Branch:** `feature/fase-1-conselheiro` · **Base:** `main@3de43f2`

Transforma a Fase 1 do [ROADMAP](../../planejamento/ROADMAP.md) em decisões fechadas. Quem
implementa **não decide nada que esteja aqui**; lacuna volta ao orquestrador em PENDÊNCIAS.

**Precedência:** (1) esta spec e seus anexos; (2) a [spec da Fase 0](../fase-0/SPEC.md), que
continua valendo inteira (D1–D24) onde esta não a altera; (3) `docs/planejamento/`;
(4) `docs/design/telas/*.dc.html` — vence na aparência, nunca na regra. Do design não se copia
CSS inline. **O código da `main` é a verdade** sobre o que já existe; o bloco ONDE FICA aponta.

**Anexos — contrato literal:**
- [`anexos/schema.prisma`](anexos/schema.prisma) — schema completo (Fase 0 + Fase 1, blocos novos
  marcados `// FASE 1`). Validado com `prisma validate` 7.5.0; a migration gerada contra o schema
  da Fase 0 **só acrescenta** (nenhum DROP).
- [`anexos/contratos.ts`](anexos/contratos.ts) — contratos novos, conferidos com `tsc --strict`
  contra o `packages/shared` real da `main`.

---

## 1. Entrega

A fase sai em **duas PRs**, nesta ordem:

**1a · Núcleo offline** — o que as Fases 1, 2 e 3 usam:
schema inteiro da Fase 1; app que **abre sem internet**; banco local (Dexie); **fila de envio**
genérica com estados, tentativas e erro; pacote do domingo (`GET /sync/pacote`); serviço de
**lançamento de pontos**; **armazenamento de arquivos** com URL assinada; faixa "Sem conexão",
selo "N aguardando envio" e a tela da fila (C9); confirmação ao sair com fila; componentes de UI
que faltam.

**1b · O domingo do conselheiro** — chamada online e offline (C3, C4), correção com registro
(C6b), histórico e detalhe da reunião (C5, C5b, C6), Início do conselheiro (C1), Minha unidade
com frequência (C2), perfil do DBV sem progresso de classe (T3 parcial), ranking do mês (T1
parcial), galeria e envio de fotos (C7, C8), estados vazios do conselheiro (C10), pedido ao Adm.

**Fora da Fase 1** (não implementar, nem "de passagem"): tudo do instrutor (Fase 2); calendário,
cronograma e notificações/sino (Fase 3); ranking por trimestre/ano, variação de posição,
configuração do ranking, lançamento manual, ranking público (Fase 4); telas de reunião e galeria
no computador para o Adm; marcar quem aparece na foto; visualizador de foto com zoom.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| E1 | **1a e 1b são PRs separadas**; a 1b só começa depois do merge da 1a, e seu orquestrador atualiza o ONDE FICA do código da 1a antes de fatiar (PLANO §4) | As Fases 2 e 3 podem começar assim que a 1a entra |
| E2 | A 1a cria **todas** as tabelas da Fase 1 (anexo), numa migration `fase1_conselheiro`. A 1b não toca no schema | Um só momento de migração; a 1b não disputa schema com as Fases 2 e 3 |
| E3 | Entram em `MODELOS_DE_CLUBE` (guarda): `Reuniao, Chamada, ChamadaAlteracao, LancamentoPontos, Arquivo, Album, Foto, PedidoAoAdm`. `ConfiguracaoClube` continua fora (é lida por `clubeId` como chave primária) | Modelo de clube fora da lista fica sem proteção |
| E4 | **Abrir sem internet.** O front guarda no aparelho a última `EuSaida` e o último pacote de cada usuário. Na abertura, se o refresh falha **por rede** (sem resposta, `TypeError` do fetch, 502/503/504), o app entra em **modo sem conexão** com a identidade guardada; se falha com **401/403**, vai ao login (ou a `/papel`) **sem apagar a fila**. Sem identidade guardada e sem rede: tela "Conecte-se à internet uma vez para começar" | Hoje qualquer falha de refresh manda ao login — no domingo sem sinal o conselheiro ficaria para fora |
| E5 | Banco local **Dexie 4**, nome `desbravador`, versão 1, tabelas: `sessoes` (chave `usuarioId`: `eu`, `salvaEm`), `pacotes` (chave `[usuarioId+vinculoId]`: `pacote`, `baixadoEm`), `fila` (chave `id`; índices `[usuarioId+estado]`, `chave`, `criadoEm`), `rascunhos` (chave `[usuarioId+chave]`: estado de tela ainda não salvo) | Um lugar só para tudo que é local |
| E6 | **Fila genérica** com registro de tipos: cada tipo declara `enviar(item) → resultado` e o rótulo. A 1a registra o tipo de teste; a 1b registra `REUNIAO` e `FOTO`; a Fase 2 registrará `AULA` sem mexer no motor | A fila é do app, não da chamada |
| E7 | Regras do motor da fila — §4.3 | Comportamento idêntico para todos os tipos |
| E8 | **Pontos**: `ServicoPontos.sincronizar()` (§5.3) é a única forma de gravar `LancamentoPontos`. Semântica de **diferença**: lançamento ativo que continua devido **fica como está** (mantém o valor da época); o que deixou de ser devido é **estornado**; o novo é criado com o valor **atual** do critério | Decisão 8 da visão: mudar critério vale daqui para a frente — inclusive na correção de chamada antiga |
| E9 | **Arquivos**: interface `Armazenamento` com implementação em disco (`ARQUIVOS_DIR`, volume próprio em produção). Imagem servida só por **URL assinada** de 10 min (HMAC-SHA256 com `ARQUIVOS_SEGREDO`) numa rota `@Publica` que confere assinatura e validade — `<img>` não envia cabeçalho de autorização | Foto de menor nunca tem URL permanente |
| E10 | Fotos: o **aparelho** reduz (lado maior 1600 px, JPEG qualidade 0,8, respeitando a orientação da câmera) antes de pôr na fila; o **servidor** aceita JPEG/PNG/WebP até 2 MB, aplica `sharp` (`rotate()`, lado maior ≤ 1600, JPEG `mozjpeg` q80, **sem metadados**) e gera miniatura de 400 px. `sharp` com `concurrency(1)` e `cache(false)` | EXIF pode ter o GPS de onde a foto foi tirada; memória do container é pequena |
| E11 | Chamada: **data** padrão = hoje no fuso do clube; aceita até 30 dias atrás, nunca futura. **Correção**: conselheiro até 30 dias depois da data da reunião; Adm sem prazo. Fora disso → 422 `REGRA` "Esta reunião já não pode ser alterada." | BACKLOG C6b |
| E12 | **Membros da chamada**: só DBV (tipo DBV, ativo) com `MembroUnidade` cobrindo a data. Linha de quem não era membro na data é **ignorada** e devolvida em `ignorados` — a chamada não é recusada inteira | A lista do aparelho pode estar desatualizada |
| E13 | **Frequência** de um DBV num período = `frequencia()` (shared) sobre as situações das **suas linhas de chamada** no período; da unidade = presenças ÷ linhas de todas as reuniões da unidade no período. Sem linha → `null` ("—") | As linhas só existem para quem era membro na data (E12) — o denominador sai certo sem outra tabela |
| E14 | **Ranking do mês**: soma dos lançamentos ativos com `data` no mês (civil, fuso do clube) dos DBVs (tipo DBV) **ativos**; quem não pontuou aparece com 0. Ordem: pontos ↓, frequência do mês ↓ (nulo por último), nome ↑ — posição sequencial, sem empate. Filtro por unidade = membros atuais. **Ranking de unidades** = média de pontos por DBV ativo membro atual; unidade sem DBV fica de fora | MODELO §7; trimestre/ano e variação na Fase 4 |
| E15 | **Próxima reunião** = a primeira data ≥ hoje cujo dia da semana é `diaReuniao`, com `horaReuniao` e `localReuniaoPadrao`. O calendário (Fase 3) ainda não é considerado — declarado | Calendário não existe ainda |
| E16 | Conflito entre aparelhos — §5.2 | ARQUITETURA §5 |
| E17 | **Fotos**: conselheiro vê e envia nos álbuns das suas unidades; Adm vê todas (API); instrutor não vê. Remover: autor ou Adm; remoção marca `removidaEm` **e apaga os arquivos do disco** | Privacidade de menores: remoção é de verdade |
| E18 | Sair com fila pendente: confirmação na tela; os itens **ficam** no aparelho, marcados com o `usuarioId`, e só sobem quando essa pessoa entrar de novo. Ao sair, apagam-se o pacote e a identidade guardada dessa pessoa; com fila vazia, não sobra dado dela no aparelho | Celular compartilhado: não perder chamada e não deixar lista de menores guardada |
| E19 | Produção: nginx `client_max_body_size 3m`; CSP ganha `blob:` em `img-src` (prévia das fotos) **nos 4 blocos** do `nginx.conf`; volume `arquivos` montado em `/app/arquivos`; memória da API sobe para **384 MB** (sharp) | Upload real passa de 1 MB; prévia usa `blob:` |
| E20 | Service worker ganha cache **CacheFirst** das fontes do Google (`fonts.googleapis.com`, `fonts.gstatic.com`, 30 dias) — o resto continua como na Fase 0; nada de `/api` em cache | Sem internet, o app abre com as fontes do design |
| E21 | Toda tela nova de celular trata **quatro estados**: carregando (esqueleto), vazio (componente `EstadoVazio` com uma ação real), erro (mensagem da `ErroApi` + "Tentar de novo") e sem conexão (dado guardado + faixa, ou "Disponível quando houver internet") | E3 do design; sem estado em branco |

## 3. Dependências novas (instaladas pelo orquestrador na onda 0 da 1a)

`dexie` (web), `fake-indexeddb` (dev, web), `sharp`, `multer`, `@types/multer` (api) — a última
estável no dia, fixada sem `^` e anotada aqui no commit da onda. Nenhuma outra: dependência que
faltar é PENDÊNCIA para o orquestrador (D2 da Fase 0).

Variáveis novas no `.env.exemplo`: `ARQUIVOS_DIR` (dev `./.arquivos`, prod `/app/arquivos`),
`ARQUIVOS_SEGREDO` (gerado por `openssl rand -hex 32` no `deploy.sh`).

## 4. Núcleo offline (1a)

### 4.1 Abertura do app (substitui o comportamento atual de `sessao/` e `api/cliente.ts`)

1. Lê a identidade guardada (`sessoes`) do último usuário.
2. Tenta `POST /api/auth/refresh`:
   - **ok** → sessão online; grava `EuSaida` em `sessoes`; baixa o pacote se o papel for
     CONSELHEIRO e o guardado tiver mais de 15 min (ou não existir); dispara o motor da fila.
   - **falha de rede** (E4) → se há identidade guardada: **modo sem conexão** com ela e o pacote
     guardado; senão, tela "Conecte-se à internet uma vez para começar".
   - **401/403** → login (ou `/papel` se `VINCULO_INATIVO` e houver outro vínculo); fila intacta.
3. Em modo sem conexão, a cada evento `online` (e a cada 30 s com a aba visível) tenta o refresh
   de novo; conseguindo, vira sessão online sem recarregar a página.

`useConexao()` expõe `{ online: boolean, modo: 'ONLINE' | 'SEM_CONEXAO' }` — `modo` segue a
última resposta real da API, não só `navigator.onLine`.

### 4.2 Pacote do domingo

`GET /api/sync/pacote` → `PacoteSaida` (anexo). Só CONSELHEIRO recebe unidades; ADM e INSTRUTOR
recebem `unidades: []` nesta fase. `versao` = SHA-256 do JSON do conteúdo (sem `geradoEm`); o
front só regrava se a versão mudou. Baixado: na abertura online (se > 15 min), ao voltar a
conexão, e depois de cada envio bem-sucedido de `REUNIAO`.

### 4.3 Fila de envio

`ItemFila`: `{ id: uuid, usuarioId, vinculoId, tipo, chave, rotulo, payload, blob?, estado:
'NA_FILA'|'ENVIANDO'|'ENVIADO'|'ERRO', progresso: 0–100, tentativas, proximaTentativaEm,
erro?: { codigo, mensagem }, criadoEm, atualizadoEm, enviadoEm? }`.

- **Enfileirar com chave**: se já existe item da mesma `chave` e mesmo usuário em `NA_FILA` ou
  `ERRO`, **substitui** `payload` e volta a `NA_FILA` (mesmo `id`). Se está `ENVIANDO`, cria um
  item novo que só roda depois — nunca dois da mesma chave enviando.
- **Motor**: um só por aba (Web Lock `fila`), processa em ordem de `criadoEm`, **um item por vez**,
  só itens do usuário e vínculo da sessão. Gatilhos: abertura, evento `online`, aba volta a ficar
  visível, depois de enfileirar, botão "Tentar enviar agora".
- **Falha de rede, 408, 429, 5xx**: volta a `NA_FILA`, `tentativas+1`, espera 5 s → 15 s → 60 s →
  5 min (teto). Não é erro.
- **401**: um refresh; falhou → motor pausa com o aviso "Entre de novo para enviar" (fila intacta).
- **Outro 4xx**: `ERRO` com a mensagem da `ErroApi`. Ações: "Tentar de novo" (volta a `NA_FILA`,
  zera espera) e "Descartar" (confirmação; apaga o item).
- **ENVIADO** some da fila 24 h depois (limpeza na abertura).
- Progresso de envio de arquivo por `XMLHttpRequest.upload.onprogress` (o `fetch` não informa).
- Na primeira gravação, pede `navigator.storage.persist()`. Com a fila acima de 100 MB, a faixa
  avisa "Pouco espaço: envie as fotos quando houver internet".

### 4.4 Interface do núcleo

- **Faixa "Sem conexão"** no topo do `LayoutCelular` e do `LayoutAdm` quando `modo=SEM_CONEXAO`
  (`Estado-Offline.dc.html`).
- **Selo "N aguardando envio"** (itens `NA_FILA`+`ENVIANDO`+`ERRO`) no cabeçalho do Início, levando
  a `/fila`; com erro, o selo fica na cor de alerta.
- **Tela `/fila`** (`Estado-Pendente.dc.html`): status geral (sem conexão / enviando / tudo
  enviado), "Tentar enviar agora", lista com rótulo, estado, progresso e ações de erro; o texto
  "Mantenha o app aberto até terminar — com ele fechado, nada é enviado."
- **Sair** (menu do cabeçalho): com fila, painel de confirmação "Há N itens esperando envio. Eles
  ficam guardados neste celular e só serão enviados quando você entrar de novo." (E18).
- **Componentes de `ui/`** que faltam: `Abas`, `Avatar` (iniciais, cor da classe), `Confirmacao`
  (painel com duas ações), `Selo`, `BarraProgresso`, `Chip` (alternável, 44 px), `Esqueleto`.

### 4.5 Arquivos (API)

`Armazenamento { gravar(caminho, buffer): Promise<void>; abrir(caminho): Readable; remover(caminho): Promise<void> }`,
implementação em disco sob `ARQUIVOS_DIR`, caminhos `clube/<clubeId>/fotos/<AAAA>/<arquivoId>.jpg`
e `…-min.jpg`. `ServicoArquivos.urlAssinada(arquivoId, 'original'|'miniatura')` →
`/api/arquivos/<id>?v=<variante>&exp=<epoch>&sig=<base64url(HMAC(id|v|exp))>`.
`GET /api/arquivos/:id` (`@Publica`): assinatura inválida ou vencida → 403 `SEM_PERMISSAO`;
arquivo removido ou inexistente → 404; senão o JPEG com `Cache-Control: private, max-age=600`.

## 5. Regras de servidor (1b, sobre o núcleo)

### 5.1 `PUT /api/sync/reunioes/:uuid` — gravar a chamada

`@Pode('reuniao.registrar')` + escopo (unidade do conselheiro; Adm qualquer). Numa transação:
1. Valida data (E11) e unidade no escopo (senão 404).
2. Acha a reunião por `(unidadeId, data)`; não existe → cria com `id = :uuid`,
   `registradaPor = atualizadaPor = usuário`.
3. Existe e está fora do prazo de correção (E11) para o papel → 422.
4. Para cada linha do envio: não é membro DBV na data → vai para `ignorados` (E12). Senão aplica
   §5.2.
5. Observações/horário/local: vence `observacoesAlteradasEm` mais recente que o gravado.
6. Para cada linha gravada/alterada: `ServicoPontos.sincronizar` com origem
   `CHAMADA:<reuniaoId>:<dbvId>` (critérios PRESENCA…LICAO devidos por `pontosDaChamada`
   decomposto por critério) e, se FALTA com `descontarFalta`, origem `FALTA:<reuniaoId>:<dbvId>`
   sem critério, `pontos = −pontosDescontoFalta`. Data do lançamento = data da reunião.
7. Resposta `ReuniaoEnvioSaida`. Reenviar o mesmo corpo não muda nada (idempotente).

### 5.2 Conflito por linha

Para cada DBV: sem linha gravada → cria. Com linha gravada: se `alteradaNoAparelhoEm` do envio >
o gravado → sobrescreve e grava `ChamadaAlteracao` (`antes`, `depois`, `origem` = `CONFLITO_SYNC`
se o `clienteUuid` gravado difere do `:uuid` do envio, senão `EDICAO`); se ≤ → mantém o gravado e
conta em `linhasSobrescritas`. Linha idêntica → nada. Instante do aparelho no futuro (> agora + 5 min)
é tratado como `agora` (relógio adiantado não ganha sempre).

### 5.3 `ServicoPontos.sincronizar(tx, { clubeId, dbvId, origemTipo, origemId, data, devidos: { criterioId | null, pontos }[], lancadoPorId })`

Compara os lançamentos **ativos** da origem com `devidos` por `criterioId`: igual → não toca
(mantém o valor da época); ausente em `devidos` → `estornadoEm = agora`; novo → cria com
`pontos` informado (valor atual). Os índices parciais do schema impedem dois ativos da mesma
origem e critério. É a única escrita em `LancamentoPontos` do código.

### 5.4 Escopo por rota (fora disso: 404 ou lista vazia)

| Rota | ADM | CONSELHEIRO | INSTRUTOR |
|---|---|---|---|
| `GET /sync/pacote` | `unidades: []` | as suas unidades | `unidades: []` |
| `PUT /sync/reunioes/:uuid` | qualquer unidade | as suas | 403 |
| `GET /reunioes`, `/reunioes/:id`, `/unidades/:id/frequencia` | qualquer | as suas | 403 |
| `GET /inicio/conselheiro` | 403 | sim | 403 |
| `GET /ranking`, `/ranking/unidades` | sim | sim | sim |
| `GET /desbravadores/:id/perfil` | qualquer | DBV das suas unidades | matriculados nas suas classes |
| `GET /albuns`, `/albuns/:id`, `PUT /sync/fotos/:uuid`, `DELETE /fotos/:id`, `GET /unidades/:id/sem-autorizacao-imagem` | qualquer | as suas | 403 |
| `POST /pedidos-ao-adm` | 403 | a sua unidade | 403 |

Permissões (catálogo da Fase 0, sem chave nova): `reuniao.registrar`, `reuniao.ver`, `foto.enviar`,
`foto.ver`, `dbv.ver`; ranking e início `@Logado`; pedido `@Pode('reuniao.registrar')`.

### 5.5 Fotos

`PUT /api/sync/fotos/:uuid` (multipart: `arquivo` + `dados` = `FotoEnvioDados`). Idempotente: foto
com esse id já existe → devolve a mesma resposta sem regravar. Álbum: existe pelo `id` → usa
(precisa ser da mesma unidade, senão 404); não existe → cria com os dados enviados; se `reuniaoId`
e a reunião já tem álbum → usa o dela. Mais de 2 MB ou tipo fora de JPEG/PNG/WebP → 422 `REGRA`
("A foto precisa ter até 2 MB." / "Formato de foto não aceito.").
`GET /albuns?unidadeId` só lista álbuns com foto não removida.

### 5.6 Pedido ao Adm

`POST /api/pedidos-ao-adm` `{ tipo: 'UNIDADE_SEM_DBV', unidadeId }`: grava `PedidoAoAdm` e envia a
cada Adm ativo do clube o e-mail (novo modelo em `email/modelos.ts`, `emailPedidoUnidadeSemDbv`):
assunto "A unidade <nome> está sem desbravadores no app"; corpo "<conselheiro> pediu que você
cadastre os desbravadores da unidade <nome>. <APP_URL>/adm/unidades". Já houve pedido da mesma
unidade nas últimas 24 h → 204 sem enviar.

## 6. Telas (1b)

Barra inferior do conselheiro com os quatro itens habilitados (Início · Unidade · Reuniões ·
Ranking); a do instrutor e o menu do Adm ganham **Ranking** habilitado.

| Rota | Tela | Design | Regras |
|---|---|---|---|
| `/inicio` (conselheiro) | C1 | `Inicio-Conselheiro.dc.html` | seletor de unidade se 2+; card da próxima reunião (E15) com "Fazer chamada" em destaque se `ehHoje` e não `chamadaFeita`, senão "Ver chamada"/"Fazer chamada"; números: DBVs, frequência do mês, "Nº lugar" da unidade (de `posicaoUnidade`, some se nulo); atalhos Unidade · Reuniões · Galeria · Ranking (sem duplicar "Registro de reunião"); destaques top 3 do mês, cada um abre o perfil; selo da fila; **sem sino**. Sem conexão: card da próxima reunião a partir do pacote, números "—" |
| `/unidade` | C2 | `Minha-Unidade.dc.html` | a lista da Fase 0 + frequência do mês por DBV (vermelho abaixo de `limiarFrequenciaAlerta`); tocar abre o perfil; vazio com "Avisar o Adm" (§5.6, confirma "Adm avisado") |
| `/reunioes` | C5 e C6 | `Historico-Reunioes.dc.html` | abas "Por reunião" (mês corrente, setas para meses anteriores; linhas com data, presentes/total, atrasos, uniformes, %; abaixo do limiar em vermelho; item ainda na fila com a marca "não enviado") e "Por DBV" (grade das últimas 8, P/A/F/J, rótulo "últimas 8 reuniões"); botão "+ Nova" → `/reunioes/nova`; vazio: "Fazer a primeira chamada" |
| `/reunioes/nova` e `/reunioes/:id/editar` | C3, C4, C6b | `Registro-Reuniao.dc.html` e `Estado-Offline.dc.html` | abaixo |
| `/reunioes/:id` | C5b | `Detalhe-Reuniao.dc.html` | resumo, "registrada por X às HH:MM", "alterada por Y às HH:MM"; filtro Todos/Presentes/Ausentes com contagens reais; por DBV situação (inclui "Falta justificada" e Lição quando o critério está ativo) e pontos do servidor; observações; fotos: "Ver álbum" abre **o álbum dela**, "+" abre `/galeria/enviar?reuniao=<id>`; "Editar" só se `podeEditar` |
| `/dbv/:id` | T3 parcial | `Perfil-DBV.dc.html` | nome, idade, unidade, classe atual e avançada (sem %), posição e pontos do mês, frequência do mês, classes investidas; contato só se vier no JSON; **sem** anel de progresso nem seções (Fase 2) — no lugar, "Progresso da classe em breve"; "Voltar" volta de onde veio |
| `/ranking` | T1 parcial | `Ranking.dc.html` | abas Mês (ativa) / Trimestre / Ano ("em breve"); título com o mês; setas para meses anteriores; pódio top 3 + lista completa; filtro por unidade se `rankingPorUnidade`; sem variação de posição; linha abre o perfil só se `abrePerfil`; barra inferior do papel ativo |
| `/galeria` | C7 | `Galeria.dc.html` | seletor de unidade se 2+; álbuns com capa, título, data e contagem real; tocar abre `/galeria/:albumId` (grade; tocar abre tela cheia com deslizar e fechar; "Remover" se `podeRemover`, com confirmação); "Enviar fotos" → `/galeria/enviar`; vazio: "Enviar primeiras fotos" |
| `/galeria/enviar` | C8 | `Enviar-Fotos.dc.html` | abaixo |
| `/fila` | C9 | `Estado-Pendente.dc.html` | (1a) §4.4 |

**Chamada (`/reunioes/nova`, `/reunioes/:id/editar`)** — funciona igual com e sem internet:
- lista = membros do pacote (unidade escolhida, ordem por nome); todos começam **sem marcação**
  na nova; na edição, carrega do servidor (online) ou de `reunioesRecentes` do pacote (sem conexão);
- data (padrão hoje; seletor limitado por E11) e horário (padrão `horaReuniao`); local e
  observações opcionais;
- tocar no nome = presente; de novo = ausente; presente mostra os chips Atrasou · Uniforme · Bíblia
  (e Lição, se o critério estiver ativo); ausente mostra o chip Justificada; ausentar limpa os chips;
- pontos por DBV e total **ao vivo** com `pontosDaChamada` (shared) e os critérios do pacote,
  marcados "provisórios" até o envio;
- resumo: presentes X/N, atrasos, uniformes, Bíblias; carimbo "lista atualizada hoje às HH:MM";
- cada toque grava o rascunho local (sai e volta sem perder); "Salvar chamada · N pts" enfileira
  `REUNIAO` (chave `unidadeId:data`, `:uuid` = id da reunião existente ou novo UUID) e volta ao
  histórico com "Chamada salva" e o estado do envio ("Salva no celular — será enviada" / "Enviada");
- depois do envio, se `ignorados` não vier vazio, aviso "N desbravadores não eram da unidade nessa
  data e ficaram fora da chamada.".

**Enviar fotos (`/galeria/enviar`)**:
- álbum: reunião de hoje (padrão, cria o da reunião se não existir), reunião vinda de
  `?reuniao=`, álbum recente do pacote, ou **novo álbum** (campo de nome obrigatório + data);
- antes da seleção, faixa "Não fotografe: Ana C., Pedro H." (`GET /unidades/:id/sem-autorizacao-imagem`;
  sem conexão, calculada do pacote); some se todos têm autorização;
- "Câmera" (`<input type=file accept=image/* capture=environment>`) e "Galeria" (`multiple`);
  prévia com remover; legenda opcional para o lote; tamanho total estimado;
- "Enviar N fotos": reduz cada uma (E10) e enfileira um item `FOTO` por foto; mostra o progresso
  por foto a partir da fila; ao terminar, "N fotos enviadas" e "Ver álbum"; recusada mostra o
  motivo e fica na fila com erro; texto "Pode sair desta tela — o envio continua enquanto o app
  estiver aberto."

## 7. Testes obrigatórios (escritos antes) e quem escreve

| Teste | Tipo | Pacote |
|---|---|---|
| Guarda: os 8 modelos novos sem `clubeId` lançam; isolamento de cada rota nova por `testarIsolamento` | Jest | cada pacote de API, nas suas rotas |
| `ServicoPontos`: criar, manter (valor antigo preservado após mudar o critério), estornar, recriar; índice parcial impede duplicado; FALTA sem critério | Jest integração | 1a-A1 |
| Pacote: conselheiro recebe só as suas unidades e membros DBV ativos; `versao` estável sem mudança e diferente após mudança; reuniões dos últimos 30 dias | Jest integração | 1a-A1 |
| URL assinada: válida serve; vencida/adulterada → 403; arquivo removido → 404; outro clube não gera URL | Jest integração | 1a-A1 |
| Fila: substituição por chave; um envio por vez; rede → backoff; 4xx → erro; 401 → pausa; descartar; limpeza de enviados; itens de outro usuário não sobem | Vitest + fake-indexeddb | 1a-A2 |
| Abertura: rede falha com identidade → modo sem conexão; 401 → login com fila intacta; sem identidade e sem rede → tela de conexão; volta da rede → online sem recarregar | Vitest | 1a-A2 |
| Sair com fila: confirmação; itens ficam; pacote e identidade apagados | Vitest | 1a-A3 |
| Ponta a ponta 1a: entra online, fica sem rede (`context.setOffline`), **recarrega a página** e o app abre em modo sem conexão | Playwright headless | 1a-A4 |
| Chamada: cria; idempotente; conflito por linha com `ChamadaAlteracao` e origem certa; relógio adiantado; `ignorados`; prazo de correção (conselheiro 30 dias, Adm sem prazo); data futura ou > 30 dias → 422; pontos lançados = `pontosDaChamada`; correção após mudar critério mantém o valor antigo dos que continuam; desconto de falta | Jest integração | 1b-B1 |
| Histórico, detalhe, grade: contagens, `percentual`, marca nula para não-membro, `podeEditar` | Jest integração | 1b-B1 |
| Ranking: ordem e desempate; mês no fuso (lançamento em 31/10 23h30 BRT fica em outubro); LIDER e inativo fora; filtro unidade; `abrePerfil` por papel; unidades por média | Jest integração | 1b-B2 |
| Início e perfil: próxima reunião (hoje é dia de reunião; sábado → domingo seguinte), `chamadaFeita`, posição da unidade, destaques; perfil sem contato sem permissão | Jest integração | 1b-B2 |
| Fotos: envio idempotente; álbum novo com id do aparelho; álbum da reunião reaproveitado; 2 MB / formato → 422; EXIF sai (foto de teste com GPS não tem GPS depois); remover apaga do disco; conselheiro de outra unidade → 404 | Jest integração | 1b-B3 |
| Telas: cada tela do pacote renderiza os quatro estados (E21) e trata os erros (msw) | Vitest + Testing Library | 1b-B4, B5, B6, B7 |
| Ponta a ponta 1b: conselheiro faz a chamada **sem rede**, fecha a aba, reabre com rede → a chamada chega sozinha, o histórico mostra, o ranking soma; envia 2 fotos e as vê no álbum | Playwright headless | 1b-B8 |

## 8. CLAUDE.md — acrescentar (onda 0 da 1a)

- `LancamentoPontos` só por `ServicoPontos.sincronizar`;
- modelo novo de clube entra em `MODELOS_DE_CLUBE` na mesma migration;
- foto e arquivo só por URL assinada; nunca servir arquivo por rota autenticada por cabeçalho;
- tela de celular trata carregando, vazio, erro e sem conexão;
- nada de `navigator.onLine` sozinho para decidir modo: use `useConexao`.

## 9. O que NÃO quebra

- As telas e rotas da Fase 0 continuam; `MembroSaida` só **ganha** o campo opcional `frequencia`.
- O e2e da Fase 0 (`e2e/fundacao.spec.ts`) continua passando — a abertura nova só muda o caso de
  falha de rede, que ele não exercita.
- A carga e o `clube:criar` não mudam.

---

## ONDE FICA

Do código atual (`main@3de43f2`; confirme a faixa antes de editar):

- módulo-modelo da API (controller/service/escopo)      `apps/api/src/desbravadores/desbravadores.controller.ts:18-45`, `desbravadores.service.ts:1-30,312-334`, `escopo.service.ts:16-62`
- registro de módulos                                    `apps/api/src/app.module.ts:19-33`
- erros (código → status; `ErroApp`)                      `apps/api/src/comum/erros.ts:6-31`
- guarda de clube (lista de modelos)                     `apps/api/src/comum/prisma/guarda-clube.ts:20-33,213-251`
- `PrismaSistema` e a regra de lint                       `apps/api/src/comum/prisma/prisma-sistema.ts:9-13`, `eslint.config.mjs:23-44`
- sessão e decorators                                     `apps/api/src/comum/decorators/sessao.decorator.ts:34-69`, `comum/guards/guarda-sessao.guard.ts:134-158`
- fábricas e isolamento de teste                          `apps/api/test/fabricas.ts`, `apps/api/test/isolamento.ts:37`, exemplo `apps/api/src/desbravadores/desbravadores.isolamento.spec.ts`
- e-mail (interface e modelos)                            `apps/api/src/email/servico-email.ts`, `apps/api/src/email/modelos.ts:8,22,35`
- fórmulas usadas                                         `packages/shared/src/formulas/pontos.ts:31`, `frequencia.ts:3`, `situacao.ts`; datas `packages/shared/src/datas.ts:9-30`
- rotas do front por módulo                               `apps/web/src/rotas.tsx:15-38`
- barra inferior ("em breve" = item sem `para`)           `apps/web/src/layouts/LayoutCelular.tsx:8-15`, `ItemNavegacao.tsx:8,32-36`
- sessão no front                                         `apps/web/src/sessao/useSessao.ts:9-23`, `ProvedorSessao.tsx`
- cliente HTTP (refresh por Web Lock; `aoSessaoPerdida`)  `apps/web/src/api/cliente.ts:111-140`
- hooks de leitura e padrão de mutações                   `apps/web/src/api/leitura.ts`, `apps/web/src/api/unidades.ts`
- testes do front (msw, renderizar)                       `apps/web/src/testes/servidor.ts`, `testes/handlers/*`, `testes/renderizar.tsx`
- service worker e PWA                                    `apps/web/src/sw.ts:1-22`, `apps/web/vite.config.ts:19-46`
- telas que mudam                                         `apps/web/src/modulos/unidade/MinhaUnidade.tsx`, `apps/web/src/modulos/inicio/Inicio.tsx`
- e2e                                                     `playwright.config.ts`, `e2e/global-setup.ts:13-67`, `e2e/fundacao.spec.ts`
- produção                                                `docker-compose.prod.yml`, `apps/web/nginx.conf` (CSP nas linhas 20, 41, 50, 59)
- conferido em                                            `desbravadores@3de43f2`
