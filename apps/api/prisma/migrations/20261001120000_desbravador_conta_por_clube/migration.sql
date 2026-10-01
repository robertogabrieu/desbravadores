-- Uma conta liga no maximo uma ficha por clube (SPEC convite-por-link). Se o banco ja tem a mesma
-- conta em duas fichas do mesmo clube, a migration para e diz quais: nada e apagado, quem decide
-- qual ficha fica com a conta e o Adm.
DO $$
DECLARE
  repetidas TEXT;
BEGIN
  SELECT string_agg(format('clube %s, usuario %s (%s fichas)', "clubeId", "usuarioId", n), '; ')
    INTO repetidas
    FROM (
      SELECT "clubeId", "usuarioId", count(*) AS n
        FROM "Desbravador"
       WHERE "usuarioId" IS NOT NULL
       GROUP BY "clubeId", "usuarioId"
      HAVING count(*) > 1
    ) AS duplicadas;
  IF repetidas IS NOT NULL THEN
    RAISE EXCEPTION 'Conta ligada a mais de um desbravador no mesmo clube: %. Desligue a conta das fichas a mais (usuarioId = NULL) e rode a migration de novo.', repetidas;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "desbravador_conta_por_clube" ON "Desbravador"("clubeId", "usuarioId") WHERE ("usuarioId" IS NOT NULL);
