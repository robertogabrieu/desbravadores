import type { RouteObject } from 'react-router-dom'
import { TelaBiblioteca } from './TelaBiblioteca'

export const rotasAdmBiblioteca: RouteObject[] = [{ path: '/adm/biblioteca', element: <TelaBiblioteca /> }]
export const rotasBiblioteca: RouteObject[] = [{ path: '/biblioteca', element: <TelaBiblioteca /> }]
