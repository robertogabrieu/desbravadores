import { PEDIDOS_POR_PAGINA, rotuloDaSituacao, situacaoDoPedido } from '@desbravadores/shared'
import type { FormaDoPedido } from '@desbravadores/shared'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCancelarPedido, useDesentregarPedido, useDespagarPedido, useEntregarPedido, usePagarPedido, useReativarPedido } from '../../api/vendas'
import type { Pedido, Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { Selo } from '../../ui/Selo'
import { Tabela } from '../../ui/Tabela'
import type { ColunaTabela } from '../../ui/Tabela'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { DialogoCancelarPedido } from './DialogoCancelarPedido'
import { DialogoPagarPedido, formasAceitasPela } from './DialogoPagarPedido'
import { formatarReais } from './formatos'

const SEM_INTERNET = 'Marcar pago, entregue e cancelar precisam de internet. Conecte-se para continuar.'
const ACAO_DE_TEXTO = 'min-h-[var(--touch-min)] px-2'

interface Propriedades {
  venda: Venda
  pedidos: Pedido[]
  pagina: number
  total: number
  aoMudarPagina: (pagina: number) => void
  /** Mostrado no lugar da tabela quando a página não tem pedido. */
  vazio: ReactNode
}

const itensDoPedido = (pedido: Pedido): string =>
  pedido.itens
    .filter((item) => item.quantidade > 0)
    .map((item) => `${item.quantidade} ${item.nomeCurto}`)
    .join(' · ')

const origemDoPedido = (pedido: Pedido): string => [pedido.vendedor, pedido.daDiretoria ? 'Diretoria' : pedido.unidadeNome].filter(Boolean).join(' · ')

function Pagamento({ pedido }: { pedido: Pedido }) {
  const situacao = situacaoDoPedido(pedido)
  if (situacao === 'CANCELADO') return <span className="text-texto-2">—</span>
  return <Selo tom={situacao === 'PAGO' ? 'sucesso' : 'alerta'}>{rotuloDaSituacao(situacao, pedido.forma)}</Selo>
}

function Situacao({ pedido }: { pedido: Pedido }) {
  if (pedido.canceladoEm) return <Selo tom="neutro">Cancelado</Selo>
  return <span>{pedido.entregueEm ? 'Entregue' : 'A entregar'}</span>
}

/** Pedidos da venda, com as ações que o estado de cada um permite; venda encerrada só deixa abrir o resumo. */
export function TabelaDePedidos({ venda, pedidos, pagina, total, aoMudarPagina, vazio }: Propriedades) {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const encerrada = venda.encerradaEm !== null
  const [aPagar, setAPagar] = useState<Pedido | null>(null)
  const [aCancelar, setACancelar] = useState<Pedido | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const pagar = usePagarPedido()
  const despagar = useDespagarPedido()
  const entregar = useEntregarPedido()
  const desentregar = useDesentregarPedido()
  const cancelar = useCancelarPedido()
  const reativar = useReativarPedido()
  const ocupado = [pagar, despagar, entregar, desentregar, cancelar, reativar].some((escrita) => escrita.isPending)
  const ids = (pedido: Pedido) => ({ vendaId: venda.id, pedidoId: pedido.id })

  /** Roda a escrita e guarda a recusa da API na tela; devolve se deu certo, para o diálogo saber se fecha. */
  async function executar(escrita: () => Promise<unknown>): Promise<boolean> {
    setErro(null)
    try {
      await escrita()
      return true
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral)
      return false
    }
  }

  async function confirmarPagamento(forma: FormaDoPedido) {
    if (aPagar && (await executar(() => pagar.mutateAsync({ ...ids(aPagar), entrada: { forma } })))) setAPagar(null)
  }

  async function confirmarCancelamento() {
    if (aCancelar && (await executar(() => cancelar.mutateAsync(ids(aCancelar))))) setACancelar(null)
  }

  const acoesDoPedido = (pedido: Pedido): ReactNode => {
    const desligada = !online || ocupado
    const acao = (rotulo: string, aria: string, aoClicar: () => void, perigo = false) => (
      <Botao variante="texto" className={perigo ? `${ACAO_DE_TEXTO} text-perigo` : ACAO_DE_TEXTO} aria-label={`${aria}, pedido ${pedido.numero}`} disabled={desligada} onClick={aoClicar}>
        {rotulo}
      </Botao>
    )
    const resumo = (
      <Link to={`/adm/vendas/${venda.id}/pedidos/${pedido.id}`} aria-label={`Resumo, pedido ${pedido.numero}`} className="inline-flex min-h-[var(--touch-min)] items-center px-2 text-base font-semibold text-marca focus-visible:outline-2 focus-visible:outline-marca">
        Resumo
      </Link>
    )
    if (encerrada) return <div className="flex flex-wrap items-center">{resumo}</div>
    if (pedido.canceladoEm) {
      return (
        <div className="flex flex-wrap items-center">
          <Botao variante="texto" className={ACAO_DE_TEXTO} aria-label={`Reativar pedido ${pedido.numero}`} disabled={desligada} onClick={() => void executar(() => reativar.mutateAsync(ids(pedido)))}>
            Reativar
          </Botao>
          {resumo}
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center">
        {pedido.pago
          ? acao('Desmarcar pago', 'Desmarcar pago', () => void executar(() => despagar.mutateAsync(ids(pedido))))
          : acao('Marcar como pago', 'Marcar como pago', () => {
              setErro(null)
              setAPagar(pedido)
            })}
        {pedido.entregueEm
          ? acao('Desmarcar entrega', 'Desmarcar entrega', () => void executar(() => desentregar.mutateAsync(ids(pedido))))
          : acao('Marcar como entregue', 'Marcar como entregue', () => void executar(() => entregar.mutateAsync(ids(pedido))))}
        {!pedido.entregueEm &&
          acao(
            'Cancelar',
            'Cancelar',
            () => {
              setErro(null)
              setACancelar(pedido)
            },
            true,
          )}
        {resumo}
      </div>
    )
  }

  const colunas: ColunaTabela<Pedido>[] = [
    { chave: 'numero', titulo: 'Nº', celula: (pedido) => <b className="tabular-nums">{pedido.numero}</b> },
    {
      chave: 'comprador',
      titulo: 'Comprador',
      celula: (pedido) => (
        <div className="flex flex-col">
          <Link to={`/adm/vendas/${venda.id}/pedidos/${pedido.id}`} className="font-semibold text-texto hover:underline focus-visible:outline-2 focus-visible:outline-marca">
            {pedido.comprador}
          </Link>
          <span className="text-sm text-texto-2">{origemDoPedido(pedido)}</span>
        </div>
      ),
    },
    {
      chave: 'itens',
      titulo: 'Itens',
      celula: (pedido) => (
        <div className="flex flex-col">
          <span>{itensDoPedido(pedido)}</span>
          {pedido.entrega && <span className="text-sm text-texto-2">Entrega · {pedido.endereco}</span>}
        </div>
      ),
    },
    { chave: 'total', titulo: 'Total', celula: (pedido) => <b className="tabular-nums">{formatarReais(pedido.total)}</b> },
    { chave: 'pagamento', titulo: 'Pagamento', celula: (pedido) => <Pagamento pedido={pedido} /> },
    { chave: 'situacao', titulo: 'Situação', celula: (pedido) => <Situacao pedido={pedido} /> },
    { chave: 'acoes', titulo: 'Ações', celula: (pedido) => acoesDoPedido(pedido) },
  ]

  return (
    <div className="flex flex-col gap-3">
      {!encerrada && !online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
      {erro && !aPagar && !aCancelar && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <Tabela
        colunas={colunas}
        itens={pedidos}
        chaveItem={(pedido) => pedido.id}
        pagina={pagina}
        porPagina={PEDIDOS_POR_PAGINA}
        total={total}
        aoMudarPagina={aoMudarPagina}
        vazio={vazio}
        cartao={(pedido) => (
          <div className="flex flex-col gap-2 rounded-cartao border border-borda-controle bg-superficie p-4">
            <div className="flex items-center justify-between gap-3">
              <b>
                {pedido.numero} · {pedido.comprador}
              </b>
              <b className="tabular-nums">{formatarReais(pedido.total)}</b>
            </div>
            <span className="text-sm text-texto-2">{itensDoPedido(pedido)}</span>
            {acoesDoPedido(pedido)}
          </div>
        )}
      />
      <DialogoPagarPedido aberto={aPagar !== null} formas={formasAceitasPela(venda)} ocupado={pagar.isPending} erro={erro} aoConfirmar={(forma) => void confirmarPagamento(forma)} aoCancelar={() => {
          setErro(null)
          setAPagar(null)
        }} />
      <DialogoCancelarPedido
        aberto={aCancelar !== null}
        numero={aCancelar?.numero ?? 0}
        comprador={aCancelar?.comprador ?? ''}
        ocupado={cancelar.isPending}
        erro={erro}
        aoConfirmar={() => void confirmarCancelamento()}
        aoCancelar={() => {
          setErro(null)
          setACancelar(null)
        }}
      />
    </div>
  )
}
