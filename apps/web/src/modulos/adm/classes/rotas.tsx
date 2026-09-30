import type { RouteObject } from 'react-router-dom'
import { EstadoVazio } from '../../../ui/EstadoVazio'

// Provisório da onda 0: o pacote da tela troca pelo componente real.
export const rotasAdmClasses: RouteObject[] = [
  { path: '/adm/classes', element: <EstadoVazio titulo="Em breve" descricao="Esta tela ainda está sendo preparada." /> },
]
