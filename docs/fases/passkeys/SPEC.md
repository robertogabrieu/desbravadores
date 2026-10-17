# Entrar com digital ou rosto (passkeys) — SPEC

Hoje só se entra com e-mail e senha. Esta SPEC acrescenta uma segunda forma: **digital, rosto ou o
bloqueio de tela do celular**, pelo padrão WebAuthn (passkeys). A senha continua existindo; a
passkey é um atalho, não um substituto.

O app nunca recebe a digital. O celular a confere e libera uma chave guardada nele; o servidor só
guarda a metade pública dessa chave.

## O que muda para quem usa

### Minha conta — cadastrar o aparelho

Um cartão novo, **"Entrar com digital ou rosto"**, entre "Papel em uso" e "Sessão":

- **Aparelho sem suporte** (`window.PublicKeyCredential` ausente): o cartão explica "Este aparelho
  não permite entrar com digital ou rosto." e não mostra botão.
- **Sem nenhuma cadastrada:** texto curto + botão **"Ativar neste aparelho"**.
- **Com cadastradas:** lista (nome, "criada em …", "usada por último em …") com **"Remover"** em cada
  uma, e o botão **"Ativar neste aparelho"** para somar outra.
- **Ativar:** pede a **senha** da conta (mesma regra do login) e só então chama o celular. Quem roubou
  uma sessão aberta não consegue deixar uma porta própria.
- O nome da passkey sai do aparelho (`user-agent`: "Chrome no Android", "Safari no iPhone") e a pessoa
  pode trocá-lo ao ativar.
- **Remover** pede confirmação. Remover a última não tira o acesso: a senha continua valendo.

### Primeiro login — o convite (jeito de app de banco)

Logo depois de um **login por senha** num aparelho que suporta e ainda não tem passkey deste app, antes
de abrir o app aparece uma tela: **"Quer entrar com digital ou rosto da próxima vez?"** com **"Ativar"**
e **"Agora não"**.

- **Ativar** não pede a senha de novo: ela acabou de ser digitada. O servidor aceita o cadastro sem
  senha só se a sessão nasceu de um login por senha há menos de 5 minutos (regra 15).
- **Agora não** guarda a escolha neste aparelho e não pergunta de novo por 30 dias. O cartão da Minha
  conta continua disponível.
- Quem entrou por convite de acesso (primeira senha) recebe o mesmo convite.

### Login — entrar

**Aparelho com passkey ativada** (o app lembra disso em `localStorage`, junto com o e-mail): a tela abre
com o e-mail já preenchido, o botão principal **"Entrar com digital ou rosto"** e, abaixo, o link
"Usar senha". A digital é pedida assim que a pessoa toca no botão (não automaticamente, para não
assustar nem travar quem quer trocar de conta).

**Aparelho sem passkey ativada**: o formulário de sempre, com o botão secundário **"Entrar com digital
ou rosto"** só se o aparelho suporta.

Nos dois casos o botão **não depende do e-mail**: o celular mostra as passkeys dele para este site e a
pessoa escolhe; o e-mail lembrado é só conforto. Passkey apagada do celular (a pessoa removeu pelas
configurações do sistema): o toque falha com a mensagem de recusa e a tela volta para o formulário de
senha, esquecendo a marca do aparelho.

- **Certo:** entra como no login por senha (mesmo papel inicial, mesma sessão).
- **Cancelou no celular:** nada acontece, sem mensagem de erro.
- **Passkey inválida, removida ou de conta desativada:** a mesma mensagem do login por senha
  (`MENSAGEM_LOGIN_RECUSADO`), sem dizer qual foi o motivo.

## Regras

1. **Biblioteca:** `@simplewebauthn/server` na API e `@simplewebauthn/browser` no web. Não escrever a
   verificação criptográfica à mão.
2. **Verificação do usuário obrigatória** (`userVerification: 'required'`): só vale com digital, rosto
   ou PIN do aparelho, nunca só "tocar na chave".
3. **Passkey encontrável** (`residentKey: 'required'`): é o que permite entrar sem digitar e-mail.
4. **`rpID` e `origin` saem de `APP_URL`** (já obrigatório em produção). Em dev, `localhost`. Mudar o
   domínio de produção invalida todas as passkeys: avisar no deploy.
5. **Desafio de uso único, com validade de 5 minutos**, guardado no banco. Consumido na verificação,
   dê certo ou errado.
6. **Contador:** só rejeita se o contador guardado for maior que zero e o recebido não for maior.
   Passkeys sincronizadas (iCloud, Google) mandam sempre zero e não podem ser recusadas.
7. **Conta `ATIVO` apenas.** `CONVIDADO` e `INATIVO` recusam como credencial errada.
8. **Nunca apagar linha:** remover preenche `revogadaEm`. Passkey revogada não loga.
9. **A chave pública e o `credentialId` não saem em nenhuma resposta.** A lista devolve só id interno,
   nome, `criadoEm` e `ultimoUsoEm`.
10. **Rotas irmãs de `/eu/passkeys`:** listar e remover sempre filtram por `usuarioId` da sessão;
    passkey de outra pessoa responde 404.
11. **Sair de todos / redefinir senha não removem passkeys** (são do aparelho da pessoa). Mas ambos já
    revogam as sessões, então um login por passkey depois deles abre sessão nova, como esperado.
