import { FILTROS_DO_PEDIDO, PEDIDOS_POR_PAGINA, rotuloDoFiltro } from '@desbravadores/shared'
import type { FiltroDoPedido } from '@desbravadores/shared'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEncerrarVenda, usePainelDaVenda, usePedidos, useReabrirVenda, useVenda } from '../../api/vendas'
import type { PainelDaVenda, Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { Abas } from '../../ui/Abas'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Cartao } from '../../ui/Cartao'
import { CabecalhoDaPagina } from '../../ui/CabecalhoDaPagina'
import { cn } from '../../ui/cn'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selo } from '../../ui/Selo'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { descricaoDaRetirada, formatarReais } from './formatos'
import { TabelaDePedidos } from './TabelaDePedidos'

const ATRASO_DA_BUSCA_MS = 300
const SEM_INTERNET_ENCERRAR = 'Encerrar a venda precisa de internet. Conecte-se para continuar.'
const SEM_INTERNET_REABRIR = 'Reabrir a venda precisa de internet. Conecte-se para continuar.'

const plural = (quantidade: number, singular: string, muitos: string): string => `${quantidade} ${quantidade === 1 ? singular : muitos}`

const CONTADOR_DO_FILTRO: Record<FiltroDoPedido, keyof PainelDaVenda['contadores']> = {
  TODOS: 'todos',
  A_PAGAR: 'aPagar',
  A_ENTREGAR: 'aEntregar',
  ENTREGUES: 'entregues',
}

const SEM_RESULTADO: Record<FiltroDoPedido, { titulo: string; descricao: string }> = {
  TODOS: { titulo: 'Nenhum pedido encontrado.', descricao: 'Confira o nome ou o número digitado.' },
  A_PAGAR: { titulo: 'Nenhum pedido a pagar.', descricao: 'Todos os pedidos desta venda estão pagos.' },
  A_ENTREGAR: { titulo: 'Nenhum pedido a entregar.', descricao: 'Todos os pedidos já foram retirados ou entregues.' },
  ENTREGUES: { titulo: 'Nenhum pedido entregue ainda.', descricao: 'Os pedidos aparecem aqui quando forem marcados como entregues.' },
}

function Numero({ valor, rotulo, detalhe, aviso = false }: { valor: string; rotulo: string; detalhe?: string; aviso?: boolean }) {
  return (
    <Cartao className={cn('flex min-w-48 flex-1 flex-col px-5 py-4', aviso && 'border-alerta')}>
      <b className={cn('font-titulo text-3xl text-texto tabular-nums', aviso && 'text-alerta')}>{valor}</b>
      <span className={cn('text-sm text-texto-2', aviso && 'font-semibold text-alerta')}>{rotulo}</span>
      {detalhe && <span className="text-sm text-texto-2">{detalhe}</span>}
    </Cartao>
  )
}

/** Os números do glossário como o servidor os calculou: a tela só formata. */
function NumerosDaVenda({ painel }: { painel: PainelDaVenda }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Numero valor={String(painel.unidadesVendidas)} rotulo="Unidades vendidas" detalhe={painel.porProduto.map((produto) => `${produto.unidades} ${produto.nomeCurto}`).join(' · ')} />
      <Numero valor={formatarReais(painel.recebido)} rotulo="Recebido" detalhe={`de ${formatarReais(painel.vendido)} vendidos`} />
      <Numero valor={formatarReais(painel.aReceber)} rotulo={`A receber · ${plural(painel.pedidosAPagar, 'pedido', 'pedidos')}`} aviso />
      <Numero valor={String(painel.aEntregar)} rotulo="Pedidos a retirar ou entregar" detalhe={`${painel.entregues} já ${painel.entregues === 1 ? 'foi' : 'foram'}`} />
    </div>
  )
}

function UnidadesVendidasPorUnidade({ painel }: { painel: PainelDaVenda }) {
  const idTitulo = useId()
  const maior = Math.max(1, ...painel.porUnidade.map((linha) => linha.unidades))
  return (
    <Cartao className="flex w-full shrink-0 flex-col gap-3 px-5 py-4 md:w-72" role="region" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="font-titulo text-lg font-bold text-texto">
        Unidades vendidas por unidade
      </h2>
      {painel.porUnidade.map((linha) => {
        const nome = linha.ativa ? linha.nome : `${linha.nome} (inativa)`
        return (
          <div key={`${linha.tipo}-${linha.unidadeId ?? linha.nome}`} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-base text-texto">
              <span>{nome}</span>
              <b className="tabular-nums">{linha.unidades}</b>
            </div>
            <BarraProgresso valor={(linha.unidades / maior) * 100} rotulo={nome} />
          </div>
        )
      })}
      <span className="text-sm text-texto-2">Total: {plural(painel.unidadesVendidas, 'unidade', 'unidades')}</span>
    </Cartao>
  )
}

