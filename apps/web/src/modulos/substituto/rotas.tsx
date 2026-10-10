import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { useSubstituicao } from '../../sessao/ProvedorSessaoSubstituto'
import { TelaRegistroAula } from '../aulas/TelaRegistroAula'
import { TelaChamada } from '../reunioes/chamada/TelaChamada'
import { DepoisDeSalvar } from './DepoisDeSalvar'
import { TelaDoLink } from './TelaDoLink'

/** Abrir o link pelo endereço da mensagem leva à tela do tipo dele. */
function IrParaATela() {
  const substituicao = useSubstituicao()
  if (!substituicao) return null
  return <Navigate to={substituicao.identidade.tipo === 'CHAMADA' ? 'chamada' : 'classe'} replace />
}

/** Rota pública do link de substituição, sobre as mesmas telas de chamada e de registro da classe do titular. */
export const rotaDoSubstituto: RouteObject = {
  path: '/substituto/:token',
  element: <TelaDoLink />,
  children: [
    { index: true, element: <IrParaATela /> },
    { path: 'chamada', element: <TelaChamada /> },
    { path: 'chamada/:id', element: <TelaChamada /> },
    { path: 'classe', element: <TelaRegistroAula /> },
    { path: 'salvo', element: <DepoisDeSalvar /> },
  ],
}
