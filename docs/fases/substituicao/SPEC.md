# Link de substituição — SPEC

Conselheiro e instrutor faltam com frequência, e cabe ao Adm pôr outra pessoa no lugar. Hoje
quem cobre não tem como lançar nada: a chamada e o registro de classe só abrem para quem tem o
papel ligado àquela unidade ou classe (`apps/api/src/reunioes/apoio.ts:14-31`,
`apps/api/src/aulas/apoio.ts:14-28`). Esta SPEC cria o **link de substituição**: o Adm gera, para
uma unidade ou uma classe e um dia de reunião, um link que vai pelo WhatsApp, abre **sem login**
no horário da reunião, fica aberto por **3 horas** e leva o substituto às **mesmas telas** do
titular. Fica registrado que houve substituição e quem lançou.

O desenho aprovado está em [`mockup.html`](mockup.html). **Ele é o alvo:** se esta SPEC e o
desenho divergirem, vale o desenho. Dele se copia estrutura, ordem e texto, **nunca CSS** — as
classes saem dos tokens e de `apps/web/src/ui/` (`Cartao`, `Botao`, `CabecalhoDaPagina`,
`ListaDePares`, `EstadoVazio`, `Confirmacao`).

| Bloco do desenho | Onde |
|---|---|
| A1 a A4 — Adm gera e acompanha | ficha da unidade e detalhe da classe |
| S1 a S8 — o que o link mostra | rota pública `/substituto/:token` |
| R1 — registro da substituição | detalhe da reunião (conselheiro e Adm) e formulário do registro de classe |

## Decisões travadas (discutidas com o usuário; não se reabrem)

1. **Janela da reunião.** O link vale para **um dia** escolhido pelo Adm. Abre no horário da
   reunião daquele dia e fecha **3 horas depois**. Antes da janela só informa (S1); depois
   bloqueia (S6).
2. **Link anônimo.** O Adm não diz quem vai cobrir. Quem abre se identifica: conta do clube
   reconhecida no aparelho (S3) ou nome digitado (S2).
3. **Um aparelho por link.** A primeira identificação dentro da janela prende o link àquele
   aparelho e navegador. Outro aparelho vê S7. Gerar outro link cancela o anterior.
4. **Telas iguais por reuso, não por cópia.** O substituto usa `TelaChamada` e
   `TelaRegistroAula` com seus formulários. O que muda dentro delas: a faixa do topo, o destino
   depois de salvar (S8) e a data travada no dia do link.
5. **Sem conflito de papel.** A substituição não cria, não muda e não usa vínculo nenhum. O
   membro que substitui continua com seus papéis, sua fila offline e seus dados intocados, e pode
   ser conselheiro da unidade A e substituto na B no mesmo dia.
6. **O titular não perde acesso.** Se os dois lançarem no mesmo dia, vale o que o envio já faz:
   a última escrita grava. Na chamada o conflito fica no histórico (`ChamadaAlteracao`,
   `apps/api/src/reunioes/reunioes-envio.service.ts:244-256`); no registro de classe ele só volta
   ao aparelho, sem histórico (`apps/api/src/aulas/aulas-envio.service.ts:247-280`). Aceito.
7. **O substituto tem exatamente o poder do papel naquele dia.** Na chamada: presença, marcações
   e os pontos que elas geram. No registro de classe: presença, requisitos, tarefa de casa e
   especialidades, como o instrutor (`aulas-envio.service.ts:293-361`, `aulas/tarefas-envio.ts:77-79`,
   permissão `requisito.marcar`, `packages/shared/src/permissoes.ts:22`). Nada além do alvo e do dia.

## Riscos aceitos

- **Quem abre primeiro fica com o link.** Em grupo de WhatsApp, qualquer um que abra na janela e
  digite um nome o prende ao próprio celular e passa a ver nomes e idades da unidade ou da classe
  (`apps/api/src/sync/pacote-instrutor.service.ts:108,139`). O dano é de um dia e um alvo; o Adm vê
  em A4 quem abriu e cancela.
- **Nome livre.** Quem digita escolhe o nome. Onde ele aparece fora do R1, leva "(substituto)"
  (ver "Autoria").
- **Log do nginx.** O caminho com o token vai para o log de acesso (`apps/web/nginx.conf:9`), como
  já acontece com `/acesso/:token`. O Sentry passa a mascará-lo.
- **Gravação até o fim do envio.** Um cliente adulterado pode gravar até 12 horas depois do fim,
  sempre só no alvo e no dia do link.

## O que muda para quem usa

- **Adm:** na ficha da unidade e no detalhe da classe aparece o cartão "Substituto para um dia".
  Ele gera o link escolhendo o dia (já vem a próxima reunião), manda pelo WhatsApp ou copia, vê
  se o link foi aberto e por quem, e pode cancelar.
- **Substituto:** abre o link pelo WhatsApp. Antes do horário vê o que é e quando abre. No
  horário diz o nome (ou confirma a conta) e cai na chamada ou no registro da classe, iguais aos
  do titular. Depois de salvar vê a confirmação e pode corrigir até o fim da janela.
- **Quem lê depois:** o detalhe da reunião e o registro da classe dizem que houve substituição,
  quem lançou e qual Adm gerou o link.

## Regras

### Janela

- **Dia elegível:** de hoje até **28 dias à frente**, onde
  `situacaoDaData(data, diaReuniao, eventos)` (`packages/shared/src/formulas/calendario.ts:56-74`)
  dá `temReuniao` (link de unidade) ou `temClasse` (link de classe). Férias já zeram os dois. Os
  eventos vêm de `ServicoCalendario.situacoes` (`apps/api/src/calendario/servico-calendario.ts:12-29`).
