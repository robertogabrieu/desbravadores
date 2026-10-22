-- Biblioteca: livros físicos, exemplares e empréstimos (docs/fases/biblioteca-fisica/SPEC.md).
-- Modelos de clube: entram em MODELOS_DE_CLUBE junto.
-- O CHECK "item_biblioteca_tipo_coerente" e os dois únicos parciais são escritos à mão, como o de
-- Substituicao (20261009120000_substituicao) e os de AulaPlanejada (20260930120000_fase2_3_instrutor_adm):
-- o Prisma não modela CHECK nem índice parcial (e não os apaga).
CREATE TYPE "TipoItemBiblioteca" AS ENUM ('DIGITAL', 'FISICO');

ALTER TABLE "ItemBiblioteca" ADD COLUMN "tipo" "TipoItemBiblioteca" NOT NULL DEFAULT 'DIGITAL';
ALTER TABLE "ItemBiblioteca" ALTER COLUMN "arquivoId" DROP NOT NULL;
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "item_biblioteca_tipo_coerente" CHECK (
    ("tipo" = 'FISICO' AND "arquivoId" IS NULL)
    OR ("tipo" = 'DIGITAL' AND "arquivoId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ItemBiblioteca_clubeId_id_key" ON "ItemBiblioteca"("clubeId", "id");

CREATE TABLE "ExemplarBiblioteca" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baixadoEm" TIMESTAMPTZ,
    "baixadoPorId" UUID,

    CONSTRAINT "ExemplarBiblioteca_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmprestimoBiblioteca" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "exemplarId" UUID NOT NULL,
    "desbravadorId" UUID NOT NULL,
    "emprestadoEm" DATE NOT NULL,
    "devolverAte" DATE NOT NULL,
    "devolvidoEm" DATE,
    "emprestadoPorId" UUID NOT NULL,
    "devolvidoPorId" UUID,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmprestimoBiblioteca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExemplarBiblioteca_clubeId_id_key" ON "ExemplarBiblioteca"("clubeId", "id");
CREATE UNIQUE INDEX "ExemplarBiblioteca_itemId_numero_key" ON "ExemplarBiblioteca"("itemId", "numero");
CREATE UNIQUE INDEX "EmprestimoBiblioteca_clubeId_id_key" ON "EmprestimoBiblioteca"("clubeId", "id");
CREATE INDEX "EmprestimoBiblioteca_clubeId_devolvidoEm_idx" ON "EmprestimoBiblioteca"("clubeId", "devolvidoEm");
CREATE INDEX "EmprestimoBiblioteca_exemplarId_idx" ON "EmprestimoBiblioteca"("exemplarId");
CREATE INDEX "EmprestimoBiblioteca_desbravadorId_idx" ON "EmprestimoBiblioteca"("desbravadorId");

-- Um empréstimo aberto por exemplar e um por desbravador: a garantia final de D11 e D13.
CREATE UNIQUE INDEX "emprestimo_aberto_por_exemplar" ON "EmprestimoBiblioteca"("exemplarId") WHERE ("devolvidoEm" IS NULL);
CREATE UNIQUE INDEX "emprestimo_aberto_por_desbravador" ON "EmprestimoBiblioteca"("desbravadorId") WHERE ("devolvidoEm" IS NULL);

ALTER TABLE "ExemplarBiblioteca" ADD CONSTRAINT "ExemplarBiblioteca_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExemplarBiblioteca" ADD CONSTRAINT "ExemplarBiblioteca_clubeId_itemId_fkey" FOREIGN KEY ("clubeId", "itemId") REFERENCES "ItemBiblioteca"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExemplarBiblioteca" ADD CONSTRAINT "ExemplarBiblioteca_baixadoPorId_fkey" FOREIGN KEY ("baixadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmprestimoBiblioteca" ADD CONSTRAINT "EmprestimoBiblioteca_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmprestimoBiblioteca" ADD CONSTRAINT "EmprestimoBiblioteca_clubeId_exemplarId_fkey" FOREIGN KEY ("clubeId", "exemplarId") REFERENCES "ExemplarBiblioteca"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmprestimoBiblioteca" ADD CONSTRAINT "EmprestimoBiblioteca_clubeId_desbravadorId_fkey" FOREIGN KEY ("clubeId", "desbravadorId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmprestimoBiblioteca" ADD CONSTRAINT "EmprestimoBiblioteca_emprestadoPorId_fkey" FOREIGN KEY ("emprestadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmprestimoBiblioteca" ADD CONSTRAINT "EmprestimoBiblioteca_devolvidoPorId_fkey" FOREIGN KEY ("devolvidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
