import { cn } from '../../ui/cn'
import { MESES, MESES_CURTOS, DIAS_DA_SEMANA } from '../adm/calendario/datas'
import { UniformeDoEvento } from '../adm/calendario/UniformeDoEvento'
import { horaCurta } from '../adm/formatos'
import { ehAviso, rotuloDoCompromisso } from './compromissos'
import type { Compromisso } from './compromissos'

const diaDaSemana = (data: string): string => {
  const [ano, mes, dia] = data.split('-').map(Number)
  return DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()].toLowerCase()
}

const mesDe = (data: string): number => Number(data.slice(5, 7)) - 1

/** Os compromissos na ordem recebida, quebrados em um bloco por mês; o que já começou fica no mês de hoje. */
function agruparPorMes(compromissos: Compromisso[], hoje: string): { chave: string; titulo: string; itens: Compromisso[] }[] {
  const grupos: { chave: string; titulo: string; itens: Compromisso[] }[] = []
  for (const c of compromissos) {
    const inicioNaLista = c.data > hoje ? c.data : hoje
    const chave = inicioNaLista.slice(0, 7)
    const grupo = grupos.find((g) => g.chave === chave)
    if (grupo) grupo.itens.push(c)
    else grupos.push({ chave, titulo: `${MESES[mesDe(inicioNaLista)]} de ${inicioNaLista.slice(0, 4)}`, itens: [c] })
  }
  return grupos
}

/** Lista agrupada por mês; cada item diz o dia, o nome, "horário · local" e o uniforme quando há. */
export function ListaPorMes({ compromissos, hoje }: { compromissos: Compromisso[]; hoje: string }) {
  return (
    <div>
      {agruparPorMes(compromissos, hoje).map((grupo) => (
        <div key={grupo.chave} className="mt-6 first:mt-0">
          <h3 className="mb-2 text-base font-bold text-texto-2">{grupo.titulo}</h3>
          <ul className="m-0 grid list-none gap-1 p-0">
            {grupo.itens.map((c, indice) => (
              <Item key={`${c.data}-${c.tipo}-${c.nome}-${indice}`} compromisso={c} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Dia({ compromisso: c }: { compromisso: Compromisso }) {
  const diaDe = (data: string): number => Number(data.slice(8, 10))
  const mesesDoPeriodo = c.fim && mesDe(c.fim) !== mesDe(c.data) ? `${MESES_CURTOS[mesDe(c.data)]}–${MESES_CURTOS[mesDe(c.fim)]}` : null
  return (
    <div className="text-center leading-tight">
      <b className="block font-titulo text-2xl">{c.fim ? `${diaDe(c.data)}–${diaDe(c.fim)}` : diaDe(c.data)}</b>
      <span className="text-sm font-semibold tracking-wide text-texto-2 uppercase">
        {mesesDoPeriodo ? mesesDoPeriodo.toLowerCase() : c.fim ? MESES_CURTOS[mesDe(c.data)].toLowerCase() : diaDaSemana(c.data)}
      </span>
    </div>
  )
}

function Item({ compromisso: c }: { compromisso: Compromisso }) {
  const aviso = ehAviso(c)
  // O aviso diz o motivo (Natal, Fim de semana prolongado); os demais, onde e quando.
  const rotulo = rotuloDoCompromisso(c)
  const detalhe = aviso
    ? c.nome === rotulo
      ? null
      : c.nome
    : [c.horario ? horaCurta(c.horario) : null, c.local].filter(Boolean).join(' · ')

  return (
    <li
      className={cn(
        'grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 rounded-botao border border-borda-controle px-4 py-2',
        aviso ? 'bg-superficie-suave' : 'bg-superficie',
      )}
    >
      <Dia compromisso={c} />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className={cn('text-base font-bold', aviso && 'text-texto-2')}>{aviso ? rotulo : c.nome}</h3>
          {!aviso && c.uniforme && <UniformeDoEvento uniforme={c.uniforme} />}
        </div>
        {detalhe && <p className="m-0 text-base text-texto-2">{detalhe}</p>}
      </div>
    </li>
  )
}
