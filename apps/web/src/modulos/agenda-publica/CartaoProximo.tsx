import { UniformeDoEvento } from '../adm/calendario/UniformeDoEvento'
import { dataPorExtenso, horaCurta, periodoPorExtenso } from '../adm/formatos'
import type { Compromisso } from './compromissos'

const minuscula = (texto: string): string => `${texto.charAt(0).toLowerCase()}${texto.slice(1)}`

/** "domingo, 18 de outubro"; compromisso de vários dias: "sáb 14 a seg 16 de novembro". */
const quando = (c: Compromisso): string => (c.fim ? periodoPorExtenso(c.data, c.fim) : minuscula(dataPorExtenso(c.data)))

/** O destaque da primeira dobra: o próximo compromisso, com horário, local e uniforme. */
export function CartaoProximo({ compromisso }: { compromisso: Compromisso }) {
  return (
    <article aria-labelledby="prox-titulo" className="grid gap-4 rounded-cartao bg-marca p-6 text-white">
      <p className="text-sm font-semibold uppercase tracking-wider text-sobre-marca">Próximo compromisso · {quando(compromisso)}</p>
      <h2 id="prox-titulo" className="text-[28px] leading-tight font-bold text-balance text-white">
        {compromisso.nome}
      </h2>
      <dl className="m-0 grid gap-2">
        {compromisso.horario && <Linha rotulo="Horário">{horaCurta(compromisso.horario)}</Linha>}
        {compromisso.local && <Linha rotulo="Local">{compromisso.local}</Linha>}
        {compromisso.uniforme && (
          <Linha rotulo="Uniforme">
            <UniformeDoEvento uniforme={compromisso.uniforme} />
          </Linha>
        )}
      </dl>
    </article>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid items-baseline gap-x-2 min-[421px]:grid-cols-[112px_1fr]">
      <dt className="text-sm font-semibold text-sobre-marca">{rotulo}</dt>
      <dd className="m-0 min-w-0 text-lg font-semibold">{children}</dd>
    </div>
  )
}
