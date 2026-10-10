# App do Desbravador

Monorepo do aplicativo de gestão de clubes de Desbravadores.

| Pasta | O que é |
|---|---|
| `apps/api` | API (NestJS + Prisma + PostgreSQL) |
| `apps/web` | Front (React + Vite, PWA) |
| `packages/shared` | Código compartilhado entre API e front |

Visão, arquitetura e decisões: `docs/planejamento`. Fase 0 (fundação): `docs/fases/fase-0`. Fase 1: `docs/fases/`. Fase 3 (Adm): `docs/fases/fase-3`. Convenções para agentes: `CLAUDE.md`.

## Pré-requisitos

- Node 22.2 ou mais novo (`.nvmrc`; a leitura de planilha usa `zlib.crc32`)
- Docker com Compose
- `age` e `rclone`, só para backup

## Subir o ambiente de dev

```bash
docker compose up -d     # Postgres em localhost:5442; Mailpit: SMTP em 1026, web em http://localhost:8026
cp .env.exemplo .env
npm ci
npm run dev              # API (porta 3001) e front (http://localhost:5173)
```

Os e-mails enviados pela API em dev (convites, por exemplo) aparecem no Mailpit.

Arquivos enviados (fotos e materiais de apoio) ficam em disco, na pasta de `ARQUIVOS_DIR` (`./.arquivos` no `.env.exemplo`). `ARQUIVOS_SEGREDO` assina os links de imagem; gere com `openssl rand -hex 32`. Os dois entram no `.env`.

## Uso sem conexão

O app do conselheiro e do instrutor abre sem internet. Na abertura ele tenta renovar a sessão, espera 5 s e tenta de novo; se a rede continua fora e a pessoa entrou há menos de 7 dias (último contato com a API), abre em modo sem conexão com a faixa "Sem conexão" no topo, usando o último pacote guardado no aparelho. Sem identidade guardada válida (nunca entrou ou passou de 7 dias), vai para `/conectar`, que pede internet e tem "Tentar de novo". Em modo sem conexão o app tenta renovar a sessão a cada 30 s (aba visível) e quando o navegador avisa que a rede voltou.

- **Pacote:** `GET /api/sync/pacote` (exige login ou a credencial do link de substituição; com ela, só o alvo e o dia do link). Traz clube, critérios da chamada, e, para o conselheiro, as unidades com membros, reuniões dos últimos 30 dias e álbuns dos últimos 60; ADM e instrutor recebem as listas de unidades vazias. O instrutor recebe também o campo `instrutor`, com o que precisa para registrar aula sem internet: por classe (as do seu vínculo), os desbravadores cursando no ano com os requisitos já concluídos, os requisitos ativos, as aulas publicadas dos próximos 14 dias e os registros de aula dos últimos 30 dias (presenças com versão), mais os pontos por requisito. Para a tarefa para casa, cada classe traz também as `tarefas` (abertas do ano do clube e as encerradas com entrega em registro recente) e as conclusões de especialidade das tarefas, e o pacote traz o catálogo ativo de `especialidades` (ausente em pacote antigo: a tela pede internet) e `pontosEspecialidade`. Todo pacote traz ainda `calendario`: os eventos não removidos de hoje até 120 dias à frente, para a regra do dia funcionar sem conexão. Só é regravado no aparelho quando a `versao` muda. Baixa na abertura se o guardado tem mais de 15 min, e sempre ao voltar a conexão.
- **Fila de envio (`/fila`, "Aguardando envio"):** o que foi registrado sem conexão fica guardado no aparelho e sobe sozinho, em ordem, quando há internet. Falha de rede ou servidor tenta de novo após 5 s, 15 s, 60 s e 5 min; item em erro mostra a mensagem e oferece "Tentar de novo" e "Descartar" (o descarte avisa quais envios dependem dele e passam a dar erro). "Tentar enviar agora" força uma passada mesmo em modo sem conexão. O selo "N aguardando envio" (pendentes mais erros) leva à fila. Só envia com o app aberto.
- **Tipos de envio:** a fila conhece `REUNIAO` (chamada e correção), `FOTO` e `AULA` (registro de aula e correção). Cada tipo se registra com `registrarTipo` em seu arquivo em `apps/web/src/offline/tipos/` e é importado em `apps/web/src/offline/tipos/todos.ts`, que o `main.tsx` carrega uma vez; tipo novo entra por essa lista. Dois envios da mesma chave viram um só (`fundir`): na chamada a linha mais nova de cada desbravador vence; na foto a chave é única, então nada se funde; na aula (chave `aula:<classeId>:<data>`) a presença mais nova de cada desbravador vence e, por par desbravador+requisito, a última ação (marcar ou desmarcar) vence. Depois de cada envio, o tipo invalida as consultas afetadas; a chamada e a aula também renovam as versões dos itens seguintes da mesma chave e baixam o pacote de novo (a aula ainda invalida aulas, progresso, início, cronograma e ranking).
- **Ler o pacote e rascunhos:** `usePacote()` devolve o pacote guardado no aparelho e reemite a cada gravação no banco local; as telas leem dele quando estão sem conexão. `lerRascunho`, `gravarRascunho` e `apagarRascunho` guardam estado de formulário por usuário e chave; sair do app apaga os rascunhos.
- **Consultas e mutações com `networkMode: 'always'`:** o padrão do cliente de consultas (`main.tsx`) é não esperar o navegador se dizer online. Sem isso, com a rede fora a consulta ficaria pausada e a tela em "carregando" para sempre em vez de falhar e levar o app ao modo sem conexão; e a mutação de salvar a chamada ficaria pausada e nunca chegaria à fila. Mutações que precisam da API (como remover foto) falham nesse caso e a tela avisa.
- **Avisos na fila:** "Entre de novo para enviar" (sessão expirada), "Pouco espaço" (mais de 100 MB de arquivos esperando), envios antigos de outra pessoa descartados (mais de 30 dias) e "Instale o app na tela inicial" (só no iPhone fora da tela inicial). Itens já enviados somem do aparelho após 24 h.
- **Sair com itens na fila:** "Sair" e "Sair de todos os aparelhos" pedem confirmação ("Sair mesmo assim?"). Sair apaga pacote, identidade e rascunhos do aparelho, mas a fila fica e só sobe quando a pessoa entrar de novo.
- **Sessão expirada durante o uso:** a faixa "Sua sessão expirou — salve e entre de novo" (com "Entrar de novo") aparece sem tirar a pessoa da tela; o que já foi guardado na fila continua lá.

