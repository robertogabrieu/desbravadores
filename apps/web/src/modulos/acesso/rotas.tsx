import type { RouteObject } from 'react-router-dom'
import { EmConstrucao } from '../comum/EmConstrucao'

export const rotasAcesso: RouteObject[] = [
  { path: '/login', element: <EmConstrucao titulo="Entrar" /> },
  { path: '/convite/:token', element: <EmConstrucao titulo="Definir senha" /> },
  { path: '/senha/esqueci', element: <EmConstrucao titulo="Esqueci minha senha" /> },
  { path: '/senha/redefinir/:token', element: <EmConstrucao titulo="Redefinir senha" /> },
  { path: '/papel', element: <EmConstrucao titulo="Escolher papel" /> },
]
