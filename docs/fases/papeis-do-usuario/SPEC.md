# Papéis do usuário, um por vez — SPEC

Hoje o Adm muda os papéis de alguém numa tela só, "Editar usuário", que empilha um bloco por papel
com seletor de papel, uma caixa por unidade ou classe e uma caixa por permissão — quatorze classes e
seis permissões num bloco de instrutor — e um único Salvar no fim. Não há como **remover** um papel:
só desativar a pessoa no clube inteiro. Esta SPEC passa os papéis para a **ficha do usuário**, um
cartão por papel, e dá a cada ação a sua tela: **Acrescentar papel** (dois passos), **Alterar**
(escopo e ajustes de um papel) e **Remover papel** (confirmação). O convite usa as mesmas peças.

O modelo aprovado (opção A) está em `modelo/` (`.dc.html`). **Ele é o alvo:** se esta SPEC e o
modelo divergirem, vale o modelo — salvo as exceções declaradas em "Exceções ao modelo". Do modelo
copia-se estrutura, ordem e texto, **nunca CSS**: as classes saem dos tokens e dos componentes de
`ui/`. `modelo/Hoje.dc.html` é a tela atual de edição, só para comparação.

| Tela | Modelo |
|---|---|
| Ficha do usuário com os papéis | `modelo/A1-Ficha.dc.html` |
| Acrescentar papel, passo 1 (qual papel) | `modelo/A2-Papel.dc.html` |
| Acrescentar papel, passo 2 (unidades ou classes) | `modelo/A3-Classes.dc.html` |
| Alterar papel | `modelo/A4-Alterar.dc.html` |
| Remover papel (confirmação) | `modelo/A5-Remover.dc.html` |

## O que muda para quem usa

- **A ficha mostra os papéis como cartões**: papel, escopo (unidades ou classes) e "Permissões do
  papel" com o selo "+ N ajuste(s)" ou "sem ajustes"; quando há ajuste, uma linha diz qual
  ("Ajuste: também pode Editar dados dos DBVs da unidade" ou "Ajuste: não pode …"). Cada cartão tem
  **Alterar** e **Remover papel**. Acima dos cartões, **Acrescentar papel**.
- **Acrescentar papel** é tela própria, em dois passos: escolher o papel em cartões que dizem o que
  ele faz; depois as unidades (conselheiro) ou as classes (instrutor) em chips. Adm não tem passo 2.
- **O papel não se troca.** Para virar instrutor quem era conselheiro, remove-se um e
  acrescenta-se o outro. Alterar mexe só no escopo e no que o papel pode fazer.
- **Remover papel** pede confirmação que diz o que a pessoa deixa de fazer, o que continua guardado
  e com que papel ela segue. Remover o último papel deixa a pessoa **Inativa** neste clube.
- **"Desativar neste clube" continua** no rodapé da ficha, discreto, para quem sai do clube de vez.
- **"Editar usuário"** fica só com nome e gênero, e só para quem ainda não aceitou o convite.
- **"Convidar usuário" deixa de ter seletor de papel**: dados e **um** papel, com os mesmos cartões
  e chips de Acrescentar; os outros papéis se acrescentam na ficha.

## Endereços

| Tela | Endereço | Voltar |
|---|---|---|
| Ficha | `/adm/usuarios/:id` (já existe) | lista, como hoje |
| Acrescentar, passo 1 | `/adm/usuarios/:id/papeis/novo` | ficha ("Carla Mendes") |
| Acrescentar, passo 2 | `/adm/usuarios/:id/papeis/novo?papel=conselheiro` ou `=instrutor` | ficha; o botão "Voltar" do rodapé leva ao passo 1 com o papel marcado |
| Alterar | `/adm/usuarios/:id/papeis/:vinculoId` | ficha |
| Editar dados | `/adm/usuarios/:id/editar` (já existe) | ficha |
| Convidar usuário | `/adm/usuarios/novo` (já existe) | lista |

- Mesmo padrão das rotas de hoje (`modulos/adm/usuarios/rotas.tsx:6-11`); `papeis/novo` declarada
  **antes** de `papeis/:vinculoId`. Voltar sempre com destino explícito, nunca `navegar(-1)`,
  repassando o estado de volta da ficha (`navegacao.ts:27-35`) para ela seguir devolvendo a lista
  com filtro e página.