## O domingo do conselheiro

Telas do conselheiro, em `apps/web/src/modulos`:

| Rota | O que é |
|---|---|
| `/inicio` | Início do conselheiro (`GET /api/inicio/conselheiro`): a próxima reunião sai do calendário (reunião extra com nome, horário e local próprios; nenhuma nos próximos 120 dias vem vazia) e, quando o próximo dia normal cai em férias, `feriasAte` traz o fim delas |
| `/unidade` | Minha unidade: membros e grade de frequência (`GET /api/unidades/:id/membros` e `/frequencia`). Unidade sem membros oferece "Avisar o Adm" (`POST /api/pedidos-ao-adm`) |
| `/reunioes`, `/reunioes/:id` | Histórico e detalhe da reunião (`GET /api/reunioes`, `/api/reunioes/:id`) |
| `/reunioes/nova`, `/reunioes/:id/editar` | Chamada nova e correção de chamada já feita |
| `/galeria`, `/galeria/:albumId`, `/galeria/enviar` | Álbuns, fotos do álbum e envio de fotos (`GET /api/albuns`, `/api/albuns/:id`, `DELETE /api/fotos/:id`) |
| `/dbv/:id` | Perfil do desbravador, visível também ao Adm e ao instrutor (`GET /api/desbravadores/:id/perfil`); a seção de progresso da classe vem de `GET /api/desbravadores/:id/progresso` e, com `requisito.marcar`, permite marcar e desmarcar requisitos |
| `/ranking` | Ranking do mês, também para Adm e instrutor (`GET /api/ranking?mes=AAAA-MM`; sem `mes`, o mês corrente; `GET /api/ranking/unidades`) |

Permissões: registrar chamada e avisar o Adm exigem `reuniao.registrar`; ver reuniões e frequência, `reuniao.ver`; enviar foto, `foto.enviar`; ver álbuns e remover foto, `foto.ver`; perfil e membros, `dbv.ver`.

**Chamada.** Salvar não chama a API: grava a chamada na fila e volta ao histórico, com ou sem internet. O envio é `PUT /api/sync/reunioes/:uuid`. O UUID da reunião nasce no primeiro toque, então a correção de uma chamada ainda na fila cai no mesmo item. Cada linha e o cabeçalho (horário e observações) carregam a versão vista quando a chamada foi aberta; se outra pessoa mudou aquilo antes, a versão de quem enviou vale, a anterior fica registrada e a tela avisa quem foi afetado. Desbravador que não era da unidade na data fica fora e também é avisado. Enquanto a chamada não é salva, o que foi marcado fica como rascunho no aparelho, por usuário e por `unidade:data`.

