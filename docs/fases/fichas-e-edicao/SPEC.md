# Fichas e telas de edição — SPEC

Hoje o Adm não tem onde **ver** um registro: clicar numa linha abre direto o painel lateral de
edição, e o painel fica apertado para formulários grandes (o do desbravador tem 14 campos). Esta SPEC
dá a cada registro do Adm uma **ficha** (só leitura, com endereço próprio), move toda edição com
**mais de 3 campos** para uma **tela dedicada**, e dá ao Adm a tela que faltava para **corrigir a
chamada** de uma reunião.

O modelo aprovado está em `modelo/` (`.dc.html`). **Ele é o alvo:** se esta SPEC e o modelo
divergirem, vale o modelo — com as exceções declaradas em "Exceções ao modelo". Do modelo copia-se
estrutura, ordem e texto, **nunca CSS**: as classes saem dos tokens e dos componentes de `ui/`.

## O que muda para quem usa

- **Lista → ficha → Editar → tela de edição.** Clicar na linha abre a ficha. A ficha tem "Voltar" e
  uma ação principal. A tela de edição termina com **Cancelar** e **Salvar** no fim do formulário —
  nada preso na tela. Salvar volta para a ficha; Cancelar também.
- **Novo** abre a mesma tela de edição vazia; salvar leva à ficha do registro criado; Cancelar volta
  à lista.
- **A lista volta como estava.** Filtros, busca, página (e o mês, no calendário) passam a morar no
  endereço da lista; o "Voltar" da ficha devolve esse endereço.
- Ações de até 1 campo continuam em janela de confirmação, disparadas **da ficha**: inativar e
  reativar desbravador, desativar usuário, excluir evento, gerar e cancelar link de acesso ao app,
  adicionar à unidade um desbravador sem unidade.
- O endereço de cada ficha funciona sozinho: recarregar, favoritar e mandar o link funcionam.
- **Avisos de gravação** (os que hoje aparecem na lista depois de salvar um desbravador, e as aulas
  afetadas por um evento) aparecem no topo da ficha logo depois de salvar.

## Endereços

| Registro | Ficha | Editar | Novo |
|---|---|---|---|
| Desbravador | `/adm/desbravadores/:id` | `/adm/desbravadores/:id/editar` | `/adm/desbravadores/novo` |
| Usuário | `/adm/usuarios/:id` | `/adm/usuarios/:id/editar` | `/adm/usuarios/novo` |
| Unidade | `/adm/unidades/:id` | `/adm/unidades/:id/editar` | `/adm/unidades/nova` |
| Evento | `/adm/calendario/eventos/:id` | `/adm/calendario/eventos/:id/editar` | `/adm/calendario/eventos/novo?data=AAAA-MM-DD` |
| Reunião | `/adm/reunioes/:id` | `/adm/reunioes/:id/chamada` (corrigir) | — |

- `/dbv/:id` continua para conselheiro e instrutor; **para o Adm**, redireciona para
  `/adm/desbravadores/:id` (o "Voltar" leva à lista de desbravadores, não à tela de origem — aceito).
- Pontos de entrada que passam a apontar para as fichas: linhas das listas, cartões de unidade da
  Visão geral (`VisaoGeral.tsx:125`), membros na ficha da unidade, e o link da atividade "evento
  criado" (`servico-eventos.ts:116`, hoje `/adm/calendario`).

## Cada ficha (ordem = ordem do modelo)

- **Desbravador** (`modelo/Main.dc.html`): nome, tipo, idade, unidade, classe; **Cadastro**;
  três números (progresso na classe, pontos e posição no mês, **frequência no mês**) e as seções de
  progresso que a ficha do conselheiro já tem; **Responsável** com uso de imagem (só quando a
  resposta traz `contato`, ou seja, com `dbv.ver_contato`). Rodapé: Inativar ou Reativar.
  Desbravador **inativo** ou de **Diretoria**: sem os três números (não se aplicam,
  `perfil.service.ts:41`) e sem "Gerar link de acesso" para inativo (`convite-acesso.service.ts:32`).
  Dados: `GET /desbravadores/:id/perfil`, que já traz cadastro e contato (`perfil.ts:7`,
  `perfil.service.ts:37`); `GET /desbravadores/:id` fica só para a tela de edição.
