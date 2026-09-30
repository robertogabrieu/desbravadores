-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('SEM_REUNIAO', 'ACAMPAMENTO', 'EVENTO', 'FERIADO');

-- CreateEnum
CREATE TYPE "StatusCronograma" AS ENUM ('RASCUNHO', 'ENVIADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "AlvoObservacao" AS ENUM ('AULA', 'DBV');

-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('PDF', 'APRESENTACAO', 'DOCUMENTO', 'LINK');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('CONFLITO_CRONOGRAMA', 'CRONOGRAMA_ENVIADO', 'CRONOGRAMA_PUBLICADO', 'PEDIDO_LIBERAR_CRONOGRAMA');

-- CreateTable
CREATE TABLE "EventoCalendario" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "horario" TEXT,
    "local" TEXT,
    "cancelaReuniao" BOOLEAN NOT NULL,
    "bloqueiaAula" BOOLEAN NOT NULL,
    "bomParaCampo" BOOLEAN NOT NULL,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,
    "removidoEm" TIMESTAMPTZ,

    CONSTRAINT "EventoCalendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cronograma" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "anoClube" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "status" "StatusCronograma" NOT NULL DEFAULT 'RASCUNHO',
    "enviadoEm" TIMESTAMPTZ,
    "enviadoPorId" UUID,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Cronograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronogramaPublicacao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "cronogramaId" UUID NOT NULL,
    "conteudo" JSONB NOT NULL,
    "publicadoPorId" UUID NOT NULL,
    "publicadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronogramaPublicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AulaPlanejada" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "cronogramaId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horario" TEXT,
    "local" TEXT,
    "titulo" TEXT,
    "removidaEm" TIMESTAMPTZ,

    CONSTRAINT "AulaPlanejada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AulaRequisito" (
    "clubeId" UUID NOT NULL,
    "cronogramaId" UUID NOT NULL,
    "aulaPlanejadaId" UUID NOT NULL,
    "requisitoId" UUID NOT NULL,

    CONSTRAINT "AulaRequisito_pkey" PRIMARY KEY ("aulaPlanejadaId","requisitoId")
);

-- CreateTable
CREATE TABLE "RegistroAula" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "aulaPlanejadaId" UUID,
    "data" DATE NOT NULL,
    "registradoPorId" UUID NOT NULL,
    "registradoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RegistroAula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresencaAula" (
    "clubeId" UUID NOT NULL,
    "registroAulaId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "presente" BOOLEAN NOT NULL,
    "versao" TIMESTAMPTZ(3) NOT NULL,
    "alteradaPorId" UUID NOT NULL,
    "envioId" UUID NOT NULL,

    CONSTRAINT "PresencaAula_pkey" PRIMARY KEY ("registroAulaId","dbvId")
);

-- CreateTable
CREATE TABLE "EnvioAulaProcessado" (
    "envioId" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "registroAulaId" UUID NOT NULL,
    "processadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioAulaProcessado_pkey" PRIMARY KEY ("envioId")
);

-- CreateTable
CREATE TABLE "RequisitoConcluido" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "requisitoId" UUID NOT NULL,
    "concluidoEm" DATE NOT NULL,
    "registroAulaId" UUID,
    "marcadoPorId" UUID NOT NULL,
    "marcadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMPTZ,
    "removidoPorId" UUID,

    CONSTRAINT "RequisitoConcluido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspecialidadeConcluida" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "especialidadeId" UUID NOT NULL,
    "concluidaEm" DATE NOT NULL,
    "marcadoPorId" UUID NOT NULL,
    "marcadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMPTZ,
    "removidoPorId" UUID,

    CONSTRAINT "EspecialidadeConcluida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observacao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "autorId" UUID NOT NULL,
    "alvo" "AlvoObservacao" NOT NULL,
    "registroAulaId" UUID,
    "dbvId" UUID,
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadaEm" TIMESTAMPTZ,
    "removidaEm" TIMESTAMPTZ,

    CONSTRAINT "Observacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "secaoId" UUID,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoMaterial" NOT NULL,
    "arquivoId" UUID,
    "url" TEXT,
    "enviadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMPTZ,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lidaEm" TIMESTAMPTZ,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atividade" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "autorId" UUID,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "link" TEXT,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoCalendario_clubeId_inicio_fim_idx" ON "EventoCalendario"("clubeId", "inicio", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "EventoCalendario_clubeId_id_key" ON "EventoCalendario"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Cronograma_clubeId_classeId_anoClube_key" ON "Cronograma"("clubeId", "classeId", "anoClube");

-- CreateIndex
CREATE UNIQUE INDEX "Cronograma_clubeId_id_key" ON "Cronograma"("clubeId", "id");

-- CreateIndex
CREATE INDEX "CronogramaPublicacao_clubeId_cronogramaId_publicadoEm_idx" ON "CronogramaPublicacao"("clubeId", "cronogramaId", "publicadoEm");

-- CreateIndex
CREATE INDEX "AulaPlanejada_clubeId_data_idx" ON "AulaPlanejada"("clubeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "AulaPlanejada_clubeId_id_key" ON "AulaPlanejada"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "aula_planejada_ativa_por_data" ON "AulaPlanejada"("cronogramaId", "data") WHERE ("removidaEm" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "AulaRequisito_cronogramaId_requisitoId_key" ON "AulaRequisito"("cronogramaId", "requisitoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAula_clubeId_classeId_data_key" ON "RegistroAula"("clubeId", "classeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAula_clubeId_id_key" ON "RegistroAula"("clubeId", "id");

-- CreateIndex
CREATE INDEX "PresencaAula_clubeId_dbvId_idx" ON "PresencaAula"("clubeId", "dbvId");

-- CreateIndex
CREATE INDEX "EnvioAulaProcessado_clubeId_registroAulaId_idx" ON "EnvioAulaProcessado"("clubeId", "registroAulaId");

-- CreateIndex
CREATE INDEX "RequisitoConcluido_clubeId_dbvId_idx" ON "RequisitoConcluido"("clubeId", "dbvId");

-- CreateIndex
CREATE INDEX "RequisitoConcluido_clubeId_registroAulaId_idx" ON "RequisitoConcluido"("clubeId", "registroAulaId");

-- CreateIndex
CREATE UNIQUE INDEX "requisito_concluido_ativo" ON "RequisitoConcluido"("dbvId", "requisitoId") WHERE ("removidoEm" IS NULL);

-- CreateIndex
CREATE INDEX "EspecialidadeConcluida_clubeId_dbvId_idx" ON "EspecialidadeConcluida"("clubeId", "dbvId");

-- CreateIndex
CREATE INDEX "EspecialidadeConcluida_clubeId_concluidaEm_idx" ON "EspecialidadeConcluida"("clubeId", "concluidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "especialidade_concluida_ativa" ON "EspecialidadeConcluida"("dbvId", "especialidadeId") WHERE ("removidoEm" IS NULL);

-- CreateIndex
CREATE INDEX "Observacao_clubeId_classeId_criadaEm_idx" ON "Observacao"("clubeId", "classeId", "criadaEm");

-- CreateIndex
CREATE INDEX "Observacao_clubeId_dbvId_idx" ON "Observacao"("clubeId", "dbvId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_arquivoId_key" ON "Material"("arquivoId");

-- CreateIndex
CREATE INDEX "Material_clubeId_classeId_removidoEm_idx" ON "Material"("clubeId", "classeId", "removidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Material_clubeId_arquivoId_key" ON "Material"("clubeId", "arquivoId");

-- CreateIndex
CREATE INDEX "Notificacao_clubeId_usuarioId_lidaEm_criadaEm_idx" ON "Notificacao"("clubeId", "usuarioId", "lidaEm", "criadaEm");

-- CreateIndex
CREATE INDEX "Atividade_clubeId_criadaEm_idx" ON "Atividade"("clubeId", "criadaEm");

-- AddForeignKey
ALTER TABLE "EventoCalendario" ADD CONSTRAINT "EventoCalendario_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoCalendario" ADD CONSTRAINT "EventoCalendario_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cronograma" ADD CONSTRAINT "Cronograma_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cronograma" ADD CONSTRAINT "Cronograma_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cronograma" ADD CONSTRAINT "Cronograma_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronogramaPublicacao" ADD CONSTRAINT "CronogramaPublicacao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronogramaPublicacao" ADD CONSTRAINT "CronogramaPublicacao_clubeId_cronogramaId_fkey" FOREIGN KEY ("clubeId", "cronogramaId") REFERENCES "Cronograma"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronogramaPublicacao" ADD CONSTRAINT "CronogramaPublicacao_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaPlanejada" ADD CONSTRAINT "AulaPlanejada_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaPlanejada" ADD CONSTRAINT "AulaPlanejada_clubeId_cronogramaId_fkey" FOREIGN KEY ("clubeId", "cronogramaId") REFERENCES "Cronograma"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaRequisito" ADD CONSTRAINT "AulaRequisito_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaRequisito" ADD CONSTRAINT "AulaRequisito_clubeId_cronogramaId_fkey" FOREIGN KEY ("clubeId", "cronogramaId") REFERENCES "Cronograma"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaRequisito" ADD CONSTRAINT "AulaRequisito_clubeId_aulaPlanejadaId_fkey" FOREIGN KEY ("clubeId", "aulaPlanejadaId") REFERENCES "AulaPlanejada"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaRequisito" ADD CONSTRAINT "AulaRequisito_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Requisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAula" ADD CONSTRAINT "RegistroAula_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAula" ADD CONSTRAINT "RegistroAula_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAula" ADD CONSTRAINT "RegistroAula_clubeId_aulaPlanejadaId_fkey" FOREIGN KEY ("clubeId", "aulaPlanejadaId") REFERENCES "AulaPlanejada"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAula" ADD CONSTRAINT "RegistroAula_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaAula" ADD CONSTRAINT "PresencaAula_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaAula" ADD CONSTRAINT "PresencaAula_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaAula" ADD CONSTRAINT "PresencaAula_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresencaAula" ADD CONSTRAINT "PresencaAula_alteradaPorId_fkey" FOREIGN KEY ("alteradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioAulaProcessado" ADD CONSTRAINT "EnvioAulaProcessado_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioAulaProcessado" ADD CONSTRAINT "EnvioAulaProcessado_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Requisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_marcadoPorId_fkey" FOREIGN KEY ("marcadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoConcluido" ADD CONSTRAINT "RequisitoConcluido_removidoPorId_fkey" FOREIGN KEY ("removidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_marcadoPorId_fkey" FOREIGN KEY ("marcadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_removidoPorId_fkey" FOREIGN KEY ("removidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacao" ADD CONSTRAINT "Observacao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacao" ADD CONSTRAINT "Observacao_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacao" ADD CONSTRAINT "Observacao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacao" ADD CONSTRAINT "Observacao_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacao" ADD CONSTRAINT "Observacao_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "SecaoRequisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_clubeId_arquivoId_fkey" FOREIGN KEY ("clubeId", "arquivoId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

