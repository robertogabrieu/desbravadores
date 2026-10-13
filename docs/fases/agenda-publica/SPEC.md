# Agenda pública para os pais — SPEC

> **Layout aprovado pelo usuário** (resposta: "aprovado"). O desenho em
> [`modelo/Agenda-Publica.html`](modelo/Agenda-Publica.html) é o alvo e **vence esta SPEC no empate**.
> Dele se copia a **estrutura e o texto**, nunca o CSS: o estilo sai dos tokens do app
> (`apps/web/src/ui/tokens.css`) e o uniforme sai do componente `UniformeDoEvento`.
> Base de código: `origin/main` em `61f95b6`. Dados do desenho são de exemplo.

Uma página **sem login**, num link que a diretoria repassa aos pais, com os próximos compromissos do clube
(nome, horário, local e uniforme) e o calendário do mês. Para isso, o cadastro de evento do calendário ganha
o campo **uniforme** em mais quatro tipos.

## Pedido e decisões do usuário (não se reabrem)

Pedido: *"criar um link público para que os pais acessem e vejam quais os próximos eventos e reuniões, com
detalhes como uniforme, local e horário, e o calendário do clube."*

1. **Escopo.** É uma tela nova de exibição. **Nenhuma tela existente muda além do que o item 3 diz** (o
   formulário de evento). Sem campo novo de "recado", sem observações, sem configuração nova no painel do Adm.
2. **Só entra o que o painel do Adm já cadastra:** nome, horário, local e uniforme. Observações da reunião
   **não** aparecem (não há onde cadastrá-las para o público).
3. **Uniforme em todo compromisso com encontro.** O formulário de evento do calendário ganha o campo
   **Uniforme**, com "Uniforme de gala" e "Uniforme de campo", **"Uniforme de campo" já marcado** ao criar,
   nos tipos **Reunião extra, Evento do clube, Evento especial e Acampamento**.
4. **Reunião semanal é sempre uniforme de campo.** É um valor fixo do sistema, não um campo configurável.
5. **Sem migration.** Não se mexe nos dados de produção. Evento já cadastrado sem uniforme continua sem
   uniforme, e a página simplesmente não mostra a etiqueta nele.
6. **O card não repete o tipo.** Mostra nome, horário, local e uniforme. O tipo aparece só nas cores e na
   legenda do calendário.
7. **O calendário interno do app não muda.** Ele mostra uniforme só no evento especial
   (`CalendarioDeLeitura.tsx:71`, `CartaoProximoEvento.tsx:46`, `adm/calendario/CalendarioDoCelular.tsx:39`,
   `AdmCalendario.tsx:264`). O Adm cadastra o uniforme dos quatro tipos e o vê na página pública e no formulário.

## Problema

Os pais não têm onde ver o que vem pela frente. Hoje a agenda só existe dentro do app, para quem tem login
(conselheiro, instrutor, Adm). O pai pergunta no grupo de mensagens "qual o uniforme de domingo?" e a
diretoria responde um a um. O uniforme, o dado que mais gera erro ("foi de gala no dia de campo"), só é
cadastrado no evento especial; nos outros eventos não existe, e a reunião semanal não o tem.

O que muda para quem usa:

- **Pais:** abrem um link, sem senha, e veem o próximo compromisso em destaque, a lista dos seguintes e o
  calendário do mês, cada um com horário, local e uniforme.
- **Adm:** ao cadastrar reunião extra, evento do clube, evento especial ou acampamento, escolhe o uniforme (já
  vem "campo"). Passa a existir um link para repassar aos pais.

## Desenho

Cada bloco do mockup é um item do roteiro de QA (`qa-roteiro`).

1. **Cabeçalho do clube:** brasão (iniciais), nome do clube e "Agenda para pais e responsáveis".
2. **Próximo compromisso:** cartão verde, o único destaque da primeira dobra. Data, nome, horário, local e
   uniforme.
3. **Próximos compromissos:** lista agrupada por mês; cada item tem o dia, o nome, "horário · local" e, quando
   há uniforme, o `UniformeDoEvento`. Em duas colunas no computador (lista à esquerda, calendário à direita),
   uma coluna no celular com a lista primeiro.
4. **Calendário do clube:** um mês por vez, com "Anterior" e "Próximo", dia de hoje marcado, legenda de tipos.
   Cada dia com compromisso mostra a abreviação escrita (Reun., Extra, Evento, Acamp., Sem), nunca só a cor.
5. **Rodapé:** "Dúvidas sobre horário ou local? Fale com a diretoria do clube."

Componentes e regras:

- **Uniforme:** reaproveita `UniformeDoEvento` (camisa + texto; contorno cheio na gala, tracejado no campo).
  Não se cria etiqueta nova.
