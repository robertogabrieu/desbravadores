import type { Papel } from '@desbravadores/shared'
import { Flag, GraduationCap, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../../ui/cn'
import { Selo } from '../../../ui/Selo'

const PAPEIS: Array<{ papel: Papel; nome: string; descricao: string; Icone: LucideIcon }> = [
  { papel: 'ADM', nome: 'Adm', descricao: 'Cuida do clube inteiro: usuários, unidades, classes, calendário e ranking.', Icone: Shield },
  { papel: 'CONSELHEIRO', nome: 'Conselheiro', descricao: 'Acompanha uma ou mais unidades: reuniões, chamada e fotos.', Icone: Flag },
  { papel: 'INSTRUTOR', nome: 'Instrutor', descricao: 'Dá uma ou mais classes: registra a classe, marca requisitos e envia materiais.', Icone: GraduationCap },
]

interface Propriedades {
  escolhido: Papel | null
  aoEscolher: (papel: Papel) => void
  /** Papéis que a pessoa já tem: ficam desabilitados com "já tem". */
  jaTem?: Papel[]
}

/** Cartões de escolha única: um papel por vez. */
export function EscolhaDoPapel({ escolhido, aoEscolher, jaTem = [] }: Propriedades) {
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-3 p-0 text-sm font-bold text-texto">Escolha um papel</legend>
      {PAPEIS.map(({ papel, nome, descricao, Icone }) => {
        const desabilitado = jaTem.includes(papel)
        const marcado = escolhido === papel && !desabilitado
        const idJaTem = `ja-tem-${papel}`
        return (
          <label
            key={papel}
            className={cn(
              'flex items-start gap-3.5 rounded-cartao border bg-superficie p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca',
              marcado ? 'border-2 border-marca p-[15px]' : 'border-borda-controle',
              desabilitado ? 'cursor-not-allowed bg-superficie-suave' : 'cursor-pointer',
            )}
          >
            <input
              type="radio"
              name="papel"
              value={papel}
              checked={marcado}
              disabled={desabilitado}
              aria-describedby={desabilitado ? idJaTem : undefined}
              onChange={() => aoEscolher(papel)}
              className="mt-0.5 size-[22px] shrink-0 accent-marca"
            />
            <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-controle', desabilitado ? 'bg-superficie text-texto-2' : 'bg-marca-suave text-marca')}>
              <Icone className="size-[22px]" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn('font-titulo text-lg font-bold', desabilitado ? 'text-texto-2' : 'text-texto')}>{nome}</span>
                {desabilitado && <Selo id={idJaTem}>já tem</Selo>}
              </span>
              <span className="text-base text-texto-2">{descricao}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