- **Início:** `horarioELocalDoDia(...).horario` (`calendario.ts:176-179`: horário da reunião
  extra, senão `ConfiguracaoClube.horaReuniao`, `apps/api/prisma/schema.prisma:225`), convertido
  para instante no fuso do clube (`schema.prisma:223`). O modelo de uso é
  `apps/api/src/inicio/inicio.service.ts:65-90`. A conversão "data civil + HH:MM + fuso → instante"
  não existe (o shared só tem `hojeNoFuso`, `packages/shared/src/datas.ts:30`): nasce
  `instanteDoHorario(data, horario, fuso)` em `packages/shared/src/datas.ts`, testada com fuso
  diferente de `America/Sao_Paulo` e com reunião às 22:00 (o fim cai no dia seguinte; a data do
  link continua o dia civil do início).
- **Fim:** início + 3h. **Fim do envio:** fim + 12h (S5).
- Início, fim e fim do envio são **gravados na geração**, em UTC. Mudar o horário da reunião ou
  apagar o evento depois não mexe no link gerado; para corrigir, o Adm gera outro.
- O dia de hoje com o fim já passado não é elegível.

### Ciclo do link (Adm)

- Permissão: **`usuario.gerenciar`**, a mesma do convite de acesso
  (`apps/api/src/desbravadores/convite-acesso.controller.ts:15,25,31`); só o Adm a tem
  (`packages/shared/src/permissoes.ts:27,44`). Sem chave nova.
- **Alvo válido:** unidade do clube, ativa (`unidade.ativa`, como `FichaUnidade.tsx:78`); classe
  com `clubeId` do clube, ou oficial com `ClasseClube.ativa ?? true` para o clube
  (`apps/api/src/classes/classes.service.ts:45`; `schema.prisma:516-520`). Fora disso, 404. A
  checagem de hoje (`aulas/apoio.ts:23-26`) aceita classe oficial sem olhar `ClasseClube` e não
  serve aqui. A mesma consulta decide, na leitura, se um link existente virou `CANCELADO` por
  alvo desativado — não há gancho na desativação.
- **Um link aberto por unidade ou classe.** Gerar cancela o aberto anterior do mesmo alvo,
  qualquer que seja o dia, como `convite-acesso.service.ts:44-56`. "Aberto" = não cancelado e com
  o fim do envio ainda por vir.
- Token opaco, guardado só como hash: `gerarTokenOpaco` e `hashDoToken`
  (`apps/api/src/sessao/tokens.ts`). O link é `${urlDoApp()}/substituto/${token}`
  (`convite-acesso.service.ts:56`) e aparece **só na resposta da geração** (A3).
- Mensagem do WhatsApp no padrão de `apps/web/src/modulos/adm/desbravadores/mensagem-convite.ts`
  (`mensagemDoConvite`, `linkDoWhatsApp`), com o texto de A3.
- Cartão do Adm (A4): dia e janela; "Ainda não foi aberto" ou "Aberto por <nome> às HH:MM" (nome da
  conta em S3, o digitado em S2). Passado o fim do envio, volta a A1. **Cancelar** usa
  `Confirmacao` com o texto de A4 e grava `canceladoEm` e `canceladoPorId`; nada se apaga
  (CLAUDE.md).
- Unidade ou classe inativa não mostra o cartão.

### Abrir o link (substituto)

Estados, na ordem em que o servidor os decide:

| Estado | Quando | Tela |
|---|---|---|
| `INEXISTENTE` | hash não encontrado | S7 "Este link não existe" |
| `CANCELADO` | `canceladoEm` preenchido, ou alvo desativado | S7 "O Adm cancelou este link" |
| `ENCERRADO` | agora ≥ fim | S6 (ou S5, ver abaixo) |
| `ANTES` | agora < início | S1 |
| `EM_OUTRO_APARELHO` | já identificado e o segredo do aparelho não confere | S7 |
| `ABERTO` | dentro da janela | S2, S3, ou direto à tela se este aparelho já se identificou |

- As duas rotas públicas devolvem também **`agora` do servidor**. O aparelho guarda a diferença
  para o próprio relógio e decide S1→S2, a virada da tela aberta e S5/S6 pelo relógio do
  servidor. Celular com hora errada não abre nem fecha o link fora de hora.
- **S5 é decisão do aparelho:** em `ENCERRADO`, se a fila local desta substituição tem pendentes e o
  fim do envio não passou, S5; senão S6.
- **Identificação, uma vez por link**, só dentro da janela (nunca em S1):
  - se o navegador tem sessão válida de alguém com **vínculo ativo no clube do link**, oferece S3
    "Você vai lançar como <nome>". "Não sou <nome>" leva a S2. Conta de outro clube conta como sem
    conta. O servidor lê o cookie `refresh` **sem rotacionar** (método novo em
    `apps/api/src/sessao/refresh.service.ts`, que hoje só tem `criarFamilia`, `rotacionar` e
    revogações, `:49-73`): família não revogada, token não expirado, sem marcar uso;
  - senão, S2: nome com 3 a 80 caracteres depois de aparar espaços; ao sair do campo e ao
    confirmar, mensagem junto dele ("Escreva seu nome e sobrenome") sem limpar o digitado.
- **Prender o aparelho é atômico.** Numa transação: `updateMany` em `Substituicao` com
  `aparelhoHash` nulo, não cancelada e agora < fim, como o consumo do convite
  (`apps/api/src/auth/convite-acesso-publico.service.ts:88`). Só com contagem 1 cria o usuário de
  substituição (S2) e grava `aparelhoHash`, `substitutoId` e `identificadaEm`. Contagem 0 →
  `EM_OUTRO_APARELHO`, sem criar usuário. O reingresso compara o hash do segredo em tempo constante
  (`timingSafeEqual`).
- O segredo do aparelho (token opaco; só o hash fica no banco) vai em `localStorage` sob a chave do
  link, junto com o fim do envio. Reabrir pelo mesmo navegador entra direto. Outro navegador do
  mesmo celular, ou aba anônima recarregada, cai em S7 — o texto de S7 já diz para abrir pelo
  navegador de antes.