- O papel do passo 2 mora no endereço: recarregar ou mandar o link funciona. `?papel=` inválido,
  `?papel=adm` (Adm não tem passo 2) ou papel que a pessoa já tem ativo volta ao passo 1,
  substituindo o endereço.
- O link "Acrescentar papel" de quem está Inativo, hoje `editar?acrescentar=1`
  (`FichaUsuario.tsx:179`), passa a `papeis/novo`; o parâmetro sai (`EditarUsuario.tsx:126`).

## Regras

**Acrescentar.** `POST /usuarios/:id/vinculos` (`usuarios.controller.ts:57-65`). Papel que a pessoa
já tem ativo fica desabilitado com "já tem" (a API recusa com 409 CONFLITO,
`usuarios.service.ts:272-278`). Com os três papéis, o botão some e fica "Carla já tem todos os
papéis". O papel nasce **sem ajustes** ("Carla começa com as permissões de instrutora. Dá para
ajustar depois, em Alterar."). Papel removido **volta** pelo mesmo caminho: a API reaproveita o
registro antigo e troca unidades, classes e ajustes pelos do pedido (`usuarios.service.ts:338-344`)
— volta limpo, sem os ajustes de antes. Acrescentar oferece só unidades e classes **ativas**.

**Escopo.** Conselheiro escolhe ao menos uma unidade; instrutor, ao menos uma classe. A API aceita
lista vazia (`contratos/usuarios.ts:10-11`); a recusa é da tela, no Salvar, sem gravar: a mensagem
("Escolha pelo menos uma unidade.") aparece junto do Salvar, o foco vai ao grupo de chips e o grupo
aponta para ela (`aria-describedby`). Classes em três grupos, com os nomes da tela de classes
(`PainelClasses.tsx:72-91`): Regulares, Avançadas, Agrupadas. Unidades sem grupo. A busca filtra pelo
nome sem acento; "N escolhidas" (`aria-live="polite"`) conta também o que a busca escondeu.

**Inativas no Alterar.** A lista de unidades da tela vem só com as ativas (`useUnidades()` sem
`todas`, `api/leitura.ts:40-47`) e o bloco de hoje esconde as classes inativas
(`BlocoVinculo.tsx:49,58`). Unidade ou classe que o papel já tem e não está entre as ativas aparece
marcada, com o nome que o próprio papel traz (`VinculoSaida`, `contratos/usuarios.ts:40-47`) e
"(inativa)" — sem segunda leitura com `todas: true`. Hoje elas já ficam gravadas (o rascunho leva
todos os ids do papel, `vinculos.ts:17-22`) mas invisíveis, sem como desmarcar. A API aceita manter a
classe inativa que o papel já tinha (`usuarios.service.ts:309-335`).

**Alterar.** `PUT /vinculos/:id` (`usuarios.controller.ts:75-88`) com o corpo de `corpoDaEdicao`:
escopo e ajustes, nunca o papel (`vinculos.ts:62-67`). "Ajustar o que pode fazer" vem **recolhido**;
o cabeçalho mostra "N alteração(ões)" quando há ajuste. Aberto, lista as permissões do catálogo que
valem para o papel (`vinculos.ts:25-26`, `permissoes.ts:11-34`), cada uma com interruptor e a
etiqueta "padrão" ou "alterado"; voltar ao padrão apaga o ajuste (`vinculos.ts:32-37`). "Volta ao
padrão do papel" zera os ajustes do rascunho (grava só no Salvar). Salvar sem mudança volta à ficha
sem chamar a API. **Adm não tem Alterar** (a API recusa ajuste de Adm, `usuarios.service.ts:293-296`).

- **Rascunho limpo:** ao montar o rascunho do papel (`rascunhoDoVinculo`, `vinculos.ts:17-22`),
  descartam-se ajustes iguais ao padrão e os que não valem para o papel — a API pode guardá-los
  (`usuarios.service.ts:363-368` grava o que vier). Assim "alterado", "N alterações" e o selo da
  ficha contam a mesma coisa.
- **Papel removido por outra pessoa:** o PUT não confere se o papel está ativo
  (`usuarios.service.ts:189-208`). Se a resposta do Salvar trouxer o papel inativo, a tela diz "Este
  papel foi removido por outra pessoa." e volta à ficha. Dois Adm alterando o mesmo papel: vale a
  última gravação (aceito).
- **Fila do aparelho:** desmarcar uma unidade ou classe tem o mesmo efeito da fila descrito em
  Remover para o que a pessoa registrou nela sem internet.

