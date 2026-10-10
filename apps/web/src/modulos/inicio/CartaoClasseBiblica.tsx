import { hojeNoFuso } from '@desbravadores/shared'
import { BookOpen, ClipboardCheck } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import { usePacote } from '../../offline'
import type { PacoteGuardado } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Cartao } from '../../ui/Cartao'

type ClasseBiblicaDoPacote = NonNullable<NonNullable<PacoteGuardado['pacote']>['classeBiblica']>
type Encontro = ClasseBiblicaDoPacote['encontros'][number]

export interface ChamadaPendente {
  encontro: Encontro
  grupos: Array<{ id: string; nome: string }>
}

/** Até quantos dias depois do encontro a chamada ainda aparece no início (D9). */
const DIAS_PARA_FAZER = 7

const somarDias = (data: string, dias: number): string => {
  const instante = new Date(`${data}T00:00:00Z`)
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}

/** "2026-10-11" vira "domingo 11/10". */
function diaDoEncontro(data: string): string {
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${data}T00:00:00Z`))
  return `${semana.replace('-feira', '')} ${data.slice(8, 10)}/${data.slice(5, 7)}`
}

/**
 * Encontros do dia até 7 dias depois, cada um com os grupos ainda sem chamada registrada.
 * O pacote já vem cortado pelo escopo: grupo que não está nele não é de quem abriu.
 */
export function chamadasPendentesCB(classeBiblica: ClasseBiblicaDoPacote, hoje: string): ChamadaPendente[] {
  const registradas = new Set(classeBiblica.chamadasRegistradas.map(({ encontroId, grupoId }) => `${encontroId}:${grupoId}`))
  return classeBiblica.encontros
    .filter((encontro) => encontro.data <= hoje && hoje <= somarDias(encontro.data, DIAS_PARA_FAZER))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((encontro) => ({
      encontro,
      grupos: classeBiblica.grupos
        .filter((grupo) => grupo.encontroIds.includes(encontro.id) && !registradas.has(`${encontro.id}:${grupo.id}`))
        .map(({ id, nome }) => ({ id, nome })),
    }))
    .filter(({ grupos }) => grupos.length > 0)
}

function CartaoDoEncontro({ encontro, grupos }: ChamadaPendente) {
  const idTitulo = useId()
  return (
    <Cartao role="region" aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h2 id={idTitulo} className="flex items-center gap-2 text-sm font-semibold text-texto-2">
        <BookOpen aria-hidden className="size-4" />
        Classe Bíblica · {diaDoEncontro(encontro.data)}
      </h2>
      {grupos.map((grupo) => (
        <Link
          key={grupo.id}
          to={`/classe-biblica/encontros/${encontro.id}/grupos/${grupo.id}/chamada`}
          className="flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-center text-base font-semibold text-white hover:bg-marca-escura focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        >
          <ClipboardCheck aria-hidden className="size-5 shrink-0" />
          Fazer a chamada do {grupo.nome}
        </Link>
      ))}
    </Cartao>
  )
}

/** Chamadas da Classe Bíblica por fazer (D9), lidas do pacote guardado: aparecem também sem conexão. */
export function CartaoClasseBiblica() {
  const { pode } = useSessao()
  const { pacote } = usePacote()
  if (!pode('classebiblica.chamada') || !pacote?.classeBiblica) return null

  const hoje = hojeNoFuso(pacote.clube.fuso, new Date())
  return (
    <>
      {chamadasPendentesCB(pacote.classeBiblica, hoje).map((pendente) => (
        <CartaoDoEncontro key={pendente.encontro.id} {...pendente} />
      ))}
    </>
  )
}
