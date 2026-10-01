# Importar desbravadores por planilha — SPEC

O Adm que implanta o app num clube já tem a lista dos desbravadores numa planilha. Cadastrar um a
um é o que trava a implantação. Esta SPEC traz para cá a importação do app Desbravadores Finance
(enviar planilha → revisar numa grade editável → confirmar), adaptada ao modelo deste app.

## O que muda para quem usa

Em **Adm → Desbravadores**, ao lado de "Novo desbravador", o botão **"Importar planilha"** abre a
tela `/adm/desbravadores/importar`:

1. **Enviar** — escolher um `.xlsx` ou `.csv` (até 3 MB e 500 linhas). Arquivo acima de 3 MB é
   recusado na própria tela, antes de enviar, com "A planilha precisa ter até 3 MB.". Um link **"Baixar modelo"**
   entrega um `.xlsx` com o cabeçalho certo e uma linha de exemplo. O texto da tela diz quais
   colunas são obrigatórias.
2. **Revisar** — uma grade com uma linha por pessoa. Cada linha tem uma caixa "Importar", as células
   editáveis (texto, data, sexo, unidade e classe em lista) e, abaixo, os erros e avisos dela. No
   topo, a contagem: "N prontas · M com aviso · K com erro". Linha com erro não pode ser marcada até
   ser corrigida; linha duplicada chega desmarcada.
3. **Confirmar** — o botão "Importar N desbravadores" grava as linhas marcadas e volta para a lista
   com a mensagem "N desbravadores importados.". A mensagem aparece uma vez: ao exibi-la, a tela
   limpa o estado da navegação, e recarregar a lista não a traz de volta.

## Colunas

O cabeçalho é reconhecido pelo nome, sem ordem fixa, sem acento e sem diferença de caixa, por
trecho (como no Finance). Colunas desconhecidas são ignoradas.

| Coluna (aceita também) | Campo | Regra |
|---|---|---|
| Nome (`nome completo`) | `nome` | obrigatório, 2 a 120 letras |
| Data de nascimento (`nascimento`) | `nascimento` | obrigatório; `dd/mm/aaaa`, `aaaa-mm-dd` ou célula formatada como data |
| Sexo | `sexo` | obrigatório; `M`/`F`/`Masculino`/`Feminino` |
| Unidade | `unidadeId` | opcional; casa pelo nome da unidade do clube, sem acento e sem caixa |
| Classe | `classeId` | opcional; casa pelo nome da classe **regular ativa**; vazia → sugerida pela idade |
| Responsável | `responsavelNome` | opcional |
| Telefone (`celular`, `fone`) | `responsavelTelefone` | opcional, como veio |
| E-mail (`email`) | `responsavelEmail` | opcional; e-mail inválido é erro |
| Entrada no clube (`entrada`) | `entradaEm` | opcional; mesmos formatos do nascimento; vazia → hoje no fuso do clube |

Se faltar a coluna **Nome**, **Data de nascimento** ou **Sexo**, a prévia não traz linhas e a tela
diz quais colunas faltam.

## Regras

- **Datas:** vale como data a célula que o Excel guarda formatada como data e o texto `dd/mm/aaaa`
  ou `aaaa-mm-dd`. Número solto (sem formato de data) é erro — "Data de nascimento inválida: 2015" ou
  "Data de entrada inválida: 2015" —, porque lido como dia serial "2015" viraria 07/07/1905. Planilha
  gravada com datas de 1904 (Mac; `date1904` no `workbook.xml`, como `1` ou `true`) é convertida com
  essa base. A data sai em UTC, e o fuso do servidor não tira um dia dela.
- **Duplicado:** mesmo nome (sem acento, caixa e espaços extras) **e** mesmo nascimento que um
  desbravador do clube, **inclusive inativo**, ou que outra linha da mesma planilha. Na prévia é
  **aviso**, não erro: a linha chega desmarcada e o Adm pode marcá-la e importar mesmo assim.
- **Duplicado na confirmação:** o servidor reconfere, com o banco e entre as linhas enviadas, sob uma
  trava por clube (duas abas confirmando juntas não gravam a mesma lista duas vezes). Cada linha leva
  `importarMesmoRepetido`: a tela manda `true` quando a prévia (ou uma recusa anterior) apontou a
  linha como repetida e o Adm a marcou. Repetida sem a marca recusa a confirmação inteira (422), com o
  erro na linha inteira: "Já existe no clube um desbravador com este nome e nascimento." ou "Esta
  pessoa já aparece na linha N da planilha.". Confirmar de novo a mesma lista, ou reenviar depois de
  uma queda de rede, cai aqui e não grava nada.
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
  gravado** e a resposta (422) aponta os erros por linha e por campo, que a grade mostra. Sem erro, grava tudo
  numa transação. O motivo: meia importação obrigaria o Adm a descobrir quais linhas entraram, e
  importar de novo duplicaria as outras.
