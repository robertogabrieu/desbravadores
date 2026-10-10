import { useParams } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { PaginaNaoEncontrada } from '../../erro/PaginaNaoEncontrada'
import { TelaChamadaCB } from '../../classe-biblica/chamada/TelaChamadaCB'
import { EdicaoPronta } from './EdicaoPronta'
import { EtapaDados } from './EtapaDados'
import { EtapaDatas } from './EtapaDatas'
import { EtapaGrupos } from './EtapaGrupos'
import { ListaEdicoes } from './ListaEdicoes'
import { PainelEdicao } from './PainelEdicao'
import { RemarcarEncontro } from './RemarcarEncontro'

/** Uma rota para as três etapas: o número no caminho escolhe a tela. */
function EtapaDaEdicao() {
  const { n } = useParams()
  if (n === '1') return <EtapaDados />
  if (n === '2') return <EtapaGrupos />
  if (n === '3') return <EtapaDatas />
  return <PaginaNaoEncontrada />
}

export const rotasAdmClasseBiblica: RouteObject[] = [
  { path: '/adm/classe-biblica', element: <ListaEdicoes /> },
  { path: '/adm/classe-biblica/nova', element: <EtapaDados /> },
  { path: '/adm/classe-biblica/:id/etapa/:n', element: <EtapaDaEdicao /> },
  { path: '/adm/classe-biblica/:id/pronta', element: <EdicaoPronta /> },
  { path: '/adm/classe-biblica/:id', element: <PainelEdicao /> },
  { path: '/adm/classe-biblica/encontros/:id/remarcar', element: <RemarcarEncontro /> },
  { path: '/adm/classe-biblica/encontros/:id/grupos/:grupoId/chamada', element: <TelaChamadaCB /> },
]
