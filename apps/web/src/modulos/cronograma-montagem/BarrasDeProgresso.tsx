import { BarraProgresso } from '../../ui/BarraProgresso'
import { progressoDoLado } from './vista'
import type { Lado, VistaDoPar } from './vista'

const nomeDoLado = (vista: VistaDoPar, lado: Lado): string =>
  lado === 'REGULAR' ? `Regular · ${vista.nomeDaRegular}` : `Avançada · ${vista.nomeDaAvancada ?? ''}`

/** Duas barras, uma por classe: a da avançada é listrada para não depender da cor. */
export function BarrasDeProgresso({ vista }: { vista: VistaDoPar }) {
  return (
    <div className="flex flex-col gap-3">
      {(['REGULAR', 'AVANCADA'] as const).map((lado) => {
        const { comData, total } = progressoDoLado(vista, lado)
        const rotulo = `${nomeDoLado(vista, lado)} — ${comData} de ${total} com data`
        return (
          <div key={lado} className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-texto-2">{rotulo}</span>
            <BarraProgresso valor={total === 0 ? 0 : (comData / total) * 100} rotulo={rotulo} listrada={lado === 'AVANCADA'} />
          </div>
        )
      })}
    </div>
  )
}
