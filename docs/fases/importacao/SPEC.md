# Importar desbravadores por planilha — SPEC

O Adm que implanta o app num clube já tem a lista dos desbravadores numa planilha. Cadastrar um a
um é o que trava a implantação. Esta SPEC traz para cá a importação do app Desbravadores Finance
(enviar planilha → revisar numa grade editável → confirmar), adaptada ao modelo deste app.

## O que muda para quem usa

Em **Adm → Desbravadores**, ao lado de "Novo desbravador", o botão **"Importar planilha"** abre a
tela `/adm/desbravadores/importar`:

1. **Enviar** — escolher um `.xlsx` ou `.csv` (até 3 MB e 500 linhas). Um link **"Baixar modelo"**
   entrega um `.xlsx` com o cabeçalho certo e uma linha de exemplo. O texto da tela diz quais
   colunas são obrigatórias.
2. **Revisar** — uma grade com uma linha por pessoa. Cada linha tem uma caixa "Importar", as células
   editáveis (texto, data, sexo, unidade e classe em lista) e, abaixo, os erros e avisos dela. No
   topo, a contagem: "N prontas · M com aviso · K com erro". Linha com erro não pode ser marcada até
   ser corrigida; linha duplicada chega desmarcada.
3. **Confirmar** — o botão "Importar N desbravadores" grava as linhas marcadas e volta para a lista
   com a mensagem "N desbravadores importados.".

## Colunas

O cabeçalho é reconhecido pelo nome, sem ordem fixa, sem acento e sem diferença de caixa, por
trecho (como no Finance). Colunas desconhecidas são ignoradas.

| Coluna (aceita também) | Campo | Regra |
|---|---|---|
| Nome (`nome completo`) | `nome` | obrigatório, 2 a 120 letras |
| Data de nascimento (`nascimento`) | `nascimento` | obrigatório; `dd/mm/aaaa`, `aaaa-mm-dd` ou data do Excel |
| Sexo | `sexo` | obrigatório; `M`/`F`/`Masculino`/`Feminino` |
| Unidade | `unidadeId` | opcional; casa pelo nome da unidade do clube, sem acento e sem caixa |
| Classe | `classeId` | opcional; casa pelo nome da classe **regular ativa**; vazia → sugerida pela idade |
| Responsável | `responsavelNome` | opcional |
| Telefone (`celular`, `fone`) | `responsavelTelefone` | opcional, como veio |
| E-mail (`email`) | `responsavelEmail` | opcional; e-mail inválido é erro |
| Entrada no clube (`entrada`) | `entradaEm` | opcional; vazia → hoje no fuso do clube |

Se faltar a coluna **Nome**, **Data de nascimento** ou **Sexo**, a prévia não traz linhas e a tela
diz quais colunas faltam.

## Regras

- **Duplicado:** mesmo nome (sem acento, caixa e espaços extras) **e** mesmo nascimento que um
  desbravador do clube, **inclusive inativo**, ou que outra linha da mesma planilha. É **aviso**, não
  erro: a linha chega desmarcada e o Adm pode marcá-la e importar mesmo assim.
- **Unidade não encontrada:** aviso "A unidade X não existe no clube" e a célula vem vazia, para o
  Adm escolher na lista ou deixar sem unidade. A importação **não cria unidade**.
- **Classe não encontrada:** aviso "A classe X não existe" e a célula vem vazia.
- **Classe vazia:** sugerida pela idade no início do ano do clube, pela mesma regra do aviso de idade
  do cadastro, com o aviso "Classe sugerida pela idade: X". Idade sem classe correspondente → fica
  sem classe, sem aviso extra.
- **Matrícula:** com classe, matricula na regular do ano do clube **e na avançada ligada**, como o
  cadastro de um a um (`incluirAvancada` = verdadeiro).
- **Unidade × sexo:** o aviso de unidade de sexo diferente do cadastro aparece na prévia.
- **Nome público:** calculado como no cadastro de um a um.
- **Tipo:** toda linha importada é `DBV`. Líder continua sendo cadastrado um a um.
- **Tudo ou nada:** a confirmação revalida todas as linhas marcadas. Se alguma tiver erro, **nada é
  gravado** e a resposta (422) aponta os erros por linha, que a grade mostra. Sem erro, grava tudo
  numa transação. O motivo: meia importação obrigaria o Adm a descobrir quais linhas entraram, e
  importar de novo duplicaria as outras.
- **Permissão:** `dbv.cadastrar` (a mesma do cadastro).
- **Limites:** 3 MB (o `client_max_body_size` atual do nginx; não exige mudança no servidor) e 500
  linhas por planilha, com a mensagem "A planilha tem N linhas; o limite é 500. Divida a planilha.".

## API

| Rota | Entrada | Saída |
|---|---|---|
| `GET /api/desbravadores/importacao/modelo` | — | `.xlsx` do modelo |
| `POST /api/desbravadores/importacao/previa` | multipart, campo `arquivo` | `{ colunasFaltando: string[], linhas: LinhaDaPrevia[] }` |
| `POST /api/desbravadores/importacao` | `{ linhas: LinhaImportada[] }` (JSON) | `{ importados: number }` ou 422 com `{ erros: { linha, mensagens[] }[] }` |

`LinhaDaPrevia` = número da linha na planilha, os campos já convertidos (ids de unidade e classe
resolvidos), `erros: string[]`, `avisos: string[]`, `duplicado: boolean`. Os contratos ficam em
`packages/shared`. A leitura da planilha é no servidor, com `exceljs` (a mesma biblioteca do
Finance); `.csv` é lido como texto, com `;` ou `,`.

## Fora desta entrega

- Rascunho salvo automaticamente da revisão (o Finance tem).
- Exportar a lista de desbravadores em planilha.
- Atualizar desbravador existente pela planilha (duplicado nunca sobrescreve).
- Importar líderes.

## Critério de pronto

- Testes de API: prévia com as três colunas faltando; conversão de datas (três formatos) e sexo;
  duplicado contra o banco (inclusive inativo) e entre linhas; unidade e classe não encontradas;
  classe sugerida pela idade; e-mail inválido; limite de linhas; confirmação que grava DBV, membro
  de unidade e matrículas regular e avançada; confirmação com uma linha errada que não grava nada;
  isolamento entre clubes (unidade e classe de outro clube respondem como inexistentes); permissão.
- Testes do front: os quatro estados, grade com contagem, linha com erro não marcável, duplicado
  desmarcado, edição de célula refazendo a validação daquela linha, confirmação e 422 por linha.
- Lint, tipos e as suítes passam; a tela cabe em 390 px sem rolagem lateral da página (a grade rola
  dentro de si).