- **Ação primária:** não há. A página é só leitura; o destaque visual é do próximo compromisso.
- **Pisos:** texto de corpo 16px, contraste 4,5:1, alvo de toque 44px nos botões do calendário.
- **Espaçamento:** a escala do projeto (`tokens.css`); não se inventa valor.

### Estados (os quatro do app)

| Estado | O que a página mostra |
|---|---|
| Carregando | Esqueleto do cartão de destaque e de três itens |
| Vazio | "O clube ainda não publicou compromissos para os próximos meses. Volte em breve." Sem botão. |
| Erro | "Não foi possível carregar a agenda." + botão "Tentar de novo" |
| Sem conexão | A faixa "Sem conexão" do app, com o que já foi carregado |
| Link inexistente | Página de "Agenda não encontrada. Confira o link com a diretoria do clube." (404) |

### As quatro perguntas de descobribilidade

- **Pré-requisitos:** nenhum para o pai. Para a página ter conteúdo, o Adm precisa ter eventos no calendário;
  as reuniões semanais saem da configuração do clube (dia, horário e local), que todo clube já tem.
- **Vazio:** coberto acima; "nada cadastrado" não oferece ação ao pai (ele não pode criar).
- **Bloqueio:** não há ação que bloqueie. O único erro é o link inexistente (estado impossível; o texto basta).
- **Perfil e escopo:** a página é pública e mostra **só** o que é seguro para o público: nunca pontos, lista de
  presença, nomes de desbravadores, unidades nem encontros da Classe Bíblica.

## O que a página lista

| Tipo no calendário | Aparece | Uniforme |
|---|---|---|
| Reunião semanal (calculada pela configuração do clube) | sim | campo, fixo |
| Reunião extra | sim | o cadastrado |
| Evento do clube | sim | o cadastrado |
| Evento especial | sim | o cadastrado |
| Acampamento | sim | o cadastrado |
| Sem reunião, Feriado, Férias | sim, como aviso ("Sem reunião") | nenhum |
| Classe Bíblica | **não** | — |

Decisão minha, a confirmar: Feriado e Férias aparecem como avisos, porque explicam por que não há reunião
naquela semana. Classe Bíblica fica de fora: é encontro interno.

Janela: de hoje a 120 dias (`JANELA_DO_CALENDARIO_EM_DIAS`), a mesma do pacote do app. O calendário navega
só dentro dela.

## Desenho técnico

### 1. Uniforme no cadastro de evento

Hoje o uniforme só existe e só é obrigatório no `EVENTO_ESPECIAL`. Passa a valer em `REUNIAO_EXTRA`, `EVENTO`,
`EVENTO_ESPECIAL` e `ACAMPAMENTO`. **Os pontos continuam só no evento especial.**

- `packages/shared`: nova constante `TIPOS_COM_UNIFORME` (os quatro tipos). `validarEvento` exige `uniforme`
  nesses quatro tipos, com a mesma mensagem ("Escolha o uniforme do evento."); o resto do bloco do evento
  especial (pontos) fica como está.
- API: `semOsCamposDoEspecial` e `paraColunas` hoje zeram uniforme fora do especial; passam a separar **uniforme**
  (quatro tipos) de **pontos** (só o especial). Em `FERIADO`, `FERIAS`, `SEM_REUNIAO` e `CLASSE_BIBLICA` o
  uniforme segue descartado.
- **Testes que assumem uniforme nulo fora do especial e precisam mudar:** `apps/api/src/calendario/eventos.spec.ts:655-665`,
  `apps/api/src/sync/sync.spec.ts:266`, `apps/web/src/modulos/adm/calendario/calendario.test.tsx:482-486`,
  `formulario-erros.test.tsx:19-53` e `formulario-especial.test.tsx` (o uniforme já vem marcado). Os comentários
  de `contratos/calendario.ts` (linhas ~21 e ~36) e `enums.ts:39` também dizem "só no especial" e são atualizados.
- Web, `FormularioEvento`: o seletor de uniforme sai do bloco do evento especial e aparece nos quatro tipos.
  Ao **criar**, vem "Uniforme de campo" marcado. Ao **editar** um evento antigo sem uniforme, também vem
  "campo" marcado (o salvamento passa a exigi-lo). Hoje o formulário começa com `uniforme` nulo e só o envia no especial
  (`FormularioEvento.tsx:135,260`): o padrão "campo" e o envio nos quatro tipos são lógica nova. O resto do
  formulário não muda.
- O texto de apoio sob o seletor de tipo do evento especial já diz "pede uniforme de gala ou de campo"; o dos
  outros tipos não precisa citar uniforme.
