import type { RouteObject } from 'react-router-dom'
import { MontagemAdm } from './MontagemAdm'
import { PaginaMontar } from './PaginaMontar'

export const rotasCronogramaMontagem: RouteObject[] = [{ path: '/cronograma/montar', element: <PaginaMontar /> }]

/** A7 pelo menu do Adm; fica sob a guarda só-ADM. */
export const rotasAdmCronogramas: RouteObject[] = [{ path: '/adm/cronogramas', element: <MontagemAdm /> }]