- **Dados locais da substituição são apagados** — fila, pacote e rascunhos da identidade dela —
  ao chegar em S6, em `CANCELADO` ou depois do fim do envio. Em `CANCELADO` com pendentes, S7 diz
  antes quantos não foram enviados (texto no desenho). Ao abrir o app, a limpeza de abertura
  (`apps/web/src/offline/limpeza.ts:11-21`) apaga também as identidades de substituição cujo fim do
  envio guardado já passou. O pacote traz nomes e idades de menores e o celular pode ser emprestado.

### Autoria

- **Todo autor continua sendo um usuário.** Os campos de autor que a chamada e o registro de
  classe gravam ficam obrigatórios e sem mudança (`reunioes-envio.service.ts:88,137,138,194,256,266,284,336`;
  `aulas-envio.service.ts:186,261,271,318,378,403,411`; `aulas/tarefas-envio.ts:109,146,150,219,265,287,298`).
- **Membro reconhecido (S3):** o autor é o próprio usuário.
- **Quem digitou o nome (S2):** a identificação cria um **usuário de substituição**: `nome`
  digitado, `email` = `substituto-<id da substituição>@substituto.invalid` (`.invalid` nunca
  entrega e-mail), `senhaHash` nulo, status novo **`SUBSTITUTO`** e **nenhum vínculo**.
  - Não aparece em lugar nenhum de listagem: as únicas consultas que listam usuários exigem vínculo
    no clube (`apps/api/src/usuarios/usuarios.service.ts:86-88,99-100`).
  - Não entra: login e "esqueci a senha" já exigem status `ATIVO` (`apps/api/src/auth/auth.service.ts:38,75-79`).
  - Recusa explícita de `SUBSTITUTO`, para não depender de acaso: em `POST /usuarios` com e-mail
    existente (`usuarios.service.ts:117-138`, que hoje anexaria vínculo) e no aceite do convite por
    link (`convite-acesso-publico.service.ts:59-68`).
- **"(substituto)" fora do R1.** O nome do usuário de substituição aparece hoje sem marca no mural
  da visão geral do Adm (`apps/api/src/visao-geral/visao-geral.service.ts:19,254-264`, a partir da
  atividade gravada em `aulas-envio.service.ts:407-415`) e em "marcada por" de requisitos e
  especialidades (`apps/api/src/especialidades/especialidades-dbv.service.ts:33-40`,
  `apps/api/src/progresso/servico-progresso.ts:175-193`). Um helper `nomeDoAutor({ nome, status })`
  na API devolve "<nome> (substituto)" quando o status é `SUBSTITUTO`, usado nesses pontos e na
  descrição da atividade. Membro aparece com o nome dele, sem marca.
- **"Houve substituição":** `Reuniao` e `RegistroAula` ganham `substituicaoId` anulável. O envio
  com sessão de substituição grava o id **só quando gravou algo** (`gravadas.length > 0` na chamada;
  `gravouAlgo` no registro de classe, `aulas-envio.service.ts:107`). Reenvio sem mudança não marca.
  Envio posterior do titular não apaga a marca. Vale a última substituição que gravou.

### Credencial e escopo (API)

- **Credencial própria:** JWT do mesmo segredo (`apps/api/src/sessao/access-token.service.ts`)
  com carga `{ sub: <id da substituição>, tipo: 'substituicao' }` e validade até o fim do envio.
  `verificar()` (`access-token.service.ts:31-39`), único usado pela guarda, passa a **recusar
  qualquer carga com `tipo`**: hoje ele só exige `sub` e aceitaria a credencial como sessão sem
  vínculo nas rotas `@Autenticado`. `verificarSubstituicao()` (novo) aceita só
  `tipo === 'substituicao'`. Não há outro consumidor do JWT (WebSocket, SSE, download).
- **Conferida no banco a cada requisição**, como o vínculo hoje (`apps/api/src/sessao/sessao.service.ts:19`):
  cancelada, alvo inativo, sem aparelho identificado ou fora do prazo → 401 com código
  **`SUBSTITUICAO_ENCERRADA`**. Prazo = fim para leituras, fim do envio para gravações.
- **Só `SUBSTITUICAO_ENCERRADA` encerra a tela do substituto.** Um 401 `NAO_AUTENTICADO` (rota fora
  da lista) é defeito, não encerramento, e vai para o Sentry como erro.
- **Decoradores novos:** `@PodeOuSubstituto(chave)` e `@LogadoOuSubstituto()` gravam o mesmo
  metadado de `@Pode`/`@Logado` mais um metadado extra que **não** entra em `CHAVES_DE_ACESSO`
  (`apps/api/src/comum/decorators/acesso.ts:6`). A contagem de declarações
  (`apps/api/src/comum/guards/guarda-sessao.guard.ts:16-19`) e a varredura de rotas
  (`apps/api/src/comum/varredura-de-rotas.spec.ts:22-27`) seguem iguais.
  - `GuardaSessao`: nas rotas sem o metadado extra, só `verificar()`; nas marcadas, tenta
    `verificar()` e, se a carga tem `tipo: 'substituicao'`, `verificarSubstituicao()`.
  - `GuardaPermissao` (`apps/api/src/comum/guards/guarda-permissao.guard.ts:16-37`): sessão de
    substituição passa sem ler vínculo nem ajuste; a rota já é uma das marcadas.
- **Sessão de substituição** no request: a mesma `SessaoLogada`
  (`apps/api/src/comum/decorators/sessao.decorator.ts:14-17`) com `usuarioId` = autor (membro ou
  usuário de substituição), `clubeId` do link, `papel` = `CONSELHEIRO` (unidade) ou `INSTRUTOR`
  (classe), `vinculoId` = id da substituição, e o campo novo opcional `substituicao: { id,
  unidadeId, classeId, data }`. Os serviços seguem lendo os mesmos campos. `sessao.vinculoId` só é
  lido em escopo, permissão e observações, que a credencial não alcança fora do escopo.
