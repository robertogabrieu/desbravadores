import { rotuloDaSituacao, situacaoDoPedido } from '@desbravadores/shared'
import type { FormaDoPedido } from '@desbravadores/shared'
import { Download, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCancelarPedido, useDesentregarPedido, useDespagarPedido, useEntregarPedido, usePagarPedido, usePedido, useReativarPedido, useVenda } from '../../api/vendas'
import type { Pedido, Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { CabecalhoDaPagina } from '../../ui/CabecalhoDaPagina'
import { Cartao } from '../../ui/Cartao'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../ui/EstadoNaoEncontrado'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selo } from '../../ui/Selo'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { DialogoCancelarPedido } from './DialogoCancelarPedido'
import { DialogoPagarPedido, formasAceitasPela } from './DialogoPagarPedido'
import { diaEHora } from '../progresso/formatos'
import { arquivoDaImagem, baixarImagem, compartilharImagem, nomeDoArquivoDoPedido, podeCompartilhar } from './imagem/compartilhar'
import { desenharImagem } from './imagem/desenharImagem'
import { montarImagemDoPedido } from './imagem/montarImagemDoPedido'
import { situacaoDaEntrega } from './formatos'

const SEM_INTERNET = 'Marcar pago, entregue, cancelar e editar precisam de internet. Conecte-se para continuar.'
const VENDA_ENCERRADA = 'Esta venda foi encerrada. Reabra a venda para alterar o pedido; o resumo continua disponível para baixar.'
const NOTA_COM_COMPARTILHAR = 'Compartilhar abre os aplicativos do seu aparelho, como o WhatsApp. Se o aparelho não permitir, use Baixar.'
const NOTA_SEM_COMPARTILHAR = 'Baixe a imagem e envie pelo WhatsApp ou por outro aplicativo. Neste aparelho o compartilhamento direto não está disponível.'

type ImagemDoPedido =
  | { situacao: 'preparando' }
  | { situacao: 'falhou' }
  | { situacao: 'pronta'; venda: Venda; pedido: Pedido; arquivo: File; endereco: string }

/**
 * Desenha a imagem no navegador sempre que o pedido ou a venda mudam. Enquanto a nova não fica pronta
 * a anterior continua na tela, mas sem valer para baixar ou compartilhar.
 */
function useImagemDoPedido(venda: Venda, pedido: Pedido, nomeDoClube: string) {
  const [imagem, setImagem] = useState<ImagemDoPedido>({ situacao: 'preparando' })
  const [tentativa, setTentativa] = useState(0)
  const enderecoAtual = useRef<string | null>(null)

  useEffect(() => {
    let vigente = true
    setImagem((anterior) => (anterior.situacao === 'pronta' ? anterior : { situacao: 'preparando' }))
    desenharImagem(montarImagemDoPedido(venda, pedido, nomeDoClube))
      .then((blob) => {
        if (!vigente) return
        if (enderecoAtual.current) URL.revokeObjectURL(enderecoAtual.current)
        const endereco = URL.createObjectURL(blob)
        enderecoAtual.current = endereco
        setImagem({ situacao: 'pronta', venda, pedido, endereco, arquivo: arquivoDaImagem(blob, nomeDoArquivoDoPedido(pedido.codigo, pedido.comprador)) })
      })
      .catch(() => {
        if (vigente) setImagem({ situacao: 'falhou' })
      })
    return () => {
      vigente = false
    }
  }, [venda, pedido, nomeDoClube, tentativa])

  useEffect(
    () => () => {
      if (enderecoAtual.current) URL.revokeObjectURL(enderecoAtual.current)
    },
    [],
  )

  const valida = imagem.situacao === 'pronta' && imagem.venda === venda && imagem.pedido === pedido
  return { imagem, pronta: valida ? imagem : null, tentarDeNovo: () => setTentativa((n) => n + 1) }
}

function Previa({ pedido, imagem, aoTentarDeNovo }: { pedido: Pedido; imagem: ImagemDoPedido; aoTentarDeNovo: () => void }) {
  if (imagem.situacao === 'pronta') {
    return <img src={imagem.endereco} alt={`Resumo do pedido ${pedido.codigo} de ${pedido.comprador}`} className="w-full rounded-cartao border border-borda-controle" />
  }
  if (imagem.situacao === 'falhou') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-base font-semibold text-perigo">Não foi possível preparar a imagem.</p>
        <Botao variante="secundario" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      </div>
    )
  }
  return <Carregando rotulo="Preparando a imagem" />
}

