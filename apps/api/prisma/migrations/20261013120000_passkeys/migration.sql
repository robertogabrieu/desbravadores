-- Passkeys (SPEC passkeys). Usuario e global: nenhum dos dois modelos e de clube, entao nao entram em MODELOS_DE_CLUBE.
CREATE TYPE "FinalidadeDesafioPasskey" AS ENUM ('CADASTRO', 'LOGIN');

CREATE TABLE "CredencialPasskey" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "credentialId" TEXT NOT NULL,
    "chavePublica" BYTEA NOT NULL,
    "contador" INTEGER NOT NULL DEFAULT 0,
    "transportes" TEXT[],
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMPTZ,
    "revogadaEm" TIMESTAMPTZ,

    CONSTRAINT "CredencialPasskey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesafioPasskey" (
    "id" UUID NOT NULL,
    "desafio" TEXT NOT NULL,
    "finalidade" "FinalidadeDesafioPasskey" NOT NULL,
    "usuarioId" UUID,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "usadoEm" TIMESTAMPTZ,

    CONSTRAINT "DesafioPasskey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CredencialPasskey_credentialId_key" ON "CredencialPasskey"("credentialId");
CREATE INDEX "CredencialPasskey_usuarioId_idx" ON "CredencialPasskey"("usuarioId");
CREATE INDEX "DesafioPasskey_expiraEm_idx" ON "DesafioPasskey"("expiraEm");

ALTER TABLE "CredencialPasskey" ADD CONSTRAINT "CredencialPasskey_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesafioPasskey" ADD CONSTRAINT "DesafioPasskey_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
