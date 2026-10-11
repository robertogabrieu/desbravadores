import { CalendarDays } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, InputHTMLAttributes, Ref } from 'react'
import { DayPicker } from 'react-day-picker'
import { ptBR } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { CampoRotulado, descreverCampo, estiloControle } from './Campo'
import { cn } from './cn'
import { dataParaIso, isoParaData, isoParaTexto, mascararData, textoParaIso } from './mascaraData'

interface Propriedades extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'ref'> {
  rotulo: string
  ajuda?: string
  erro?: string
  /** Data em `AAAA-MM-DD`, ou vazio. */
  value: string
  /** Recebe `AAAA-MM-DD` quando a data está completa e existe, e vazio enquanto não está. */
  onChange: (iso: string) => void
  /** `AAAA-MM-DD`. */
  min?: string
  /** `AAAA-MM-DD`. */
  max?: string
  /** Para células de grade: sem rótulo visível, sem botão de calendário (o painel seria cortado) e sem mensagem própria. */
  compacto?: boolean
  ref?: Ref<HTMLInputElement>
}

const CORES_DO_CALENDARIO = {
  '--rdp-accent-color': 'var(--color-primary)',
  '--rdp-accent-background-color': 'var(--color-primary-soft)',
} as CSSProperties

/** Campo de data: texto `DD/MM/AAAA` com barras automáticas e calendário em pt-BR; entrega `AAAA-MM-DD`. */
export function CampoData({ rotulo, ajuda, erro, value, onChange, min, max, compacto, className, id, ref, onBlur, ...resto }: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  const [texto, setTexto] = useState(() => isoParaTexto(value))
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement | null>(null)

  // Valor trocado de fora (carregar ficha, limpar formulário): o texto acompanha; o que a pessoa digita pela metade não é sobrescrito.
  const [valorAnterior, setValorAnterior] = useState(value)
  if (value !== valorAnterior) {
    setValorAnterior(value)
    if ((textoParaIso(texto) ?? '') !== value) setTexto(isoParaTexto(value))
  }

  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (evento: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', aoClicarFora)
    return () => document.removeEventListener('pointerdown', aoClicarFora)
  }, [aberto])

  const fechar = () => {
    setAberto(false)
    campo.current?.focus()
  }

  const aoDigitar = (evento: ChangeEvent<HTMLInputElement>) => {
    const novo = mascararData(evento.target.value)
    setTexto(novo)
    const iso = textoParaIso(novo) ?? ''
    if (iso !== value) onChange(iso)
  }

  const escolher = (data: Date | undefined) => {
    if (data) {
      const iso = dataParaIso(data)
      setTexto(isoParaTexto(iso))
      onChange(iso)
    }
    fechar()
  }

  const dataInvalida = texto.length === 10 && textoParaIso(texto) === null
  const mensagem = erro ?? (dataInvalida ? 'Essa data não existe. Use o formato dia/mês/ano.' : undefined)
  const minimo = isoParaData(min)
  const maximo = isoParaData(max)
  const selecionada = isoParaData(value)

  const corpo = (
      <div
        ref={raiz}
        className="relative"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape' && aberto) {
            evento.stopPropagation()
            fechar()
          }
        }}
      >
        <div className="flex items-stretch gap-2">
          <input
            id={idCampo}
            ref={(no) => {
              campo.current = no
              if (typeof ref === 'function') ref(no)
              else if (ref) ref.current = no
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD/MM/AAAA"
            aria-label={compacto ? rotulo : undefined}
            maxLength={10}
            aria-invalid={mensagem ? true : undefined}
            aria-describedby={descreverCampo(idCampo, ajuda, mensagem)}
            className={cn(estiloControle, className)}
            value={texto}
            onChange={aoDigitar}
            onBlur={onBlur}
            {...resto}
          />
          {!compacto && (
            <button
              type="button"
              aria-label={`Abrir calendário de ${rotulo}`}
              aria-haspopup="dialog"
              aria-expanded={aberto}
              disabled={resto.disabled}
              onClick={() => setAberto((atual) => !atual)}
              className="grid min-h-[var(--touch-min)] min-w-[var(--touch-min)] shrink-0 place-items-center rounded-controle border border-borda-controle bg-superficie text-texto focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marca disabled:bg-superficie-suave"
            >
              <CalendarDays aria-hidden className="size-5" />
            </button>
          )}
        </div>
        {aberto && (
          <div
            role="dialog"
            aria-label={`Calendário de ${rotulo}`}
            style={CORES_DO_CALENDARIO}
            className="absolute right-0 z-50 mt-1.5 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-controle border border-borda-controle bg-superficie p-2 shadow-lg"
          >
            <DayPicker
              mode="single"
              locale={ptBR}
              captionLayout="dropdown"
              startMonth={minimo}
              endMonth={maximo ?? new Date(new Date().getFullYear() + 5, 11)}
              defaultMonth={selecionada ?? maximo}
              selected={selecionada}
              onSelect={escolher}
              disabled={[...(minimo ? [{ before: minimo }] : []), ...(maximo ? [{ after: maximo }] : [])]}
              autoFocus
            />
          </div>
        )}
      </div>
  )
  if (compacto) return corpo
  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={mensagem} idCampo={idCampo}>
      {corpo}
    </CampoRotulado>
  )
}