interface PropriedadesDosPedidos {
  venda: Venda
  painel: PainelDaVenda | undefined
  aoLancar: ReactNode
}

/** Filtros, busca e tabela. Trocar de filtro ou de busca volta à primeira página. */
function PedidosDaVenda({ venda, painel, aoLancar }: PropriedadesDosPedidos) {
  const [filtro, setFiltro] = useState<FiltroDoPedido>('TODOS')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const pedidos = usePedidos(venda.id, { filtro, busca: buscaAplicada, pagina })

  useEffect(() => {
    const espera = setTimeout(() => {
      setBuscaAplicada(busca)
      setPagina(1)
    }, ATRASO_DA_BUSCA_MS)
    return () => clearTimeout(espera)
  }, [busca])

  // A última página esvaziou (o único pedido dela saiu do filtro): volta à última que ainda tem pedido.
  const total = pedidos.data?.total
  const itensDaPagina = pedidos.data?.itens.length
  useEffect(() => {
    if (total !== undefined && total > 0 && itensDaPagina === 0 && pagina > 1) setPagina(Math.ceil(total / PEDIDOS_POR_PAGINA))
  }, [total, itensDaPagina, pagina])

  const verTodos = () => {
    setFiltro('TODOS')
    setBusca('')
    setBuscaAplicada('')
    setPagina(1)
  }

  const semPedidoNenhum = painel !== undefined && painel.contadores.todos === 0
  const vazio = semPedidoNenhum ? (
    <EstadoVazio titulo="Nenhum pedido lançado." descricao="Os números e a lista aparecem aqui assim que você lançar o primeiro." acao={aoLancar} />
  ) : (
    <EstadoVazio
      titulo={buscaAplicada ? `Nenhum pedido para "${buscaAplicada}".` : SEM_RESULTADO[filtro].titulo}
      descricao={buscaAplicada ? 'Confira o nome ou o número digitado.' : SEM_RESULTADO[filtro].descricao}
      acao={
        <Botao variante="secundario" onClick={verTodos}>
          Ver todos os pedidos
        </Botao>
      }
    />
  )

  // Página vazia com pedidos no filtro: o efeito acima já está voltando à última página válida.
  const voltandoDePagina = pedidos.data !== undefined && pedidos.data.itens.length === 0 && pedidos.data.total > 0
  const corpo = (() => {
    if (voltandoDePagina) return <Carregando rotulo="Carregando os pedidos" />
    if (pedidos.data) return <TabelaDePedidos venda={venda} pedidos={pedidos.data.itens} pagina={pagina} total={pedidos.data.total} aoMudarPagina={setPagina} vazio={vazio} />
    if (pedidos.isError) return <ErroDeCarga erro={pedidos.error} aoTentarDeNovo={() => void pedidos.refetch()} />
    return <Carregando rotulo="Carregando os pedidos" />
  })()

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Abas
          rotulo="Filtrar pedidos"
          ativa={filtro}
          abas={FILTROS_DO_PEDIDO.map((id) => ({ id, rotulo: painel ? `${rotuloDoFiltro(id)} ${painel.contadores[CONTADOR_DO_FILTRO[id]]}` : rotuloDoFiltro(id) }))}
          aoMudar={(id) => {
            setFiltro(id as FiltroDoPedido)
            setPagina(1)
          }}
        />
        <div className="w-full sm:w-72">
          <Campo type="search" rotulo="Buscar comprador ou nº" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
        </div>
      </div>
      {corpo}
      {pedidos.data && pedidos.data.total > 0 && !voltandoDePagina && (
        <span className="text-sm text-texto-2">
          Mostrando {pedidos.data.itens.length} de {pedidos.data.total} pedidos, do mais novo para o mais antigo.
        </span>
      )}
    </section>
  )
}

function descricaoDaVenda(venda: Venda): string {
  const taxa = venda.taxaEntrega > 0 ? `Entrega +${formatarReais(venda.taxaEntrega)}` : null
  const retirada = descricaoDaRetirada(venda)
  return [retirada ? `Retirada ${retirada}` : null, taxa].filter(Boolean).join(' · ')
}

