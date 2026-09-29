import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../comum/EmConstrucao'

/** Sem sessão: entrar, aceitar convite, recuperar senha. */
export const rotasAcessoPublicas: RouteObject[] = [
  { path: '/login', element: <EmConstrucao titulo="Entrar" /> },
  { path: '/convite/:token', element: <EmConstrucao titulo="Definir senha" /> },
  { path: '/senha/esqueci', element: <EmConstrucao titulo="Esqueci minha senha" /> },
  { path: '/senha/redefinir/:token', element: <EmConstrucao titulo="Redefinir senha" /> },
]

/** Com sessão, mesmo sem vínculo ativo. */
export const rotasAcessoPapel: RouteObject[] = [{ path: '/papel', element: <EmConstrucao titulo="Escolher papel" /> }]