- **Usuário** (`modelo/FichaUsuario.dc.html`): e-mail, gênero, situação com **último acesso**; um
  cartão por papel ativo no clube, com escopo e "O que pode fazer" nos **rótulos do catálogo**
  (`permissoes.ts`, já com os ajustes do vínculo aplicados). Rodapé: Reenviar convite (só
  CONVIDADO) e Desativar neste clube. **Inativo neste clube:** situação "Inativo", sem Desativar,
  com "Acrescentar papel" (leva à edição) como caminho de volta. **Desativar a si mesmo** pede
  confirmação que diz isso com todas as letras.
- **Unidade** (`modelo/FichaUnidade.dc.html`): tipo, situação, grito de guerra; conselheiros e
  número de membros (contado com o **mesmo filtro da lista de membros**,
  `unidades.service.ts:99`); **Membros** (cada um leva à ficha do desbravador) com "Adicionar
  desbravador sem unidade" (janela de um campo, `GET /unidades/sem-membros` + `PUT
  /desbravadores/:id/unidade`); **Reuniões do mês** com ‹ › (cada uma leva à ficha da reunião, e
  mostra presentes/total). Dados: `GET /unidades/:id` (novo), `GET /unidades/:id/membros`, `GET
  /reunioes?unidadeId&mes`.
- **Evento** (`modelo/FichaEvento.dc.html`): datas, horário, local; **O que muda no calendário**.
  Ações: Excluir (confirmação) e Editar.
- **Reunião** (`modelo/FichaReuniao.dc.html`): o conteúdo do detalhe que o conselheiro já tem,
  dentro do painel do Adm; ação principal **Corrigir chamada**. Os links fixos do detalhe
  (`DetalheReuniao.tsx:115,159,168` — editar e galeria) passam a vir por parâmetro; para o Adm o
  link do álbum não aparece (a galeria é rota do conselheiro). "Voltar" leva à ficha da unidade.

## Corrigir chamada (Adm)

O Adm corrige a qualquer momento (a API já permite: `podeEditar` é sempre verdadeiro para ADM,
`reunioes.service.ts:133-134`; gravar usa `reuniao.registrar`, que o Adm tem,
`reunioes.controller.ts:19-20`, sem prazo, `reunioes-envio.service.ts:134-135`). O uso típico é quem
chegou depois da chamada ou o conselheiro que esqueceu de marcar.

A tela de chamada do conselheiro **não serve como está**: ela monta unidade e membros a partir do
pacote offline (`TelaChamada.tsx:28,165-168`), que vem vazio para quem não é conselheiro
(`sync.service.ts:36,48`); e salvar põe o envio na fila do aparelho e volta para `/reunioes`
(`api/reunioes.ts:93,100`), rota só do conselheiro. Então o modo Adm:

- **monta a lista a partir do próprio registro da reunião** (`GET /reunioes/:id`, as linhas da
  chamada — quem era da unidade **naquela data**), não dos membros de hoje
  (`reunioes-envio.service.ts:207-222` descarta quem não era da unidade na data);
- **só funciona com internet**: sem conexão, a tela diz "Corrigir a chamada precisa de internet";
- **envia direto** (`PUT /sync/reunioes/{clienteUuid}`, o mesmo contrato), sem a fila do aparelho;
  recusa, conflito com uma correção do conselheiro feita ao mesmo tempo, e nomes descartados
  aparecem **na própria tela**, sem sair dela;
- salvo, **volta à ficha da reunião** já atualizada;
- reaproveita o formulário da chamada (`FormularioChamada`) — o rodapé dele deixa de ser preso
  (já removido na PR #21; se esta branch sair antes, remove-se aqui).

## Telas de edição

- **Desbravador** (`modelo/EditarDesbravador.dc.html`): o formulário atual, em três blocos — Quem é,
  No clube, Responsável. A geração de link de acesso ao app sai do formulário e vai para a ficha.
- **Usuário**: nome e gênero; os papéis no clube como blocos (`BlocoVinculo`), com "Acrescentar
  papel". E-mail e senha não se editam (usuário é global).
- **Unidade**: nome, tipo, grito de guerra, ativa.
- **Evento**: o formulário atual (9 campos); novo a partir de um dia do calendário chega com a data
  (`?data=`).
- Sair da tela de edição sem salvar não pergunta nada (como os painéis de hoje).

## API

| Rota | Permissão | Escopo / regra |
|---|---|---|
| `GET /usuarios/:id` | `usuario.gerenciar` (a do listar, `usuarios.controller.ts:22-23`) | vínculo neste clube, senão 404 (`carregar`, `usuarios.service.ts:242-249`); devolve vínculos inativos também |
| `GET /unidades/:id` | `dbv.ver` (a do listar, `unidades.controller.ts:15-16`) | do clube e no escopo (`exigirNoEscopo`, `unidades.service.ts:208-216`); **inativa só para ADM** (como a lista, `:89`); declarada **depois** de `sem-membros` (`:21-22`) |
| `GET /calendario/eventos/:id` | `@Logado()` (a do listar, `eventos.controller.ts:37-38`) | do clube e não removido (`eventoDoClube`, `servico-eventos.ts:124-128`) |

- Contrato: `UnidadeSaida` e `EventoSaida` servem como estão. `UsuarioSaida` ganha
  **`ultimoAcessoEm`** (data e hora ou nulo; a coluna existe, `schema.prisma:243`) — também na
  lista, que usa o mesmo formato. Nenhuma migration.
- `totalMembros` de `UnidadeSaida` passa a contar com o filtro da lista de membros (só desbravador
  ativo, `unidades.service.ts:33` vs `:99`).
- Fora do clube ou fora do escopo: **404**, nunca 403. Id malformado responde erro de validação: o
  front trata os dois como "Não encontramos".

## Exceções ao modelo

- **Ficha do desbravador:** "Frequência no ano" vira **"Frequência no mês"** — o perfil só tem a do
  mês (`perfil.ts:11`).
- **Ficha da unidade:** sai o número "Frequência no mês" do topo — nenhuma rota o devolve para um
  mês escolhido; cada reunião da lista já mostra presentes/total.
- **Ficha da reunião:** "Alterações" mostra quem corrigiu e quando, **sem** o antes→depois por nome
  (o detalhe não traz, `reunioes.ts:94`).
- **Ficha do evento:** "Aulas afetadas" aparece só como aviso logo depois de salvar (a API só
  calcula ao gravar, `servico-eventos.ts:103-121`).
- **Aula da montagem:** fica **fora** desta SPEC e continua no painel lateral — editar tem 3
  campos, abaixo da regra; o campo "observação" do modelo não existe no banco. O artboard
  `EditarAulaCelular` sai do modelo.

## Cache e testes de apoio

- Chaves de consulta novas dentro das famílias existentes, para a invalidação de hoje alcançá-las:
  `['usuarios', id]`, `['unidades', id]`, `['calendario', 'evento', id]`. Gravar desbravador
  invalida também `['perfil', id]` (`api/perfil.ts:9`; hoje só `['desbravadores']`,
  `api/desbravadores.ts:81-147`). Corrigir chamada invalida `['reuniao', id]` (`api/reunioes.ts:22`) e as mesmas raízes que a fila invalida ao enviar (`offline/tipos/reuniao.ts:14`).
- Handlers de teste do web (`testes/handlers/{usuarios,unidades,calendario}.ts`) para as três
  leituras novas; o de `/api/unidades/:id` registrado **depois** do de `sem-membros`. O setup falha
  em rota sem handler (`testes/setup.ts:13`).

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** nenhum novo. A ficha da reunião depende de a reunião existir — chega-se pela
  ficha da unidade.
- **Vazio:** unidade sem membros: "Nenhum desbravador nesta unidade" com "Adicionar desbravador sem
  unidade" (ou, sem nenhum disponível, link para cadastrar); mês sem reunião: "Nenhuma reunião em
  <mês>" (sem convite a criar — quem cria é o conselheiro).
- **Bloqueio:** registro inexistente, de outro clube ou id malformado: "Não encontramos este
  <registro>" com link para a lista (estado impossível). Corrigir chamada sem internet: texto basta.
- **Perfil e escopo:** fichas e telas desta SPEC são do Adm. Responsável só com contato na resposta;
  Corrigir chamada só com `podeEditar`.

## Componentes canônicos (novos em `ui/`)

- `CabecalhoDaPagina` — Voltar com destino explícito (nunca `navegar(-1)`), sobretítulo, h1, linha
  de apoio e ações à direita (quebram para baixo no celular).
- `ListaDePares` — `<dl>` em grade de 2 ou 3 colunas (1 no celular).
- `RodapeDoFormulario` — divisória, Cancelar (link) e Salvar (`primario`) à direita; no celular,
  empilhados, Salvar em cima, largura total. **Nunca preso na tela.**
- `EstadoNaoEncontrado` — o bloqueio acima.
- Cartões, botões, chips e confirmações: `Cartao`, `Botao`/`estiloDoBotao`, `Chip`, `Confirmacao`.

## Fora de escopo

- `FolhaLateral` com até 3 campos (aula da montagem, especialidade do clube, requisitos da data,
  materiais) e as confirmações.
- Barra de navegação inferior fixa do celular (decisão em aberto com o usuário).
- Telas do conselheiro e do instrutor; o conselheiro continua corrigindo a chamada como hoje.

## Critério de pronto

- API: testes das três leituras (encontra; 404 de outro clube; unidade fora do escopo do
  conselheiro → 404; unidade inativa para conselheiro → 404; evento removido → 404; `sem-membros`
  continua respondendo); `ultimoAcessoEm` na lista e na leitura; `totalMembros` com o filtro novo.
- Web: para cada registro, lista → ficha → Editar → Salvar → ficha (com o dado novo, sem esperar o
  cache); Novo → Salvar → ficha; Voltar devolve a lista com filtro e página; link direto para ficha e
  edição; inexistente e id malformado → "Não encontramos"; avisos de gravação na ficha. Corrigir
  chamada do Adm: lista da data da reunião, envio direto, conflito na tela, volta à ficha
  atualizada, sem internet avisa.
- Testes que mudam: os de tela listados em ONDE FICA e os e2e `e2e/fundacao.spec.ts:22-51`,
  `e2e/domingo.spec.ts:41-67`, `e2e/adm.spec.ts:100-108` (painel lateral e aviso de aulas afetadas).
- Lint, tipos e suítes (API, web, e2e) passando; medido no DOM em 390, 820 e 1280 px sem rolagem
  lateral e sem elemento `fixed`/`sticky` novo.
- QA no navegador seguindo cada tela do modelo.

## ONDE FICA

```
- rotas: só conselheiro / bloco Adm / /dbv  apps/web/src/rotas.tsx:73-76 ; :82-99 ; :100-103
- rotas por módulo                          apps/web/src/modulos/adm/{desbravadores,usuarios,unidades,calendario}/rotas.tsx ; modulos/reunioes/rotas.tsx:8-11 ; modulos/perfil/rotas.tsx:16
- lista + painel desbravador                apps/web/src/modulos/adm/desbravadores/ListaDesbravadores.tsx:39-45, :149-155, :220-243 ; FormularioDesbravador.tsx:111
- hooks desbravador / perfil                apps/web/src/api/desbravadores.ts:49-147 ; apps/web/src/api/perfil.ts:9
- lista + painel usuário                    apps/web/src/modulos/adm/usuarios/AdmUsuarios.tsx:30-34, :134-147 ; PainelUsuario.tsx:33 ; BlocoVinculo.tsx
- hooks usuário                             apps/web/src/api/usuarios.ts:28-67
- lista + painel + membros unidade          apps/web/src/modulos/adm/unidades/ListaUnidades.tsx:23, :72-94 ; FormularioUnidade.tsx:21 ; PainelMembros.tsx:44-58
- hooks unidade                             apps/web/src/api/leitura.ts:40,66 ; apps/web/src/api/unidades.ts:17,26
- calendário + painel evento                apps/web/src/modulos/adm/calendario/AdmCalendario.tsx:50-53, :226-246 ; FormularioEvento.tsx:35
- hooks calendário                          apps/web/src/api/calendario.ts:18-43
- visão geral (cartão de unidade)           apps/web/src/modulos/adm/visao-geral/VisaoGeral.tsx:125
- ficha do conselheiro                      apps/web/src/modulos/perfil/PerfilDbv.tsx:83, :106-111
- detalhe da reunião (links fixos)          apps/web/src/modulos/reunioes/detalhe/DetalheReuniao.tsx:76, :111-117, :159, :168
- chamada (pacote offline, fila, volta)     apps/web/src/modulos/reunioes/chamada/TelaChamada.tsx:28, :165-168 ; FormularioChamada.tsx ; apps/web/src/api/reunioes.ts:33,41,93,100
- pacote offline vazio p/ não-conselheiro   apps/api/src/sync/sync.service.ts:36,48
- API reunião (Adm edita, sem prazo)        apps/api/src/reunioes/reunioes.controller.ts:19-20,38-39 ; reunioes.service.ts:74-90,133-134 ; reunioes-envio.service.ts:134-135,207-222 ; reunioes/apoio.ts:12-20
- API usuários                              apps/api/src/usuarios/usuarios.controller.ts:22-74 ; usuarios.service.ts:33-34,83,140,157-161,242-249
- API unidades                              apps/api/src/unidades/unidades.controller.ts:15-51 ; unidades.service.ts:33,84,89,99,186,202-216
- API eventos                               apps/api/src/calendario/eventos.controller.ts:20,37-65 ; servico-eventos.ts:77,103-128
- API perfil / convite de acesso            apps/api/src/desbravadores/perfil.service.ts:41,53 ; convite-acesso.service.ts:32
- contratos                                 packages/shared/src/contratos/{usuarios.ts:48-56,unidades.ts:15-23,perfil.ts:7-11,reunioes.ts:94}
- permissões (catálogo)                     packages/shared/src/permissoes.ts:12-18,30
- coluna de último acesso                   apps/api/prisma/schema.prisma:243
- padrão de teste de isolamento (API)       apps/api/src/reunioes/reunioes.isolamento.spec.ts ; calendario/eventos.spec.ts:118,128 ; usuarios/usuarios.spec.ts:323-341
- handlers e setup de teste (web)           apps/web/src/testes/handlers/{usuarios,unidades,calendario}.ts ; apps/web/src/testes/setup.ts:13
- testes de tela afetados                   modulos/adm/desbravadores/{desbravadores,acesso-ao-app}.test.tsx ; adm/usuarios/usuarios.test.tsx ; adm/unidades/unidades.test.tsx ; adm/calendario/calendario.test.tsx ; perfil/perfil.test.tsx ; reunioes/detalhe/detalhe.test.tsx ; reunioes/chamada/*.test.tsx ; rotas.test.tsx
- e2e afetados                              e2e/fundacao.spec.ts:22-51 ; e2e/domingo.spec.ts:41-67 ; e2e/adm.spec.ts:100-108
- conferido em                              e9b7cac
```
