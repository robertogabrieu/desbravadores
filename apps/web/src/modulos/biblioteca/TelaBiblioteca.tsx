import { SituacaoDosEmprestimos } from '@desbravadores/shared'
import { ChevronLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { CategoriaBiblioteca, DirecaoNaBiblioteca, ItemBiblioteca, ItemFisico } from '../../api/biblioteca'
import { useBiblioteca, useMoverCategoria, useMoverItem } from '../../api/biblioteca'
import { useEmprestimos } from '../../api/emprestimos'
import { useSessao } from '../../sessao/useSessao'
import { Abas } from '../../ui/Abas'
import type { AbaDefinida } from '../../ui/Abas'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { cn } from '../../ui/cn'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { MenuCabecalho } from '../../ui/MenuCabecalho'
import type { ItemMenu } from '../../ui/MenuCabecalho'
import { AbaEmprestimos } from './AbaEmprestimos'
import { CartaoDoItem } from './CartaoDoItem'
import type { AcoesDeEmprestimo } from './CartaoDoItem'
import { DialogoEmprestar } from './DialogoEmprestar'
import { DialogosDaBiblioteca, mensagemDe } from './DialogosDaBiblioteca'
import type { Acao } from './DialogosDaBiblioteca'

const plural = (quantidade: number, singular: string, muitos: string): string => `${quantidade} ${quantidade === 1 ? singular : muitos}`

/** "A, B e C": a lista de nomes escrita como gente escreve. */
const listaDeNomes = (nomes: string[]): string => (nomes.length < 2 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)

const totalDeItens = (categorias: CategoriaBiblioteca[]): number => categorias.reduce((soma, categoria) => soma + categoria.itens.length, 0)

type TipoDeLivro = ItemBiblioteca['tipo']
type AbaDaBiblioteca = 'digitais' | 'fisicos' | 'emprestimos'

const TIPO_DA_ABA: Record<Exclude<AbaDaBiblioteca, 'emprestimos'>, TipoDeLivro> = { digitais: 'DIGITAL', fisicos: 'FISICO' }
const ID_DO_PAINEL = 'painel-da-biblioteca'

const ABAS_DE_QUEM_LE: AbaDefinida[] = [
  { id: 'digitais', rotulo: 'Digitais' },
  { id: 'fisicos', rotulo: 'Físicos' },
]

/** O selo "N atrasados" da aba Empréstimos vem do total da própria aba, lido mesmo com ela fechada; com 0 a aba fica só com o nome. */
const abasDoAdm = (atrasados: number): AbaDefinida[] => [
  { id: 'digitais', rotulo: 'Livros digitais' },
  { id: 'fisicos', rotulo: 'Livros físicos' },
  { id: 'emprestimos', rotulo: atrasados > 0 ? `Empréstimos · ${plural(atrasados, 'atrasado', 'atrasados')}` : 'Empréstimos' },
]

/** A aba vem de `?aba=`; a de Empréstimos é só de quem gerencia, e qualquer outro valor abre os digitais. */
function abaDoEndereco(parametro: string | null, gerencia: boolean): AbaDaBiblioteca {
  if (parametro === 'fisicos') return 'fisicos'
  if (parametro === 'emprestimos' && gerencia) return 'emprestimos'
  return 'digitais'
}

const semAcento = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Cada categoria com só os itens do tipo, na ordem da estante. */
const categoriasDoTipo = (categorias: CategoriaBiblioteca[], tipo: TipoDeLivro): CategoriaBiblioteca[] =>
  categorias.map((categoria) => ({ ...categoria, itens: categoria.itens.filter((item) => item.tipo === tipo) }))

function resumoDosFisicos(categorias: CategoriaBiblioteca[]): string {
  const livros = categorias.flatMap((categoria) => categoria.itens).filter((item): item is ItemFisico => item.tipo === 'FISICO')
  const disponiveis = livros.reduce((soma, livro) => soma + livro.disponiveis, 0)
  return `${plural(livros.length, 'livro físico', 'livros físicos')} · ${plural(disponiveis, 'exemplar disponível', 'exemplares disponíveis')}`
}

function contagemDaSecao(itens: ItemBiblioteca[], tipo: TipoDeLivro): string {
  if (tipo === 'DIGITAL') return plural(itens.length, 'item', 'itens')
  const exemplares = itens.reduce((soma, item) => soma + (item.tipo === 'FISICO' ? item.total : 0), 0)
  return `${plural(itens.length, 'livro', 'livros')} · ${plural(exemplares, 'exemplar', 'exemplares')}`
}

function resumoDaEstante(categorias: CategoriaBiblioteca[], gerencia: boolean): string {
  const itens = totalDeItens(categorias)
  if (gerencia) return `${plural(categorias.length, 'categoria', 'categorias')} · ${itens === 0 ? 'nenhum item' : plural(itens, 'item', 'itens')}`
  if (itens === 0) return 'Nenhum item ainda'
  return `${plural(categorias.length, 'categoria', 'categorias')} · ${plural(itens, 'item', 'itens')}`
}

function Cabecalho({ gerencia, resumo, children }: { gerencia: boolean; resumo?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {!gerencia && (
          <Link to="/inicio" aria-label="Voltar para o Início" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
            <ChevronLeft aria-hidden className="size-6" />
          </Link>
        )}
        <div className="flex flex-col">
          <h1 className={cn('font-titulo text-2xl text-texto', gerencia ? 'font-bold' : 'font-extrabold')}>Biblioteca</h1>
          {resumo && <p className="text-base text-texto-2">{resumo}</p>}
        </div>
      </div>
      {children}
    </header>
  )
}

interface PropriedadesDaSecao {
  /** A categoria inteira: só ela diz se pode ser excluída. */
  categoria: CategoriaBiblioteca
  /** Os itens do tipo da aba, na ordem da estante. */
  itens: ItemBiblioteca[]
  tipo: TipoDeLivro
  emprestimo?: AcoesDeEmprestimo
  primeira: boolean
  ultima: boolean
  gerencia: boolean
  aoEscolher: (acao: Acao) => void
  aoMoverCategoria: (categoriaId: string, direcao: DirecaoNaBiblioteca) => void
  aoMoverItem: (itemId: string, direcao: DirecaoNaBiblioteca) => void
}

function SecaoDaCategoria({ categoria, itens, tipo, emprestimo, primeira, ultima, gerencia, aoEscolher, aoMoverCategoria, aoMoverItem }: PropriedadesDaSecao) {
  const opcoesDaCategoria: ItemMenu[] = [
    { rotulo: 'Renomear', aoEscolher: () => aoEscolher({ tipo: 'renomear-categoria', categoriaId: categoria.id }) },
    ...(primeira ? [] : [{ rotulo: 'Mover para cima', aoEscolher: () => aoMoverCategoria(categoria.id, 'acima') }]),
    ...(ultima ? [] : [{ rotulo: 'Mover para baixo', aoEscolher: () => aoMoverCategoria(categoria.id, 'abaixo') }]),
    ...(categoria.itens.length === 0 ? [{ rotulo: 'Excluir', aoEscolher: () => aoEscolher({ tipo: 'excluir-categoria', categoriaId: categoria.id }) }] : []),
  ]

  const opcoesDoItem = (item: ItemBiblioteca, indice: number): ItemMenu[] => [
    { rotulo: 'Editar', aoEscolher: () => aoEscolher({ tipo: 'editar-item', itemId: item.id }) },
    ...(indice === 0 ? [] : [{ rotulo: 'Mover para cima', aoEscolher: () => aoMoverItem(item.id, 'acima') }]),
    ...(indice === itens.length - 1 ? [] : [{ rotulo: 'Mover para baixo', aoEscolher: () => aoMoverItem(item.id, 'abaixo') }]),
    { rotulo: 'Remover', aoEscolher: () => aoEscolher({ tipo: 'remover-item', itemId: item.id }) },
  ]

  return (
    <section aria-label={categoria.nome} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-titulo text-lg font-bold text-texto">{categoria.nome}</h2>
        <div className="flex items-center gap-1">
          <span className="text-sm text-texto-2">{contagemDaSecao(itens, tipo)}</span>
          {gerencia && <MenuCabecalho rotulo="Opções" rotuloAcessivel={`Opções da categoria ${categoria.nome}`} itens={opcoesDaCategoria} />}
        </div>
      </div>
      {itens.length === 0 ? (
        <p className="text-base text-texto-2">Nenhum item nesta categoria.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {itens.map((item, indice) => (
            <CartaoDoItem key={item.id} item={item} opcoes={gerencia ? opcoesDoItem(item, indice) : undefined} emprestimo={emprestimo} />
          ))}
        </ul>
      )}
    </section>
  )
}

function VazioDosDigitais({ categorias, gerencia, haFisicos }: { categorias: CategoriaBiblioteca[]; gerencia: boolean; haFisicos: boolean }) {
  if (!gerencia) {
    return <EstadoVazio titulo={haFisicos ? 'Nenhum livro digital ainda.' : 'A biblioteca ainda está vazia.'} descricao="O Adm do clube adiciona aqui os cadernos de classe, livros e manuais." />
  }
  const nomes = categorias.map((categoria) => categoria.nome)
  const prontas = nomes.length === 1 ? `A categoria ${nomes[0]} já está pronta.` : `As categorias ${listaDeNomes(nomes)} já estão prontas.`
  return <EstadoVazio titulo={haFisicos ? 'Nenhum livro digital ainda.' : 'A biblioteca está vazia.'} descricao={`Use “Adicionar à biblioteca” para colocar o primeiro PDF. ${prontas}`} />
}

function VazioDosFisicos({ gerencia, aoCadastrar }: { gerencia: boolean; aoCadastrar: () => void }) {
  if (!gerencia) return <EstadoVazio titulo="Nenhum livro físico ainda." descricao="O Adm ainda não cadastrou livros físicos." />
  return (
    <EstadoVazio
      titulo="Cadastre o primeiro livro físico"
      acao={
        <Botao onClick={aoCadastrar}>
          <Plus aria-hidden className="size-5" />
          Adicionar livro físico
        </Botao>
      }
    />
  )
}

export function TelaBiblioteca() {
  const { pode } = useSessao()
  const gerencia = pode('biblioteca.gerenciar')
  const biblioteca = useBiblioteca()
  const emprestimos = useEmprestimos({}, gerencia)
  const moverCategoria = useMoverCategoria()
  const moverItem = useMoverItem()
  const [parametros, definirParametros] = useSearchParams()
  const [acao, definirAcao] = useState<Acao | null>(null)
  const [paraEmprestar, definirParaEmprestar] = useState<ItemFisico | null>(null)
  const [erroAoMover, definirErroAoMover] = useState<string | null>(null)
  const [busca, definirBusca] = useState('')
  const aba = abaDoEndereco(parametros.get('aba'), gerencia)
  const filtroDosEmprestimos = SituacaoDosEmprestimos.safeParse(parametros.get('situacao'))
  const categorias = biblioteca.data?.categorias
  const tipo = aba === 'emprestimos' ? null : TIPO_DA_ABA[aba]
  const doTipo = categorias && tipo ? categoriasDoTipo(categorias, tipo) : undefined
  const procurando = !gerencia && aba === 'fisicos' && busca.trim() !== ''
  const aBuscar = semAcento(busca.trim())
  const encontradas = procurando
    ? doTipo?.map((categoria) => ({ ...categoria, itens: categoria.itens.filter((item) => semAcento(item.nome).includes(aBuscar)) }))
    : doTipo
  const visiveis = gerencia ? encontradas : encontradas?.filter((categoria) => categoria.itens.length > 0)
  const haFisicos = categorias ? totalDeItens(categoriasDoTipo(categorias, 'FISICO')) > 0 : false
  const emprestimo: AcoesDeEmprestimo | undefined = pode('biblioteca.emprestar')
    ? { aoEmprestar: definirParaEmprestar, baseDoDetalhe: gerencia ? '/adm/biblioteca/livros/' : '/biblioteca/livros/' }
    : undefined

  const aoTerminarDeMover = { onSuccess: () => definirErroAoMover(null), onError: (erro: Error) => definirErroAoMover(mensagemDe(erro)) }
  const mudarAba = (id: string, origem: 'toque' | 'teclado') => definirParametros(id === 'digitais' ? {} : { aba: id }, { replace: origem === 'teclado' })
  const abrirAdicionar = () => definirAcao({ tipo: 'adicionar', livro: tipo ?? 'DIGITAL' })

  const resumo = (() => {
    if (!categorias || !visiveis || !tipo) return undefined
    if (tipo === 'FISICO') return haFisicos ? resumoDosFisicos(categorias) : undefined
    return !gerencia || visiveis.length > 0 ? resumoDaEstante(visiveis, gerencia) : undefined
  })()

  const corpo = (() => {
    if (!categorias || !visiveis || !tipo || !doTipo) {
      // Navegador sem rede: a consulta fica em pausa em vez de falhar, e o aviso de internet é o desfecho certo.
      if (biblioteca.fetchStatus === 'paused') return <DisponivelComInternet />
      return biblioteca.isError ? <ErroDeCarga erro={biblioteca.error} aoTentarDeNovo={() => void biblioteca.refetch()} /> : <Carregando rotulo="Carregando a biblioteca" />
    }
    if (gerencia && categorias.length === 0) {
      return (
        <EstadoVazio
          titulo="Crie uma categoria para começar a montar a biblioteca."
          descricao="Categorias são as prateleiras: Livros, Manuais, Cadernos de Classes…"
          acao={
            <Botao onClick={() => definirAcao({ tipo: 'nova-categoria' })}>
              <Plus aria-hidden className="size-5" />
              Nova categoria
            </Botao>
          }
        />
      )
    }
    if (totalDeItens(doTipo) === 0) {
      if (tipo === 'FISICO') return <VazioDosFisicos gerencia={gerencia} aoCadastrar={abrirAdicionar} />
      return <VazioDosDigitais categorias={categorias} gerencia={gerencia} haFisicos={haFisicos} />
    }
    if (procurando && visiveis.every((categoria) => categoria.itens.length === 0)) {
      return (
        <EstadoVazio
          titulo="Nenhum livro com esse nome."
          acao={
            <Botao variante="secundario" onClick={() => definirBusca('')}>
              Limpar a busca
            </Botao>
          }
        />
      )
    }
    return (
      <>
        {erroAoMover && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erroAoMover}
          </p>
        )}
        {visiveis.map((categoria) => (
          <SecaoDaCategoria
            key={categoria.id}
            categoria={categorias.find((original) => original.id === categoria.id) ?? categoria}
            itens={categoria.itens}
            tipo={tipo}
            emprestimo={emprestimo}
            primeira={categoria.id === categorias[0].id}
            ultima={categoria.id === categorias[categorias.length - 1].id}
            gerencia={gerencia}
            aoEscolher={definirAcao}
            aoMoverCategoria={(id, direcao) => moverCategoria.mutate({ id, direcao }, aoTerminarDeMover)}
            aoMoverItem={(id, direcao) => moverItem.mutate({ id, direcao }, aoTerminarDeMover)}
          />
        ))}
      </>
    )
  })()

  const botoes =
    gerencia && aba !== 'emprestimos' && categorias && categorias.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={() => definirAcao({ tipo: 'nova-categoria' })}>
          Nova categoria
        </Botao>
        <Botao onClick={abrirAdicionar}>
          <Plus aria-hidden className="size-5" />
          Adicionar à biblioteca
        </Botao>
      </div>
    ) : null

  return (
    <div className={cn('flex flex-col gap-6', !gerencia && 'p-4')}>
      <Cabecalho gerencia={gerencia} resumo={resumo}>
        {botoes}
      </Cabecalho>
      <Abas rotulo="Tipo de livro" abas={gerencia ? abasDoAdm(emprestimos.data?.totais.atrasados ?? 0) : ABAS_DE_QUEM_LE} ativa={aba} aoMudar={mudarAba} idDoPainel={ID_DO_PAINEL} />
      {!gerencia && aba === 'fisicos' && haFisicos && (
        <Campo type="search" rotulo="Buscar livro" value={busca} onChange={(evento) => definirBusca(evento.target.value)} />
      )}
      <div id={ID_DO_PAINEL} role="tabpanel" aria-labelledby={`aba-${aba}`} className="flex flex-col gap-6">
        {aba === 'emprestimos' ? <AbaEmprestimos filtroInicial={filtroDosEmprestimos.success ? filtroDosEmprestimos.data : undefined} /> : corpo}
      </div>
      {acao && categorias && <DialogosDaBiblioteca acao={acao} categorias={categorias} aoFechar={() => definirAcao(null)} />}
      <DialogoEmprestar aberto={paraEmprestar !== null} item={paraEmprestar} onFechar={() => definirParaEmprestar(null)} />
    </div>
  )
}