- **Erro da recusa na grade:** o erro que veio do servidor fica até o Adm mexer no campo dele:
  editar um campo apaga só os erros do servidor daquele campo; o de linha inteira (pessoa repetida)
  some ao marcar ou desmarcar a linha, ou ao editar nome ou nascimento. Linha com erro de campo não
  pode ser marcada; com erro só de linha inteira, pode — e marcá-la é importar mesmo repetida.
- **Acessibilidade da grade:** cada célula com erro tem `aria-invalid`; cada erro e aviso está ligado
  à célula do seu campo por `aria-describedby`, e os da linha inteira (pessoa repetida), à caixa
  "Importar". A caixa desabilitada é descrita por "Corrija os erros desta linha para importar.".
- **Permissão:** `dbv.cadastrar` (a mesma do cadastro).
- **Limites:** 3 MB (o `client_max_body_size` atual do nginx; não exige mudança no servidor) e 500
  linhas por planilha, com a mensagem "A planilha tem N linhas; o limite é 500. Divida a planilha.".
  Se o nginx barrar o envio antes da API (413), a tela mostra a mesma mensagem de 3 MB.
- **Concorrência:** no máximo 2 prévias (leitura de planilha) ao mesmo tempo por processo da API; a
  terceira responde 422 "Outra importação está em andamento; tente de novo em instantes." sem ler o
  arquivo.
- **Node:** a leitura do `.xlsx` usa `zlib.crc32`, que exige Node 22.2 ou mais novo (`engines` da
  raiz: `>=22.2 <23`).

## API

| Rota | Entrada | Saída |
|---|---|---|
| `GET /api/desbravadores/importacao/modelo` | — | `.xlsx` do modelo |
| `POST /api/desbravadores/importacao/previa` | multipart, campo `arquivo` | `{ colunasFaltando: string[], linhas: LinhaDaPrevia[] }` |
| `POST /api/desbravadores/importacao` | `{ linhas: LinhaConfirmada[] }` (JSON) | `{ importados: number }` ou 422 com `{ erros: { linha, mensagens: { campo, mensagem }[] }[] }` |

`LinhaDaPrevia` = número da linha na planilha, os campos já convertidos (ids de unidade e classe
resolvidos), `erros: { campo, mensagem }[]`, `avisos: Aviso[]`, `duplicado: boolean`.
`LinhaConfirmada` = os campos da linha mais `importarMesmoRepetido: boolean`. Nos erros, `campo` é o
nome do campo da linha (`nome`, `nascimento`, `sexo`, `unidadeId`, `classeId`, `responsavelNome`,
`responsavelTelefone`, `responsavelEmail`, `entradaEm`) ou `null` quando o erro é da linha inteira
(pessoa repetida). Os contratos ficam em
`packages/shared`. A leitura da planilha é no servidor, com `exceljs` (a mesma biblioteca do
Finance); `.csv` é lido como texto, com `;` ou `,`.

## Fora desta entrega

- Rascunho salvo automaticamente da revisão (o Finance tem).
- Exportar a lista de desbravadores em planilha.
- Atualizar desbravador existente pela planilha (duplicado nunca sobrescreve).
- Importar líderes.
- Data vinda de fórmula (`=DATA(...)`): a leitura em fluxo entrega o resultado como número, e número
  solto é erro — o Adm troca a fórmula pelo valor ou digita a data.
- Limite de prévias simultâneas entre processos: o contador é por processo da API, em memória.

## Critério de pronto

- Testes de API: prévia com as três colunas faltando; conversão de datas (dois textos e célula de
  data), número solto como erro, planilha de 1904 e fuso; sexo;
  duplicado contra o banco (inclusive inativo) e entre linhas; unidade e classe não encontradas;
  classe sugerida pela idade; e-mail inválido; limite de linhas; confirmação que grava DBV, membro
  de unidade e matrículas regular e avançada; confirmação com uma linha errada que não grava nada;
  confirmar a mesma lista duas vezes (a segunda é 422 e não grava); repetida com a marca grava;
  duas confirmações simultâneas gravam uma vez; terceira prévia simultânea recusada;
  isolamento entre clubes (unidade e classe de outro clube respondem como inexistentes); permissão.
- Testes do front: os quatro estados, grade com contagem, linha com erro não marcável, duplicado
  desmarcado, edição de célula refazendo a validação daquela linha, confirmação e 422 por linha;
  erro do servidor que só some ao editar o campo dele; `aria-invalid` e descrição de cada célula;
  planilha acima de 3 MB e 413; mensagem de importados que não volta.
- Lint, tipos e as suítes passam; a tela cabe em 390 px sem rolagem lateral da página (a grade rola
  dentro de si).
