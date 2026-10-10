-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GatilhoCriterio" ADD VALUE 'CLASSE_BIBLICA_PRESENCA';
ALTER TYPE "GatilhoCriterio" ADD VALUE 'CLASSE_BIBLICA_PARTICIPACAO';

-- AlterEnum
ALTER TYPE "OrigemPontos" ADD VALUE 'CLASSE_BIBLICA';

-- AlterEnum
ALTER TYPE "TipoEvento" ADD VALUE 'CLASSE_BIBLICA';

-- AlterTable
ALTER TABLE "Requisito" ADD COLUMN     "classeBiblica" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EdicaoClasseBiblica" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT,
    "inicio" DATE,
    "fim" DATE,
    "diaSemana" INTEGER NOT NULL,
    "horario" TEXT,
    "local" TEXT,
    "etapa" INTEGER NOT NULL DEFAULT 1,
    "terminadaEm" TIMESTAMPTZ,
    "criadaPorId" UUID NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EdicaoClasseBiblica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoClasseBiblica" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "edicaoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "materialTitulo" TEXT,
    "materialArquivoId" UUID,
    "materialUrl" TEXT,
    "removidoEm" TIMESTAMPTZ,

    CONSTRAINT "GrupoClasseBiblica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoUnidadeClasseBiblica" (
    "clubeId" UUID NOT NULL,
    "edicaoId" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,

    CONSTRAINT "GrupoUnidadeClasseBiblica_pkey" PRIMARY KEY ("grupoId","unidadeId")
);

-- CreateTable
CREATE TABLE "EncontroClasseBiblica" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "edicaoId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horario" TEXT NOT NULL,
    "local" TEXT,
    "dataOriginal" DATE,
    "eventoId" UUID NOT NULL,
    "canceladoEm" TIMESTAMPTZ,
    "motivoCancelamento" TEXT,
    "canceladoPorId" UUID,

    CONSTRAINT "EncontroClasseBiblica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadaClasseBiblica" (
    "clubeId" UUID NOT NULL,
    "encontroId" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "registradaPorId" UUID NOT NULL,
    "registradaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadaClasseBiblica_pkey" PRIMARY KEY ("encontroId","grupoId")
);

-- CreateTable
CREATE TABLE "PresencaClasseBiblica" (
    "clubeId" UUID NOT NULL,
    "encontroId" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "presente" BOOLEAN NOT NULL,
    "participou" BOOLEAN NOT NULL,
    "versao" TIMESTAMPTZ(3) NOT NULL,
    "alteradaPorId" UUID NOT NULL,
    "envioId" UUID NOT NULL,

    CONSTRAINT "PresencaClasseBiblica_pkey" PRIMARY KEY ("encontroId","dbvId")
);

-- CreateTable
CREATE TABLE "EnvioClasseBiblicaProcessado" (
    "envioId" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "encontroId" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "processadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioClasseBiblicaProcessado_pkey" PRIMARY KEY ("envioId")
);

