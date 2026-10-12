import { Minus, Plus } from 'lucide-react'
import { useId } from 'react'
import type { FocusEvent, Ref } from 'react'
import { CampoRotulado, descreverCampo, estiloControle } from './Campo'
import { cn } from './cn'

interface Propriedades {
  rotulo: string
  /** O texto digitado: fica como texto para a tela poder dizer o que está errado em "10,5" ou em branco. */
  valor: string
  aoMudar: (valor: string) => void
  aoSair?: (evento: FocusEvent<HTMLInputElement>) => void
  minimo: number
  maximo: number
  /** Escrito ao lado do campo ("pontos"). */
  sufixo?: string
  /** O que os botões somam e tiram, para o leitor de tela: "Aumentar 1 ponto". */
  unidade: string
  ajuda?: string
  erro?: string
  refCampo?: Ref<HTMLInputElement>
}

const ESTILO_DO_BOTAO =
  'flex size-12 shrink-0 items-center justify-center rounded-botao border border-borda-controle bg-superficie text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

/** Número inteiro com − e + de 48 px: quem não digita bem ajusta de um em um. Texto inválido conta como o mínimo ao tocar nos botões. */
export function CampoComPasso({ rotulo, valor, aoMudar, aoSair, minimo, maximo, sufixo, unidade, ajuda, erro, refCampo }: Propriedades) {
  const idCampo = useId()
  const atual = /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : minimo
  const somar = (passo: number) => aoMudar(String(Math.min(maximo, Math.max(minimo, atual + passo))))
  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Diminuir 1 ${unidade}`} onClick={() => somar(-1)} className={ESTILO_DO_BOTAO}>
          <Minus aria-hidden className="size-5" />
        </button>
        <input
          id={idCampo}
          ref={refCampo}
          inputMode="numeric"
          autoComplete="off"
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          onBlur={aoSair}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descreverCampo(idCampo, ajuda, erro)}
          className={cn(estiloControle, 'h-12 w-28 text-center text-[22px] font-bold tabular-nums')}
        />
        <button type="button" aria-label={`Aumentar 1 ${unidade}`} onClick={() => somar(1)} className={ESTILO_DO_BOTAO}>
          <Plus aria-hidden className="size-5" />
        </button>
        {sufixo && <span className="text-base font-semibold text-texto-2">{sufixo}</span>}
      </div>
    </CampoRotulado>
  )
}
