import { HttpResponse, http } from 'msw'

export const handlerPedidoAoAdm = (aoReceber?: (corpo: unknown) => void) =>
  http.post('/api/pedidos-ao-adm', async ({ request }) => {
    aoReceber?.(await request.json())
    return new HttpResponse(null, { status: 204 })
  })

export const handlerErroPedidoAoAdm = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.post('/api/pedidos-ao-adm', () => HttpResponse.json(erro, { status }))