**Fotos.** As fotos são reduzidas no aparelho antes de entrar na fila (lado maior de 1600 px; o texto da tela promete no máximo 2 MB cada) e sobem por `PUT /api/sync/fotos/:uuid` (multipart: `dados` em JSON e `arquivo`). A tela de envio lista quem, na unidade, não tem autorização de imagem (`GET /api/unidades/:id/sem-autorizacao-imagem`; sem conexão usa o que está no pacote).

## O Adm

Telas do Adm, sob `LayoutAdm` (menu lateral) e guardadas só para ADM, em `apps/web/src/modulos/adm` e `apps/web/src/modulos/cronograma-montagem`:

| Rota | O que é |
|---|---|
| `/adm` | Visão geral: indicadores, progresso por classe, resumo das unidades, cronogramas enviados aguardando publicação e atividade recente (`GET /api/visao-geral`, `relatorio.geral`) |
| `/adm/classes` | Abas "Classes" e "Especialidades": ativar/desativar classe, escolher quem monta o cronograma, ajustar requisito (ativo, CAMPO) e acrescentar especialidade do clube |
| `/adm/desbravadores` | Lista com filtros (busca, unidade, classe, situação, tipo) e página no endereço: recarregar ou voltar da ficha mantém a lista como estava. Ficha só de leitura em `/adm/desbravadores/:id` (o `/dbv/:id` redireciona o Adm para ela); cadastro em `/adm/desbravadores/novo` e edição em `/adm/desbravadores/:id/editar`, telas próprias no lugar do painel lateral |
| `/adm/usuarios` | Lista por papel (`papel`, `busca` e `pagina` no endereço), ficha em `/adm/usuarios/:id` (com último acesso, um cartão por papel e Desativar no rodapé), `/adm/usuarios/novo` (convite com um papel), `/adm/usuarios/:id/papeis/novo` (acrescentar papel em dois passos; `papel` no endereço pula o primeiro), `/adm/usuarios/:id/papeis/:vinculoId` (alterar escopo e ajustes; Remover papel pede confirmação) e `/adm/usuarios/:id/editar` (só nome e gênero, só de quem ainda está convidado) |
| `/adm/unidades` | Cards de unidades, ficha em `/adm/unidades/:id` (membros e reuniões do mês, `mes` no endereço), `/adm/unidades/nova` e `/adm/unidades/:id/editar` |
| `/adm/calendario` | Calendário do clube por mês (`mes` no endereço): ficha do evento em `/adm/calendario/eventos/:id`, criação em `/adm/calendario/eventos/novo` e edição em `/adm/calendario/eventos/:id/editar` (`GET /api/calendario?ano=`) |
| `/adm/reunioes/:id` | Ficha da reunião, só de leitura. `/adm/reunioes/:id/chamada` é a correção da chamada pelo Adm: envia direto, `PUT /api/sync/reunioes/:uuid`, sem passar pela fila, e por isso só com internet (sem conexão a tela avisa, nada é enviado e as marcas ficam). Só abre para quem a ficha marca com `podeEditar` |
| `/adm/cronogramas` | Montagem do cronograma de uma classe no computador, com escolha de classe e ano do clube |
| `/adm/configuracoes` | Dia, hora e local padrão da reunião, alertas de frequência e de progresso, meta de frequência; fuso e início do ano do clube aparecem só para leitura |
| `/cronograma/montar` | Um endereço, a tela do papel: ADM cai na montagem do computador, instrutor na montagem do celular (só das classes que ele monta). Abre também para instrutor; substituiu a página "Em breve" |

O menu do Adm agora tem link em Visão geral, Classes e especialidades, Calendário do clube, Cronogramas e Configurações do clube; só Relatórios segue "em breve". As telas de ficha e edição abertas a partir de uma lista guardam o endereço (com filtros) de onde vieram, e o "Voltar" do cabeçalho leva de volta a ele; esse helper e os filtros no endereço vivem em `apps/web/src/modulos/adm/navegacao.ts`.

**Componentes de ficha e edição** (`apps/web/src/ui/`): `CabecalhoDaPagina` (voltar, sobretítulo, título, ações), `ListaDePares` (rótulo e valor das fichas), `RodapeDoFormulario` (ações ao fim do formulário de edição) e `EstadoNaoEncontrado` (registro inexistente ou de outro clube, com saída para a lista). Ficha e edição novas do Adm usam esses quatro.