export function TelaPainelVenda() {
  const { id = '' } = useParams()
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const consulta = useVenda(id)
  const consultaPainel = usePainelDaVenda(id)
  const encerrar = useEncerrarVenda()
  const reabrir = useReabrirVenda()
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const venda = consulta.data

  if (!venda) {
    if (consulta.isError && ehNaoEncontrado(consulta.error)) return <EstadoNaoEncontrado registro="a venda" lista={{ para: '/adm/vendas', rotulo: 'Ver as vendas' }} />
    return consulta.isError ? <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} /> : <Carregando rotulo="Carregando a venda" />
  }

  const encerrada = venda.encerradaEm !== null
  const semProduto = !venda.produtos.some((produto) => produto.ativo)
  const lancarPedido = `/adm/vendas/${venda.id}/pedidos/novo`
  const botaoLancar = encerrada || semProduto ? (
    <Botao disabled className="order-first w-full sm:order-none sm:w-auto">
      <Plus aria-hidden className="size-5" />
      Lançar pedido
    </Botao>
  ) : (
    <Link to={lancarPedido} className={cn(estiloDoBotao(), 'order-first w-full sm:order-none sm:w-auto')}>
      <Plus aria-hidden className="size-5" />
      Lançar pedido
    </Link>
  )

  async function gravar(escrita: () => Promise<unknown>): Promise<void> {
    setErro(null)
    try {
      await escrita()
      setConfirmandoEncerrar(false)
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral)
    }
  }

  const acoes = encerrada ? (
    <>
      <Botao variante="secundario" className="w-full sm:w-auto" carregando={reabrir.isPending} disabled={!online} onClick={() => void gravar(() => reabrir.mutateAsync(venda.id))}>
        Reabrir venda
      </Botao>
      {botaoLancar}
    </>
  ) : (
    <>
      <Botao variante="texto" disabled={!online} onClick={() => setConfirmandoEncerrar(true)} className="order-last w-full sm:order-none sm:w-auto">
        Encerrar venda
      </Botao>
      <Link to={`/adm/vendas/${venda.id}/editar`} className={cn(estiloDoBotao({ variante: 'secundario' }), 'w-full sm:w-auto')}>
        Editar venda
      </Link>
      {botaoLancar}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ para: '/adm/vendas', rotulo: 'Vendas' }}
        titulo={venda.nome}
        apoio={
          <>
            {encerrada && <Selo>Encerrada</Selo>}
            <span>{descricaoDaVenda(venda)}</span>
          </>
        }
        acoes={acoes}
      />
      {encerrada && <p className="text-base text-texto-2">Esta venda foi encerrada. Os pedidos continuam aqui e os resumos podem ser baixados. Para lançar novos pedidos, reabra a venda.</p>}
      {semProduto && !encerrada && (
        <p className="text-base text-texto-2">
          Falta cadastrar os produtos. Para lançar pedidos, a venda precisa de ao menos um produto com preço: use Editar venda.
        </p>
      )}
      {!online && <p className="text-sm text-texto-2">{encerrada ? SEM_INTERNET_REABRIR : SEM_INTERNET_ENCERRAR}</p>}
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}

      {consultaPainel.data && <NumerosDaVenda painel={consultaPainel.data} />}
      {consultaPainel.isError && <ErroDeCarga erro={consultaPainel.error} aoTentarDeNovo={() => void consultaPainel.refetch()} />}
      {consultaPainel.isPending && <Carregando rotulo="Carregando os números" />}

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <PedidosDaVenda venda={venda} painel={consultaPainel.data} aoLancar={botaoLancar} />
        {consultaPainel.data && consultaPainel.data.porUnidade.length > 0 && <UnidadesVendidasPorUnidade painel={consultaPainel.data} />}
      </div>

      <Confirmacao
        aberta={confirmandoEncerrar}
        titulo="Encerrar esta venda?"
        rotuloConfirmar="Encerrar venda"
        rotuloCancelar="Voltar"
        ocupada={encerrar.isPending}
        erro={erro}
        aoConfirmar={() => void gravar(() => encerrar.mutateAsync(venda.id))}
        aoCancelar={() => setConfirmandoEncerrar(false)}
      >
        Depois de encerrada, a venda não recebe pedidos nem mudanças. Os pedidos continuam visíveis e você pode reabri-la quando quiser.
      </Confirmacao>
    </div>
  )
}
