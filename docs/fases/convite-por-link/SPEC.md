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

- **Ficha inativa:** não gera convite (422 "Reative o desbravador antes de convidar.").
- **Sem conta ligada e sem convite aberto:** botão **"Gerar convite de acesso"**. Abre a escolha do
  papel: **Conselheiro** (escolher a unidade, uma ou mais) ou **Instrutor** (escolher a classe, uma ou
  mais). Confirmar gera o link.
- **Com convite aberto:** mostra o papel e até quando vale ("Convite aberto para conselheira da
  unidade Águias, vale até …", no gênero da ficha). **O link aparece só na resposta de quem acabou de
  gerar** — o banco guarda apenas o hash do token, então ao reabrir o painel o link não volta. Logo
  depois de gerar: botões **"Copiar link"** e **"Enviar pelo WhatsApp"** (abre `https://wa.me/?text=`
  com a mensagem pronta). Depois disso, a tela explica que o link aparece só ao gerar; **para reenviar
  é preciso "Gerar outro"**, que invalida o anterior. **"Cancelar convite"** em qualquer momento.
- **Com conta ligada:** mostra "Tem acesso: e-mail · papel" e nenhum botão de convite. (Mudar papel
  continua sendo em Usuários.)

Texto da mensagem do WhatsApp: "Olá, {primeiro nome}! Você foi {convidado | convidada} para usar o App
do Desbravador no {clube} como {conselheiro(a) da unidade X | instrutor(a) de Y}. Crie seu acesso:
{link}". O gênero vem do `sexo` da ficha (F → convidada, conselheira, instrutora), aqui, no painel do
Adm e na tela pública de aceite.

### Convidado — aceitar

O link abre `/acesso/{token}` sem login: "O {clube} convidou você, {nome}, para ser {papel}." (papel no
gênero da ficha: "para ser conselheira da unidade Águias") e o
formulário **E-mail**, **Confirme o e-mail**, **Senha**, **Confirme a senha** (mesmas regras de senha
do app). Botão "Criar meu acesso".

- **E-mail novo:** cria a conta (nome e gênero vindos da ficha), já ativa, com a senha informada.
- **E-mail que já tem conta** (de outro clube, por exemplo): a tela pede "Você já tem conta. Digite a
  senha que você usa." e, com a senha certa, o acesso novo entra na mesma conta. Senha errada recusa
  como o login.
- **E-mail de conta convidada por e-mail que ainda não criou a senha** (status Convidado): recusa com
  409 `CONTA_PENDENTE` e a tela mostra "Este e-mail já recebeu um convite por e-mail e ainda não criou
  a senha. Use o link desse e-mail ou peça ao Adm para reenviá-lo." — sem pedir senha.
- **E-mail de conta desativada:** recusa com 422 `CONTA_INATIVA` e a tela mostra "Esta conta está
  desativada. Fale com o Adm do clube."
- **Este link nunca define senha de conta que já existe** — só cria conta nova com senha.
- Nos dois casos: cria o vínculo do papel no clube (com as unidades ou classes escolhidas), liga a
  ficha do desbravador à conta, marca o convite como usado e entra no app já logado.
- Link usado, vencido, cancelado, ou de ficha inativada depois de gerado: "Este convite não vale mais.
  Peça um novo ao Adm do clube."

## Regras

- **Um link por ficha:** gerar de novo invalida o convite aberto da mesma ficha.
- **Validade:** 7 dias; uso único; o Adm pode cancelar.
- **Token:** aleatório de 32 bytes, guardado só o hash, como o convite por e-mail.
- **Ficha já ligada a uma conta:** não gera convite (422).
- **Ficha inativa:** não gera convite (422 "Reative o desbravador antes de convidar."); se for
  inativada depois de gerar, o link responde 410 como um convite cancelado.
- **Conta já ligada a outra ficha no mesmo clube:** recusa (422 "Este e-mail já está ligado a outro
  desbravador do clube."). Uma conta liga no máximo uma ficha por clube — **garantido no banco** por
  índice único parcial em `Desbravador (clubeId, usuarioId) WHERE usuarioId IS NOT NULL`. Dois aceites
  simultâneos da mesma conta em fichas diferentes: um entra, o outro recebe esse 422. O cadastro e a
  edição manual da ficha também recusam (422 "Este usuário já está ligado a outro desbravador do
  clube.").
- **Corrida de e-mail novo:** dois aceites simultâneos com o mesmo e-mail novo (convites diferentes):
  um cria a conta, o outro recebe 409 `CONTA_EXISTENTE` e passa a ver o caminho de conta existente.
- **Papel já existente:** se a conta já tem o mesmo papel ativo no clube, acrescenta as unidades ou
  classes do convite a ele em vez de recusar.
- **Desbravador com conta:** a regra "só líder pode ter conta de usuário" deixa de valer; qualquer
  tipo de cadastro pode ser ligado a uma conta. O tipo não muda.
- **Unidade e classe** do convite são conferidas na geração e de novo no aceite (precisam continuar
  existindo, ativas e do clube); se alguma sumiu, o aceite recusa com mensagem e o Adm gera outro.
- **Permissão:** gerar e cancelar exigem `usuario.gerenciar` (o Adm). Aceitar é público, com o mesmo
  limite por IP do aceite de convite atual (10/h) **e o limite por e-mail do login** (5/min, contado
  pelo e-mail do corpo, normalizado): senha errada na conta existente não gasta o convite, e sem o limite
  por e-mail daria para testar senhas de uma conta alheia a partir de vários IPs.
- **Isolamento:** o convite pertence ao clube (`clubeId`), entra em `MODELOS_DE_CLUBE` na mesma
  migration; ficha, unidade e classe de outro clube respondem 404.

## API

| Rota | Quem | Entrada | Saída |
|---|---|---|---|
| `POST /api/desbravadores/:id/convite-acesso` | Adm | `{ papel: 'CONSELHEIRO', unidadeIds } \| { papel: 'INSTRUTOR', classeIds }` | `{ link, expiraEm, papel, ... }` |
| `GET /api/desbravadores/:id/convite-acesso` | Adm | — | convite aberto ou `null`, e a conta ligada (e-mail, papéis) se houver |
| `DELETE /api/desbravadores/:id/convite-acesso` | Adm | — | 204 |
| `GET /api/acesso/:token` | público | — | `{ clube, nome, sexo, papel, unidades\|classes }` ou 410 |
| `POST /api/acesso/:token` | público | `{ email, senha }` | sessão logada (como o aceite de convite atual); 409 `CONTA_EXISTENTE` quando o e-mail já tem conta e a senha não confere; 409 `CONTA_PENDENTE` (conta convidada sem senha); 422 `CONTA_INATIVA`; 429 após 5 tentativas/min no mesmo e-mail ou 10/h no mesmo IP |

O link completo é montado pelo servidor com `APP_URL`. Contratos em `packages/shared`.

## Critério de pronto

- API: gerar (com unidade e com classes), regerar invalida o anterior, cancelar, ficha já ligada
  recusa, papel inválido/unidade de outro clube 404, permissão; aceitar com e-mail novo cria conta
  ativa + vínculo + liga a ficha + sessão; e-mail existente com senha certa acrescenta vínculo; senha
  errada 409; token usado/vencido/cancelado 410; conta já ligada a outra ficha do clube 422; mesmo
  papel existente acrescenta unidades/classes; unidade desativada entre gerar e aceitar recusa; o
  cadastro de um a um aceita DBV com conta; ficha inativa não gera e o link de ficha inativada responde
  410; conta convidada 409 `CONTA_PENDENTE` sem definir senha; conta inativa 422 `CONTA_INATIVA`;
  corrida de e-mail novo 409 e da mesma conta em duas fichas 422; cadastro/edição com conta já ligada a
  outra ficha do clube 422; 6ª tentativa no mesmo e-mail em 1 min 429 mesmo de IPs diferentes.
- Web: seção "Acesso ao app" nos três estados, gerar com escolha de papel, copiar, link do WhatsApp com
  a mensagem, cancelar; tela `/acesso/:token` com e-mail novo, com conta existente (pede a senha que
  usa), confirmação de e-mail que não bate, convite inválido; conta convidada sem senha e conta desativada mostram a saída; textos no gênero da ficha; quatro estados.
- Lint, tipos e suítes passam; as duas telas cabem em 390 px.
