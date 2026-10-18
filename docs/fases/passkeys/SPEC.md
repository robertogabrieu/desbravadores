# Entrar com digital ou rosto (passkeys) — SPEC

Hoje só se entra com e-mail e senha. Esta SPEC acrescenta uma segunda forma: **digital, rosto ou o
bloqueio de tela do celular**, pelo padrão WebAuthn (passkeys). A senha continua existindo; a
passkey é um atalho, não um substituto.

O app nunca recebe a digital. O celular a confere e libera uma chave guardada nele; o servidor só
guarda a metade pública dessa chave.

## O que muda para quem usa

### Primeiro login — o convite (jeito de app de banco)

Logo depois de um **login por senha** ou do **aceite de convite de acesso** (os dois em que a pessoa
acabou de digitar a senha), num aparelho que suporta e ainda não tem passkey deste app, aparece a tela
**"Quer entrar com digital ou rosto da próxima vez?"** com **"Ativar"** e **"Agora não"**. Nunca
aparece depois de um login por passkey.

- **Ativar** não pede a senha de novo: o app usa a que a pessoa acabou de digitar, guardada **só em
  memória** (variável do módulo, nunca em `localStorage`, estado de navegação ou histórico), por no
  máximo 5 minutos e apagada ao usar, ao fechar a tela ou ao sair. O servidor confere essa senha como
  confere a de qualquer cadastro (regra 16). Se a memória já expirou, a tela pede a senha.
- **Se Ativar falhar** (cancelou, erro, sem conexão): segue para o app, sem mensagem de erro.
- **Agora não** guarda a escolha neste aparelho e só pergunta de novo depois de 30 dias.
- **Vários papéis:** a tela vem **antes** da escolha de papel, porque o cadastro não depende do papel.

### Login — entrar

**Aparelho com passkey ativada** (marca em `localStorage`, regra 17): a tela abre com o e-mail já
preenchido, o botão principal **"Entrar com digital ou rosto"** e, abaixo, "Usar senha" e **"Esquecer
este aparelho"** (sempre visíveis). A digital só é pedida quando a pessoa toca no botão.

**Aparelho sem passkey ativada:** o formulário de sempre, com o botão secundário **"Entrar com digital
ou rosto"** só se o aparelho suporta.

O botão **não depende do e-mail**: o celular mostra as passkeys dele para este site e a pessoa
escolhe; o e-mail lembrado é só conforto.

- **Certo:** entra como no login por senha.
- **Cancelou no celular, ou erro do navegador:** nada acontece, sem mensagem. O navegador devolve o
  mesmo erro para "cancelou" e "não achei passkey", então **a marca do aparelho nunca é apagada
  sozinha**.
- **O servidor recusou** (passkey removida, conta desativada, desafio vencido, assinatura inválida):
  mensagem "Não foi possível entrar com a digital. Use sua senha.", foco no campo de senha.

### Minha conta — gerenciar

Cartão **"Entrar com digital ou rosto"** entre "Papel em uso" e "Sessão" (mesmo `Cartao` com `h2`,
`Botao` e `Confirmacao` das telas irmãs):

- **Aparelho sem suporte:** "Este aparelho não permite entrar com digital ou rosto.", sem botão.
- **Sem nenhuma cadastrada:** texto curto + **"Ativar neste aparelho"**.
- **Com cadastradas:** lista (nome, "criada em …", "usada por último em …") com **"Remover"** em cada
  uma (com confirmação), e o botão para somar outra.
