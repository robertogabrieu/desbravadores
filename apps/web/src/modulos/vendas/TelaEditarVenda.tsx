import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReabrirVenda, useVenda } from '../../api/vendas'
import type { Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { Botao } from '../../ui/Botao'
import { CabecalhoDaPagina } from '../../ui/CabecalhoDaPagina'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selo } from '../../ui/Selo'
import { FormularioVenda } from './FormularioVenda'

const SEM_INTERNET = 'Reabrir a venda precisa de internet. Conecte-se para continuar.'

/** Venda encerrada é só leitura: o único caminho é reabrir. */
function VendaEncerrada({ venda }: { venda: Venda }) {
  const { modo } = useConexao()
  const reabrir = useReabrirVenda()
  const [erro, setErro] = useState<string | null>(null)
  const online = modo === 'ONLINE'

  async function confirmar() {
    setErro(null)
    try {
      await reabrir.mutateAsync(venda.id)
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col items-center gap-2 rounded-cartao border border-borda-controle bg-superficie">
      <Selo className="mt-8">Encerrada</Selo>
      <EstadoVazio
        titulo="Esta venda foi encerrada."
        descricao="Os pedidos continuam aqui e os resumos podem ser baixados. Para alterar a venda, reabra."
        acao={
          <div className="flex flex-col items-center gap-2">
            <Botao variante="secundario" carregando={reabrir.isPending} disabled={!online} onClick={() => void confirmar()}>
              Reabrir venda
            </Botao>
            {!online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
            {erro && (
              <p role="alert" className="text-sm font-medium text-perigo">
                {erro}
              </p>
            )}
          </div>
        }
      />
    </div>
  )
}

export function TelaEditarVenda() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const consulta = useVenda(id)
  const venda = consulta.data
  const painel = `/adm/vendas/${id}`

  const corpo = (() => {
    if (!venda) {
      if (consulta.isError && ehNaoEncontrado(consulta.error)) return <EstadoNaoEncontrado registro="a venda" lista={{ para: '/adm/vendas', rotulo: 'Ver as vendas' }} />
      return consulta.isError ? <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} /> : <Carregando rotulo="Carregando a venda" />
    }
    if (venda.encerradaEm) return <VendaEncerrada venda={venda} />
    return <FormularioVenda key={venda.id} venda={venda} voltar={painel} aoConcluir={() => void navegar(painel)} />
  })()

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina voltar={{ para: venda ? painel : '/adm/vendas', rotulo: venda?.nome ?? 'Vendas' }} titulo="Editar venda" apoio={venda?.nome} />
      {corpo}
    </div>
  )
}
