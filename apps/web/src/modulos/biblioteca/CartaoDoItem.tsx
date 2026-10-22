import { textoDeDisponibilidade } from '@desbravadores/shared'
import { BookOpen, Download, ExternalLink } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { ItemBiblioteca, ItemDigital, ItemFisico } from '../../api/biblioteca'
import { useConexao } from '../../offline'
import type { ModoConexao } from '../../offline'
import { estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { cn } from '../../ui/cn'
import { Selo } from '../../ui/Selo'
import { MenuCabecalho } from '../../ui/MenuCabecalho'
import type { ItemMenu } from '../../ui/MenuCabecalho'

const ESTILO_DOS_BOTOES = 'min-w-0 grow basis-14 gap-1 px-1 sm:px-3'
const ESTILO_DO_LER =
  'flex min-h-[var(--touch-min)] items-center justify-center rounded-botao border border-marca text-base font-semibold text-marca hover:bg-marca-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

/** Capa em 3:4. Sem imagem, o espaço vira um fundo liso com o nome do item. */
export function CapaDoItem({ nome, capaUrl, className }: { nome: string; capaUrl: string | null; className?: string }) {
  return (
    <div className={cn('aspect-[3/4] w-full overflow-hidden rounded-controle bg-marca-suave', className)}>
      {capaUrl ? (
        <img src={capaUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
          <BookOpen aria-hidden className="size-8 text-marca" />
          <span className="line-clamp-4 font-titulo text-base font-bold break-words text-texto">{nome}</span>
        </div>
      )}
    </div>
  )
}

/** O que o cartão do livro físico precisa para emprestar; quem não tem `biblioteca.emprestar` não recebe. */
export interface AcoesDeEmprestimo {
  aoEmprestar: (item: ItemFisico) => void
  /** Começo do endereço do detalhe com os exemplares; o id do livro vem depois. */
  baseDoDetalhe: string
}

interface Propriedades {
  item: ItemBiblioteca
  /** Só quem pode gerenciar recebe as opções (editar, mover, remover). */
  opcoes?: ItemMenu[]
  /** Só quem pode emprestar recebe Emprestar e Exemplares no cartão físico. */
  emprestimo?: AcoesDeEmprestimo
}

function motivoSemEmprestar(item: ItemFisico, modo: ModoConexao): string | null {
  if (item.total === 0) return 'Este livro não tem exemplares.'
  if (item.disponiveis === 0) return 'Todos os exemplares estão emprestados.'
  return modo === 'ONLINE' ? null : 'Emprestar precisa de internet.'
}

function AcoesDoDigital({ item }: { item: ItemDigital }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2">
      <a href={item.urlLer} target="_blank" rel="noopener noreferrer" aria-label={`Ler ${item.nome}`} className={cn(ESTILO_DO_LER, ESTILO_DOS_BOTOES)}>
        <ExternalLink aria-hidden className="hidden size-4 sm:block" />
        Ler
      </a>
      <a href={item.urlBaixar} aria-label={`Baixar ${item.nome}`} className={cn(estiloDoBotao({ variante: 'secundario' }), ESTILO_DOS_BOTOES)}>
        <Download aria-hidden className="hidden size-4 sm:block" />
        Baixar
      </a>
    </div>
  )
}

function AcoesDoFisico({ item, emprestimo }: { item: ItemFisico; emprestimo: AcoesDeEmprestimo }) {
  const { modo } = useConexao()
  const idDoMotivo = useId()
  const motivo = motivoSemEmprestar(item, modo)
  return (
    <div className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={motivo !== null}
          aria-describedby={motivo ? idDoMotivo : undefined}
          aria-label={`Emprestar ${item.nome}`}
          onClick={() => emprestimo.aoEmprestar(item)}
          className={cn(ESTILO_DO_LER, ESTILO_DOS_BOTOES, 'disabled:cursor-not-allowed disabled:opacity-50')}
        >
          Emprestar
        </button>
        <Link to={`${emprestimo.baseDoDetalhe}${item.id}`} aria-label={`Exemplares de ${item.nome}`} className={cn(estiloDoBotao({ variante: 'secundario' }), ESTILO_DOS_BOTOES)}>
          Exemplares
        </Link>
      </div>
      {motivo && (
        <p id={idDoMotivo} className="text-sm text-texto-2">
          {motivo}
        </p>
      )}
    </div>
  )
}

export function CartaoDoItem({ item, opcoes, emprestimo }: Propriedades) {
  return (
    <li className="flex">
      <Cartao className="flex w-full flex-col gap-2.5 p-3">
        <CapaDoItem nome={item.nome} capaUrl={item.capaUrl} />
        <div className="flex flex-col gap-1">
          <p className="line-clamp-2 text-base font-bold break-words text-texto">{item.nome}</p>
          {item.descricao && <p className="truncate text-sm text-texto-2">{item.descricao}</p>}
          {item.tipo === 'FISICO' && (
            <Selo tom={item.disponiveis > 0 ? 'neutro' : 'alerta'} className="mt-1 max-w-full self-start px-2.5">
              {textoDeDisponibilidade(item.total, item.disponiveis)}
            </Selo>
          )}
        </div>
        {item.tipo === 'DIGITAL' ? <AcoesDoDigital item={item} /> : emprestimo && <AcoesDoFisico item={item} emprestimo={emprestimo} />}
        {opcoes && (
          <div className="flex justify-end">
            <MenuCabecalho rotulo="Opções" rotuloAcessivel={`Opções de ${item.nome}`} itens={opcoes} />
          </div>
        )}
      </Cartao>
    </li>
  )
}
