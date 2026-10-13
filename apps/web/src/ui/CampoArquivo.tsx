import { FileCheck2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { CampoRotulado, descreverCampo } from './Campo'
import { cn } from './cn'

interface Propriedades {
  rotulo: string
  ajuda?: string
  erro?: string
  accept?: string
  disabled?: boolean
  id?: string
  onChange: (evento: ChangeEvent<HTMLInputElement>) => void
}

/** Campo de arquivo: área grande para tocar ou arrastar, que mostra o nome do arquivo escolhido. */
export function CampoArquivo({
  rotulo,
  ajuda,
  erro,
  accept,
  disabled,
  id,
  onChange,
}: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  const entrada = useRef<HTMLInputElement>(null)
  const [nome, definirNome] = useState<string | null>(null)
  const [arrastando, definirArrastando] = useState(false)

  const aoMudar = (evento: ChangeEvent<HTMLInputElement>) => {
    definirNome(evento.target.files?.[0]?.name ?? null)
    onChange(evento)
  }

  const aoSoltar = (evento: DragEvent<HTMLLabelElement>) => {
    evento.preventDefault()
    definirArrastando(false)
    const campo = entrada.current
    if (disabled || !campo || evento.dataTransfer.files.length === 0) return
    campo.files = evento.dataTransfer.files
    campo.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      <label
        htmlFor={idCampo}
        onDragOver={(evento) => {
          evento.preventDefault()
          if (!disabled) definirArrastando(true)
        }}
        onDragLeave={() => definirArrastando(false)}
        onDrop={aoSoltar}
        className={cn(
          'flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-controle border-2 border-dashed px-4 py-4 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-marca',
          erro
            ? 'border-perigo'
            : nome
              ? 'border-marca bg-marca-suave'
              : 'border-borda-controle bg-superficie hover:bg-superficie-suave',
          arrastando && 'border-marca bg-marca-suave',
          disabled && 'bg-superficie-suave opacity-60',
        )}
      >
        {nome ? (
          <FileCheck2 aria-hidden className="size-6 text-marca" />
        ) : (
          <Upload aria-hidden className="size-6 text-texto-2" />
        )}
        <span className="max-w-full break-all text-base font-semibold text-texto">
          {nome ?? 'Escolher arquivo'}
        </span>
        <span className="text-sm text-texto-2">
          {nome ? 'Toque para trocar' : 'Toque aqui ou arraste o arquivo'}
        </span>
        <input
          ref={entrada}
          id={idCampo}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descreverCampo(idCampo, ajuda, erro)}
          className="sr-only"
          onChange={aoMudar}
        />
      </label>
    </CampoRotulado>
  )
}
