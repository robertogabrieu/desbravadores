import { MapPin, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useVendas } from '../../api/vendas'
import type { ResumoDeVenda } from '../../api/vendas'
import { estiloDoBotao } from '../../ui/Botao'
import { cn } from '../../ui/cn'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selo } from '../../ui/Selo'
import { descricaoDaRetirada, formatarReais } from './formatos'

const plural = (quantidade: number, singular: string, muitos: string): string => (quantidade === 1 ? singular : muitos)

const resumoDaLista = (vendas: ResumoDeVenda[]): string => {
  const abertas = vendas.filter((venda) => !venda.encerradaEm).length
  const andamento = abertas === 0 ? 'nenhuma em andamento' : `${abertas} em andamento`
  return `${vendas.length} ${plural(vendas.length, 'venda', 'vendas')} · ${andamento}`
}

const BotaoNovaVenda = () => (
  <Link to="/adm/vendas/nova" className={estiloDoBotao()}>
    <Plus aria-hidden className="size-5" />
    Nova venda
  </Link>
)

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex flex-col">
      <b className="font-titulo text-2xl text-texto tabular-nums">{valor}</b>
      <span className="text-sm text-texto-2">{rotulo}</span>
    </div>
  )
}

/** O cartão inteiro abre a venda; a encerrada fica mais clara e sem "a receber", que já não muda. */
function CartaoDaVenda({ venda }: { venda: ResumoDeVenda }) {
  const encerrada = venda.encerradaEm !== null
  const retirada = descricaoDaRetirada(venda)
  return (
    <Link
      to={`/adm/vendas/${venda.id}`}
      className={cn(
        'flex flex-col gap-3.5 rounded-cartao border border-borda-controle px-6 py-5 hover:border-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
        encerrada ? 'bg-superficie-suave' : 'bg-superficie',
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <h2 className="font-titulo text-xl font-bold text-texto">{venda.nome}</h2>
        <Selo tom={encerrada ? 'neutro' : 'sucesso'}>{encerrada ? 'Encerrada' : 'Em andamento'}</Selo>
      </span>
      {retirada && (
        <span className="flex items-center gap-2 text-base text-texto-2">
          <MapPin aria-hidden className="size-[18px] shrink-0" />
          {retirada}
        </span>
      )}
      <span className="flex flex-wrap gap-8">
        <Numero valor={String(venda.pedidos)} rotulo={plural(venda.pedidos, 'pedido', 'pedidos')} />
        <Numero valor={String(venda.unidadesVendidas)} rotulo={plural(venda.unidadesVendidas, 'unidade', 'unidades')} />
        <Numero valor={formatarReais(venda.recebido)} rotulo="recebido" />
        {!encerrada && <Numero valor={formatarReais(venda.vendido - venda.recebido)} rotulo="a receber" />}
      </span>
    </Link>
  )
}

export function TelaVendas() {
  const consulta = useVendas()
  const vendas = consulta.data?.vendas
  const abertas = vendas?.filter((venda) => !venda.encerradaEm) ?? []
  const encerradas = vendas?.filter((venda) => venda.encerradaEm) ?? []

  const corpo = (() => {
    if (!vendas) {
      return consulta.isError ? <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} /> : <Carregando rotulo="Carregando as vendas" />
    }
    if (vendas.length === 0) {
      return (
        <EstadoVazio
          titulo="Nenhuma venda ainda."
          descricao="Crie uma venda com seus produtos, preços e o local de retirada. Depois é só lançar os pedidos."
          acao={<BotaoNovaVenda />}
        />
      )
    }
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        {abertas.map((venda) => (
          <CartaoDaVenda key={venda.id} venda={venda} />
        ))}
        {encerradas.length > 0 && <h2 className="mt-2 text-sm font-semibold tracking-wide text-texto-2 uppercase">Encerradas</h2>}
        {encerradas.map((venda) => (
          <CartaoDaVenda key={venda.id} venda={venda} />
        ))}
      </div>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Vendas</h1>
          {vendas && vendas.length > 0 && <p className="text-base text-texto-2">{resumoDaLista(vendas)}</p>}
        </div>
        {vendas && vendas.length > 0 && <BotaoNovaVenda />}
      </header>
      {corpo}
    </div>
  )
}
