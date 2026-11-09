import { PedidoEdicao, PedidoEntrada, QUANTIDADE_MAXIMA_POR_ITEM, rotuloDaSituacao } from '@desbravadores/shared'
import type { FormaDoPedido } from '@desbravadores/shared'
import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useUnidades } from '../../api/leitura'
import { useEditarPedido, useLancarPedido } from '../../api/vendas'
import type { Pedido, Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { CampoComPasso } from '../../ui/CampoComPasso'
import { AreaTexto } from '../../ui/AreaTexto'
import { Cartao } from '../../ui/Cartao'
import { EscolhaUnica } from '../../ui/EscolhaUnica'
import { ResumoDosErros, useErrosAVista } from '../../ui/ErrosDoFormulario'
import { Selecao } from '../../ui/Selecao'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { formasAceitasPela, opcoesDeForma } from './DialogoPagarPedido'
import { formatarReais, formatarReaisComCentavos } from './formatos'
import { ResumoAoVivo } from './ResumoAoVivo'

const SEM_INTERNET = 'Salvar o pedido precisa de internet. Conecte-se para continuar.'
const PEDIDO_PAGO = 'Pedido já pago. Desmarque o pagamento para mudar o valor.'
const SEM_FORMA = 'Escolha a forma de pagamento.'
const QUANTIDADE_INVALIDA = 'Use só números inteiros, como 2'
const DIRETORIA = 'DIRETORIA'

type Recebimento = 'RETIRADA' | 'ENTREGA'
type Pagamento = 'PAGO' | 'A_PAGAR'

const apenasDigitos = /^\d+$/
const quantidadeDe = (texto: string): number => (apenasDigitos.test(texto.trim()) ? Number(texto.trim()) : 0)

interface LinhaDeProduto {
  produtoId: string
  nome: string
  nomeCurto: string
  preco: number
}

/** Produtos ativos da venda; o pedido existente mantém também os que foram desativados depois, para não perdê-los ao salvar. */
function linhasDoPedido(venda: Venda, pedido?: Pedido): LinhaDeProduto[] {
  // Item que voltou de zero é item novo: vale o preço de agora, como a API grava (D14).
  const doPedido = new Map((pedido?.itens ?? []).filter((item) => item.quantidade > 0).map((item) => [item.produtoId, item]))
  return venda.produtos
    .filter((produto) => produto.ativo || doPedido.has(produto.id))
    .map((produto) => ({ produtoId: produto.id, nome: produto.nome, nomeCurto: produto.nomeCurto, preco: doPedido.get(produto.id)?.precoGravado ?? produto.preco }))
}

const unidadeInicial = (pedido?: Pedido): string => (pedido?.daDiretoria ? DIRETORIA : (pedido?.unidadeId ?? ''))

interface Propriedades {
  venda: Venda
  /** Ausente: pedido novo. */
  pedido?: Pedido
  voltar: string
  aoConcluir: (pedido: Pedido) => void
}

export function FormularioPedido({ venda, pedido, voltar, aoConcluir }: Propriedades) {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const unidades = useUnidades()
  const linhas = linhasDoPedido(venda, pedido)
  const aceitas = formasAceitasPela(venda)
  const editando = pedido !== undefined
  const bloqueado = pedido?.pago === true

  const [comprador, setComprador] = useState(pedido?.comprador ?? '')
  const [vendedor, setVendedor] = useState(pedido?.vendedor ?? '')
  const [unidade, setUnidade] = useState(unidadeInicial(pedido))
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() => Object.fromEntries((pedido?.itens ?? []).map((item) => [item.produtoId, String(item.quantidade)])))
  const [recebimento, setRecebimento] = useState<Recebimento>(pedido?.entrega ? 'ENTREGA' : 'RETIRADA')
  const [endereco, setEndereco] = useState(pedido?.endereco ?? '')
  const [pagamento, setPagamento] = useState<Pagamento>('A_PAGAR')
  const [forma, setForma] = useState<FormaDoPedido | null>(null)
  const [observacao, setObservacao] = useState(pedido?.observacao ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const { formulario, pendencias } = useErrosAVista(erros)
  const lancar = useLancarPedido()
  const editar = useEditarPedido()
  const salvando = lancar.isPending || editar.isPending

  const entrega = recebimento === 'ENTREGA'
  // Pedido que já era entrega guarda a taxa do dia em que foi lançado; trocar de retirada para entrega pega a taxa de agora.
  const taxaEntrega = pedido?.entrega ? pedido.taxaEntrega : venda.taxaEntrega
  const pago = !editando && pagamento === 'PAGO'
  const situacao = editando ? null : pago ? rotuloDaSituacao('PAGO', forma) : null
  const quantidadeDaLinha = (linha: LinhaDeProduto): number => quantidadeDe(quantidades[linha.produtoId] ?? '0')

  const opcoesDeUnidade = (() => {
    const ativas = unidades.data ?? []
    const dela = pedido?.unidadeId && !ativas.some((item) => item.id === pedido.unidadeId) ? [{ id: pedido.unidadeId, nome: `${pedido.unidadeNome ?? 'Unidade'} (inativa)` }] : []
    return [...ativas.map((item) => ({ id: item.id, nome: item.nome })), ...dela]
  })()

  function montarDados() {
    const itens = linhas.map((linha) => ({ produtoId: linha.produtoId, quantidade: quantidadeDaLinha(linha) })).filter((item) => item.quantidade > 0)
    const dados = {
      comprador: comprador.trim(),
      vendedor: vendedor.trim() || null,
      unidadeId: unidade === DIRETORIA ? null : unidade || null,
      daDiretoria: unidade === DIRETORIA,
      entrega,
      endereco: entrega ? endereco.trim() || null : null,
      observacao: observacao.trim() || null,
      itens,
    }
    return dados
  }

  /** O erro de um item sai na linha do produto; o resto, no campo de mesmo nome. */
  function chaveDoErro(caminho: readonly PropertyKey[], itens: { produtoId: string }[]): string {
    const [campo, indice] = caminho
    if (campo === 'itens' && typeof indice === 'number' && itens[indice]) return `item.${itens[indice].produtoId}`
    return String(campo)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErroGeral(null)
    const dados = montarDados()
    const entradaNova = { ...dados, pago, forma: pago ? forma : null }
    const lido = editando ? PedidoEdicao.safeParse(dados) : PedidoEntrada.safeParse(entradaNova)
    const encontrados: Record<string, string> = {}
    if (!lido.success) {
      for (const problema of lido.error.issues) {
        const chave = chaveDoErro(problema.path, dados.itens)
        if (!(chave in encontrados)) encontrados[chave] = problema.message
      }
    }
    for (const linha of linhas) {
      if (!apenasDigitos.test((quantidades[linha.produtoId] ?? '0').trim())) encontrados[`item.${linha.produtoId}`] = QUANTIDADE_INVALIDA
    }
    if (pago && forma === null) encontrados['forma'] = SEM_FORMA
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return

    try {
      const gravado = pedido
        ? await editar.mutateAsync({ vendaId: venda.id, pedidoId: pedido.id, entrada: dados })
        : await lancar.mutateAsync({ vendaId: venda.id, entrada: entradaNova })
      aoConcluir(gravado)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(Object.fromEntries(Object.entries(campos).map(([campo, mensagem]) => [campo.startsWith('itens.') ? 'itens' : campo, mensagem])))
      setErroGeral(geral)
    }
  }

  return (
    <form ref={formulario} noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <ResumoDosErros pendencias={pendencias} />
      <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-6">
        <Cartao className="flex flex-col gap-6 p-6">
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Comprador" value={comprador} erro={erros['comprador']} onChange={(evento) => setComprador(evento.target.value)} />
            <Campo rotulo="Vendedor" ajuda={'Quem vendeu. Pode ser um nome ou "WhatsApp".'} value={vendedor} erro={erros['vendedor']} onChange={(evento) => setVendedor(evento.target.value)} />
          </div>
          <div className="max-w-[calc(50%-0.5rem)]">
            <Selecao rotulo="Unidade do vendedor" ajuda="Opcional. Entra na soma por unidade do painel." value={unidade} erro={erros['unidadeId']} onChange={(evento) => setUnidade(evento.target.value)}>
              <option value="">Sem unidade</option>
              <option value={DIRETORIA}>Diretoria</option>
              {opcoesDeUnidade.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>
                  {opcao.nome}
                </option>
              ))}
            </Selecao>
          </div>

          <fieldset id="grupo-itens" data-com-erro={erros['itens'] ? '' : undefined} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 text-sm font-semibold text-texto">Quantidade</legend>
            {bloqueado && <p className="text-sm text-texto-2">{PEDIDO_PAGO}</p>}
            <div className="flex flex-col divide-y divide-borda-controle rounded-controle border border-borda-controle px-4 py-1">
              {linhas.map((linha) =>
                bloqueado ? (
                  <p key={linha.produtoId} className="flex justify-between gap-3 py-3 text-base text-texto">
                    <span>{linha.nome}</span>
                    <b className="tabular-nums">{quantidadeDaLinha(linha)}</b>
                  </p>
                ) : (
                  <div key={linha.produtoId} className="py-3">
                    <CampoComPasso
                      rotulo={linha.nome}
                      ajuda={`${formatarReaisComCentavos(linha.preco)} cada`}
                      unidade={linha.nomeCurto}
                      minimo={0}
                      maximo={QUANTIDADE_MAXIMA_POR_ITEM}
                      valor={quantidades[linha.produtoId] ?? '0'}
                      erro={erros[`item.${linha.produtoId}`]}
                      aoMudar={(valor) => setQuantidades((atuais) => ({ ...atuais, [linha.produtoId]: valor }))}
                    />
                  </div>
                ),
              )}
            </div>
            {erros['itens'] && (
              <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-perigo">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {erros['itens']}
              </p>
            )}
          </fieldset>

          <EscolhaUnica
            legenda="Como recebe"
            opcoes={[
              { valor: 'RETIRADA', rotulo: 'Retirada' },
              { valor: 'ENTREGA', rotulo: `Entrega +${formatarReais(taxaEntrega)}` },
            ]}
            valor={recebimento}
            aoEscolher={setRecebimento}
            disabled={bloqueado}
            ajuda={bloqueado ? PEDIDO_PAGO : undefined}
          />
          {entrega && <Campo rotulo="Endereço da entrega" value={endereco} erro={erros['endereco']} onChange={(evento) => setEndereco(evento.target.value)} />}

          {!editando && (
            <>
              <EscolhaUnica
                legenda="Pagamento"
                opcoes={[
                  { valor: 'PAGO', rotulo: 'Pago' },
                  { valor: 'A_PAGAR', rotulo: 'A pagar' },
                ]}
                valor={pagamento}
                aoEscolher={setPagamento}
              />
              {pago && <EscolhaUnica legenda="Forma de pagamento" opcoes={opcoesDeForma(aceitas)} valor={forma} aoEscolher={setForma} erro={erros['forma']} id="grupo-forma" />}
            </>
          )}

          <AreaTexto rotulo="Observação" placeholder="Ex.: sem queijo, deixar na geladeira da igreja" rows={2} value={observacao} erro={erros['observacao']} onChange={(evento) => setObservacao(evento.target.value)} />
        </Cartao>

        <ResumoAoVivo
          itens={linhas.map((linha) => ({ produtoId: linha.produtoId, nomeCurto: linha.nomeCurto, quantidade: quantidadeDaLinha(linha), precoGravado: linha.preco }))}
          entrega={entrega}
          taxaEntrega={taxaEntrega}
          pago={situacao}
        />
      </div>

      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <Link to={voltar} className={estiloDoBotao({ variante: 'secundario' })}>
            Voltar
          </Link>
          <Botao type="submit" carregando={salvando} disabled={!online}>
            {editando ? 'Salvar alterações' : 'Salvar e ver resumo'}
          </Botao>
        </div>
        {!online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
      </div>
    </form>
  )
}