- **Escopo:** `unidadesDoConselheiro` e `classesDoInstrutor`
  (`apps/api/src/desbravadores/escopo.service.ts:36-51`) devolvem só o alvo do link quando há
  `sessao.substituicao`. Permissões dentro dos serviços: as **padrão do papel**
  (`permissoes.ts:57-70`); a busca de ajuste por `vinculoId` (`escopo.service.ts:26-31`) não acha
  nada para o id da substituição e cai no padrão.
- **Data:** toda gravação com sessão de substituição exige `envio.data` igual ao dia do link, logo
  depois do escopo (`reunioes-envio.service.ts:57`, `aulas-envio.service.ts:79`); fora disso, 404
  (CLAUDE.md). As regras de prazo de hoje (`reunioes-envio.service.ts:161-180`,
  `aulas-envio.service.ts:204-222`) continuam e não colidem com a janela.
- **Rotas que aceitam a credencial — e nenhuma outra:**

| Rota | Hoje → com a mudança | Restrição com a credencial |
|---|---|---|
| `GET /sync/pacote` | `@Logado` (`sync/sync.controller.ts:12`) → `@LogadoOuSubstituto` | ver "Pacote" |
| `PUT /sync/reunioes/:uuid` | `@Pode('reuniao.registrar')` (`reunioes/reunioes.controller.ts:19-20`) → `@PodeOuSubstituto` | link de unidade; unidade e dia do link |
| `GET /reunioes` | `@Pode('reuniao.ver')` (`reunioes.controller.ts:29`) → idem | só a unidade e o dia do link |
| `GET /reunioes/:id` | `@Pode('reuniao.ver')` (`reunioes.controller.ts:35-39`) → idem | 404 se não for a unidade e o dia do link |
| `PUT /sync/aulas/:uuid` | `@Pode('aula.registrar')` (`aulas/aulas.controller.ts:19-20`) → idem | link de classe; classe e dia do link |
| `GET /classes/:id/aulas` | `@Pode('aula.registrar')` (`aulas.controller.ts:30`) → idem | só a classe e o dia do link |
| `GET /aulas/:id` | `@Pode('aula.registrar')` (`aulas.controller.ts:40`) → idem | 404 se não for a classe e o dia do link |
| `GET /classes/:id/cronograma` | `@Logado` (`cronogramas/cronogramas.controller.ts:13-14`) → `@LogadoOuSubstituto` | só link de classe e a classe do link; link de unidade → 404 |

  `FormularioAula.tsx:131` chama o cronograma sempre que está online (`apps/web/src/api/cronograma.ts:17-19`);
  sem ele na lista, o substituto de classe seria expulso ao abrir. O serviço
  (`cronogramas/servico-cronograma.ts:67-73,127`) já filtra por `classesDoInstrutor`; ele devolve
  também os nomes dos instrutores da classe (`:111-122`) — aceito.
- **Pacote:** `SyncService.pacote` (`apps/api/src/sync/sync.service.ts:37-75`) monta pelo papel e
  pelo escopo, que já devolvem só o alvo. Com sessão de substituição: `reunioesRecentes` traz **só
  o dia do link** (hoje 30 dias, `:16`); `albunsRecentes` vazio; `membros[].voce` sempre falso;
  `usuarioId` e `vinculoId` (`packages/shared/src/contratos/sync.ts:60-61`; preenchidos em
  `sync.service.ts:51-52` com `sessao.usuarioId`) valem **o id da substituição**, a identidade
  local do aparelho. `PacoteInstrutorService.montar` (`sync/pacote-instrutor.service.ts:34-62`)
  passa a receber `classeIds` em vez de lê-los do vínculo (`:37`).

### Rotas novas

| Rota | Acesso | O quê |
|---|---|---|
| `GET /substituicoes/datas?tipo=CHAMADA\|CLASSE` | `@Pode('usuario.gerenciar')` | dias elegíveis com início e fim (A2) |
| `GET /unidades/:id/substituicao` · `GET /classes/:id/substituicao` | `@Pode('usuario.gerenciar')` | o link aberto do alvo, ou nulo; com `identificadaEm` e `substituto` (nome) quando houver (A1/A4) |
| `POST /unidades/:id/substituicao` · `POST /classes/:id/substituicao` | `@Pode('usuario.gerenciar')` | gera; corpo `{ data }`; devolve o link uma vez (A3) |
| `DELETE /unidades/:id/substituicao` · `DELETE /classes/:id/substituicao` | `@Pode('usuario.gerenciar')` | cancela o aberto |
| `GET /auth/substituicao/:token` | `@Publica` + limite | estado, tipo, nome do alvo, dia, janela, `agora` e a conta reconhecida, se houver |
| `POST /auth/substituicao/:token/entrar` | `@Publica` + limite | identifica (primeira vez) ou reentra com o segredo; devolve credencial, segredo (só na primeira), identidade e `agora` |

- As públicas ficam em `apps/api/src/auth/`, como as do convite
  (`auth/convite-acesso-publico.controller.ts:15-32`). Sob `/api/auth` o navegador manda o cookie
  `refresh` (`path=/api/auth`, `sameSite=strict`, `auth/cookie-refresh.ts:4-14`). A chegada pelo
  WhatsApp é navegação entre sites e não leva o cookie; as chamadas do app depois, mesmo site,
  levam. O segredo do aparelho vai num cabeçalho próprio no GET e no corpo do POST.
- **Limites próprios, por hash do token** (não por IP: num wi-fi de igreja vários substitutos
  dividem o IP): GET 30 por minuto, POST 10 por minuto. `LIMITE_ACEITE_POR_LINK` não serve: ele
  rastreia `body.email` e cai no IP (`auth/limite.ts:19-23,43-45`). O GET leva
  `@SkipThrottle({ porEmail: true })`, como o convite.
- Toda leitura pelo token usa `PrismaSistema`, permitido em `auth/` e `sessao/` (CLAUDE.md); a
  escrita de `Substituicao` leva o `clubeId` do link. Unidade ou classe de outro clube → 404.
