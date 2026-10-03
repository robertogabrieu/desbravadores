import { Navigate } from 'react-router-dom'
import { inicioDoPapel } from '../modulos/acesso/papeis'
import { TelaCarregando } from './TelaCarregando'
import { useSessao } from './useSessao'
import { IrAoLogin } from './IrAoLogin'

/** Elemento da rota "/": manda cada um para a sua tela inicial. */
export function RedirecionamentoRaiz() {
  const { situacao, papel } = useSessao()

  if (situacao === 'carregando') return <TelaCarregando />
  if (situacao === 'anonima') return <IrAoLogin />
  if (situacao === 'sem-conexao') return <Navigate to="/conectar" replace />
  if (papel === null) return <Navigate to="/papel" replace />
  return <Navigate to={inicioDoPapel(papel)} replace />
}
