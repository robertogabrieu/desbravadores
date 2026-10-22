import type { RouteObject } from 'react-router-dom'
import { DetalheDoLivro } from './DetalheDoLivro'
import { TelaBiblioteca } from './TelaBiblioteca'

export const rotasAdmBiblioteca: RouteObject[] = [
  { path: '/adm/biblioteca', element: <TelaBiblioteca /> },
  { path: '/adm/biblioteca/livros/:id', element: <DetalheDoLivro /> },
]
export const rotasBiblioteca: RouteObject[] = [
  { path: '/biblioteca', element: <TelaBiblioteca /> },
  { path: '/biblioteca/livros/:id', element: <DetalheDoLivro /> },
]
