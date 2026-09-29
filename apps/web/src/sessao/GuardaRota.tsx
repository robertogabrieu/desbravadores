import type { Papel } from '@desbravadores/shared'
import { Navigate, Outlet } from 'react-router-dom'
import { TelaCarregando } from './TelaCarregando'
import { useSessao } from './useSessao'

interface Propriedades {
  /** Deixa passar quem está autenticado mas ainda não escolheu papel (a própria rota /papel). */
  semVinculo?: boolean
  /** Restringe a estes papéis; os outros voltam para "/", que os leva à tela do papel deles. */
  papeis?: readonly Papel[]
}

/** Rota-layout: só renderiza os filhos para quem tem sessão (e, por padrão, papel ativo). */
export function GuardaRota({ semVinculo = false, papeis }: Propriedades) {
  const { situacao, papel } = useSessao()

  if (situacao === 'carregando') return <TelaCarregando />
  if (situacao === 'anonima') return <Navigate to="/login" replace />
  if (situacao === 'sem-conexao') return <Navigate to="/conectar" replace />
  if (!semVinculo && papel === null) return <Navigate to="/papel" replace />
  if (papeis && papel !== null && !papeis.includes(papel)) return <Navigate to="/" replace />
  return <Outlet />
}
