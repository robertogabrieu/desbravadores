-- Marcacoes afirmativas e os tipos Ferias e Reuniao extra (SPEC calendario-ferias-extras). Escrita a mao:
-- o Prisma apagaria e recriaria as colunas, perdendo os valores. Nada aqui usa FERIAS nem REUNIAO_EXTRA:
-- o Postgres aceita ADD VALUE dentro da transacao desde que o valor nao seja usado nela.
-- So de ida. A volta minima esta registrada na PR #25.
ALTER TYPE "TipoEvento" ADD VALUE 'FERIAS';
ALTER TYPE "TipoEvento" ADD VALUE 'REUNIAO_EXTRA';

ALTER TABLE "EventoCalendario"
  ADD COLUMN "temReuniao" BOOLEAN,
  ADD COLUMN "temClasse" BOOLEAN;

UPDATE "EventoCalendario" SET "temReuniao" = NOT "cancelaReuniao", "temClasse" = NOT "bloqueiaAula";

ALTER TABLE "EventoCalendario"
  ALTER COLUMN "temReuniao" SET NOT NULL,
  ALTER COLUMN "temClasse" SET NOT NULL,
  DROP COLUMN "cancelaReuniao",
  DROP COLUMN "bloqueiaAula";