12. **Limite de tentativas:** as rotas públicas usam `GuardaLimite` por IP (sem e-mail, como o aceite
    de convite).
13. **Substituição (`tipo` no JWT) não muda:** passkey só abre sessão normal.
14. **Tela de celular trata os quatro estados** (carregando, vazio, erro, sem conexão) no cartão da
    conta; sem conexão, "Ativar" e "Remover" ficam desligados com o motivo escrito.
15. **Cadastro sem senha só logo após login por senha.** `POST /eu/passkeys/opcoes` aceita ou a senha
    ou a prova de que a família de refresh da sessão foi criada por senha há menos de 5 minutos
    (`criadoEm` da família + marca do método). Sessão renovada, aberta por passkey ou por convite
    de substituição nunca serve.

## Dados

Migration `20261013120000_passkeys`:

- `CredencialPasskey`: `id`, `usuarioId` (Restrict), `credentialId` (único), `chavePublica` (bytes),
  `contador` (int, 0), `transportes` (lista de texto), `nome`, `criadoEm`, `ultimoUsoEm?`, `revogadaEm?`.
  Índice por `usuarioId`.
- `DesafioPasskey`: `id`, `desafio`, `finalidade` (`CADASTRO` | `LOGIN`), `usuarioId?` (só no
  cadastro), `expiraEm`, `usadoEm?`.

Nenhum dos dois leva `clubeId`: usuário é global.

## Rotas

Aparelho compartilhado: o e-mail lembrado fica no aparelho depois de "Sair" (como nos bancos). O cartão
da Minha conta tem **"Esquecer este aparelho"**, que apaga a marca e o e-mail do `localStorage` sem
mexer nas passkeys do servidor.

| Rota | Declara | Faz |
|---|---|---|
| `POST /auth/passkey/login/opcoes` | `@Publica` + limite | gera desafio, devolve opções + id do desafio |
| `POST /auth/passkey/login` | `@Publica` + limite | verifica, abre sessão (mesmo corpo de `/auth/login`) |
| `POST /eu/passkeys/opcoes` | `@Autenticado` | confere a senha (ou a sessão recente por senha), gera desafio de cadastro |
| `POST /eu/passkeys` | `@Autenticado` | verifica e grava a credencial |
| `GET /eu/passkeys` | `@Autenticado` | lista as não revogadas |
| `DELETE /eu/passkeys/:id` | `@Autenticado` | revoga (404 se não for da sessão) |

Contratos (zod) em `packages/shared`. Códigos de erro existentes bastam (`CREDENCIAIS`, `TOKEN_INVALIDO`,
`NAO_ENCONTRADO`).

## Tabela de estados do login por passkey

| Passkey | Conta | Desafio | Resultado |
|---|---|---|---|
| existe, ativa | ATIVO | válido | entra |
| existe, ativa | ATIVO | usado/vencido/ausente | recusa |
| existe, revogada | qualquer | qualquer | recusa |
| não existe | — | qualquer | recusa |
| existe, ativa | CONVIDADO/INATIVO | válido | recusa |
| assinatura inválida | qualquer | válido | recusa (e consome o desafio) |

## Inventário de saídas

Entidade nova, sem relação em nenhuma resposta existente. `GET /eu` **não** muda (a lista tem rota
própria, para não pesar no carregamento de toda tela). `Usuario` ganha só a relação no schema.

## Fora do escopo

- Tirar a senha (conta só com passkey).
- Passkey para a credencial de substituição.

## Testes

- API (integração, banco próprio): cada linha da tabela de estados; senha errada no cadastro;
  passkey de outra pessoa em listar/remover; contador zero aceito; desafio reutilizado recusado.
  A verificação criptográfica é simulada no limite da biblioteca, com um autenticador de teste.
- Web: cartão da conta nos quatro estados; aparelho sem suporte; login com cancelamento silencioso; convite após o primeiro login (ativar, agora não, não repetir em 30 dias); tela com e-mail lembrado.
- e2e roda só no CI (nginx/HTTPS reais); não cobre biometria.

## Antes de ir ao ar

- HTTPS e `APP_URL` com o domínio final: passkey não funciona em HTTP fora de `localhost`.
- Conferir no iPhone (PWA instalado) e no Android (Chrome e PWA) — o emulador não prova biometria.

ONDE FICA
- login por senha e abertura de sessão     apps/api/src/auth/auth.service.ts:35-42, 112-122
- rotas de auth e decorators de acesso     apps/api/src/auth/auth.controller.ts:30-139
- limite por IP sem e-mail                 apps/api/src/auth/auth.controller.ts:93-96
- cookie do refresh                        apps/api/src/auth/cookie-refresh.ts
- token de uso único (modelo p/ desafio)   apps/api/src/sessao/token-uso-unico.service.ts:10-60
- modelo Usuario / TokenUsoUnico           apps/api/prisma/schema.prisma:260, 370
- códigos de erro                          apps/api/src/comum/erros.ts:6-25
- tela de login                            apps/web/src/modulos/acesso/Login.tsx
- tela Minha conta                         apps/web/src/modulos/conta/PaginaConta.tsx
- contrato de login                        packages/shared/src/contratos/auth.ts:5
- última migration                         apps/api/prisma/migrations/20261012130000_regras_de_pontuacao
- conferido em                             d2f9c0c
