-- Vendas de arrecadação (docs/fases/venda-arrecadacao/SPEC.md). Modelos de clube: entram em MODELOS_DE_CLUBE junto.
-- Os CHECK são escritos à mão, como "item_biblioteca_tipo_coerente": o Prisma não modela CHECK (e não os apaga).
CREATE TYPE "TipoFormaPagamentoVenda" AS ENUM ('PIX', 'SETE_ME', 'DINHEIRO');
CREATE TYPE "FormaPagamentoPedido" AS ENUM ('PIX', 'SETE_ME', 'DINHEIRO', 'MISTO');

CREATE TABLE "VendaArrecadacao" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "taxaEntrega" INTEGER NOT NULL,
    "retiradaData" DATE,
    "retiradaHorario" TEXT,
    "retiradaLocal" TEXT,
    "instrucoes" TEXT,
    "encerradaEm" TIMESTAMPTZ,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendaArrecadacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProdutoVenda" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "vendaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeCurto" TEXT NOT NULL,
    "preco" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProdutoVenda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormaPagamentoVenda" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "vendaId" UUID NOT NULL,
    "tipo" "TipoFormaPagamentoVenda" NOT NULL,
    "chave" TEXT,
    "favorecido" TEXT,
    "orientacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FormaPagamentoVenda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoVenda" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "vendaId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "comprador" TEXT NOT NULL,
    "vendedor" TEXT,
    "unidadeId" UUID,
    "daDiretoria" BOOLEAN NOT NULL DEFAULT false,
    "entrega" BOOLEAN NOT NULL DEFAULT false,
    "endereco" TEXT,
    "taxaEntrega" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "forma" "FormaPagamentoPedido",
    "entregueEm" TIMESTAMPTZ,
    "canceladoEm" TIMESTAMPTZ,
    "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoVenda_pkey" PRIMARY KEY ("id"),
    -- Diretoria não é Unidade: sem isto, um pedido contaria nas duas linhas do painel.
    CONSTRAINT "pedido_venda_diretoria_sem_unidade" CHECK (NOT ("daDiretoria" AND "unidadeId" IS NOT NULL)),
    CONSTRAINT "pedido_venda_forma_so_se_pago" CHECK ("forma" IS NULL OR "pago"),
    CONSTRAINT "pedido_venda_endereco_so_na_entrega" CHECK (("entrega" AND "endereco" IS NOT NULL) OR (NOT "entrega" AND "endereco" IS NULL))
);

CREATE TABLE "ItemPedidoVenda" (
    "id" UUID NOT NULL,
    "clubeId" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "produtoId" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoGravado" INTEGER NOT NULL,

    CONSTRAINT "ItemPedidoVenda_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendaArrecadacao_clubeId_id_key" ON "VendaArrecadacao"("clubeId", "id");
CREATE INDEX "VendaArrecadacao_clubeId_encerradaEm_idx" ON "VendaArrecadacao"("clubeId", "encerradaEm");
CREATE UNIQUE INDEX "ProdutoVenda_clubeId_id_key" ON "ProdutoVenda"("clubeId", "id");
CREATE INDEX "ProdutoVenda_clubeId_vendaId_idx" ON "ProdutoVenda"("clubeId", "vendaId");
CREATE UNIQUE INDEX "FormaPagamentoVenda_vendaId_tipo_key" ON "FormaPagamentoVenda"("vendaId", "tipo");
CREATE INDEX "FormaPagamentoVenda_clubeId_vendaId_idx" ON "FormaPagamentoVenda"("clubeId", "vendaId");
CREATE UNIQUE INDEX "PedidoVenda_clubeId_id_key" ON "PedidoVenda"("clubeId", "id");
CREATE UNIQUE INDEX "PedidoVenda_vendaId_numero_key" ON "PedidoVenda"("vendaId", "numero");
CREATE INDEX "PedidoVenda_clubeId_vendaId_idx" ON "PedidoVenda"("clubeId", "vendaId");
CREATE INDEX "PedidoVenda_clubeId_unidadeId_idx" ON "PedidoVenda"("clubeId", "unidadeId");
CREATE UNIQUE INDEX "ItemPedidoVenda_pedidoId_produtoId_key" ON "ItemPedidoVenda"("pedidoId", "produtoId");
CREATE INDEX "ItemPedidoVenda_clubeId_pedidoId_idx" ON "ItemPedidoVenda"("clubeId", "pedidoId");
CREATE INDEX "ItemPedidoVenda_clubeId_produtoId_idx" ON "ItemPedidoVenda"("clubeId", "produtoId");

ALTER TABLE "VendaArrecadacao" ADD CONSTRAINT "VendaArrecadacao_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProdutoVenda" ADD CONSTRAINT "ProdutoVenda_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProdutoVenda" ADD CONSTRAINT "ProdutoVenda_clubeId_vendaId_fkey" FOREIGN KEY ("clubeId", "vendaId") REFERENCES "VendaArrecadacao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormaPagamentoVenda" ADD CONSTRAINT "FormaPagamentoVenda_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormaPagamentoVenda" ADD CONSTRAINT "FormaPagamentoVenda_clubeId_vendaId_fkey" FOREIGN KEY ("clubeId", "vendaId") REFERENCES "VendaArrecadacao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clubeId_vendaId_fkey" FOREIGN KEY ("clubeId", "vendaId") REFERENCES "VendaArrecadacao"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clubeId_unidadeId_fkey" FOREIGN KEY ("clubeId", "unidadeId") REFERENCES "Unidade"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedidoVenda" ADD CONSTRAINT "ItemPedidoVenda_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedidoVenda" ADD CONSTRAINT "ItemPedidoVenda_clubeId_pedidoId_fkey" FOREIGN KEY ("clubeId", "pedidoId") REFERENCES "PedidoVenda"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedidoVenda" ADD CONSTRAINT "ItemPedidoVenda_clubeId_produtoId_fkey" FOREIGN KEY ("clubeId", "produtoId") REFERENCES "ProdutoVenda"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
