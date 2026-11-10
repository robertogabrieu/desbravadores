-- Comprovante de pagamento opcional do pedido de venda: aponta para o arquivo (foto ou PDF) guardado pelo servidor.
ALTER TABLE "PedidoVenda" ADD COLUMN "comprovanteId" UUID;

CREATE INDEX "PedidoVenda_clubeId_comprovanteId_idx" ON "PedidoVenda"("clubeId", "comprovanteId");

ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clubeId_comprovanteId_fkey" FOREIGN KEY ("clubeId", "comprovanteId") REFERENCES "Arquivo"("clubeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
