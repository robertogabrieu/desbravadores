import { Navigate } from 'react-router-dom'
import { useSessao } from './useSessao'

/** Leva ao login quem está sem sessão, com o motivo quando a sessão terminou sem a pessoa pedir. */
export function IrAoLogin() {
  const { avisoDeSaida } = useSessao()
  return <Navigate to="/login" replace state={avisoDeSaida ? { aviso: avisoDeSaida } : undefined} />
}
