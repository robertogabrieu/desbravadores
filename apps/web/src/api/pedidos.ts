import { PedidoAoAdmEntrada } from '@desbravadores/shared'
import { useMutation } from '@tanstack/react-query'
import { requisitarSemResposta } from './cliente'

/** "Avisar o Adm" numa unidade sem desbravadores (o servidor manda o e-mail e responde 204). */
export function useAvisarAdmUnidadeVazia() {
  return useMutation({
    mutationFn: (unidadeId: string) =>
      requisitarSemResposta('/api/pedidos-ao-adm', {
        metodo: 'POST',
        corpo: PedidoAoAdmEntrada.parse({ tipo: 'UNIDADE_SEM_DBV', unidadeId }),
      }),
  })
}