| Endpoint | O que faz | Permissão |
|---|---|---|
| `GET /api/visao-geral` | Indicadores do clube, no formato `VisaoGeralSaida` (`packages/shared`) | `relatorio.geral` |
| `GET` / `PATCH /api/clube/configuracao` | Lê e edita a configuração do clube (PATCH parcial) | `clube.configurar` |
| `PATCH /api/classes/:id` | Ativa/desativa a classe no clube e define `quemMontaCronograma`. Desativar com desbravador cursando no ano do clube é recusado | `classe.gerenciar` |
| `PATCH /api/requisitos/:id/ajuste` | Ajuste do clube sobre requisito oficial (`ativo`, `campo`); `null` volta ao oficial | `classe.gerenciar` |
| `POST /api/especialidades` | Especialidade do clube numa área; nome repetido na área (sem distinguir caixa e acento) dá conflito | `classe.gerenciar` |
| `GET /api/calendario?ano=` | Eventos do ano do clube | logado |
| `GET /api/calendario/eventos/:id` | Um evento do clube; removido ou de outro clube dá 404, id malformado 400 | logado |
| `GET /api/usuarios/:id` | Usuário com todos os vínculos do clube (inclusive inativos) e `ultimoAcessoEm` (também presente na lista); sem vínculo no clube dá 404 | `usuario.gerenciar` |
| `GET /api/unidades/:id` | Uma unidade, no formato da lista. Conselheiro só a sua; inativa só o Adm vê; fora do escopo dá 404 | `dbv.ver` |
| `POST /api/calendario/eventos` · `PATCH` / `DELETE /api/calendario/eventos/:id` | Cria, edita e exclui. Os tipos são `SEM_REUNIAO`, `ACAMPAMENTO`, `EVENTO`, `FERIADO`, `FERIAS` e `REUNIAO_EXTRA`. As marcações são afirmativas: `temReuniao`, `temClasse` e `bomParaCampo` podem faltar e então valem os padrões do tipo (`MARCACOES_PADRAO`); Férias grava sempre o padrão (sem reunião, com classe) e a Reunião extra grava `bomParaCampo` = não. Reunião extra é de um dia só, precisa de reunião, classe ou as duas, e só uma por data. Corpo com `cancelaReuniao` ou `bloqueiaAula` (app antigo) é recusado com "Atualize o app para salvar este evento.". A regra do dia (reunião, classe, campo, férias) é uma só, em `packages/shared/src/formulas/calendario.ts`, e `diasDeReuniao` da resposta de `GET /api/calendario` já traz as reuniões extras. A resposta traz `aulasAfetadas` | `calendario.gerenciar` |

**Conflito de calendário.** Evento criado ou editado que tira o dia de classe de uma aula já agendada gera a notificação "Classe em conflito com o calendário" (tipo `CONFLITO_CRONOGRAMA`) para os instrutores da classe e, quando o Adm monta aquela classe, para os Adm. Evento criado também entra na atividade recente da visão geral.

**Montagem do cronograma.** Todas as rotas abaixo exigem só login (a leitura `GET /api/classes/:id/cronograma` também aceita a credencial do link de substituição de classe, só para a classe dele); a autorização é do serviço: monta o Adm e, se a classe estiver com `quemMontaCronograma = INSTRUTOR`, o instrutor dela. Cronograma de outro clube dá 404.

| Endpoint | O que faz |
|---|---|
| `GET /api/classes/:id/cronograma/montagem?anoClube=` | Cronograma vivo com datas, bloqueios e requisitos alocados; sem cronograma vem `cronograma: null` |
| `POST /api/cronogramas` | Cria o cronograma da classe no ano com início e fim; um por classe e ano (senão conflito) |
| `PATCH /api/cronogramas/:id` | Muda o período; recusado se sobrariam aulas fora dele |
| `PUT` / `DELETE /api/cronogramas/:id/requisitos/:requisitoId` | Coloca (`{ data }`) ou tira o requisito. A data precisa estar no período e ser dia de aula (reunião mantida ou data boa para campo, sem bloqueio) e não pode já ter aula registrada |
| `POST /api/cronogramas/:id/aulas` · `PATCH /api/aulas-planejadas/:id` | Cria aula em data livre (só classes agrupadas; uma por data) e edita horário, local e título |
| `POST /api/cronogramas/:id/enviar` | Rascunho para enviado; só o instrutor liberado (o Adm publica direto). Notifica o Adm |
| `POST /api/cronogramas/:id/publicar` | Publica; só o Adm, e recusa se já publicado. Notifica os instrutores |

Enviar e publicar recebem `atualizadoEmVisto`; se o cronograma mudou depois da versão vista, a API responde conflito em vez de sobrescrever. Enviar e publicar também entram na atividade recente da visão geral. A montagem exige internet: sem conexão as telas mostram "Disponível quando houver internet" e não passam pela fila de envio.
## Substituição por link

