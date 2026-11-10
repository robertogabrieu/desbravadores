import { PEDIDOS_POR_PAGINA, rotuloDaSituacao, situacaoDoPedido } from '@desbravadores/shared'
import type { FormaDoPedido } from '@desbravadores/shared'
import { Check, Paperclip } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCancelarPedido, useDesentregarPedido, useDespagarPedido, useEntregarPedido, useEnviarComprovante, usePagarPedido, useReativarPedido } from '../../api/vendas'
import type { Pedido, Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { cn } from '../../ui/cn'
import { Selo } from '../../ui/Selo'
import { Tabela } from '../../ui/Tabela'
import type { ColunaTabela } from '../../ui/Tabela'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { DialogoCancelarPedido } from './DialogoCancelarPedido'
import { DialogoPagarPedido, formasAceitasPela } from './DialogoPagarPedido'
import { formatarReaisComCentavos, situacaoDaEntrega } from './formatos'
import { MenuDeAcoes } from './MenuDeAcoes'
import type { AcaoDoMenu } from './MenuDeAcoes'

const AVISO_COMPROVANTE_NAO_ENVIADO = 'O pedido foi marcado como pago, mas o comprovante não foi enviado.'
const SEM_INTERNET = 'Marcar pago, entregue e cancelar precisam de internet. Conecte-se para continuar.'

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

/** Pedido cancelado fica com o texto secundário e o valor riscado; o selo "Cancelado" vem da situação. */
const ESMAECIDO = 'text-texto-2'
const classeDoValor = (pedido: Pedido): string => cn('tabular-nums whitespace-nowrap', pedido.canceladoEm && 'text-texto-2 line-through')

/** Ícone discreto de quem tem comprovante; o texto vai para leitor de tela e dica do mouse. */
function IconeDeComprovante({ pedido }: { pedido: Pedido }) {
  if (!pedido.comprovante) return null
  return (
    <span role="img" aria-label="Tem comprovante" title="Tem comprovante" className="inline-flex text-texto-2">
      <Paperclip aria-hidden className="size-4" />
    </span>
  )
}

function Pagamento({ pedido }: { pedido: Pedido }) {
  const situacao = situacaoDoPedido(pedido)
  if (situacao === 'CANCELADO') return <span className="text-texto-2">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <Selo tom={situacao === 'PAGO' ? 'sucesso' : 'alerta'} className="whitespace-nowrap">{rotuloDaSituacao(situacao, pedido.forma)}</Selo>
      <IconeDeComprovante pedido={pedido} />
    </span>
  )
}

