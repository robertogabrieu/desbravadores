import { BookOpen, Download, ExternalLink } from 'lucide-react'
import type { ItemBiblioteca } from '../../api/biblioteca'
import { estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { cn } from '../../ui/cn'
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

interface Propriedades {
  item: ItemBiblioteca
  /** Só quem pode gerenciar recebe as opções (editar, mover, remover). */
  opcoes?: ItemMenu[]
}

export function CartaoDoItem({ item, opcoes }: Propriedades) {
  return (
    <li className="flex">
      <Cartao className="flex w-full flex-col gap-2.5 p-3">
        <CapaDoItem nome={item.nome} capaUrl={item.capaUrl} />
        <div className="flex flex-col gap-1">
          <p className="line-clamp-2 text-base font-bold break-words text-texto">{item.nome}</p>
          {item.descricao && <p className="truncate text-sm text-texto-2">{item.descricao}</p>}
        </div>
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
        {opcoes && (
          <div className="flex justify-end">
            <MenuCabecalho rotulo="Opções" rotuloAcessivel={`Opções de ${item.nome}`} itens={opcoes} />
          </div>
        )}
      </Cartao>
    </li>
  )
}
