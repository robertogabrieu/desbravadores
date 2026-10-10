import { ChevronLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CategoriaBiblioteca, DirecaoNaBiblioteca, ItemBiblioteca } from '../../api/biblioteca'
import { useBiblioteca, useMoverCategoria, useMoverItem } from '../../api/biblioteca'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { cn } from '../../ui/cn'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { MenuCabecalho } from '../../ui/MenuCabecalho'
import type { ItemMenu } from '../../ui/MenuCabecalho'
import { CartaoDoItem } from './CartaoDoItem'
import { DialogosDaBiblioteca, mensagemDe } from './DialogosDaBiblioteca'
import type { Acao } from './DialogosDaBiblioteca'

const plural = (quantidade: number, singular: string, muitos: string): string => `${quantidade} ${quantidade === 1 ? singular : muitos}`

/** "A, B e C": a lista de nomes escrita como gente escreve. */
const listaDeNomes = (nomes: string[]): string => (nomes.length < 2 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)

const totalDeItens = (categorias: CategoriaBiblioteca[]): number => categorias.reduce((soma, categoria) => soma + categoria.itens.length, 0)

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
  categoria: CategoriaBiblioteca
  primeira: boolean
  ultima: boolean
  gerencia: boolean
  aoEscolher: (acao: Acao) => void
  aoMoverCategoria: (categoriaId: string, direcao: DirecaoNaBiblioteca) => void
  aoMoverItem: (itemId: string, direcao: DirecaoNaBiblioteca) => void
}

function SecaoDaCategoria({ categoria, primeira, ultima, gerencia, aoEscolher, aoMoverCategoria, aoMoverItem }: PropriedadesDaSecao) {
  const opcoesDaCategoria: ItemMenu[] = [
    { rotulo: 'Renomear', aoEscolher: () => aoEscolher({ tipo: 'renomear-categoria', categoriaId: categoria.id }) },
    ...(primeira ? [] : [{ rotulo: 'Mover para cima', aoEscolher: () => aoMoverCategoria(categoria.id, 'acima') }]),
    ...(ultima ? [] : [{ rotulo: 'Mover para baixo', aoEscolher: () => aoMoverCategoria(categoria.id, 'abaixo') }]),
    ...(categoria.itens.length === 0 ? [{ rotulo: 'Excluir', aoEscolher: () => aoEscolher({ tipo: 'excluir-categoria', categoriaId: categoria.id }) }] : []),
  ]

  const opcoesDoItem = (item: ItemBiblioteca, indice: number): ItemMenu[] => [
    { rotulo: 'Editar', aoEscolher: () => aoEscolher({ tipo: 'editar-item', itemId: item.id }) },
    ...(indice === 0 ? [] : [{ rotulo: 'Mover para cima', aoEscolher: () => aoMoverItem(item.id, 'acima') }]),
    ...(indice === categoria.itens.length - 1 ? [] : [{ rotulo: 'Mover para baixo', aoEscolher: () => aoMoverItem(item.id, 'abaixo') }]),
    { rotulo: 'Remover', aoEscolher: () => aoEscolher({ tipo: 'remover-item', itemId: item.id }) },
  ]

  return (
    <section aria-label={categoria.nome} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-titulo text-lg font-bold text-texto">{categoria.nome}</h2>
        <div className="flex items-center gap-1">
          <span className="text-sm text-texto-2">{plural(categoria.itens.length, 'item', 'itens')}</span>
          {gerencia && <MenuCabecalho rotulo="Opções" rotuloAcessivel={`Opções da categoria ${categoria.nome}`} itens={opcoesDaCategoria} />}
        </div>
      </div>
      {categoria.itens.length === 0 ? (
        <p className="text-base text-texto-2">Nenhum item nesta categoria.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {categoria.itens.map((item, indice) => (
            <CartaoDoItem key={item.id} item={item} opcoes={gerencia ? opcoesDoItem(item, indice) : undefined} />
          ))}
        </ul>
      )}
    </section>
  )
}

function VazioDaBiblioteca({ categorias, gerencia }: { categorias: CategoriaBiblioteca[]; gerencia: boolean }) {
  if (!gerencia) return <EstadoVazio titulo="A biblioteca ainda está vazia." descricao="O Adm do clube adiciona aqui os cadernos de classe, livros e manuais." />
  const nomes = categorias.map((categoria) => categoria.nome)
  const prontas = nomes.length === 1 ? `A categoria ${nomes[0]} já está pronta.` : `As categorias ${listaDeNomes(nomes)} já estão prontas.`
  return <EstadoVazio titulo="A biblioteca está vazia." descricao={`Use “Adicionar à biblioteca” para colocar o primeiro PDF. ${prontas}`} />
}

export function TelaBiblioteca() {
  const { modo } = useConexao()
  const { pode } = useSessao()
  const online = modo === 'ONLINE'
  const gerencia = pode('biblioteca.gerenciar')
  const biblioteca = useBiblioteca(online)
  const moverCategoria = useMoverCategoria()
  const moverItem = useMoverItem()
  const [acao, definirAcao] = useState<Acao | null>(null)
  const [erroAoMover, definirErroAoMover] = useState<string | null>(null)
  const categorias = biblioteca.data?.categorias
  const visiveis = gerencia ? categorias : categorias?.filter((categoria) => categoria.itens.length > 0)

  const aoTerminarDeMover = { onSuccess: () => definirErroAoMover(null), onError: (erro: Error) => definirErroAoMover(mensagemDe(erro)) }

  const corpo = (() => {
    if (!online) return <DisponivelComInternet />
    if (!categorias || !visiveis) {
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
    if (totalDeItens(categorias) === 0) return <VazioDaBiblioteca categorias={categorias} gerencia={gerencia} />
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
            categoria={categoria}
            primeira={categoria === categorias[0]}
            ultima={categoria === categorias[categorias.length - 1]}
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
    online && gerencia && categorias && categorias.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={() => definirAcao({ tipo: 'nova-categoria' })}>
          Nova categoria
        </Botao>
        <Botao onClick={() => definirAcao({ tipo: 'adicionar' })}>
          <Plus aria-hidden className="size-5" />
          Adicionar à biblioteca
        </Botao>
      </div>
    ) : null

  return (
    <div className={cn('flex flex-col gap-6', !gerencia && 'p-4')}>
      <Cabecalho gerencia={gerencia} resumo={online && visiveis && (!gerencia || visiveis.length > 0) ? resumoDaEstante(visiveis, gerencia) : undefined}>
        {botoes}
      </Cabecalho>
      {corpo}
      {acao && categorias && <DialogosDaBiblioteca acao={acao} categorias={categorias} aoFechar={() => definirAcao(null)} />}
    </div>
  )
}
