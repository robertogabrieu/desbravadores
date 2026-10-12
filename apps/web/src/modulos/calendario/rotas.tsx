import type { RouteObject } from 'react-router-dom'
import { CalendarioDeLeitura } from './CalendarioDeLeitura'

/** Conselheiro e Instrutor leem o calendário do clube pelo pacote guardado; o Adm tem o dele, em /adm/calendario. */
export const rotasCalendario: RouteObject[] = [{ path: '/calendario', element: <CalendarioDeLeitura /> }]