function LinhaDaSituacao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-base text-texto">
      <span>{rotulo}</span>
      {children}
    </div>
  )
}

function ResumoDoPedido({ venda, pedido }: { venda: Venda; pedido: Pedido }) {
  const { modo } = useConexao()
  const { vinculoAtivo } = useSessao()
  const online = modo === 'ONLINE'
  const { imagem, pronta, tentarDeNovo } = useImagemDoPedido(venda, pedido, vinculoAtivo?.clube.nome ?? '')
  const pagar = usePagarPedido()
  const despagar = useDespagarPedido()
  const entregar = useEntregarPedido()
  const desentregar = useDesentregarPedido()
  const cancelar = useCancelarPedido()
  const reativar = useReativarPedido()
  const [pagando, setPagando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const encerrada = venda.encerradaEm !== null
  const cancelado = pedido.canceladoEm !== null
  const situacao = situacaoDoPedido(pedido)
  const ocupado = [pagar, despagar, entregar, desentregar, cancelar, reativar].some((escrita) => escrita.isPending)
  const desligada = !online || ocupado
  const ids = { vendaId: venda.id, pedidoId: pedido.id }
  const compartilhavel = podeCompartilhar(new File([], 'pedido.png', { type: 'image/png' }))
  const entrega = pedido.entrega ? 'entrega' : 'retirada'
  const entregue = pedido.entrega ? 'entregue' : 'retirado'

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
    if (await executar(() => pagar.mutateAsync({ ...ids, entrada: { forma } }))) setPagando(false)
  }

  async function confirmarCancelamento() {
    if (await executar(() => cancelar.mutateAsync(ids))) setCancelando(false)
  }

  async function compartilhar() {
    if (!pronta) return
    try {
      await compartilharImagem(pronta.arquivo, `Pedido ${pedido.codigo}`)
    } catch {
      setErro('Não foi possível compartilhar. Use Baixar imagem.')
    }
  }

  const acoesDeEscrita = cancelado ? (
    <Botao variante="secundario" disabled={desligada} onClick={() => void executar(() => reativar.mutateAsync(ids))}>
      Reativar pedido
    </Botao>
  ) : (
    <>
      {pedido.pago ? (
        <Botao variante="secundario" disabled={desligada} onClick={() => void executar(() => despagar.mutateAsync(ids))}>
          Desmarcar pago
        </Botao>
      ) : (
        <Botao
          variante="secundario"
          disabled={desligada}
          onClick={() => {
            setErro(null)
            setPagando(true)
          }}
        >
          Marcar como pago
        </Botao>
      )}
      {pedido.entregueEm ? (
        <Botao variante="secundario" disabled={desligada} onClick={() => void executar(() => desentregar.mutateAsync(ids))}>
          Desmarcar {entrega}
        </Botao>
      ) : (
        <Botao variante="secundario" disabled={desligada} onClick={() => void executar(() => entregar.mutateAsync(ids))}>
          Marcar como {entregue}
        </Botao>
      )}
    </>
  )

  const editar = `/adm/vendas/${venda.id}/pedidos/${pedido.id}/editar`
  const outrasAcoes = !cancelado && (
    <div className="flex flex-wrap items-center gap-2">
      {online ? (
        <Link to={editar} className={estiloDoBotao({ variante: 'texto' })}>
          Editar pedido
        </Link>
      ) : (
        <Botao variante="texto" disabled>
          Editar pedido
        </Botao>
      )}
      {!pedido.entregueEm && (
        <Botao
          variante="texto"
          className="text-perigo"
          disabled={desligada}
          onClick={() => {
            setErro(null)
            setCancelando(true)
          }}
        >
          Cancelar pedido
        </Botao>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ para: `/adm/vendas/${venda.id}`, rotulo: venda.nome }}
        titulo={`Pedido ${pedido.codigo}`}
        apoio={
          <>
            {cancelado && <Selo>Cancelado</Selo>}
            {encerrada && <Selo>Encerrada</Selo>}
            <span>
              {pedido.comprador} · lançado em {diaEHora(pedido.criadoEm)}
            </span>
          </>
        }
      />
      <div className="flex flex-wrap items-start gap-8">
        <div className="w-full max-w-md min-w-72 flex-1">
          <Previa pedido={pedido} imagem={imagem} aoTentarDeNovo={tentarDeNovo} />
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-96 lg:shrink-0">
          <Cartao className="flex flex-col gap-3 p-5">
            <h2 className="font-titulo text-lg font-bold text-texto">Enviar ao comprador</h2>
            <Botao disabled={!pronta} onClick={() => pronta && baixarImagem(pronta.arquivo)}>
              <Download aria-hidden className="size-5" />
              Baixar imagem
            </Botao>
            {compartilhavel && (
              <Botao variante="secundario" disabled={!pronta} onClick={() => void compartilhar()}>
                <Share2 aria-hidden className="size-5" />
                Compartilhar
              </Botao>
            )}
            <p className="text-sm text-texto-2">{compartilhavel ? NOTA_COM_COMPARTILHAR : NOTA_SEM_COMPARTILHAR}</p>
          </Cartao>

          <Cartao className="flex flex-col gap-3 p-5">
            <h2 className="font-titulo text-lg font-bold text-texto">Situação</h2>
            {cancelado ? (
              <LinhaDaSituacao rotulo="Pedido">
                <Selo>Cancelado</Selo>
              </LinhaDaSituacao>
            ) : (
              <>
                <LinhaDaSituacao rotulo="Pagamento">
                  <Selo tom={situacao === 'PAGO' ? 'sucesso' : 'alerta'}>{rotuloDaSituacao(situacao, pedido.forma)}</Selo>
                </LinhaDaSituacao>
                <LinhaDaSituacao rotulo={pedido.entrega ? 'Entrega' : 'Retirada'}>
                  <span className="font-semibold">{situacaoDaEntrega(pedido)}</span>
                </LinhaDaSituacao>
              </>
            )}
            {encerrada ? <p className="text-sm text-texto-2">{VENDA_ENCERRADA}</p> : acoesDeEscrita}
            {!encerrada && !online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
            {erro && (
              <p role="alert" className="text-sm font-medium text-perigo">
                {erro}
              </p>
            )}
          </Cartao>

          {!encerrada && outrasAcoes}
        </aside>
      </div>

      <DialogoPagarPedido aberto={pagando} formas={formasAceitasPela(venda)} ocupado={pagar.isPending} erro={erro} aoConfirmar={(forma) => void confirmarPagamento(forma)} aoCancelar={() => setPagando(false)} />
      <DialogoCancelarPedido
        aberto={cancelando}
        codigo={pedido.codigo}
        comprador={pedido.comprador}
        ocupado={cancelar.isPending}
        erro={erro}
        aoConfirmar={() => void confirmarCancelamento()}
        aoCancelar={() => setCancelando(false)}
      />
    </div>
  )
}

export function TelaResumoDoPedido() {
  const { id = '', pedidoId = '' } = useParams()
  const consultaVenda = useVenda(id)
  const consultaPedido = usePedido(id, pedidoId)
  const venda = consultaVenda.data
  const pedido = consultaPedido.data

  if (venda && pedido) return <ResumoDoPedido venda={venda} pedido={pedido} />
  const falha = consultaVenda.isError ? consultaVenda : consultaPedido.isError ? consultaPedido : null
  if (falha && ehNaoEncontrado(falha.error)) return <EstadoNaoEncontrado registro="o pedido" lista={{ para: `/adm/vendas/${id}`, rotulo: 'Ver a venda' }} />
  if (falha) return <ErroDeCarga erro={falha.error} aoTentarDeNovo={() => void falha.refetch()} />
  return <Carregando rotulo="Carregando o pedido" />
}
