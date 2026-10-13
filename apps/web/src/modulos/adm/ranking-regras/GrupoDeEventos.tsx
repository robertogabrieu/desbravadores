import { ExternalLink, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EventoDaTela } from '../../../api/ranking-regras'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { cn } from '../../../ui/cn'
import { ESTILO_DA_LINHA, SeloDaLinha } from './LinhaDeRegra'
import { periodoDoEvento } from './periodo'

/** Mesmos nomes do formulário do calendário. */
const NOME_CURTO_DO_UNIFORME = { GALA: 'gala', CAMPO: 'campo' } as const

interface PropriedadesDoGrupo {
  eventos: EventoDaTela[]
  /** `calendario.gerenciar`: sem ela os links do calendário não aparecem. */
  podeAbrirCalendario: boolean
  semConexao: boolean
}

function descricaoDoEvento(evento: EventoDaTela): string {
  const partes = [periodoDoEvento(evento.inicio, evento.fim)]
  if (evento.uniforme && evento.pontosUniforme !== null) {
    partes.push(`mais ${evento.pontosUniforme} pontos com o uniforme de ${NOME_CURTO_DO_UNIFORME[evento.uniforme]}`)
  }
  if (evento.listaConcluida && evento.foram !== null) partes.push(`${evento.foram} foram`)
  return partes.join(' · ')
}

function AcaoDoEvento({ evento, podeAbrirCalendario, semConexao }: { evento: EventoDaTela } & Omit<PropriedadesDoGrupo, 'eventos'>) {
  if (!podeAbrirCalendario) return <p className="text-base text-texto-2">Só quem edita o calendário pode mudar.</p>
  if (semConexao) {
    return (
      <Botao variante="secundario" disabled aria-label={`Editar ${evento.nome} no calendário (indisponível sem conexão)`}>
        <Pencil aria-hidden className="size-[18px]" />
        Editar
      </Botao>
    )
  }
  return (
    <Link to={`/adm/calendario/eventos/${evento.id}/editar`} aria-label={`Editar ${evento.nome} no calendário`} className={cn(estiloDoBotao({ variante: 'texto' }), 'justify-start px-2 text-left leading-tight')}>
      Editar no calendário
      <ExternalLink aria-hidden className="size-[18px] shrink-0" />
    </Link>
  )
}

/** Eventos especiais do ano: os pontos de cada um vivem no calendário, aqui só se lê e se vai até lá. */
export function GrupoDeEventos({ eventos, podeAbrirCalendario, semConexao }: PropriedadesDoGrupo) {
  if (eventos.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum evento especial neste ano"
        descricao="Os pontos de um evento especial são definidos ao criá-lo no calendário."
        acao={
          podeAbrirCalendario && (
            <Link to="/adm/calendario/eventos/novo" className={estiloDoBotao()}>
              Criar evento no calendário
            </Link>
          )
        }
      />
    )
  }
  return (
    <ul>
      {eventos.map((evento) => (
        <li key={evento.id} className={ESTILO_DA_LINHA}>
          <div className="md:col-start-1 md:row-start-1">
            <SeloDaLinha ligado={evento.listaConcluida} ligada="Pontos lançados" desligada="Ainda vai ser" />
          </div>
          <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
            <p className="text-base font-bold text-texto">{evento.nome}</p>
            <p className="text-base text-texto-2">{descricaoDoEvento(evento)}</p>
          </div>
          <p className="justify-self-end font-titulo text-[22px] font-bold tabular-nums md:col-start-3 md:row-start-1">
            {evento.pontosParticipacao === null ? (
              <small className="font-body text-base font-semibold text-texto-2">Sem pontos</small>
            ) : (
              <>
                <span>+{evento.pontosParticipacao}</span> <small className="font-body text-base font-semibold text-texto-2">por ir</small>
              </>
            )}
          </p>
          <div className="col-span-2 row-start-3 md:col-span-1 md:col-start-4 md:row-start-1">
            <AcaoDoEvento evento={evento} podeAbrirCalendario={podeAbrirCalendario} semConexao={semConexao} />
          </div>
        </li>
      ))}
    </ul>
  )
}
