import { Campo } from './Campo'
import type { ComponentProps } from 'react'

type Propriedades = Omit<ComponentProps<typeof Campo>, 'type'>

/** Campo de data (`AAAA-MM-DD`): o seletor nativo do celular, com o rótulo do `Campo`. */
export function CampoData(props: Propriedades) {
  return <Campo {...props} type="date" />
}
