import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLarguraMenorQue } from '../layouts/useLarguraMenorQue'
import { Botao } from './Botao'
import { cn } from './cn'

/** Abaixo desta largura o painel do Adm vira celular, e a Tabela mostra cartões em vez de linhas. */
export const LARGURA_DO_CELULAR = 900

export interface ColunaTabela<T> {
  chave: string
  titulo: string
  celula: (item: T) => ReactNode
}

interface Propriedades<T> {
  colunas: ColunaTabela<T>[]
  itens: T[]
  chaveItem: (item: T) => string
  pagina: number
  porPagina: number
  total: number
  aoMudarPagina: (pagina: number) => void
  /** Mostrado no lugar da tabela quando `itens` está vazio. */
  vazio?: ReactNode
  /** Conteúdo do cartão de cada item no celular; sem ele, o cartão lista os pares título: valor das colunas. */
  cartao?: (item: T) => ReactNode
}

interface PropriedadesDaPaginacao {
  pagina: number
  porPagina: number
  total: number
  aoMudarPagina: (pagina: number) => void
  className?: string
}

function Paginacao({ pagina, porPagina, total, aoMudarPagina, className }: PropriedadesDaPaginacao) {
  const primeiro = (pagina - 1) * porPagina + 1
  const ultimo = Math.min(pagina * porPagina, total)
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  return (
    <nav aria-label="Paginação" className={cn('flex items-center justify-between gap-3 px-4 py-2 text-sm text-texto-2', className)}>
      <span>{total === 0 ? '0 de 0' : `${primeiro}–${ultimo} de ${total}`}</span>
      <div className="flex gap-2">
        <Botao variante="secundario" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => aoMudarPagina(pagina - 1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </Botao>
        <Botao variante="secundario" aria-label="Próxima página" disabled={pagina >= totalPaginas} onClick={() => aoMudarPagina(pagina + 1)}>
          <ChevronRight aria-hidden className="size-5" />
        </Botao>
      </div>
    </nav>
  )
}

function CartaoGenerico<T>({ colunas, item }: { colunas: ColunaTabela<T>[]; item: T }) {
  return (
    <dl className="flex flex-col gap-2 rounded-cartao border border-borda-controle bg-superficie p-4 text-base">
      {colunas.map((coluna) => (
        <div key={coluna.chave} className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-texto-2">{coluna.titulo}:</dt>
          <dd className="min-w-0 break-words">{coluna.celula(item)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Tabela<T>({ colunas, itens, chaveItem, pagina, porPagina, total, aoMudarPagina, vazio, cartao }: Propriedades<T>) {
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  if (itens.length === 0 && vazio) return <>{vazio}</>

  const paginacao = { pagina, porPagina, total, aoMudarPagina }

  if (celular) {
    return (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {itens.map((item) => (
            <li key={chaveItem(item)}>{cartao ? cartao(item) : <CartaoGenerico colunas={colunas} item={item} />}</li>
          ))}
        </ul>
        <Paginacao {...paginacao} className="rounded-cartao border border-borda-controle bg-superficie" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-cartao border border-borda-controle bg-superficie">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <thead className="bg-superficie-suave text-sm text-texto-2">
            <tr>
              {colunas.map((coluna) => (
                <th key={coluna.chave} scope="col" className="px-4 py-3 font-semibold">
                  {coluna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={chaveItem(item)} className="border-t border-divisor">
                {colunas.map((coluna) => (
                  <td key={coluna.chave} className="px-4 py-3">
                    {coluna.celula(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao {...paginacao} className="border-t border-divisor" />
    </div>
  )
}
