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

/** As três etapas e a criação: o número no caminho escolhe a tela; sem número é a edição nova. */
function EtapaDaEdicao() {
  const { n } = useParams()
  if (n === undefined || n === '1') return <EtapaDados />
  if (n === '2') return <EtapaGrupos />
  if (n === '3') return <EtapaDatas />
  return <PaginaNaoEncontrada />
}

/**
 * `/nova` e `/:id/etapa/:n` são filhas de um mesmo elemento, que fica montado quando o rascunho
 * novo troca o endereço de um para o outro: a etapa 1 não remonta (ver `EtapaDados`).
 */
export const rotaDasEtapas: RouteObject = {
  element: <EtapaDaEdicao />,
  children: [{ path: '/adm/classe-biblica/nova' }, { path: '/adm/classe-biblica/:id/etapa/:n' }],
}

export const rotasAdmClasseBiblica: RouteObject[] = [
  { path: '/adm/classe-biblica', element: <ListaEdicoes /> },
  rotaDasEtapas,
  { path: '/adm/classe-biblica/:id/pronta', element: <EdicaoPronta /> },
  { path: '/adm/classe-biblica/:id', element: <PainelEdicao /> },
  { path: '/adm/classe-biblica/encontros/:id/remarcar', element: <RemarcarEncontro /> },
  { path: '/adm/classe-biblica/encontros/:id/grupos/:grupoId/chamada', element: <TelaChamadaCB /> },
]