- **Não quebra:** o ranking só lê `pontosUniforme`/`uniforme` do evento especial
  (`apps/api/src/ranking/regras/regras.service.ts:53-61`, que filtra `EVENTO_ESPECIAL`); a troca de uniforme com a
  lista concluída só acontece no especial (`servico-eventos.ts:277`, sai se o tipo não é especial). O pacote
  offline já leva o uniforme de qualquer tipo (`sync.service.ts:110`, `contratos/sync.ts:55`). Os testes de formulário do especial continuam valendo.

### 2. Rota pública

`GET /api/agenda-publica/:slug`, `@Publica()`. O link do pai é `/agenda/{slug}` usando o `slug` que o clube
**já tem** (único em `Clube`). Sem token, sem tabela nova, sem tela de geração no painel.

**Quem lê o clube pelo slug.** Só `sessao/`, `auth/`, `scripts/` e `tarefas/` podem importar `PrismaSistema`
(regra do lint em `eslint.config.mjs:23-44`, conferida por `prisma-sistema.restricao.spec.ts`), e o
`PrismaService` comum lança sem `clubeId`, inclusive em `Clube`. Então:

- Um serviço pequeno em **`auth/`** (ao lado do convite por link) resolve `slug → { clubeId, nome }` com
  `PrismaSistema` e responde 404 se o slug não existe. É o mesmo caminho do convite
  (`convite-acesso-publico.service.ts:31-39`).
- O módulo `agenda-publica/` recebe o `clubeId` e lê eventos e configuração pelo `PrismaService` (com a guarda).
  Não se amplia a exceção do lint.

Resposta (contrato novo em `packages/shared`, `AgendaPublicaSaida`):

```
{ clube: { nome }, hoje: 'AAAA-MM-DD',
  compromissos: [{ data, fim?, nome, tipo, horario|null, local|null, uniforme|null }] }
```

`tipo` vai **cru** (o do calendário, mais `REUNIAO` para a semanal); quem agrupa Feriado, Férias e Sem reunião
como "Sem reunião" e escolhe a abreviação do calendário (Reun., Extra, Evento, Acamp., Sem) é a página.

Regras do serviço:

- **Hoje e a janela** vêm do fuso da configuração do clube (`hojeNoFuso`, como em `sync.service.ts`), não do
  relógio do servidor. A janela é de hoje a 120 dias.
- **Eventos:** `eventoCalendario` do clube, `removidoEm: null`, sobrepostos à janela, **sem** `CLASSE_BIBLICA`.
- **Reuniões semanais:** `diasDeReuniao` (`packages/shared/src/formulas/calendario.ts:82`) recebe **todos** os
  eventos não removidos, menos Classe Bíblica; Sem reunião, Feriado e Férias já tiram a data sozinhos. Cada data
  devolvida vira um compromisso "Reunião" com `horaReuniao` e `localReuniaoPadrao` da configuração e uniforme
  `CAMPO`, **exceto** quando há uma **Reunião extra com "Terá reunião"** naquela data: aí a extra, com o horário
  e o local dela, **substitui** a linha semanal. Extra só com classe não substitui nada: a semanal fica e a extra
  entra como evento.
- Não devolve pontos, lista, ids de pessoas, unidades nem o encontro da Classe Bíblica.
- **Cache:** sem cache no servidor (não há infraestrutura para isso). A resposta leva
  `Cache-Control: public, max-age=60`, que segura a rajada de quando o link é repassado.
- **Limite de requisições:** `GuardaLimite` com `@SkipThrottle({ porEmail: true })` e um limite por IP próprio e
  mais folgado que o do login (que é 20/min, `limite.ts:51-54`): pais saindo da mesma igreja compartilham o IP.
  Valor inicial: 120 por minuto por IP.

### 3. Página

Rota `/agenda/:slug` fora do layout autenticado, no mesmo padrão de `rotasAcessoPublicas`
(`apps/web/src/modulos/acesso/rotas.tsx:11`, com teste em `substituto.test.tsx`), junto de `/conectar`
(`apps/web/src/rotas.tsx:67-70`). Nada no nginx nem no service worker barra o anônimo.

- **Sem credencial.** O cliente HTTP do app manda `Authorization` quando há sessão e tenta renovar em 401
  (`apps/web/src/api/cliente.ts:220-228`). A página usa uma chamada **sem sessão**, para não tocar na sessão de
  um pai que também seja usuário do app.
- **Sem buscador.** A página põe `<meta name="robots" content="noindex">` ao montar, e o nginx do web
  (`apps/web/nginx.conf`) manda `X-Robots-Tag: noindex` para `/agenda/`. Não há mecanismo de meta no web hoje.
