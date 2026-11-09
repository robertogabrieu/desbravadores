import type { RouteObject } from 'react-router-dom'
import { TelaEditarVenda } from './TelaEditarVenda'
import { TelaLancarPedido } from './TelaLancarPedido'
import { TelaNovaVenda } from './TelaNovaVenda'
import { TelaPainelVenda } from './TelaPainelVenda'
import { TelaResumoDoPedido } from './TelaResumoDoPedido'
import { TelaVendas } from './TelaVendas'

export const rotasAdmVendas: RouteObject[] = [
  { path: '/adm/vendas', element: <TelaVendas /> },
  { path: '/adm/vendas/nova', element: <TelaNovaVenda /> },
  { path: '/adm/vendas/:id', element: <TelaPainelVenda /> },
  { path: '/adm/vendas/:id/editar', element: <TelaEditarVenda /> },
  { path: '/adm/vendas/:id/pedidos/novo', element: <TelaLancarPedido /> },
  { path: '/adm/vendas/:id/pedidos/:pedidoId', element: <TelaResumoDoPedido /> },
  { path: '/adm/vendas/:id/pedidos/:pedidoId/editar', element: <TelaLancarPedido /> },
]
