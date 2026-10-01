-- Diretoria passa a ser um valor do Tipo (SPEC tipo-diretoria). Esta migration so cria o valor e as
-- colunas e nao usa DIRETORIA: o Postgres aceita ADD VALUE dentro da transacao desde que o valor nao
-- seja usado nela. Quem passa as fichas para Diretoria e a sincronizacao da API, ao subir.
ALTER TYPE "TipoPessoa" ADD VALUE 'DIRETORIA';

ALTER TABLE "Desbravador"
  ADD COLUMN "diretoriaPeloAdm" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "diretoriaDesde" DATE;