- Contratos novos e alterados só em `packages/shared` (CLAUDE.md).

### Dados (migration `20261009120000_substituicao`)

Na ordem:
1. `ALTER TYPE "StatusUsuario" ADD VALUE 'SUBSTITUTO'` (o tipo nasceu em
   `20260929174342_fase0_fundacao`), sem usar o valor no mesmo arquivo. `SUBSTITUTO` entra também em
   `STATUS_USUARIO` (`packages/shared/src/enums.ts:4,23`). Nenhum mapa exaustivo quebra.
2. Tabela `Substituicao`: `id`, `clubeId`, `tipo` (enum novo `TipoSubstituicao`: `CHAMADA` |
   `CLASSE`), `unidadeId` anulável, `classeId` anulável, `data` (`@db.Date`), `inicioEm`, `fimEm`,
   `fimEnvioEm` (timestamptz), `tokenHash` único, `aparelhoHash` anulável, `identificadaEm`
   anulável, `substitutoId` anulável (FK `Usuario`), `criadoPorId` (FK `Usuario`), `criadoEm`,
   `canceladoEm` anulável, `canceladoPorId` anulável. `@@unique([clubeId, id])` e índice por alvo.
3. CHECK escrito à mão, como o único precedente (`migrations/20261002130000_tarefa_casa/migration.sql:2-3,30`):
   exatamente um de `unidadeId` e `classeId`, coerente com `tipo`.
4. `Reuniao.substituicaoId` e `RegistroAula.substituicaoId`, anuláveis, com **FK composta**
   `(clubeId, substituicaoId)` → `Substituicao(clubeId, id)`, no padrão de `TarefaCasa` (mesma
   migration, `TarefaCasa_clubeId_id_key`).
5. `Substituicao` entra em `MODELOS_DE_CLUBE` (`apps/api/src/comum/prisma/guarda-clube.ts:5-41`) e na
   lista literal de `guarda-clube.spec.ts:72-73`, que quebra sem isso.

Ids pelo Prisma Client (CLAUDE.md); a migration não insere linha. A carga oficial
(`scripts/carga.sh`) não toca nessas tabelas.

### Mostrar a substituição (R1)

- `ReuniaoDetalhe` (`packages/shared/src/contratos/reunioes.ts:83-100`) e `AulaDetalhe`
  (`contratos/aulas.ts:61-71`) ganham `substituicao: { autor: string; semConta: boolean;
  geradoPor: string; lancou: boolean }`, `.nullable().default(null)` (como `PacoteSaida.instrutor`),
  para os fixtures de `apps/web/src/testes/handlers/` seguirem válidos. `lancou` = o substituto é
  quem criou o registro (`registradaPorId`/`registradoPorId`).
- Texto: "**Substituição.** Chamada lançada por <autor> (sem conta no app), pelo link que <Adm>
  gerou." Sem o parêntese para membro; "alterada" no lugar de "lançada" quando `lancou` é falso. No
  registro de classe: "Registro da classe lançado/alterado por …".
- Onde: `apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx:51` (junto do "Registrada por"
  de hoje), `apps/web/src/modulos/adm/reunioes/FichaReuniao.tsx:37`, e o formulário do registro de
  classe ao abrir um registro existente (`apps/web/src/modulos/aulas/FormularioAula.tsx`, acima dos
  campos). **Só online:** offline o formulário lê do pacote (`EdicaoGuardada`), que não traz a
  substituição. Aceito.

### Front

- **Rota pública** `/substituto/:token`, montada com as públicas de
  `apps/web/src/modulos/acesso/rotas.tsx:10-16`, com rotas aninhadas para a tela (`chamada`,
  `chamada/:id`, `classe`). Ela é filha do `ProvedorSessao`, que envolve o roteador inteiro
  (`apps/web/src/main.tsx:50-52`).
- **O `ProvedorSessao` não age nessa rota.** Ele decide pelo `window.location.pathname` no
  **primeiro render** (fica fora do roteador) e, começando com `/substituto/`, fica `anonima` e
  pula **todos** os efeitos: boot com refresh e `/api/eu`, limpeza de dados guardados
  (`apps/web/src/sessao/ProvedorSessao.tsx:156,160`, que mantém a fila), o efeito do motor que
  liga e **para** o motor (`:199-206`), a recuperação (`:213-250`) e os ouvintes de conexão
  (`:176-187,269-271`). Sem isso, o efeito do pai pararia o motor do substituto. O helper de teste
  `apps/web/src/testes/renderizar.tsx:12-18` (memory router, jsdom em "/") ganha um
  `history.pushState` antes de montar, para o desvio ser testável.
- **`ProvedorSessaoSubstituto`** (novo) sobrescreve o `ContextoDaSessao`
  (`apps/web/src/sessao/useSessao.ts:11-35`) para a árvore de dentro: `situacao: 'autenticada'`;
  `eu` sintético (usuário com id = **id da substituição** e o nome de quem lança; `vinculoAtivo` com
  id = id da substituição, o papel, o clube, a unidade ou a classe); **`vinculoAtivo` também no
  topo do contexto** (`offline/usePacote.ts:16` o lê de lá; `TelaRegistroAula.tsx:35` lê de `eu`);
  `pode` com as permissões padrão do papel; funções de sessão sem efeito. As telas só leem
  `eu.usuario.id`, `vinculoAtivo` e `pode('requisito.marcar')` (`FormularioChamada.tsx:136,175`,
  `TelaRegistroAula.tsx:31-35`, `FormularioAula.tsx:64,119,223,282`).
- **Conexão é dele.** Hoje só o `ProvedorSessao` chama `definirConexao`, e o motor só envia com
  `ONLINE` (`ProvedorSessao.tsx:78,112,149,187,271`). O provedor do substituto liga os eventos
  `online`/`offline` e a falha de rede do cliente, e volta a `ONLINE` sondando
  `GET /auth/substituicao/:token`. Sem isso, depois de uma queda a fila do substituto não sobe mais e
  as telas não escolhem entre o caminho guardado e o do servidor.
