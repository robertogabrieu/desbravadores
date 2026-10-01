# Membro da Diretoria — SPEC

O clube precisa saber quem é da Diretoria. No clube, isso **não** é o tipo "Líder" do cadastro (Líder
e Diretoria são coisas diferentes) nem depende de cargo formal. É membro da Diretoria quem:

1. tem papel de **Conselheiro** ou **Instrutor** ativo no clube (a conta ligada à ficha); **ou**
2. completa **16 anos até 30 de junho** do ano civil corrente — vale o **ano inteiro**, desde janeiro.
   Quem faz 16 em março é Diretoria desde 1º de janeiro; quem faz 16 em agosto não é naquele ano (só
   no seguinte, desde janeiro). Quem já tem 17 ou mais em 30/06 também é.

O "hoje" é o do fuso do clube. A marca é **calculada** a cada leitura, nunca gravada: muda sozinha na
virada do ano e quando um papel é dado ou tirado.

## Suposição registrada (o dono do produto pode mudar)

Ser da Diretoria **não muda nada** no resto do app nesta entrega: a pessoa continua na unidade, na
chamada, na frequência, no ranking e nas classes; o tipo do cadastro (DBV/LIDER) não muda. Esta
entrega só **mostra** quem é da Diretoria. Efeitos sobre unidade/chamada/ranking, se vierem, são outra
entrega.

## O que muda para quem usa

- **Lista de desbravadores (Adm):** selo "Diretoria" na linha de quem é; filtro "Diretoria" (todos /
  só Diretoria / fora da Diretoria) ao lado dos filtros atuais.
- **Painel do desbravador:** linha "Membro da Diretoria" com o motivo: "pela idade (16 anos até
  junho)", "conselheiro" ou "instrutor" (todos os que valerem).

## API

A saída do desbravador (lista e detalhe) ganha `diretoria: { membro: boolean, motivos: ('IDADE' |
'CONSELHEIRO' | 'INSTRUTOR')[] }`. O filtro da lista ganha `diretoria=sim|nao`. A regra de idade é uma
função pura em `packages/shared` (data de nascimento + data de hoje → boolean), usada pela API; o papel
vem de `Desbravador.usuarioId` → vínculos ativos do clube com papel CONSELHEIRO/INSTRUTOR. O filtro na
lista precisa funcionar com paginação (calcule no banco: nascimento ≤ (ano corrente − 16)-06-30 **ou**
usuário ligado com vínculo ativo desses papéis).

## Critério de pronto

- Função pura: 16 em 30/06 conta; 16 em 01/07 não conta; 16 em março conta desde janeiro (consulta em
  janeiro); 17+ conta; virada de ano; fuso do clube.
- API: motivos por idade e por papel (inclusive os dois juntos); vínculo inativo não conta; papel ADM
  não conta; filtro com paginação; isolamento entre clubes.
- Web: selo na lista, filtro, motivo no painel; quatro estados preservados.
- Lint, tipos e suítes passam; a lista cabe em 390 px como hoje.
