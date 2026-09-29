import { z } from 'zod'
import { Uuid } from './comum'

export const PedidoAoAdmEntrada = z.object({ tipo: z.literal('UNIDADE_SEM_DBV'), unidadeId: Uuid })
// POST /api/pedidos-ao-adm → 204 (e-mail a cada Adm ativo; 1 por unidade por 24 h, repetição → 204 sem
// enviar; unidade que já tem DBV → 422 REGRA "A unidade já tem desbravadores.")
