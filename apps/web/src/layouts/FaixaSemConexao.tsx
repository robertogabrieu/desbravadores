import { WifiOff } from 'lucide-react'
import { useConexao, useModoSessao } from '../offline'

/** Faixa no topo dos layouts enquanto não há conexão; o app continua usável. */
export function FaixaSemConexao() {
  const { modo } = useConexao()
  const expirada = useModoSessao() === 'EXPIRADA'
  if (modo !== 'SEM_CONEXAO' || expirada) return null

  return (
    <div role="status" className="flex items-center gap-3 bg-sem-conexao px-4 py-2 text-sm font-semibold text-sobre-sem-conexao">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span>Sem conexão. Mostrando o que está guardado no aparelho.</span>
    </div>
  )
}
