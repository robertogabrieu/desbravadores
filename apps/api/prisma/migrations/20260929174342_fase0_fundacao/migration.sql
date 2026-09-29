-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADM', 'CONSELHEIRO', 'INSTRUTOR');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('CONVIDADO', 'ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('F', 'M');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('DBV', 'LIDER');

-- CreateEnum
CREATE TYPE "TipoUnidade" AS ENUM ('MISTA', 'MASCULINA', 'FEMININA');

-- CreateEnum
CREATE TYPE "TipoClasse" AS ENUM ('REGULAR', 'AVANCADA');

-- CreateEnum
CREATE TYPE "Trilha" AS ENUM ('INDIVIDUAL', 'AGRUPADAS');

-- CreateEnum
CREATE TYPE "Origem" AS ENUM ('OFICIAL', 'CLUBE');

-- CreateEnum
CREATE TYPE "QuemMonta" AS ENUM ('ADM', 'INSTRUTOR');

-- CreateEnum
CREATE TYPE "StatusMatricula" AS ENUM ('CURSANDO', 'CONCLUIDA', 'INVESTIDA', 'DESISTIU');

-- CreateEnum
CREATE TYPE "PeriodoRanking" AS ENUM ('MES', 'TRIMESTRE', 'ANO');

-- CreateEnum
CREATE TYPE "GatilhoCriterio" AS ENUM ('PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO', 'REQUISITO', 'ESPECIALIDADE', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinalidadeToken" AS ENUM ('CONVITE', 'SENHA');

-- CreateTable
CREATE TABLE "Clube" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cidade" TEXT,
    "igreja" TEXT,
    "associacao" TEXT,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Clube_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoClube" (
    "clubeId" UUID NOT NULL,
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "diaReuniao" INTEGER NOT NULL DEFAULT 0,
    "horaReuniao" TEXT NOT NULL DEFAULT '09:00',
    "localReuniaoPadrao" TEXT,
    "inicioAnoClube" TEXT NOT NULL DEFAULT '02-01',
    "limiarFrequenciaAlerta" INTEGER NOT NULL DEFAULT 70,
    "limiarProgressoAlerta" INTEGER NOT NULL DEFAULT 40,
    "metaFrequencia" INTEGER NOT NULL DEFAULT 80,
    "rankingPeriodo" "PeriodoRanking" NOT NULL DEFAULT 'MES',
    "rankingNoLogin" BOOLEAN NOT NULL DEFAULT true,
    "rankingPorUnidade" BOOLEAN NOT NULL DEFAULT true,
    "descontarFalta" BOOLEAN NOT NULL DEFAULT false,
    "pontosDescontoFalta" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConfiguracaoClube_pkey" PRIMARY KEY ("clubeId")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT,
    "genero" "Sexo",
    "status" "StatusUsuario" NOT NULL DEFAULT 'CONVIDADO',
    "ultimoAcessoEm" TIMESTAMPTZ,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vinculo" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoUnidade" (
    "clubeId" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,

    CONSTRAINT "VinculoUnidade_pkey" PRIMARY KEY ("vinculoId","unidadeId")
);

-- CreateTable
CREATE TABLE "VinculoClasse" (
    "vinculoId" UUID NOT NULL,
    "classeId" UUID NOT NULL,

    CONSTRAINT "VinculoClasse_pkey" PRIMARY KEY ("vinculoId","classeId")
);

-- CreateTable
CREATE TABLE "PermissaoAjuste" (
    "vinculoId" UUID NOT NULL,
    "permissao" TEXT NOT NULL,
    "concedida" BOOLEAN NOT NULL,

    CONSTRAINT "PermissaoAjuste_pkey" PRIMARY KEY ("vinculoId","permissao")
);

-- CreateTable
CREATE TABLE "TokenUsoUnico" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "finalidade" "FinalidadeToken" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "usadoEm" TIMESTAMPTZ,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsoUnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "vinculoId" UUID,
    "familia" UUID NOT NULL,
    "familiaExpiraEm" TIMESTAMPTZ NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "usadoEm" TIMESTAMPTZ,
    "revogadoEm" TIMESTAMPTZ,
    "aparelho" TEXT,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Desbravador" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nomePublico" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'DBV',
    "usuarioId" UUID,
    "nascimento" DATE NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "responsavelNome" TEXT,
    "responsavelTelefone" TEXT,
    "responsavelEmail" TEXT,
    "autorizacaoImagem" BOOLEAN NOT NULL DEFAULT false,
    "autorizacaoImagemEm" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "entradaEm" DATE NOT NULL,
    "saidaEm" DATE,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Desbravador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidade" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoUnidade" NOT NULL DEFAULT 'MISTA',
    "gritoDeGuerra" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroUnidade" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,

    CONSTRAINT "MembroUnidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classe" (
    "id" UUID NOT NULL,
    "clubeId" UUID,
    "origem" "Origem" NOT NULL,
    "nome" TEXT NOT NULL,
    "idade" INTEGER,
    "tipo" "TipoClasse" NOT NULL,
    "trilha" "Trilha" NOT NULL,
    "classeBaseId" UUID,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "Classe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClasseClube" (
    "clubeId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "quemMontaCronograma" "QuemMonta" NOT NULL DEFAULT 'ADM',

    CONSTRAINT "ClasseClube_pkey" PRIMARY KEY ("clubeId","classeId")
);

-- CreateTable
CREATE TABLE "SecaoRequisito" (
    "id" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "SecaoRequisito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisito" (
    "id" UUID NOT NULL,
    "secaoId" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "campo" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "pagina" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Requisito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitoAjuste" (
    "clubeId" UUID NOT NULL,
    "requisitoId" UUID NOT NULL,
    "ativo" BOOLEAN,
    "campo" BOOLEAN,

    CONSTRAINT "RequisitoAjuste_pkey" PRIMARY KEY ("clubeId","requisitoId")
);

-- CreateTable
CREATE TABLE "AreaEspecialidade" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "AreaEspecialidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Especialidade" (
    "id" UUID NOT NULL,
    "clubeId" UUID,
    "origem" "Origem" NOT NULL,
    "areaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Especialidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mestrado" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Mestrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatriculaClasse" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "dbvId" UUID NOT NULL,
    "classeId" UUID NOT NULL,
    "anoClube" INTEGER NOT NULL,
    "status" "StatusMatricula" NOT NULL DEFAULT 'CURSANDO',
    "investidaEm" DATE,

    CONSTRAINT "MatriculaClasse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterioRanking" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "pontos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL,
    "gatilho" "GatilhoCriterio" NOT NULL,
    "lancadoPor" "Papel" NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CriterioRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clube_slug_key" ON "Clube"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Vinculo_clubeId_papel_ativo_idx" ON "Vinculo"("clubeId", "papel", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Vinculo_usuarioId_clubeId_papel_key" ON "Vinculo"("usuarioId", "clubeId", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "Vinculo_clubeId_id_key" ON "Vinculo"("clubeId", "id");

-- CreateIndex
CREATE INDEX "VinculoUnidade_clubeId_unidadeId_idx" ON "VinculoUnidade"("clubeId", "unidadeId");

-- CreateIndex
CREATE INDEX "VinculoClasse_classeId_idx" ON "VinculoClasse"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsoUnico_tokenHash_key" ON "TokenUsoUnico"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenUsoUnico_usuarioId_finalidade_idx" ON "TokenUsoUnico"("usuarioId", "finalidade");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familia_idx" ON "RefreshToken"("familia");

-- CreateIndex
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

-- CreateIndex
CREATE INDEX "Desbravador_clubeId_ativo_nome_idx" ON "Desbravador"("clubeId", "ativo", "nome");

-- CreateIndex
CREATE INDEX "Desbravador_usuarioId_idx" ON "Desbravador"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Desbravador_clubeId_id_key" ON "Desbravador"("clubeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_clubeId_nome_key" ON "Unidade"("clubeId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_clubeId_id_key" ON "Unidade"("clubeId", "id");

-- CreateIndex
CREATE INDEX "MembroUnidade_clubeId_unidadeId_fim_idx" ON "MembroUnidade"("clubeId", "unidadeId", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "membro_unidade_aberto_por_dbv" ON "MembroUnidade"("dbvId") WHERE ("fim" IS NULL);

-- CreateIndex
CREATE INDEX "Classe_clubeId_idx" ON "Classe"("clubeId");

-- CreateIndex
CREATE UNIQUE INDEX "classe_oficial_nome_trilha" ON "Classe"("nome", "trilha") WHERE ("clubeId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Classe_clubeId_nome_trilha_key" ON "Classe"("clubeId", "nome", "trilha");

-- CreateIndex
CREATE UNIQUE INDEX "SecaoRequisito_classeId_codigo_key" ON "SecaoRequisito"("classeId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Requisito_secaoId_codigo_key" ON "Requisito"("secaoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AreaEspecialidade_codigo_key" ON "AreaEspecialidade"("codigo");

-- CreateIndex
CREATE INDEX "Especialidade_areaId_idx" ON "Especialidade"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "especialidade_oficial_area_nome" ON "Especialidade"("areaId", "nome") WHERE ("clubeId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Especialidade_clubeId_areaId_nome_key" ON "Especialidade"("clubeId", "areaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Mestrado_nome_key" ON "Mestrado"("nome");

-- CreateIndex
CREATE INDEX "MatriculaClasse_clubeId_classeId_anoClube_idx" ON "MatriculaClasse"("clubeId", "classeId", "anoClube");

-- CreateIndex
CREATE UNIQUE INDEX "MatriculaClasse_dbvId_classeId_anoClube_key" ON "MatriculaClasse"("dbvId", "classeId", "anoClube");

-- CreateIndex
CREATE INDEX "CriterioRanking_clubeId_ordem_idx" ON "CriterioRanking"("clubeId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "CriterioRanking_clubeId_nome_key" ON "CriterioRanking"("clubeId", "nome");

-- AddForeignKey
ALTER TABLE "ConfiguracaoClube" ADD CONSTRAINT "ConfiguracaoClube_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidade" ADD CONSTRAINT "VinculoUnidade_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidade" ADD CONSTRAINT "VinculoUnidade_clubeId_vinculoId_fkey" FOREIGN KEY ("clubeId", "vinculoId") REFERENCES "Vinculo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidade" ADD CONSTRAINT "VinculoUnidade_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoClasse" ADD CONSTRAINT "VinculoClasse_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoClasse" ADD CONSTRAINT "VinculoClasse_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissaoAjuste" ADD CONSTRAINT "PermissaoAjuste_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsoUnico" ADD CONSTRAINT "TokenUsoUnico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Desbravador" ADD CONSTRAINT "Desbravador_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Desbravador" ADD CONSTRAINT "Desbravador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidade" ADD CONSTRAINT "Unidade_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroUnidade" ADD CONSTRAINT "MembroUnidade_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroUnidade" ADD CONSTRAINT "MembroUnidade_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroUnidade" ADD CONSTRAINT "MembroUnidade_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classe" ADD CONSTRAINT "Classe_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classe" ADD CONSTRAINT "Classe_classeBaseId_fkey" FOREIGN KEY ("classeBaseId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseClube" ADD CONSTRAINT "ClasseClube_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseClube" ADD CONSTRAINT "ClasseClube_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecaoRequisito" ADD CONSTRAINT "SecaoRequisito_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisito" ADD CONSTRAINT "Requisito_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "SecaoRequisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoAjuste" ADD CONSTRAINT "RequisitoAjuste_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoAjuste" ADD CONSTRAINT "RequisitoAjuste_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Requisito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Especialidade" ADD CONSTRAINT "Especialidade_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Especialidade" ADD CONSTRAINT "Especialidade_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AreaEspecialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatriculaClasse" ADD CONSTRAINT "MatriculaClasse_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatriculaClasse" ADD CONSTRAINT "MatriculaClasse_clubeId_dbvId_fkey" FOREIGN KEY ("clubeId", "dbvId") REFERENCES "Desbravador"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatriculaClasse" ADD CONSTRAINT "MatriculaClasse_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterioRanking" ADD CONSTRAINT "CriterioRanking_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
