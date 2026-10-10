-- Link de substituicao (SPEC substituicao). Modelo de clube: entra em MODELOS_DE_CLUBE junto.
-- O CHECK "substituicao_alvo_coerente" e escrito a mao, como o de TarefaItem (20261002130000_tarefa_casa):
-- o Prisma nao modela CHECK (e nao o apaga). Link de CHAMADA tem unidade e nao tem classe; de CLASSE, o inverso.
-- O valor SUBSTITUTO nao e usado neste arquivo: o Postgres nao deixa usar valor de enum na transacao que o cria.
ALTER TYPE "StatusUsuario" ADD VALUE 'SUBSTITUTO';

CREATE TYPE "TipoSubstituicao" AS ENUM ('CHAMADA', 'CLASSE');

CREATE TABLE "Substituicao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "tipo" "TipoSubstituicao" NOT NULL,
    "unidadeId" UUID,
    "classeId" UUID,
    "data" DATE NOT NULL,
    "inicioEm" TIMESTAMPTZ NOT NULL,
    "fimEm" TIMESTAMPTZ NOT NULL,
    "fimEnvioEm" TIMESTAMPTZ NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "aparelhoHash" TEXT,
    "identificadaEm" TIMESTAMPTZ,
    "substitutoId" UUID,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoEm" TIMESTAMPTZ,
    "canceladoPorId" UUID,

    CONSTRAINT "Substituicao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "substituicao_alvo_coerente" CHECK (
        ("tipo" = 'CHAMADA' AND "unidadeId" IS NOT NULL AND "classeId" IS NULL)
        OR ("tipo" = 'CLASSE' AND "classeId" IS NOT NULL AND "unidadeId" IS NULL)
    )
);

CREATE UNIQUE INDEX "Substituicao_tokenHash_key" ON "Substituicao"("tokenHash");
CREATE UNIQUE INDEX "Substituicao_clubeId_id_key" ON "Substituicao"("clubeId", "id");
CREATE INDEX "Substituicao_clubeId_tipo_unidadeId_classeId_idx" ON "Substituicao"("clubeId", "tipo", "unidadeId", "classeId");

ALTER TABLE "Reuniao" ADD COLUMN "substituicaoId" UUID;
ALTER TABLE "RegistroAula" ADD COLUMN "substituicaoId" UUID;

ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_substitutoId_fkey" FOREIGN KEY ("substitutoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Substituicao" ADD CONSTRAINT "Substituicao_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_clubeId_substituicaoId_fkey" FOREIGN KEY ("clubeId", "substituicaoId") REFERENCES "Substituicao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroAula" ADD CONSTRAINT "RegistroAula_clubeId_substituicaoId_fkey" FOREIGN KEY ("clubeId", "substituicaoId") REFERENCES "Substituicao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
