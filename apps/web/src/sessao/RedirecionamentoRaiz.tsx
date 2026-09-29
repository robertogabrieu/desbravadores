import { Navigate } from 'react-router-dom'
import { TelaCarregando } from './TelaCarregando'
import { useSessao } from './useSessao'

/** Elemento da rota "/": manda cada um para a sua tela inicial. */
export function RedirecionamentoRaiz() {
  const { situacao, papel } = useSessao()

  if (situacao === 'carregando') return <TelaCarregando />
  if (situacao === 'anonima') return <Navigate to="/login" replace />
  if (situacao === 'sem-conexao') return <Navigate to="/conectar" replace />
  if (papel === null) return <Navigate to="/papel" replace />
  return <Navigate to={papel === 'ADM' ? '/adm/desbravadores' : '/inicio'} replace />
}
