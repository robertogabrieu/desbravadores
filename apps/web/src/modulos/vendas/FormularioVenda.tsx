import { TIPOS_DE_FORMA_DA_VENDA, VendaEntrada, rotuloDaForma } from '@desbravadores/shared'
import type { TipoDeFormaDaVenda } from '@desbravadores/shared'
import { CircleAlert, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCriarVenda, useEditarVenda } from '../../api/vendas'
import type { Venda } from '../../api/vendas'
import { useConexao } from '../../offline'
import { AreaTexto } from '../../ui/AreaTexto'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { CaixaMarcacao } from '../../ui/CaixaMarcacao'
import { Campo } from '../../ui/Campo'
import { CampoData } from '../../ui/CampoData'
import { Cartao } from '../../ui/Cartao'
import { ResumoDosErros, useErrosAVista } from '../../ui/ErrosDoFormulario'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { centavosParaTexto, reaisParaCentavos } from './formatos'

const SEM_INTERNET = 'Salvar a venda precisa de internet. Conecte-se para continuar.'
const NAO_E_DINHEIRO = 'Use só números, como 25,00'

interface LinhaDeProduto {
  /** Identifica a linha na tela; o `id` do produto só existe para o que o servidor já conhece. */
  chave: number
  id?: string
  nome: string
  nomeCurto: string
  preco: string
}

interface EstadoDaForma {
  marcada: boolean
  id?: string
  chave: string
  favorecido: string
  orientacao: string
}

type Formas = Record<TipoDeFormaDaVenda, EstadoDaForma>

const FORMA_VAZIA: EstadoDaForma = { marcada: false, chave: '', favorecido: '', orientacao: '' }

function formasIniciais(venda?: Venda): Formas {
  const estado = { PIX: FORMA_VAZIA, SETE_ME: FORMA_VAZIA, DINHEIRO: FORMA_VAZIA }
  for (const forma of venda?.formas ?? []) {
    const dados = forma.tipo === 'PIX' ? { chave: forma.chave, favorecido: forma.favorecido } : forma.tipo === 'SETE_ME' ? { orientacao: forma.orientacao } : {}
    estado[forma.tipo] = { ...FORMA_VAZIA, ...dados, id: forma.id, marcada: forma.ativo }
  }
  return estado
}

/** Os erros do formulário usam chaves estáveis: `produto.<chave da linha>.<campo>` e `forma.<tipo>.<campo>`. */
function chaveDoErro(caminho: readonly PropertyKey[], produtos: LinhaDeProduto[], formas: VendaEntrada['formas']): string {
  const [grupo, indice, campo] = caminho
  if (typeof indice !== 'number') return String(grupo)
  if (grupo === 'produtos') return `produto.${produtos[indice]?.chave}.${String(campo)}`
  if (grupo === 'formas') return `forma.${formas[indice]?.tipo}.${String(campo)}`
  return String(grupo)
}

interface Propriedades {
  /** Ausente: venda nova. */
  venda?: Venda
  voltar: string
  aoConcluir: (venda: Venda) => void
}

