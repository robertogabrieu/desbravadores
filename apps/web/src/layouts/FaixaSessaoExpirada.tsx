import { KeyRound } from 'lucide-react'
import { useModoSessao } from '../offline'
import { useSessao } from '../sessao/useSessao'

/** Faixa no topo dos layouts quando a sessão expirou durante o uso; o que já foi salvo continua guardado. */
export function FaixaSessaoExpirada() {
  const modo = useModoSessao()
  const { sair } = useSessao()
  if (modo !== 'EXPIRADA') return null

  return (
    <div role="alert" className="flex items-center gap-3 bg-alerta-fundo px-4 py-2 text-sm font-semibold text-texto">
      <KeyRound aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">Sua sessão expirou — salve e entre de novo</span>
      <button
        type="button"
        onClick={() => void sair()}
        className="min-h-[var(--touch-min)] shrink-0 rounded-botao bg-marca px-3 text-sm font-semibold text-white"
      >
        Entrar de novo
      </button>
    </div>
  )
}