- **Sem conexão.** A faixa do estado "Sem conexão" é montada pelo layout autenticado; a página pública precisa
  montá-la por conta própria (quem implementa confere onde ela fica hoje).

## Critérios de pronto

1. Abrir `/agenda/{slug-do-clube}` sem login mostra cabeçalho, próximo compromisso, lista e calendário.
2. O próximo compromisso é o de menor data a partir de hoje; reunião semanal aparece com "Uniforme de campo".
3. Criar Reunião extra, Evento do clube, Evento especial e Acampamento exige uniforme e vem "campo" marcado.
4. O uniforme escolhido aparece na página pública com o `UniformeDoEvento`.
5. Reunião extra com reunião no dia da semanal substitui a linha semanal, com o horário e o local dela.
6. Evento antigo sem uniforme aparece sem etiqueta; abrir esse evento para editar vem "campo" marcado.
7. A resposta pública não contém `pontos`, `lista`, `clubeId` nem nomes de pessoas (teste de contrato).
8. Classe Bíblica não aparece; Sem reunião, Feriado e Férias aparecem como aviso sem uniforme.
9. Slug inexistente mostra a página de "Agenda não encontrada" (404).
10. Os quatro estados da tela existem; no celular (400px) a página não rola na horizontal.
11. A página carrega com `noindex` (meta e cabeçalho). A rota usa o limite próprio e responde `Cache-Control: public, max-age=60`.
12. Pontos e ranking do evento especial seguem iguais (testes existentes passam).

## Fora de escopo

- Botão "Copiar link" ou tela no painel do Adm para ver o link (hoje o link é `/agenda/{slug}`, montado à mão).
- Link com token revogável. O slug não se revoga; os dados são os que o clube já divulga aos pais.
- Uniforme padrão da reunião semanal configurável. É fixo em campo.
- Observações, recado do clube e qualquer campo novo de texto.
- Migration de eventos antigos.
- Horário ou local específico por reunião semanal (a página usa o padrão do clube).
- Confirmação de presença dos pais, notificações, adicionar à agenda do celular.

## Considerado e descartado

- **Recado do clube** num campo novo: descartado pelo usuário; o escopo é só exibir o que já existe.
- **Reaproveitar observações da reunião:** não há como cadastrá-las para o público e podem ser internas.
- **Token por link, com tela de gerar/revogar:** exigiria mexer no painel do Adm; fica para depois.
- **Etiqueta de tipo em cada card:** repetia o nome ("Reunião · Reunião"); o tipo ficou no calendário.

## Decisões a confirmar

1. Feriado e Férias aparecem como avisos na página pública (Classe Bíblica não).
2. Slug do clube como parte do link, sem token. Quem souber o endereço vê; quem adivinhar o slug também.

## ONDE FICA

- o uniforme só no especial, a validação  `packages/shared/src/formulas/calendario.ts:210-225`
- o contrato do evento                      `packages/shared/src/contratos/calendario.ts:10-45`
- a lista de tipos e o enum de uniforme     `packages/shared/src/enums.ts:37-41`
- descarte do uniforme fora do especial     `apps/api/src/calendario/eventos.controller.ts:31-35`
- as colunas do evento                      `apps/api/src/calendario/servico-eventos.ts:125-142`
- a leitura do calendário do ano            `apps/api/src/calendario/servico-eventos.ts:160-180`
- dias de reunião e situação da data        `packages/shared/src/formulas/calendario.ts:50-85`
- dia, hora e local padrão da reunião       `apps/api/prisma/schema.prisma:249-251`
- slug único do clube                       `apps/api/prisma/schema.prisma:185-190`
- rota pública e limite de requisições      `apps/api/src/auth/convite-acesso-publico.controller.ts:15-30`
- o estado do uniforme no formulário        `apps/web/src/modulos/adm/calendario/FormularioEvento.tsx:135,161,260,328`
- a regra de PrismaSistema no lint          `eslint.config.mjs:23-44`
- o convite por link lê o clube em auth/    `apps/api/src/auth/convite-acesso-publico.service.ts:31-39`
- limite de requisições                     `apps/api/src/auth/limite.ts:45-61`
- o ranking só do especial                  `apps/api/src/ranking/regras/regras.service.ts:53-61`
- o cliente HTTP e o refresh em 401         `apps/web/src/api/cliente.ts:220-228`
- rotas públicas com teste                  `apps/web/src/modulos/acesso/rotas.tsx:11`
- o componente de uniforme                  `apps/web/src/modulos/adm/calendario/UniformeDoEvento.tsx`
- as rotas fora do login                    `apps/web/src/rotas.tsx:70`
- conferido em                              `61f95b6`
