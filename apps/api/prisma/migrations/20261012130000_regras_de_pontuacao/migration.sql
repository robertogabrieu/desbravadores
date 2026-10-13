-- Regras de pontuação: ponto só é acrescido. Sai o desconto por falta, saem 3 colunas de ranking
-- sem uso e a regra MANUAL ("Participação em evento", que nenhum código lia).
-- O CHECK é escrito à mão, como o de 20261009120000_substituicao: o Prisma não modela CHECK (e não o apaga).
-- Idempotente: cada passo confere o que já foi feito.

-- (a) conta os lançamentos negativos ainda ativos (o esperado é zero: o desconto nascia desligado e sem tela)
DO $$
DECLARE negativos integer;
BEGIN
  SELECT count(*) INTO negativos FROM "LancamentoPontos" WHERE "pontos" < 0 AND "estornadoEm" IS NULL;
  RAISE NOTICE 'regras_de_pontuacao: % lancamento(s) com pontos negativos serao estornados', negativos;
END $$;

-- (b) estorna: a regra de produto é "só acrescenta" e o ranking já ignora estornados
UPDATE "LancamentoPontos" SET "estornadoEm" = now() WHERE "pontos" < 0 AND "estornadoEm" IS NULL;

-- (b2) critério com pontos negativos (dado antigo) faria o ServicoPontos.sincronizar lançar: zera
DO $$
DECLARE negativos integer;
BEGIN
  SELECT count(*) INTO negativos FROM "CriterioRanking" WHERE "pontos" < 0;
  RAISE NOTICE 'regras_de_pontuacao: % criterio(s) com pontos negativos serao zerados', negativos;
END $$;
UPDATE "CriterioRanking" SET "pontos" = 0 WHERE "pontos" < 0;

-- (c) colunas e tipo que saem
ALTER TABLE "ConfiguracaoClube"
  DROP COLUMN IF EXISTS "descontarFalta",
  DROP COLUMN IF EXISTS "pontosDescontoFalta",
  DROP COLUMN IF EXISTS "rankingPeriodo",
  DROP COLUMN IF EXISTS "rankingNoLogin",
  DROP COLUMN IF EXISTS "rankingPorUnidade";
DROP TYPE IF EXISTS "PeriodoRanking";

-- (d) a regra MANUAL padrão de cada clube, só se nenhum lançamento (nem estornado) a referencia (a chave é Restrict)
DELETE FROM "CriterioRanking" c
WHERE c."gatilho" = 'MANUAL' AND c."padrao" = true
  AND NOT EXISTS (SELECT 1 FROM "LancamentoPontos" l WHERE l."criterioId" = c."id");

-- (e) sem VALIDATE: os negativos antigos, se houver, ficam como histórico estornado
ALTER TABLE "LancamentoPontos" DROP CONSTRAINT IF EXISTS "lancamento_pontos_nao_negativo";
ALTER TABLE "LancamentoPontos" ADD CONSTRAINT "lancamento_pontos_nao_negativo" CHECK ("pontos" >= 0) NOT VALID;