**Remover.** `PUT /vinculos/:id` com `{ ativo: false }` (`usuarios.service.ts:197-206`). Nada se
apaga: o papel fica inativo, com as unidades e classes que tinha. O que **chegou ao servidor** —
reuniões e chamadas, classes registradas, observações, materiais, fotos — aponta para a pessoa, não
para o papel (`schema.prisma:660,697,805,953,1107,1137`), e continua no clube para quem cuida daquela
unidade ou classe. **Observações** de instrutor ficam visíveis só ao Adm e a quem tem "Ver
observações de outros instrutores" (`observacoes.service.ts:62,141,154`). O acesso muda: cada pedido
confere se o papel está ativo (`guarda-sessao.guard.ts:28-31`); quem usa aquele papel cai na escolha
de papel no próximo toque (`cliente.ts:138-142`), e sem papel nenhum não abre sessão
(`sessao.service.ts:29-33`). Sem internet, o aparelho segue mostrando o que já tinha baixado até se
conectar (modo sem conexão vale 7 dias, `offline/tempos.ts:18`) — limite conhecido.

- **Fila do aparelho (limite):** o que a pessoa registrou sem internet e ainda não subiu só é
  enviado em nome do papel em que foi feito (`offline/motor.ts:136`); sem esse papel a fila pausa
  (`:232-238`) ou o envio é recusado e fica como erro no aparelho (`:261-269`). Por isso a
  confirmação pede que a pessoa abra o app com internet antes.
- **Último Adm do clube:** 422 ULTIMO_ADM (`usuarios.service.ts:280-286`), seja o Adm a própria
  pessoa ou outra. O erro aparece **dentro da confirmação**, que segue aberta (`erro` de
  `Confirmacao.tsx:14-15`; fechar só no sucesso, `testes/dialogo-fecha-no-sucesso.test.ts`): "O clube
  precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de remover este papel." (texto de
  `vinculos.ts:90-93`, que hoje diz "mudar esta").
- **Último papel:** situação "Inativo" (`usuarios.service.ts:46-49`); a ficha fica sem cartões, com
  "Nenhum papel neste clube" e "Acrescentar papel".
- **O próprio papel da sessão:** depois de remover, a tela não relê a ficha (não teria mais acesso a
  ela): relê a sessão e vai direto a `/papel`; sem papel ativo em clube nenhum, sai e vai ao login com
  o aviso "Você não tem mais acesso a nenhum clube." A escolha de papel (`EscolherPapel.tsx:24-45`,
  hoje sem estado vazio) ganha "Você não tem mais acesso a nenhum clube." com botão para o login.
- **Ficha de desbravador ligada à conta:** papel de conselheiro ou instrutor põe a pessoa na
  Diretoria; sem ele, a ficha volta a Desbravador, salvo idade ou marcação do Adm
  (`tipo-da-ficha.service.ts:119-123`, `formulas/diretoria.ts:51-60`). Regra de hoje, sem mudança.

**Desativar neste clube** volta ao rodapé da ficha como ação secundária discreta, com a confirmação
de hoje (`FichaUsuario.tsx:174-197`): remover papel a papel não é atômico para quem sai do clube. O
erro de último Adm também aparece dentro da confirmação.

**Convidado que fica sem papel** (removido o último, ou desativado): o convite enviado continua
válido, mas quem aceita **não entra**. O aceite grava a senha e só depois abre a sessão
(`auth.service.ts:57-66`), que recusa quem não tem papel ativo (`refresh.service.ts:39`,
`sessao.service.ts:31-33`); a tela "Definir senha" mostra, abaixo do formulário, a mensagem da API
"Você não tem acesso ativo a nenhum clube." (`DefinirSenha.tsx:19-21`, `acesso/mensagens.ts:16-20`).
A senha fica valendo para quando ganhar papel. Aceito.

## Textos da confirmação de remover

Título: "Remover o papel de <Papel no gênero> de <primeiro nome>?" Botões: Cancelar e Remover papel
(perigo). Primeiro parágrafo, pelo papel (lista de nomes com `juntarNomes`, `modulos/adm/formatos.ts:57-60`):

