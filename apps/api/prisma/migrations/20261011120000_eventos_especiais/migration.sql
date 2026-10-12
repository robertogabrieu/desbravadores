-- CreateEnum
CREATE TYPE "UniformeEvento" AS ENUM ('GALA', 'CAMPO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GatilhoCriterio" ADD VALUE 'EVENTO_ESPECIAL_PARTICIPACAO';
ALTER TYPE "GatilhoCriterio" ADD VALUE 'EVENTO_ESPECIAL_UNIFORME';

-- AlterEnum
ALTER TYPE "OrigemPontos" ADD VALUE 'EVENTO_ESPECIAL';

-- AlterEnum
ALTER TYPE "TipoEvento" ADD VALUE 'EVENTO_ESPECIAL';

-- AlterTable
ALTER TABLE "EventoCalendario" ADD COLUMN     "listaConcluidaEm" TIMESTAMPTZ,
ADD COLUMN     "pontosParticipacao" INTEGER,
ADD COLUMN     "pontosUniforme" INTEGER,
ADD COLUMN     "uniforme" "UniformeEvento";

-- CreateTable
CREATE TABLE "PresencaEventoEspecial" (
    "clubeId" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "foi" BOOLEAN NOT NULL,
    "comUniforme" BOOLEAN NOT NULL DEFAULT false,
    "alteradaPorId" UUID NOT NULL,
    "alteradaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresencaEventoEspecial_pkey" PRIMARY KEY ("eventoId","dbvId")
);

-- CreateIndex
CREATE INDEX "PresencaEventoEspecial_clubeId_dbvId_idx" ON "PresencaEventoEspecial"("clubeId", "dbvId");

-- AddForeignKey
ALTER TABLE "PresencaEventoEspecial" ADD CONSTRAINT "PresencaEventoEspecial_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaEventoEspecial" ADD CONSTRAINT "PresencaEventoEspecial_clubeId_eventoId_fkey" FOREIGN KEY ("clubeId", "eventoId") REFERENCES "EventoCalendario"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaEventoEspecial" ADD CONSTRAINT "PresencaEventoEspecial_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaEventoEspecial" ADD CONSTRAINT "PresencaEventoEspecial_alteradaPorId_fkey" FOREIGN KEY ("alteradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

