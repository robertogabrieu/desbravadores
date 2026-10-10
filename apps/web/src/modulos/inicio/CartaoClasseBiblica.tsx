import { hojeNoFuso } from '@desbravadores/shared'
import { BookOpen, ClipboardCheck } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useFila, usePacote } from '../../offline'
import type { PacoteGuardado } from '../../offline'
import { pendentesDaChamadaCB } from '../../offline/tipos/classe-biblica'
import { useSessao } from '../../sessao/useSessao'
import { estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { cn } from '../../ui/cn'
import { diaDaSemana, diaMes } from '../classe-biblica/formatos'

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
const diaDoEncontro = (data: string): string => `${diaDaSemana(data)} ${diaMes(data)}`

/**
 * Encontros do dia até 7 dias depois, cada um com os grupos ainda sem chamada registrada nem guardada na fila
 * (`naFila`, chaves `<encontroId>:<grupoId>`). O pacote já vem cortado pelo escopo: grupo que não está nele não é de quem abriu.
 */
export function chamadasPendentesCB(classeBiblica: ClasseBiblicaDoPacote, hoje: string, naFila: Set<string> = new Set()): ChamadaPendente[] {
  const registradas = new Set([
    ...classeBiblica.chamadasRegistradas.map(({ encontroId, grupoId }) => `${encontroId}:${grupoId}`),
    ...naFila,
  ])
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
          className={cn(estiloDoBotao(), 'text-center')}
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
  const { itens } = useFila()
  if (!pode('classebiblica.chamada') || !pacote?.classeBiblica) return null

  const hoje = hojeNoFuso(pacote.clube.fuso, new Date())
  // Guardada no aparelho, esperando envio ou recusada: quem a corrige é a página da fila, não uma chamada nova.
  const naFila = new Set(pendentesDaChamadaCB(itens).map(({ payload }) => `${payload.encontroId}:${payload.grupoId}`))
  return (
    <>
      {chamadasPendentesCB(pacote.classeBiblica, hoje, naFila).map((pendente) => (
        <CartaoDoEncontro key={pendente.encontro.id} {...pendente} />
      ))}
    </>
  )
}
