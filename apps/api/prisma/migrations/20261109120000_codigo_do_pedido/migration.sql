-- O número sequencial revelava quantas vendas o clube já fez: cada pedido passa a ter um código aleatório.
ALTER TABLE "PedidoVenda" ADD COLUMN "codigo" TEXT;

CREATE UNIQUE INDEX "PedidoVenda_vendaId_codigo_key" ON "PedidoVenda"("vendaId", "codigo");

-- Pedidos que já existem: sorteia 6 caracteres do alfabeto sem ambíguos e tenta de novo se o código já estiver na venda.
DO $$
DECLARE
  pedido RECORD;
  candidato TEXT;
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR pedido IN SELECT "id" FROM "PedidoVenda" LOOP
    LOOP
      candidato := '';
      FOR i IN 1..6 LOOP
        candidato := candidato || substr(alfabeto, 1 + floor(random() * 32)::int, 1);
      END LOOP;
      BEGIN
        UPDATE "PedidoVenda" SET "codigo" = candidato WHERE "id" = pedido."id";
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "PedidoVenda" ALTER COLUMN "codigo" SET NOT NULL;

DROP INDEX "PedidoVenda_vendaId_numero_key";
ALTER TABLE "PedidoVenda" DROP COLUMN "numero";