Na ficha da unidade e na da classe, o Adm gera um link para um dia com reunião (unidade) ou com classe, até 28 dias à frente (`GET /api/substituicoes/datas`, `POST /api/unidades/:id/substituicao`, `POST /api/classes/:id/substituicao`). Só um link aberto por alvo: gerar outro cancela o anterior, e `DELETE` cancela sem apagar. O endereço do link (`<URL do app>/substituto/<token>`) só aparece na resposta que o gerou.

Quem abre o link, sem login, cai em `/substituto/:token`, que abre no horário da reunião do clube (no fuso dele) e fecha 3 h depois. Se o navegador tem a sessão de um membro do clube, pode lançar como ele; senão digita o nome (3 a 80 caracteres) e vira um usuário `SUBSTITUTO`, sem senha. O link prende o primeiro aparelho que se identifica; outro aparelho vê "já está aberto em outro celular". A tela é a mesma de chamada ou de registro de aula do titular, restrita ao alvo e ao dia. O que foi salvo no aparelho ainda sobe até 12 h depois do fim da janela; passado isso, ou com o link cancelado, a API responde 401 `SUBSTITUICAO_ENCERRADA`. O detalhe da reunião e o da aula (API) trazem quem lançou pelo link. Detalhe das rotas em `docs/planejamento/API.md`.

## O instrutor

Telas do instrutor, em `apps/web/src/modulos`. As rotas da tabela abaixo, exceto `/inicio`, só o instrutor abre; o `/inicio` mostra a tela dele quando o papel ativo é instrutor. A barra de baixo dele tem Início, Classes, Cronograma e Ranking.

| Rota | O que é |
|---|---|
| `/inicio` | Por classe: próxima aula, progresso médio, aula de hoje (registrada ou não), aulas dadas no ano, o que cobrar da tarefa para casa (`paraCobrar`: requisitos e especialidades pendentes e quantos desbravadores devem, sem contar a própria ficha); alerta de desbravadores que faltaram nas duas últimas aulas registradas (`GET /api/inicio/instrutor`) |
| `/classes` | Classes do instrutor, com atalho para registrar aula |
| `/classes/:id/progresso` | Progresso da turma na classe (`GET /api/classes/:id/progresso?anoClube=`) |
| `/classes/:id/materiais` | Materiais de apoio da classe |
| `/cronograma` | Cronograma da classe, em leitura (`GET /api/classes/:id/cronograma`). A tela não monta cronograma; com o cronograma ainda sem status e sem liberação para montar, a tela oferece "Pedir para eu montar" (avisa o Adm) |
| `/aulas/nova`, `/aulas/:id/editar` | Registro de aula (presença e requisitos) e correção (`GET /api/classes/:id/aulas?anoClube=`, `GET /api/aulas/:id`) |
| `/especialidades` | Marcar especialidades concluídas por desbravador (`GET /api/especialidades`, `GET/PUT/DELETE /api/desbravadores/:id/especialidades/:especialidadeId`) |
| `/observacoes` | Observações sobre aula ou desbravador |

Só o registro de aula funciona sem conexão. As demais telas dependem da API e, sem internet, mostram a mensagem de que só ficam disponíveis com conexão; em `/classes` e no cronograma o app oferece "Registrar aula" a partir do pacote guardado no aparelho.

**Registro de aula.** Salvar grava um item `AULA` na fila e envia por `PUT /api/sync/aulas/:uuid` (`aula.registrar`; o `:uuid` é o id do registro, novo ou existente, então reenviar não duplica). Cada presença carrega a versão vista; se outra pessoa a mudou antes, vale a de quem enviou, a anterior fica registrada e a tela avisa. Requisito marcado só vale para quem estava presente; requisito já concluído fica como estava; requisito que já não é da classe fica de fora, e cada caso volta como aviso depois do envio. Na mesma gravação o instrutor pode passar a tarefa para casa do registro (`tarefaId`, itens acrescentados e retirados: requisito da classe ou especialidade, nunca os dois; `tarefasEncerradas`) e marcar ou desmarcar entregas de especialidade; o que não vale volta em `tarefaItensSemEfeito` e `especialidadesSemEfeito` com o motivo, e `totalPontos` soma requisitos e especialidades. Os campos novos têm padrão, então itens antigos da fila seguem válidos. Desbravador que não era da classe na data também fica fora e é avisado. A classe considera matrícula cursando no ano do clube, desbravador ativo do tipo DBV ou líder. Prazo: o Adm corrige sem limite; o instrutor, até 30 dias depois da data da aula e com envio feito em até 7 dias; passado disso, "Esta aula já não pode ser alterada." Os pontos por requisito seguem o critério de requisito ativo do clube.