- **A identidade local é o id da substituição**, nunca o da conta: fila, pacote e rascunhos são
  chaveados por usuário e vínculo (`apps/web/src/offline/banco.ts:36-41`), e o motor da conta do
  membro pegaria os itens da substituição se a chave fosse a mesma (`offline/fila.ts:105-114`).
- **Nunca gravar a identidade da substituição** com `gravarIdentidade`
  (`apps/web/src/offline/identidade.ts:8-10`): `lerUltimaIdentidade` (`:17-23`) pega a mais
  recente, e o app do membro reabriria como substituto.
- **Credencial no cliente** (`apps/web/src/api/cliente.ts:68-75`): modo de substituição em que o
  401 **não** chama o refresh (`cliente.ts:186-206`, que renovaria a sessão do membro pelo cookie);
  `SUBSTITUICAO_ENCERRADA` leva ao estado encerrado. O prefixo `/api/auth/substituicao/` entra em
  `ROTAS_SEM_TOKEN` (`cliente.ts:88-96`), senão um 401 do primeiro GET, com o modo ainda desligado,
  chamaria o refresh. Recarregar a página reentra com o segredo do aparelho.
- **Motor da fila com trava própria.** Hoje ele roda sob o Web Lock global `fila` e a aba que o pega
  segura enquanto roda (`offline/motor.ts:32,65-77`). Com o app do membro aberto noutra aba, a fila
  do substituto não andaria. A substituição usa a trava `fila:<id da substituição>` e processa só os
  itens da identidade dela. O `BroadcastChannel('fila')` não muda.
- **Alvo travado.** A chamada nova escolhe unidade por estado local e usa a data de hoje
  (`TelaChamada.tsx:60-62`); o pacote do substituto só tem a unidade do link, e hoje é o dia do link.
  O registro de classe tem seletor de classe e de data (`TelaRegistroAula.tsx:68-78`): no modo
  substituto a classe é a única do pacote e a **data fica travada** no dia do link, por um contexto
  de "alvo fixo" que a tela lê. Reabrir a chamada do dia vai a `/substituto/:token/chamada/:id`, com o
  id vindo de `reunioesRecentes`.
- **Destinos:** hoje fixos em `apps/web/src/api/reunioes.ts:100-104` (`/reunioes`),
  `apps/web/src/api/aulas.ts:95`, `EstadosChamada.tsx:19`, `EstadosAula.tsx:19` e o
  `CAMINHO_DO_REGISTRO` de `RegistroSemConexao.tsx:11,36,53`. Passam a vir de um contexto de
  destinos com o padrão de hoje; o provedor do substituto o troca por S8 e pelas rotas aninhadas.
- **Faixa (S4)** no topo da página, rolando junto: o app não usa barra presa.
- **Fim da janela com a tela aberta:** pelo relógio do servidor, a faixa e o formulário dão lugar a
  S5 ou S6 sem recarregar. O que estava sendo digitado e não foi salvo se perde; o que foi salvo
  segue na fila (S5).
- **Sentry:** `substituto` e `substituicao` entram em `SEGMENTOS_ANTES_DO_TOKEN`
  (`packages/shared/src/url-sem-segredo.ts:2`), que os dois lados usam (`apps/api/src/sentry/opcoes-sentry.ts`,
  `apps/web/src/sentry.ts`).

## Mecânicas de condução (skill `gamificacao`)

Fluxo curto e raro para o substituto, eventual para o Adm: cabe pedir menos, confirmar na hora e
fechar com o próximo passo. Nada de etapa nem barra.

| Mecânica | Onde | Atrito que resolve |
|---|---|---|
| Pedir menos | A2 já marca a próxima reunião; S3 não pede nome a quem tem conta; S1 não pede nada | Adm e substituto não respondem o que o sistema já sabe |
| Uma pergunta por tela | A2 (o dia), S2 (o nome) | quem usa pouco celular decide uma coisa por vez |
| Confirmação no campo | S2 valida o nome ao sair do campo | erro corrigido na hora, sem perder o digitado |
| Fechamento com o próximo passo | A3 (mandar pelo WhatsApp), S8 (abrir de novo até o fim) | terminar sem saber se terminou |
| Tempo dito em palavras | S1 "abre às 09:00 e fica aberto até 12:00"; faixa "aberto até 12:00" | saber quando voltar e quanto tempo tem |

**Considerado e descartado:** contagem regressiva (urgência falsa, proibida pela skill; o horário de
fechar escrito basta); etapas e progresso (duas perguntas no máximo); lembrete ao substituto (fora de
escopo; o WhatsApp é o canal).

**Como saber se funcionou:** a proporção de reuniões e registros de classe lançados no dia em que o
titular faltou. O projeto não mede ausência de titular; fica como pendência, não como pacote.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos.** O cartão precisa de um dia com reunião nas próximas 4 semanas. Sem nenhum
  (férias longas), A2 diz "Não há reunião no calendário nas próximas 4 semanas" e oferece "Abrir o
  calendário" (`/adm/calendario`). Unidade sem membro: o link funciona e a tela do titular já diz
  "Nenhum desbravador nesta unidade" (`TelaChamada.tsx:60`).
- **Vazio.** Cartão sem link (A1) ensina o que é e oferece o único botão. Não há lista.
- **Bloqueio.** S6 e S7 são estados sem saída no app: o texto diz a quem pedir. Os vazios da tela
  do titular que mandam "ligar você a uma unidade" (`TelaChamada.tsx:59`) e "Esta classe não é sua"
  (`TelaRegistroAula.tsx:76`) não podem aparecer ao substituto, porque o pacote dele sempre traz o
  alvo; se aparecerem, é defeito.
