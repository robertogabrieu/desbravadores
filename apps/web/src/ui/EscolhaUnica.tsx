import { CircleAlert } from 'lucide-react'
import { useId } from 'react'
import { cn } from './cn'

export interface OpcaoDaEscolha<Valor extends string> {
  valor: Valor
  rotulo: string
}

interface Propriedades<Valor extends string> {
  legenda: string
  opcoes: OpcaoDaEscolha<Valor>[]
  /** Nulo: nenhuma opção marcada (a escolha ainda não foi feita). */
  valor: Valor | null
  aoEscolher: (valor: Valor) => void
  ajuda?: string
  erro?: string
  /** Vai no `fieldset`, para o resumo de erros achar o grupo. */
  id?: string
  disabled?: boolean
}

/** Rádio de escolha única, uma por linha (≥ 44 px cada). O erro marca o grupo com `data-com-erro` para o resumo e o foco. */
export function EscolhaUnica<Valor extends string>({ legenda, opcoes, valor, aoEscolher, ajuda, erro, id, disabled }: Propriedades<Valor>) {
  const gerado = useId()
  const idDoGrupo = id ?? gerado
  const idDaAjuda = `${idDoGrupo}-ajuda`
  const idDoErro = `${idDoGrupo}-erro`
  const descricao = [erro && idDoErro, ajuda && idDaAjuda].filter(Boolean).join(' ') || undefined

  return (
    <fieldset id={idDoGrupo} data-com-erro={erro ? true : undefined} aria-describedby={descricao} disabled={disabled} className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-semibold text-texto">{legenda}</legend>
      <div className="flex flex-wrap gap-x-6">
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className={cn('flex min-h-[var(--touch-min)] items-center gap-3 text-base text-texto', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
            <input
              type="radio"
              name={idDoGrupo}
              value={opcao.valor}
              checked={valor === opcao.valor}
              onChange={() => aoEscolher(opcao.valor)}
              className="size-5 shrink-0 accent-marca"
            />
            {opcao.rotulo}
          </label>
        ))}
      </div>
      {ajuda && (
        <p id={idDaAjuda} className="text-sm text-texto-2">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={idDoErro} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-perigo">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      )}
    </fieldset>
  )
}