export function FormularioVenda({ venda, voltar, aoConcluir }: Propriedades) {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const proximaChave = useRef(0)
  const novaLinha = (dados: Partial<LinhaDeProduto> = {}): LinhaDeProduto => ({ chave: proximaChave.current++, nome: '', nomeCurto: '', preco: '', ...dados })

  const [nome, setNome] = useState(venda?.nome ?? '')
  const [produtos, setProdutos] = useState<LinhaDeProduto[]>(() =>
    venda ? venda.produtos.filter((produto) => produto.ativo).map((produto) => novaLinha({ id: produto.id, nome: produto.nome, nomeCurto: produto.nomeCurto, preco: centavosParaTexto(produto.preco) })) : [novaLinha()],
  )
  const [taxa, setTaxa] = useState(venda ? centavosParaTexto(venda.taxaEntrega) : '')
  const [formas, setFormas] = useState<Formas>(() => formasIniciais(venda))
  const [retiradaData, setRetiradaData] = useState(venda?.retiradaData ?? '')
  const [retiradaHorario, setRetiradaHorario] = useState(venda?.retiradaHorario ?? '')
  const [retiradaLocal, setRetiradaLocal] = useState(venda?.retiradaLocal ?? '')
  const [instrucoes, setInstrucoes] = useState(venda?.instrucoes ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const { formulario, pendencias } = useErrosAVista(erros)
  const criar = useCriarVenda()
  const editar = useEditarVenda()
  const salvando = criar.isPending || editar.isPending

  const mudarProduto = (chave: number, dados: Partial<LinhaDeProduto>) =>
    setProdutos((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...dados } : linha)))
  const mudarForma = (tipo: TipoDeFormaDaVenda, dados: Partial<EstadoDaForma>) => setFormas((atuais) => ({ ...atuais, [tipo]: { ...atuais[tipo], ...dados } }))

  function montarEntrada(): { entrada: VendaEntrada; errosDeDinheiro: Record<string, string> } {
    const errosDeDinheiro: Record<string, string> = {}
    const taxaEntrega = reaisParaCentavos(taxa)
    if (taxaEntrega === null) errosDeDinheiro['taxaEntrega'] = NAO_E_DINHEIRO
    const entrada: VendaEntrada = {
      nome: nome.trim(),
      taxaEntrega: taxaEntrega ?? 0,
      retiradaData: retiradaData || null,
      retiradaHorario: retiradaHorario.trim() || null,
      retiradaLocal: retiradaLocal.trim() || null,
      instrucoes: instrucoes.trim() || null,
      produtos: produtos.map((linha) => {
        const preco = reaisParaCentavos(linha.preco)
        if (preco === null) errosDeDinheiro[`produto.${linha.chave}.preco`] = NAO_E_DINHEIRO
        return { id: linha.id, nome: linha.nome.trim(), nomeCurto: linha.nomeCurto.trim(), preco: preco ?? 0 }
      }),
      formas: TIPOS_DE_FORMA_DA_VENDA.filter((tipo) => formas[tipo].marcada).map((tipo) => {
        const { id, chave, favorecido, orientacao } = formas[tipo]
        if (tipo === 'PIX') return { id, tipo, chave: chave.trim(), favorecido: favorecido.trim() }
        return tipo === 'SETE_ME' ? { id, tipo, orientacao: orientacao.trim() } : { id, tipo }
      }),
    }
    return { entrada, errosDeDinheiro }
  }

  /** Erros do servidor chegam como `produtos.0.nome`; viram a mesma chave que o contrato gera aqui. */
  function chaveDoCampoDaApi(campo: string, entrada: VendaEntrada): string {
    const caminho = campo.split('.').map((parte) => (/^\d+$/.test(parte) ? Number(parte) : parte))
    return chaveDoErro(caminho, produtos, entrada.formas)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErroGeral(null)
    const { entrada, errosDeDinheiro } = montarEntrada()
    const lido = VendaEntrada.safeParse(entrada)
    const doContrato: Record<string, string> = {}
    if (!lido.success) {
      for (const problema of lido.error.issues) {
        const chave = chaveDoErro(problema.path, produtos, entrada.formas)
        if (!(chave in doContrato)) doContrato[chave] = problema.message
      }
    }
    const encontrados = { ...doContrato, ...errosDeDinheiro }
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return

    try {
      const gravada = venda ? await editar.mutateAsync({ vendaId: venda.id, entrada }) : await criar.mutateAsync(entrada)
      aoConcluir(gravada)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(Object.fromEntries(Object.entries(campos).map(([campo, mensagem]) => [chaveDoCampoDaApi(campo, entrada), mensagem])))
      setErroGeral(geral)
    }
  }

  const aoRemover = venda ? 'Remover tira o produto da venda; os pedidos antigos o mantêm.' : undefined

  return (
    <form ref={formulario} noValidate onSubmit={(evento) => void enviar(evento)} className="flex max-w-3xl flex-col gap-4">
      <ResumoDosErros pendencias={pendencias} />
      <Cartao className="flex flex-col gap-6 p-6">
        <Campo rotulo="Nome da venda" value={nome} erro={erros['nome']} onChange={(evento) => setNome(evento.target.value)} />

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" id="grupo-produtos" data-com-erro={erros['produtos'] ? '' : undefined}>
          <legend className="mb-1.5 text-sm font-semibold text-texto">Produtos e preços</legend>
          {aoRemover && <p className="text-sm text-texto-2">{aoRemover}</p>}
          {produtos.map((linha, posicao) => (
            <div key={linha.chave} className="grid grid-cols-[1fr_10rem_9rem_auto] items-start gap-3 rounded-controle border border-divisor p-3">
              <Campo rotulo={`Nome do produto ${posicao + 1}`} value={linha.nome} erro={erros[`produto.${linha.chave}.nome`]} onChange={(evento) => mudarProduto(linha.chave, { nome: evento.target.value })} />
              <Campo rotulo={`Nome curto do produto ${posicao + 1}`} value={linha.nomeCurto} erro={erros[`produto.${linha.chave}.nomeCurto`]} onChange={(evento) => mudarProduto(linha.chave, { nomeCurto: evento.target.value })} />
              <Campo
                rotulo={`Preço do produto ${posicao + 1} (R$)`}
                inputMode="decimal"
                placeholder="0,00"
                value={linha.preco}
                erro={erros[`produto.${linha.chave}.preco`]}
                onChange={(evento) => mudarProduto(linha.chave, { preco: evento.target.value })}
              />
              <button
                type="button"
                aria-label={`Remover produto ${posicao + 1}`}
                onClick={() => setProdutos((atuais) => atuais.filter((outra) => outra.chave !== linha.chave))}
                className="mt-6 flex size-[var(--touch-min)] items-center justify-center rounded-botao text-texto-2 hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          ))}
          {erros['produtos'] && <ErroDoGrupo mensagem={erros['produtos']} />}
          <Botao variante="secundario" className="self-start" onClick={() => setProdutos((atuais) => [...atuais, novaLinha()])}>
            <Plus aria-hidden className="size-5" />
            Adicionar produto
          </Botao>
        </fieldset>

        <div className="max-w-xs">
          <Campo
            rotulo="Taxa de entrega (R$)"
            inputMode="decimal"
            placeholder="0,00"
            ajuda="Somada ao pedido que for entregue. Deixe 0 se não houver entrega."
            value={taxa}
            erro={erros['taxaEntrega']}
            onChange={(evento) => setTaxa(evento.target.value)}
          />
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" id="grupo-formas" data-com-erro={erros['formas'] ? '' : undefined}>
          <legend className="mb-1.5 text-sm font-semibold text-texto">Formas de pagamento aceitas</legend>
          <div className="flex flex-col divide-y divide-divisor rounded-controle border border-divisor px-4">
            {TIPOS_DE_FORMA_DA_VENDA.map((tipo) => (
              <CampoDaForma key={tipo} tipo={tipo} forma={formas[tipo]} erros={erros} aoMudar={(dados) => mudarForma(tipo, dados)} />
            ))}
          </div>
          {erros['formas'] && <ErroDoGrupo mensagem={erros['formas']} />}
          <p className="text-sm text-texto-2">Aparecem na imagem dos pedidos que ainda não foram pagos. Ao lançar um pedido, só estas formas podem ser escolhidas.</p>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1.5 text-sm font-semibold text-texto">Retirada</legend>
          <div className="grid grid-cols-2 gap-4">
            <CampoData rotulo="Data da retirada" value={retiradaData} onChange={setRetiradaData} erro={erros['retiradaData']} />
            <Campo rotulo="Horário da retirada" placeholder="9h às 12h" value={retiradaHorario} erro={erros['retiradaHorario']} onChange={(evento) => setRetiradaHorario(evento.target.value)} />
          </div>
          <Campo
            rotulo="Local da retirada"
            ajuda={'Sai na imagem do pedido, no lugar de "Entrega" quando o comprador vai buscar.'}
            value={retiradaLocal}
            erro={erros['retiradaLocal']}
            onChange={(evento) => setRetiradaLocal(evento.target.value)}
          />
        </fieldset>

        <AreaTexto
          rotulo="Instruções de consumo"
          ajuda="Sai na imagem de todos os pedidos desta venda."
          value={instrucoes}
          erro={erros['instrucoes']}
          onChange={(evento) => setInstrucoes(evento.target.value)}
        />
        {venda && <p className="text-sm text-texto-2">Pedidos já lançados guardam o preço do dia: mudar o preço ou a taxa vale só para os próximos.</p>}
      </Cartao>

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
            {venda ? 'Salvar alterações' : 'Salvar venda'}
          </Botao>
        </div>
        {!online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
      </div>
    </form>
  )
}

function ErroDoGrupo({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-perigo">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {mensagem}
    </p>
  )
}

interface PropriedadesDaForma {
  tipo: TipoDeFormaDaVenda
  forma: EstadoDaForma
  erros: Record<string, string>
  aoMudar: (dados: Partial<EstadoDaForma>) => void
}

/** Uma forma de pagamento: a caixa a liga e, ligada, pede os dados que vão na imagem do pedido. */
function CampoDaForma({ tipo, forma, erros, aoMudar }: PropriedadesDaForma) {
  const erroDe = (campo: string) => erros[`forma.${tipo}.${campo}`]
  return (
    <div className="flex flex-col gap-2 py-2">
      <CaixaMarcacao rotulo={rotuloDaForma(tipo)} checked={forma.marcada} onChange={(evento) => aoMudar({ marcada: evento.target.checked })} className="font-semibold" />
      {forma.marcada && tipo === 'PIX' && (
        <div className="grid grid-cols-2 gap-3 pb-2">
          <Campo rotulo="Chave Pix" value={forma.chave} erro={erroDe('chave')} onChange={(evento) => aoMudar({ chave: evento.target.value })} />
          <Campo rotulo="Favorecido" value={forma.favorecido} erro={erroDe('favorecido')} onChange={(evento) => aoMudar({ favorecido: evento.target.value })} />
        </div>
      )}
      {forma.marcada && tipo === 'SETE_ME' && (
        <div className="pb-2">
          <Campo rotulo="Como pagar pelo 7me" value={forma.orientacao} erro={erroDe('orientacao')} onChange={(evento) => aoMudar({ orientacao: evento.target.value })} />
        </div>
      )}
      {forma.marcada && tipo === 'DINHEIRO' && <p className="pb-2 text-sm text-texto-2">Sem dados a informar</p>}
    </div>
  )
}