| Papel | Texto |
|---|---|
| Conselheiro | "Carla deixa de acompanhar a unidade Águias e não vê mais os desbravadores, as reuniões nem as fotos dela, assim que o aparelho se conectar." |
| Instrutor | "Carla deixa de instruir as classes Amigo e Companheiro e não vê mais as chamadas nem os requisitos delas, assim que o aparelho se conectar." |
| Adm | "Carla deixa de cuidar do clube: usuários, unidades, classes, calendário e ranking." |

Segundo parágrafo: "O que já chegou ao clube continua guardado." Para conselheiro e instrutor, mais:
"Se Carla registrou algo sem internet, peça que abra o app com internet antes." Depois, conforme o
caso (pronome pelo gênero; **sem gênero, o primeiro nome** no lugar do pronome):

| Caso | Exemplo |
|---|---|
| Segue com um papel | "Ela segue como conselheira das Águias." |
| Segue com dois | "Ela segue como Adm e conselheira das Águias." (`juntarNomes` dos restantes) |
| Sem gênero | "Alex segue como instrutor das classes Amigo e Guia." |
| Último papel | "Era o último papel de Carla neste clube: ela deixa de entrar no clube. Para voltar, acrescente um papel." |
| É você | Título "Remover o seu papel de Adm?" e "Você perde esse acesso na hora." (mais a frase de último papel, se for) |

## Editar dados

A tela deixa de editar papéis: saem os blocos, "+ Acrescentar papel" e a gravação em sequência
(`EditarUsuario.tsx:133-165,186-219`). Ficam **nome e gênero**; o botão continua **"Salvar
alterações"**.

A regra é a **situação no clube**: só CONVIDADO edita (`usuarios.service.ts:153-158`; a API também
recusa quem tem papel em outro clube). Convidado sem papel aparece como Inativo
(`usuarios.service.ts:46-49`) e não edita — aceito. Sem papéis na tela, para os demais não sobra nada
a editar (hoje a tela abre com tudo travado, `EditarUsuario.tsx:171-179`). Então:

- o botão **Editar** só aparece na ficha de quem está CONVIDADO, ao lado de "Reenviar convite";
- `/adm/usuarios/:id/editar` de quem não é convidado **redireciona para a ficha** (substituindo o
  endereço);
- o e-mail sai da tela (está na ficha e nunca se edita);
- recusa da API (outro clube) aparece no formulário, como hoje.

## Convidar usuário

Hoje o convite (`EditarUsuario.tsx:37-106`) repete o bloco com seletor de papel, caixas de unidade,
classe e permissão (`BlocoVinculo`). Passa a ser **uma tela só**, de cima para baixo:

1. **Dados:** Nome, E-mail, Gênero.
2. **"Que papel <primeiro nome> vai ter?"** (sem nome: "Que papel a pessoa vai ter?"): os cartões do
   passo 1 de Acrescentar, nenhum marcado, nenhum "já tem".
