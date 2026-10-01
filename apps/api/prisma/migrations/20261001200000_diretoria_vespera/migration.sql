-- Vespera da entrada na Diretoria, gravada no momento da troca de Tipo (SPEC tipo-diretoria, Ranking e
-- frequencia): se a ficha era DBV e em que unidade estava aberta. O ranking dos meses anteriores a entrada
-- le daqui, e nao das passagens de unidade. Unidade e desativada, nunca apagada: a chave e RESTRICT.
ALTER TABLE "Desbravador"
  ADD COLUMN "diretoriaVeioDeDbv" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "diretoriaUnidadeAnteriorId" UUID;

ALTER TABLE "Desbravador"
  ADD CONSTRAINT "Desbravador_clubeId_diretoriaUnidadeAnteriorId_fkey"
  FOREIGN KEY ("clubeId", "diretoriaUnidadeAnteriorId") REFERENCES "Unidade"("clubeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
