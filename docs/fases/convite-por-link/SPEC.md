# Convite de acesso por link, a partir da ficha do desbravador — SPEC

Desbravadores mais velhos que já foram importados ou cadastrados são conselheiros ou instrutores. Para
dar acesso a eles hoje, o Adm precisa saber o e-mail de cada um e cadastrá-lo em Usuários, e a conta
fica solta, sem ligação com a ficha. Esta SPEC cria o convite **por link**: o Adm gera na ficha do
desbravador, manda pelo WhatsApp, e a própria pessoa informa o e-mail e a senha. A conta nasce ligada
à ficha dela.

**Fora do escopo, de propósito:** Líder e Diretoria. O cadastro **não muda de tipo** ao ganhar acesso
— ser conselheiro ou instrutor não torna ninguém Líder nem membro da Diretoria. A entrada automática
na Diretoria pela idade é outra entrega.

## O que muda para quem usa

### Adm — gerar

No painel do desbravador (Adm → Desbravadores → Editar), uma seção **"Acesso ao app"**:

- **Sem conta ligada e sem convite aberto:** botão **"Gerar convite de acesso"**. Abre a escolha do
  papel: **Conselheiro** (escolher a unidade, uma ou mais) ou **Instrutor** (escolher a classe, uma ou
  mais). Confirmar gera o link.
- **Com convite aberto:** mostra o link, o papel, até quando vale, e os botões **"Copiar link"**,
  **"Enviar pelo WhatsApp"** (abre `https://wa.me/?text=` com a mensagem pronta) e **"Cancelar
  convite"**. "Gerar outro" invalida o anterior.
- **Com conta ligada:** mostra "Tem acesso: e-mail · papel" e nenhum botão de convite. (Mudar papel
  continua sendo em Usuários.)

Texto da mensagem do WhatsApp: "Olá, {primeiro nome}! Você foi convidado para usar o App do
Desbravador no {clube} como {conselheiro da unidade X | instrutor de Y}. Crie seu acesso: {link}".

### Convidado — aceitar

O link abre `/acesso/{token}` sem login: "O {clube} convidou você, {nome}, para ser {papel}." e o
formulário **E-mail**, **Confirme o e-mail**, **Senha**, **Confirme a senha** (mesmas regras de senha
do app). Botão "Criar meu acesso".

- **E-mail novo:** cria a conta (nome e gênero vindos da ficha), já ativa, com a senha informada.
- **E-mail que já tem conta** (de outro clube, por exemplo): a tela pede "Você já tem conta. Digite a
  senha que você usa." e, com a senha certa, o acesso novo entra na mesma conta. Senha errada recusa
  como o login.
- Nos dois casos: cria o vínculo do papel no clube (com as unidades ou classes escolhidas), liga a
  ficha do desbravador à conta, marca o convite como usado e entra no app já logado.
- Link usado, vencido ou cancelado: "Este convite não vale mais. Peça um novo ao Adm do clube."

## Regras

- **Um link por ficha:** gerar de novo invalida o convite aberto da mesma ficha.
- **Validade:** 7 dias; uso único; o Adm pode cancelar.
- **Token:** aleatório de 32 bytes, guardado só o hash, como o convite por e-mail.
- **Ficha já ligada a uma conta:** não gera convite (422).
- **Conta já ligada a outra ficha no mesmo clube:** recusa (422 "Este e-mail já está ligado a outro
  desbravador do clube."). Uma conta liga no máximo uma ficha por clube.
- **Papel já existente:** se a conta já tem o mesmo papel ativo no clube, acrescenta as unidades ou
  classes do convite a ele em vez de recusar.
- **Desbravador com conta:** a regra "só líder pode ter conta de usuário" deixa de valer; qualquer
  tipo de cadastro pode ser ligado a uma conta. O tipo não muda.
- **Unidade e classe** do convite são conferidas na geração e de novo no aceite (precisam continuar
  existindo, ativas e do clube); se alguma sumiu, o aceite recusa com mensagem e o Adm gera outro.
- **Permissão:** gerar e cancelar exigem `usuario.gerenciar` (o Adm). Aceitar é público, com o mesmo
  limite por IP do aceite de convite atual.
- **Isolamento:** o convite pertence ao clube (`clubeId`), entra em `MODELOS_DE_CLUBE` na mesma
  migration; ficha, unidade e classe de outro clube respondem 404.

## API

| Rota | Quem | Entrada | Saída |
|---|---|---|---|
| `POST /api/desbravadores/:id/convite-acesso` | Adm | `{ papel: 'CONSELHEIRO', unidadeIds } \| { papel: 'INSTRUTOR', classeIds }` | `{ link, expiraEm, papel, ... }` |
| `GET /api/desbravadores/:id/convite-acesso` | Adm | — | convite aberto ou `null`, e a conta ligada (e-mail, papéis) se houver |
| `DELETE /api/desbravadores/:id/convite-acesso` | Adm | — | 204 |
| `GET /api/acesso/:token` | público | — | `{ clube, nome, papel, unidades\|classes }` ou 410 |
| `POST /api/acesso/:token` | público | `{ email, senha }` | sessão logada (como o aceite de convite atual); `{ codigo: 'CONTA_EXISTENTE' }` 409 quando o e-mail já tem conta e a senha não confere |

O link completo é montado pelo servidor com `APP_URL`. Contratos em `packages/shared`.

## Critério de pronto

- API: gerar (com unidade e com classes), regerar invalida o anterior, cancelar, ficha já ligada
  recusa, papel inválido/unidade de outro clube 404, permissão; aceitar com e-mail novo cria conta
  ativa + vínculo + liga a ficha + sessão; e-mail existente com senha certa acrescenta vínculo; senha
  errada 409; token usado/vencido/cancelado 410; conta já ligada a outra ficha do clube 422; mesmo
  papel existente acrescenta unidades/classes; unidade desativada entre gerar e aceitar recusa; o
  cadastro de um a um aceita DBV com conta.
- Web: seção "Acesso ao app" nos três estados, gerar com escolha de papel, copiar, link do WhatsApp com
  a mensagem, cancelar; tela `/acesso/:token` com e-mail novo, com conta existente (pede a senha que
  usa), confirmação de e-mail que não bate, convite inválido; quatro estados.
- Lint, tipos e suítes passam; as duas telas cabem em 390 px.