- **Ativar** aqui pede a **senha** da conta. O nome vem de `navigator.userAgent` no web ("Chrome no
  Android", "Safari no iPhone", senão "Este aparelho"), editável ao ativar, até 60 caracteres.
- **"Esquecer este aparelho"** apaga a marca e o e-mail lembrado, sem mexer nas passkeys do servidor.
- Remover a última não tira o acesso: a senha continua valendo.
- **Estados:** carregando, vazio, erro e sem conexão (`useConexao().modo === 'SEM_CONEXAO'` desliga
  "Ativar" e "Remover" com o motivo escrito; nada disso entra na fila offline).

## Regras

1. **Biblioteca:** `@simplewebauthn/server` na API e `@simplewebauthn/browser` no web. Nada de
   verificação criptográfica à mão.
2. **Verificação do usuário obrigatória** (`userVerification: 'required'`).
3. **Passkey encontrável** (`residentKey: 'required'`): permite entrar sem e-mail. O login acha a
   credencial pelo `credentialId` e confere que o `userHandle` devolvido é o dono dela.
4. **`rpID` e `origin` saem de `APP_URL`**: `rpID` = `new URL(APP_URL).hostname`; `origin` = a origem
   inteira (com porta). Em dev/teste sem `APP_URL`, `http://localhost:5173`. Esta leitura é nova (hoje
   `APP_URL` só monta link de e-mail); em produção ela falha no primeiro uso se `APP_URL` faltar. Só
   essa origem vale: acessar por IP, `www` ou outro domínio recusa. Em produção:
   `APP_URL=https://desbravadores.adventistastucuruvi.com.br`, logo `rpID` é esse host inteiro (e não
   `adventistastucuruvi.com.br`: assim outro app do mesmo domínio não enxerga estas passkeys). Trocar o
   domínio de produção invalida todas as passkeys: avisar no deploy.
5. **Desafio de uso único, validade de 5 minutos**, no banco. Regras do desafio:
   - consumo **atômico antes de verificar** (marcar `usadoEm` só onde é nulo e `expiraEm` é futuro,
     como `token-uso-unico.service.ts:39-49`), dê certo ou errado;
   - `finalidade` tem que bater: desafio de LOGIN não serve no cadastro e vice-versa;
   - no cadastro, `usuarioId` do desafio tem que ser o da sessão;
   - `excludeCredentials` no cadastro; `credentialId` repetido responde `CONFLITO`, nunca 500;
   - cada criação de desafio apaga antes os vencidos há mais de 1 hora (não é histórico).
6. **Contador:** só rejeita se o guardado for maior que zero e o recebido não for maior. Passkeys
   sincronizadas mandam zero.
7. **Só conta `ATIVO`** loga ou cadastra passkey (`CONVIDADO`, `INATIVO` e `SUBSTITUTO` recusam).
8. **Nunca apagar linha:** remover preenche `revogadaEm`. Revogada não loga.
9. **Chave pública e `credentialId` não saem em nenhuma resposta.** A lista devolve id interno, nome,
   `criadoEm` e `ultimoUsoEm`.
10. **Rotas irmãs de `/eu/passkeys`:** listar e remover filtram por `usuarioId` da sessão; de outra
    pessoa responde 404.
11. **Redefinir senha revoga todas as passkeys** (preenche `revogadaEm`), junto com as sessões: é o
    caminho de recuperação de conta invadida, e uma passkey plantada pelo invasor não pode sobreviver.
    **Desativar a conta também revoga**, na mesma operação, e reativar não as ressuscita. "Sair de
    todos" **não** revoga (a pessoa as vê e remove na Minha conta).
12. **Limites de tentativas** (cada um com `@SkipThrottle({ porEmail: true })` onde não há e-mail):
    - `login/opcoes` e `login`: limite próprio por IP, folgado (60 por minuto), porque
      `LIMITE_POR_IP` (10 por hora) trancaria uma igreja inteira atrás do mesmo wi-fi;
    - `POST /eu/passkeys/opcoes` (confere senha): 5 tentativas por usuário a cada 15 minutos, senão
      vira oráculo de senha para quem roubou um access token.
13. **Substituição não muda:** o JWT com `tipo` já é recusado nas rotas `/eu` pela guarda de sessão.
14. **Tela de celular trata os quatro estados** no cartão da conta.
15. **Login por passkey faz o mesmo que `login`:** `criarFamilia`, `ultimoAcessoEm`, cookie de refresh e
    corpo `SessaoSaida`. Usuário sem vínculo ativo responde como o login por senha.
16. **Senha errada no cadastro responde `REGRA` (422)**, com "Senha incorreta.". Não usar `CREDENCIAIS`
    (401): o cliente web trata todo 401 fora de uma lista como sessão vencida, tenta renovar e pode
    derrubar a sessão (`apps/web/src/api/cliente.ts:112-134`). As rotas públicas `/api/auth/passkey/`
    entram nessa lista, porque ali 401 é resposta e não sessão vencida.
17. **O que o web guarda** (`localStorage`, chave `desbravadores:aparelho`, tudo em `try/catch`):
    `{ email, passkey: true }` e `{ recusadoEm }` para o "Agora não". A regra de "token fora de
    `localStorage`" do `cliente.ts` vale só para o access token. O e-mail lembrado fica depois de "Sair"
    (decisão de produto, como nos bancos); "Esquecer este aparelho" é o botão para quem quer apagar.

## Dados

Migration `20261013120000_passkeys` (conferir o número livre antes de implementar):

- `CredencialPasskey`: `id`, `usuarioId` (Restrict), `credentialId` (`String` base64url, único),
  `chavePublica` (`Bytes`; nunca converter para texto), `contador` (int, 0), `transportes` (`String[]`),
  `nome`, `criadoEm`, `ultimoUsoEm?`, `revogadaEm?`. Índice por `usuarioId`.
- `DesafioPasskey`: `id`, `desafio` (em claro, a biblioteca o compara), `finalidade` (`CADASTRO` |
  `LOGIN`), `usuarioId?` (só no cadastro), `expiraEm`, `usadoEm?`.
- `Usuario` ganha as duas relações.

Nenhum dos dois leva `clubeId` (usuário é global); como não são modelos de clube, **não entram em
`MODELOS_DE_CLUBE`**. Não mexe em `RefreshToken`.

## Rotas

Novo `passkeys.controller.ts` (e serviço) em `apps/api/src/auth/`, registrados no `AuthModule`. Os
contratos zod ficam em `packages/shared/src/contratos`; `SessaoSaida` já serve de resposta do login.

| Rota | Declara | Faz |
|---|---|---|
| `POST /auth/passkey/login/opcoes` | `@Publica` + limite próprio | gera desafio, devolve opções + id do desafio |
| `POST /auth/passkey/login` | `@Publica` + limite próprio | verifica, abre sessão |
| `POST /eu/passkeys/opcoes` | `@Autenticado` + limite por usuário | confere a senha, gera desafio de cadastro |
| `POST /eu/passkeys` | `@Autenticado` | verifica e grava a credencial |
| `GET /eu/passkeys` | `@Autenticado` | lista as não revogadas |
| `DELETE /eu/passkeys/:id` | `@Autenticado` | revoga (404 se não for da sessão) |

`GET /eu` não muda (`EuSaida` fica como está).

## Tabela de estados do login por passkey

| Passkey | Conta | Desafio | Resultado |
|---|---|---|---|
| existe, ativa, `userHandle` confere | ATIVO | válido, finalidade LOGIN | entra |
| existe, ativa | ATIVO | usado, vencido, ausente ou de outra finalidade | `CREDENCIAIS` |
| existe, revogada | qualquer | qualquer | `CREDENCIAIS` |
| não existe | — | qualquer | `CREDENCIAIS` |
| existe, ativa | CONVIDADO, INATIVO ou SUBSTITUTO | válido | `CREDENCIAIS` |
| assinatura inválida | qualquer | válido | `CREDENCIAIS` (e consome o desafio) |

Tabela do cadastro: sessão de conta não ATIVA → `NAO_AUTENTICADO` como hoje; senha errada → `REGRA`;
desafio vencido, usado ou de outro usuário → `TOKEN_INVALIDO` (410); `credentialId` repetido →
`CONFLITO`.

## Inventário de saídas

Entidade nova, sem aparecer em nenhuma resposta existente. A lista tem rota própria para não pesar no
`GET /eu`. Nada a mudar em nginx, CSP nem service worker (o `sw.ts` já deixa `/api/` de fora; o nginx
não define `Permissions-Policy`).

## Dependências e testes

- `@simplewebauthn/server` em `apps/api` e `@simplewebauthn/browser` em `apps/web`, com o
  `package-lock.json` atualizado (os Dockerfiles usam `npm ci`). **Conferir antes** que a versão do
  server tem build CommonJS: o Jest da API é CJS e não transforma pacote ESM; se não tiver, mock do
  módulo no limite da biblioteca.
- API (integração, banco próprio): cada linha das duas tabelas; senha errada e limite do cadastro;
  passkey de outra pessoa em listar/remover; contador zero aceito; desafio reutilizado, de outra
  finalidade e de outro usuário; redefinir senha e desativar conta revogam; `credentialId` repetido.
  Fábrica de passkey e autenticador de teste em `apps/api/test/fabricas.ts`.
- Web: cartão nos quatro estados (mock de `useConexao`); `window.PublicKeyCredential` e o módulo do
  navegador stubados (o jsdom não os tem); cancelamento silencioso; convite após o primeiro login
  (ativar, agora não, 30 dias, falha segue em frente); tela com e-mail lembrado; 401 de senha errada
  não derruba a sessão.
- `varredura-de-rotas.spec.ts` exige um decorator por rota: as seis rotas acima cumprem.
- e2e roda só no CI e não cobre biometria.

## Antes de ir ao ar

- HTTPS e `APP_URL` com o domínio final: passkey não funciona em HTTP fora de `localhost`, nem por IP.
- Validar no iPhone (PWA instalado) e no Android (Chrome e PWA) por domínio com HTTPS ou túnel;
  `localhost` só vale no computador.

## Fora do escopo

- Tirar a senha (conta só com passkey).
- Passkey para a credencial de substituição.
- Rotina periódica de limpeza de desafios (a limpeza na criação basta).

ONDE FICA
- login por senha e abertura de sessão     apps/api/src/auth/auth.service.ts:35-42, 84-88, 112-122
- rotas de auth e decorators de acesso     apps/api/src/auth/auth.controller.ts:30-139
- limite por IP sem e-mail (modelo)        apps/api/src/auth/auth.controller.ts:82-92; limites em limite.ts:49-63
- cookie do refresh (path /api/auth)       apps/api/src/auth/cookie-refresh.ts:5
- consumo atômico de token (modelo)        apps/api/src/sessao/token-uso-unico.service.ts:39-49
- access token (só sub e vínculo)          apps/api/src/sessao/access-token.service.ts:12-50
- modelo Usuario / RefreshToken / Token    apps/api/prisma/schema.prisma:260, 370, 408
- códigos de erro                          apps/api/src/comum/erros.ts:6-25
- APP_URL hoje                             apps/api/src/email/modelos.ts:4-5; docker-compose.prod.yml:35
- cliente web e lista de 401               apps/web/src/api/cliente.ts:112-134
- tela de login / Minha conta / guarda     apps/web/src/modulos/acesso/Login.tsx; modulos/conta/PaginaConta.tsx; sessao/GuardaRota.tsx
- hooks de auth no web                     apps/web/src/api/auth.ts:8-21
- varredura de rotas                       apps/api/src/comum/varredura-de-rotas.spec.ts:25-30
- banco de teste                           apps/api/test/banco.ts:24-36
- última migration                         apps/api/prisma/migrations/20261012130000_regras_de_pontuacao
- conferido em                             d2f9c0c