- **Perfil e escopo.** Só quem tem `usuario.gerenciar` vê o cartão. O substituto não vê menu,
  cabeçalho de papel, histórico, galeria nem outro alvo; a API recusa com 404 o que estiver fora do
  alvo e do dia.

## Fora de escopo

- Histórico de substituições para o Adm (lista, filtros, relatório).
- Aviso ao titular ou ao substituto (notificação, e-mail).
- Link de vários dias, para mais de um alvo, ou mais de um link aberto por alvo.
- Substituto mexer em outro dia, na galeria, no histórico ou no cronograma.
- Medir ausência de titular.
- Converter o usuário de substituição em conta de verdade.
- Mudar o formato do log do nginx.

## Critério de pronto

Cada item vira teste ou item do roteiro de QA, com ação e resultado observável.

**Adm**
1. Na ficha de uma unidade ativa, o Adm vê A1; um conselheiro não vê o cartão, e
   `POST /unidades/:id/substituicao` responde 403 para ele.
2. A2 lista só dias com reunião (ou com classe, para link de classe) de hoje até 28 dias, com a
   próxima marcada, e o botão diz o dia. Com o fim de hoje já passado, hoje não aparece. Sem nenhum
   dia, mostra o texto e o botão de "Descobribilidade".
3. Gerar mostra A3 com a mensagem do WhatsApp contendo unidade, dia, início, fim e link; "Copiar
   link" mostra "Link copiado." sem sumir sozinho.
4. Gerar um segundo link para o mesmo alvo faz o primeiro responder `CANCELADO`.
5. Depois da identificação, A4 mostra "Aberto por <nome> às HH:MM"; cancelar pede a confirmação de A4
   e, confirmado, a próxima requisição do substituto (leitura ou gravação) recebe
   `SUBSTITUICAO_ENCERRADA`.
6. Unidade de outro clube, classe personalizada de outro clube, e classe oficial desativada no
   clube → 404 nas rotas do Adm.

**Substituto**
7. Antes do início, S1 com alvo, dia, início e fim; `POST …/entrar` é recusado.
8. Dentro da janela, sem conta no navegador: S2; nome com menos de 3 caracteres mostra a mensagem
   junto do campo sem apagar o digitado; com nome válido, cai na tela de chamada com a faixa S4.
9. Dentro da janela, com sessão de conselheiro do mesmo clube no navegador: S3 com o nome da conta;
   "Começar a chamada" grava o autor como esse usuário; "Não sou <nome>" leva a S2. Depois, o papel
   ativo, os papéis e a fila da conta estão como antes (banco local e `/api/eu`), e o token de
   refresh não rotacionou.
10. Reabrir no mesmo navegador entra direto; outro aparelho vê S7 "já está aberto em outro celular".
    Dois `POST …/entrar` simultâneos: um entra, o outro recebe `EM_OUTRO_APARELHO`, e só um usuário
    de substituição é criado.
11. Salvar a chamada mostra S8; "Abrir a chamada de novo" volta à mesma chamada com o que foi salvo.
12. A rota do substituto renderiza os mesmos `TelaChamada` e `TelaRegistroAula` do titular (teste
    que importa as rotas do substituto e confere o componente).
13. No registro de classe do substituto, a data não pode ser trocada.
14. Com o aparelho offline, salvar guarda na fila; ao voltar a conexão, o item sobe sem recarregar.
    Com o app do membro aberto noutra aba do mesmo navegador, o item do substituto também sobe.
15. Depois do fim: S6, e os dados locais da substituição somem do banco local. Com item na fila e
    antes do fim do envio: S5, e o item sobe quando a conexão volta. Depois do fim do envio, a
    gravação é recusada com `SUBSTITUICAO_ENCERRADA`.
16. Com o relógio do aparelho adiantado em 2 horas, o link ainda abre e fecha pelo horário do servidor.
17. Com a credencial de substituição: rota fora da tabela → 401 `NAO_AUTENTICADO` (e a tela não
    encerra); `GET /reunioes/:id` de outra unidade ou outro dia → 404; `PUT /sync/reunioes/:uuid`
    com outra data → 404; `GET /classes/:id/cronograma` de outra classe ou com link de unidade → 404.
18. Teste de varredura: exatamente as rotas da tabela carregam o metadado de substituição.
19. JWT de substituição em `/api/eu` (`@Autenticado`) → 401.
20. O caminho com o token chega ao Sentry como `/substituto/:token` e `/api/auth/substituicao/:token`.

**Registro**
21. Chamada lançada por quem digitou o nome: o detalhe da reunião (conselheiro e Adm) mostra
    "Substituição. Chamada lançada por <nome> (sem conta no app), pelo link que <Adm> gerou."
22. Chamada que o titular já tinha lançado e o substituto alterou: o mesmo texto com "alterada".
    Reenvio do substituto sem mudança não grava a marca.
23. O registro de classe lançado por quem digitou o nome aparece no mural do Adm como
    "<nome> (substituto) registrou a classe de …", e o requisito marcado aparece "marcado por <nome>
    (substituto)".
24. O usuário de substituição não aparece na lista de usuários do Adm, não entra pelo login, e
    `POST /usuarios` com o e-mail dele é recusado.
25. Os pontos da chamada lançada pelo substituto entram no ranking como os do titular.

**Acessibilidade e texto**
26. Toda tela nova tem letra de corpo ≥ 16px, alvo de toque ≥ 44px e contraste ≥ 4,5:1, medido no
    DOM; nenhum aviso some sozinho; S5 anuncia o progresso numa região viva educada.
27. Nenhum texto visível novo usa "aula": é "classe" ou "registro da classe".

## ONDE FICA

