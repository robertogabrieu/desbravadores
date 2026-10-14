import type { RouteObject } from 'react-router-dom'
import { PaginaAgendaPublica } from './PaginaAgendaPublica'

/** Sem sessão: a agenda que a diretoria repassa aos pais, no endereço /agenda/{slug-do-clube}. */
export const rotaDaAgendaPublica: RouteObject = { path: '/agenda/:slug', element: <PaginaAgendaPublica /> }
