-- Classe oficial retirada do catalogo e desativada, nunca apagada (tem historico).
ALTER TABLE "Classe" ADD COLUMN "ativa" BOOLEAN NOT NULL DEFAULT true;