```
- escopo da chamada e do registro          apps/api/src/reunioes/apoio.ts:14-31 · apps/api/src/aulas/apoio.ts:14-28
- escopo por vínculo e ajustes             apps/api/src/desbravadores/escopo.service.ts:26-51
- guarda de sessão e contagem              apps/api/src/comum/guards/guarda-sessao.guard.ts:15-40
- guarda de permissão                      apps/api/src/comum/guards/guarda-permissao.guard.ts:16-37
- chaves de acesso e decoradores           apps/api/src/comum/decorators/acesso.ts:1-16 · pode.decorator.ts:5
- sessão no request                        apps/api/src/comum/decorators/sessao.decorator.ts:5-40
- varredura de rotas                       apps/api/src/comum/varredura-de-rotas.spec.ts:22-27 · apps/api/test/rotas.ts
- JWT                                      apps/api/src/sessao/access-token.service.ts:28,31-39
- refresh (sem leitura sem rotação hoje)   apps/api/src/sessao/refresh.service.ts:49-73 · apps/api/src/auth/cookie-refresh.ts:4-14
- token opaco e hash                       apps/api/src/sessao/tokens.ts
- convite por link (molde)                 apps/api/src/desbravadores/convite-acesso.service.ts:44-56 · apps/api/src/auth/convite-acesso-publico.service.ts:59-68,88 · convite-acesso-publico.controller.ts:15-32
- limites de taxa                          apps/api/src/auth/limite.ts:19-23,43-45 · teste apps/api/src/auth/limite.spec.ts:20,80
- login, esqueci, criar usuário            apps/api/src/auth/auth.service.ts:36-38,75-79 · apps/api/src/usuarios/usuarios.service.ts:86-100,117-138
- pacote                                   apps/api/src/sync/sync.service.ts:16-17,37-75 · sync/pacote-instrutor.service.ts:34-62 · packages/shared/src/contratos/sync.ts:56-87
- envio da chamada                         apps/api/src/reunioes/reunioes-envio.service.ts:57,79,161-180,244-256
- envio do registro de classe              apps/api/src/aulas/aulas-envio.service.ts:79,107,204-222,247-280,407-415 · aulas/tarefas-envio.ts
- rotas de chamada, aula e cronograma      apps/api/src/reunioes/reunioes.controller.ts:19-39 · apps/api/src/aulas/aulas.controller.ts:19-40 · apps/api/src/cronogramas/cronogramas.controller.ts:13-14 · cronogramas/servico-cronograma.ts:67-73,111-127
- leitores do autor                        apps/api/src/reunioes/reunioes.service.ts:80,98,129,132 · apps/api/src/aulas/aulas.service.ts:57,81 · apps/api/src/visao-geral/visao-geral.service.ts:19,254-264 · apps/api/src/especialidades/especialidades-dbv.service.ts:33-40 · apps/api/src/progresso/servico-progresso.ts:175-193
- classe ativa no clube                    apps/api/src/classes/classes.service.ts:45 · schema.prisma:516-520
- calendário (dia e horário)               packages/shared/src/formulas/calendario.ts:56-74,176-179 · packages/shared/src/datas.ts:30 · apps/api/src/calendario/servico-calendario.ts:12-29 · apps/api/src/inicio/inicio.service.ts:65-90
- permissões                               packages/shared/src/permissoes.ts:11-70
- enums e status                           packages/shared/src/enums.ts:4,23 · apps/api/prisma/schema.prisma:31-35
- modelos, FK composta e CHECK             apps/api/prisma/schema.prisma:221-226,240-250,652-720,953-985 · migrations/20261002130000_tarefa_casa/migration.sql:2-3,30-38
- guarda de clube                          apps/api/src/comum/prisma/guarda-clube.ts:5-41 · guarda-clube.spec.ts:72-73
- Sentry e token no caminho                packages/shared/src/url-sem-segredo.ts:2 · apps/api/src/sentry/opcoes-sentry.ts · apps/web/src/sentry.ts · apps/web/nginx.conf:9
- fábricas e relógio de teste              apps/api/test/fabricas.ts:75,85,109,115,191,205,242,264,503 · apps/api/test/relogio.ts · apps/api/test/app-auth.ts:14
- provedor de sessão                       apps/web/src/main.tsx:50-52 · apps/web/src/sessao/ProvedorSessao.tsx:78-112,149-160,176-271 · apps/web/src/sessao/useSessao.ts:11-43
- cliente HTTP                             apps/web/src/api/cliente.ts:68-75,88-97,186-206
- offline                                  apps/web/src/offline/motor.ts:32-77 · fila.ts:33-114 · banco.ts:36-41 · identidade.ts:8-23 · limpeza.ts:11-21 · usePacote.ts:16
- telas reaproveitadas                     apps/web/src/modulos/reunioes/chamada/{TelaChamada,FormularioChamada}.tsx · apps/web/src/modulos/aulas/{TelaRegistroAula,FormularioAula}.tsx · apps/web/src/api/cronograma.ts:17-19
- destinos fixos                           apps/web/src/api/reunioes.ts:100-104 · apps/web/src/api/aulas.ts:95 · EstadosChamada.tsx:19 · EstadosAula.tsx:19 · RegistroSemConexao.tsx:11,36,53
- rotas web                                apps/web/src/rotas.tsx:61-110 · apps/web/src/modulos/acesso/rotas.tsx:10-16
- telas do Adm                             apps/web/src/modulos/adm/unidades/FichaUnidade.tsx:78,127,146 · apps/web/src/modulos/adm/classes/DetalheDaClasse.tsx
- WhatsApp                                 apps/web/src/modulos/adm/desbravadores/{mensagem-convite.ts,AcessoAoApp.tsx}
- R1                                       apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx:51 · apps/web/src/modulos/adm/reunioes/FichaReuniao.tsx:37 · packages/shared/src/contratos/{reunioes.ts:83-100,aulas.ts:61-71}
- testes de tela                           apps/web/src/modulos/reunioes/chamada/chamada.test.tsx:10,98,109 · apps/web/src/testes/{renderizar.tsx:9-18,servidor.ts:10,handlers/} · apps/web/src/testes/links-que-navegam.test.ts
- conferido em                             6bc7e05
```
