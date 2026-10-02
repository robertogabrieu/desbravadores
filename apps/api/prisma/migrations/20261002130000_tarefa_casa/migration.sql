-- Tarefa para casa (SPEC tarefa-de-casa). Modelos de clube: entram em MODELOS_DE_CLUBE junto.
-- O CHECK "exatamente um de requisitoId e especialidadeId" e escrito a mao: o Prisma nao modela CHECK
-- (e nao o apaga). Nao ha precedente de CHECK no repositorio: o teste de integracao confere que o banco
-- recusa os dois e nenhum. Unicos parciais em (tarefa, item) so entre itens nao retirados.
CREATE TABLE "TarefaCasa" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "registroAulaId" UUID NOT NULL,
    "anoClube" INTEGER NOT NULL,
    "criadaPorId" UUID NOT NULL,
    "criadaEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMPTZ,
    "encerradaPorId" UUID,

    CONSTRAINT "TarefaCasa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TarefaItem" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "tarefaId" UUID NOT NULL,
    "requisitoId" UUID,
    "especialidadeId" UUID,
    "criadoPorId" UUID NOT NULL,
    "removidoEm" TIMESTAMPTZ,
    "removidoPorId" UUID,

    CONSTRAINT "TarefaItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tarefa_item_exatamente_um" CHECK (("requisitoId" IS NULL) <> ("especialidadeId" IS NULL))
);

ALTER TABLE "EspecialidadeConcluida" ADD COLUMN "registroAulaId" UUID;

CREATE UNIQUE INDEX "TarefaCasa_clubeId_registroAulaId_key" ON "TarefaCasa"("clubeId", "registroAulaId");
CREATE UNIQUE INDEX "TarefaCasa_clubeId_id_key" ON "TarefaCasa"("clubeId", "id");
CREATE INDEX "TarefaCasa_clubeId_classeId_anoClube_idx" ON "TarefaCasa"("clubeId", "classeId", "anoClube");
CREATE INDEX "TarefaItem_clubeId_tarefaId_idx" ON "TarefaItem"("clubeId", "tarefaId");
CREATE UNIQUE INDEX "tarefa_item_requisito_ativo" ON "TarefaItem"("tarefaId", "requisitoId") WHERE ("removidoEm" IS NULL);
CREATE UNIQUE INDEX "tarefa_item_especialidade_ativo" ON "TarefaItem"("tarefaId", "especialidadeId") WHERE ("removidoEm" IS NULL);
CREATE INDEX "EspecialidadeConcluida_clubeId_registroAulaId_idx" ON "EspecialidadeConcluida"("clubeId", "registroAulaId");

ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaCasa" ADD CONSTRAINT "TarefaCasa_encerradaPorId_fkey" FOREIGN KEY ("encerradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_clubeId_tarefaId_fkey" FOREIGN KEY ("clubeId", "tarefaId") REFERENCES "TarefaCasa"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Requisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TarefaItem" ADD CONSTRAINT "TarefaItem_removidoPorId_fkey" FOREIGN KEY ("removidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EspecialidadeConcluida" ADD CONSTRAINT "EspecialidadeConcluida_clubeId_registroAulaId_fkey" FOREIGN KEY ("clubeId", "registroAulaId") REFERENCES "RegistroAula"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
