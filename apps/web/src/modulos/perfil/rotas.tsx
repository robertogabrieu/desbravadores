import { Navigate, useParams } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { useSessao } from '../../sessao/useSessao'
import { PerfilDbv } from './PerfilDbv'

/** Conselheiro e instrutor veem o perfil; o Adm tem a ficha no painel (o Voltar dela leva à lista). */
function PerfilOuFichaDoAdm() {
  const { papel } = useSessao()
  const { id = '' } = useParams()
  return papel === 'ADM' ? <Navigate to={`/adm/desbravadores/${id}`} replace /> : <PerfilDbv />
}

export const rotasPerfil: RouteObject[] = [{ path: '/dbv/:id', element: <PerfilOuFichaDoAdm /> }]