3. **Conselheiro ou instrutor** escolhido, aparece abaixo o bloco do passo 2 (busca, "N
   escolhidas", chips em grupos, ao menos uma, só ativas). Adm não tem o bloco. Trocar o papel limpa
   o escopo.
4. Ajuda: "Começa com as permissões do papel. Outros papéis e ajustes, depois, na ficha." Cancelar
   (lista) e Salvar no fim do formulário.

Salvar manda `POST /usuarios` com **um** vínculo, sem ajustes (`contratos/usuarios.ts:30-35`) e vai
à ficha do convidado, que lê do servidor (a resposta é eco para e-mail que já existe,
`usuarios.service.ts:116-139`). Recusas na tela: sem nome ou e-mail; sem papel ("Escolha um papel.");
sem escopo; e-mail que já tem esse papel no clube (409, `usuarios.service.ts:124`). Uma tela e não
passos: três telas obrigariam a guardar nome e e-mail entre elas. `BlocoVinculo.tsx` sai inteiro.

## API

Leitura e escrita já existem; **muda só a trava do último Adm**. Nenhuma rota, contrato ou migration.

| Ação | Rota | Onde |
|---|---|---|
| Ler a pessoa e os papéis | `GET /usuarios/:id` | `usuarios.controller.ts:28-32`; traz os inativos (`usuarios.service.ts:141-144`) |
| Convidar | `POST /usuarios` | `usuarios.controller.ts:34-38`, `usuarios.service.ts:116-139` |
| Acrescentar papel | `POST /usuarios/:id/vinculos` | `usuarios.controller.ts:57-65`, `usuarios.service.ts:176-187` |
| Alterar / Remover | `PUT /vinculos/:id` | `usuarios.controller.ts:79-87`, `usuarios.service.ts:189-208` |
| Desativar no clube | `POST /usuarios/:id/desativar` | `usuarios.controller.ts:50-55`, `usuarios.service.ts:163-174` |
| Editar nome e gênero | `PATCH /usuarios/:id` | `usuarios.controller.ts:40-48`, `usuarios.service.ts:146-161` |
| Catálogo de permissões | `GET /permissoes/catalogo` | `permissoes.controller.ts:9` |

**Exceção à "API sem mudança": último Adm sob concorrência.** Hoje a contagem de Adm ativos roda
**fora** da transação que grava (`usuarios.service.ts:167` e `:197-199` contam; `:169-172` e
`:202-206` gravam): dois Adm removendo um ao outro ao mesmo tempo passam os dois e o clube fica sem
Adm. A contagem (`exigirOutroAdm`, `:280-286`) passa para **dentro** da `$transaction`, depois de
`pg_advisory_xact_lock(hashtextextended('adm-do-clube:' || clubeId, 0))`, em `desativar` e em
`editarVinculo` com `ativo: false`. Escolhi a trava consultiva por ser o padrão do projeto
(`materiais.service.ts:182`, `importacao.service.ts:175`, `servico-eventos.ts:151`): uma linha, sem
`$queryRaw` de leitura, e a segunda transação espera e conta de novo. `FOR UPDATE` nas linhas de Adm
também serviria, mas precisa de SQL cru lendo linhas; isolamento serializável exigiria repetir a
transação ao falhar, o que o projeto não faz em lugar nenhum.

- Todas pedem `usuario.gerenciar`; papel de outro clube → 404 (`usuarios.service.ts:191-192`).
- Contrato e catálogo como estão: `VinculoEntrada`, `VinculoEditarEntrada`, `VinculoSaida`
  (`contratos/usuarios.ts:7-27,40-47`), `CATALOGO_PERMISSOES` (`permissoes.ts:11-34`).

## Telas, na ordem do modelo

- **Ficha** (`A1`): Voltar "Usuários"; sobretítulo "Usuário · <situação>"; h1 nome; ações (só
  convidado): Editar e Reenviar convite. Cartão compacto de dados (e-mail, gênero, situação; 3
  colunas, 1 no celular). "Papéis no clube" com "Acrescentar papel" à direita e um cartão por papel
  ativo, na ordem Adm, Conselheiro, Instrutor (`usuarios.service.ts:52`): ícone, título no gênero
  (`FichaUsuario.tsx:26-30`), escopo (`vinculos.ts:78-88`), "Permissões do papel" + selo, linha de
  ajuste, Alterar e Remover papel. Adm: "Todo o clube", "Todas as permissões do clube", só Remover.
  Saem o selo "Ativo" (`FichaUsuario.tsx:76`) e a lista "O que pode fazer" (`:78-95`). Rodapé:
  "Desativar neste clube", secundário.
- **Passo 1** (`A2`): "Acrescentar papel · passo 1 de 2"; h1 "Que papel <primeiro nome> vai ter?";
  cartões de escolha única (rádio). Continuar e Cancelar no fim. Com Adm, o botão vira **Salvar**.
- **Passo 2** (`A3`): "Acrescentar papel · passo 2 de 2 · <Papel>"; h1 "Que unidades <nome> vai
  acompanhar?" ou "Que classes <nome> vai instruir?"; busca; "N escolhidas"; chips; ajuda; Salvar
  e Voltar.
- **Alterar** (`A4`): Voltar com o nome; "<Nome> · Alterar papel"; h1 o papel; escopo em chips;
  "Ajustar o que pode fazer" recolhível; Cancelar e Salvar alterações.
- **Remover** (`A5`): `Confirmacao` sobre a ficha, com os textos acima.

Estados de toda tela nova: **carregando** (usuário e, quando preciso, catálogo, unidades ou classes
— a tela só aparece com tudo lido, como `FichaUsuario.tsx:58-64`); **não encontrado** ("Não
encontramos este usuário"; em Alterar, "Não encontramos este papel" para papel inexistente, inativo,
de Adm ou de outra pessoa); **erro** com Tentar de novo; **sem conexão** ("Disponível com internet",
`FichaUsuario.tsx:41-54`). Erro ao gravar aparece na própria tela. Nada `fixed`/`sticky` novo; no
celular o rodapé empilha, principal em cima, largura total (`RodapeDoFormulario`).

**Acessibilidade.** Interruptor com `role="switch"` e `aria-checked`, nome = rótulo da permissão,
etiqueta "padrão"/"alterado" como descrição (`aria-describedby`). "Ajustar o que pode fazer" é botão
com `aria-expanded` e `aria-controls`. Cada grupo de chips é um `fieldset` nomeado pelo título
("Unidades", "Regulares"…). Cartão "já tem" desabilitado com o motivo lido junto (`aria-describedby`,
como no modelo). Cartões, chips e interruptor contornam com `border-borda-controle` (3:1), não
`border-borda` (`ui/contraste.test.tsx:104-121` recusa contorno claro em caixa).

## Componentes

- No módulo de usuários, compartilhados por Acrescentar e Convidar: **escolha do papel** (cartões,
  "já tem" opcional) e **escolha do escopo** (busca, contagem, grupos, inativas já ligadas).
- `Chip` (`ui/Chip.tsx:11-24`) serve, mas hoje o selecionado é suave e o não selecionado usa
  `border-borda` (`:19`, contado como pendência em `ui/contraste.test.tsx:94-101`). Ganha a variante
  **cheia** do modelo (selecionado `bg-marca text-sobre-marca`, ✓ à esquerda) e passa a
  `border-borda-controle`; a entrada `'ui/Chip.tsx': 1` sai da lista de pendências. Presença e
  filtros seguem na variante de hoje.
- **Interruptor novo em `ui/`** (`role="switch"`, alvo de 44 px), testado em
  `ui/componentes-novos.test.tsx`.
- `Confirmacao`, `Cartao`, `CabecalhoDaPagina`, `ListaDePares`, `RodapeDoFormulario`,
  `EstadoNaoEncontrado`, `Selo` como estão.
- `vinculos.ts` ganha: o rascunho limpo, a contagem de ajustes, a frase de cada ajuste e os textos
  da confirmação. `oQuePodeFazer` (`vinculos.ts:70-75`) sai se a ficha não usar mais.
- Sessão: `ContextoSessao` (`sessao/useSessao.ts:9-24`) ganha "reler a sessão", que hoje só roda por
  dentro (`lerEu`, `ProvedorSessao.tsx:79,140`).

## Cache

`useAcrescentarVinculo` e `useEditarVinculo` já gravam a resposta na ficha e refazem `['usuarios']`
(`api/usuarios.ts:43-55,69-81`). Ao gravar papel (acrescentar, alterar, remover, desativar,
convidar), refazem também: `['unidades']` (a unidade mostra os conselheiros,
`contratos/unidades.ts:21`) e `['desbravadores']` (`api/desbravadores.ts:48-49`), porque o tipo da
ficha ligada à conta pode mudar entre Diretoria e DBV (`tipo-da-ficha.service.ts:119-123`). Se o
usuário da ficha é quem está logado, relê a sessão, para o seletor de papel do cabeçalho
(`layouts/SeloPapel.tsx:51,78`) não oferecer papel que não existe mais.

## Exceções ao modelo

- **Situação na ficha:** "Ativa · aceitou o convite" vira "Ativa · <último acesso>", como a ficha já
  mostra (`FichaUsuario.tsx:32-36`).
- **Ações de convidado:** o modelo mostra pessoa ativa; para convidado, Editar e Reenviar convite
  aparecem no cabeçalho.
- **"Desativar neste clube"** fica no rodapé da ficha, que o modelo não tem: é a ação de uma vez só
  para quem sai do clube.
- **Remover — texto:** "O que ela já registrou nessas classes continua guardado" vira "O que já
  chegou ao clube continua guardado", mais o pedido de abrir o app com internet: o que está só no
  aparelho não sobe sem o papel. Somam-se "assim que o aparelho se conectar" e as variações de
  último papel, a si mesmo, Adm e sem gênero.
- **Inativas no escopo:** chips de unidade ou classe inativa que o papel já tem, com "(inativa)".
- **Passo 1 com Adm:** com Adm escolhido, Continuar vira Salvar.
- **"Ajustar o que pode fazer"** começa recolhido; o modelo o mostra aberto.
- **Convidar usuário** não tem modelo: monta-se com as peças de `A2` e `A3` abaixo dos dados.

## Descobribilidade (as quatro perguntas)

- **Pré-requisitos:** conselheiro precisa de unidade ativa; instrutor, de classe ativa. Sem nenhuma,
  o bloco de escopo diz "Nenhuma unidade ativa no clube" com link para Unidades (ou "Nenhuma classe
  ativa" com link para Classes e especialidades), e o Salvar não aparece.
- **Vazio:** pessoa sem papel: "Nenhum papel neste clube" com Acrescentar papel. Busca sem
  resultado: "Nenhuma classe com esse nome" (ou unidade). Escolha de papel sem papel nenhum: "Você
  não tem mais acesso a nenhum clube." com saída para o login.
- **Bloqueio:** já tem o papel → cartão desabilitado com "já tem"; último Adm → mensagem na
  confirmação dizendo o que fazer antes; editar dados de quem já aceitou → o botão não existe.
- **Perfil e escopo:** todas as telas são do Adm (`usuario.gerenciar`). A confirmação diz o que a
  pessoa deixa de ver, quando, e com que papel segue.

## Fora de escopo

- Atribuir papéis a partir da unidade ou da classe (opção C) e a ficha toda editável (opção B).
- Convidar com mais de um papel ou com ajustes: faz-se depois, na ficha.
- Mudar o catálogo de permissões, a regra de Diretoria ou o motor da fila offline.
- Ver ou restaurar papéis removidos (ficam no banco; nenhuma tela os mostra).
- Impedir que o convidado sem papel grave a senha ao aceitar.

## Critério de pronto

- **Web:** ficha com cartões, escopo, selo e linha de ajuste; Adm sem Alterar; Desativar no rodapé.
  Acrescentar: "já tem"; dois passos, Adm em um; `?papel=` inválido ou `adm` volta ao passo 1;
  recarregar o passo 2 mantém o papel. Escopo vazio: mensagem junto do Salvar, foco no grupo.
  Alterar: "(inativa)" aparece e segue no PUT; rascunho limpo; etiqueta padrão/alterado; Volta ao
  padrão; sem mudança não chama a API; papel removido por outro → aviso e ficha. Remover: cada
  variação de texto (tabela), PUT `ativo: false`, último papel → Inativo, ULTIMO_ADM dentro do
  diálogo aberto; o próprio papel → `/papel`, ou login com aviso. Editar: só convidado, não
  convidado redireciona. Convidar: um papel, escopo só para conselheiro e instrutor, Salvar → ficha.
  Cache conforme a seção. Os quatro estados em cada tela nova. Nenhum "aula" na interface.
- **API:** teste com **duas remoções simultâneas** dos dois últimos Adm (uma passa, a outra 422
  ULTIMO_ADM), em `PUT /vinculos/:id` e em `desativar`; teste da **volta de papel removido** pelo
  acrescentar (mesmo registro, escopo novo, sem os ajustes antigos). A suíte de usuários continua
  verde (`usuarios.spec.ts:279-318`, `:322-422`, `:541-616`).
- **Testes web que mudam:** `ficha.test.tsx:62-84` (cartão com "O que pode fazer" vira selo e linha
  de ajuste), `:115-121` (Acrescentar do inativo), `:129-189` (edição com blocos), `:190-217`
  (convite por cartão); `:85-114` (desativar) continua. `usuarios.test.tsx:126-178` (convite com
  vários papéis) reescrito; `:188-248` (edição com papéis) sai; `:181-186` e `:249-279` continuam.
  `ui/contraste.test.tsx:94-101` perde `'ui/Chip.tsx'`. Handlers: usar os existentes
  (`testes/handlers/usuarios.ts:68-71` e seguintes).
- **e2e:** `fundacao.spec.ts:41-50` e `domingo.spec.ts:59-65` passam a marcar o cartão
  "Conselheiro" e o chip da unidade. `fichas.spec.ts:66-88` continua (convidado, Editar, "Salvar
  alterações"). A medição de `fichas.spec.ts:266-280` ganha: Convidar com Instrutor escolhido (chips
  carregados), Alterar de um instrutor, os dois passos de Acrescentar e o diálogo de remover em 390.
  Caso novo de sessão: uma segunda pessoa perde o papel que está usando e cai na escolha de papel.
- **Roteiro de QA** seguindo cada tela do modelo, e também: Adm no passo 1; `?papel=adm`; textos de
  último papel e "é você"; bloqueio de último Adm; chips "(inativa)"; Convidar; `/editar` de quem
  não é convidado.
- Lint, tipos e suítes passando; medido no DOM em 390, 820 e 1280 px sem rolagem lateral.

## ONDE FICA

```
- rotas do módulo                         apps/web/src/modulos/adm/usuarios/rotas.tsx:6-11
- ficha (cartão, dados, rodapé, desativar) apps/web/src/modulos/adm/usuarios/FichaUsuario.tsx:26-36, :41-64, :66-98, :124-197
- convidar / editar usuário                apps/web/src/modulos/adm/usuarios/EditarUsuario.tsx:37-106 (convidar), :112-225 (editar; :126 acrescentar=1; :133-165 gravação; :171-179 campos; :186-219 blocos)
- entrada do convite (botão na lista)      apps/web/src/modulos/adm/usuarios/AdmUsuarios.tsx:88-90
- bloco de vínculo (sai)                   apps/web/src/modulos/adm/usuarios/BlocoVinculo.tsx:33-44, :49, :58
- rascunho, ajustes e textos               apps/web/src/modulos/adm/usuarios/vinculos.ts:17-22, :25-37, :62-67, :70-75, :78-88, :90-93
- juntar nomes                             apps/web/src/modulos/adm/formatos.ts:57-60
- hooks                                    apps/web/src/api/usuarios.ts:43-55, :66-81 ; apps/web/src/api/leitura.ts:23-30, :32-47, :57 ; apps/web/src/api/desbravadores.ts:48-49
- voltar com destino                       apps/web/src/modulos/adm/navegacao.ts:27-35
- grupos de classes (como agrupar)         apps/web/src/modulos/adm/classes/PainelClasses.tsx:72-91
- chip / confirmação                       apps/web/src/ui/Chip.tsx:11-24 ; apps/web/src/ui/Confirmacao.tsx:14-15 ; apps/web/src/testes/dialogo-fecha-no-sucesso.test.ts
- sessão no web                            apps/web/src/sessao/useSessao.ts:9-24 ; sessao/ProvedorSessao.tsx:79, :140 ; apps/web/src/api/cliente.ts:138-142 ; layouts/SeloPapel.tsx:51, :78 ; modulos/acesso/EscolherPapel.tsx:24-45
- fila offline                             apps/web/src/offline/motor.ts:136, :232-238, :261-269 ; offline/tempos.ts:18
- aceite de convite                        apps/api/src/auth/auth.service.ts:57-66 ; apps/api/src/sessao/refresh.service.ts:39 ; apps/web/src/modulos/acesso/DefinirSenha.tsx:14-22 ; acesso/mensagens.ts:16-20
- API usuários e vínculos                  apps/api/src/usuarios/usuarios.controller.ts:28-88 ; usuarios.service.ts:46-49, :116-208, :272-344, :363-368
- trava consultiva (padrão)                apps/api/src/materiais/materiais.service.ts:182 ; desbravadores/importacao.service.ts:175 ; calendario/servico-eventos.ts:151
- sessão confere papel ativo               apps/api/src/comum/guards/guarda-sessao.guard.ts:28-31 ; apps/api/src/sessao/sessao.service.ts:29-33
- observações de outros                    apps/api/src/observacoes/observacoes.service.ts:62, :141, :154
- Diretoria pela conta                     apps/api/src/desbravadores/tipo-da-ficha.service.ts:119-123 ; packages/shared/src/formulas/diretoria.ts:51-60
- registros apontam para a pessoa          apps/api/prisma/schema.prisma:285-302 (Vinculo), :660, :697, :805, :953, :1107, :1137
- contratos                                packages/shared/src/contratos/usuarios.ts:7-47 ; contratos/unidades.ts:21 ; contratos/classes.ts:6-20
- catálogo e padrões                       packages/shared/src/permissoes.ts:11-34, :45-49, :57-70
- testes API                               apps/api/src/usuarios/usuarios.spec.ts:279-318, :322-422, :541-616
- testes web                               apps/web/src/modulos/adm/usuarios/ficha.test.tsx:62-217 ; usuarios.test.tsx:126-279 ; apps/web/src/ui/{contraste.test.tsx:94-121,componentes-novos.test.tsx} ; testes/handlers/usuarios.ts:68-71
- e2e                                      e2e/fichas.spec.ts:66-88, :209-216, :266-280 ; e2e/fundacao.spec.ts:41-50 ; e2e/domingo.spec.ts:59-65
- conferido em                             c097f6b
```
