import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePedido, useVenda } from '../../api/vendas'
import { CabecalhoDaPagina } from '../../ui/CabecalhoDaPagina'
import { estiloDoBotao } from '../../ui/Botao'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { FormularioPedido } from './FormularioPedido'

/** A mesma tela lança (sem `pedidoId`) e edita (com `pedidoId`) o pedido. */
export function TelaLancarPedido() {
  const { id = '', pedidoId } = useParams()
  const navegar = useNavigate()
  const consultaVenda = useVenda(id)
  const consultaPedido = usePedido(id, pedidoId)
  const venda = consultaVenda.data
  const pedido = consultaPedido.data
  const editando = pedidoId !== undefined
  const painel = `/adm/vendas/${id}`

  const bloqueio = (titulo: string, descricao: string) => (
    <EstadoVazio
      titulo={titulo}
      descricao={descricao}
      acao={
        <Link to={painel} className={estiloDoBotao({ variante: 'secundario' })}>
          Ver a venda
        </Link>
      }
    />
  )

  const corpo = (() => {
    const falha = editando && consultaPedido.isError ? consultaPedido : consultaVenda
    if (falha.isError) {
      if (ehNaoEncontrado(falha.error)) {
        return editando && falha === consultaPedido ? (
          <EstadoNaoEncontrado registro="o pedido" lista={{ para: painel, rotulo: 'Ver a venda' }} />
        ) : (
          <EstadoNaoEncontrado registro="a venda" lista={{ para: '/adm/vendas', rotulo: 'Ver as vendas' }} />
        )
      }
      return <ErroDeCarga erro={falha.error} aoTentarDeNovo={() => void falha.refetch()} />
    }
    if (!venda || (editando && !pedido)) return <Carregando rotulo={editando ? 'Carregando o pedido' : 'Carregando a venda'} />
    if (venda.encerradaEm) return bloqueio('Esta venda foi encerrada.', 'Para lançar ou alterar pedidos, reabra a venda no painel.')
    if (pedido?.canceladoEm) return bloqueio('Este pedido está cancelado.', 'Para alterá-lo, reative o pedido no painel.')
    return <FormularioPedido key={pedido?.id ?? 'novo'} venda={venda} pedido={pedido} voltar={painel} aoConcluir={(gravado) => void navegar(`${painel}/pedidos/${gravado.id}`)} />
  })()

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina voltar={{ para: venda ? painel : '/adm/vendas', rotulo: venda?.nome ?? 'Vendas' }} titulo={editando ? 'Editar pedido' : 'Lançar pedido'} apoio={editando && pedido ? `Pedido ${pedido.codigo}` : venda?.nome} />
      {corpo}
    </div>
  )
}
