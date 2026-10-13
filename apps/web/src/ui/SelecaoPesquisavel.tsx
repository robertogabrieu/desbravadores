import { useId } from 'react'
import Select from 'react-select'
import { CampoRotulado } from './Campo'
import { cn } from './cn'

export interface OpcaoPesquisavel {
  valor: string
  rotulo: string
}

interface Propriedades {
  rotulo: string
  opcoes: OpcaoPesquisavel[]
  /** Vazio quando nada está escolhido: mostra o `placeholder`. */
  valor: string
  aoMudar: (valor: string) => void
  placeholder?: string
  erro?: string
  disabled?: boolean
}

/** Select com busca por digitação, para listas longas (pessoas, contas). Listas curtas seguem no `Selecao` nativo. */
export function SelecaoPesquisavel({ rotulo, opcoes, valor, aoMudar, placeholder = 'Escolha…', erro, disabled }: Propriedades) {
  const idCampo = useId()
  const escolhida = opcoes.find((opcao) => opcao.valor === valor) ?? null
  return (
    <CampoRotulado rotulo={rotulo} erro={erro} idCampo={idCampo}>
      <Select<OpcaoPesquisavel>
        inputId={idCampo}
        unstyled
        options={opcoes}
        value={escolhida}
        isDisabled={disabled}
        placeholder={placeholder}
        noOptionsMessage={() => 'Nada encontrado'}
        getOptionValue={(opcao) => opcao.valor}
        getOptionLabel={(opcao) => opcao.rotulo}
        onChange={(opcao) => aoMudar(opcao?.valor ?? '')}
        aria-invalid={erro ? true : undefined}
        aria-errormessage={erro ? `${idCampo}-erro` : undefined}
        classNames={{
          control: ({ isFocused, isDisabled }) =>
            cn(
              'min-h-[var(--touch-min)]! rounded-controle border bg-superficie px-3.5 text-base text-texto',
              erro ? 'border-perigo' : 'border-borda-controle',
              isFocused && 'outline-2 outline-offset-1 outline-marca',
              isDisabled && 'bg-superficie-suave',
            ),
          placeholder: () => 'text-texto-3',
          input: () => 'text-texto',
          valueContainer: () => 'gap-1 py-1',
          dropdownIndicator: () => 'text-texto-2 pl-2',
          indicatorSeparator: () => 'hidden',
          menu: () => 'mt-1 overflow-hidden rounded-controle border border-borda-controle bg-superficie shadow-lg',
          option: ({ isFocused, isSelected }) =>
            cn('min-h-[var(--touch-min)] cursor-pointer px-3.5 py-2.5 text-base', isFocused && 'bg-superficie-suave', isSelected && 'bg-marca-suave font-semibold text-marca'),
          noOptionsMessage: () => 'px-3.5 py-3 text-base text-texto-2',
        }}
      />
    </CampoRotulado>
  )
}
