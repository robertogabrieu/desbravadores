import { Children, createContext, Fragment, isValidElement, useContext, useId } from 'react'
import type { ReactElement, ReactNode } from 'react'
import Select, { components } from 'react-select'
import type { ContainerProps, InputProps, OptionProps } from 'react-select'
import { CampoRotulado, descreverCampo } from './Campo'
import { cn } from './cn'

interface Opcao {
  valor: string
  rotulo: string
  desabilitada: boolean
}

interface Propriedades {
  rotulo: string
  ajuda?: string
  erro?: string
  disabled?: boolean
  value: string | number
  /** Só `evento.target.value` existe: o mesmo contrato que o select nativo dava às telas. */
  onChange?: (evento: { target: { value: string } }) => void
  /** `<option>` como no select nativo, direto ou dentro de fragmentos e de componentes sem estado. */
  children: ReactNode
}

/** A partir deste número de opções a lista ganha busca por digitação. */
const OPCOES_PARA_BUSCAR = 8

function textoDe(conteudo: ReactNode): string {
  return Children.toArray(conteudo)
    .map((filho) =>
      typeof filho === 'string' || typeof filho === 'number'
        ? String(filho)
        : isValidElement<{ children?: ReactNode }>(filho)
          ? textoDe(filho.props.children)
          : '',
    )
    .join('')
}

function lerOpcoes(conteudo: ReactNode): Opcao[] {
  return Children.toArray(conteudo).flatMap((filho): Opcao[] => {
    if (!isValidElement(filho)) return []
    const elemento = filho as ReactElement<{
      value?: string | number
      disabled?: boolean
      children?: ReactNode
    }>
    if (elemento.type === 'option') {
      const rotulo = textoDe(elemento.props.children)
      return [
        {
          valor: String(elemento.props.value ?? rotulo),
          rotulo,
          desabilitada: elemento.props.disabled === true,
        },
      ]
    }
    if (elemento.type === Fragment || elemento.type === 'optgroup')
      return lerOpcoes(elemento.props.children)
    // Componentes de opções (OpcoesDeSecao…) são funções puras: chamá-las devolve os <option>.
    if (typeof elemento.type === 'function')
      return lerOpcoes((elemento.type as (props: unknown) => ReactNode)(elemento.props))
    return []
  })
}

interface AjustesDoCampo {
  descricao?: string
  soLeitura: boolean
}

const AjustesContexto = createContext<AjustesDoCampo>({ soLeitura: false })

// O campo de busca da biblioteca é o único cujo `aria-describedby` dá para fixar; nas listas curtas ele vira só leitura, sem abrir o teclado.
function CampoDeBusca(props: InputProps<Opcao, false>) {
  const { descricao, soLeitura } = useContext(AjustesContexto)
  return (
    <components.Input
      {...props}
      {...(descricao ? { 'aria-describedby': descricao } : {})}
      readOnly={soLeitura}
      aria-readonly={soLeitura || undefined}
      inputMode={soLeitura ? 'none' : undefined}
    />
  )
}

// Fora do componente de propósito: componente recriado a cada render faz a react-select remontar o campo e perder o foco.
// `data-valor` deixa o valor escolhido e cada opção achável, como no select nativo (os testes dependem disso).
const componentes = {
  Option: (props: OptionProps<Opcao, false>) => (
    <components.Option
      {...props}
      innerProps={
        { ...props.innerProps, 'data-valor': props.data.valor } as typeof props.innerProps
      }
    />
  ),
  Input: CampoDeBusca,
  SelectContainer: (props: ContainerProps<Opcao, false>) => (
    <components.SelectContainer
      {...props}
      innerProps={
        {
          ...props.innerProps,
          'data-valor': props.getValue()[0]?.valor ?? '',
        } as typeof props.innerProps
      }
    />
  ),
}

export function Selecao({
  rotulo,
  ajuda,
  erro,
  disabled,
  value,
  onChange,
  children,
}: Propriedades) {
  const idCampo = useId()
  const opcoes = lerOpcoes(children)
  const escolhida = opcoes.find((opcao) => opcao.valor === String(value)) ?? null
  const descricao = descreverCampo(idCampo, ajuda, erro)

  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      <AjustesContexto value={{ descricao, soLeitura: opcoes.length < OPCOES_PARA_BUSCAR }}>
        <Select<Opcao, false>
          inputId={idCampo}
          unstyled
          options={opcoes}
          value={escolhida}
          isDisabled={disabled}
          isOptionDisabled={(opcao) => opcao.desabilitada}
          menuPlacement="auto"
          placeholder=""
          noOptionsMessage={() => 'Nada encontrado'}
          getOptionValue={(opcao) => opcao.valor}
          getOptionLabel={(opcao) => opcao.rotulo}
          onChange={(opcao) => onChange?.({ target: { value: opcao?.valor ?? '' } })}
          components={componentes}
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
            valueContainer: () => 'gap-1 py-1',
            singleValue: () => 'text-texto',
            input: () => 'text-texto',
            dropdownIndicator: () => 'pl-2 text-texto-2',
            indicatorSeparator: () => 'hidden',
            menu: () =>
              'z-10 mt-1 overflow-hidden rounded-controle border border-borda-controle bg-superficie shadow-lg',
            option: ({ isFocused, isSelected, isDisabled }) =>
              cn(
                'min-h-[var(--touch-min)] cursor-pointer px-3.5 py-2.5 text-base',
                isFocused && 'bg-superficie-suave',
                isSelected && 'bg-marca-suave font-semibold text-marca',
                isDisabled && 'cursor-not-allowed text-texto-3',
              ),
            noOptionsMessage: () => 'px-3.5 py-3 text-base text-texto-2',
          }}
        />
      </AjustesContexto>
    </CampoRotulado>
  )
}
