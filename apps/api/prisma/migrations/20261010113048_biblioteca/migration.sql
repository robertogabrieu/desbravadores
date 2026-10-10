-- CreateTable
CREATE TABLE "CategoriaBiblioteca" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidaEm" TIMESTAMPTZ,
    "removidaPorId" UUID,

    CONSTRAINT "CategoriaBiblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemBiblioteca" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "categoriaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "arquivoId" UUID NOT NULL,
    "capaId" UUID,
    "enviadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,
    "removidoEm" TIMESTAMPTZ,
    "removidoPorId" UUID,

    CONSTRAINT "ItemBiblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoriaBiblioteca_clubeId_ordem_idx" ON "CategoriaBiblioteca"("clubeId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaBiblioteca_clubeId_id_key" ON "CategoriaBiblioteca"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBiblioteca_arquivoId_key" ON "ItemBiblioteca"("arquivoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBiblioteca_capaId_key" ON "ItemBiblioteca"("capaId");

-- CreateIndex
CREATE INDEX "ItemBiblioteca_clubeId_categoriaId_ordem_idx" ON "ItemBiblioteca"("clubeId", "categoriaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBiblioteca_clubeId_arquivoId_key" ON "ItemBiblioteca"("clubeId", "arquivoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBiblioteca_clubeId_capaId_key" ON "ItemBiblioteca"("clubeId", "capaId");

-- AddForeignKey
ALTER TABLE "CategoriaBiblioteca" ADD CONSTRAINT "CategoriaBiblioteca_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaBiblioteca" ADD CONSTRAINT "CategoriaBiblioteca_removidaPorId_fkey" FOREIGN KEY ("removidaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_clubeId_categoriaId_fkey" FOREIGN KEY ("clubeId", "categoriaId") REFERENCES "CategoriaBiblioteca"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_clubeId_arquivoId_fkey" FOREIGN KEY ("clubeId", "arquivoId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_clubeId_capaId_fkey" FOREIGN KEY ("clubeId", "capaId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBiblioteca" ADD CONSTRAINT "ItemBiblioteca_removidoPorId_fkey" FOREIGN KEY ("removidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