-- CreateIndex
CREATE INDEX "EdicaoClasseBiblica_clubeId_terminadaEm_idx" ON "EdicaoClasseBiblica"("clubeId", "terminadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "EdicaoClasseBiblica_clubeId_id_key" ON "EdicaoClasseBiblica"("clubeId", "id");

-- CreateIndex
CREATE INDEX "GrupoClasseBiblica_clubeId_edicaoId_idx" ON "GrupoClasseBiblica"("clubeId", "edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoClasseBiblica_clubeId_id_key" ON "GrupoClasseBiblica"("clubeId", "id");

-- CreateIndex
CREATE INDEX "GrupoUnidadeClasseBiblica_clubeId_unidadeId_idx" ON "GrupoUnidadeClasseBiblica"("clubeId", "unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoUnidadeClasseBiblica_edicaoId_unidadeId_key" ON "GrupoUnidadeClasseBiblica"("edicaoId", "unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "EncontroClasseBiblica_eventoId_key" ON "EncontroClasseBiblica"("eventoId");

-- CreateIndex
CREATE INDEX "EncontroClasseBiblica_clubeId_data_idx" ON "EncontroClasseBiblica"("clubeId", "data");

-- CreateIndex
CREATE INDEX "EncontroClasseBiblica_clubeId_edicaoId_idx" ON "EncontroClasseBiblica"("clubeId", "edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "EncontroClasseBiblica_clubeId_id_key" ON "EncontroClasseBiblica"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EncontroClasseBiblica_clubeId_eventoId_key" ON "EncontroClasseBiblica"("clubeId", "eventoId");

-- CreateIndex
CREATE INDEX "ChamadaClasseBiblica_clubeId_grupoId_idx" ON "ChamadaClasseBiblica"("clubeId", "grupoId");

-- CreateIndex
CREATE INDEX "PresencaClasseBiblica_clubeId_dbvId_idx" ON "PresencaClasseBiblica"("clubeId", "dbvId");

-- CreateIndex
CREATE INDEX "PresencaClasseBiblica_clubeId_grupoId_idx" ON "PresencaClasseBiblica"("clubeId", "grupoId");

-- CreateIndex
CREATE INDEX "EnvioClasseBiblicaProcessado_clubeId_encontroId_grupoId_idx" ON "EnvioClasseBiblicaProcessado"("clubeId", "encontroId", "grupoId");

-- AddForeignKey
ALTER TABLE "EdicaoClasseBiblica" ADD CONSTRAINT "EdicaoClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdicaoClasseBiblica" ADD CONSTRAINT "EdicaoClasseBiblica_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoClasseBiblica" ADD CONSTRAINT "GrupoClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoClasseBiblica" ADD CONSTRAINT "GrupoClasseBiblica_clubeId_edicaoId_fkey" FOREIGN KEY ("clubeId", "edicaoId") REFERENCES "EdicaoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoClasseBiblica" ADD CONSTRAINT "GrupoClasseBiblica_clubeId_materialArquivoId_fkey" FOREIGN KEY ("clubeId", "materialArquivoId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoUnidadeClasseBiblica" ADD CONSTRAINT "GrupoUnidadeClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoUnidadeClasseBiblica" ADD CONSTRAINT "GrupoUnidadeClasseBiblica_clubeId_edicaoId_fkey" FOREIGN KEY ("clubeId", "edicaoId") REFERENCES "EdicaoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoUnidadeClasseBiblica" ADD CONSTRAINT "GrupoUnidadeClasseBiblica_clubeId_grupoId_fkey" FOREIGN KEY ("clubeId", "grupoId") REFERENCES "GrupoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoUnidadeClasseBiblica" ADD CONSTRAINT "GrupoUnidadeClasseBiblica_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncontroClasseBiblica" ADD CONSTRAINT "EncontroClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncontroClasseBiblica" ADD CONSTRAINT "EncontroClasseBiblica_clubeId_edicaoId_fkey" FOREIGN KEY ("clubeId", "edicaoId") REFERENCES "EdicaoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncontroClasseBiblica" ADD CONSTRAINT "EncontroClasseBiblica_clubeId_eventoId_fkey" FOREIGN KEY ("clubeId", "eventoId") REFERENCES "EventoCalendario"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncontroClasseBiblica" ADD CONSTRAINT "EncontroClasseBiblica_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaClasseBiblica" ADD CONSTRAINT "ChamadaClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaClasseBiblica" ADD CONSTRAINT "ChamadaClasseBiblica_clubeId_encontroId_fkey" FOREIGN KEY ("clubeId", "encontroId") REFERENCES "EncontroClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaClasseBiblica" ADD CONSTRAINT "ChamadaClasseBiblica_clubeId_grupoId_fkey" FOREIGN KEY ("clubeId", "grupoId") REFERENCES "GrupoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaClasseBiblica" ADD CONSTRAINT "ChamadaClasseBiblica_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_clubeId_encontroId_fkey" FOREIGN KEY ("clubeId", "encontroId") REFERENCES "EncontroClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_clubeId_grupoId_fkey" FOREIGN KEY ("clubeId", "grupoId") REFERENCES "GrupoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaClasseBiblica" ADD CONSTRAINT "PresencaClasseBiblica_alteradaPorId_fkey" FOREIGN KEY ("alteradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioClasseBiblicaProcessado" ADD CONSTRAINT "EnvioClasseBiblicaProcessado_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioClasseBiblicaProcessado" ADD CONSTRAINT "EnvioClasseBiblicaProcessado_clubeId_encontroId_fkey" FOREIGN KEY ("clubeId", "encontroId") REFERENCES "EncontroClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioClasseBiblicaProcessado" ADD CONSTRAINT "EnvioClasseBiblicaProcessado_clubeId_grupoId_fkey" FOREIGN KEY ("clubeId", "grupoId") REFERENCES "GrupoClasseBiblica"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Marca os requisitos "participar ativamente da classe bíblica" pela chave da carga (trilha, classe,
-- seção, requisito). Em banco ainda sem carga não acha nada: quem liga a marca é a carga.
UPDATE "Requisito" r
SET "classeBiblica" = true
FROM "SecaoRequisito" s, "Classe" c
WHERE r."secaoId" = s."id"
  AND s."classeId" = c."id"
  AND c."clubeId" IS NULL
  AND (c."trilha"::text, c."nome", s."codigo", r."codigo") IN (
    ('INDIVIDUAL', 'Amigo', 'G', 'G6'),
    ('INDIVIDUAL', 'Companheiro', 'G', 'G6'),
    ('INDIVIDUAL', 'Pesquisador', 'G', 'G6'),
    ('AGRUPADAS', 'Agrupadas (Amigo a Guia)', 'G', 'G15')
  );
