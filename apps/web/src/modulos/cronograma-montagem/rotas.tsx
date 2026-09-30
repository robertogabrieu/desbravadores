import type { RouteObject } from 'react-router-dom'
import { PaginaEmBreve } from './PaginaEmBreve'

export const rotasCronogramaMontagem: RouteObject[] = [{ path: '/cronograma/montar', element: <PaginaEmBreve /> }]

/** A7 pelo menu do Adm; fica sob a guarda só-ADM. */
export const rotasAdmCronogramas: RouteObject[] = [{ path: '/adm/cronogramas', element: <PaginaEmBreve /> }]