function Situacao({ pedido }: { pedido: Pedido }) {
  if (pedido.canceladoEm) return <Selo tom="neutro" className="whitespace-nowrap">Cancelado</Selo>
  if (!pedido.entregueEm) return <Selo tom="alerta" className="whitespace-nowrap">{situacaoDaEntrega(pedido)}</Selo>
  return (
    <Selo tom="sucesso" className="whitespace-nowrap">
      <Check aria-hidden className="size-4" />
      {situacaoDaEntrega(pedido)}
    </Selo>
  )
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
  const enviarComprovante = useEnviarComprovante()
  const ocupado = [pagar, despagar, entregar, desentregar, cancelar, reativar, enviarComprovante].some((escrita) => escrita.isPending)
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

  /** O pagamento grava primeiro; se só o comprovante falhar, o pedido fica pago e a tela avisa onde tentar de novo. */
  async function confirmarPagamento(forma: FormaDoPedido, comprovante: File | null) {
    if (!aPagar || !(await executar(() => pagar.mutateAsync({ ...ids(aPagar), entrada: { forma } })))) return
    const pedido = aPagar
    setAPagar(null)
    if (!comprovante) return
    try {
      await enviarComprovante.mutateAsync({ ...ids(pedido), arquivo: comprovante })
    } catch (falha) {
      setErro([AVISO_COMPROVANTE_NAO_ENVIADO, lerErroDaApi(falha).geral, `Pedido ${pedido.codigo}: abra o resumo e tente de novo.`].filter(Boolean).join(' '))
    }
  }

  async function confirmarCancelamento() {
    if (aCancelar && (await executar(() => cancelar.mutateAsync(ids(aCancelar))))) setACancelar(null)
  }

  const acoesDoPedido = (pedido: Pedido): ReactNode => {
    const desligada = !online || ocupado
    const resumo: AcaoDoMenu = { rotulo: 'Resumo', para: `/adm/vendas/${venda.id}/pedidos/${pedido.id}` }
    const escrita = (rotulo: string, aoEscolher: () => void, perigo = false): AcaoDoMenu => ({ rotulo, aoEscolher, desligada, perigo })
    const recebimento = pedido.entrega ? 'entrega' : 'retirada'
    const recebido = pedido.entrega ? 'entregue' : 'retirado'
    const abrirDialogo = (abrir: (pedido: Pedido) => void) => () => {
      setErro(null)
      abrir(pedido)
    }
    let acoes: AcaoDoMenu[]
    if (encerrada) acoes = [resumo]
    else if (pedido.canceladoEm) acoes = [escrita('Reativar', () => void executar(() => reativar.mutateAsync(ids(pedido)))), resumo]
    else
      acoes = [
        pedido.pago ? escrita('Desmarcar pago', () => void executar(() => despagar.mutateAsync(ids(pedido)))) : escrita('Marcar como pago', abrirDialogo(setAPagar)),
        pedido.entregueEm
          ? escrita(`Desmarcar ${recebimento}`, () => void executar(() => desentregar.mutateAsync(ids(pedido))))
          : escrita(`Marcar como ${recebido}`, () => void executar(() => entregar.mutateAsync(ids(pedido)))),
        resumo,
        ...(pedido.entregueEm ? [] : [escrita('Cancelar', abrirDialogo(setACancelar), true)]),
      ]
    return <MenuDeAcoes rotuloAcessivel={`Ações do pedido ${pedido.codigo}`} acoes={acoes} />
  }

  const colunas: ColunaTabela<Pedido>[] = [
    { chave: 'codigo', titulo: 'Código', celula: (pedido) => <b className={cn('font-mono', pedido.canceladoEm && ESMAECIDO)}>{pedido.codigo}</b> },
    {
      chave: 'comprador',
      titulo: 'Comprador',
      celula: (pedido) => (
        <div className="flex flex-col">
          <Link to={`/adm/vendas/${venda.id}/pedidos/${pedido.id}`} className={cn('font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-marca', pedido.canceladoEm ? ESMAECIDO : 'text-texto')}>
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
          <span className={cn(pedido.canceladoEm && ESMAECIDO)}>{itensDoPedido(pedido)}</span>
          {pedido.entrega && <span className="text-sm text-texto-2">Entrega · {pedido.endereco}</span>}
        </div>
      ),
    },
    { chave: 'total', titulo: 'Total', celula: (pedido) => <b className={classeDoValor(pedido)}>{formatarReaisComCentavos(pedido.total)}</b> },
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
              <span className="flex min-w-0 items-center gap-2">
                <b className={cn('min-w-0 break-words', pedido.canceladoEm && ESMAECIDO)}>
                  {pedido.codigo} · {pedido.comprador}
                </b>
                {pedido.pago && <IconeDeComprovante pedido={pedido} />}
              </span>
              <div className="flex items-center gap-1">
                <b className={classeDoValor(pedido)}>{formatarReaisComCentavos(pedido.total)}</b>
                {acoesDoPedido(pedido)}
              </div>
            </div>
            <span className="text-sm text-texto-2">{itensDoPedido(pedido)}</span>
            {pedido.canceladoEm && <Selo tom="neutro" className="self-start">Cancelado</Selo>}
          </div>
        )}
      />
      <DialogoPagarPedido aberto={aPagar !== null} formas={formasAceitasPela(venda)} ocupado={pagar.isPending} erro={erro} aoConfirmar={(forma, comprovante) => void confirmarPagamento(forma, comprovante)} aoCancelar={() => {
          setErro(null)
          setAPagar(null)
        }} />
      <DialogoCancelarPedido
        aberto={aCancelar !== null}
        codigo={aCancelar?.codigo ?? ''}
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