**Progresso e especialidades.** `GET /api/classes/:id/progresso` exige `classe.ver_relatorio`; `GET /api/desbravadores/:id/progresso` e `GET /api/desbravadores/:id/especialidades`, `dbv.ver`; marcar e desmarcar requisito (`PUT/DELETE /api/desbravadores/:id/requisitos/:requisitoId`, corpo `{ concluidoEm }` no PUT) e especialidade, `requisito.marcar`.

**Observações.** `GET/POST /api/observacoes`, `PATCH/DELETE /api/observacoes/:id`, para instrutor e Adm (conselheiro recebe 403; instrutor só nas classes do seu vínculo, e classe de fora responde 404 como a que não existe). Por padrão o instrutor lista só as suas; ver as de outros exige `observacao.ver_outros`.

**Materiais.** `GET /api/classes/:id/materiais` (qualquer logado com acesso à classe), `POST /api/materiais/link` (só `https://`), `POST /api/materiais/arquivo` (multipart: `dados` em JSON com `classeId`, `secaoId` e `titulo`, e `arquivo`), `PATCH` e `DELETE /api/materiais/:id`; escrita exige `material.enviar`. Formatos aceitos: PDF, PPTX, ODP, DOCX e ODT, conferidos pelo conteúdo e não só pela extensão. Limites: 20 MB por arquivo (acima disso, 422 "O arquivo precisa ter até 20 MB.") e 1 GB de materiais por clube ("O espaço de materiais do clube acabou."). A URL do arquivo é assinada. Remover um material apaga o arquivo do disco; se a API cair no meio, a limpeza roda na próxima subida.

**Pedir liberação do cronograma.** `POST /api/classes/:id/pedir-liberacao` (204) avisa os Adm do clube por notificação. Um segundo pedido da mesma classe em menos de 24 h não gera aviso novo; classe que o instrutor já pode montar responde erro de regra.

**Operação: limite de upload no nginx.** O `nginx.conf` do container web já aceita 21 MB em `/api/materiais/arquivo` (3 MB no resto). O nginx do host, que termina o HTTPS e fica fora do repositório, precisa de `client_max_body_size 21m;` para essa rota; sem isso, arquivos entre o limite dele (1 MB por padrão do nginx) e 20 MB são recusados antes de chegar à API.

## Testar

```bash
npm run lint         # ESLint, sem tolerar warning
npm run tipos        # TypeScript
npm run teste        # Jest (API) e testes de shared e web
npm run teste:e2e    # Playwright, headless
```

O e2e usa uma pasta temporária como `ARQUIVOS_DIR`, apagada ao final. `e2e/offline.spec.ts` entra, deixa o service worker assumir a página, corta a rede, recarrega e espera a faixa "Sem conexão".

Jest e Playwright leem `.env.teste` (ignorado pelo git; o `.env.exemplo` é o modelo). Cada execução da API cria o próprio banco e o apaga ao final. Se uma execução morrer no meio e deixar bancos órfãos, `npm run teste:limpar -w api` apaga os bancos `teste_*` criados há mais de 2 horas.

## Carga oficial

Carrega classes, requisitos e especialidades:

```bash
npm run carga -w api
npm run carga -w api -- --forcar
```

A carga recusa aplicar se desativaria mais de 10% dos itens existentes de um tipo, ou se mudaria o texto de um requisito que já tem histórico. `--forcar` ignora as duas travas. Nunca roda no deploy automático: em produção é sempre um passo manual (`scripts/carga.sh`).

Classe oficial que some dos arquivos não é apagada: fica desativada, deixa de aparecer para matrícula, vínculo de instrutor e visão geral, e continua legível para quem já tinha algo nela. Classe que volta aos arquivos é reativada.

**Uma vez, depois do deploy que trocou as Agrupadas por idade por uma turma só de 16 anos ou mais:** rode `scripts/carga.sh --forcar` no servidor. Antes, confira se há desbravador cursando uma agrupada antiga: a turma dele some das listas do Adm, e a saída é matriculá-lo na nova. As 10 agrupadas antigas saem da carga (a de 15 anos ou mais também, porque mudou de nome) e passam do freio de 10%, então sem `--forcar` a carga recusa.

## Criar um clube

```bash
npm run clube:criar -w api -- --nome "Clube Exemplo" --slug clube-exemplo --adm-nome "Fulano" --adm-email fulano@exemplo.org
```

