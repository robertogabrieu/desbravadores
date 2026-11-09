import { PedidoListaSaida, PedidoSaida, VendaListaSaida, VendaPainelSaida, VendaSaida } from '@desbravadores/shared'
import type { PagarPedidoEntrada, PedidoEdicao, PedidoEntrada, PedidosQuery, VendaEntrada } from '@desbravadores/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { montarConsulta, requisitar } from './cliente'

export type Venda = VendaSaida
export type ResumoDeVenda = VendaListaSaida['vendas'][number]
export type PainelDaVenda = VendaPainelSaida
export type Pedido = PedidoSaida
export type ListaDePedidos = PedidoListaSaida

/**
 * Uma raiz só: qualquer escrita relê a lista, o painel e os pedidos de uma vez.
 * Nenhuma consulta daqui fica em memória depois que a tela sai (`gcTime: 0`): têm nome de comprador e chave Pix.
 */
const RAIZ = 'vendas'

const caminhoDaVenda = (vendaId: string): string => `/api/vendas/${vendaId}`
const caminhoDoPedido = (vendaId: string, pedidoId: string): string => `${caminhoDaVenda(vendaId)}/pedidos/${pedidoId}`

/** GET /vendas: a aberta primeiro, com os números do cartão. */
export function useVendas(habilitada = true) {
  return useQuery({
    queryKey: [RAIZ, 'lista'],
    queryFn: () => requisitar('/api/vendas', VendaListaSaida),
    enabled: habilitada,
    gcTime: 0,
  })
}

/** GET /vendas/:id: a venda com produtos e formas, inclusive os desativados. */
export function useVenda(vendaId: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: [RAIZ, 'venda', vendaId],
    queryFn: () => requisitar(caminhoDaVenda(vendaId ?? ''), VendaSaida),
    enabled: habilitada && vendaId !== undefined,
    gcTime: 0,
  })
}

/** GET /vendas/:id/painel: os números do glossário e os contadores dos filtros. */
export function usePainelDaVenda(vendaId: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: [RAIZ, 'painel', vendaId],
    queryFn: () => requisitar(`${caminhoDaVenda(vendaId ?? '')}/painel`, VendaPainelSaida),
    enabled: habilitada && vendaId !== undefined,
    gcTime: 0,
  })
}

/** GET /vendas/:id/pedidos?filtro=&busca=&pagina=: do mais novo para o mais antigo, uma página por vez. */
export function usePedidos(vendaId: string | undefined, consulta: PedidosQuery = {}, habilitada = true) {
  const filtro = consulta.filtro ?? 'TODOS'
  const busca = consulta.busca?.trim() ?? ''
  const pagina = Number(consulta.pagina ?? 1)
  return useQuery({
    queryKey: [RAIZ, 'pedidos', vendaId, filtro, busca, pagina],
    queryFn: () => requisitar(`${caminhoDaVenda(vendaId ?? '')}/pedidos${montarConsulta({ filtro, busca: busca === '' ? undefined : busca, pagina })}`, PedidoListaSaida),
    enabled: habilitada && vendaId !== undefined,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
}

/** GET /vendas/:id/pedidos/:pedidoId. */
export function usePedido(vendaId: string | undefined, pedidoId: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: [RAIZ, 'pedido', vendaId, pedidoId],
    queryFn: () => requisitar(caminhoDoPedido(vendaId ?? '', pedidoId ?? ''), PedidoSaida),
    enabled: habilitada && vendaId !== undefined && pedidoId !== undefined,
    gcTime: 0,
  })
}

/** Escrita que sempre relê o que a tela mostra, dê certo ou não: uma recusa por "venda encerrada" mostra o estado de agora. */
function useEscritaDeVenda<Variaveis, Resultado>(escrever: (variaveis: Variaveis) => Promise<Resultado>) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: escrever,
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

export interface IdsDoPedido {
  vendaId: string
  pedidoId: string
}

/** POST /vendas. */
export const useCriarVenda = () => useEscritaDeVenda((entrada: VendaEntrada) => requisitar('/api/vendas', VendaSaida, { metodo: 'POST', corpo: entrada }))

/** PATCH /vendas/:id: produto ou forma sem `id` é novo, ausente da lista é desativado. */
export const useEditarVenda = () =>
  useEscritaDeVenda(({ vendaId, entrada }: { vendaId: string; entrada: VendaEntrada }) => requisitar(caminhoDaVenda(vendaId), VendaSaida, { metodo: 'PATCH', corpo: entrada }))

/** POST /vendas/:id/encerrar. */
export const useEncerrarVenda = () => useEscritaDeVenda((vendaId: string) => requisitar(`${caminhoDaVenda(vendaId)}/encerrar`, VendaSaida, { metodo: 'POST', corpo: {} }))

/** POST /vendas/:id/reabrir. */
export const useReabrirVenda = () => useEscritaDeVenda((vendaId: string) => requisitar(`${caminhoDaVenda(vendaId)}/reabrir`, VendaSaida, { metodo: 'POST', corpo: {} }))

/** POST /vendas/:id/pedidos. */
export const useLancarPedido = () =>
  useEscritaDeVenda(({ vendaId, entrada }: { vendaId: string; entrada: PedidoEntrada }) => requisitar(`${caminhoDaVenda(vendaId)}/pedidos`, PedidoSaida, { metodo: 'POST', corpo: entrada }))

/** PATCH /vendas/:id/pedidos/:pedidoId: o pagamento muda só por pagar e despagar. */
export const useEditarPedido = () =>
  useEscritaDeVenda(({ vendaId, pedidoId, entrada }: IdsDoPedido & { entrada: PedidoEdicao }) =>
    requisitar(caminhoDoPedido(vendaId, pedidoId), PedidoSaida, { metodo: 'PATCH', corpo: entrada }),
  )

/** POST /vendas/:id/pedidos/:pedidoId/pagar. */
export const usePagarPedido = () =>
  useEscritaDeVenda(({ vendaId, pedidoId, entrada }: IdsDoPedido & { entrada: PagarPedidoEntrada }) =>
    requisitar(`${caminhoDoPedido(vendaId, pedidoId)}/pagar`, PedidoSaida, { metodo: 'POST', corpo: entrada }),
  )

const useAcaoDoPedido = (acao: 'despagar' | 'entregar' | 'desentregar' | 'cancelar' | 'reativar') =>
  useEscritaDeVenda(({ vendaId, pedidoId }: IdsDoPedido) => requisitar(`${caminhoDoPedido(vendaId, pedidoId)}/${acao}`, PedidoSaida, { metodo: 'POST', corpo: {} }))

/** POST …/despagar: apaga também a forma. */
export const useDespagarPedido = () => useAcaoDoPedido('despagar')
/** POST …/entregar. */
export const useEntregarPedido = () => useAcaoDoPedido('entregar')
/** POST …/desentregar. */
export const useDesentregarPedido = () => useAcaoDoPedido('desentregar')
/** POST …/cancelar. */
export const useCancelarPedido = () => useAcaoDoPedido('cancelar')
/** POST …/reativar. */
export const useReativarPedido = () => useAcaoDoPedido('reativar')
