import { Check, Shirt } from 'lucide-react'
import { Botao } from '../../../../ui/Botao'
import { cn } from '../../../../ui/cn'
import type { MarcaDaPessoa } from './useMarcasDaPresenca'

export type NomeDoUniforme = 'gala' | 'campo'

export interface ToquesDaLinha {
  aoTocarNome: () => void
  aoTocarUniforme: () => void
  aoTentarDeNovo: () => void
}

interface Propriedades extends ToquesDaLinha {
  nome: string
  marca: MarcaDaPessoa
  uniforme: NomeDoUniforme
  semInternet: boolean
}

export const primeiroNome = (nome: string): string => nome.split(' ')[0] ?? nome

/** O que a linha diz sobre a marca: o que foi confirmado, ou que ainda não foi. */
export function textoDaMarca(marca: MarcaDaPessoa, semInternet: boolean): string {
  if (marca.situacao === 'salvando') return 'Salvando…'
  if (marca.situacao === 'falhou') return 'Não salvou ainda'
  const base = marca.foi ? 'Foi' : 'Não foi'
  return semInternet ? `${base} · trocar só com internet` : base
}

export const mensagemDaFalha = (nome: string): string => `Não salvou a marca de ${nome}. Toque em “Tentar de novo”.`

/** O nome é a caixa de marcar; a pílula do uniforme só liga para quem foi. Nada depende só da cor: tem texto, ícone e contorno. */
export function LinhaDeMarca({ nome, marca, uniforme, semInternet, aoTocarNome, aoTocarUniforme, aoTentarDeNovo }: Propriedades) {
  const travada = marca.situacao !== 'salva' || semInternet
  const rotuloDoUniforme = `De ${uniforme}`

  return (
    <li aria-busy={marca.situacao === 'salvando'} className={cn('flex flex-col gap-1 rounded-cartao p-2', marca.foi ? 'bg-superficie' : 'bg-superficie-suave')}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={marca.foi}
          disabled={travada}
          onClick={aoTocarNome}
          className="flex min-h-[var(--touch-min)] min-w-0 flex-1 items-center gap-3 rounded-botao text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed"
        >
          <span
            aria-hidden
            className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', marca.foi ? 'bg-marca text-sobre-marca' : 'border-2 border-borda-controle bg-superficie')}
          >
            {marca.foi && <Check className="size-5" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold break-words text-texto">{nome}</span>
            <span className="text-sm text-texto-2">{textoDaMarca(marca, semInternet)}</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={marca.comUniforme}
          aria-label={marca.foi ? undefined : `${rotuloDoUniforme}: indisponível porque ${primeiroNome(nome)} não foi`}
          disabled={!marca.foi || travada}
          onClick={aoTocarUniforme}
          className={cn(
            'inline-flex min-h-[var(--touch-min)] shrink-0 items-center justify-center gap-1.5 rounded-full border-2 px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:opacity-50',
            uniforme === 'gala' ? 'border-solid' : 'border-dashed',
            marca.comUniforme ? 'border-marca bg-marca-suave text-marca' : 'border-borda-controle bg-superficie text-texto',
          )}
        >
          {marca.comUniforme && <Shirt aria-hidden className="size-4 shrink-0" />}
          {rotuloDoUniforme}
        </button>
      </div>
      {marca.situacao === 'falhou' && !semInternet && (
        <div role="alert" className="flex flex-wrap items-center gap-2 ml-1">
          <span className="text-sm font-medium text-perigo">{mensagemDaFalha(nome)}</span>
          <Botao variante="secundario" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        </div>
      )}
    </li>
  )
}