`--slug` aceita só minúsculas, números e hífens. Se o e-mail do administrador ainda não tem conta, o convite é enviado por e-mail e o link também sai no terminal; se já tem, ele só recebe o aviso de que foi acrescentado ao clube.

## Produção

Stack em `docker-compose.prod.yml`, operada pelos scripts em `scripts/`.

**Instalação num comando** (servidor com Docker, e Nginx + certbot se for usar `--nginx`):

```bash
scripts/instalar.sh --nginx desbravadores.exemplo.org --email-certbot voce@exemplo.org \
  --clube-nome "Clube Exemplo" --clube-slug clube-exemplo --adm-nome "Fulano" --adm-email fulano@exemplo.org
```

Nessa ordem, e parando no primeiro problema: confere as ferramentas e, com `--nginx`, que o domínio já
aponta no DNS para este servidor (atrás de NAT, confira à mão e use `--pular-dns`); escolhe uma porta livre do host entre 8090 e 8190 (a VPS é
compartilhada; outro processo ou container na porta é pulado) e a grava em `WEB_PORTA`; cria o
`.env` com segredos novos (ou mantém o existente); sobe a stack e espera a API; roda a carga oficial
até ela dar certo uma vez (marcada com `CARGA_OFICIAL_FEITA=1` no `.env`), ou de novo com `--carga`; cria o clube e o Adm se os quatro dados vierem (clube com o mesmo slug já criado é pulado); e, com
`--nginx`, grava o site no Nginx do servidor a partir de `scripts/nginx-host.conf` (upload até
21 MB, log sem a query dos links assinados no formato de `scripts/nginx-host-log.conf`, instalado em
`conf.d`, rotação de 30 dias em `scripts/nginx-host-logrotate`), avisa se outro site já aponta para
a mesma porta (domínio antigo),
confere com `nginx -t` (desfaz se falhar), recarrega e pede o certificado ao certbot com
redirecionamento para HTTPS. Sem `--email-certbot`, o certbot pergunta o e-mail.

Rodar de novo é seguro: mantém o `.env`, a porta e o certificado (num site já certificado, só a
porta do `proxy_pass` é atualizada, se mudou). O container `web` publica a porta só em `127.0.0.1`:
de fora, o app só é alcançado pelo Nginx do servidor, com HTTPS. Sem `--nginx`, o proxy HTTPS do
servidor fica por sua conta, apontando para `127.0.0.1:<WEB_PORTA>` com `client_max_body_size 21m`; o login só se mantém
em HTTPS (`COOKIE_SECURE=true`).

| Comando | O que faz |
|---|---|
| `scripts/instalar.sh [--nginx dominio] [--email-certbot email] [--pular-dns] [--carga] [--clube-nome ... --clube-slug ... --adm-nome ... --adm-email ...]` | Instalação completa, descrita acima |
| `scripts/deploy.sh [APP_URL]` | Subida mínima, sem porta automática, carga, clube nem Nginx (o `instalar.sh` faz tudo isso). Primeira subida: cria o `.env` com segredos novos (`ARQUIVOS_SEGREDO` incluído; se o `.env` já existe, só acrescenta o `ARQUIVOS_SEGREDO` que faltar), sobe a stack e espera a API ficar saudável. A API migra o banco ao iniciar. Depois, preencha `SMTP_*`, `BACKUP_AGE_DESTINATARIO` e `RCLONE_REMOTO` no `.env` |
| `scripts/atualizar.sh` | Recusa árvore com alterações não commitadas, faz `git pull --ff-only`, acrescenta `ARQUIVOS_SEGREDO` ao `.env` se faltar (nunca troca um existente; precisa de `openssl`), reconstrói e sobe. Não roda a carga |
| `scripts/carga.sh [--forcar]` | Carga oficial dentro do container da API |
| `docker compose -f docker-compose.prod.yml --env-file .env exec api node dist/scripts/clube-criar.js --nome ... --slug ... --adm-nome ... --adm-email ...` | Cria um clube em produção |

Os arquivos enviados moram no volume Docker `arquivos`, montado em `/app/arquivos` na API (`ARQUIVOS_DIR`). A URL de imagem é assinada e vale 10 minutos (`GET /api/arquivos/:id`); link vencido ou adulterado responde "Link inválido ou vencido". O limite de memória da API subiu de 256 MB para 384 MB.

## Deploy automático

Cada push na `main` que passa na verificação do CI vai sozinho para o servidor (job `deploy` em
`.github/workflows/ci.yml`). O GitHub entra na rede privada do Tailscale, envia
`scripts/deploy-ci.sh` para o servidor e o executa na pasta do app. A primeira instalação continua
sendo o `instalar.sh`.

