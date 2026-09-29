-- CreateEnum
CREATE TYPE "SituacaoChamada" AS ENUM ('PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA');

-- CreateEnum
CREATE TYPE "OrigemAlteracao" AS ENUM ('EDICAO', 'CONFLITO_SYNC');

-- CreateEnum
CREATE TYPE "OrigemPontos" AS ENUM ('CHAMADA', 'REQUISITO', 'ESPECIALIDADE', 'MANUAL');

-- CreateEnum
CREATE TYPE "TipoPedidoAdm" AS ENUM ('UNIDADE_SEM_DBV');

-- CreateTable
CREATE TABLE "Reuniao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horario" TEXT NOT NULL,
    "local" TEXT,
    "observacoes" TEXT,
    "registradaPorId" UUID NOT NULL,
    "registradaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaPorId" UUID NOT NULL,
    "atualizadaEm" TIMESTAMPTZ NOT NULL,
    "cabecalhoVersao" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamada" (
    "clubeId" UUID NOT NULL,
    "reuniaoId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "situacao" "SituacaoChamada" NOT NULL,
    "uniforme" BOOLEAN NOT NULL DEFAULT false,
    "biblia" BOOLEAN NOT NULL DEFAULT false,
    "licao" BOOLEAN NOT NULL DEFAULT false,
    "versao" TIMESTAMPTZ(3) NOT NULL,
    "alteradaPorId" UUID NOT NULL,
    "envioId" UUID NOT NULL,

    CONSTRAINT "Chamada_pkey" PRIMARY KEY ("reuniaoId","dbvId")
);

-- CreateTable
CREATE TABLE "ChamadaAlteracao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "reuniaoId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "antes" JSONB,
    "depois" JSONB NOT NULL,
    "origem" "OrigemAlteracao" NOT NULL,
    "alteradaPorId" UUID NOT NULL,
    "alteradaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadaAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoPontos" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "criterioId" UUID,
    "pontos" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "origemTipo" "OrigemPontos" NOT NULL,
    "origemId" TEXT NOT NULL,
    "lancadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estornadoEm" TIMESTAMPTZ,

    CONSTRAINT "LancamentoPontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arquivo" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "caminho" TEXT NOT NULL,
    "miniaturaCaminho" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "largura" INTEGER,
    "altura" INTEGER,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Album" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "reuniaoId" UUID,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "albumId" UUID NOT NULL,
    "arquivoId" UUID NOT NULL,
    "legenda" TEXT,
    "enviadaPorId" UUID NOT NULL,
    "enviadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidaEm" TIMESTAMPTZ,
    "removidaPorId" UUID,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoAoAdm" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "tipo" "TipoPedidoAdm" NOT NULL,
    "unidadeId" UUID,
    "pedidoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoAoAdm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioProcessado" (
    "envioId" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "reuniaoId" UUID NOT NULL,
    "processadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioProcessado_pkey" PRIMARY KEY ("envioId")
);

-- CreateIndex
CREATE INDEX "Reuniao_clubeId_data_idx" ON "Reuniao"("clubeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Reuniao_unidadeId_data_key" ON "Reuniao"("unidadeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Reuniao_clubeId_id_key" ON "Reuniao"("clubeId", "id");

-- CreateIndex
CREATE INDEX "Chamada_clubeId_dbvId_idx" ON "Chamada"("clubeId", "dbvId");

-- CreateIndex
CREATE INDEX "ChamadaAlteracao_clubeId_reuniaoId_idx" ON "ChamadaAlteracao"("clubeId", "reuniaoId");

-- CreateIndex
CREATE INDEX "LancamentoPontos_clubeId_data_idx" ON "LancamentoPontos"("clubeId", "data");

-- CreateIndex
CREATE INDEX "LancamentoPontos_clubeId_dbvId_data_idx" ON "LancamentoPontos"("clubeId", "dbvId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "lancamento_ativo_por_criterio" ON "LancamentoPontos"("origemTipo", "origemId", "criterioId") WHERE ("estornadoEm" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "lancamento_ativo_sem_criterio" ON "LancamentoPontos"("origemTipo", "origemId") WHERE ("criterioId" IS NULL AND "estornadoEm" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Arquivo_clubeId_id_key" ON "Arquivo"("clubeId", "id");

-- CreateIndex
CREATE INDEX "Album_clubeId_unidadeId_data_idx" ON "Album"("clubeId", "unidadeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Album_clubeId_id_key" ON "Album"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Album_clubeId_reuniaoId_key" ON "Album"("clubeId", "reuniaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Foto_arquivoId_key" ON "Foto"("arquivoId");

-- CreateIndex
CREATE INDEX "Foto_clubeId_albumId_removidaEm_idx" ON "Foto"("clubeId", "albumId", "removidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "Foto_clubeId_arquivoId_key" ON "Foto"("clubeId", "arquivoId");

-- CreateIndex
CREATE INDEX "PedidoAoAdm_clubeId_tipo_unidadeId_criadoEm_idx" ON "PedidoAoAdm"("clubeId", "tipo", "unidadeId", "criadoEm");

-- CreateIndex
CREATE INDEX "EnvioProcessado_clubeId_reuniaoId_idx" ON "EnvioProcessado"("clubeId", "reuniaoId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterioRanking_clubeId_id_key" ON "CriterioRanking"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "criterio_padrao_por_gatilho" ON "CriterioRanking"("clubeId", "gatilho") WHERE ("padrao" = true);

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_atualizadaPorId_fkey" FOREIGN KEY ("atualizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_clubeId_reuniaoId_fkey" FOREIGN KEY ("clubeId", "reuniaoId") REFERENCES "Reuniao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_alteradaPorId_fkey" FOREIGN KEY ("alteradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaAlteracao" ADD CONSTRAINT "ChamadaAlteracao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaAlteracao" ADD CONSTRAINT "ChamadaAlteracao_clubeId_reuniaoId_fkey" FOREIGN KEY ("clubeId", "reuniaoId") REFERENCES "Reuniao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaAlteracao" ADD CONSTRAINT "ChamadaAlteracao_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadaAlteracao" ADD CONSTRAINT "ChamadaAlteracao_alteradaPorId_fkey" FOREIGN KEY ("alteradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoPontos" ADD CONSTRAINT "LancamentoPontos_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoPontos" ADD CONSTRAINT "LancamentoPontos_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoPontos" ADD CONSTRAINT "LancamentoPontos_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioRanking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoPontos" ADD CONSTRAINT "LancamentoPontos_lancadoPorId_fkey" FOREIGN KEY ("lancadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_clubeId_reuniaoId_fkey" FOREIGN KEY ("clubeId", "reuniaoId") REFERENCES "Reuniao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_clubeId_albumId_fkey" FOREIGN KEY ("clubeId", "albumId") REFERENCES "Album"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_clubeId_arquivoId_fkey" FOREIGN KEY ("clubeId", "arquivoId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_enviadaPorId_fkey" FOREIGN KEY ("enviadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_removidaPorId_fkey" FOREIGN KEY ("removidaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoAoAdm" ADD CONSTRAINT "PedidoAoAdm_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoAoAdm" ADD CONSTRAINT "PedidoAoAdm_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoAoAdm" ADD CONSTRAINT "PedidoAoAdm_pedidoPorId_fkey" FOREIGN KEY ("pedidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioProcessado" ADD CONSTRAINT "EnvioProcessado_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioProcessado" ADD CONSTRAINT "EnvioProcessado_clubeId_reuniaoId_fkey" FOREIGN KEY ("clubeId", "reuniaoId") REFERENCES "Reuniao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

