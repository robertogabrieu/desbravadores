-- Convite de acesso por link (SPEC convite-por-link). Modelo de clube: entra em MODELOS_DE_CLUBE junto.
-- CreateTable
CREATE TABLE "ConviteAcesso" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "papel" "Papel" NOT NULL,
    "unidadeIds" UUID[],
    "classeIds" UUID[],
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "usadoEm" TIMESTAMPTZ,
    "canceladoEm" TIMESTAMPTZ,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConviteAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConviteAcesso_tokenHash_key" ON "ConviteAcesso"("tokenHash");

-- CreateIndex
CREATE INDEX "ConviteAcesso_clubeId_dbvId_idx" ON "ConviteAcesso"("clubeId", "dbvId");

-- CreateIndex
CREATE UNIQUE INDEX "ConviteAcesso_clubeId_id_key" ON "ConviteAcesso"("clubeId", "id");

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