O roteiro, em ordem:

1. Busca a `main` e vai para o commit que o CI aprovou, não para a ponta da branch, que pode ter
   testes ainda rodando. Compara com a versão que a API diz estar no ar. Se ela já contém o commit
   pedido (um job que terminou depois do seguinte, ou um job antigo rodado de novo), não mexe em
   nada: a produção nunca é rebaixada. Com vários pushes seguidos, deploys na fila podem ser
   pulados, e o último sempre sobe. Para voltar uma versão, reverta o commit na `main`.
   Se só mudou documentação (`docs/` ou `.md` na raiz), atualiza o código sem
   reconstruir. `docs/planejamento/dados` não conta como documentação, porque entra na imagem da API.
2. Faz uma cópia do banco em `backups/pre-deploy-*.sql.gz` e mantém as 10 últimas. A pasta é
   legível só pelo usuário de deploy, porque tem dados de menores.
3. Reconstrói e sobe a stack com `VERSAO_APP=<commit>`. A API migra o banco ao iniciar.
4. Espera `GET /api/saude` responder na porta `WEB_PORTA` com a versão igual ao commit novo.
5. Grava o commit em `.deployed-commit`. O último passo do CI confere esse arquivo contra o commit do
   push: um roteiro interrompido no meio não passa por deploy feito.

Se a construção falhar, ou a API não responder na versão nova em 240 s, o código volta para o commit
anterior e a stack é reconstruída. O job fica vermelho. Uma migration já aplicada não é desfeita.
Para consultar ou recuperar dados de antes do deploy, restaure a cópia num banco novo, ao lado do
atual (a API continua no `desbravador`):

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env"
$C exec -T postgres createdb -U postgres -O desbravador antes_do_deploy
gunzip -c backups/pre-deploy-<data>.sql.gz | $C exec -T postgres psql -U postgres -d antes_do_deploy -v ON_ERROR_STOP=1
```

A carga oficial nunca roda no deploy. Quando `docs/planejamento/dados` muda, o log avisa para rodar
`scripts/carga.sh` à mão. Alterações feitas à mão no servidor, em arquivos versionados, são
descartadas, e o log as lista.

| Onde | O que precisa existir |
|---|---|
| Servidor | Usuário de deploy no grupo `docker` e dono da pasta do app (senão o git recusa a pasta), com a stack já instalada pelo `instalar.sh` |
| Tailscale | Servidor na rede, e a ACL deixando `tag:deploy-ci` abrir SSH nele como o usuário de deploy |
| GitHub, segredos | `TS_OAUTH_CLIENT_ID` e `TS_OAUTH_SECRET`: cliente OAuth do Tailscale com a tag `tag:deploy-ci` |
| GitHub, variáveis | `DEPLOY_HOST` (nome do servidor no Tailscale), `DEPLOY_USER` e `DEPLOY_PATH` (pasta do app, ex.: `/var/www/html/desbravadores`) |

O primeiro passo do job confere essas variáveis e para com a lista do que falta, antes de abrir a
conexão. Para rodar o mesmo deploy à mão no servidor, como o usuário de deploy:
`cd <pasta do app> && bash scripts/deploy-ci.sh [commit]` (sem commit, vai a ponta da `main`).

## Backup e restauração

- `scripts/backup.sh`: `pg_dump` cifrado com `age` (para `BACKUP_AGE_DESTINATARIO`) e enviado com `rclone` para `RCLONE_REMOTO`. O dump nunca fica em claro no disco. Depois do dump, os arquivos do volume `arquivos` saem em `desbravadores-*.arquivos.tar.age` (também cifrado, lido por um container descartável: não depende da API estar de pé). Se só o backup dos arquivos falhar, o dump já enviado permanece e o script termina com erro. Apaga do destino o que tem mais de 30 dias.
- `scripts/restaurar.sh --arquivo <x.age> --chave <chave-privada> --banco <novo> [--arquivos <x.arquivos.tar.age>]`: restaura num banco novo, nunca por cima do `desbravador`. Com `--arquivos`, devolve também as fotos a `/app/arquivos` da API (só acrescenta, não apaga nada). Depois, aponte o `DATABASE_URL` da API para ele.
- `scripts/testar-backup.sh`: teste de ponta a ponta numa stack descartável (dados, backup do banco e dos arquivos, restauração e uma segunda API lendo o banco restaurado). Precisa de `docker`, `age`, `age-keygen` e `rclone`.
