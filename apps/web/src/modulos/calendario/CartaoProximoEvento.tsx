import { hojeNoFuso } from '@desbravadores/shared'
import { CalendarRange, Clock } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import { usePacote } from '../../offline'
import { estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { diaDaSemanaEDoMes } from '../adm/calendario/datas'
import { eventosAVir, frasePontos, horarioELocal, UniformeDoEvento } from './eventoDoPacote'
import type { EventoDoPacote } from './eventoDoPacote'

const TIPOS_DO_CARTAO: ReadonlySet<EventoDoPacote['tipo']> = new Set(['EVENTO_ESPECIAL', 'ACAMPAMENTO', 'EVENTO'])

const primeiraMinuscula = (texto: string): string => texto.charAt(0).toLowerCase() + texto.slice(1)

/** "Sábado, 31 de outubro"; no dia, "Hoje, sábado, 17 de outubro"; já em andamento por vários dias, "Até domingo, 15 de novembro". */
function dataDoCartao(evento: EventoDoPacote, hoje: string): string {
  if (evento.inicio > hoje) return diaDaSemanaEDoMes(evento.inicio)
  if (evento.fim > evento.inicio) return `Até ${primeiraMinuscula(diaDaSemanaEDoMes(evento.fim))}`
  return `Hoje, ${primeiraMinuscula(diaDaSemanaEDoMes(evento.inicio))}`
}

/** O próximo evento especial, acampamento ou evento do clube, lido do pacote guardado; sem evento à vista, não aparece. */
export function CartaoProximoEvento() {
  const idTitulo = useId()
  const { pacote, carregando } = usePacote()
  if (carregando || !pacote) return null

  const hoje = hojeNoFuso(pacote.clube.fuso, new Date())
  // Pacote guardado antes do calendário não traz o campo.
  const evento = eventosAVir(pacote.calendario ?? [], hoje).find(({ tipo }) => TIPOS_DO_CARTAO.has(tipo))
  if (!evento) return null

  const detalhe = horarioELocal(evento)
  const pontos = frasePontos(evento)
  return (
    <Cartao role="region" aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h2 id={idTitulo} className="flex items-center gap-2 text-sm font-semibold text-texto-2">
        <CalendarRange aria-hidden className="size-4" />
        Próximo evento
      </h2>
      <div className="flex flex-col">
        <span className="font-titulo text-lg font-bold text-texto">{dataDoCartao(evento, hoje)}</span>
        <span className="text-base font-semibold text-texto">{evento.nome}</span>
      </div>
      {evento.tipo === 'EVENTO_ESPECIAL' && evento.uniforme && <UniformeDoEvento uniforme={evento.uniforme} />}
      {detalhe && (
        <span className="flex items-center gap-2 text-base text-texto-2">
          <Clock aria-hidden className="size-[18px] shrink-0" />
          {detalhe}
        </span>
      )}
      {pontos && <p className="text-base text-texto">{pontos}</p>}
      <Link to="/calendario" className={estiloDoBotao({ variante: 'secundario', largura: 'total' })}>
        Ver o calendário
      </Link>
    </Cartao>
  )
}
