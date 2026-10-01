# Classe que cursa × classe que instrui — SPEC

No clube, a mesma pessoa pode **cursar** uma classe (ex.: Agrupadas) e **instruir** outra (ex.: Amigo),
ou ser conselheira de uma unidade. Os dois conceitos já são registros separados (MatriculaClasse =
cursa; VinculoClasse/VinculoUnidade = instrui/aconselha), ligados pela ficha (`Desbravador.usuarioId`).
Faltam: mostrar os dois juntos e impedir autoaprovação.

## O que muda

1. **Ficha do desbravador (painel do Adm):** além de "Classe do ano" (o que cursa), uma linha
   "Instrui: Amigo, Companheiro" e/ou "Aconselha: Águias", vinda da conta ligada (vínculos ativos do
   clube). Sem conta ligada, a linha não aparece.
2. **Instrutor não marca os próprios requisitos:** quando o instrutor também cursa a classe que
   instrui, na aula e no progresso a ficha dele aparece com o rótulo "você" e **sem** marcação (e fica
   fora do quadro "O que falta fazer" e dos pontos provisórios). Na marcação avulsa do progresso, a API
   recusa (422 "Outro instrutor ou o Adm registra os seus requisitos.") marcar ou desmarcar requisito
   da ficha ligada à conta da sessão. **No envio da aula** não há recusa: o par (própria ficha,
   requisito) é ignorado e volta em `requisitosSemEfeito` com motivo `PROPRIA_FICHA`, e o resto da aula
   (presenças e marcações dos outros) grava normalmente — assim um envio antigo da fila, feito antes
   do rótulo "você", não trava a aula inteira. O cliente já não manda ações da ficha "você". O Adm
   continua podendo marcar de qualquer um.

## Regras

- A recusa vale para quem não é Adm: a ficha "da sessão" é a que tem `Desbravador.usuarioId` igual
  à conta logada. O Adm marca de qualquer um, inclusive a própria ficha.
- Nenhuma escrita nova de pontos fora de `ServicoPontos.sincronizar` (regra do repo).

## Fora desta entrega

- **Diretoria fora da chamada, da frequência e do ranking.** Vem com a unificação do Tipo
  (DBV / DIRETORIA / LIDER): como chamada, frequência, ranking, visão geral e pontos já filtram por
  tipo `DBV`, a exclusão sai de graça lá. Ver `docs/fases/tipo-diretoria/SPEC.md`, branch
  `feature/tipo-e-diretoria`.

## Critério de pronto

- API: instrutor recusado ao marcar e ao desmarcar a própria ficha fora da aula; dentro da aula o par
  fica sem efeito (`PROPRIA_FICHA`) e o resto grava; e
  permitido para outra; Adm pode; saída da ficha com instrui/aconselha (só vínculos ativos do clube).
- Web: linha "Instrui/Aconselha" na ficha; "você" sem marcação na aula/progresso.
- Lint, tipos e suítes passam.
